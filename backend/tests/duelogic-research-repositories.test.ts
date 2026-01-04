
/**
 * Duelogic Research Repository Unit Tests
 * Tests CRUD operations for research repositories using mocked pool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResult } from 'pg';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const { mockQuery, mockConnect } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockConnect: vi.fn(),
}));

// Mock the database pool
vi.mock('../src/db/connection.js', () => ({
    pool: {
        query: mockQuery,
        connect: mockConnect,
    },
    closePool: vi.fn(),
    testConnection: vi.fn(),
    query: mockQuery,
    default: {
        query: mockQuery,
        connect: mockConnect,
    },
}));

// Import repositories
import { ResearchRepository } from '../src/db/repositories/research-repository.js';
import { EpisodeProposalRepository } from '../src/db/repositories/episode-proposal-repository.js';
import { DEFAULT_RESEARCH_CONFIG } from '../src/types/duelogic-research.js';

// Import pool from mocked module
import { pool } from '../src/db/connection.js';

describe('ResearchRepository', () => {
    let repository: ResearchRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        // We pass the mocked pool (which is mocked via import but we can pass 'pool' as any here since verify relies on imports)
        // Actually the repository takes a pool in constructor
        repository = new ResearchRepository(pool as any);
    });

    describe('createConfig', () => {
        it('should create a new research config', async () => {
            const input = {
                name: 'Test Config',
                schedule: '0 0 * * *',
                enabled: true,
                categories: ['ai_automation'] as any,
                perplexityModel: 'sonar',
                maxTopicsPerRun: 10,
                minControversyScore: 0.5,
                searchQueries: ['query'],
                excludeTopics: [],
            };

            const mockRow = {
                id: 'config-1',
                ...input,
                perplexity_model: 'sonar',
                max_topics_per_run: 10,
                min_controversy_score: 0.5,
                search_queries: ['query'],
                exclude_topics: [],
                created_at: new Date(),
                updated_at: new Date(),
            };

            mockQuery.mockResolvedValueOnce({
                rows: [mockRow],
                rowCount: 1,
            } as QueryResult<any>);

            const result = await repository.createConfig(input);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO research_configs'),
                expect.any(Array)
            );
            expect(result.id).toBe('config-1');
            expect(result.name).toBe('Test Config');
        });
    });

    describe('createJob', () => {
        it('should create a new research job', async () => {
            const mockRow = {
                id: 'job-1',
                config_id: 'config-1',
                status: 'pending',
                created_at: new Date(),
            };

            mockQuery.mockResolvedValueOnce({
                rows: [mockRow],
                rowCount: 1,
            } as QueryResult<any>);

            const result = await repository.createJob('config-1');

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO research_jobs'),
                ['config-1']
            );
            expect(result.id).toBe('job-1');
            expect(result.status).toBe('pending');
        });
    });

    describe('createResult', () => {
        it('should create a new research result', async () => {
            const input = {
                jobId: 'job-1',
                topic: 'AI Ethics',
                category: 'ai_automation' as any,
                sources: [],
                summary: 'Summary',
                controversyScore: 0.8,
                timeliness: 0.9,
                depth: 0.7,
                rawPerplexityResponse: '{}',
            };

            const mockRow = {
                id: 'result-1',
                job_id: 'job-1',
                topic: 'AI Ethics',
                category: 'ai_automation',
                sources: [],
                summary: 'Summary',
                controversy_score: 0.8,
                timeliness: 0.9,
                depth: 0.7,
                raw_perplexity_response: '{}',
                created_at: new Date(),
            };

            mockQuery.mockResolvedValueOnce({
                rows: [mockRow],
                rowCount: 1,
            } as QueryResult<any>);

            const result = await repository.createResult(input);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO research_results'),
                expect.any(Array)
            );
            expect(result.id).toBe('result-1');
            expect(result.controversyScore).toBe(0.8);
        });
    });
});

describe('EpisodeProposalRepository', () => {
    let repository: EpisodeProposalRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new EpisodeProposalRepository(pool as any);
    });

    describe('create', () => {
        it('should create a new episode proposal', async () => {
            const input = {
                researchResultId: 'result-1',
                status: 'pending' as any,
                title: 'Title',
                subtitle: 'Subtitle',
                description: 'Desc',
                proposition: 'Prop',
                contextForPanel: 'Context',
                chairs: [],
                keyTensions: [],
            };

            const mockRow = {
                id: 'prop-1',
                research_result_id: 'result-1',
                status: 'pending',
                title: 'Title',
                subtitle: 'Subtitle',
                description: 'Desc',
                proposition: 'Prop',
                context_for_panel: 'Context',
                chairs: [],
                key_tensions: [],
                generated_at: new Date(),
                was_edited: false,
            };

            mockQuery.mockResolvedValueOnce({
                rows: [mockRow],
                rowCount: 1,
            } as QueryResult<any>);

            const result = await repository.create(input);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO episode_proposals'),
                expect.any(Array)
            );
            expect(result.id).toBe('prop-1');
            expect(result.title).toBe('Title');
        });
    });

    describe('approve', () => {
        it('should approve a proposal', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [],
                rowCount: 1,
            } as unknown as QueryResult<any>);

            await repository.approve('prop-1', 'admin', 101);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE episode_proposals'),
                ['admin', 101, 'prop-1']
            );
        });
    });
});
