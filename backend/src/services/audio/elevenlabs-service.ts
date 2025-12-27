/**
 * ElevenLabs TTS Service
 *
 * Integrates with ElevenLabs Text-to-Speech API for high-quality debate narration.
 * Supports multiple voices, streaming, and rate limiting.
 *
 * @see tasks/phase2/audio-export/AUDIO-001.md
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import pino from 'pino';
import Bottleneck from 'bottleneck';
import type { VoiceConfig, VoiceType, VoiceProfiles, TTSResult, ITTSService, TTSProvider } from './types.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'elevenlabs-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Default voice profiles for debate speakers
 *
 * These are example ElevenLabs voice IDs - replace with actual voices
 * from your ElevenLabs account.
 *
 * Voice selection criteria:
 * - Pro: Confident, assertive, clear
 * - Con: Thoughtful, questioning, articulate
 * - Moderator: Neutral, calm, authoritative
 * - Narrator: Professional, engaging, clear
 */
export const DEFAULT_VOICE_PROFILES: VoiceProfiles = {
  pro: {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" - Professional female
    name: 'Pro Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  con: {
    voiceId: 'ErXwobaYiN019PkySvjV', // "Antoni" - Professional male
    name: 'Con Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  moderator: {
    voiceId: '21m00Tcm4TlvDq8ikWAM', // "Rachel" - Neutral, authoritative
    name: 'Moderator',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.2,
    useSpeakerBoost: true,
  },
  narrator: {
    voiceId: 'pNInz6obpgDQGcFmaJgB', // "Adam" - Clear narrator voice
    name: 'Narrator',
    stability: 0.8,
    similarityBoost: 0.75,
    style: 0.1,
    useSpeakerBoost: true,
  },
};

/**
 * ElevenLabs API error response
 */
interface ElevenLabsError {
  detail?: {
    status?: string;
    message?: string;
  };
}

/**
 * ElevenLabs Service Configuration
 */
export interface ElevenLabsConfig {
  /** API key (from ELEVENLABS_API_KEY env var) */
  apiKey: string;
  /** Model ID to use */
  modelId?: string;
  /** Base URL for API */
  baseUrl?: string;
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
 * ElevenLabs TTS Service
 *
 * Provides text-to-speech functionality using ElevenLabs API
 * Implements ITTSService for compatibility with the TTS provider factory.
 */
export class ElevenLabsService implements ITTSService {
  readonly provider: TTSProvider = 'elevenlabs';

  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly baseUrl: string;
  private readonly client: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxRetries: number;

