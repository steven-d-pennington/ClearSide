import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as podcastExportRepository from '../src/db/repositories/podcast-export-repository.js';
import { PodcastExportConfig, RefinedPodcastScript } from '../src/types/podcast-export.js';

// Mock the database pool
const { mockQuery } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
}));

vi.mock('../src/db/connection.js', () => ({
    pool: {
        query: mockQuery,
    },
}));

describe('PodcastExportRepository', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockConfig: PodcastExportConfig = {
        refinementModel: 'gpt-4o',
        includeIntro: true,
        includeOutro: true,
        addTransitions: true,
        elevenLabsModel: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
        voiceAssignments: {},
        useCustomPronunciation: false,
        normalizeVolume: true,
    };

    const mockDebateId = '123e4567-e89b-12d3-a456-426614174000';

    it('should create a new podcast export job', async () => {
        const mockRow = {
            id: 'job-123',
            debate_id: mockDebateId,
            status: 'pending',
            config: mockConfig,
            created_at: new Date(),
            updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

        const result = await podcastExportRepository.create(mockDebateId, mockConfig);

        expect(mockQuery).toHaveBeenCalled();
        const [query, params] = mockQuery.mock.calls[0];
        expect(query).toContain('INSERT INTO podcast_export_jobs');
        expect(params).toEqual([mockDebateId, JSON.stringify(mockConfig)]);
        expect(result.id).toBe('job-123');
        expect(result.status).toBe('pending');
    });

    it('should find a job by ID', async () => {
        const mockRow = {
            id: 'job-123',
            debate_id: mockDebateId,
            status: 'pending',
            config: mockConfig,
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

        const result = await podcastExportRepository.findById('job-123');

        expect(mockQuery).toHaveBeenCalled();
        const [query, params] = mockQuery.mock.calls[0];
        expect(query).toContain('SELECT * FROM podcast_export_jobs WHERE id = $1');
        expect(params).toEqual(['job-123']);
        expect(result?.id).toBe('job-123');
    });

    it('should update job status', async () => {
        await podcastExportRepository.updateStatus('job-123', 'refining');

        expect(mockQuery).toHaveBeenCalled();
        const [query, params] = mockQuery.mock.calls[0];
        expect(query).toContain('UPDATE podcast_export_jobs');
        expect(query).toContain('SET status = $1');
        expect(params).toEqual(['refining', null, null, 'job-123']);
    });

    it('should update progress', async () => {
        await podcastExportRepository.updateProgress('job-123', 5, 10);

        expect(mockQuery).toHaveBeenCalled();
        const [query, params] = mockQuery.mock.calls[0];
        expect(query).toContain('UPDATE podcast_export_jobs');
        expect(query).toContain('SET current_segment = $1');
        expect(params).toEqual([5, 10, 50, 'job-123']);
    });

    it('should save refined script', async () => {
        const mockScript: RefinedPodcastScript = {
            title: 'Test Podcast',
            totalCharacters: 1000,
            durationEstimateSeconds: 300,
            segments: [
                { index: 0, speaker: 'moderator', voiceId: 'v1', text: 'Hello', voiceSettings: {} as any }
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await podcastExportRepository.saveRefinedScript('job-123', mockScript);

        expect(mockQuery).toHaveBeenCalled();
        const [query, params] = mockQuery.mock.calls[0];
        expect(query).toContain('UPDATE podcast_export_jobs');
        expect(query).toContain('SET refined_script = $1');
        expect(params).toEqual([JSON.stringify(mockScript), 1, 'job-123']);
    });

    it('should complete a job', async () => {
        await podcastExportRepository.completeJob('job-123', 'http://audio.url', 300, 1000, 15);

        expect(mockQuery).toHaveBeenCalled();
        const [query, params] = mockQuery.mock.calls[0];
        expect(query).toContain('UPDATE podcast_export_jobs');
        expect(query).toContain("status = 'complete'");
        expect(params).toEqual(['http://audio.url', 300, 1000, 15, 'job-123']);
    });
});
