/**
 * Vertex AI TTS Service
 *
 * Integrates with Gemini 2.5 Flash Lite Preview TTS via Vertex AI API.
 * Uses service account authentication for higher quotas and better performance.
 *
 * Key differences from Google AI Studio (gemini-tts-service.ts):
 * - Uses Vertex AI endpoint ({region}-aiplatform.googleapis.com)
 * - Uses OAuth2 service account auth instead of API key
 * - Access to Gemini 2.5 Flash Lite Preview model
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import pino from 'pino';
import { GoogleAuth } from 'google-auth-library';
import Bottleneck from 'bottleneck';
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

const logger = pino({
  name: 'vertex-tts-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Maximum characters for the transcript portion of each chunk.
 * Director's notes header adds ~1200 chars, so this leaves room under typical limits.
 */
const MAX_TRANSCRIPT_CHARS = 3500;

/**
 * Marker that separates director's notes from the actual transcript.
 */
const DIRECTOR_NOTES_MARKER = '#### TRANSCRIPT\n';

/**
 * Parsed prompt with director's notes separated from transcript
 */
interface ParsedPrompt {
  directorsHeader: string;
  transcript: string;
}

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
 * Vertex AI voice configuration
 * Same voices as Gemini TTS - Vertex AI supports all Gemini voices
 */
