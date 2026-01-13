# AUTO-004: Publish Worker & Orchestration

**Task ID:** AUTO-004
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P0
**Estimated Effort:** L (6-8 hours)
**Dependencies:** AUTO-001, AUTO-002, AUTO-003
**Status:** Ready

---

## Context

The publish worker is the heart of the automation system. It coordinates the entire pipeline: script refinement → TTS audio generation → metadata generation → RSS feed update → email notification. This worker processes the `auto-publish-conversation` job queued when conversations complete.

**References:**
- Existing podcast pipeline: `backend/src/services/podcast/podcast-pipeline.ts`
- Conversation script refiner: `backend/src/services/podcast/conversation-script-refiner.ts`
- Queue manager from AUTO-001
- Metadata generator from AUTO-002
- RSS service from AUTO-003

---

## Requirements

### Acceptance Criteria

- [ ] Implement `handleAutoPublish()` function in publish-worker
- [ ] Coordinate: script refine → audio generate → metadata → RSS → notify
- [ ] Progress tracking (0% → 100% in steps)
- [ ] Error handling with retries
- [ ] Insert into `published_episodes` table
- [ ] Test: Full pipeline from conversation completion
- [ ] Cost tracking per episode

### Functional Requirements

**Pipeline Steps:**
1. Create export job (10%)
2. Refine script with LLM (30%)
3. Generate TTS audio (70%)
4. Generate metadata (80%)
5. Update RSS feed (90%)
6. Send notification (100%)

**Error Handling:**
- Each step wrapped in try-catch
- Failed steps logged with context
- BullMQ retries job 3 times with backoff
- Partial cost tracked even on failure

---

## Implementation

### 1. Complete Publish Worker

**File:** `backend/src/services/queue/workers/publish-worker.ts` (expand shell from AUTO-001)

```typescript
/**
 * Publish Worker - Full Implementation
 *
 * Orchestrates end-to-end podcast publishing automation.
 */

import { Worker, Job } from 'bullmq';
import { connection } from '../queue-manager.js';
import pino from 'pino';
import { pool } from '../../../db/connection.js';
import { createConversationScriptRefiner } from '../../podcast/conversation-script-refiner.js';
import { createPodcastPipeline } from '../../podcast/podcast-pipeline.js';
import { createMetadataGenerator } from '../../podcast/metadata-generator.js';
import { createRSSFeedService } from '../../podcast/rss-feed-service.js';
import { createNotificationService } from '../../notifications/notification-service.js';

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
        return await handleAutoPublish(job);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 3, // Process 3 jobs in parallel
  }
);

/**
 * Handle auto-publish-conversation job
 */
async function handleAutoPublish(job: Job) {
  const { sessionId, conversationMode } = job.data;

  job.log(`Starting auto-publish pipeline for session ${sessionId}`);
  await job.updateProgress(0);

  try {
    // Step 1: Load conversation session (5%)
    job.log('Loading conversation session');
    const sessionResult = await pool.query(
      'SELECT * FROM conversation_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Conversation session not found: ${sessionId}`);
    }

    const session = sessionResult.rows[0];
    await job.updateProgress(5);

    // Step 2: Load conversation utterances (10%)
    job.log('Loading conversation transcript');
    const utterancesResult = await pool.query(
      `SELECT * FROM conversation_utterances
       WHERE session_id = $1
       ORDER BY timestamp_ms ASC`,
      [sessionId]
    );

    const utterances = utterancesResult.rows;
    await job.updateProgress(10);

    // Step 3: Create export job (15%)
    job.log('Creating podcast export job');
    const exportJobResult = await pool.query(
      `INSERT INTO podcast_export_jobs (
        conversation_session_id, config, status
      ) VALUES ($1, $2, 'pending') RETURNING id`,
      [
        sessionId,
        JSON.stringify({
          ttsProvider: 'google-cloud-long',
          refinementModel: 'google/gemini-flash-1.5',
          rapidFire: conversationMode === 'rapid_fire',
          includeIntro: true,
          includeOutro: true,
          addTransitions: true,
        }),
      ]
    );

    const exportJobId = exportJobResult.rows[0].id;
    await job.updateProgress(15);

    // Step 4: Refine script (30%)
    job.log('Refining conversation script');
    const refiner = createConversationScriptRefiner({
      model: 'google/gemini-flash-1.5',
      rapidFire: conversationMode === 'rapid_fire',
    });

    const transcript = buildTranscriptFromUtterances(utterances);
    const refinedScript = await refiner.refineConversationTranscript(
      sessionId,
      transcript
    );

    // Save refined script
    await pool.query(
      `UPDATE podcast_export_jobs
       SET refined_script = $1, status = 'pending'
       WHERE id = $2`,
      [JSON.stringify(refinedScript), exportJobId]
    );

    await job.updateProgress(30);

    // Step 5: Generate TTS audio (70%)
    job.log('Generating TTS audio (this may take several minutes)');
    const pipeline = createPodcastPipeline({
      ttsProvider: 'google-cloud-long',
      pool,
    });

    const audioResult = await pipeline.generate(exportJobId);

    if (!audioResult.success) {
      throw new Error(`Audio generation failed: ${audioResult.error}`);
    }

    await job.updateProgress(70);

    // Step 6: Load participant names (75%)
    job.log('Loading participant metadata');
    const participantsResult = await pool.query(
      `SELECT cp.id, cp.display_name_override, pp.name
       FROM conversation_participants cp
       JOIN podcast_personas pp ON cp.persona_id = pp.id
       WHERE cp.session_id = $1`,
      [sessionId]
    );

    const participantNames = participantsResult.rows.map(
      (p) => p.display_name_override || p.name
    );

    await job.updateProgress(75);

    // Step 7: Generate metadata (80%)
    job.log('Generating episode metadata');
    const metadataGenerator = createMetadataGenerator();
    const metadata = await metadataGenerator.generateMetadata({
      topic: session.topic,
      participants: participantNames,
      mode: conversationMode,
      script: refinedScript,
    });

    await job.updateProgress(80);

    // Step 8: Insert published episode (85%)
    job.log('Creating published episode record');
    const episodeResult = await pool.query(
      `INSERT INTO published_episodes (
        podcast_job_id, conversation_session_id,
        title, description, tags, explicit,
        guid, pub_date, audio_url, duration_seconds, file_size_bytes,
        rss_published_at, notification_recipient
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, NOW(), $11)
      RETURNING id`,
      [
        exportJobId,
        sessionId,
        metadata.title,
        metadata.description,
        metadata.tags,
        metadata.explicit,
        `clearside-episode-${exportJobId}`, // GUID
        audioResult.audioUrl,
        audioResult.durationSeconds,
        audioResult.fileSize,
        process.env.NOTIFICATION_EMAIL,
      ]
    );

    const episodeId = episodeResult.rows[0].id;
    await job.updateProgress(85);

    // Step 9: Update RSS feed (90%)
    job.log('Regenerating RSS feed');
    const rssService = createRSSFeedService();
    await rssService.generateFeed();
    await job.updateProgress(90);

    // Step 10: Send notification (100%)
    job.log('Sending notification email');
    const notificationService = createNotificationService();
    await notificationService.sendEpisodePublishedEmail({
      recipientEmail: process.env.NOTIFICATION_EMAIL!,
      episodeTitle: metadata.title,
      episodeDescription: metadata.description,
      episodeUrl: `https://clearside.app${audioResult.audioUrl}`,
      rssFeedUrl: process.env.PODCAST_FEED_URL || 'https://clearside.app/rss/podcast.xml',
    });

    // Update notification timestamp
    await pool.query(
      `UPDATE published_episodes
       SET notification_sent_at = NOW()
       WHERE id = $1`,
      [episodeId]
    );

    await job.updateProgress(100);

    job.log('Auto-publish complete!');
    return {
      success: true,
      exportJobId,
      episodeId,
      audioUrl: audioResult.audioUrl,
      cost: audioResult.cost || 0,
    };

  } catch (error: any) {
    job.log(`ERROR: ${error.message}`);
    logger.error({
      error: error.message,
      stack: error.stack,
      sessionId,
    }, 'Auto-publish failed');
    throw error; // BullMQ will retry based on job settings
  }
}

