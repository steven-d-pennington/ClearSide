# AUTO-006: Hook Orchestrator & Admin Tools

**Task ID:** AUTO-006
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P0
**Estimated Effort:** M (4-5 hours)
**Dependencies:** AUTO-001, AUTO-004
**Status:** Ready

---

## Context

This task connects the automation pipeline to the conversation orchestrator, adds admin endpoints for monitoring and manual control, and optionally sets up Bull Board UI for queue monitoring.

**References:**
- Orchestrator: `backend/src/services/conversation/conversational-orchestrator.ts`
- Queue manager from AUTO-001
- Worker from AUTO-004

---

## Requirements

### Acceptance Criteria

- [ ] Hook automation trigger into conversational-orchestrator.ts
- [ ] Queue job when conversation completes (if AUTO_PUBLISH_ENABLED=true)
- [ ] Create admin routes: regenerate RSS, view queue stats, retry failed jobs
- [ ] Add Bull Board UI for queue monitoring (optional)
- [ ] Register routes in index.ts
- [ ] Test: Conversation complete → job queued → RSS updated
- [ ] Environment variable: AUTO_PUBLISH_ENABLED

### Functional Requirements

**Orchestrator Hook:**
- Triggered after conversation marked complete
- Non-blocking (async queue, doesn't wait)
- Only if AUTO_PUBLISH_ENABLED=true
- Logs job ID for tracking

**Admin Endpoints:**
- POST /admin/rss/regenerate - Force regenerate RSS feed
- GET /admin/queue/stats - View job queue statistics
- POST /admin/queue/retry/:jobId - Retry failed job
- GET /admin/queue/ui - Bull Board dashboard

---

## Implementation

### 1. Hook Orchestrator

**File:** `backend/src/services/conversation/conversational-orchestrator.ts`

**Location:** Line ~369, after `sessionRepo.complete()` call in `start()` method

**Add this code:**

```typescript
// Mark complete
const duration = Date.now() - this.startTime;
await this.sessionRepo.complete(this.sessionId, duration);

// NEW: Trigger publishing automation (non-blocking)
if (process.env.AUTO_PUBLISH_ENABLED === 'true') {
  try {
    const { publishQueue } = await import('../queue/queue-manager.js');
    const job = await publishQueue.add('auto-publish-conversation', {
      sessionId: this.sessionId,
      conversationMode: this.session!.rapidFire ? 'rapid_fire' :
                        this.session!.minimalPersonaMode ? 'model_debate' :
                        'normal',
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    logger.info({
      sessionId: this.sessionId,
      jobId: job.id,
    }, 'Auto-publish job queued');
  } catch (error: any) {
    // Don't fail conversation completion if queueing fails
    logger.error({
      sessionId: this.sessionId,
      error: error.message,
    }, 'Failed to queue auto-publish job');
  }
}

this.broadcastEvent('conversation_completed', {
  sessionId: this.sessionId,
  turnCount: this.turnCount,
  duration,
});
```

### 2. Admin Routes

**File:** `backend/src/routes/admin-routes.ts` (new)

```typescript
/**
 * Admin Routes
 *
 * Administrative endpoints for podcast automation management.
 */

import { Router, Request, Response } from 'express';
import { createRSSFeedService } from '../services/podcast/rss-feed-service.js';
import { publishQueue } from '../services/queue/queue-manager.js';
import pino from 'pino';

const logger = pino({
  name: 'admin-routes',
  level: process.env.LOG_LEVEL || 'info',
});

export function createAdminRoutes(): Router {
  const router = Router();
  const rssService = createRSSFeedService();

  /**
   * POST /admin/rss/regenerate
   * Force regenerate RSS feed from database
   */
  router.post('/rss/regenerate', async (req: Request, res: Response) => {
    try {
      await rssService.generateFeed();

      logger.info('RSS feed regenerated manually');

      res.json({
        success: true,
        message: 'RSS feed regenerated successfully',
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to regenerate RSS feed');
      res.status(500).json({
        error: 'Failed to regenerate RSS feed',
        message: error.message,
      });
    }
  });

  /**
   * GET /admin/queue/stats
   * View job queue statistics
   */
  router.get('/queue/stats', async (req: Request, res: Response) => {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        publishQueue.getWaitingCount(),
        publishQueue.getActiveCount(),
        publishQueue.getCompletedCount(),
        publishQueue.getFailedCount(),
        publishQueue.getDelayedCount(),
      ]);

      res.json({
        queue: 'podcast-publish',
        counts: {
          waiting,
          active,
          completed,
          failed,
          delayed,
        },
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get queue stats');
      res.status(500).json({
        error: 'Failed to get queue stats',
        message: error.message,
      });
    }
  });

  /**
   * POST /admin/queue/retry/:jobId
   * Retry a failed job
   */
  router.post('/queue/retry/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const job = await publishQueue.getJob(jobId);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      await job.retry();

      logger.info({ jobId }, 'Job retry triggered');

      res.json({
        success: true,
        message: `Job ${jobId} queued for retry`,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to retry job');
      res.status(500).json({
        error: 'Failed to retry job',
        message: error.message,
      });
    }
  });

  /**
   * GET /admin/queue/failed
   * List failed jobs
   */
  router.get('/queue/failed', async (req: Request, res: Response) => {
    try {
      const failed = await publishQueue.getFailed(0, 50);

      const jobs = failed.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      }));

      res.json({
        count: jobs.length,
        jobs,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to list failed jobs');
      res.status(500).json({
        error: 'Failed to list failed jobs',
        message: error.message,
      });
    }
  });

  return router;
}
```

### 3. Bull Board UI (Optional)

**File:** `backend/src/index.ts` (modify)

Add Bull Board for visual queue monitoring:

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { publishQueue } from './services/queue/queue-manager.js';

// ... existing code ...

// Bull Board setup (optional, for monitoring)
if (process.env.NODE_ENV === 'development' || process.env.ENABLE_BULL_BOARD === 'true') {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queue/ui');

  createBullBoard({
    queues: [new BullMQAdapter(publishQueue)],
    serverAdapter,
  });

  app.use('/admin/queue/ui', serverAdapter.getRouter());

  logger.info('Bull Board UI available at /admin/queue/ui');
}
```

### 4. Register Admin Routes

**File:** `backend/src/index.ts` (modify)

```typescript
import { createAdminRoutes } from './routes/admin-routes.js';

// ... existing routes ...

// Register admin routes
app.use('/admin', createAdminRoutes());
```

### 5. Initialize Worker

**File:** `backend/src/index.ts` (modify)

Start the worker when server starts:

```typescript
import './services/queue/workers/publish-worker.js'; // Automatically starts worker

logger.info('Publish worker initialized');
```

---

## Testing

### Test 1: Conversation Triggers Automation

```bash
# 1. Set environment variable
export AUTO_PUBLISH_ENABLED=true

# 2. Start backend with worker
npm run dev

# 3. Create and complete a conversation
# (via UI or API)

# 4. Check logs for:
# "Auto-publish job queued"

# 5. Check worker logs for progress:
# "Processing job"
# "Job completed"

# 6. Verify RSS feed updated:
curl http://localhost:3001/api/rss/podcast.xml
```

### Test 2: Admin Endpoints

```bash
# View queue stats
curl http://localhost:3001/admin/queue/stats

# Expected response:
# {
#   "queue": "podcast-publish",
#   "counts": {
#     "waiting": 0,
#     "active": 1,
#     "completed": 5,
#     "failed": 0,
#     "delayed": 0
#   }
# }

# Regenerate RSS feed manually
curl -X POST http://localhost:3001/admin/rss/regenerate

# List failed jobs
curl http://localhost:3001/admin/queue/failed
```

### Test 3: Bull Board UI

```bash
# Visit in browser:
http://localhost:3001/admin/queue/ui

# Should see:
# - Job queue dashboard
# - Active, waiting, completed, failed jobs
# - Job details and logs
```

---

## Definition of Done

- [ ] Orchestrator hook added (line ~369)
- [ ] Job queued when conversation completes
- [ ] AUTO_PUBLISH_ENABLED environment variable works
- [ ] Admin routes created and registered
- [ ] RSS regenerate endpoint works
- [ ] Queue stats endpoint works
- [ ] Retry failed job endpoint works
- [ ] Bull Board UI accessible (optional)
- [ ] Worker initialized on server start
- [ ] End-to-end test: conversation → RSS update

---

## Notes

**Environment Variables:**

```bash
# Enable automation
AUTO_PUBLISH_ENABLED=true

# Enable Bull Board UI (optional)
ENABLE_BULL_BOARD=true
```

**Security:**
- Admin routes should be protected with authentication in production
- Bull Board UI should be restricted to admins only
- Consider adding API key or JWT middleware

**Monitoring:**
- Bull Board UI provides visual queue monitoring
- Admin endpoints allow programmatic queue management
- Failed jobs can be retried manually

**Production Deployment:**
- Worker can run in same process (current setup)
- Or separate worker process for scalability (future enhancement)
- Redis on Railway handles job persistence
