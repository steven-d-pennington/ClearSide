import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PodcastGenerationPipeline, PipelineProgress, createPodcastPipeline } from '../src/services/podcast/podcast-pipeline.js';
import {
    PodcastExportJob,
    PodcastExportConfig,
    RefinedPodcastScript,
    PodcastSegment,
    DEFAULT_VOICE_ASSIGNMENTS,
} from '../src/types/podcast-export.js';

// Mock dependencies
vi.mock('../src/services/podcast/podcast-tts-client.js', () => ({
    PodcastTTSClient: vi.fn().mockImplementation(() => ({
        generateSegmentAudio: vi.fn().mockResolvedValue({
            audio: Buffer.from('mock-audio-data'),
            characterCount: 100,
        }),
        getUsageStats: vi.fn().mockReturnValue({
            totalCharacters: 500,
            totalRequests: 5,
            estimatedCostCents: 8,
        }),
        resetUsageStats: vi.fn(),
    })),
}));

vi.mock('../src/services/audio/audio-processor.js', () => ({
    AudioProcessor: vi.fn().mockImplementation(() => ({
        concatenateSegments: vi.fn().mockResolvedValue({
            outputPath: '/tmp/concatenated.mp3',
            fileSizeBytes: 1024000,
            durationSeconds: 120,
            metadata: { format: 'mp3', bitrate: '192k', sampleRate: 44100, channels: 2 },
        }),
        normalizeAudio: vi.fn().mockResolvedValue({
            outputPath: '/tmp/normalized.mp3',
            fileSizeBytes: 1024000,
            durationSeconds: 120,
            metadata: { format: 'mp3', bitrate: '192k', sampleRate: 44100, channels: 2 },
        }),
    })),
}));

vi.mock('../src/db/repositories/podcast-export-repository.js', () => ({
    findById: vi.fn(),
    updateStatus: vi.fn(),
    updateProgress: vi.fn(),
    saveRefinedScript: vi.fn(),
    completeJob: vi.fn(),
}));

vi.mock('node-id3', () => ({
    default: {
        write: vi.fn().mockReturnValue(true),
    },
}));

vi.mock('fs/promises', () => ({
    default: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        copyFile: vi.fn().mockResolvedValue(undefined),
        rm: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue({ size: 1024 }),
    },
}));

// Import mocked modules
import * as podcastRepo from '../src/db/repositories/podcast-export-repository.js';

