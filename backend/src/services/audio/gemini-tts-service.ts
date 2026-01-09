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
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
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
 * Maximum characters per chunk for Gemini TTS
 * Gemini processing time scales non-linearly with text length.
 * ~1000 chars takes ~45s, ~2000 chars can take >120s or timeout.
 * Keep chunks small for reliable generation.
 */
const MAX_CHUNK_SIZE = 1000;

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
    this.maxRetries = config.maxRetries || 5; // More retries for rate limits

    this.voiceProfiles = {
      ...GEMINI_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Create axios client for Gemini API
    // Longer timeout (6 min) since TTS generation can take time for longer segments
    this.client = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      timeout: config.timeout || 360000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Rate limiter - moderate for paid tier (30 RPM, 2 concurrent)
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 30)),
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

  async generateSpeech(text: string, voiceType: VoiceType, _customVoiceId?: string): Promise<TTSResult> {
    const voice = this.voiceProfiles[voiceType];

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Generating speech with Gemini'
    );

    // Gemini TTS understands the structured prompt format with director's notes
    // The markdown format (# AUDIO PROFILE, ## THE SCENE, ### DIRECTOR'S NOTES, #### TRANSCRIPT)
    // guides voice performance while only vocalizing the transcript section.
    // IMPORTANT: Do NOT use system_instruction - it's not supported by TTS models.
    // Pass the full text with embedded director's notes instead.

    // Split text into chunks to avoid timeout
    const chunks = this.splitIntoChunks(text);

    if (chunks.length === 1) {
      // Single chunk - direct generation
      return this.limiter.schedule(async () => {
        return this.generateSpeechWithRetry(text, voice, 1);
      });
    }

    // Multiple chunks - generate each and concatenate
    // For chunked processing with director's notes, prepend notes to each chunk
    // to maintain consistent voice performance guidance
    const transcriptMarker = '#### TRANSCRIPT';
    const hasDirectorNotes = text.includes(transcriptMarker);
    let directorNotesPrefix = '';
    let baseTranscript = text;

    if (hasDirectorNotes) {
      const markerIndex = text.indexOf(transcriptMarker);
      directorNotesPrefix = text.substring(0, markerIndex + transcriptMarker.length) + '\n\n';
      baseTranscript = text.substring(markerIndex + transcriptMarker.length).trim();
    }

    // Re-chunk just the transcript portion
    const transcriptChunks = this.splitIntoChunks(baseTranscript);

    logger.info(
      {
        totalLength: text.length,
        transcriptLength: baseTranscript.length,
        chunkCount: transcriptChunks.length,
        chunkSizes: transcriptChunks.map(c => c.length),
        hasDirectorNotes,
      },
      'Splitting text into chunks for Gemini TTS'
    );

    const pcmBuffers: Buffer[] = [];
    let totalCharacters = 0;

    for (let i = 0; i < transcriptChunks.length; i++) {
      const chunk = transcriptChunks[i]!;
      // Prepend director's notes to each chunk for consistent voice guidance
      const chunkWithNotes = hasDirectorNotes
        ? directorNotesPrefix + chunk
        : chunk;

      logger.debug(
        { chunkIndex: i + 1, totalChunks: transcriptChunks.length, chunkLength: chunk.length },
        'Processing chunk'
      );

      const pcmBuffer = await this.limiter.schedule(async () => {
        return this.generatePcmForChunk(chunkWithNotes, voice, 1);
      });

      pcmBuffers.push(pcmBuffer);
      totalCharacters += chunk.length;
    }

    // Concatenate all PCM buffers
    const combinedPcm = Buffer.concat(pcmBuffers);

    // Convert final PCM to MP3
    const audioBuffer = await this.convertPcmToMp3(combinedPcm);

    // Calculate duration from combined PCM
    const durationMs = (combinedPcm.length / 48000) * 1000;

    logger.info(
      {
        voiceId: voice.voiceId,
        totalLength: text.length,
        chunkCount: transcriptChunks.length,
        combinedPcmSize: combinedPcm.length,
        mp3Size: audioBuffer.length,
        durationMs: Math.round(durationMs),
      },
      'Chunked speech generation complete'
    );

    return {
      audioBuffer,
      durationMs,
      charactersUsed: totalCharacters,
    };
  }

  /**
   * Split text into chunks at sentence boundaries
   * Keeps chunks under MAX_CHUNK_SIZE for reliable Gemini processing
   */
  private splitIntoChunks(text: string): string[] {
    if (text.length <= MAX_CHUNK_SIZE) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK_SIZE) {
        chunks.push(remaining.trim());
        break;
      }

      // Find a good split point (sentence boundary)
      let splitIndex = MAX_CHUNK_SIZE;

      // Look for sentence endings within the chunk
      const searchArea = remaining.substring(0, MAX_CHUNK_SIZE);
      const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n', '."', '!"', '?"'];

      let lastSentenceEnd = -1;
      for (const ending of sentenceEndings) {
        const idx = searchArea.lastIndexOf(ending);
        if (idx > lastSentenceEnd) {
          lastSentenceEnd = idx + ending.length;
        }
      }

      if (lastSentenceEnd > MAX_CHUNK_SIZE * 0.4) {
        // Found a good sentence break point (at least 40% into chunk)
        splitIndex = lastSentenceEnd;
      } else {
        // No good sentence break, try comma or word boundary
        const lastComma = searchArea.lastIndexOf(', ');
        if (lastComma > MAX_CHUNK_SIZE * 0.5) {
          splitIndex = lastComma + 2;
        } else {
          const lastSpace = searchArea.lastIndexOf(' ');
          if (lastSpace > MAX_CHUNK_SIZE * 0.5) {
            splitIndex = lastSpace + 1;
          }
          // Otherwise just split at max
        }
      }

      chunks.push(remaining.substring(0, splitIndex).trim());
      remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
  }

  /**
   * Generate PCM audio for a single chunk (used for chunked processing)
   * Returns raw PCM buffer without MP3 conversion
   */
  private async generatePcmForChunk(
    text: string,
    voice: VoiceConfig,
    attempt: number = 1
  ): Promise<Buffer> {
    try {
      const startTime = Date.now();

      // Build request body - pass full text including any director's notes
      // Gemini TTS understands structured prompts and only vocalizes transcript
      const requestBody: Record<string, unknown> = {
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
      };

      const response = await this.client.post(
        `/models/${this.modelId}:generateContent`,
        requestBody,
        {
          params: {
            key: this.apiKey,
          },
        }
      );

      const audioData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (!audioData?.data) {
        throw new Error('No audio data in Gemini response');
      }

      const pcmBuffer = Buffer.from(audioData.data, 'base64');
      const processingTime = Date.now() - startTime;

      logger.debug(
        {
          voiceId: voice.voiceId,
          textLength: text.length,
          pcmSize: pcmBuffer.length,
          processingTime,
        },
        'Chunk PCM generated'
      );

      return pcmBuffer;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (attempt < this.maxRetries && this.isRetryableError(axiosError)) {
        const isRateLimit = axiosError.response?.status === 429;
        const baseDelay = isRateLimit ? 5000 : 1000;
        const delay = Math.pow(2, attempt - 1) * baseDelay + Math.random() * 500;

        logger.warn(
          { attempt, delay: Math.round(delay), isRateLimit, error: axiosError.message },
          'Chunk generation failed, retrying'
        );

        await this.sleep(delay);
        return this.generatePcmForChunk(text, voice, attempt + 1);
      }

      throw new Error(`Gemini TTS chunk failed: ${axiosError.message}`);
    }
  }

  private async generateSpeechWithRetry(
    text: string,
    voice: VoiceConfig,
    attempt: number = 1
  ): Promise<TTSResult> {
    try {
      const startTime = Date.now();

      // Build request body - pass full text including any director's notes
      // Gemini TTS understands structured prompts and only vocalizes transcript
      // NOTE: Do NOT use system_instruction - it's not supported by TTS models
      const requestBody: Record<string, unknown> = {
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
      };

      logger.debug(
        { voiceId: voice.voiceId, textLength: text.length },
        'Sending TTS request to Gemini'
      );

      // Gemini TTS uses the generateContent endpoint with audio output
      const response = await this.client.post(
        `/models/${this.modelId}:generateContent`,
        requestBody,
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

      // Decode base64 audio (raw PCM: 16-bit signed LE, 24kHz, mono)
      const pcmBuffer = Buffer.from(audioData.data, 'base64');

      // Convert PCM to MP3
      const audioBuffer = await this.convertPcmToMp3(pcmBuffer);

      const processingTime = Date.now() - startTime;

      // Calculate actual duration from PCM data
      // PCM: 24kHz, mono, 16-bit = 48000 bytes per second
      const durationMs = (pcmBuffer.length / 48000) * 1000;

      logger.info(
        {
          voiceId: voice.voiceId,
          textLength: text.length,
          pcmSize: pcmBuffer.length,
          mp3Size: audioBuffer.length,
          durationMs: Math.round(durationMs),
          processingTime,
        },
        'Speech generated successfully via Gemini'
      );

      return {
        audioBuffer,
        durationMs,
        charactersUsed: text.length,
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      if (attempt < this.maxRetries && this.isRetryableError(axiosError)) {
        // Use moderate delays for retries, slightly longer for rate limits
        const isRateLimit = axiosError.response?.status === 429;
        const baseDelay = isRateLimit ? 5000 : 1000; // 5s for rate limits, 1s otherwise
        const delay = Math.pow(2, attempt - 1) * baseDelay + Math.random() * 500;

        logger.warn(
          { attempt, delay: Math.round(delay), isRateLimit, error: axiosError.message },
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
          '-f', 's16le',      // 16-bit signed little-endian PCM
          '-ar', '24000',     // 24kHz sample rate (Gemini's output rate)
          '-ac', '1',         // Mono
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

      // Write PCM data to input stream
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
