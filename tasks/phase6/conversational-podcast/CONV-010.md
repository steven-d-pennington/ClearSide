# CONV-010: Control and Streaming API Routes

**Task ID:** CONV-010
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-008 (Orchestrator), CONV-009 (Base Routes)
**Status:** Ready

---

## Context

This task adds control routes to the conversation API for launching, pausing, resuming, and advancing conversations. It also adds the SSE streaming endpoint for real-time updates.

**References:**
- [CONV-008](./CONV-008.md) - ConversationalOrchestrator
- [CONV-009](./CONV-009.md) - Base conversation routes
- Existing pattern: `backend/src/routes/duelogic-routes.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Add `POST /sessions/:id/launch` - start conversation
- [ ] Add `POST /sessions/:id/advance` - next turn (manual mode)
- [ ] Add `POST /sessions/:id/pause` - pause conversation
- [ ] Add `POST /sessions/:id/resume` - resume conversation
- [ ] Add `POST /sessions/:id/flow-mode` - change flow mode
- [ ] Add `GET /sessions/:id/stream` - SSE endpoint
- [ ] Add `GET /sessions/:id/transcript` - markdown export
- [ ] Add `GET /sessions/:id/context-board` - context state
- [ ] Store active orchestrators in memory for control

---

## Implementation Guide

### Add Control Routes

Update `backend/src/routes/conversation-routes.ts`:

```typescript
import { createConversationalOrchestrator, ConversationalOrchestrator } from '../services/conversation/conversational-orchestrator.js';
import { ConversationUtteranceRepository } from '../db/repositories/conversation-utterance-repository.js';
import type { SSEManager } from '../services/sse/sse-manager.js';

// Store active orchestrators
const activeOrchestrators = new Map<string, ConversationalOrchestrator>();

// Additional schemas
const flowModeSchema = z.object({
  mode: z.enum(['manual', 'auto_stream', 'natural_pace']),
  paceDelayMs: z.number().min(500).max(10000).optional(),
});

