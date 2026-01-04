# DUELOGIC-004: Research Job Scheduler

**Task ID:** DUELOGIC-004
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P1
**Estimated Effort:** M (4-8 hours)
**Dependencies:** DUELOGIC-001, DUELOGIC-002, DUELOGIC-003
**Status:** Ready

---

## Context

The Research Job Scheduler automates the discovery and episode generation pipeline. It runs research jobs on configurable schedules (e.g., every Monday and Thursday at 6 AM), orchestrating the full flow from Perplexity research to episode proposal generation.

This enables hands-off operation where fresh episode proposals appear regularly for admin review.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Scheduled Research
- [node-cron documentation](https://github.com/node-cron/node-cron)
- Existing background job patterns in the codebase

---

## Requirements

### Acceptance Criteria

- [ ] Create `ResearchJobScheduler` class with cron-based scheduling
- [ ] Implement job queue for research execution
- [ ] Track token usage and costs per job
- [ ] Support manual job triggering via API
- [ ] Handle concurrent job prevention (only one job at a time)
- [ ] Implement job timeout handling
- [ ] Add graceful shutdown for in-progress jobs
- [ ] Emit events for job progress monitoring
- [ ] Write unit tests for scheduler operations

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- Run research jobs on configurable schedules (daily, weekly)
- Support multiple research configurations
- Track job execution with statistics
- Handle failures gracefully with retry logic
- Emit progress events for monitoring

---

## Implementation Guide

### Dependencies

```bash
npm install node-cron @types/node-cron
```

### Scheduler Service

```typescript
// backend/src/services/research/research-job-scheduler.ts

import cron, { ScheduledTask } from 'node-cron';
import { EventEmitter } from 'events';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { EpisodeProposalRepository } from '../../db/repositories/episode-proposal-repository.js';
import { DuelogicResearchService } from './duelogic-research-service.js';
import { EpisodeGenerator } from './episode-generator.js';
import { EpisodeBatchProcessor } from './episode-batch-processor.js';
import { ResearchConfig, ResearchJob } from '../../types/duelogic-research.js';
import { logger } from '../../utils/logger.js';

interface SchedulerEvents {
  'job:started': (job: ResearchJob) => void;
  'job:progress': (job: ResearchJob, phase: string, progress: number) => void;
  'job:completed': (job: ResearchJob, stats: JobStats) => void;
  'job:failed': (job: ResearchJob, error: Error) => void;
}

interface JobStats {
  topicsDiscovered: number;
  episodesGenerated: number;
  tokensUsed: number;
  durationMs: number;
  estimatedCostCents: number;
}

interface SchedulerConfig {
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrentJobs: 1,
  jobTimeoutMs: 30 * 60 * 1000, // 30 minutes
  retryAttempts: 2,
  retryDelayMs: 60 * 1000, // 1 minute
};

export class ResearchJobScheduler extends EventEmitter {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private activeJobs: Map<string, ResearchJob> = new Map();
  private config: SchedulerConfig;
  private isShuttingDown = false;

  constructor(
    private researchRepo: ResearchRepository,
    private proposalRepo: EpisodeProposalRepository,
    private researchService: DuelogicResearchService,
    private episodeGenerator: EpisodeGenerator,
    config?: Partial<SchedulerConfig>
  ) {
    super();
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * Initialize scheduler with all enabled research configs
   */
  async initialize(): Promise<void> {
    const configs = await this.researchRepo.findEnabledConfigs();

    for (const config of configs) {
      this.scheduleConfig(config);
    }

    logger.info(`Research scheduler initialized with ${configs.length} configs`);
  }

  /**
   * Schedule a research config to run on its cron schedule
   */
  scheduleConfig(config: ResearchConfig): void {
    if (this.scheduledTasks.has(config.id)) {
      // Cancel existing schedule
      this.scheduledTasks.get(config.id)?.stop();
    }

    if (!config.enabled) {
      logger.info(`Config ${config.name} is disabled, not scheduling`);
      return;
    }

    if (!cron.validate(config.schedule)) {
      logger.error(`Invalid cron schedule for config ${config.name}: ${config.schedule}`);
      return;
    }

    const task = cron.schedule(config.schedule, async () => {
      await this.runJob(config.id);
    }, {
      scheduled: true,
      timezone: 'UTC',
    });

    this.scheduledTasks.set(config.id, task);
    logger.info(`Scheduled config ${config.name} with schedule: ${config.schedule}`);
  }

  /**
   * Unschedule a research config
   */
  unscheduleConfig(configId: string): void {
    const task = this.scheduledTasks.get(configId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(configId);
      logger.info(`Unscheduled config ${configId}`);
    }
  }

  /**
   * Run a research job immediately (manual trigger)
   */
  async runJob(configId: string): Promise<ResearchJob> {
    if (this.isShuttingDown) {
      throw new Error('Scheduler is shutting down');
    }

    if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
      throw new Error('Maximum concurrent jobs reached');
    }

    const config = await this.researchRepo.findConfigById(configId);
    if (!config) {
      throw new Error(`Config ${configId} not found`);
    }

    // Create job record
    const job = await this.researchRepo.createJob(configId);
    this.activeJobs.set(job.id, job);

    // Run job with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Job timed out')), this.config.jobTimeoutMs);
    });

    try {
      const result = await Promise.race([
        this.executeJob(job, config),
        timeoutPromise,
      ]);

      return result;
    } catch (error: any) {
      await this.researchRepo.failJob(job.id, error.message);
      this.emit('job:failed', job, error);
      throw error;
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Execute the research job
   */
  private async executeJob(job: ResearchJob, config: ResearchConfig): Promise<ResearchJob> {
    const startTime = Date.now();

    // Start job
    await this.researchRepo.startJob(job.id);
    this.emit('job:started', job);
    logger.info(`Started research job ${job.id} for config ${config.name}`);

    // Phase 1: Discover topics
    this.emit('job:progress', job, 'discovering', 0);

    const researchResults = await this.researchService.discoverTopics(config, job.id);
    const topicsDiscovered = researchResults.length;

    this.emit('job:progress', job, 'discovering', 100);
    logger.info(`Discovered ${topicsDiscovered} topics for job ${job.id}`);

    // Phase 2: Generate episodes
    this.emit('job:progress', job, 'generating', 0);

    const batchProcessor = new EpisodeBatchProcessor(
      this.episodeGenerator,
      this.researchRepo
    );

    const batchResult = await batchProcessor.processResults(
      researchResults,
      config.maxTopicsPerRun
    );

    this.emit('job:progress', job, 'generating', 100);

    // Calculate stats
    const durationMs = Date.now() - startTime;
    const tokensUsed = this.estimateTokensUsed(researchResults.length, batchResult.proposalsGenerated);
    const estimatedCostCents = this.estimateCost(tokensUsed);

    // Complete job
    await this.researchRepo.completeJob(
      job.id,
      topicsDiscovered,
      batchResult.proposalsGenerated,
      tokensUsed
    );

    const stats: JobStats = {
      topicsDiscovered,
      episodesGenerated: batchResult.proposalsGenerated,
      tokensUsed,
      durationMs,
      estimatedCostCents,
    };

    this.emit('job:completed', job, stats);
    logger.info(`Completed job ${job.id}: ${topicsDiscovered} topics, ${batchResult.proposalsGenerated} episodes`);

    return { ...job, status: 'completed' };
  }

  /**
   * Estimate tokens used for research + generation
   */
  private estimateTokensUsed(topicsDiscovered: number, episodesGenerated: number): number {
    // Research: ~3000 tokens per category query
    // Generation: ~2000 tokens per episode
    return (topicsDiscovered * 500) + (episodesGenerated * 2000);
  }

  /**
   * Estimate cost in cents
   */
  private estimateCost(tokens: number): number {
    // Blended rate: ~$0.005 per 1K tokens
    return Math.ceil((tokens / 1000) * 0.5);
  }

  /**
   * Get status of all scheduled configs
   */
  getScheduleStatus(): Array<{
    configId: string;
    nextRun: Date | null;
    isActive: boolean;
  }> {
    const status: Array<{
      configId: string;
      nextRun: Date | null;
      isActive: boolean;
    }> = [];

    for (const [configId, task] of this.scheduledTasks) {
      status.push({
        configId,
        nextRun: this.getNextRunTime(configId),
        isActive: this.activeJobs.has(configId),
      });
    }

    return status;
  }

  /**
   * Get next scheduled run time for a config
   */
  getNextRunTime(configId: string): Date | null {
    // node-cron doesn't expose next run time directly
    // Would need to parse cron expression manually
    return null; // TODO: Implement cron expression parsing
  }

  /**
   * Check if a job is currently running
   */
  isJobRunning(jobId?: string): boolean {
    if (jobId) {
      return this.activeJobs.has(jobId);
    }
    return this.activeJobs.size > 0;
  }

  /**
   * Get active job details
   */
  getActiveJobs(): ResearchJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    logger.info('Shutting down research scheduler...');

    // Stop all scheduled tasks
    for (const [configId, task] of this.scheduledTasks) {
      task.stop();
      logger.info(`Stopped schedule for config ${configId}`);
    }
    this.scheduledTasks.clear();

    // Wait for active jobs to complete (with timeout)
    if (this.activeJobs.size > 0) {
      logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete...`);

      const shutdownTimeout = 60000; // 1 minute
      const startTime = Date.now();

      while (this.activeJobs.size > 0 && Date.now() - startTime < shutdownTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.activeJobs.size > 0) {
        logger.warn(`Force stopping ${this.activeJobs.size} remaining jobs`);
        for (const job of this.activeJobs.values()) {
          await this.researchRepo.failJob(job.id, 'Scheduler shutdown');
        }
      }
    }

    logger.info('Research scheduler shutdown complete');
  }
}
```

### API Routes for Manual Triggering

```typescript
// backend/src/routes/research-routes.ts