/**
 * Build transcript from conversation utterances
 */
function buildTranscriptFromUtterances(utterances: any[]): string {
  return utterances
    .map((u) => {
      const speaker = u.is_host_utterance ? 'Host' : `Participant ${u.participant_id}`;
      return `${speaker}: ${u.content}`;
    })
    .join('\n\n');
}

// Worker event handlers
publishWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, result: job.returnvalue }, 'Job completed');
});

publishWorker.on('failed', (job, err) => {
  logger.error({
    jobId: job?.id,
    error: err.message,
    stack: err.stack,
  }, 'Job failed');
});

publishWorker.on('progress', (job, progress) => {
  logger.info({ jobId: job.id, progress: `${progress}%` }, 'Job progress');
});

logger.info('Publish worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker');
  await publishWorker.close();
});
```

---

## Testing

### Test 1: Full Pipeline

```typescript
// Queue a test job
import { publishQueue } from '../queue-manager.js';

const job = await publishQueue.add('auto-publish-conversation', {
  sessionId: 'test-session-id',
  conversationMode: 'normal',
});

console.log('Job queued:', job.id);

// Monitor progress
job.on('progress', (progress) => {
  console.log(`Progress: ${progress}%`);
});

const result = await job.waitUntilFinished();
console.log('Result:', result);
```

### Test 2: Error Handling

```typescript
// Test with invalid session ID
const job = await publishQueue.add('auto-publish-conversation', {
  sessionId: 'invalid-session',
  conversationMode: 'normal',
});

// Should retry 3 times, then fail
```

### Test 3: Progress Tracking

```bash
# Terminal 1: Start worker
npm run worker

# Terminal 2: Queue job and watch logs
# Should see progress: 0% → 5% → 10% → ... → 100%
```

---

## Definition of Done

- [ ] Full pipeline implemented in `handleAutoPublish()`
- [ ] All 10 steps coordinate correctly
- [ ] Progress tracking at each step
- [ ] Error handling with meaningful logs
- [ ] Inserts into `published_episodes` table
- [ ] RSS feed regenerated
- [ ] Notification sent
- [ ] End-to-end test passes
- [ ] Cost tracked per episode

---

## Notes

**Performance:**
- TTS generation is the slowest step (2-5 minutes)
- Script refinement takes ~10-20 seconds
- Metadata generation takes ~5-10 seconds
- RSS regeneration takes <1 second

**Total Time:** 3-7 minutes per episode (mostly TTS)

**Cost Breakdown:**
- TTS: $0.64 (normal) / $0.16 (rapid fire)
- Script refinement: ~$0.02
- Metadata: ~$0.01
- Total: ~$0.67 per episode
