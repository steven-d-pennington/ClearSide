/**
 * Queue Manager
 *
 * Initializes BullMQ connection and defines job queues for podcast automation.
 */

import { Queue, type QueueOptions } from 'bullmq';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'QueueManager' });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

function parseRedisUrl(url: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
} {
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : 6379;

  return {
    host: parsed.hostname,
    port,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
  };
}

export const connection = parseRedisUrl(redisUrl);

const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 7 * 24 * 3600,
      count: 100,
    },
    removeOnFail: {
      age: 30 * 24 * 3600,
    },
  },
};

/**
 * Podcast Publishing Queue
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

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing queues');
  await closeQueues();
});