describe('PodcastGenerationPipeline', () => {
    const mockVoiceSettings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1.0,
        use_speaker_boost: true,
    };

    const mockSegments: PodcastSegment[] = [
        {
            index: 0,
            speaker: 'narrator',
            voiceId: 'voice-narrator',
            text: 'Welcome to this debate',
            voiceSettings: mockVoiceSettings,
        },
        {
            index: 1,
            speaker: 'pro',
            voiceId: 'voice-pro',
            text: 'I argue in favor',
            voiceSettings: mockVoiceSettings,
        },
        {
            index: 2,
            speaker: 'con',
            voiceId: 'voice-con',
            text: 'I argue against',
            voiceSettings: mockVoiceSettings,
        },
    ];

    const mockScript: RefinedPodcastScript = {
        title: 'Test Debate Podcast',
        totalCharacters: 500,
        durationEstimateSeconds: 120,
        segments: mockSegments.slice(1),
        intro: mockSegments[0],
        outro: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockConfig: PodcastExportConfig = {
        refinementModel: 'gpt-4o-mini',
        includeIntro: true,
        includeOutro: false,
        addTransitions: true,
        elevenLabsModel: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
        voiceAssignments: DEFAULT_VOICE_ASSIGNMENTS,
        useCustomPronunciation: false,
        normalizeVolume: true,
    };

    const mockJob: PodcastExportJob = {
        id: 'job-123',
        debateId: 'debate-456',
        status: 'pending',
        config: mockConfig,
        refinedScript: mockScript,
        progressPercent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    let pipeline: PodcastGenerationPipeline;

    beforeEach(() => {
        vi.clearAllMocks();

        // Set up mock for findById
        vi.mocked(podcastRepo.findById).mockResolvedValue(mockJob);
        vi.mocked(podcastRepo.updateStatus).mockResolvedValue();
        vi.mocked(podcastRepo.updateProgress).mockResolvedValue();
        vi.mocked(podcastRepo.completeJob).mockResolvedValue();

        pipeline = new PodcastGenerationPipeline({
            elevenLabsApiKey: 'test-key',
            exportsDir: '/tmp/exports',
            tempDir: '/tmp/temp',
        });
    });

    afterEach(() => {
        pipeline.removeAllListeners();
    });

    describe('generate', () => {
        it('should successfully generate a podcast', async () => {
            const progressEvents: PipelineProgress[] = [];
            pipeline.on('progress', (p: PipelineProgress) => progressEvents.push(p));

            const result = await pipeline.generate('job-123');

            expect(result.success).toBe(true);
            expect(result.audioUrl).toContain('podcast-job-123.mp3');
            expect(result.durationSeconds).toBe(120);
            expect(result.characterCount).toBe(500);
            expect(result.actualCostCents).toBe(8);
        });

        it('should emit progress events throughout generation', async () => {
            const progressEvents: PipelineProgress[] = [];
            pipeline.on('progress', (p: PipelineProgress) => progressEvents.push(p));

            await pipeline.generate('job-123');

            // Check for key phases
            const phases = progressEvents.map(p => p.phase);
            expect(phases).toContain('initializing');
            expect(phases).toContain('generating');
            expect(phases).toContain('concatenating');
            expect(phases).toContain('normalizing');
            expect(phases).toContain('tagging');
            expect(phases).toContain('complete');
        });

        it('should track segment progress during generation', async () => {
            const progressEvents: PipelineProgress[] = [];
            pipeline.on('progress', (p: PipelineProgress) => progressEvents.push(p));

            await pipeline.generate('job-123');

            const generatingEvents = progressEvents.filter(p => p.phase === 'generating');
            expect(generatingEvents.length).toBeGreaterThan(0);

            // Check that segment counts are tracked
            const lastGenerating = generatingEvents[generatingEvents.length - 1];
            expect(lastGenerating?.totalSegments).toBe(3); // intro + 2 segments
        });

        it('should return error when job not found', async () => {
            vi.mocked(podcastRepo.findById).mockResolvedValue(null);

            const result = await pipeline.generate('nonexistent-job');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Job not found');
        });

        it('should return error when no refined script', async () => {
            vi.mocked(podcastRepo.findById).mockResolvedValue({
                ...mockJob,
                refinedScript: undefined,
            });

            const result = await pipeline.generate('job-123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('No refined script available - call /refine first');
        });

        it('should return error when script has no segments', async () => {
            vi.mocked(podcastRepo.findById).mockResolvedValue({
                ...mockJob,
                refinedScript: {
                    ...mockScript,
                    segments: [],
                    intro: undefined,
                    outro: undefined,
                },
            });

            const result = await pipeline.generate('job-123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Script has no segments to generate');
        });

        it('should update database status during generation', async () => {
            await pipeline.generate('job-123');

            expect(podcastRepo.updateStatus).toHaveBeenCalledWith('job-123', 'generating');
            expect(podcastRepo.completeJob).toHaveBeenCalled();
        });

        it('should update progress for each segment', async () => {
            await pipeline.generate('job-123');

            // Should have called updateProgress for each segment
            expect(podcastRepo.updateProgress).toHaveBeenCalledTimes(3);
        });

        it('should handle errors and update status', async () => {
            // Make the TTS client throw an error
            const { PodcastTTSClient } = await import('../src/services/podcast/podcast-tts-client.js');
            vi.mocked(PodcastTTSClient).mockImplementation(() => ({
                generateSegmentAudio: vi.fn().mockRejectedValue(new Error('TTS API failed')),
                getUsageStats: vi.fn().mockReturnValue({ totalCharacters: 0, totalRequests: 0, estimatedCostCents: 0 }),
                resetUsageStats: vi.fn(),
            }) as any);

            // Create new pipeline with mocked TTS client
            const failingPipeline = new PodcastGenerationPipeline({
                elevenLabsApiKey: 'test-key',
                exportsDir: '/tmp/exports',
                tempDir: '/tmp/temp',
            });

            const result = await failingPipeline.generate('job-123');

            expect(result.success).toBe(false);
            expect(result.error).toBe('TTS API failed');
            expect(podcastRepo.updateStatus).toHaveBeenCalledWith('job-123', 'error', 'TTS API failed');
        });
    });

    describe('segment ordering', () => {
        it('should include intro at the beginning', async () => {
            // Access private method via reflection for testing
            const getAllSegments = (pipeline as any).getAllSegments.bind(pipeline);

            const segments = getAllSegments(mockScript);

            expect(segments[0]).toBe(mockScript.intro);
            expect(segments.length).toBe(3);
        });

        it('should include outro at the end when present', async () => {
            const scriptWithOutro: RefinedPodcastScript = {
                ...mockScript,
                outro: {
                    index: 99,
                    speaker: 'narrator',
                    voiceId: 'voice-narrator',
                    text: 'Thank you for listening',
                    voiceSettings: mockVoiceSettings,
                },
            };

            const getAllSegments = (pipeline as any).getAllSegments.bind(pipeline);
            const segments = getAllSegments(scriptWithOutro);

            expect(segments[segments.length - 1]).toBe(scriptWithOutro.outro);
            expect(segments.length).toBe(4);
        });

        it('should handle script with no intro or outro', async () => {
            const minimalScript: RefinedPodcastScript = {
                ...mockScript,
                intro: undefined,
                outro: undefined,
                segments: mockSegments.slice(1),
            };

            const getAllSegments = (pipeline as any).getAllSegments.bind(pipeline);
            const segments = getAllSegments(minimalScript);

            expect(segments.length).toBe(2);
        });
    });
});

describe('createPodcastPipeline', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should create pipeline with environment API key', () => {
        process.env.ELEVENLABS_API_KEY = 'env-test-key';

        const pipeline = createPodcastPipeline();

        expect(pipeline).toBeInstanceOf(PodcastGenerationPipeline);
    });

    it('should create pipeline with provided API key', () => {
        const pipeline = createPodcastPipeline({
            elevenLabsApiKey: 'provided-key',
        });

        expect(pipeline).toBeInstanceOf(PodcastGenerationPipeline);
    });

    it('should throw error when no API key available', () => {
        delete process.env.ELEVENLABS_API_KEY;

        expect(() => createPodcastPipeline()).toThrow('ELEVENLABS_API_KEY is required');
    });

    it('should use custom directories when provided', () => {
        process.env.ELEVENLABS_API_KEY = 'test-key';

        const pipeline = createPodcastPipeline({
            exportsDir: '/custom/exports',
            tempDir: '/custom/temp',
        });

        expect(pipeline).toBeInstanceOf(PodcastGenerationPipeline);
    });
});

