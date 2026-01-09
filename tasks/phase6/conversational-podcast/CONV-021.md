# CONV-021: Vector Indexing of Utterances

**Task ID:** CONV-021
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P2
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-008 (Orchestrator), DUELOGIC-005 (Pinecone Client)
**Status:** Ready

---

## Context

This task indexes conversation utterances in the vector database (Pinecone) for semantic search and future RAG use. Each utterance is embedded and stored with metadata, allowing conversations to be searched and cross-referenced.

**References:**
- Existing: `backend/src/services/research/pinecone-client.ts`
- [CONV-008](./CONV-008.md) - ConversationalOrchestrator (source of utterances)
- [DUELOGIC-005](../duelogic-research/DUELOGIC-005.md) - Vector DB integration

---

## Requirements

### Acceptance Criteria

- [ ] Create `ConversationIndexingService`
- [ ] Index utterances after conversation completes
- [ ] Include metadata (persona, session, topic)
- [ ] Support semantic search across conversations
- [ ] Handle batch indexing efficiently
- [ ] Add API endpoint for search

---

## Implementation Guide

### ConversationIndexingService

Create file: `backend/src/services/conversation/conversation-indexing-service.ts`

```typescript
import pino from 'pino';
import type { Pool } from 'pg';
import { PineconeClient } from '../research/pinecone-client.js';
import { ConversationSessionRepository } from '../../db/repositories/conversation-session-repository.js';
import { ConversationParticipantRepository } from '../../db/repositories/conversation-participant-repository.js';
import { ConversationUtteranceRepository } from '../../db/repositories/conversation-utterance-repository.js';
import { PersonaRepository } from '../../db/repositories/persona-repository.js';
import type { ConversationUtterance } from '../../types/conversation.js';

const logger = pino({
  name: 'conversation-indexing-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Namespace for conversation vectors in Pinecone
 */
const CONVERSATION_NAMESPACE = 'conversations';

/**
 * Batch size for vector upserts
 */
const BATCH_SIZE = 50;

/**
 * Metadata stored with each utterance vector
 */
interface UtteranceVectorMetadata {
  sessionId: string;
  utteranceId: number;
  participantId: string;
  personaSlug: string | null;
  speakerName: string;
  topic: string;
  timestampMs: number;
  isKeyPoint: boolean;
  topicMarker?: string;
  contentPreview: string;
}

/**
 * Search result
 */
export interface ConversationSearchResult {
  sessionId: string;
  utteranceId: number;
  speakerName: string;
  personaSlug: string | null;
  topic: string;
  content: string;
  score: number;
}

/**
 * ConversationIndexingService
 *
 * Indexes conversation utterances in Pinecone for semantic search.
 */
export class ConversationIndexingService {
  private pool: Pool;
  private pinecone: PineconeClient;
  private sessionRepo: ConversationSessionRepository;
  private participantRepo: ConversationParticipantRepository;
  private utteranceRepo: ConversationUtteranceRepository;
  private personaRepo: PersonaRepository;

  constructor(pool: Pool, pineconeClient?: PineconeClient) {
    this.pool = pool;
    this.pinecone = pineconeClient || new PineconeClient();
    this.sessionRepo = new ConversationSessionRepository(pool);
    this.participantRepo = new ConversationParticipantRepository(pool);
    this.utteranceRepo = new ConversationUtteranceRepository(pool);
    this.personaRepo = new PersonaRepository(pool);
  }

  /**
   * Index all utterances from a completed conversation
   */
  async indexConversation(sessionId: string): Promise<number> {
    logger.info({ sessionId }, 'Starting conversation indexing');

    // Load session
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'completed') {
      throw new Error('Can only index completed conversations');
    }

    // Load participants and personas
    const participants = await this.participantRepo.findBySessionId(sessionId);
    const personaIds = participants.map(p => p.personaId);
    const personas = await this.personaRepo.findByIds(personaIds);
    const personaMap = new Map(personas.map(p => [p.id, p]));

    // Build participant lookup
    const participantMap = new Map<string, { name: string; personaSlug: string | null }>();
    participantMap.set('host', { name: 'Host', personaSlug: null });
    for (const p of participants) {
      const persona = personaMap.get(p.personaId);
      participantMap.set(p.id, {
        name: p.displayNameOverride || persona?.name || 'Guest',
        personaSlug: persona?.slug || null,
      });
    }

    // Load all utterances
    const utterances = await this.utteranceRepo.findBySessionId(sessionId);

    // Index in batches
    let indexedCount = 0;
    for (let i = 0; i < utterances.length; i += BATCH_SIZE) {
      const batch = utterances.slice(i, i + BATCH_SIZE);
      await this.indexBatch(batch, session.topic, participantMap);
      indexedCount += batch.length;

      logger.debug({
        sessionId,
        indexed: indexedCount,
        total: utterances.length,
      }, 'Indexing progress');
    }

    logger.info({
      sessionId,
      indexedCount,
    }, 'Conversation indexing complete');

    return indexedCount;
  }

  /**
   * Index a batch of utterances
   */
  private async indexBatch(
    utterances: ConversationUtterance[],
    topic: string,
    participantMap: Map<string, { name: string; personaSlug: string | null }>
  ): Promise<void> {
    const vectors = await Promise.all(
      utterances.map(async (u) => {
        const participantInfo = participantMap.get(u.participantId) || {
          name: 'Unknown',
          personaSlug: null,
        };

        const metadata: UtteranceVectorMetadata = {
          sessionId: u.sessionId,
          utteranceId: u.id,
          participantId: u.participantId,
          personaSlug: participantInfo.personaSlug,
          speakerName: participantInfo.name,
          topic,
          timestampMs: u.timestampMs,
          isKeyPoint: u.isKeyPoint,
          topicMarker: u.topicMarker || undefined,
          contentPreview: u.content.substring(0, 200),
        };

        // Generate embedding
        const embedding = await this.pinecone.embed(u.content);

        return {
          id: `conv-${u.sessionId}-${u.id}`,
          values: embedding,
          metadata,
        };
      })
    );

    // Upsert to Pinecone
    await this.pinecone.upsert(vectors, CONVERSATION_NAMESPACE);
  }

  /**
   * Search conversations semantically
   */
  async search(
    query: string,
    options: {
      sessionId?: string;
      personaSlug?: string;
      limit?: number;
    } = {}
  ): Promise<ConversationSearchResult[]> {
    const { sessionId, personaSlug, limit = 10 } = options;

    // Build filter
    const filter: Record<string, unknown> = {};
    if (sessionId) {
      filter.sessionId = sessionId;
    }
    if (personaSlug) {
      filter.personaSlug = personaSlug;
    }

    // Search
    const results = await this.pinecone.query(
      query,
      limit,
      CONVERSATION_NAMESPACE,
      Object.keys(filter).length > 0 ? filter : undefined
    );

    // Map results
    return results.map((r) => ({
      sessionId: r.metadata.sessionId as string,
      utteranceId: r.metadata.utteranceId as number,
      speakerName: r.metadata.speakerName as string,
      personaSlug: r.metadata.personaSlug as string | null,
      topic: r.metadata.topic as string,
      content: r.metadata.contentPreview as string,
      score: r.score,
    }));
  }

  /**
   * Delete all vectors for a conversation
   */
  async deleteConversation(sessionId: string): Promise<void> {
    await this.pinecone.deleteByFilter(
      { sessionId },
      CONVERSATION_NAMESPACE
    );

    logger.info({ sessionId }, 'Deleted conversation vectors');
  }
}

// Factory
export function createConversationIndexingService(pool: Pool): ConversationIndexingService {
  return new ConversationIndexingService(pool);
}
```

