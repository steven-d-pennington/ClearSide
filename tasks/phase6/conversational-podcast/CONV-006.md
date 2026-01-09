# CONV-006: ContextBoardService

**Task ID:** CONV-006
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-002 (Types), CONV-004 (Repositories)
**Status:** Ready

---

## Context

This task creates the ContextBoardService that maintains a real-time "whiteboard" tracking topics discussed, claims made, agreements, disagreements, and key points per participant. It uses a fast LLM (Haiku) to extract structured information from each utterance.

**References:**
- [CONV-002](./CONV-002.md) - TypeScript types (ContextBoardState)
- [CONV-004](./CONV-004.md) - ContextBoardRepository
- Plan file section on ContextBoardService

---

## Requirements

### Acceptance Criteria

- [ ] Create `ContextBoardService` in `backend/src/services/conversation/context-board-service.ts`
- [ ] Extract topics, claims, agreements, disagreements from utterances
- [ ] Track key points per participant
- [ ] Manage current conversational thread
- [ ] Process speaker signals and maintain queue
- [ ] Persist state to database via ContextBoardRepository
- [ ] Use fast LLM (Haiku) for extraction

---

## Implementation Guide

### ContextBoardService Implementation

Create file: `backend/src/services/conversation/context-board-service.ts`

```typescript
import pino from 'pino';
import type { Pool } from 'pg';
import { createOpenRouterClient } from '../llm/openrouter-adapter.js';
import type { LLMClient } from '../llm/client.js';
import { ContextBoardRepository } from '../../db/repositories/context-board-repository.js';
import type {
  ContextBoardState,
  TopicDiscussed,
  ClaimMade,
  SpeakerSignal,
  ConversationUtterance,
} from '../../types/conversation.js';

const logger = pino({
  name: 'context-board-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Model for fast extraction (Haiku for speed and cost)
 */
const EXTRACTION_MODEL = 'anthropic/claude-3-haiku-20240307';

/**
 * Extraction result from LLM
 */
interface ExtractionResult {
  newTopics: string[];
  claims: Array<{ content: string; stance: 'supporting' | 'challenging' | 'neutral' }>;
  agreementsWith: string[];
  disagreementsWith: string[];
  isKeyPoint: boolean;
  topicMarker?: string;
}

/**
 * ContextBoardService
 *
 * Maintains shared state for podcast conversations:
 * - Topics discussed (introduced by whom, status)
 * - Claims made (who, stance, supporters/challengers)
 * - Agreements and disagreements
 * - Key points per participant
 * - Current conversational thread
 * - Speaker signal queue
 */
export class ContextBoardService {
  private pool: Pool;
  private repository: ContextBoardRepository;
  private extractionClient: LLMClient;
  private sessionId: string;
  private state: ContextBoardState;
  private participantNames: Map<string, string>; // participantId -> display name

  constructor(
    pool: Pool,
    sessionId: string,
    participantNames: Map<string, string>,
    extractionClient?: LLMClient
  ) {
    this.pool = pool;
    this.repository = new ContextBoardRepository(pool);
    this.extractionClient = extractionClient || createOpenRouterClient(EXTRACTION_MODEL);
    this.sessionId = sessionId;
    this.participantNames = participantNames;

    // Initialize empty state
    this.state = {
      topicsDiscussed: [],
      claims: [],
      agreements: [],
      disagreements: [],
      keyPointsByParticipant: {},
      currentThread: null,
      speakerQueue: [],
    };

    logger.info({ sessionId, participantCount: participantNames.size }, 'ContextBoardService initialized');
  }

  // =========================================================================
  // STATE ACCESS
  // =========================================================================

  /**
   * Get current board state
   */
  getState(): ContextBoardState {
    return { ...this.state };
  }

  /**
   * Get current speaker queue
   */
  getSpeakerQueue(): SpeakerSignal[] {
    return [...this.state.speakerQueue];
  }

  /**
   * Get next speaker signal (highest urgency)
   */
  getNextSignal(): SpeakerSignal | null {
    if (this.state.speakerQueue.length === 0) return null;

    // Sort by urgency (high > medium > low) and timestamp
    const sorted = [...this.state.speakerQueue].sort((a, b) => {
      const urgencyOrder = { high: 3, medium: 2, low: 1 };
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.timestamp - b.timestamp;
    });

    return sorted[0] || null;
  }

  /**
   * Get summary for display
   */
  getSummary(): string {
    const parts: string[] = [];

    if (this.state.currentThread) {
      parts.push(`Current: ${this.state.currentThread}`);
    }

    const activeTopics = this.state.topicsDiscussed.filter(t => t.status === 'active');
    if (activeTopics.length > 0) {
      parts.push(`Topics: ${activeTopics.map(t => t.topic).join(', ')}`);
    }

    if (this.state.agreements.length > 0) {
      parts.push(`Agreements: ${this.state.agreements.length}`);
    }

    if (this.state.disagreements.length > 0) {
      parts.push(`Disagreements: ${this.state.disagreements.length}`);
    }

    return parts.join(' | ');
  }

  // =========================================================================
  // PROCESSING METHODS
  // =========================================================================

  /**
   * Process a new utterance and update the board
   */
  async processUtterance(utterance: ConversationUtterance): Promise<void> {
    const participantName = this.participantNames.get(utterance.participantId) || 'Unknown';

    logger.debug({
      sessionId: this.sessionId,
      participantId: utterance.participantId,
      contentLength: utterance.content.length,
    }, 'Processing utterance for context board');

    try {
      // Extract structured information using fast LLM
      const extraction = await this.extractFromUtterance(utterance.content, participantName);

      // Update topics
      for (const topic of extraction.newTopics) {
        this.addTopic(topic, utterance.participantId);
      }

      // Update claims
      for (const claim of extraction.claims) {
        this.addClaim(utterance.participantId, claim.content, claim.stance);
      }

      // Update agreements/disagreements
      for (const agreedWith of extraction.agreementsWith) {
        this.addAgreement(utterance.participantId, agreedWith);
      }
      for (const disagreedWith of extraction.disagreementsWith) {
        this.addDisagreement(utterance.participantId, disagreedWith);
      }

      // Track key points
      if (extraction.isKeyPoint) {
        this.addKeyPoint(utterance.participantId, utterance.content);
      }

      // Update current thread
      if (extraction.topicMarker) {
        this.state.currentThread = extraction.topicMarker;
      }

      // Persist to database
      await this.persist();

      logger.debug({
        sessionId: this.sessionId,
        newTopics: extraction.newTopics.length,
        newClaims: extraction.claims.length,
        isKeyPoint: extraction.isKeyPoint,
      }, 'Context board updated');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to process utterance');
      // Don't throw - context board is non-critical
    }
  }

  /**
   * Add a speaker signal to the queue
   */
  addSignal(signal: SpeakerSignal): void {
    // Remove any existing signal from this participant
    this.state.speakerQueue = this.state.speakerQueue.filter(
      s => s.participantId !== signal.participantId
    );

    // Add new signal
    this.state.speakerQueue.push(signal);

    logger.debug({
      sessionId: this.sessionId,
      participantId: signal.participantId,
      urgency: signal.urgency,
      queueLength: this.state.speakerQueue.length,
    }, 'Speaker signal added to queue');
  }

  /**
   * Remove a signal after participant speaks
   */
  consumeSignal(participantId: string): void {
    this.state.speakerQueue = this.state.speakerQueue.filter(
      s => s.participantId !== participantId
    );
  }

  /**
   * Clear all signals
   */
  clearSignals(): void {
    this.state.speakerQueue = [];
  }

  // =========================================================================
  // TOPIC MANAGEMENT
  // =========================================================================

  private addTopic(topic: string, introducedBy: string): void {
    const existing = this.state.topicsDiscussed.find(
      t => t.topic.toLowerCase() === topic.toLowerCase()
    );

    if (!existing) {
      this.state.topicsDiscussed.push({
        topic,
        introducedBy,
        status: 'active',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Mark a topic as resolved or tabled
   */
  updateTopicStatus(topic: string, status: 'active' | 'resolved' | 'tabled'): void {
    const existing = this.state.topicsDiscussed.find(
      t => t.topic.toLowerCase() === topic.toLowerCase()
    );
    if (existing) {
      existing.status = status;
    }
  }

  // =========================================================================
  // CLAIM MANAGEMENT
  // =========================================================================

  private addClaim(
    participantId: string,
    content: string,
    stance: 'supporting' | 'challenging' | 'neutral'
  ): void {
    this.state.claims.push({
      participantId,
      content,
      stance,
      supporters: stance === 'supporting' ? [participantId] : [],
      challengers: stance === 'challenging' ? [participantId] : [],
      timestamp: Date.now(),
    });
  }

  // =========================================================================
  // AGREEMENT/DISAGREEMENT TRACKING
  // =========================================================================

  private addAgreement(participantId: string, withParticipantName: string): void {
    this.state.agreements.push({
      participants: [participantId, withParticipantName],
      topic: this.state.currentThread || 'general',
      timestamp: Date.now(),
    });
  }

  private addDisagreement(participantId: string, withParticipantName: string): void {
    this.state.disagreements.push({
      participants: [participantId, withParticipantName],
      topic: this.state.currentThread || 'general',
      timestamp: Date.now(),
    });
  }

  // =========================================================================
  // KEY POINTS
  // =========================================================================

  private addKeyPoint(participantId: string, content: string): void {
    if (!this.state.keyPointsByParticipant[participantId]) {
      this.state.keyPointsByParticipant[participantId] = [];
    }

    // Store abbreviated version
    const abbreviated = content.length > 200
      ? content.substring(0, 200) + '...'
      : content;

    this.state.keyPointsByParticipant[participantId].push(abbreviated);
  }

  // =========================================================================
  // LLM EXTRACTION
  // =========================================================================

  /**
   * Extract structured information from utterance using fast LLM
   */
  private async extractFromUtterance(
    content: string,
    speakerName: string
  ): Promise<ExtractionResult> {
    const participantNamesList = Array.from(this.participantNames.values());

    const prompt = `Analyze this podcast conversation utterance and extract structured information.