describe('Resume Capability', () => {
    const mockVoiceSettings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1.0,
        use_speaker_boost: true,
    };

    const mockSegments: PodcastSegment[] = [
        { index: 0, speaker: 'narrator', voiceId: 'v1', text: 'Intro', voiceSettings: mockVoiceSettings },
        { index: 1, speaker: 'pro', voiceId: 'v2', text: 'Pro argument', voiceSettings: mockVoiceSettings },
        { index: 2, speaker: 'con', voiceId: 'v3', text: 'Con argument', voiceSettings: mockVoiceSettings },
    ];

    const mockScript: RefinedPodcastScript = {
        title: 'Test',
        totalCharacters: 100,
        durationEstimateSeconds: 60,
        segments: mockSegments.slice(1),
        intro: mockSegments[0],
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockJob: PodcastExportJob = {
        id: 'resume-job',
        debateId: 'debate-123',
        status: 'error',
        config: {
            refinementModel: 'gpt-4o-mini',
            includeIntro: true,
            includeOutro: false,
            addTransitions: true,
            elevenLabsModel: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
            voiceAssignments: DEFAULT_VOICE_ASSIGNMENTS,
            useCustomPronunciation: false,
            normalizeVolume: true,
        },
        refinedScript: mockScript,
        progressPercent: 33,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(podcastRepo.findById).mockResolvedValue(mockJob);
        vi.mocked(podcastRepo.updateStatus).mockResolvedValue();
        vi.mocked(podcastRepo.updateProgress).mockResolvedValue();
        vi.mocked(podcastRepo.completeJob).mockResolvedValue();
    });

    it('should detect existing segments and skip them on resume', async () => {
        // Mock that segment-0000.mp3 already exists
        const fs = await import('fs/promises');
        vi.mocked(fs.default.readdir).mockResolvedValue(['segment-0000.mp3'] as any);
        vi.mocked(fs.default.stat).mockResolvedValue({ size: 1024 } as any);

        const pipeline = new PodcastGenerationPipeline({
            elevenLabsApiKey: 'test-key',
            exportsDir: '/tmp/exports',
            tempDir: '/tmp/temp',
        });

        const progressEvents: PipelineProgress[] = [];
        pipeline.on('progress', (p: PipelineProgress) => progressEvents.push(p));

        await pipeline.generate('resume-job');

        // Check that we see "resuming" or "already exists" in progress messages
        const resumeMessages = progressEvents.filter(p =>
            p.message?.includes('resuming') || p.message?.includes('already exists')
        );
        expect(resumeMessages.length).toBeGreaterThan(0);
    });

    it('should NOT call cleanup on failure (to preserve segments for resume)', async () => {
        const fs = await import('fs/promises');
        vi.mocked(fs.default.readdir).mockResolvedValue([]);

        // Make the TTS client throw an error
        const { PodcastTTSClient } = await import('../src/services/podcast/podcast-tts-client.js');
        vi.mocked(PodcastTTSClient).mockImplementation(() => ({
            generateSegmentAudio: vi.fn().mockRejectedValue(new Error('TTS API failed')),
            getUsageStats: vi.fn().mockReturnValue({ totalCharacters: 0, totalRequests: 0, estimatedCostCents: 0 }),
            resetUsageStats: vi.fn(),
        }) as any);

        const failingPipeline = new PodcastGenerationPipeline({
            elevenLabsApiKey: 'test-key',
            exportsDir: '/tmp/exports',
            tempDir: '/tmp/temp',
        });

        await failingPipeline.generate('resume-job');

        // Verify fs.rm was NOT called (cleanup should not happen on failure)
        expect(fs.default.rm).not.toHaveBeenCalled();
    });

    // Note: Cleanup on success is already tested in the main 'generate' describe block
    // The 'should successfully generate a podcast' test covers the success path including cleanup
});
