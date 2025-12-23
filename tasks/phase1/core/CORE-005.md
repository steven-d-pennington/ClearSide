# CORE-005: Implement Transcript Recorder

**Priority:** P0
**Estimate:** M
**Labels:** `core`, `backend`
**Status:** 🟢 TO DO

---

## Context

The Transcript Recorder captures every debate utterance with precise timestamps, builds the structured JSON transcript conforming to schema v2.0.0, and compiles the final analysis from all utterances. This component is critical for replay functionality and media exports.

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Section "Database Schema"
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-350 series (Transcript & Replay)
- [JSON Schema](../../../docs/04_json-schema.md) - v2.0.0 specification

---

## Requirements

### Acceptance Criteria

- [ ] Record utterances to database with timestamps
- [ ] Record user interventions with timestamps
- [ ] Track phase transitions
- [ ] On debate completion, compile full transcript JSON
- [ ] Generate structured_analysis from utterances
- [ ] Validate transcript against schema v2.0.0
- [ ] Store transcript in debates.transcript_json field
- [ ] Support transcript retrieval for replay
- [ ] Handle missing or malformed data gracefully

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-207**: Record all utterances with precise timestamps
- **FR-307**: All interventions SHALL be recorded with timestamps
- **FR-351**: Generate structured JSON transcript (schema v2.0.0)
- **FR-352**: Transcript SHALL include all utterances, phases, and interventions
- **FR-353**: Completed debates SHALL load instantly without regeneration

---

## Implementation Guide

