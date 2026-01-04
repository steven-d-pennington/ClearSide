import { PodcastTTSClient } from './podcast-tts-client.js';
import { VoiceAssignment, DEFAULT_VOICE_ASSIGNMENTS } from '../../types/podcast-export.js';

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
     */
    async getRecommendedVoices(): Promise<Record<string, Array<{
        voiceId: string;
        name: string;
        recommended: boolean;
    }>>> {
        const voices = await this.ttsClient.getVoices();

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
