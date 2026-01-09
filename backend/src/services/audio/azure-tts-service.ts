/**
 * Microsoft Azure Cognitive Services TTS
 *
 * Integrates with Azure Speech Services for high-quality neural TTS.
 * Offers 500K characters/month free tier.
 *
 * @see https://learn.microsoft.com/en-us/azure/ai-services/speech-service/
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
  name: 'azure-tts-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Azure Neural Voice profiles for debate speakers
 *
 * Using high-quality neural voices with different characteristics
 * @see https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
 */
export const AZURE_VOICE_PROFILES: VoiceProfiles = {
  pro: {
    voiceId: 'en-US-JennyNeural', // Clear, professional female
    name: 'Pro Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  con: {
    voiceId: 'en-US-GuyNeural', // Clear, professional male
    name: 'Con Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  moderator: {
    voiceId: 'en-US-AriaNeural', // Neutral, authoritative
    name: 'Moderator',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.2,
    useSpeakerBoost: true,
  },
  narrator: {
    voiceId: 'en-US-DavisNeural', // Warm narrator voice
    name: 'Narrator',
    stability: 0.8,
    similarityBoost: 0.75,
    style: 0.1,
    useSpeakerBoost: true,
  },
};

/**
 * Azure regions for Speech Services
 */
export type AzureRegion =
  | 'eastus'
  | 'westus'
  | 'westus2'
  | 'westeurope'
  | 'southeastasia'
  | 'eastasia';

export interface AzureTTSConfig {
  /** Speech service subscription key */
  subscriptionKey: string;
  /** Azure region */
  region?: AzureRegion;
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
 * Microsoft Azure TTS Service
 *
 * Implements ITTSService for Azure Cognitive Services Speech
 */
export class AzureTTSService implements ITTSService {
  readonly provider: TTSProvider = 'azure';

  private readonly subscriptionKey: string;
  private readonly region: string;
  private readonly client: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxRetries: number;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: AzureTTSConfig) {
    this.subscriptionKey = config.subscriptionKey;
    this.region = config.region || 'eastus';
    this.maxRetries = config.maxRetries || 3;

    this.voiceProfiles = {
      ...AZURE_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client for Azure Speech API
    this.client = axios.create({
      baseURL: `https://${this.region}.tts.speech.microsoft.com`,
      timeout: config.timeout || 60000,
    });

    // Rate limiter (Azure has generous limits but let's be safe)
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 100)),
      maxConcurrent: 3,
    });

    logger.info(
      { region: this.region },
      'Azure TTS service initialized'
    );
  }

  isAvailable(): boolean {
    return !!this.subscriptionKey;
  }

  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  /**
   * Get access token for Azure Speech API
   * Tokens expire after 10 minutes
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 1 min buffer)
    if (this.accessToken && this.tokenExpiry > now + 60000) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        null,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Length': '0',
          },
        }
      );

      this.accessToken = response.data;
      this.tokenExpiry = now + 9 * 60 * 1000; // 9 minutes

      logger.debug('Azure access token refreshed');
      return this.accessToken!;
    } catch (error) {
      logger.error({ error }, 'Failed to get Azure access token');
      throw new Error('Failed to authenticate with Azure Speech Services');
    }
  }

  async generateSpeech(text: string, voiceType: VoiceType, _customVoiceId?: string): Promise<TTSResult> {
    const voice = this.voiceProfiles[voiceType];

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Generating speech with Azure'
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
      const token = await this.getAccessToken();

      // Build SSML for Azure
      const ssml = this.buildSSML(text, voice);

      const response = await this.client.post(
        '/cognitiveservices/v1',
        ssml,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
            'User-Agent': 'ClearSide-Audio-Export',
          },
          responseType: 'arraybuffer',
        }
      );

      const audioBuffer = Buffer.from(response.data);
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
        'Speech generated successfully via Azure'
      );

      return {
        audioBuffer,
        durationMs: estimatedDuration,
        charactersUsed: text.length,
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Refresh token on 401
      if (axiosError.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiry = 0;
      }

      if (attempt < this.maxRetries && this.isRetryableError(axiosError)) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          { attempt, delay, error: axiosError.message },
          'Azure TTS request failed, retrying'
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
        'Azure TTS generation failed'
      );

      throw new Error(`Azure TTS failed: ${axiosError.message}`);
    }
  }

  /**
   * Build SSML document for Azure Speech
   */
  private buildSSML(text: string, voice: VoiceConfig): string {
    // Escape special XML characters
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voice.voiceId}">
    <prosody rate="0%" pitch="0%">
      ${escapedText}
    </prosody>
  </voice>
</speak>`;
  }

  private isRetryableError(error: AxiosError): boolean {
    const status = error.response?.status;
    return (
      !status ||
      status === 401 ||
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
 * Create Azure TTS service from environment variables
 */
export function createAzureTTSService(
  config?: Partial<AzureTTSConfig>
): AzureTTSService {
  const subscriptionKey = config?.subscriptionKey || process.env.AZURE_SPEECH_KEY;

  if (!subscriptionKey) {
    throw new Error(
      'AZURE_SPEECH_KEY environment variable is required for Azure TTS'
    );
  }

  const region = (config?.region || process.env.AZURE_SPEECH_REGION || 'eastus') as AzureRegion;

  return new AzureTTSService({
    subscriptionKey,
    region,
    ...config,
  });
}