SPEAKER: ${speakerName}
CONTENT: ${content}

OTHER PARTICIPANTS: ${participantNamesList.filter(n => n !== speakerName).join(', ')}

Extract the following (respond in JSON format):
{
  "newTopics": ["topic1", "topic2"],  // New topics introduced (if any)
  "claims": [
    {"content": "claim text", "stance": "supporting|challenging|neutral"}
  ],
  "agreementsWith": ["participant name"],  // Names of participants they agreed with
  "disagreementsWith": ["participant name"],  // Names they disagreed with
  "isKeyPoint": true/false,  // Is this a particularly insightful or important point?
  "topicMarker": "current topic"  // What topic are they currently discussing?
}

Return only valid JSON.`;

    try {
      const response = await this.extractionClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.3, maxTokens: 300 }
      );

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyExtraction();
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        newTopics: parsed.newTopics || [],
        claims: parsed.claims || [],
        agreementsWith: parsed.agreementsWith || [],
        disagreementsWith: parsed.disagreementsWith || [],
        isKeyPoint: parsed.isKeyPoint || false,
        topicMarker: parsed.topicMarker,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to extract from utterance');
      return this.emptyExtraction();
    }
  }

  private emptyExtraction(): ExtractionResult {
    return {
      newTopics: [],
      claims: [],
      agreementsWith: [],
      disagreementsWith: [],
      isKeyPoint: false,
    };
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  /**
   * Load state from database
   */
  async load(): Promise<void> {
    const dbState = await this.repository.getBySessionId(this.sessionId);
    if (dbState) {
      this.state = dbState;
      logger.debug({ sessionId: this.sessionId }, 'Context board state loaded');
    }
  }

  /**
   * Persist state to database
   */
  private async persist(): Promise<void> {
    await this.repository.update(this.sessionId, this.state);
  }

  /**
   * Initialize board in database
   */
  async initialize(): Promise<void> {
    await this.repository.create(this.sessionId);
    logger.info({ sessionId: this.sessionId }, 'Context board initialized in database');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a ContextBoardService for a session
 */
export async function createContextBoardService(
  pool: Pool,
  sessionId: string,
  participantNames: Map<string, string>
): Promise<ContextBoardService> {
  const service = new ContextBoardService(pool, sessionId, participantNames);
  await service.initialize();
  return service;
}
```

