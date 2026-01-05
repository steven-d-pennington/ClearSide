import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceValidator } from '../src/services/podcast/voice-validator.js';
import { PodcastTTSClient } from '../src/services/podcast/podcast-tts-client.js';

describe('VoiceValidator', () => {
    let validator: VoiceValidator;
    let mockTtsClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockTtsClient = {
            getVoices: vi.fn(),
        };
        validator = new VoiceValidator(mockTtsClient as any);
    });

    it('should validate valid assignments', async () => {
        mockTtsClient.getVoices.mockResolvedValue([
            { voice_id: 'v1', name: 'Voice 1', category: 'premade' },
        ]);

        const result = await validator.validateAssignments({
            moderator: {
                voiceId: 'v1',
                speakerId: 'moderator',
                voiceName: 'V1',
                settings: { stability: 0.5, similarity_boost: 0.5, style: 0, speed: 1.0, use_speaker_boost: true }
            }
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should invalidate invalid voice IDs', async () => {
        mockTtsClient.getVoices.mockResolvedValue([
            { voice_id: 'v1', name: 'Voice 1', category: 'premade' },
        ]);

        const result = await validator.validateAssignments({
            moderator: {
                voiceId: 'invalid-id',
                speakerId: 'moderator',
                voiceName: 'V1',
                settings: { stability: 0.5, similarity_boost: 0.5, style: 0, speed: 1.0, use_speaker_boost: true }
            }
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Invalid voice ID');
    });

    it('should validate settings ranges', async () => {
        mockTtsClient.getVoices.mockResolvedValue([
            { voice_id: 'v1', name: 'Voice 1', category: 'premade' },
        ]);

        const result = await validator.validateAssignments({
            moderator: {
                voiceId: 'v1',
                speakerId: 'moderator',
                voiceName: 'V1',
                settings: { stability: 1.5, similarity_boost: -0.5, style: 0, speed: 3.0, use_speaker_boost: true }
            }
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3); // stability, similarity_boost, speed
    });

    it('should get recommended voices', async () => {
        mockTtsClient.getVoices.mockResolvedValue([
            { voice_id: 'v1', name: 'V1', category: 'premade' },
            { voice_id: 'v2', name: 'V2', category: 'premade' },
        ]);

        const recommended = await validator.getRecommendedVoices();
        expect(recommended.moderator).toBeDefined();
        expect(recommended.moderator.length).toBeGreaterThan(0);
    });
});
