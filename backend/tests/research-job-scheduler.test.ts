
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchJobScheduler } from '../src/services/research/research-job-scheduler.js';
import { ResearchRepository } from '../src/db/repositories/research-repository.js';
import { EpisodeProposalRepository } from '../src/db/repositories/episode-proposal-repository.js';
import { DuelogicResearchService } from '../src/services/research/duelogic-research-service.js';
import { EpisodeGenerator } from '../src/services/research/episode-generator.js';

describe('ResearchJobScheduler', () => {
    let scheduler: ResearchJobScheduler;
    let mockRepo: any;
    let mockProposalRepo: any;
    let mockService: any;
    let mockGenerator: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRepo = {
            findEnabledConfigs: vi.fn().mockResolvedValue([]),
            findConfigById: vi.fn(),
            createJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'pending' }),
            startJob: vi.fn(),
            completeJob: vi.fn(),
            failJob: vi.fn(),
        };

        mockProposalRepo = {};

        mockService = {
            discoverTopics: vi.fn().mockResolvedValue([]),
        };

        mockGenerator = {
            generateProposal: vi.fn(),
        };

        scheduler = new ResearchJobScheduler(
            mockRepo as unknown as ResearchRepository,
            mockService as unknown as DuelogicResearchService,
            mockGenerator as unknown as EpisodeGenerator
        );
    });

    describe('scheduling', () => {
        it('should schedule enabled configs', async () => {
            const config = { id: 'c1', enabled: true, schedule: '0 6 * * MON', name: 'Test' };
            mockRepo.findEnabledConfigs.mockResolvedValue([config]);

            await scheduler.initialize();

            expect(scheduler.getScheduleStatus()).toHaveLength(1);
        });

        it('should not schedule disabled configs', async () => {
            const config = { id: 'c1', enabled: false, schedule: '0 6 * * MON', name: 'Test' };
            mockRepo.findEnabledConfigs.mockResolvedValue([config]);

            await scheduler.initialize();

            expect(scheduler.getScheduleStatus()).toHaveLength(0);
        });
    });

    describe('job execution', () => {
        it('should prevent concurrent jobs', async () => {
            mockRepo.findConfigById.mockResolvedValue({ id: 'c1', enabled: true, schedule: '0 6 * * MON' });
            // make discoverTopics hang so job stays active
            mockService.discoverTopics.mockImplementation(() => new Promise(() => { }));

            scheduler.runJob('c1').catch(() => { }); // Start job but don't await completion

            // Wait a tick for job to register
            await new Promise(resolve => setTimeout(resolve, 0));

            await expect(scheduler.runJob('c1'))
                .rejects.toThrow('Maximum concurrent jobs');
        });

        it('should timeout long-running jobs', async () => {
            mockRepo.findConfigById.mockResolvedValue({ id: 'c1', enabled: true, schedule: '0 6 * * MON' });
            mockService.discoverTopics.mockImplementation(
                () => new Promise(resolve => setTimeout(resolve, 200))
            );

            scheduler = new ResearchJobScheduler(
                mockRepo as any,
                mockService as any,
                mockGenerator as any,
                { jobTimeoutMs: 50, maxConcurrentJobs: 1, retryAttempts: 0, retryDelayMs: 0 }
            );

            await expect(scheduler.runJob('c1'))
                .rejects.toThrow('Job timed out');
        });
    });
});