---

## Validation

### How to Test

1. Create a context board service:
   ```typescript
   const participantNames = new Map([
     ['p1', 'Professor Clara'],
     ['p2', 'Maverick Mike'],
   ]);

   const service = await createContextBoardService(pool, 'session-123', participantNames);
   ```

2. Process utterances:
   ```typescript
   await service.processUtterance({
     id: 1,
     sessionId: 'session-123',
     participantId: 'p1',
     content: 'I think we need to consider the ethical implications of AI in healthcare.',
     timestampMs: 0,
     isKeyPoint: false,
   });

   const state = service.getState();
   console.log(state.topicsDiscussed); // Should include 'AI in healthcare' or similar
   ```

3. Test signal queue:
   ```typescript
   service.addSignal({
     participantId: 'p2',
     urgency: 'high',
     reason: 'disagreement',
     preview: 'I strongly disagree about the timeline',
     timestamp: Date.now(),
   });

   const next = service.getNextSignal();
   console.log(next); // p2's signal
   ```

### Definition of Done

- [ ] `ContextBoardService` class implemented
- [ ] Utterance processing extracts topics, claims, agreements
- [ ] Speaker signal queue works correctly
- [ ] Key points tracked per participant
- [ ] State persists to database
- [ ] Fast LLM (Haiku) used for extraction
- [ ] Summary generation works
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-006 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