### API Endpoints

Add to `backend/src/routes/conversation-routes.ts`:

```typescript
import { createConversationIndexingService } from '../services/conversation/conversation-indexing-service.js';

/**
 * POST /api/conversations/sessions/:id/index
 * Index a completed conversation for search
 */
router.post('/sessions/:id/index', async (req, res, next) => {
  try {
    const { id } = req.params;

    const indexingService = createConversationIndexingService(pool);
    const count = await indexingService.indexConversation(id);

    res.json({
      message: 'Conversation indexed successfully',
      indexedCount: count,
    });
  } catch (error) {
    logger.error({ error, sessionId: req.params.id }, 'Failed to index conversation');
    next(error);
  }
});

/**
 * GET /api/conversations/search
 * Semantic search across conversations
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q, sessionId, personaSlug, limit } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const indexingService = createConversationIndexingService(pool);
    const results = await indexingService.search(q, {
      sessionId: sessionId as string,
      personaSlug: personaSlug as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      query: q,
      results,
      count: results.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to search conversations');
    next(error);
  }
});
```

---

## Validation

### How to Test

1. Complete a conversation

2. Index it:
   ```bash
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/index
   ```

3. Search:
   ```bash
   curl "http://localhost:3000/api/conversations/search?q=AI%20ethics"
   ```

4. Verify results include relevant utterances

### Definition of Done

- [ ] `ConversationIndexingService` created
- [ ] Utterances indexed with correct metadata
- [ ] Batch processing works efficiently
- [ ] Semantic search returns relevant results
- [ ] Filter by session/persona works
- [ ] Delete conversation vectors works
- [ ] API endpoints functional
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-021 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
