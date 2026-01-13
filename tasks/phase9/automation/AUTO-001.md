# AUTO-001: Job Queue Infrastructure & Database Schema

**Task ID:** AUTO-001
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** None
**Status:** Ready

---

## Context

ClearSide needs fully automatic podcast publishing that triggers when conversations complete. This task establishes the job queue infrastructure and database foundation for the automation pipeline.

**References:**
- Automation plan in `C:\Users\Steven\.claude\plans\lovely-coalescing-valley.md`
- Existing podcast pipeline: `backend/src/services/podcast/podcast-pipeline.ts`
- Existing database patterns: `backend/src/db/`
- Migration naming convention: 3-digit zero-padded (NNN_description.sql)

---

## Requirements

### Acceptance Criteria

- [ ] Install BullMQ, ioredis, @bull-board/* dependencies
- [ ] Create database migration for `published_episodes` table
- [ ] Create database migration for `podcast_feed_metadata` table
- [ ] Create `queue-manager.ts` for BullMQ initialization
- [ ] Export `publishQueue` for use in orchestrator
- [ ] Create basic worker shell structure
- [ ] Add environment variables for Redis connection
- [ ] Test: Job can be queued and picked up by worker

### Functional Requirements

**Job Queue:**
- Uses BullMQ with Redis backend
- Supports automatic retries with exponential backoff
- Job persistence across server restarts
- Progress tracking and monitoring

**Published Episodes Table:**
- Tracks all published podcast episodes
- Links to podcast export jobs and conversation sessions
- Stores auto-generated metadata (title, description, tags)
- RSS feed fields (GUID, pub_date, audio_url, duration, file size)
- Distribution tracking timestamps

**Podcast Feed Metadata Table:**
- Single-row global configuration for podcast show
- Required fields for Apple Podcasts compliance
- iTunes/Podcast 2.0 namespace support

---

## Implementation

### 1. Install Dependencies

**Command:**
```bash
cd backend
npm install bullmq ioredis @bull-board/express @bull-board/api
```

### 2. Migration 030: Published Episodes Table

**File:** `backend/src/db/migrations/030_add_published_episodes.sql`

```sql
-- Migration 030: Add Published Episodes Table
-- Tracks all published podcast episodes for RSS feed generation

CREATE TABLE IF NOT EXISTS published_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_job_id UUID NOT NULL REFERENCES podcast_export_jobs(id) ON DELETE CASCADE,
  conversation_session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL,

  -- Auto-generated metadata
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[],
  explicit BOOLEAN DEFAULT false,

  -- RSS feed fields
  guid VARCHAR(255) UNIQUE NOT NULL,
  pub_date TIMESTAMP WITH TIME ZONE NOT NULL,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  file_size_bytes BIGINT NOT NULL,

  -- Distribution tracking
  rss_published_at TIMESTAMP WITH TIME ZONE,
  spotify_indexed_at TIMESTAMP WITH TIME ZONE, -- Manual tracking

  -- Notification tracking
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  notification_recipient VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_published_episodes_podcast_job ON published_episodes(podcast_job_id);
CREATE INDEX idx_published_episodes_conversation ON published_episodes(conversation_session_id);
CREATE INDEX idx_published_episodes_pub_date ON published_episodes(pub_date DESC);
CREATE INDEX idx_published_episodes_guid ON published_episodes(guid);

-- Create updated_at trigger
CREATE TRIGGER update_published_episodes_updated_at
  BEFORE UPDATE ON published_episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE published_episodes IS 'Published podcast episodes for RSS feed generation and distribution tracking';
```

### 3. Migration 031: Podcast Feed Metadata Table

**File:** `backend/src/db/migrations/031_add_podcast_feed_metadata.sql`

```sql
-- Migration 031: Add Podcast Feed Metadata Table
-- Global podcast show configuration (single row)

CREATE TABLE IF NOT EXISTS podcast_feed_metadata (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'ClearSide Debates',
  description TEXT NOT NULL DEFAULT 'AI-powered structured reasoning and live debates',
  author VARCHAR(255) NOT NULL DEFAULT 'ClearSide',
  email VARCHAR(255),
  language VARCHAR(10) NOT NULL DEFAULT 'en-us',
  categories TEXT[] DEFAULT ARRAY['Technology', 'Education', 'News'],
  image_url TEXT NOT NULL, -- 1400x1400 minimum for Apple Podcasts
  website_url TEXT,
  feed_url TEXT NOT NULL,
  copyright VARCHAR(255),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Single row constraint (only one podcast feed config allowed)
CREATE UNIQUE INDEX idx_single_feed_metadata ON podcast_feed_metadata((true));

-- Create updated_at trigger
CREATE TRIGGER update_podcast_feed_metadata_updated_at
  BEFORE UPDATE ON podcast_feed_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration
INSERT INTO podcast_feed_metadata (
  title,
  description,
  feed_url,
  image_url,
  email,
  copyright
) VALUES (
  'ClearSide Debates',
  'AI-powered structured reasoning and live debates exploring complex topics through conversational podcasts',
  'https://clearside.app/rss/podcast.xml',
  'https://clearside.app/artwork.jpg', -- USER MUST CREATE: 1400x1400 JPEG/PNG
  'steve.d.pennington@gmail.com',
  'Copyright © 2026 ClearSide'
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE podcast_feed_metadata IS 'Global podcast show configuration for RSS feed (single row only)';
```

### 4. Queue Manager

**File:** `backend/src/services/queue/queue-manager.ts` (new)

```typescript
/**
 * Queue Manager
 *
 * Initializes BullMQ connection and defines job queues for podcast automation.
 */