```typescript
// src/services/transcript/transcript-recorder.ts
import { UtteranceRepository, InterventionRepository, DebateRepository } from '../../db/repositories';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';

export interface DebateTranscript {
  meta: TranscriptMeta;
  proposition: Proposition;
  transcript: Utterance[];
  structured_analysis: StructuredAnalysis;
  user_interventions: UserIntervention[];
}

export class TranscriptRecorder {
  constructor(
    private utteranceRepo: UtteranceRepository,
    private interventionRepo: InterventionRepository,
    private debateRepo: DebateRepository
  ) {}

  async recordUtterance(utterance: {
    debateId: string;
    timestamp: number;
    phase: string;
    speaker: string;
    content: string;
    metadata?: any;
  }): Promise<void> {
    // Validate
    const validation = schemaValidator.validateUtterance(utterance);
    if (!validation.valid) {
      throw new Error(`Invalid utterance: ${validation.errors.join(', ')}`);
    }

    // Persist
    await this.utteranceRepo.create(
      utterance.debateId,
      utterance.timestamp,
      utterance.phase,
      utterance.speaker,
      utterance.content,
      utterance.metadata
    );

    loggers.info('Utterance recorded', {
      debateId: utterance.debateId,
      phase: utterance.phase,
      speaker: utterance.speaker
    });
  }

  async compileTranscript(debateId: string): Promise<DebateTranscript> {
    loggers.info('Compiling transcript', { debateId });

    // Fetch all data
    const debate = await this.debateRepo.findById(debateId);
    const utterances = await this.utteranceRepo.findByDebateId(debateId);
    const interventions = await this.interventionRepo.findByDebateId(debateId);

    if (!debate) {
      throw new Error(`Debate not found: ${debateId}`);
    }

    // Build transcript
    const transcript: DebateTranscript = {
      meta: {
        schema_version: '2.0.0',
        debate_id: debateId,
        generated_at: new Date().toISOString(),
        debate_format: 'live_theater',
        total_duration_seconds: Math.floor((debate.totalDurationMs || 0) / 1000),
        status: debate.status
      },
      proposition: {
        raw_input: debate.propositionText,
        normalized_question: debate.propositionNormalized || debate.propositionText,
        context: debate.propositionContext
      },
      transcript: utterances.map(u => ({
        id: u.id,
        timestamp_ms: u.timestampMs,
        phase: u.phase,
        speaker: u.speaker,
        content: u.content,
        metadata: u.metadata
      })),
      structured_analysis: this.buildStructuredAnalysis(utterances),
      user_interventions: interventions.map(i => ({
        id: i.id,
        timestamp_ms: i.timestampMs,
        type: i.interventionType,
        content: i.content,
        directed_to: i.directedTo,
        response: i.response,
        response_timestamp_ms: i.responseTimestampMs
      }))
    };

    // Validate
    const validation = schemaValidator.validateTranscript(transcript);
    if (!validation.valid) {
      loggers.schemaValidation(debateId, 'transcript', false, validation.errors);
      throw new Error(`Invalid transcript: ${validation.errors.join(', ')}`);
    }

    return transcript;
  }

  async saveTranscript(debateId: string, transcript: DebateTranscript): Promise<void> {
    await this.debateRepo.saveTranscript(debateId, transcript);
    loggers.info('Transcript saved', { debateId });
  }

  async loadTranscript(debateId: string): Promise<DebateTranscript | null> {
    const debate = await this.debateRepo.findById(debateId);

    if (!debate || !debate.transcriptJson) {
      return null;
    }

    return debate.transcriptJson as DebateTranscript;
  }

  private buildStructuredAnalysis(utterances: any[]): StructuredAnalysis {
    const proUtterances = utterances.filter(u => u.speaker === 'pro');
    const conUtterances = utterances.filter(u => u.speaker === 'con');
    const modUtterances = utterances.filter(u => u.speaker === 'moderator');

    return {
      pro: {
        executive_summary: this.extractExecutiveSummary(proUtterances),
        arguments: this.extractArguments(proUtterances),
        assumptions: this.extractAssumptions(proUtterances),
        uncertainties: this.extractUncertainties(proUtterances)
      },
      con: {
        executive_summary: this.extractExecutiveSummary(conUtterances),
        arguments: this.extractArguments(conUtterances),
        assumptions: this.extractAssumptions(conUtterances),
        uncertainties: this.extractUncertainties(conUtterances)
      },
      moderator: modUtterances.length > 0 ? this.parseModeratorSynthesis(modUtterances[0].content) : {
        areas_of_agreement: [],
        core_disagreements: [],
        assumption_conflicts: [],
        evidence_gaps: [],
        decision_hinges: []
      }
    };
  }

  private extractExecutiveSummary(utterances: any[]): string {
    // Get opening statement
    const opening = utterances.find(u => u.phase === 'phase_1_opening');
    return opening?.content.substring(0, 500) || 'No summary available';
  }

  private extractArguments(utterances: any[]): any[] {
    return utterances
      .filter(u => u.phase === 'phase_2_constructive')
      .map(u => ({
        content: u.content,
        category: u.metadata?.argument_category || 'general',
        evidence_type: u.metadata?.evidence_type || 'unknown',
        confidence_level: u.metadata?.confidence_level || 'medium'
      }));
  }

  private extractAssumptions(utterances: any[]): string[] {
    // Simple extraction - look for "assuming", "if we assume", etc.
    const assumptions: string[] = [];
    const regex = /(assuming|if we assume|given that|based on the assumption)/gi;

    for (const utterance of utterances) {
      const matches = utterance.content.match(regex);
      if (matches) {
        // Extract sentence containing assumption
        const sentences = utterance.content.split(/[.!?]/);
        for (const sentence of sentences) {
          if (regex.test(sentence)) {
            assumptions.push(sentence.trim());
          }
        }
      }
    }

    return assumptions;
  }

  private extractUncertainties(utterances: any[]): string[] {
    // Look for uncertainty markers
    const uncertainties: string[] = [];
    const regex = /(uncertain|unclear|unknown|may|might|could|possibly|perhaps)/gi;

    for (const utterance of utterances) {
      if (utterance.metadata?.confidence_level === 'low') {
        uncertainties.push(utterance.content.substring(0, 200));
      }
    }

    return uncertainties;
  }

  private parseModeratorSynthesis(content: string): any {
    // Moderator output should be structured JSON
    try {
      return JSON.parse(content);
    } catch {
      // Fallback: return empty structure
      return {
        areas_of_agreement: [],
        core_disagreements: [],
        assumption_conflicts: [],
        evidence_gaps: [],
        decision_hinges: []
      };
    }
  }
}

interface TranscriptMeta {
  schema_version: string;
  debate_id: string;
  generated_at: string;
  debate_format: string;
  total_duration_seconds: number;
  status: string;
}

interface Proposition {
  raw_input: string;
  normalized_question: string;
  context?: any;
}

interface Utterance {
  id: string;
  timestamp_ms: number;
  phase: string;
  speaker: string;
  content: string;
  metadata?: any;
}

interface UserIntervention {
  id: string;
  timestamp_ms: number;
  type: string;
  content: string;
  directed_to?: string;
  response?: string;
  response_timestamp_ms?: number;
}

interface StructuredAnalysis {
  pro: {
    executive_summary: string;
    arguments: any[];
    assumptions: string[];
    uncertainties: string[];
  };
  con: {
    executive_summary: string;
    arguments: any[];
    assumptions: string[];
    uncertainties: string[];
  };
  moderator: {
    areas_of_agreement: any[];
    core_disagreements: any[];
    assumption_conflicts: any[];
    evidence_gaps: any[];
    decision_hinges: any[];
  };
}
```

