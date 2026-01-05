
import cron, { ScheduledTask } from 'node-cron';
import { EventEmitter } from 'events';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { DuelogicResearchService } from './duelogic-research-service.js';
import { EpisodeGenerator } from './episode-generator.js';
import { EpisodeBatchProcessor } from './episode-batch-processor.js';
import { ResearchConfig, ResearchJob } from '../../types/duelogic-research.js';
import pino from 'pino';

const logger = pino({
    name: 'research-job-scheduler',
    level: process.env.LOG_LEVEL || 'info',
});

export interface SchedulerEvents {
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
            logger.error({ schedule: config.schedule }, `Invalid cron schedule for config ${config.name}`);
            return;
        }

        const task = cron.schedule(config.schedule, async () => {
            try {
                await this.runJob(config.id);
            } catch (err: any) {
                logger.error({ err }, `Scheduled job failed for config ${config.id}`);
            }
        }, {
            scheduled: true,
            timezone: 'UTC',
        } as any);

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
        logger.info({ jobId: job.id, configName: config.name }, 'Started research job');

        // Phase 1: Discover topics
        this.emit('job:progress', job, 'discovering', 0);

        const researchResults = await this.researchService.discoverTopics(config, job.id);
        const topicsDiscovered = researchResults.length;

        this.emit('job:progress', job, 'discovering', 100);
        logger.info({ topicsDiscovered, jobId: job.id }, 'Discovered topics');

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
        logger.info({ jobId: job.id, stats }, 'Completed job');

        return { ...job, status: 'completed' };
    }

    /**
     * Estimate tokens used for research + generation
     */
    private estimateTokensUsed(topicsDiscovered: number, episodesGenerated: number): number {
        // Research: ~3000 tokens per category query (roughly, depends on category count)
        // Actually topicsDiscovered doesn't map 1:1 to category queries.
        // For now use rough estimate based on outputs to avoid tracking inputs complexly here.
        return (topicsDiscovered * 1000) + (episodesGenerated * 3000);
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

        for (const [configId] of this.scheduledTasks) {
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
    getNextRunTime(_configId: string): Date | null {
        // node-cron doesn't expose next run time directly easily in task interface
        return null;
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
