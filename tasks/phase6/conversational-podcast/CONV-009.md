# CONV-009: Persona and Session API Routes

**Task ID:** CONV-009
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-003 (Persona Repository), CONV-004 (Session Repositories)
**Status:** Done

---

## Context

This task creates the API routes for managing personas and conversation sessions. These routes handle listing personas, creating sessions, and retrieving session details.

**References:**
- [CONV-003](./CONV-003.md) - PersonaRepository
- [CONV-004](./CONV-004.md) - Session repositories
- Existing pattern: `backend/src/routes/podcast-routes.ts`

---

## Requirements

### Acceptance Criteria

- [x] Create `conversation-routes.ts` in `backend/src/routes/`
- [x] Implement `GET /api/conversations/personas` - list all personas
- [x] Implement `GET /api/conversations/personas/:slug` - get single persona
- [x] Implement `POST /api/conversations/sessions` - create session
- [x] Implement `GET /api/conversations/sessions/:id` - get session details
- [x] Implement `GET /api/conversations/sessions` - list user's sessions
- [x] Register routes in `backend/src/index.ts`
- [x] Add request validation with Zod

---

## Implementation Guide

### Route Implementation

Create file: `backend/src/routes/conversation-routes.ts`

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { Pool } from 'pg';
import { PersonaRepository } from '../db/repositories/persona-repository.js';
import { ConversationSessionRepository } from '../db/repositories/conversation-session-repository.js';
import { ConversationParticipantRepository } from '../db/repositories/conversation-participant-repository.js';
import { ContextBoardRepository } from '../db/repositories/context-board-repository.js';
import type { FlowMode } from '../types/conversation.js';

