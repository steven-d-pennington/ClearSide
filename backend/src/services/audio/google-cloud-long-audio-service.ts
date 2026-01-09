/**
 * Google Cloud Long Audio Synthesis Service
 *
 * Implements asynchronous text-to-speech for long content using Google Cloud TTS
 * Long Audio API. Supports up to 1MB of input text without chunking.
 *
 * Flow:
 * 1. Start async synthesis → get operation ID
 * 2. Poll operation status until complete
 * 3. Download audio from GCS
 * 4. Convert LINEAR16 WAV to MP3
 * 5. Clean up GCS file
 *
 * @see https://cloud.google.com/text-to-speech/docs/create-audio-text-long-audio-synthesis
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import pino from 'pino';
import { GoogleAuth } from 'google-auth-library';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import fs from 'fs';
import type {
  VoiceConfig,
  VoiceType,
  VoiceProfiles,
  TTSResult,
  ITTSService,
  TTSProvider,
} from './types.js';
import { downloadFromGcs, deleteFromGcs } from './gcs-helper.js';

const logger = pino({
  name: 'google-cloud-long-audio-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Service account credentials structure
 */
interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

/**
 * Long audio operation response
 */
interface LongAudioOperation {
  name: string;
  done?: boolean;
  error?: {
    code: number;
    message: string;
  };
  metadata?: {
    '@type': string;
    startTime?: string;
    progressPercentage?: number;
  };
  response?: {
    '@type': string;
    // Output URI is returned via metadata
  };
}

/**
 * Voice profiles for Google Cloud Long Audio
 * Using Neural2 voices which support SSML for pauses, emphasis, and prosody.
 * Journey/Chirp HD voices do NOT support SSML and should not be used with SSML content.
 *
 * Neural2 voices support these SSML tags:
 * - <break time="Xms"/> for pauses
 * - <emphasis level="moderate|strong"> for emphasis
 * - <prosody> for pitch, rate, volume
 */
export const GOOGLE_CLOUD_LONG_VOICE_PROFILES: VoiceProfiles = {
  pro: {
    voiceId: 'en-US-Neural2-F', // Neural2 female - SSML supported
    name: 'Pro Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  con: {
    voiceId: 'en-US-Neural2-D', // Neural2 male - SSML supported
    name: 'Con Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  moderator: {
    voiceId: 'en-US-Neural2-A', // Neural2 male - SSML supported
    name: 'Moderator',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.2,
    useSpeakerBoost: true,
  },
  narrator: {
    voiceId: 'en-US-Neural2-J', // Neural2 male - SSML supported
    name: 'Narrator',
    stability: 0.8,
    similarityBoost: 0.75,
    style: 0.1,
    useSpeakerBoost: true,
  },
};

export interface GoogleCloudLongAudioConfig {
  /** Service account JSON string or file path */
  serviceAccountJson: string;
  /** GCS bucket for audio output */
  bucket: string;
  /** Google Cloud project ID (optional - extracted from service account) */
  projectId?: string;
  /** Google Cloud location (default: us-central1) */
  location?: string;
  /** Max time to wait for synthesis (default: 10 minutes) */
  maxWaitMs?: number;
  /** Polling interval in ms (default: 5000) */
  pollIntervalMs?: number;
  /** Custom voice profiles */
  voiceProfiles?: Partial<VoiceProfiles>;
  /** Delete GCS files after download (default: true) */
  cleanupGcs?: boolean;
}

export function parseServiceAccountJson(input: string): ServiceAccountCredentials {
  const trimmed = input.trim();

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as ServiceAccountCredentials;
  }

  if (fs.existsSync(trimmed)) {
    const fileContents = fs.readFileSync(trimmed, 'utf8');
    return JSON.parse(fileContents) as ServiceAccountCredentials;
  }

  throw new Error('Service account must be JSON string or file path.');
}

export async function createServiceAccountAccessToken(
  credentials: ServiceAccountCredentials
): Promise<{ accessToken: string; expiresIn: number }> {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();

  if (!accessTokenResponse?.token) {
    throw new Error('Failed to generate access token');
  }

  return {
    accessToken: accessTokenResponse.token,
    expiresIn: 3600, // Default 1 hour expiry
  };
}

/**
 * Google Cloud Long Audio Synthesis Service
 *
 * Implements ITTSService for async long audio generation
 */
export class GoogleCloudLongAudioService implements ITTSService {
  readonly provider: TTSProvider = 'google-cloud-long';

  private readonly credentials: ServiceAccountCredentials;
  private readonly projectId: string;
  private readonly bucket: string;
  private readonly location: string;
  private readonly client: AxiosInstance;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxWaitMs: number;
  private readonly pollIntervalMs: number;
  private readonly cleanupGcs: boolean;