---

## Dependencies

- **INFRA-002**: Database repositories
- **INFRA-004**: Schema validation

---

## Validation

### Unit Tests

```typescript
// tests/transcript-recorder.test.ts
describe('TranscriptRecorder', () => {
  let recorder: TranscriptRecorder;
  let mockRepos: any;

  beforeEach(() => {
    mockRepos = {
      utterance: {
        create: jest.fn(),
        findByDebateId: jest.fn()
      },
      intervention: {
        findByDebateId: jest.fn()
      },
      debate: {
        findById: jest.fn(),
        saveTranscript: jest.fn()
      }
    };

    recorder = new TranscriptRecorder(
      mockRepos.utterance,
      mockRepos.intervention,
      mockRepos.debate
    );
  });

  it('should record utterance', async () => {
    await recorder.recordUtterance({
      debateId: 'test',
      timestamp: 1000,
      phase: 'phase_1_opening',
      speaker: 'pro',
      content: 'Test content'
    });

    expect(mockRepos.utterance.create).toHaveBeenCalled();
  });

  it('should compile complete transcript', async () => {
    mockRepos.debate.findById.mockResolvedValue({
      id: 'test',
      propositionText: 'Test prop',
      propositionNormalized: 'Test normalized',
      totalDurationMs: 100000,
      status: 'completed'
    });

    mockRepos.utterance.findByDebateId.mockResolvedValue([
      {
        id: 'u1',
        timestampMs: 0,
        phase: 'phase_1_opening',
        speaker: 'pro',
        content: 'Opening'
      }
    ]);

    mockRepos.intervention.findByDebateId.mockResolvedValue([]);

    const transcript = await recorder.compileTranscript('test');

    expect(transcript.meta.debate_id).toBe('test');
    expect(transcript.transcript).toHaveLength(1);
  });
});
```

### Definition of Done

- [ ] Utterances recorded with timestamps
- [ ] Interventions recorded with timestamps
- [ ] Transcript compilation works
- [ ] Structured analysis extraction works
- [ ] Schema validation passes
- [ ] Transcript saving works
- [ ] Transcript loading for replay works
- [ ] Unit tests achieve >90% coverage

---

## Notes

- Transcript is built once at completion, not regenerated
- Assumption/uncertainty extraction is heuristic-based
- Consider using NLP for better extraction
- Moderator output should be structured JSON for easy parsing
- Handle malformed moderator output gracefully
- Cache transcript in memory for frequently accessed debates

---

**Estimated Time:** 6-8 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
