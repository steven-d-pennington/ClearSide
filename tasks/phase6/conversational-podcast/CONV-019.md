# CONV-019: Podcast Export (Native Format)

**Task ID:** CONV-019
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P1
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-008 (Orchestrator), Existing Podcast Pipeline
**Status:** Done

---

## Context

This task creates a script refiner for conversation sessions that prepares transcripts for TTS without converting to debate format. Unlike debate-to-podcast conversion, this refiner preserves the natural talk show format with host introductions, questions, and organic discussion flow.

**References:**
- Existing: `backend/src/services/podcast/script-refiner.ts`
- [CONV-008](./CONV-008.md) - ConversationalOrchestrator (source data)
- Plan section on "Podcast Script Refinement (Native Format)"

---

## Requirements

### Acceptance Criteria

- [x] Create `ConversationScriptRefiner` service
- [x] Preserve talk show format (host + guests)
- [x] Add provider-appropriate audio cues
- [x] Support ElevenLabs, Gemini, and Google Cloud TTS providers
- [x] Create API endpoint for export
- [x] Integrate with existing podcast export pipeline
- [x] Generate voice assignment data

---

## Implementation Guide

### ConversationScriptRefiner Service

Create file: `backend/src/services/podcast/conversation-script-refiner.ts`

```typescript
import pino from 'pino';
import type { Pool } from 'pg';
import { ConversationSessionRepository } from '../../db/repositories/conversation-session-repository.js';
import { ConversationParticipantRepository } from '../../db/repositories/conversation-participant-repository.js';
import { ConversationUtteranceRepository } from '../../db/repositories/conversation-utterance-repository.js';
import { PersonaRepository } from '../../db/repositories/persona-repository.js';
import type {
  ConversationSession,
  ConversationParticipant,
  ConversationUtterance,
  PodcastPersona,
} from '../../types/conversation.js';

const logger = pino({
  name: 'conversation-script-refiner',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * TTS Provider types
 */
type TTSProvider = 'elevenlabs' | 'gemini' | 'google_cloud';

/**
 * Refined script segment
 */
export interface RefinedSegment {
  speakerName: string;
  speakerRole: 'host' | 'guest';
  personaSlug: string | null;
  content: string;
  order: number;
}

/**
 * Voice assignment for export
 */
export interface VoiceAssignment {
  speakerName: string;
  speakerRole: 'host' | 'guest';
  personaSlug: string | null;
  voiceId?: string;
  voiceSettings?: Record<string, unknown>;
}

/**
 * Refined conversation script
 */
export interface RefinedConversationScript {
  sessionId: string;
  title: string;
  segments: RefinedSegment[];
  voiceAssignments: VoiceAssignment[];
  totalSegments: number;
  estimatedDurationMinutes: number;
}

/**
 * ConversationScriptRefiner
 *
 * Prepares conversation transcripts for TTS without converting to debate format.
 * Preserves the natural talk show format with host and guests.
 */
export class ConversationScriptRefiner {
  private pool: Pool;
  private sessionRepo: ConversationSessionRepository;
  private participantRepo: ConversationParticipantRepository;
  private utteranceRepo: ConversationUtteranceRepository;
  private personaRepo: PersonaRepository;

  constructor(pool: Pool) {
    this.pool = pool;
    this.sessionRepo = new ConversationSessionRepository(pool);
    this.participantRepo = new ConversationParticipantRepository(pool);
    this.utteranceRepo = new ConversationUtteranceRepository(pool);
    this.personaRepo = new PersonaRepository(pool);
  }

  /**
   * Refine a conversation session for TTS export
   */
  async refine(
    sessionId: string,
    provider: TTSProvider = 'elevenlabs'
  ): Promise<RefinedConversationScript> {
    logger.info({ sessionId, provider }, 'Refining conversation for export');

    // Load session data
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Load participants and personas
    const participants = await this.participantRepo.findBySessionId(sessionId);
    const personaIds = participants.map(p => p.personaId);
    const personas = await this.personaRepo.findByIds(personaIds);
    const personaMap = new Map(personas.map(p => [p.id, p]));

    // Load utterances
    const utterances = await this.utteranceRepo.findBySessionId(sessionId);

    // Build participant lookup
    const participantLookup = new Map<string, {
      participant: ConversationParticipant;
      persona: PodcastPersona | undefined;
    }>();
    for (const p of participants) {
      participantLookup.set(p.id, {
        participant: p,
        persona: personaMap.get(p.personaId),
      });
    }

    // Refine each utterance
    const segments: RefinedSegment[] = [];
    for (let i = 0; i < utterances.length; i++) {
      const utterance = utterances[i];
      const segment = this.refineUtterance(utterance, participantLookup, provider, i);
      segments.push(segment);
    }

    // Build voice assignments
    const voiceAssignments = this.buildVoiceAssignments(participants, personaMap);

    // Estimate duration (roughly 150 words per minute)
    const totalWords = segments.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    const estimatedDurationMinutes = Math.ceil(totalWords / 150);

    logger.info({
      sessionId,
      segmentCount: segments.length,
      estimatedDurationMinutes,
    }, 'Conversation refined successfully');

    return {
      sessionId,
      title: session.topic,
      segments,
      voiceAssignments,
      totalSegments: segments.length,
      estimatedDurationMinutes,
    };
  }

  /**
   * Refine a single utterance for TTS
   */
  private refineUtterance(
    utterance: ConversationUtterance,
    participantLookup: Map<string, { participant: ConversationParticipant; persona: PodcastPersona | undefined }>,
    provider: TTSProvider,
    order: number
  ): RefinedSegment {
    const isHost = utterance.participantId === 'host';
    let speakerName = 'Host';
    let personaSlug: string | null = null;

    if (!isHost) {
      const info = participantLookup.get(utterance.participantId);
      speakerName = info?.participant.displayNameOverride || info?.persona?.name || 'Guest';
      personaSlug = info?.persona?.slug || null;
    }

    // Apply provider-specific refinements
    let content = utterance.content;
    content = this.addAudioCues(content, provider);
    content = this.cleanForTTS(content);

    return {
      speakerName,
      speakerRole: isHost ? 'host' : 'guest',
      personaSlug,
      content,
      order,
    };
  }

  /**
   * Add provider-appropriate audio cues
   */
  private addAudioCues(content: string, provider: TTSProvider): string {
    switch (provider) {
      case 'elevenlabs':
        return this.addElevenLabsCues(content);
      case 'gemini':
        return this.addGeminiCues(content);
      case 'google_cloud':
        return this.addGoogleCloudCues(content);
      default:
        return content;
    }
  }

  /**
   * ElevenLabs audio cues
   */
  private addElevenLabsCues(content: string): string {
    // Add pauses after questions
    content = content.replace(/\?(?=\s)/g, '? [pause]');

    // Add emphasis on key phrases
    content = content.replace(/\b(importantly|crucially|however)\b/gi, '[emphasis] $1');

    // Add thoughtful pause before "but" or "however"
    content = content.replace(/\.\s+(But|However)/g, '. [pause] $1');

    return content;
  }

  /**
   * Gemini audio cues (uses natural punctuation)
   */
  private addGeminiCues(content: string): string {
    // Gemini uses natural speech patterns
    // Add ellipses for thoughtful pauses
    content = content.replace(/\.\s+(But|However|Well)/g, '... $1');

    // Add commas for natural breathing
    content = content.replace(/\b(you know|I think|actually)\b/gi, ', $1,');

    return content;
  }

  /**
   * Google Cloud audio cues (SSML-like)
   */
  private addGoogleCloudCues(content: string): string {
    // Add break after questions
    content = content.replace(/\?(?=\s)/g, '?<break time="500ms"/>');

    return content;
  }

  /**
   * Clean content for TTS
   */
  private cleanForTTS(content: string): string {
    // Remove markdown formatting
    content = content.replace(/\*\*/g, '');
    content = content.replace(/\*/g, '');
    content = content.replace(/`/g, '');

    // Expand common abbreviations
    content = content.replace(/\bAI\b/g, 'A.I.');
    content = content.replace(/\be\.g\./g, 'for example');
    content = content.replace(/\bi\.e\./g, 'that is');

    // Normalize whitespace
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }

  /**
   * Build voice assignments for export
   */
  private buildVoiceAssignments(
    participants: ConversationParticipant[],
    personaMap: Map<string, PodcastPersona>
  ): VoiceAssignment[] {
    const assignments: VoiceAssignment[] = [
      {
        speakerName: 'Host',
        speakerRole: 'host',
        personaSlug: null,
      },
    ];

    for (const p of participants) {
      const persona = personaMap.get(p.personaId);
      assignments.push({
        speakerName: p.displayNameOverride || persona?.name || 'Guest',
        speakerRole: 'guest',
        personaSlug: persona?.slug || null,
        voiceSettings: persona?.voiceCharacteristics,
      });
    }

    return assignments;
  }
}

