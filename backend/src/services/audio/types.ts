/**
 * Audio Export Service Type Definitions
 *
 * Defines types for audio export configuration, voice profiles, and pipeline stages.
 * These types are used across all audio export functionality.
 *
 * @see tasks/phase2/audio-export/AUDIO-001.md
 */

/**
 * Voice type identifiers matching debate speakers
 */
export type VoiceType = 'pro' | 'con' | 'moderator' | 'narrator';

/**
 * Available TTS providers
 *
 * - elevenlabs: Premium quality, paid API ($5+ per month)
 * - gemini: Google Gemini 2.5 TTS via AI Studio API
 * - google-cloud: Google Cloud Text-to-Speech (1M chars/month free)
 * - google-cloud-long: Google Cloud Long Audio Synthesis (async, up to 1MB input)
 * - azure: Microsoft Azure Cognitive Services TTS (500K chars/month free)
 * - edge: Microsoft Edge TTS (completely free, no API key needed)
 */
export type TTSProvider = 'elevenlabs' | 'gemini' | 'google-cloud' | 'google-cloud-long' | 'azure' | 'edge';

/**
 * TTS Provider metadata for UI display
 */
export interface TTSProviderInfo {
  id: TTSProvider;
  name: string;
  description: string;
  freeTier: string;
  quality: 'premium' | 'high' | 'good' | 'standard';
  requiresApiKey: boolean;
  envVar?: string;
}

/**
 * Speaker identifiers from the debate system
 */
export type Speaker = 'pro' | 'con' | 'moderator';

/**
 * Audio export job status
 */
export type AudioJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Audio output format
 */
export type AudioFormat = 'mp3' | 'wav' | 'ogg';

/**
 * Voice configuration for TTS
 */
export interface VoiceConfig {
  /** ElevenLabs voice ID */
  voiceId: string;
  /** Voice name for display */
  name: string;
  /** Stability setting (0-1) - higher = more consistent */
  stability: number;
  /** Similarity boost (0-1) - higher = more similar to original voice */
  similarityBoost: number;
  /** Style exaggeration (0-1) - higher = more expressive */
  style?: number;
  /** Use speaker boost for clarity */
  useSpeakerBoost?: boolean;
}

/**
 * Voice profiles for different speakers
 */
export interface VoiceProfiles {
  pro: VoiceConfig;
  con: VoiceConfig;
  moderator: VoiceConfig;
  narrator: VoiceConfig;
}

/**
 * Audio segment representing a single TTS block
 */
export interface AudioSegment {
  /** Unique segment identifier */
  id: string;
  /** Original text to be spoken */
  text: string;
  /** SSML-formatted text for TTS */
  ssml: string;
  /** Voice type for this segment */
  voiceType: VoiceType;
  /** Segment metadata */
  metadata: {
    /** Debate phase this belongs to */
    phase: string;
    /** Display name for the phase */
    phaseName: string;
    /** Index within the phase */
    index: number;
    /** Speaker display name */
    speakerName: string;
    /** Estimated duration in seconds */
    estimatedDuration: number;
    /** Whether this utterance was interrupted (for TTS prosody) */
    wasInterrupted?: boolean;
    /** Whether this is an interjection (for TTS prosody) */
    isInterjection?: boolean;
    /** Interruption energy level 1-5 (for TTS prosody) */
    interruptionEnergy?: number;
  };
}

/**
 * Audio script containing all segments for a debate
 */
export interface AudioScript {
  /** All audio segments in order */
  segments: AudioSegment[];
  /** Total estimated duration in seconds */
  totalDuration: number;
  /** Chapter markers for navigation */
  chapters: ChapterMarker[];
  /** Debate metadata */
  metadata: {
    debateId: string;
    proposition: string;
    generatedAt: string;
  };
}

/**
 * Chapter marker for audio navigation
 */
export interface ChapterMarker {
  /** Chapter title */
  title: string;
  /** Start time in milliseconds */
  startTimeMs: number;
  /** End time in milliseconds */
  endTimeMs: number;
  /** Debate phase identifier */
  phase: string;
}

/**
 * Options for audio export
 */
export interface AudioExportOptions {
  /** Output audio format */
  format?: AudioFormat;
  /** Include background music */
  includeBackgroundMusic?: boolean;
  /** Background music volume (0-1) */
  backgroundMusicVolume?: number;
  /** Voice speed multiplier (0.5-2.0) */
  voiceSpeed?: number;
  /** Include intro/outro */
  includeIntroOutro?: boolean;
  /** Normalize audio levels */
  normalizeAudio?: boolean;
  /** Custom voice profiles override */
  voiceProfiles?: Partial<VoiceProfiles>;
  /** Pause duration between segments in ms */
  pauseBetweenSegments?: number;
  /** Pause duration between phases in ms */
  pauseBetweenPhases?: number;
}

/**
 * Default audio export options
 */