const logger = pino({
  name: 'conversation-routes',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createSessionSchema = z.object({
  topic: z.string().min(5).max(500),
  topicContext: z.string().max(2000).optional(),
  episodeProposalId: z.string().uuid().optional(),
  flowMode: z.enum(['manual', 'auto_stream', 'natural_pace']).default('manual'),
  paceDelayMs: z.number().min(500).max(10000).default(3000),
  participants: z.array(z.object({
    personaId: z.string().uuid(),
    modelId: z.string().min(1),
    displayNameOverride: z.string().max(100).optional(),
  })).min(2).max(6),
});

const listSessionsSchema = z.object({
  status: z.enum(['configuring', 'live', 'paused', 'completed']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================================================
// ROUTE FACTORY
// ============================================================================

export function createConversationRoutes(pool: Pool): Router {
  const router = Router();
  const personaRepo = new PersonaRepository(pool);
  const sessionRepo = new ConversationSessionRepository(pool);
  const participantRepo = new ConversationParticipantRepository(pool);
  const contextBoardRepo = new ContextBoardRepository(pool);

  // ==========================================================================
  // PERSONA ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/personas
   * List all 12 podcast personas
   */
  router.get('/personas', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const personas = await personaRepo.findAll();

      res.json({
        personas,
        count: personas.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list personas');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/summaries
   * Get lightweight persona data for dropdowns
   */
  router.get('/personas/summaries', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summaries = await personaRepo.getSummaries();

      res.json({
        personas: summaries,
        count: summaries.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get persona summaries');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/:slug
   * Get a single persona by slug
   */
  router.get('/personas/:slug', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;
      const persona = await personaRepo.findBySlug(slug);

      if (!persona) {
        res.status(404).json({ error: 'Persona not found' });
        return;
      }

      res.json({ persona });
    } catch (error) {
      logger.error({ error, slug: req.params.slug }, 'Failed to get persona');
      next(error);
    }
  });

  /**
   * GET /api/conversations/personas/by-topics
   * Find personas by preferred topics
   */
  router.get('/personas/by-topics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const topics = (req.query.topics as string || '').split(',').filter(Boolean);

      if (topics.length === 0) {
        res.status(400).json({ error: 'At least one topic required' });
        return;
      }

      const personas = await personaRepo.findByTopics(topics);

      res.json({
        personas,
        count: personas.length,
        topics,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to find personas by topics');
      next(error);
    }
  });

  // ==========================================================================
  // SESSION ROUTES
  // ==========================================================================

  /**
   * POST /api/conversations/sessions
   * Create a new conversation session
   */
  router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createSessionSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
        return;
      }

      const { topic, topicContext, episodeProposalId, flowMode, paceDelayMs, participants } = parsed.data;

      // Validate all personas exist
      const personaIds = participants.map(p => p.personaId);
      const existingPersonas = await personaRepo.findByIds(personaIds);

      if (existingPersonas.length !== personaIds.length) {
        const missing = personaIds.filter(id => !existingPersonas.find(p => p.id === id));
        res.status(400).json({
          error: 'Invalid persona IDs',
          missing,
        });
        return;
      }

      // Create session
      const session = await sessionRepo.create({
        topic,
        topicContext,
        episodeProposalId,
        flowMode: flowMode as FlowMode,
        paceDelayMs,
        participantCount: participants.length,
      });

      // Create participants
      const createdParticipants = await Promise.all(
        participants.map((p, index) =>
          participantRepo.create({
            sessionId: session.id,
            personaId: p.personaId,
            modelId: p.modelId,
            displayNameOverride: p.displayNameOverride,
            participantOrder: index,
          })
        )
      );

      // Initialize context board
      await contextBoardRepo.create(session.id);

      logger.info({
        sessionId: session.id,
        topic,
        participantCount: participants.length,
      }, 'Conversation session created');

      res.status(201).json({
        session: {
          ...session,
          participants: createdParticipants.map((p, i) => ({
            ...p,
            persona: existingPersonas.find(per => per.id === p.personaId),
          })),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create session');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions
   * List conversation sessions
   */
  router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listSessionsSchema.safeParse(req.query);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: parsed.error.issues,
        });
        return;
      }

      const { status, limit, offset } = parsed.data;

      const sessions = await sessionRepo.findAll({
        status,
        limit,
        offset,
      });

      const total = await sessionRepo.count({ status });

      res.json({
        sessions,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + sessions.length < total,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list sessions');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id
   * Get session details with participants
   */
  router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const session = await sessionRepo.findById(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Load participants with personas
      const participants = await participantRepo.findBySessionId(id);
      const personaIds = participants.map(p => p.personaId);
      const personas = await personaRepo.findByIds(personaIds);

      const participantsWithPersonas = participants.map(p => ({
        ...p,
        persona: personas.find(per => per.id === p.personaId),
      }));

      // Load context board state
      const contextBoard = await contextBoardRepo.getBySessionId(id);

      res.json({
        session: {
          ...session,
          participants: participantsWithPersonas,
          contextBoard,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get session');
      next(error);
    }
  });

  /**
   * DELETE /api/conversations/sessions/:id
   * Delete a session (only if not completed)
   */
  router.delete('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const session = await sessionRepo.findById(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.status === 'completed') {
        res.status(400).json({ error: 'Cannot delete completed session' });
        return;
      }

      await sessionRepo.delete(id);

      logger.info({ sessionId: id }, 'Session deleted');
      res.status(204).send();
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to delete session');
      next(error);
    }
  });

  return router;
}
```

### Register Routes

Update `backend/src/routes/index.ts`:

```typescript
import { createConversationRoutes } from './conversation-routes.js';

// In the route registration section:
app.use('/api/conversations', createConversationRoutes(pool));
```

---

## Validation

### How to Test

1. Start the backend server

2. Test persona endpoints:
   ```bash
   # List all personas
   curl http://localhost:3000/api/conversations/personas

   # Get persona summaries
   curl http://localhost:3000/api/conversations/personas/summaries

   # Get single persona
   curl http://localhost:3000/api/conversations/personas/professor_clara

   # Find by topics
   curl "http://localhost:3000/api/conversations/personas/by-topics?topics=technology,ethics"
   ```

3. Test session endpoints:
   ```bash
   # Create session
   curl -X POST http://localhost:3000/api/conversations/sessions \
     -H "Content-Type: application/json" \
     -d '{
       "topic": "The future of AI in healthcare",
       "flowMode": "manual",
       "participants": [
         {"personaId": "...", "modelId": "anthropic/claude-sonnet-4"},
         {"personaId": "...", "modelId": "openai/gpt-4o"}
       ]
     }'

   # List sessions
   curl http://localhost:3000/api/conversations/sessions

   # Get session details
   curl http://localhost:3000/api/conversations/sessions/{id}
   ```

### Definition of Done

- [ ] All persona endpoints implemented and working
- [ ] Session creation validates all inputs
- [ ] Session creation initializes context board
- [ ] Session listing with pagination works
- [ ] Session details include participants and personas
- [ ] Routes registered in main router
- [ ] Zod validation on all inputs
- [ ] Error handling consistent with existing routes
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-009 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