import { Router } from 'express';
import { ResearchJobScheduler } from '../services/research/research-job-scheduler.js';
import { ResearchRepository } from '../db/repositories/research-repository.js';

export function createResearchRoutes(
  scheduler: ResearchJobScheduler,
  researchRepo: ResearchRepository
): Router {
  const router = Router();

  // Get all research configs
  router.get('/configs', async (req, res) => {
    try {
      const configs = await researchRepo.findAllConfigs();
      res.json(configs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create research config
  router.post('/configs', async (req, res) => {
    try {
      const config = await researchRepo.createConfig(req.body);
      scheduler.scheduleConfig(config);
      res.status(201).json(config);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update research config
  router.put('/configs/:id', async (req, res) => {
    try {
      await researchRepo.updateConfig(req.params.id, req.body);
      const updated = await researchRepo.findConfigById(req.params.id);
      if (updated) {
        scheduler.scheduleConfig(updated);
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete research config
  router.delete('/configs/:id', async (req, res) => {
    try {
      scheduler.unscheduleConfig(req.params.id);
      await researchRepo.deleteConfig(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all research jobs
  router.get('/jobs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const jobs = await researchRepo.findRecentJobs(limit);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual job run
  router.post('/jobs/run', async (req, res) => {
    try {
      const { configId } = req.body;

      if (!configId) {
        return res.status(400).json({ error: 'configId is required' });
      }

      const job = await scheduler.runJob(configId);
      res.status(202).json(job);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get job status
  router.get('/jobs/:id', async (req, res) => {
    try {
      const job = await researchRepo.findJobById(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get scheduler status
  router.get('/scheduler/status', (req, res) => {
    res.json({
      isRunning: scheduler.isJobRunning(),
      activeJobs: scheduler.getActiveJobs(),
      schedules: scheduler.getScheduleStatus(),
    });
  });

  return router;
}
```

### Integration with Server Startup

```typescript
// backend/src/index.ts (additions)

import { ResearchJobScheduler } from './services/research/research-job-scheduler.js';
import { createResearchRoutes } from './routes/research-routes.js';

// Initialize scheduler after database connection
const researchScheduler = new ResearchJobScheduler(
  researchRepo,
  proposalRepo,
  researchService,
  episodeGenerator
);

await researchScheduler.initialize();

// Add routes
app.use('/api/duelogic/research', createResearchRoutes(researchScheduler, researchRepo));

// Graceful shutdown
process.on('SIGTERM', async () => {
  await researchScheduler.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await researchScheduler.shutdown();
  process.exit(0);
});
```

---

## Validation

### How to Test

1. **Unit Tests:**
   - Test cron schedule validation
   - Test job creation and status updates
   - Test concurrent job prevention
   - Test timeout handling
   - Test graceful shutdown

2. **Integration Tests:**
   - Test full job execution flow (mock services)
   - Test event emission
   - Test API endpoints

3. **Manual Testing:**
   - Create a config with a short interval (every minute)
   - Verify job runs automatically
   - Test manual trigger via API
   - Test shutdown while job is running

### Test Examples

```typescript
describe('ResearchJobScheduler', () => {
  describe('scheduling', () => {
    it('should schedule enabled configs', async () => {
      const config = createTestConfig({ enabled: true, schedule: '0 6 * * MON' });
      mockRepo.findEnabledConfigs.mockResolvedValue([config]);

      await scheduler.initialize();

      expect(scheduler.getScheduleStatus()).toHaveLength(1);
    });

    it('should not schedule disabled configs', async () => {
      const config = createTestConfig({ enabled: false });
      mockRepo.findEnabledConfigs.mockResolvedValue([config]);

      await scheduler.initialize();

      expect(scheduler.getScheduleStatus()).toHaveLength(0);
    });

    it('should reject invalid cron expressions', () => {
      const config = createTestConfig({ schedule: 'invalid' });

      scheduler.scheduleConfig(config);

      expect(scheduler.getScheduleStatus()).toHaveLength(0);
    });
  });

  describe('job execution', () => {
    it('should prevent concurrent jobs', async () => {
      scheduler.runJob('config-1'); // Don't await

      await expect(scheduler.runJob('config-2'))
        .rejects.toThrow('Maximum concurrent jobs');
    });

    it('should timeout long-running jobs', async () => {
      mockResearchService.discoverTopics.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 60000))
      );

      scheduler = new ResearchJobScheduler(/* ... */, { jobTimeoutMs: 100 });

      await expect(scheduler.runJob('config-1'))
        .rejects.toThrow('Job timed out');
    });
  });
});
```

### Definition of Done

- [ ] ResearchJobScheduler class implemented
- [ ] Cron-based scheduling works correctly
- [ ] Manual job triggering via API works
- [ ] Concurrent job prevention works
- [ ] Timeout handling works
- [ ] Graceful shutdown implemented
- [ ] Events emitted for monitoring
- [ ] API routes created and tested
- [ ] Unit tests pass with >90% coverage

---

## Notes

- node-cron runs in-process; for production, consider persistent job queue (BullMQ)
- Jobs run in UTC timezone by default
- Token usage is estimated; actual usage tracked in DUELOGIC-002
- Consider adding webhook notifications for job completion
- May want to add dead-letter handling for repeatedly failing jobs

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