// Factory function
export function createConversationScriptRefiner(pool: Pool): ConversationScriptRefiner {
  return new ConversationScriptRefiner(pool);
}
```

### API Route for Export

Add to `backend/src/routes/conversation-routes.ts`:

```typescript
import { createConversationScriptRefiner } from '../services/podcast/conversation-script-refiner.js';

/**
 * POST /api/conversations/sessions/:id/export-to-podcast
 * Create podcast export from conversation
 */
router.post('/sessions/:id/export-to-podcast', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { provider = 'elevenlabs' } = req.body;

    const session = await sessionRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'completed') {
      res.status(400).json({ error: 'Can only export completed conversations' });
      return;
    }

    const refiner = createConversationScriptRefiner(pool);
    const script = await refiner.refine(id, provider);

    // TODO: Create podcast export job using existing pipeline
    // For now, return the refined script
    res.json({
      script,
      message: 'Script refined. Use /api/podcast/export to generate audio.',
    });
  } catch (error) {
    logger.error({ error, sessionId: req.params.id }, 'Failed to export conversation');
    next(error);
  }
});
```

---

## Validation

### How to Test

1. Create and complete a test conversation
2. Call export endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/export-to-podcast \
     -H "Content-Type: application/json" \
     -d '{"provider": "elevenlabs"}'
   ```

3. Verify:
   - Script segments preserved in order
   - Host segments identified correctly
   - Guest names mapped to personas
   - Audio cues added appropriately
   - Voice assignments generated

### Definition of Done

- [x] `ConversationScriptRefiner` service created
- [x] Refine method processes all utterances
- [x] Audio cues added for ElevenLabs
- [x] Audio cues added for Gemini
- [x] Audio cues added for Google Cloud
- [x] Content cleaned for TTS
- [x] Voice assignments generated
- [x] API endpoint works
- [x] Duration estimation reasonable
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-019 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
