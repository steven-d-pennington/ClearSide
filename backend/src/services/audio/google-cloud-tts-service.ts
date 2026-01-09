/**
 * Google Cloud Text-to-Speech Service
 *
 * Integrates with Google Cloud TTS API for high-quality WaveNet and Neural2 voices.
 * Offers 1M characters/month free tier.
 *
 * @see https://cloud.google.com/text-to-speech/docs
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
  name: 'google-cloud-tts-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Google Cloud TTS voice profiles for debate speakers
 *
 * Using WaveNet and Neural2 voices for best quality.
 * @see https://cloud.google.com/text-to-speech/docs/voices
 */
export const GOOGLE_CLOUD_VOICE_PROFILES: VoiceProfiles = {
  pro: {
    voiceId: 'en-US-Neural2-F', // Clear, professional female
    name: 'Pro Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  con: {
    voiceId: 'en-US-Neural2-D', // Clear, professional male
    name: 'Con Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  moderator: {
    voiceId: 'en-US-Neural2-C', // Neutral, authoritative female
    name: 'Moderator',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.2,
    useSpeakerBoost: true,
  },
  narrator: {
    voiceId: 'en-US-Neural2-A', // Warm male narrator
    name: 'Narrator',
    stability: 0.8,
    similarityBoost: 0.75,
    style: 0.1,
    useSpeakerBoost: true,
  },
};

/**
 * Popular Google Cloud TTS voices
 */
export const GOOGLE_CLOUD_AVAILABLE_VOICES = [
  // Neural2 voices (best quality)
  'en-US-Neural2-A',
  'en-US-Neural2-C',
  'en-US-Neural2-D',
  'en-US-Neural2-E',
  'en-US-Neural2-F',
  'en-US-Neural2-G',
  'en-US-Neural2-H',
  'en-US-Neural2-I',
  'en-US-Neural2-J',
  // WaveNet voices
  'en-US-Wavenet-A',
  'en-US-Wavenet-B',
  'en-US-Wavenet-C',
  'en-US-Wavenet-D',
  'en-US-Wavenet-E',
  'en-US-Wavenet-F',
];

export interface GoogleCloudTTSConfig {
  /** API key (from GOOGLE_CLOUD_API_KEY env var) */
  apiKey: string;
  /** Rate limit: requests per minute */
  requestsPerMinute?: number;
  /** Retry attempts on failure */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom voice profiles */
  voiceProfiles?: Partial<VoiceProfiles>;
  /** Audio encoding */
  audioEncoding?: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
}

/**
 * Google Cloud TTS Service
 *
 * Implements ITTSService for Google Cloud Text-to-Speech API
 */
export class GoogleCloudTTSService implements ITTSService {
  readonly provider: TTSProvider = 'google-cloud';

  private readonly apiKey: string;
  private readonly client: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxRetries: number;
  private readonly audioEncoding: string;

  constructor(config: GoogleCloudTTSConfig) {
    this.apiKey = config.apiKey;
    this.maxRetries = config.maxRetries || 3;
    this.audioEncoding = config.audioEncoding || 'MP3';

    this.voiceProfiles = {
      ...GOOGLE_CLOUD_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client for Google Cloud TTS API
    this.client = axios.create({
      baseURL: 'https://texttospeech.googleapis.com/v1',
      timeout: config.timeout || 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Rate limiter
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 100)),
      maxConcurrent: 3,
    });

    logger.info('Google Cloud TTS service initialized');
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  async generateSpeech(text: string, voiceType: VoiceType, customVoiceId?: string): Promise<TTSResult> {
    const baseVoice = this.voiceProfiles[voiceType];
    const voice = customVoiceId ? { ...baseVoice, voiceId: customVoiceId } : baseVoice;

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Generating speech with Google Cloud TTS'
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

      // Parse voice ID to get language code
      const [lang, region] = voice.voiceId.split('-');
      const languageCode = `${lang}-${region}`;

      const response = await this.client.post(
        '/text:synthesize',
        {
          input: { text },
          voice: {
            languageCode,
            name: voice.voiceId,
          },
          audioConfig: {
            audioEncoding: this.audioEncoding,
            speakingRate: 1.0,
            pitch: 0,
            sampleRateHertz: 24000,
          },
        },
        {
          params: {
            key: this.apiKey,
          },
        }
      );

      // Audio is returned as base64
      const audioContent = response.data.audioContent;
      if (!audioContent) {
        throw new Error('No audio content in Google Cloud TTS response');
      }

      const audioBuffer = Buffer.from(audioContent, 'base64');
      const durationMs = Date.now() - startTime;

      // Estimate audio duration
      const estimatedDuration = (text.length / 5 / 150) * 60 * 1000;

      logger.info(
        {
          voiceId: voice.voiceId,
          textLength: text.length,
          bufferSize: audioBuffer.length,
          processingTime: durationMs,
        },
        'Speech generated successfully via Google Cloud TTS'
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
          'Google Cloud TTS request failed, retrying'
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
        'Google Cloud TTS generation failed'
      );

      throw new Error(`Google Cloud TTS failed: ${axiosError.message}`);
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

  /**
   * List available voices from Google Cloud TTS
   */
  async listVoices(): Promise<
    Array<{
      name: string;
      languageCode: string;
      gender: string;
      naturalSampleRateHertz: number;
    }>
  > {
    try {
      const response = await this.client.get('/voices', {
        params: {
          key: this.apiKey,
          languageCode: 'en-US',
        },
      });

      return response.data.voices.map(
        (v: {
          name: string;
          languageCodes: string[];
          ssmlGender: string;
          naturalSampleRateHertz: number;
        }) => ({
          name: v.name,
          languageCode: v.languageCodes[0],
          gender: v.ssmlGender,
          naturalSampleRateHertz: v.naturalSampleRateHertz,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Google Cloud TTS voices');
      throw error;
    }
  }
}

/**
 * Create Google Cloud TTS service from environment variables
 */
export function createGoogleCloudTTSService(
  config?: Partial<GoogleCloudTTSConfig>
): GoogleCloudTTSService {
  const apiKey = config?.apiKey || process.env.GOOGLE_CLOUD_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GOOGLE_CLOUD_API_KEY environment variable is required for Google Cloud TTS'
    );
  }

  return new GoogleCloudTTSService({
    apiKey,
    ...config,
  });
}