  constructor(config: ElevenLabsConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || 'eleven_multilingual_v2';
    this.baseUrl = config.baseUrl || 'https://api.elevenlabs.io/v1';
    this.maxRetries = config.maxRetries || 3;

    // Merge custom voice profiles with defaults
    this.voiceProfiles = {
      ...DEFAULT_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 60000,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Create rate limiter (ElevenLabs has rate limits)
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 100)),
      maxConcurrent: 3,
    });

    logger.info(
      { modelId: this.modelId, rateLimit: config.requestsPerMinute || 100 },
      'ElevenLabs service initialized'
    );
  }

  /**
   * Check if the service is available (API key configured)
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get voice configuration for a voice type
   */
  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  /**
   * Generate speech from text
   *
   * @param text - Text to convert to speech
   * @param voiceType - Voice type to use
   * @returns Audio buffer and metadata
   */
  async generateSpeech(text: string, voiceType: VoiceType): Promise<TTSResult> {
    const voice = this.voiceProfiles[voiceType];

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Generating speech'
    );

    return this.limiter.schedule(async () => {
      return this.generateSpeechWithRetry(text, voice);
    });
  }

  /**
   * Generate speech with retry logic
   */
  private async generateSpeechWithRetry(
    text: string,
    voice: VoiceConfig,
    attempt: number = 1
  ): Promise<TTSResult> {
    try {
      const startTime = Date.now();

      const response = await this.client.post(
        `/text-to-speech/${voice.voiceId}`,
        {
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: voice.stability,
            similarity_boost: voice.similarityBoost,
            style: voice.style || 0,
            use_speaker_boost: voice.useSpeakerBoost ?? true,
          },
        },
        {
          responseType: 'arraybuffer',
          headers: {
            Accept: 'audio/mpeg',
          },
        }
      );

      const audioBuffer = Buffer.from(response.data);
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
        'Speech generated successfully'
      );

      return {
        audioBuffer,
        durationMs: estimatedDuration,
        charactersUsed: text.length,
      };
    } catch (error) {
      const axiosError = error as AxiosError<ElevenLabsError>;

      // Check if retryable
      if (attempt < this.maxRetries && this.isRetryableError(axiosError)) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn(
          { attempt, delay, error: axiosError.message },
          'TTS request failed, retrying'
        );

        await this.sleep(delay);
        return this.generateSpeechWithRetry(text, voice, attempt + 1);
      }

      // Log and throw
      logger.error(
        {
          voiceId: voice.voiceId,
          error: axiosError.message,
          status: axiosError.response?.status,
          detail: axiosError.response?.data?.detail,
        },
        'TTS generation failed'
      );

      throw new Error(
        `ElevenLabs TTS failed: ${axiosError.response?.data?.detail?.message || axiosError.message}`
      );
    }
  }

  /**
   * Generate speech with streaming (for large texts)
   *
   * @param text - Text to convert to speech
   * @param voiceType - Voice type to use
   * @returns Async iterable of audio chunks
   */
  async *streamSpeech(
    text: string,
    voiceType: VoiceType
  ): AsyncGenerator<Buffer, void, unknown> {
    const voice = this.voiceProfiles[voiceType];

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Starting speech stream'
    );

    const response = await this.client.post(
      `/text-to-speech/${voice.voiceId}/stream`,
      {
        text,
        model_id: this.modelId,
        voice_settings: {
          stability: voice.stability,
          similarity_boost: voice.similarityBoost,
          style: voice.style || 0,
          use_speaker_boost: voice.useSpeakerBoost ?? true,
        },
      },
      {
        responseType: 'stream',
        headers: {
          Accept: 'audio/mpeg',
        },
      }
    );

    // Stream the response
    for await (const chunk of response.data) {
      yield Buffer.from(chunk);
    }

    logger.debug({ voiceType }, 'Speech stream completed');
  }

  /**
   * Get available voices from ElevenLabs account
   */
  async getVoices(): Promise<
    Array<{
      voiceId: string;
      name: string;
      category: string;
      labels: Record<string, string>;
    }>
  > {
    try {
      const response = await this.client.get('/voices');

      return response.data.voices.map(
        (v: {
          voice_id: string;
          name: string;
          category: string;
          labels: Record<string, string>;
        }) => ({
          voiceId: v.voice_id,
          name: v.name,
          category: v.category,
          labels: v.labels,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to fetch voices');
      throw error;
    }
  }

  /**
   * Get subscription info (for monitoring usage)
   */
  async getSubscriptionInfo(): Promise<{
    characterCount: number;
    characterLimit: number;
    tier: string;
  }> {
    try {
      const response = await this.client.get('/user/subscription');

      return {
        characterCount: response.data.character_count,
        characterLimit: response.data.character_limit,
        tier: response.data.tier,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to fetch subscription info');
      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: AxiosError): boolean {
    const status = error.response?.status;

    // Retry on rate limit, server errors, or network errors
    return (
      !status || // Network error
      status === 429 || // Rate limit
      status === 500 || // Server error
      status === 502 || // Bad gateway
      status === 503 || // Service unavailable
      status === 504 // Gateway timeout
    );
  }

  /**
   * Sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create ElevenLabs service from environment variables
 */
export function createElevenLabsService(
  config?: Partial<ElevenLabsConfig>
): ElevenLabsService {
  const apiKey = config?.apiKey || process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY environment variable is required for audio export'
    );
  }

  return new ElevenLabsService({
    apiKey,
    ...config,
  });
}