export const VERTEX_VOICE_PROFILES: VoiceProfiles = {
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
 * Available Gemini TTS voices (same as AI Studio)
 */
export const VERTEX_AVAILABLE_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

export interface VertexTTSConfig {
  /** Service account JSON string or file path */
  serviceAccountJson: string;
  /** Google Cloud project ID (optional - extracted from service account) */
  projectId?: string;
  /** Google Cloud region (default: us-central1) */
  region?: string;
  /** Model ID to use (default: gemini-2.5-flash-lite-preview-tts) */
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
 * Parse service account JSON from string or file path
 */
function parseServiceAccountJson(input: string): ServiceAccountCredentials {
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

/**
 * Vertex AI TTS Service
 *
 * Implements ITTSService using Vertex AI endpoint for Gemini TTS
 */
export class VertexTTSService implements ITTSService {
  readonly provider: TTSProvider = 'vertex';

  private readonly credentials: ServiceAccountCredentials;
  private readonly projectId: string;
  private readonly region: string;
  private readonly modelId: string;
  private readonly client: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxRetries: number;

  // Token cache
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: VertexTTSConfig) {
    // Parse service account credentials
    this.credentials = parseServiceAccountJson(config.serviceAccountJson);
    this.projectId = config.projectId || this.credentials.project_id;
    this.region = config.region || 'us-central1';
    this.modelId = config.modelId || 'gemini-2.5-flash-lite-preview-tts';
    this.maxRetries = config.maxRetries || 5;

    this.voiceProfiles = {
      ...VERTEX_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client for Vertex AI API
    this.client = axios.create({
      baseURL: `https://${this.region}-aiplatform.googleapis.com/v1`,
      timeout: config.timeout || 360000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Rate limiter - conservative for Vertex AI (10 RPM limit on preview models)
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 8)), // 8 RPM to stay under 10 limit
      maxConcurrent: 1, // Single concurrent request
    });

    logger.info(
      { projectId: this.projectId, region: this.region, modelId: this.modelId },
      'Vertex AI TTS service initialized'
    );
  }

  isAvailable(): boolean {
    return !!(this.credentials?.private_key);
  }

  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  async generateSpeech(text: string, voiceType: VoiceType, customVoiceId?: string): Promise<TTSResult> {
    const baseVoice = this.voiceProfiles[voiceType];
    const voice: VoiceConfig = customVoiceId
      ? { ...baseVoice, voiceId: customVoiceId }
      : baseVoice;

    // Parse text to separate director's notes from transcript
    const parsed = this.parseDirectorPrompt(text);

    // Build chunks with director's notes prepended to each
    const chunks = this.buildChunksWithDirectors(parsed);

    logger.info(
      {
        voiceType,
        voiceId: voice.voiceId,
        totalLength: text.length,
        transcriptLength: parsed.transcript.length,
        hasDirectorNotes: !!parsed.directorsHeader,
        chunkCount: chunks.length,
      },
      'Generating speech with Vertex AI (chunked with director notes per chunk)'
    );

    // Get fresh access token
    const accessToken = await this.getAccessToken();

    // Generate PCM for each chunk with retry logic
    const pcmBuffers: Buffer[] = [];
    for (const [i, chunk] of chunks.entries()) {
      const pcm = await this.limiter.schedule(async () => {
        return this.generatePcmForChunkWithRetry(chunk, voice, i, chunks.length, accessToken, 1);
      });
      pcmBuffers.push(pcm);
    }

    // Concatenate all PCM buffers
    const combinedPcm = Buffer.concat(pcmBuffers);

    // Convert combined PCM to MP3
    const audioBuffer = await this.convertPcmToMp3(combinedPcm);

    // Calculate duration from PCM (24kHz, mono, 16-bit = 48000 bytes/sec)
    const durationMs = (combinedPcm.length / 48000) * 1000;

    logger.info(
      {
        voiceId: voice.voiceId,
        transcriptLength: parsed.transcript.length,
        chunkCount: chunks.length,
        pcmSize: combinedPcm.length,
        mp3Size: audioBuffer.length,
        durationMs: Math.round(durationMs),
      },
      'Speech generated successfully via Vertex AI (all chunks)'
    );

    return {
      audioBuffer,
      durationMs,
      charactersUsed: parsed.transcript.length,
    };
  }

  /**
   * Get OAuth2 access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    logger.debug('Generating new OAuth2 access token for Vertex AI');

    const auth = new GoogleAuth({
      credentials: this.credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();

    if (!accessTokenResponse?.token) {
      throw new Error('Failed to generate Vertex AI access token');
    }

    this.accessToken = accessTokenResponse.token;
    this.tokenExpiry = Date.now() + 3600 * 1000; // 1 hour expiry

    logger.debug('Vertex AI OAuth2 access token generated');

    return this.accessToken;
  }

  /**
   * Convert raw PCM audio (Gemini format) to MP3
   * Gemini returns: 16-bit signed little-endian PCM, 24kHz, mono
   */
  private async convertPcmToMp3(pcmBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const inputStream = new PassThrough();
      const outputChunks: Buffer[] = [];

      ffmpeg(inputStream)
        .inputOptions([
          '-f', 's16le',
          '-ar', '24000',
          '-ac', '1',
        ])
        .audioCodec('libmp3lame')
        .outputOptions(['-b:a', '192k'])
        .format('mp3')
        .on('error', (err) => {
          logger.error({ error: err.message }, 'PCM to MP3 conversion failed');
          reject(new Error(`PCM to MP3 conversion failed: ${err.message}`));
        })
        .pipe()
        .on('data', (chunk: Buffer) => {
          outputChunks.push(chunk);
        })
        .on('end', () => {
          const mp3Buffer = Buffer.concat(outputChunks);
          logger.debug(
            { pcmSize: pcmBuffer.length, mp3Size: mp3Buffer.length },
            'PCM to MP3 conversion complete'
          );
          resolve(mp3Buffer);
        })
        .on('error', (err: Error) => {
          reject(new Error(`MP3 output stream error: ${err.message}`));
        });

      inputStream.end(pcmBuffer);
    });
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

  /**
   * Parse text to separate director's notes header from transcript.
   */
  private parseDirectorPrompt(text: string): ParsedPrompt {
    const idx = text.indexOf(DIRECTOR_NOTES_MARKER);

    if (idx === -1) {
      return { directorsHeader: '', transcript: text };
    }

    return {
      directorsHeader: text.slice(0, idx + DIRECTOR_NOTES_MARKER.length),
      transcript: text.slice(idx + DIRECTOR_NOTES_MARKER.length),
    };
  }

  /**
   * Split long transcript into chunks at sentence boundaries.
   */
  private chunkTranscript(transcript: string): string[] {
    if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
      return [transcript];
    }

    const chunks: string[] = [];
    let remaining = transcript;

    while (remaining.length > MAX_TRANSCRIPT_CHARS) {
      const searchWindow = remaining.slice(0, MAX_TRANSCRIPT_CHARS);
      const lastPeriod = searchWindow.lastIndexOf('. ');
      const lastQuestion = searchWindow.lastIndexOf('? ');
      const lastExclaim = searchWindow.lastIndexOf('! ');

      const splitPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);

      if (splitPoint === -1) {
        const lastSpace = searchWindow.lastIndexOf(' ');
        if (lastSpace > 0) {
          chunks.push(remaining.slice(0, lastSpace));
          remaining = remaining.slice(lastSpace + 1);
        } else {
          chunks.push(remaining.slice(0, MAX_TRANSCRIPT_CHARS));
          remaining = remaining.slice(MAX_TRANSCRIPT_CHARS);
        }
      } else {
        chunks.push(remaining.slice(0, splitPoint + 1));
        remaining = remaining.slice(splitPoint + 2);
      }
    }

    if (remaining.trim()) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * Build final chunks by prepending director's notes header to each transcript chunk.
   */
  private buildChunksWithDirectors(parsed: ParsedPrompt): string[] {
    const transcriptChunks = this.chunkTranscript(parsed.transcript);

    if (!parsed.directorsHeader) {
      return transcriptChunks;
    }

    return transcriptChunks.map((chunk) => parsed.directorsHeader + chunk);
  }

  /**
   * Generate PCM audio for a single chunk with retry logic.
   */
  private async generatePcmForChunkWithRetry(
    chunk: string,
    voice: VoiceConfig,
    chunkIndex: number,
    totalChunks: number,
    accessToken: string,
    attempt: number = 1
  ): Promise<Buffer> {
    try {
      return await this.generatePcmForChunk(chunk, voice, chunkIndex, totalChunks, accessToken);
    } catch (error) {
      const axiosError = error as AxiosError;

      if (attempt < this.maxRetries && this.isRetryableError(axiosError)) {
        const isRateLimit = axiosError.response?.status === 429;
        const baseDelay = isRateLimit ? 5000 : 1000;
        const delay = Math.pow(2, attempt - 1) * baseDelay + Math.random() * 500;

        logger.warn(
          {
            chunkIndex: chunkIndex + 1,
            totalChunks,
            attempt,
            delay: Math.round(delay),
            isRateLimit,
            error: axiosError.message,
          },
          'Vertex AI chunk TTS request failed, retrying'
        );

        await this.sleep(delay);

        // Refresh token if needed before retry
        const freshToken = await this.getAccessToken();
        return this.generatePcmForChunkWithRetry(chunk, voice, chunkIndex, totalChunks, freshToken, attempt + 1);
      }

      logger.error(
        {
          chunkIndex: chunkIndex + 1,
          totalChunks,
          voiceId: voice.voiceId,
          error: axiosError.message,
          status: axiosError.response?.status,
          responseData: axiosError.response?.data,
          requestChunkPreview: chunk.slice(0, 200),
        },
        'Vertex AI chunk TTS generation failed'
      );

      throw new Error(
        `Vertex AI TTS failed for chunk ${chunkIndex + 1}/${totalChunks}: ${axiosError.message}`
      );
    }
  }

  /**
   * Generate PCM audio for a single chunk via Vertex AI.
   */
  private async generatePcmForChunk(
    chunk: string,
    voice: VoiceConfig,
    chunkIndex: number,
    totalChunks: number,
    accessToken: string
  ): Promise<Buffer> {
    const startTime = Date.now();

    // Vertex AI endpoint format
    const endpoint = `/projects/${this.projectId}/locations/${this.region}/publishers/google/models/${this.modelId}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: chunk }],
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
    };

    const response = await this.client.post(endpoint, requestBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const audioData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!audioData?.data) {
      throw new Error(`No audio data in Vertex AI response for chunk ${chunkIndex + 1}/${totalChunks}`);
    }

    const pcmBuffer = Buffer.from(audioData.data, 'base64');
    const processingTime = Date.now() - startTime;

    logger.debug(
      {
        chunkIndex: chunkIndex + 1,
        totalChunks,
        chunkLength: chunk.length,
        pcmSize: pcmBuffer.length,
        processingTime,
        hasDirectorNotes: chunk.includes(DIRECTOR_NOTES_MARKER),
      },
      `Generated PCM for chunk ${chunkIndex + 1}/${totalChunks} via Vertex AI`
    );

    return pcmBuffer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create Vertex AI TTS service from environment variables
 */
export function createVertexTTSService(
  config?: Partial<VertexTTSConfig>
): VertexTTSService {
  const serviceAccountJson =
    config?.serviceAccountJson || process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON environment variable is required for Vertex AI TTS'
    );
  }

  return new VertexTTSService({
    serviceAccountJson,
    projectId: config?.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID,
    region: config?.region || process.env.VERTEX_AI_REGION || 'us-central1',
    modelId: config?.modelId || process.env.VERTEX_TTS_MODEL || 'gemini-2.5-flash-lite-preview-tts',
    ...config,
  });
}
