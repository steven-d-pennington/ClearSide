import { PodcastTTSClient } from './podcast-tts-client.js';
import { VoiceAssignment, DEFAULT_VOICE_ASSIGNMENTS } from '../../types/podcast-export.js';
import pino from 'pino';

const logger = pino({
    name: 'voice-validator',
    level: process.env.LOG_LEVEL || 'info',
});

// Fallback voices when API is unavailable or key lacks permissions
// These are ElevenLabs' commonly available premade voices
const FALLBACK_VOICES = [
    { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', category: 'premade' },
    { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade' },
    { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade' },
    { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade' },
    { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', category: 'premade' },
    { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade' },
    { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', category: 'premade' },
    { voice_id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', category: 'premade' },
    { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Fin', category: 'premade' },
    { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', category: 'premade' },
];

export class VoiceValidator {
    private ttsClient: PodcastTTSClient;
    private cachedVoices: Map<string, { name: string; category: string }> | null = null;

    constructor(ttsClient: PodcastTTSClient) {
        this.ttsClient = ttsClient;
    }

    /**
     * Validate that all voice assignments use valid ElevenLabs voice IDs
     */
    async validateAssignments(
        assignments: Record<string, VoiceAssignment>
    ): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        // Get available voices
        if (!this.cachedVoices) {
            const voices = await this.ttsClient.getVoices();
            this.cachedVoices = new Map(
                voices.map(v => [v.voice_id, { name: v.name, category: v.category }])
            );
        }

        // Validate each assignment
        for (const [role, assignment] of Object.entries(assignments)) {
            if (!this.cachedVoices.has(assignment.voiceId)) {
                errors.push(`Invalid voice ID for ${role}: ${assignment.voiceId}`);
            }

            // Validate settings ranges
            if (assignment.settings.stability < 0 || assignment.settings.stability > 1) {
                errors.push(`Invalid stability for ${role}: must be 0-1`);
            }
            if (assignment.settings.similarity_boost < 0 || assignment.settings.similarity_boost > 1) {
                errors.push(`Invalid similarity_boost for ${role}: must be 0-1`);
            }
            if (assignment.settings.style < 0 || assignment.settings.style > 1) {
                errors.push(`Invalid style for ${role}: must be 0-1`);
            }
            if (assignment.settings.speed < 0.5 || assignment.settings.speed > 2.0) {
                errors.push(`Invalid speed for ${role}: must be 0.5-2.0`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Get list of recommended voices for debate roles
     * Falls back to hardcoded list if API call fails (e.g., missing permissions)
     */
    async getRecommendedVoices(): Promise<Record<string, Array<{
        voiceId: string;
        name: string;
        recommended: boolean;
    }>>> {
        let voices: Array<{ voice_id: string; name: string; category: string }>;

        try {
            voices = await this.ttsClient.getVoices();
        } catch (error: any) {
            // Fall back to hardcoded voices if API fails
            logger.warn(
                { error: error.message },
                'Failed to fetch voices from ElevenLabs API, using fallback list'
            );
            voices = FALLBACK_VOICES;
        }

        // Filter to premade voices (most reliable)
        const premadeVoices = voices.filter(v => v.category === 'premade');

        return {
            moderator: premadeVoices.slice(0, 5).map((v) => ({
                voiceId: v.voice_id,
                name: v.name,
                recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS['moderator']?.voiceId,
            })),
            pro_advocate: premadeVoices.slice(0, 5).map((v) => ({
                voiceId: v.voice_id,
                name: v.name,
                recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS['pro_advocate']?.voiceId,
            })),
            con_advocate: premadeVoices.slice(0, 5).map((v) => ({
                voiceId: v.voice_id,
                name: v.name,
                recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS['con_advocate']?.voiceId,
            })),
            narrator: premadeVoices.slice(0, 5).map((v) => ({
                voiceId: v.voice_id,
                name: v.name,
                recommended: v.voice_id === DEFAULT_VOICE_ASSIGNMENTS['narrator']?.voiceId,
            })),
        };
    }
}
