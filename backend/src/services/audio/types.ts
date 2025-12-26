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
