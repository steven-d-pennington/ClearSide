import axios, { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import pino from 'pino';
import {
    PodcastSegment,
    ElevenLabsModel,
    AudioOutputFormat,
    ElevenLabsVoiceSettings
} from '../../types/podcast-export.js';

const logger = pino({
    name: 'podcast-tts-client',
    level: process.env.LOG_LEVEL || 'info',
});

interface TTSRequest {
    text: string;
    voiceId: string;
    modelId: ElevenLabsModel;
    voiceSettings: ElevenLabsVoiceSettings;
    outputFormat: AudioOutputFormat;
    previousText?: string;
    nextText?: string;
    pronunciationDictionaryId?: string;
}

interface TTSResponse {
    audio: Buffer;
    characterCount: number;
    durationMs?: number;
}

interface UsageStats {
    totalCharacters: number;
    totalRequests: number;
    estimatedCostCents: number;
}

// Model-specific character limits
const MODEL_CHAR_LIMITS: Record<ElevenLabsModel, number> = {
    'eleven_v3': 5000,
    'eleven_multilingual_v2': 10000,
    'eleven_turbo_v2_5': 40000,
    'eleven_flash_v2_5': 40000,
};

// ElevenLabs pricing per 1000 characters (Creator tier)
const COST_PER_1000_CHARS_CENTS = 15; // $0.15 per 1K chars

export class PodcastTTSClient {
    private client: AxiosInstance;
    private limiter: Bottleneck;
    private usageStats: UsageStats = {
        totalCharacters: 0,
        totalRequests: 0,
        estimatedCostCents: 0,
    };

    constructor(apiKey: string) {
        this.client = axios.create({
            baseURL: 'https://api.elevenlabs.io/v1',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 60000, // 60s timeout for long segments
        });

        // Rate limiter: ElevenLabs allows ~100 requests/minute on paid plans
        this.limiter = new Bottleneck({
            minTime: 600,    // 600ms between requests
            maxConcurrent: 1, // Sequential processing for podcasts
        });
    }

    /**
     * Generate audio for a single podcast segment
     */
    async generateSegmentAudio(segment: PodcastSegment, config: {
        modelId: ElevenLabsModel;
        outputFormat: AudioOutputFormat;
        pronunciationDictionaryId?: string;
    }): Promise<TTSResponse> {
        return this.limiter.schedule(() => this.callTTSAPI({
            text: segment.text,
            voiceId: segment.voiceId,
            modelId: config.modelId,
            voiceSettings: segment.voiceSettings,
            outputFormat: config.outputFormat,
            previousText: segment.previousText,
            nextText: segment.nextText,
            pronunciationDictionaryId: config.pronunciationDictionaryId,
        }));
    }

    /**
     * Generate audio for all segments in a script
     */
    async generateFullPodcast(
        segments: PodcastSegment[],
        config: {
            modelId: ElevenLabsModel;
            outputFormat: AudioOutputFormat;
            pronunciationDictionaryId?: string;
        },
        onProgress?: (current: number, total: number) => void
    ): Promise<{ audioBuffers: Buffer[]; stats: UsageStats }> {
        const audioBuffers: Buffer[] = [];

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (!segment) continue;

            const response = await this.generateSegmentAudio(segment, config);
            audioBuffers.push(response.audio);

            if (onProgress) {
                onProgress(i + 1, segments.length);
            }
        }

        return {
            audioBuffers,
            stats: this.getUsageStats(),
        };
    }

    /**
     * Call the ElevenLabs TTS API with retry logic
     */
    private async callTTSAPI(request: TTSRequest, attempt = 1): Promise<TTSResponse> {
        const maxRetries = 3;

        try {
            // Validate segment length
            const charLimit = MODEL_CHAR_LIMITS[request.modelId] || 5000;
            if (request.text.length > charLimit) {
                throw new Error(`Text exceeds model limit: ${request.text.length} > ${charLimit}`);
            }

            // Build request body
            const body: any = {
                text: request.text,
                model_id: request.modelId,
                voice_settings: {
                    stability: request.voiceSettings.stability,
                    similarity_boost: request.voiceSettings.similarity_boost,
                    style: request.voiceSettings.style,
                    speed: request.voiceSettings.speed,
                    use_speaker_boost: request.voiceSettings.use_speaker_boost,
                },
            };

            // Add context for natural flow (optional)
            if (request.previousText) {
                body.previous_text = request.previousText;
            }
            if (request.nextText) {
                body.next_text = request.nextText;
            }

            // Add pronunciation dictionary if specified
            if (request.pronunciationDictionaryId) {
                body.pronunciation_dictionary_locators = [{
                    pronunciation_dictionary_id: request.pronunciationDictionaryId,
                }];
            }

            // Make API call
            const response = await this.client.post(
                `/text-to-speech/${request.voiceId}`,
                body,
                {
                    params: { output_format: request.outputFormat },
                    responseType: 'arraybuffer',
                }
            );

            // Track usage
            const characterCount = request.text.length;
            this.usageStats.totalCharacters += characterCount;
            this.usageStats.totalRequests += 1;
            this.usageStats.estimatedCostCents +=
                Math.ceil((characterCount / 1000) * COST_PER_1000_CHARS_CENTS);

            return {
                audio: Buffer.from(response.data),
                characterCount,
            };

        } catch (error: any) {
            // Handle rate limiting
            if (error.response?.status === 429 && attempt <= maxRetries) {
                const retryAfter = parseInt(error.response.headers['retry-after'] || '5', 10);
                logger.warn(`Rate limited, retrying in ${retryAfter}s (attempt ${attempt}/${maxRetries})`);
                await this.sleep(retryAfter * 1000);
                return this.callTTSAPI(request, attempt + 1);
            }

            // Handle server errors with retry
            if (error.response?.status >= 500 && attempt <= maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.warn(`Server error ${error.response.status}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                await this.sleep(delay);
                return this.callTTSAPI(request, attempt + 1);
            }

            // Parse error message
            if (error.response?.data) {
                const errorData = error.response.data;
                let errorMessage = 'Unknown ElevenLabs error';

                if (errorData instanceof ArrayBuffer || Buffer.isBuffer(errorData)) {
                    const errorText = Buffer.from(errorData as any).toString();
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage = errorJson.detail?.message || errorJson.message || errorText;
                    } catch {
                        errorMessage = errorText;
                    }
                } else if (typeof errorData === 'object') {
                    errorMessage = errorData.detail?.message || errorData.message || JSON.stringify(errorData);
                }

                throw new Error(`ElevenLabs API error: ${errorMessage}`);
            }

            throw error;
        }
    }

    /**
     * Stream audio generation (for real-time playback)
     */
    async streamSegmentAudio(
        segment: PodcastSegment,
        config: {
            modelId: ElevenLabsModel;
            pronunciationDictionaryId?: string;
        }
    ): Promise<any> {
        const body: any = {
            text: segment.text,
            model_id: config.modelId,
            voice_settings: {
                stability: segment.voiceSettings.stability,
                similarity_boost: segment.voiceSettings.similarity_boost,
                style: segment.voiceSettings.style,
                speed: segment.voiceSettings.speed,
                use_speaker_boost: segment.voiceSettings.use_speaker_boost,
            },
        };

        if (segment.previousText) {
            body.previous_text = segment.previousText;
        }
        if (segment.nextText) {
            body.next_text = segment.nextText;
        }

        const response = await this.client.post(
            `/text-to-speech/${segment.voiceId}/stream`,
            body,
            { responseType: 'stream' }
        );

        // Track usage
        this.usageStats.totalCharacters += segment.text.length;
        this.usageStats.totalRequests += 1;
        this.usageStats.estimatedCostCents +=
            Math.ceil((segment.text.length / 1000) * COST_PER_1000_CHARS_CENTS);

        return response.data;
    }

    /**
     * Get available voices from ElevenLabs
     */
    async getVoices(): Promise<Array<{ voice_id: string; name: string; category: string }>> {
        const response = await this.client.get('/voices');
        return response.data.voices;
    }

    /**
     * Estimate cost for a given character count
     */
    static estimateCostCents(characterCount: number): number {
        return Math.ceil((characterCount / 1000) * COST_PER_1000_CHARS_CENTS);
    }

    /**
     * Get model character limit
     */
    static getModelCharLimit(modelId: ElevenLabsModel): number {
        return MODEL_CHAR_LIMITS[modelId] || 5000;
    }

    /**
     * Get current usage statistics
     */
    getUsageStats(): UsageStats {
        return { ...this.usageStats };
    }

    /**
     * Reset usage statistics
     */
    resetUsageStats(): void {
        this.usageStats = {
            totalCharacters: 0,
            totalRequests: 0,
            estimatedCostCents: 0,
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