export function createConversationRoutes(pool: Pool, sseManager: SSEManager): Router {
  const router = Router();
  // ... existing repos ...
  const utteranceRepo = new ConversationUtteranceRepository(pool);

  // ... existing routes from CONV-009 ...

  // ==========================================================================
  // CONTROL ROUTES
  // ==========================================================================

  /**
   * POST /api/conversations/sessions/:id/launch
   * Start a conversation
   */
  router.post('/sessions/:id/launch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Check if already running
      if (activeOrchestrators.has(id)) {
        res.status(409).json({ error: 'Conversation already running' });
        return;
      }

      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.status === 'completed') {
        res.status(400).json({ error: 'Session already completed' });
        return;
      }

      // Create and initialize orchestrator
      const orchestrator = await createConversationalOrchestrator(
        pool,
        sseManager,
        id
      );

      activeOrchestrators.set(id, orchestrator);

      // Start conversation in background
      orchestrator.start()
        .then(() => {
          activeOrchestrators.delete(id);
          logger.info({ sessionId: id }, 'Conversation completed');
        })
        .catch((error) => {
          activeOrchestrators.delete(id);
          logger.error({ error, sessionId: id }, 'Conversation failed');
        });

      logger.info({ sessionId: id }, 'Conversation launched');

      res.json({
        message: 'Conversation launched',
        sessionId: id,
        status: 'live',
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to launch conversation');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/advance
   * Advance to next turn (manual mode only)
   */
  router.post('/sessions/:id/advance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      orchestrator.advanceOnce();

      res.json({
        message: 'Advanced to next turn',
        sessionId: id,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to advance');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/pause
   * Pause a running conversation
   */
  router.post('/sessions/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      await orchestrator.pause();

      res.json({
        message: 'Conversation paused',
        sessionId: id,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to pause');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/resume
   * Resume a paused conversation
   */
  router.post('/sessions/:id/resume', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        res.status(404).json({ error: 'No active conversation found' });
        return;
      }

      await orchestrator.resume();

      res.json({
        message: 'Conversation resumed',
        sessionId: id,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to resume');
      next(error);
    }
  });

  /**
   * POST /api/conversations/sessions/:id/flow-mode
   * Change flow mode during conversation
   */
  router.post('/sessions/:id/flow-mode', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const parsed = flowModeSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
        return;
      }

      const { mode, paceDelayMs } = parsed.data;

      const orchestrator = activeOrchestrators.get(id);
      if (orchestrator) {
        await orchestrator.setFlowMode(mode, paceDelayMs);
      } else {
        // Update in database even if not running
        await sessionRepo.updateFlowMode(id, mode, paceDelayMs);
      }

      res.json({
        message: 'Flow mode updated',
        sessionId: id,
        mode,
        paceDelayMs,
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to update flow mode');
      next(error);
    }
  });

  // ==========================================================================
  // STREAMING ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/sessions/:id/stream
   * SSE endpoint for real-time updates
   */
  router.get('/sessions/:id/stream', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Register client with SSE manager
      const clientId = sseManager.addConversationClient(id, res);

      // Send initial state
      res.write(`data: ${JSON.stringify({
        type: 'connection_established',
        sessionId: id,
        clientId,
        status: session.status,
      })}\n\n`);

      // Handle disconnect
      req.on('close', () => {
        sseManager.removeConversationClient(id, clientId);
        logger.debug({ sessionId: id, clientId }, 'SSE client disconnected');
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to establish SSE');
      next(error);
    }
  });

  // ==========================================================================
  // DATA ROUTES
  // ==========================================================================

  /**
   * GET /api/conversations/sessions/:id/context-board
   * Get current context board state
   */
  router.get('/sessions/:id/context-board', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const contextBoard = await contextBoardRepo.getBySessionId(id);
      if (!contextBoard) {
        res.status(404).json({ error: 'Context board not found' });
        return;
      }

      res.json({ contextBoard });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get context board');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/transcript
   * Export transcript as markdown
   */
  router.get('/sessions/:id/transcript', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const session = await sessionRepo.findById(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const participants = await participantRepo.findBySessionId(id);
      const personaIds = participants.map(p => p.personaId);
      const personas = await personaRepo.findByIds(personaIds);
      const utterances = await utteranceRepo.findBySessionId(id);

      // Build markdown transcript
      let markdown = `# Conversation: ${session.topic}\n\n`;
      markdown += `**Date:** ${session.createdAt.toISOString().split('T')[0]}\n`;
      markdown += `**Participants:** ${participants.map(p => {
        const persona = personas.find(per => per.id === p.personaId);
        return p.displayNameOverride || persona?.name || 'Unknown';
      }).join(', ')}\n\n`;
      markdown += `---\n\n`;

      for (const utterance of utterances) {
        let speakerName: string;

        if (utterance.participantId === 'host') {
          speakerName = '**Host**';
        } else {
          const participant = participants.find(p => p.id === utterance.participantId);
          const persona = participant ? personas.find(per => per.id === participant.personaId) : null;
          speakerName = `**${participant?.displayNameOverride || persona?.name || 'Unknown'}**`;
        }

        markdown += `${speakerName}:\n\n${utterance.content}\n\n`;

        if (utterance.isKeyPoint) {
          markdown += `> 📌 Key Point\n\n`;
        }

        if (utterance.topicMarker) {
          markdown += `*[Topic: ${utterance.topicMarker}]*\n\n`;
        }

        markdown += `---\n\n`;
      }

      // Set response headers for download
      const format = req.query.format || 'json';
      if (format === 'md') {
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="conversation-${id}.md"`);
        res.send(markdown);
      } else {
        res.json({
          sessionId: id,
          topic: session.topic,
          markdown,
          utteranceCount: utterances.length,
        });
      }
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to export transcript');
      next(error);
    }
  });

  /**
   * GET /api/conversations/sessions/:id/utterances
   * Get paginated utterances
   */
  router.get('/sessions/:id/utterances', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const utterances = await utteranceRepo.findBySessionId(id, limit, offset);
      const total = await utteranceRepo.countBySessionId(id);

      res.json({
        utterances,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + utterances.length < total,
        },
      });
    } catch (error) {
      logger.error({ error, sessionId: req.params.id }, 'Failed to get utterances');
      next(error);
    }
  });

  return router;
}
```

### Update Route Registration

Update `backend/src/routes/index.ts`:

```typescript
import { createConversationRoutes } from './conversation-routes.js';
import { sseManager } from '../services/sse/sse-manager.js';

// Pass SSE manager to conversation routes
app.use('/api/conversations', createConversationRoutes(pool, sseManager));
```

---

## Validation

### How to Test

1. Launch a conversation:
   ```bash
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/launch
   ```

2. Connect to SSE stream:
   ```bash
   curl -N http://localhost:3000/api/conversations/sessions/{id}/stream
   ```

3. Control conversation (in manual mode):
   ```bash
   # Advance
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/advance

   # Pause
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/pause

   # Resume
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/resume

   # Change flow mode
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/flow-mode \
     -H "Content-Type: application/json" \
     -d '{"mode": "auto_stream"}'
   ```

4. Export transcript:
   ```bash
   # As JSON
   curl http://localhost:3000/api/conversations/sessions/{id}/transcript

   # As markdown file
   curl http://localhost:3000/api/conversations/sessions/{id}/transcript?format=md
   ```

### Definition of Done

- [ ] Launch endpoint creates and starts orchestrator
- [ ] Advance endpoint works in manual mode
- [ ] Pause/resume work correctly
- [ ] Flow mode can be changed during conversation
- [ ] SSE stream delivers all events
- [ ] Transcript export produces valid markdown
- [ ] Context board state retrievable
- [ ] Active orchestrators tracked in memory
- [ ] Orchestrators cleaned up on completion/error
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-010 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