export const DEFAULT_AUDIO_OPTIONS: Required<AudioExportOptions> = {
  format: 'mp3',
  includeBackgroundMusic: false,
  backgroundMusicVolume: 0.1,
  voiceSpeed: 1.0,
  includeIntroOutro: true,
  normalizeAudio: true,
  voiceProfiles: {},
  pauseBetweenSegments: 500,
  pauseBetweenPhases: 1500,
};

/**
 * Audio export job tracking
 */
export interface AudioExportJob {
  /** Unique job identifier */
  id: string;
  /** Debate ID being exported */
  debateId: string;
  /** Current job status */
  status: AudioJobStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current stage description */
  stage: string;
  /** Export options used */
  options: AudioExportOptions;
  /** Output file path when complete */
  outputPath?: string;
  /** Output file URL when complete */
  outputUrl?: string;
  /** File size in bytes when complete */
  fileSizeBytes?: number;
  /** Duration in seconds when complete */
  durationSeconds?: number;
  /** Error message if failed */
  error?: string;
  /** Job creation timestamp */
  createdAt: string;
  /** Job completion timestamp */
  completedAt?: string;
}

/**
 * TTS generation result
 */
export interface TTSResult {
  /** Audio buffer */
  audioBuffer: Buffer;
  /** Audio duration in milliseconds */
  durationMs: number;
  /** Characters used for billing */
  charactersUsed: number;
}

/**
 * Audio processing result
 */
export interface AudioProcessingResult {
  /** Output file path */
  outputPath: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** Duration in seconds */
  durationSeconds: number;
  /** Processing metadata */
  metadata: {
    format: AudioFormat;
    bitrate: string;
    sampleRate: number;
    channels: number;
  };
}

/**
 * ID3 tag data for MP3 files
 */
export interface ID3Tags {
  /** Track title */
  title: string;
  /** Artist name */
  artist: string;
  /** Album name */
  album: string;
  /** Year of creation */
  year: string;
  /** Genre */
  genre: string;
  /** Comment */
  comment: string;
  /** Track number */
  trackNumber?: string;
  /** Cover art image buffer */
  image?: Buffer;
}

/**
 * Audio export result
 */
export interface AudioExportResult {
  /** Whether export was successful */
  success: boolean;
  /** Job ID for tracking */
  jobId: string;
  /** Output file path */
  filePath?: string;
  /** Output file URL */
  fileUrl?: string;
  /** Export metadata */
  metadata?: {
    debateId: string;
    format: AudioFormat;
    fileSizeBytes: number;
    durationSeconds: number;
    generatedAt: string;
    exporterVersion: string;
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Generic TTS Service interface
 *
 * All TTS providers must implement this interface for compatibility
 * with the audio export pipeline.
 */
export interface ITTSService {
  /** Provider identifier */
  readonly provider: TTSProvider;

  /**
   * Generate speech from text
   * @param text - Text to convert to speech
   * @param voiceType - Voice type to use (pro, con, moderator, narrator)
   * @returns Audio buffer and metadata
   */
  generateSpeech(text: string, voiceType: VoiceType): Promise<TTSResult>;

  /**
   * Get voice configuration for a voice type
   */
  getVoiceConfig(voiceType: VoiceType): VoiceConfig;

  /**
   * Check if the service is available (API key configured, etc.)
   */
  isAvailable(): boolean;
}

/**
 * TTS Provider registry with metadata
 */
export const TTS_PROVIDERS: Record<TTSProvider, TTSProviderInfo> = {
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'Premium AI voices with exceptional quality and emotion',
    freeTier: '10,000 chars/month (non-commercial)',
    quality: 'premium',
    requiresApiKey: true,
    envVar: 'ELEVENLABS_API_KEY',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini TTS',
    description: 'Gemini 2.5 native TTS with multi-speaker support',
    freeTier: 'Pay-as-you-go (low cost)',
    quality: 'premium',
    requiresApiKey: true,
    envVar: 'GOOGLE_AI_API_KEY',
  },
  'google-cloud': {
    id: 'google-cloud',
    name: 'Google Cloud TTS',
    description: 'Google WaveNet and Neural2 voices',
    freeTier: '1M chars/month free',
    quality: 'high',
    requiresApiKey: true,
    envVar: 'GOOGLE_CLOUD_API_KEY',
  },
  'google-cloud-long': {
    id: 'google-cloud-long',
    name: 'Google Cloud Long Audio',
    description: 'Async synthesis for long content (up to 1MB), outputs to GCS',
    freeTier: '1M chars/month free',
    quality: 'high',
    requiresApiKey: true,
    envVar: 'GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON',
  },
  azure: {
    id: 'azure',
    name: 'Microsoft Azure TTS',
    description: 'Azure Cognitive Services Neural TTS',
    freeTier: '500K chars/month free',
    quality: 'high',
    requiresApiKey: true,
    envVar: 'AZURE_SPEECH_KEY',
  },
  edge: {
    id: 'edge',
    name: 'Edge TTS (Free)',
    description: 'Microsoft Edge browser TTS - completely free',
    freeTier: 'Unlimited (no API key needed)',
    quality: 'good',
    requiresApiKey: false,
  },
};