  // Token cache
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: GoogleCloudLongAudioConfig) {
    // Parse service account credentials
    this.credentials = parseServiceAccountJson(config.serviceAccountJson);
    this.projectId = config.projectId || this.credentials.project_id;
    this.bucket = config.bucket;
    this.location = config.location || 'global';
    this.maxWaitMs = config.maxWaitMs || 600000; // 10 minutes
    this.pollIntervalMs = config.pollIntervalMs || 5000; // 5 seconds
    this.cleanupGcs = config.cleanupGcs !== false;

    this.voiceProfiles = {
      ...GOOGLE_CLOUD_LONG_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client for TTS Long Audio API
    // Use global endpoint with v1 API for better compatibility
    this.client = axios.create({
      baseURL: 'https://texttospeech.googleapis.com/v1',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info(
      { projectId: this.projectId, bucket: this.bucket, location: this.location },
      'Google Cloud Long Audio service initialized'
    );
  }

  /**
   * Parse service account JSON from string or file reference
   */
  isAvailable(): boolean {
    return !!(this.credentials?.private_key && this.bucket);
  }

  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  /**
   * Generate speech from text using Long Audio API
   * @param text - Text to convert to speech (may contain SSML)
   * @param voiceType - Voice type to use (pro, con, moderator, narrator)
   * @param customVoiceId - Optional custom voice ID to override default voice profile
   */
  async generateSpeech(text: string, voiceType: VoiceType, customVoiceId?: string): Promise<TTSResult> {
    // Use custom voice ID if provided, otherwise use voice profile
    const baseVoice = this.voiceProfiles[voiceType];
    const voice: VoiceConfig = customVoiceId
      ? { ...baseVoice, voiceId: customVoiceId }
      : baseVoice;
    const startTime = Date.now();

    // Guard against empty input - Journey voices reject empty text
    if (!text || text.trim().length === 0) {
      logger.warn({ voiceType }, 'Skipping empty text segment - returning silent audio');
      // Return a minimal silent result
      return {
        audioBuffer: Buffer.alloc(0),
        durationMs: 0,
        charactersUsed: 0,
      };
    }

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Starting long audio synthesis'
    );

    // Get fresh access token
    const accessToken = await this.getAccessToken();

    // Generate unique output path
    const outputId = crypto.randomUUID();
    const outputGcsUri = `gs://${this.bucket}/tts-output/${outputId}.wav`;

    try {
      // Step 1: Start synthesis
      const operation = await this.startSynthesis(text, voice, outputGcsUri, accessToken);

      // Step 2: Poll until complete
      await this.waitForOperation(operation.name, accessToken);

      // Step 3: Download from GCS
      const wavBuffer = await downloadFromGcs(outputGcsUri, accessToken);

      // Step 4: Convert LINEAR16 WAV to MP3
      const audioBuffer = await this.convertWavToMp3(wavBuffer);

      // Step 5: Cleanup GCS file
      if (this.cleanupGcs) {
        deleteFromGcs(outputGcsUri, accessToken).catch((err) => {
          logger.warn({ error: err.message, gcsUri: outputGcsUri }, 'GCS cleanup failed');
        });
      }

      // Calculate duration from WAV (LINEAR16: 48kHz, mono, 16-bit)
      // WAV header is 44 bytes, data is 2 bytes per sample
      const wavDataSize = wavBuffer.length - 44;
      const durationMs = Math.round((wavDataSize / 2 / 48000) * 1000);

      const processingTime = Date.now() - startTime;

      logger.info(
        {
          voiceId: voice.voiceId,
          textLength: text.length,
          wavSize: wavBuffer.length,
          mp3Size: audioBuffer.length,
          durationMs,
          processingTime,
        },
        'Long audio synthesis complete'
      );

      return {
        audioBuffer,
        durationMs,
        charactersUsed: text.length,
      };
    } catch (error) {
      // Clean up GCS on error
      if (this.cleanupGcs) {
        deleteFromGcs(outputGcsUri, accessToken).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Check if text contains SSML markup
   */
  private containsSSML(text: string): boolean {
    // Check for common SSML tags
    return /<(break|emphasis|prosody|say-as|sub|mark|phoneme|audio|p|s)\b/i.test(text);
  }

  /**
   * Wrap content in <speak> tags for SSML
   */
  private wrapInSpeakTags(content: string): string {
    // If already wrapped, return as-is
    if (content.trim().startsWith('<speak>')) {
      return content;
    }
    return `<speak>${content}</speak>`;
  }

  /**
   * Start long audio synthesis operation
   */
  private async startSynthesis(
    text: string,
    voice: VoiceConfig,
    outputGcsUri: string,
    accessToken: string
  ): Promise<LongAudioOperation> {
    // Parse voice ID to get language code
    const [lang, region] = voice.voiceId.split('-');
    const languageCode = `${lang}-${region}`;

    const parent = `projects/${this.projectId}/locations/${this.location}`;

    // Detect if content has SSML and format accordingly
    const hasSSML = this.containsSSML(text);
    const input = hasSSML
      ? { ssml: this.wrapInSpeakTags(text) }
      : { text };

    if (hasSSML) {
      logger.debug({ textLength: text.length }, 'Using SSML input for synthesis');
    }

    const requestBody = {
      parent,
      output_gcs_uri: outputGcsUri,
      input,
      voice: {
        languageCode,
        name: voice.voiceId,
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 48000, // Higher sample rate for better audio quality
      },
    };

    logger.debug(
      { parent, outputGcsUri, voiceId: voice.voiceId, textLength: text.length },
      'Starting long audio synthesis'
    );

    try {
      // Long Audio API endpoint: /projects/{project}/locations/{location}:synthesizeLongAudio
      const response = await this.client.post(
        `/${parent}:synthesizeLongAudio`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const operation = response.data as LongAudioOperation;
      logger.info({ operationName: operation.name }, 'Long audio operation started');

      return operation;
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorData = axiosError.response?.data as Record<string, unknown>;
      logger.error(
        {
          status: axiosError.response?.status,
          error: axiosError.message,
          details: errorData,
        },
        'Failed to start long audio synthesis'
      );
      throw new Error(`Failed to start synthesis: ${axiosError.message}`);
    }
  }

  /**
   * Poll operation until complete
   */
  private async waitForOperation(
    operationName: string,
    accessToken: string
  ): Promise<void> {
    const startTime = Date.now();
    let lastProgress = 0;

    while (true) {
      const elapsed = Date.now() - startTime;

      if (elapsed > this.maxWaitMs) {
        throw new Error(`Operation timed out after ${Math.round(elapsed / 1000)}s`);
      }

      // Poll operation status
      try {
        const response = await this.client.get(`/${operationName}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const operation = response.data as LongAudioOperation;

        // Check for error
        if (operation.error) {
          throw new Error(
            `Synthesis failed: ${operation.error.message} (code: ${operation.error.code})`
          );
        }

        // Check progress
        const progress = operation.metadata?.progressPercentage || 0;
        if (progress !== lastProgress) {
          logger.debug(
            { operationName, progress, elapsed },
            'Synthesis progress'
          );
          lastProgress = progress;
        }

        // Check if done
        if (operation.done) {
          logger.info(
            { operationName, elapsed },
            'Synthesis operation complete'
          );
          return;
        }
      } catch (error) {
        // Re-throw synthesis errors immediately (don't retry)
        if (error instanceof Error && error.message.startsWith('Synthesis failed:')) {
          throw error;
        }

        const axiosError = error as AxiosError;
        // 404 means operation not found - don't retry
        if (axiosError.response?.status === 404) {
          throw error;
        }

        // Other network errors can be retried
        logger.warn(
          { operationName, error: axiosError.message },
          'Error polling operation, retrying'
        );
      }

      // Wait before next poll
      await this.sleep(this.pollIntervalMs);
    }
  }

  /**
   * Get OAuth2 access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    logger.debug('Generating new OAuth2 access token');

    const tokenResponse = await createServiceAccountAccessToken(this.credentials);
    this.accessToken = tokenResponse.accessToken;
    this.tokenExpiry = Date.now() + tokenResponse.expiresIn * 1000;

    logger.debug('OAuth2 access token generated');

    return this.accessToken!;
  }

  /**
   * Convert LINEAR16 WAV to MP3
   */
  private async convertWavToMp3(wavBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const inputStream = new PassThrough();
      const outputChunks: Buffer[] = [];

      ffmpeg(inputStream)
        .inputFormat('wav')
        .audioCodec('libmp3lame')
        .outputOptions(['-b:a', '192k'])
        .format('mp3')
        .on('error', (err) => {
          logger.error({ error: err.message }, 'WAV to MP3 conversion failed');
          reject(new Error(`WAV to MP3 conversion failed: ${err.message}`));
        })
        .pipe()
        .on('data', (chunk: Buffer) => {
          outputChunks.push(chunk);
        })
        .on('end', () => {
          const mp3Buffer = Buffer.concat(outputChunks);
          logger.debug(
            { wavSize: wavBuffer.length, mp3Size: mp3Buffer.length },
            'WAV to MP3 conversion complete'
          );
          resolve(mp3Buffer);
        })
        .on('error', (err: Error) => {
          reject(new Error(`MP3 output stream error: ${err.message}`));
        });

      // Write WAV data to input stream
      inputStream.end(wavBuffer);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create Google Cloud Long Audio service from environment variables
 */
export function createGoogleCloudLongAudioService(
  config?: Partial<GoogleCloudLongAudioConfig>
): GoogleCloudLongAudioService {
  const serviceAccountJson =
    config?.serviceAccountJson || process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;
  const bucket = config?.bucket || process.env.GOOGLE_CLOUD_TTS_BUCKET;

  if (!serviceAccountJson) {
    throw new Error(
      'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON environment variable is required for Google Cloud Long Audio'
    );
  }

  if (!bucket) {
    throw new Error(
      'GOOGLE_CLOUD_TTS_BUCKET environment variable is required for Google Cloud Long Audio'
    );
  }

  return new GoogleCloudLongAudioService({
    serviceAccountJson,
    bucket,
    projectId: config?.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID,
    ...config,
  });
}
