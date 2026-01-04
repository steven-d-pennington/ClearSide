import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import podcastRoutes from '../src/routes/podcast-routes.js';

// Mock dependencies
vi.mock('../src/utils/logger.js', () => ({
    createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    }),
}));

vi.mock('../src/db/repositories/podcast-export-repository.js', () => ({
    create: vi.fn().mockResolvedValue({ id: 'job_123', status: 'pending', config: {} }),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    saveRefinedScript: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockImplementation((id) => {
        if (id === 'job_123') {
            return Promise.resolve({
                id: 'job_123',
                status: 'pending',
                config: { elevenLabsModel: 'eleven_v3' },
                refinedScript: {
                    totalCharacters: 1000,
                    durationEstimateSeconds: 60,
                    segments: [{ index: 0, text: 'Hello', voiceId: 'v1', voiceSettings: {} }]
                }
            });
        }
        return Promise.resolve(null);
    }),
}));

vi.mock('../src/db/repositories/debate-repository.js', () => ({
    findById: vi.fn().mockImplementation((id) => {
        if (id === 'debate_123') {
            return Promise.resolve({ id: 'debate_123', propositionText: 'Test' });
        }
        return Promise.resolve(null);
    }),
}));

vi.mock('../src/db/repositories/utterance-repository.js', () => ({
    findByDebateId: vi.fn().mockResolvedValue([{ id: 1, content: 'Text', phase: 'opening', speaker: 'pro' }]),
}));

vi.mock('../src/db/repositories/intervention-repository.js', () => ({
    findByDebateId: vi.fn().mockResolvedValue([]),
}));

// Mock for PodcastTTSClient with static methods
vi.mock('../src/services/podcast/podcast-tts-client.js', () => {
    const MockClient = vi.fn().mockImplementation(() => ({
        generateSegmentAudio: vi.fn().mockResolvedValue({ audio: Buffer.from('audio'), characterCount: 5 }),
        getVoices: vi.fn().mockResolvedValue([]),
    }));
    (MockClient as any).estimateCostCents = vi.fn().mockReturnValue(15);
    (MockClient as any).getModelCharLimit = vi.fn().mockReturnValue(5000);
    return { PodcastTTSClient: MockClient };
});

vi.mock('../src/services/podcast/script-refiner.js', () => ({
    PodcastScriptRefiner: vi.fn().mockImplementation(() => ({
        refineTranscript: vi.fn().mockResolvedValue({
            title: 'Test',
            totalCharacters: 1000,
            durationEstimateSeconds: 60,
            segments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        }),
    })),
}));

vi.mock('../src/services/podcast/voice-validator.js', () => ({
    VoiceValidator: vi.fn().mockImplementation(() => ({
        getRecommendedVoices: vi.fn().mockResolvedValue([]),
        validateAssignments: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
    })),
}));

vi.mock('../src/services/llm/openrouter-adapter.js', () => ({
    OpenRouterLLMClient: vi.fn().mockImplementation(() => ({
        complete: vi.fn().mockResolvedValue({ content: 'Regenerated text' }),
    })),
}));

vi.mock('../src/services/transcript/transcript-recorder.js', () => ({
    createTranscriptRecorder: vi.fn().mockReturnValue({
        loadTranscript: vi.fn().mockResolvedValue(null),
    }),
}));

vi.mock('../src/services/validation/index.js', () => ({
    schemaValidator: {},
}));

// Create test app
function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/exports/podcast', podcastRoutes);
    return app;
}

