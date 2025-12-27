/**
 * Google Gemini TTS Service
 *
 * Integrates with Google Gemini 2.5 TTS for high-quality debate narration.
 * Uses the Gemini API (AI Studio) for text-to-speech with native multi-speaker support.
 *
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import pino from 'pino';
import Bottleneck from 'bottleneck';
import type {
  VoiceConfig,
  VoiceType,
  VoiceProfiles,
  TTSResult,
  ITTSService,
  TTSProvider,
} from './types.js';

const logger = pino({
  name: 'gemini-tts-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Gemini voice configuration
 * Maps our voice types to Gemini voice names
 */
export const GEMINI_VOICE_PROFILES: VoiceProfiles = {
  pro: {
    voiceId: 'Kore', // Firm, clear female voice
    name: 'Pro Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  con: {
    voiceId: 'Charon', // Thoughtful male voice
    name: 'Con Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  moderator: {
    voiceId: 'Aoede', // Neutral, calm voice
    name: 'Moderator',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.2,
    useSpeakerBoost: true,
  },
  narrator: {
    voiceId: 'Puck', // Clear narrator voice
    name: 'Narrator',
    stability: 0.8,
    similarityBoost: 0.75,
    style: 0.1,
    useSpeakerBoost: true,
  },
};

/**
 * Available Gemini TTS voices (as of Dec 2025)
 */
export const GEMINI_AVAILABLE_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
];

export interface GeminiTTSConfig {
  /** API key (from GOOGLE_AI_API_KEY env var) */
  apiKey: string;
  /** Model ID to use */
  modelId?: string;
  /** Rate limit: requests per minute */
  requestsPerMinute?: number;
  /** Retry attempts on failure */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom voice profiles */
  voiceProfiles?: Partial<VoiceProfiles>;
}

/**
 * Google Gemini TTS Service
 *
 * Implements ITTSService for the Gemini 2.5 TTS API
 */
export class GeminiTTSService implements ITTSService {
  readonly provider: TTSProvider = 'gemini';

  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly client: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxRetries: number;

  constructor(config: GeminiTTSConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || 'gemini-2.5-flash-preview-tts';
    this.maxRetries = config.maxRetries || 3;

    this.voiceProfiles = {
      ...GEMINI_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client for Gemini API
    this.client = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      timeout: config.timeout || 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Rate limiter
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 60)),
      maxConcurrent: 2,
    });

    logger.info(
      { modelId: this.modelId },
      'Gemini TTS service initialized'
    );
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  async generateSpeech(text: string, voiceType: VoiceType): Promise<TTSResult> {
    const voice = this.voiceProfiles[voiceType];

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Generating speech with Gemini'
    );

    return this.limiter.schedule(async () => {
      return this.generateSpeechWithRetry(text, voice);
    });
  }

  private async generateSpeechWithRetry(
    text: string,
    voice: VoiceConfig,
    attempt: number = 1
  ): Promise<TTSResult> {
    try {
      const startTime = Date.now();

      // Gemini TTS uses the generateContent endpoint with audio output
      const response = await this.client.post(
        `/models/${this.modelId}:generateContent`,
        {
          contents: [
            {
              parts: [{ text }],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice.voiceId,
                },
              },
            },
          },
        },
        {
          params: {
            key: this.apiKey,
          },
        }
      );

      // Extract audio data from response
      const audioData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (!audioData?.data) {
        throw new Error('No audio data in Gemini response');
      }

      // Decode base64 audio
      const audioBuffer = Buffer.from(audioData.data, 'base64');
      const durationMs = Date.now() - startTime;

      // Estimate audio duration (rough: ~150 words/min, ~5 chars/word)
      const estimatedDuration = (text.length / 5 / 150) * 60 * 1000;

      logger.info(
        {
          voiceId: voice.voiceId,
          textLength: text.length,
          bufferSize: audioBuffer.length,
          processingTime: durationMs,
        },
        'Speech generated successfully via Gemini'
      );

      return {
        audioBuffer,
        durationMs: estimatedDuration,
        charactersUsed: text.length,
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      if (attempt < this.maxRetries && this.isRetryableError(axiosError)) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          { attempt, delay, error: axiosError.message },
          'Gemini TTS request failed, retrying'
        );

        await this.sleep(delay);
        return this.generateSpeechWithRetry(text, voice, attempt + 1);
      }

      logger.error(
        {
          voiceId: voice.voiceId,
          error: axiosError.message,
          status: axiosError.response?.status,
        },
        'Gemini TTS generation failed'
      );

      throw new Error(
        `Gemini TTS failed: ${axiosError.message}`
      );
    }
  }

  private isRetryableError(error: AxiosError): boolean {
    const status = error.response?.status;
    return (
      !status ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create Gemini TTS service from environment variables
 */
export function createGeminiTTSService(
  config?: Partial<GeminiTTSConfig>
): GeminiTTSService {
  const apiKey = config?.apiKey || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GOOGLE_AI_API_KEY environment variable is required for Gemini TTS'
    );
  }

  return new GeminiTTSService({
    apiKey,
    ...config,
  });
}
