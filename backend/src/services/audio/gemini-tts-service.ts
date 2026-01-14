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
 * Maximum characters for the transcript portion of each chunk.
 * Director's notes header adds ~1200 chars, so this leaves room under typical limits.
 */
const MAX_TRANSCRIPT_CHARS = 3500;

/**
 * Marker that separates director's notes from the actual transcript.
 * Everything before this marker is performance guidance (not vocalized).
 * Everything after is the actual text to speak.
 */
const DIRECTOR_NOTES_MARKER = '#### TRANSCRIPT\n';

/**
 * Parsed prompt with director's notes separated from transcript
 */
interface ParsedPrompt {
  /** Everything up to and including "#### TRANSCRIPT\n" */
  directorsHeader: string;
  /** The actual text to speak (after the marker) */
  transcript: string;
}

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
 * Available Gemini TTS voices (as of Jan 2026)
 * Full list of 30 voices with their characteristics
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export const GEMINI_AVAILABLE_VOICES = [
  // Original 8 voices
  'Zephyr',    // Bright
  'Puck',      // Upbeat
  'Charon',    // Informative
  'Kore',      // Firm
  'Fenrir',    // Excitable
  'Leda',      // Youthful
  'Orus',      // Firm
  'Aoede',     // Breezy
  // Additional 22 voices
  'Callirrhoe',    // Easy-going
  'Autonoe',       // Bright
  'Enceladus',     // Breathy
  'Iapetus',       // Clear
  'Umbriel',       // Easy-going
  'Algieba',       // Smooth
  'Despina',       // Smooth
  'Erinome',       // Clear
  'Algenib',       // Gravelly
  'Rasalgethi',    // Informative
  'Laomedeia',     // Upbeat
  'Achernar',      // Soft
  'Alnilam',       // Firm
  'Schedar',       // Even
  'Gacrux',        // Mature
  'Pulcherrima',   // Forward
  'Achird',        // Friendly
  'Zubenelgenubi', // Casual
  'Vindemiatrix',  // Gentle
  'Sadachbia',     // Lively
  'Sadaltager',    // Knowledgeable
  'Sulafat',       // Warm
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

  async generateSpeech(text: string, voiceType: VoiceType, customVoiceId?: string): Promise<TTSResult> {
    // Use custom voice ID if provided (for previews), otherwise use voice profile
    const baseVoice = this.voiceProfiles[voiceType];
    const voice: VoiceConfig = customVoiceId
      ? { ...baseVoice, voiceId: customVoiceId }
      : baseVoice;

    // Gemini TTS understands the structured prompt format with director's notes
    // The markdown format (# AUDIO PROFILE, ## THE SCENE, ### DIRECTOR'S NOTES, #### TRANSCRIPT)
    // guides voice performance while only vocalizing the transcript section.
    // IMPORTANT: Do NOT use system_instruction - it's not supported by TTS models.

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
      'Generating speech with Gemini (chunked with director notes per chunk)'
    );

    // Generate PCM for each chunk with retry logic
    const pcmBuffers: Buffer[] = [];
    for (const [i, chunk] of chunks.entries()) {
      const pcm = await this.limiter.schedule(async () => {
        return this.generatePcmForChunkWithRetry(chunk, voice, i, chunks.length, 1);
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
      'Speech generated successfully via Gemini (all chunks)'
    );

    return {
      audioBuffer,
      durationMs,
      charactersUsed: parsed.transcript.length, // Only transcript counts for billing
    };
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

  /**
   * Parse text to separate director's notes header from transcript.
   * Director's notes (everything before "#### TRANSCRIPT\n") guide voice performance.
   * Only the transcript portion is vocalized.
   */
  private parseDirectorPrompt(text: string): ParsedPrompt {
    const idx = text.indexOf(DIRECTOR_NOTES_MARKER);

    if (idx === -1) {
      // No director's notes marker - treat entire text as transcript
      return { directorsHeader: '', transcript: text };
    }

    return {
      directorsHeader: text.slice(0, idx + DIRECTOR_NOTES_MARKER.length),
      transcript: text.slice(idx + DIRECTOR_NOTES_MARKER.length),
    };
  }

  /**
   * Split long transcript into chunks at sentence boundaries.
   * Ensures natural pauses between chunks when audio is concatenated.
   */
  private chunkTranscript(transcript: string): string[] {
    if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
      return [transcript];
    }

    const chunks: string[] = [];
    let remaining = transcript;

    while (remaining.length > MAX_TRANSCRIPT_CHARS) {
      // Find last sentence boundary within limit
      const searchWindow = remaining.slice(0, MAX_TRANSCRIPT_CHARS);
      const lastPeriod = searchWindow.lastIndexOf('. ');
      const lastQuestion = searchWindow.lastIndexOf('? ');
      const lastExclaim = searchWindow.lastIndexOf('! ');

      const splitPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);

      if (splitPoint === -1) {
        // No sentence boundary - split at last space
        const lastSpace = searchWindow.lastIndexOf(' ');
        if (lastSpace > 0) {
          chunks.push(remaining.slice(0, lastSpace));
          remaining = remaining.slice(lastSpace + 1);
        } else {
          // No space found - force split
          chunks.push(remaining.slice(0, MAX_TRANSCRIPT_CHARS));
          remaining = remaining.slice(MAX_TRANSCRIPT_CHARS);
        }
      } else {
        // Split at sentence boundary (include the punctuation)
        chunks.push(remaining.slice(0, splitPoint + 1));
        remaining = remaining.slice(splitPoint + 2); // Skip ". " or "? " or "! "
      }
    }

    if (remaining.trim()) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * Build final chunks by prepending director's notes header to each transcript chunk.
   * This ensures every chunk gets the same voice performance guidance.
   */
  private buildChunksWithDirectors(parsed: ParsedPrompt): string[] {
    const transcriptChunks = this.chunkTranscript(parsed.transcript);

    if (!parsed.directorsHeader) {
      return transcriptChunks; // No header to prepend
    }

    return transcriptChunks.map((chunk) => parsed.directorsHeader + chunk);
  }

  /**
   * Generate PCM audio for a single chunk with retry logic.
   * Wraps generatePcmForChunk with exponential backoff for retryable errors.
   */
  private async generatePcmForChunkWithRetry(
    chunk: string,
    voice: VoiceConfig,
    chunkIndex: number,
    totalChunks: number,
    attempt: number = 1
  ): Promise<Buffer> {
    try {
      return await this.generatePcmForChunk(chunk, voice, chunkIndex, totalChunks);
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
          'Chunk TTS request failed, retrying'
        );

        await this.sleep(delay);
        return this.generatePcmForChunkWithRetry(chunk, voice, chunkIndex, totalChunks, attempt + 1);
      }

      logger.error(
        {
          chunkIndex: chunkIndex + 1,
          totalChunks,
          voiceId: voice.voiceId,
          error: axiosError.message,
          status: axiosError.response?.status,
        },
        'Chunk TTS generation failed'
      );

      throw new Error(
        `Gemini TTS failed for chunk ${chunkIndex + 1}/${totalChunks}: ${axiosError.message}`
      );
    }
  }

  /**
   * Generate PCM audio for a single chunk.
   * Returns raw PCM buffer (16-bit signed LE, 24kHz, mono).
   */
  private async generatePcmForChunk(
    chunk: string,
    voice: VoiceConfig,
    chunkIndex: number,
    totalChunks: number
  ): Promise<Buffer> {
    const startTime = Date.now();

    const requestBody: Record<string, unknown> = {
      contents: [
        {
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
      throw new Error(`No audio data in Gemini response for chunk ${chunkIndex + 1}/${totalChunks}`);
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
      `Generated PCM for chunk ${chunkIndex + 1}/${totalChunks}`
    );

    return pcmBuffer;
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
