import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PodcastTTSClient } from '../src/services/podcast/podcast-tts-client.js';
import { PodcastSegment, ElevenLabsVoiceSettings } from '../src/types/podcast-export.js';

// Mock axios
const mockPost = vi.fn();
const mockGet = vi.fn();
vi.mock('axios', () => {
    return {
        default: {
            create: vi.fn().mockImplementation(() => ({
                post: mockPost,
                get: mockGet,
                defaults: { headers: { common: {} } },
                interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } }
            }))
        }
    };
});

vi.mock('bottleneck', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            schedule: vi.fn().mockImplementation((fn) => fn()),
        })),
    };
});

describe('PodcastTTSClient', () => {
    let client: PodcastTTSClient;
    const apiKey = 'test-api-key';

    beforeEach(() => {
        vi.clearAllMocks();
        client = new PodcastTTSClient(apiKey);
        // Overwrite sleep for fast tests
        (client as any).sleep = () => Promise.resolve();
    });

    const mockVoiceSettings: ElevenLabsVoiceSettings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1.0,
        use_speaker_boost: true,
    };

    const mockSegment: PodcastSegment = {
        index: 0,
        speaker: 'pro',
        voiceId: 'voice-1',
        text: 'Hello world',
        voiceSettings: mockVoiceSettings,
        previousText: 'Intro',
        nextText: 'Response',
    };

    it('should generate audio for a segment', async () => {
        mockPost.mockResolvedValue({
            data: Buffer.from('audio-data'),
            status: 200,
        });

        const result = await client.generateSegmentAudio(mockSegment, {
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        });

        expect(result.audio.toString()).toBe('audio-data');
        expect(result.characterCount).toBe(11);
        expect(mockPost).toHaveBeenCalledWith(
            '/text-to-speech/voice-1',
            expect.objectContaining({
                text: 'Hello world',
                model_id: 'eleven_multilingual_v2',
                previous_text: 'Intro',
                next_text: 'Response',
            }),
            expect.any(Object)
        );
    });

    it('should track usage statistics', async () => {
        mockPost.mockResolvedValue({
            data: Buffer.from('audio-data'),
            status: 200,
        });

        await client.generateSegmentAudio(mockSegment, {
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        });

        const stats = client.getUsageStats();
        expect(stats.totalCharacters).toBe(11);
        expect(stats.totalRequests).toBe(1);
        expect(stats.estimatedCostCents).toBeGreaterThan(0);
    });

    it('should retry on 429 rate limit', async () => {
        // First call fails with 429
        mockPost.mockRejectedValueOnce({
            response: {
                status: 429,
                headers: { 'retry-after': '0' },
            },
        });
        // Second call succeeds
        mockPost.mockResolvedValueOnce({
            data: Buffer.from('audio-data'),
            status: 200,
        });

        const result = await client.generateSegmentAudio(mockSegment, {
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        });

        expect(result.audio.toString()).toBe('audio-data');
        expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it('should throw error on persistent failures', async () => {
        mockPost.mockRejectedValue({
            response: {
                status: 500,
                data: Buffer.from(JSON.stringify({ message: 'Server Error' })),
            },
        });

        await expect(client.generateSegmentAudio(mockSegment, {
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        })).rejects.toThrow('ElevenLabs API error: Server Error');

        expect(mockPost).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should validate character limits', async () => {
        const longSegment = { ...mockSegment, text: 'A'.repeat(11000) };

        await expect(client.generateSegmentAudio(longSegment, {
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        })).rejects.toThrow('Text exceeds model limit');
    });

    it('should fetch voices', async () => {
        mockGet.mockResolvedValue({
            data: {
                voices: [
                    { voice_id: 'v1', name: 'Voice 1', category: 'premade' },
                ]
            }
        });

        const voices = await client.getVoices();
        expect(voices).toHaveLength(1);
        expect(voices[0].name).toBe('Voice 1');
        expect(mockGet).toHaveBeenCalledWith('/voices');
    });
});