describe('Podcast API Routes', () => {
    let app: express.Application;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENROUTER_API_KEY = 'test-key';
        process.env.ELEVENLABS_API_KEY = 'test-key';
        app = createTestApp();
    });

    describe('POST /api/exports/podcast/refine', () => {
        it('should start a refinement job', async () => {
            const response = await request(app)
                .post('/api/exports/podcast/refine')
                .send({ debateId: 'debate_123', config: {} });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('jobId', 'job_123');
            expect(response.body).toHaveProperty('script');
        });

        it('should return 400 if debateId is missing', async () => {
            const response = await request(app)
                .post('/api/exports/podcast/refine')
                .send({ config: {} });

            expect(response.status).toBe(400);
        });

        it('should return 404 if debate is not found', async () => {
            const response = await request(app)
                .post('/api/exports/podcast/refine')
                .send({ debateId: 'non_existent', config: {} });

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/exports/podcast/:jobId', () => {
        it('should return job details', async () => {
            const response = await request(app).get('/api/exports/podcast/job_123');

            expect(response.status).toBe(200);
            expect(response.body.id).toBe('job_123');
        });

        it('should return 404 if job is not found', async () => {
            const response = await request(app).get('/api/exports/podcast/non_existent');

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/exports/podcast/voices', () => {
        it('should return recommended voices', async () => {
            const response = await request(app).get('/api/exports/podcast/voices');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('voices');
        });
    });

    describe('POST /api/exports/podcast/preview-voice', () => {
        it('should return audio buffer', async () => {
            const response = await request(app)
                .post('/api/exports/podcast/preview-voice')
                .send({ voiceId: 'v1', text: 'Hello' });

            expect(response.status).toBe(200);
            expect(response.header['content-type']).toBe('audio/mpeg');
        });
    });

    describe('PUT /api/exports/podcast/:jobId/script', () => {
        it('should update segment text', async () => {
            const response = await request(app)
                .put('/api/exports/podcast/job_123/script')
                .send({ segments: [{ index: 0, text: 'Updated text', voiceId: 'v1', voiceSettings: {} }] });

            expect(response.status).toBe(200);
            expect(response.body.script.segments[0].text).toBe('Updated text');
        });
    });

    describe('POST /api/exports/podcast/:jobId/regenerate-segment', () => {
        it('should use LLM to rewrite a segment', async () => {
            const response = await request(app)
                .post('/api/exports/podcast/job_123/regenerate-segment')
                .send({ segmentIndex: 0, instructions: 'Make it funnier' });

            expect(response.status).toBe(200);
            expect(response.body.segment.text).toBe('Regenerated text');
        });
    });

    describe('DELETE /api/exports/podcast/:jobId/segment/:segmentIndex', () => {
        it('should remove a segment from the script', async () => {
            const response = await request(app)
                .delete('/api/exports/podcast/job_123/segment/0');

            expect(response.status).toBe(200);
            expect(response.body.script.segments.length).toBe(0);
        });
    });

    describe('DELETE /api/exports/podcast/:jobId/temp', () => {
        it('should clean up temp files for a job', async () => {
            // Mock fs/promises for this test
            vi.doMock('fs/promises', () => ({
                readdir: vi.fn().mockResolvedValue(['segment-0000.mp3', 'segment-0001.mp3']),
                unlink: vi.fn().mockResolvedValue(undefined),
                rmdir: vi.fn().mockResolvedValue(undefined),
            }));

            const response = await request(app)
                .delete('/api/exports/podcast/job_123/temp');

            expect(response.status).toBe(200);
            expect(response.body.jobId).toBe('job_123');
            expect(response.body.message).toContain('cleaned up');
        });

        it('should return 404 when job not found', async () => {
            const response = await request(app)
                .delete('/api/exports/podcast/non_existent/temp');

            expect(response.status).toBe(404);
        });

        it('should handle missing temp directory gracefully', async () => {
            // Mock fs/promises to throw ENOENT
            vi.doMock('fs/promises', () => ({
                readdir: vi.fn().mockRejectedValue({ code: 'ENOENT' }),
            }));

            const response = await request(app)
                .delete('/api/exports/podcast/job_123/temp');

            // Should return 200 with message that no files found
            expect(response.status).toBe(200);
            expect(response.body.filesDeleted).toBe(0);
        });
    });
});