import { Queue, QueueOptions } from 'bullmq';
import { createClient } from 'redis';
import pino from 'pino';

const logger = pino({
  name: 'queue-manager',
  level: process.env.LOG_LEVEL || 'info',
});

// Redis connection configuration
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const connection = {
  host: new URL(redisUrl).hostname,
  port: parseInt(new URL(redisUrl).port || '6379'),
  password: new URL(redisUrl).password || undefined,
};

// Queue options with automatic retry configuration
const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 7 * 24 * 3600, // Keep completed jobs for 7 days
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 30 * 24 * 3600, // Keep failed jobs for 30 days
    },
  },
};

/**
 * Podcast Publishing Queue
 *
 * Handles automated podcast publishing jobs:
 * - auto-publish-conversation: Full pipeline from conversation completion
 * - generate-metadata: LLM-based metadata generation
 * - update-rss-feed: Regenerate RSS feed
 * - send-notification: Email notifications
 */
export const publishQueue = new Queue('podcast-publish', queueOptions);

logger.info({
  queueName: 'podcast-publish',
  redisHost: connection.host,
  redisPort: connection.port,
}, 'Queue initialized');

/**
 * Graceful shutdown
 */
export async function closeQueues(): Promise<void> {
  await publishQueue.close();
  logger.info('Queues closed');
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queues');
  await closeQueues();
});
```

### 5. Basic Worker Shell

**File:** `backend/src/services/queue/workers/publish-worker.ts` (new - shell only)

```typescript
/**
 * Publish Worker
 *
 * Worker process for podcast publishing automation jobs.
 * Full implementation in AUTO-004.
 */

import { Worker, Job } from 'bullmq';
import { connection, publishQueue } from '../queue-manager.js';
import pino from 'pino';

const logger = pino({
  name: 'publish-worker',
  level: process.env.LOG_LEVEL || 'info',
});

export const publishWorker = new Worker(
  'podcast-publish',
  async (job: Job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Processing job');

    switch (job.name) {
      case 'auto-publish-conversation':
        // TODO: Implement in AUTO-004
        logger.info('auto-publish-conversation job - implementation pending');
        return { success: true, message: 'Worker shell active' };

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 3, // Process 3 jobs in parallel
  }
);

publishWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

publishWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
});

logger.info('Publish worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker');
  await publishWorker.close();
});
```

### 6. Environment Variables

**Add to `backend/.env`:**

```bash
# Redis (for BullMQ job queue)
REDIS_URL=redis://localhost:6379
# Production (Railway auto-sets this): redis://default:password@redis.railway.internal:6379

# Automation
AUTO_PUBLISH_ENABLED=true

# Podcast Feed
PODCAST_FEED_URL=https://clearside.app/rss/podcast.xml
PODCAST_ARTWORK_URL=https://clearside.app/artwork.jpg
```

---

## Testing

### Test 1: Database Migrations

```bash
# Apply migrations
cd backend
npm run migrate

# Verify tables exist
psql $DATABASE_URL -c "\d published_episodes"
psql $DATABASE_URL -c "\d podcast_feed_metadata"
psql $DATABASE_URL -c "SELECT * FROM podcast_feed_metadata;"
```

### Test 2: Queue Connection

```typescript
// Test script: backend/src/test-queue.ts
import { publishQueue } from './services/queue/queue-manager.js';

async function testQueue() {
  // Add test job
  const job = await publishQueue.add('test-job', {
    message: 'Hello from queue',
  });

  console.log('Job added:', job.id);

  // Check job status
  const status = await job.getState();
  console.log('Job status:', status);
}

testQueue().catch(console.error);
```

### Test 3: Worker Picks Up Job

```bash
# Terminal 1: Start worker
npm run worker

# Terminal 2: Queue a job
node -e "import('./src/test-queue.js')"
```

---

## Definition of Done

- [ ] Dependencies installed successfully
- [ ] Both database migrations applied without errors
- [ ] `published_episodes` table exists with correct schema
- [ ] `podcast_feed_metadata` table exists with default row
- [ ] Queue manager exports `publishQueue`
- [ ] Worker shell starts without errors
- [ ] Test job can be queued and picked up by worker
- [ ] Environment variables documented

---

## Notes

**Redis Setup for Development:**

```bash
# Option 1: Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Option 2: Railway (Production)
# 1. Add Redis database in Railway dashboard
# 2. Railway auto-sets REDIS_URL environment variable
```

**Cost:** Redis on Railway free tier (100MB) is sufficient for job queue.
