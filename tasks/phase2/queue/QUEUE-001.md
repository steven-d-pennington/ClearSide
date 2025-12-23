# QUEUE-001: BullMQ Job Queue Setup

**Task ID:** QUEUE-001
**Phase:** Phase 2
**Category:** Queue & Processing
**Priority:** P1
**Estimated Effort:** 3 days
**Dependencies:** None
**Status:** TO DO

---

## Overview

Set up BullMQ job queue with Redis for async export processing (PDF, audio, video). Handle job scheduling, retries, progress tracking, and failure recovery.

---

## Objectives

1. BullMQ and Redis setup
2. Job queues for each export type
3. Worker processes
4. Progress tracking
5. Retry and error handling
6. Job status API

---

## Technical Specification

```typescript
// src/services/queue/queueManager.ts

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

export const exportQueue = new Queue('exports', { connection });

export const exportWorker = new Worker(
  'exports',
  async (job: Job) => {
    const { type, debateOutput, options } = job.data;

    switch (type) {
      case 'pdf':
        return await processPDFExport(job);
      case 'audio':
        return await processAudioExport(job);
      case 'video':
        return await processVideoExport(job);
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

exportWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

exportWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
```

---

**Last Updated:** 2025-12-23
