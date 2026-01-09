/**
 * Podcast TTS Adapter
 *
 * Wraps the generic ITTSService for podcast-specific needs.
 * Handles provider selection, tag conversion, and speaker role mapping.
 */

import pino from 'pino';
import Bottleneck from 'bottleneck';
import type {
  PodcastSegment,
  TTSProviderType,
  GeminiDirectorNotes,
} from '../../types/podcast-export.js';
import type { ITTSService, VoiceType } from '../audio/types.js';
import { getTTSService, isProviderAvailable } from '../audio/tts-provider-factory.js';
import { AudioTagConverter } from './audio-tag-converter.js';

const logger = pino({
  name: 'podcast-tts-adapter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Usage statistics for cost tracking
 */
export interface PodcastTTSUsageStats {
  totalCharacters: number;
  totalRequests: number;
  estimatedCostCents: number;
  provider: TTSProviderType;
}

/**
 * TTS response for a single segment
 */
export interface PodcastTTSResponse {
  audio: Buffer;
  characterCount: number;
  durationMs?: number;
}

/**
 * Cost estimates per 1000 characters by provider
 * These are approximate and subject to change
 */
const COST_PER_1000_CHARS_CENTS: Record<TTSProviderType, number> = {
  elevenlabs: 15,           // $0.15 per 1K chars (Creator tier)
  gemini: 1.5,              // ~$0.015 per 1K chars (much cheaper)
  'google-cloud-long': 1.6, // ~$0.016 per 1K chars for Neural2 voices
};

/**
 * Podcast TTS Adapter
 *
 * Provides a unified interface for generating podcast audio
 * with support for multiple TTS providers.
 */
export class PodcastTTSAdapter {
  private readonly provider: TTSProviderType;
  private readonly service: ITTSService;
  private readonly tagConverter: AudioTagConverter;
  private readonly limiter: Bottleneck;
  private usageStats: PodcastTTSUsageStats;
  private geminiDirectorNotes?: GeminiDirectorNotes;

  constructor(provider: TTSProviderType = 'elevenlabs') {
    this.provider = provider;
    this.tagConverter = new AudioTagConverter(provider === 'google-cloud-long' ? 'elevenlabs' : provider);

    // Validate provider is available
    // Map podcast provider type to audio service provider type
    const serviceProvider = provider as 'elevenlabs' | 'gemini' | 'google-cloud-long';
    if (!isProviderAvailable(serviceProvider)) {
      throw new Error(
        `TTS provider '${provider}' is not available. ` +
        `Please configure the required API key.`
      );
    }

    this.service = getTTSService(serviceProvider);

    // Rate limiter - adjust based on provider
    // Gemini has lower limits, google-cloud-long is async so no limits needed
    const rpmLimit = provider === 'gemini' ? 30 : provider === 'google-cloud-long' ? 60 : 100;
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / rpmLimit),
      maxConcurrent: provider === 'gemini' ? 2 : 3,
    });

    this.usageStats = {
      totalCharacters: 0,
      totalRequests: 0,
      estimatedCostCents: 0,
      provider,
    };

    logger.info({ provider }, 'Podcast TTS adapter initialized');
  }

  /**
   * Set Gemini director's notes for performance guidance
   * These notes influence how Gemini TTS delivers the speech
   */
  setGeminiDirectorNotes(notes: GeminiDirectorNotes | undefined): void {
    this.geminiDirectorNotes = notes;
    if (notes && this.provider === 'gemini') {
      logger.info(
        { speakerCount: Object.keys(notes.speakerDirections).length },
        'Gemini director\'s notes configured'
      );
    }
  }

  /**
   * Generate audio for a single podcast segment
   */
  async generateSegmentAudio(segment: PodcastSegment): Promise<PodcastTTSResponse> {
    return this.limiter.schedule(async () => {
      // Convert tags for the target provider
      const convertedText = this.tagConverter.convert(segment.text);

      // Map speaker role to voice type (fallback if no custom voice ID)
      const voiceType = this.mapSpeakerToVoiceType(segment.speaker);

      // For Gemini, prepend director's notes if available
      const textWithDirection = this.provider === 'gemini'
        ? this.prependGeminiDirectorNotes(convertedText, segment.speaker)
        : convertedText;

      logger.debug({
        speaker: segment.speaker,
        voiceType,
        customVoiceId: segment.voiceId,
        provider: this.provider,
        originalLength: segment.text.length,
        convertedLength: convertedText.length,
        withDirectionLength: textWithDirection.length,
        hasDirectorNotes: !!this.geminiDirectorNotes,
      }, 'Generating segment audio');

      // Generate speech using the underlying service
      // Pass customVoiceId if provided in the segment (user-selected voice)
      const result = await this.service.generateSpeech(textWithDirection, voiceType, segment.voiceId);

      // Track usage (only count the actual transcript text, not director's notes)
      this.trackUsage(convertedText.length);

      return {
        audio: result.audioBuffer,
        characterCount: result.charactersUsed,
        durationMs: result.durationMs,
      };
    });
  }

  /**
   * Prepend Gemini director's notes to the text for performance guidance
   *
   * Uses the structured prompt format that Gemini TTS recognizes:
   * - # AUDIO PROFILE: Character description
   * - ## THE SCENE: Context
   * - ### DIRECTOR'S NOTES: Performance guidance
   * - #### TRANSCRIPT: Text to speak (ONLY this part is vocalized)
   *
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  private prependGeminiDirectorNotes(text: string, speaker: string): string {
    if (!this.geminiDirectorNotes) {
      return text;
    }

    const { showContext, speakerDirections, sceneContext, pacingNotes } = this.geminiDirectorNotes;

    // Get speaker-specific direction
    const speakerDirection = speakerDirections[speaker];

    // Build the structured prompt using Gemini's expected markdown format
    const promptParts: string[] = [];

    // Audio Profile section - character identity
    if (speakerDirection) {
      promptParts.push(
        `# AUDIO PROFILE: ${speakerDirection.characterProfile}`,
        '',
        speakerDirection.vocalStyle,
        ''
      );
    }

    // Scene section - environment and context
    promptParts.push(
      '## THE SCENE',
      '',
      sceneContext,
      '',
      showContext,
      ''
    );

    // Director's Notes section - performance guidance
    promptParts.push(
      '### DIRECTOR\'S NOTES',
      ''
    );

    if (speakerDirection) {
      promptParts.push(speakerDirection.performanceNotes, '');
    }

    promptParts.push(pacingNotes, '');

    // Transcript section - ONLY this part gets spoken
    promptParts.push(
      '#### TRANSCRIPT',
      '',
      text
    );

    return promptParts.join('\n');
  }

  /**
   * Generate audio for all segments in a script
   */
  async generateFullPodcast(
    segments: PodcastSegment[],
    onProgress?: (current: number, total: number) => void
  ): Promise<{ audioBuffers: Buffer[]; stats: PodcastTTSUsageStats }> {
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const response = await this.generateSegmentAudio(segment);
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
   * Map podcast speaker role to VoiceType for ITTSService
   */
  private mapSpeakerToVoiceType(speaker: string): VoiceType {
    const mapping: Record<string, VoiceType> = {
      // Direct mappings
      pro: 'pro',
      con: 'con',
      moderator: 'moderator',
      narrator: 'narrator',

      // Podcast-specific roles
      pro_advocate: 'pro',
      con_advocate: 'con',

      // Duelogic chairs - map to alternating voices
      arbiter: 'moderator',
      chair_1: 'pro',
      chair_2: 'con',
      chair_3: 'pro',      // Alternate
      chair_4: 'con',      // Alternate
      chair_5: 'pro',      // Alternate
      chair_6: 'con',      // Alternate

      // Informal participants
      participant_1: 'pro',
      participant_2: 'con',
      participant_3: 'pro',
      participant_4: 'con',
    };

    return mapping[speaker] || 'narrator';
  }

  /**
   * Track usage for cost estimation
   */
  private trackUsage(characterCount: number): void {
    this.usageStats.totalCharacters += characterCount;
    this.usageStats.totalRequests += 1;
    this.usageStats.estimatedCostCents += Math.ceil(
      (characterCount / 1000) * COST_PER_1000_CHARS_CENTS[this.provider]
    );
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): PodcastTTSUsageStats {
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
      provider: this.provider,
    };
  }

  /**
   * Estimate cost for a given character count
   */
  static estimateCostCents(characterCount: number, provider: TTSProviderType): number {
    return Math.ceil((characterCount / 1000) * COST_PER_1000_CHARS_CENTS[provider]);
  }

  /**
   * Get the current provider
   */
  getProvider(): TTSProviderType {
    return this.provider;
  }

  /**
   * Check if provider is available
   */
  static isProviderAvailable(provider: TTSProviderType): boolean {
    return isProviderAvailable(provider as 'elevenlabs' | 'gemini' | 'google-cloud-long');
  }
}

/**
 * Create a podcast TTS adapter for the specified provider
 */
export function createPodcastTTSAdapter(provider: TTSProviderType = 'elevenlabs'): PodcastTTSAdapter {
  return new PodcastTTSAdapter(provider);
}

/**
 * Get available podcast TTS providers
 */
export function getAvailablePodcastProviders(): TTSProviderType[] {
  const available: TTSProviderType[] = [];

  if (process.env.ELEVENLABS_API_KEY) {
    available.push('elevenlabs');
  }

  if (process.env.GOOGLE_AI_API_KEY) {
    available.push('gemini');
  }

  if (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CLOUD_TTS_BUCKET) {
    available.push('google-cloud-long');
  }

  return available;
}
