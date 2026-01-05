/**
 * Podcast Export Type Definitions for Frontend
 *
 * Types for podcast export functionality including voice assignments,
 * script refinement, and generation progress.
 */

// ============================================================================
// ElevenLabs Models and Formats
// ============================================================================

/**
 * Available ElevenLabs TTS models
 */
export type ElevenLabsModel =
  | 'eleven_v3'
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

/**
 * Audio output format options
 */
export type AudioOutputFormat = 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_44100';

/**
 * Podcast job status
 */
export type PodcastJobStatus = 'pending' | 'refining' | 'generating' | 'complete' | 'error';

// ============================================================================
// Voice Settings
// ============================================================================

/**
 * ElevenLabs voice settings for fine-tuning output
 */
export interface ElevenLabsVoiceSettings {
  stability: number;        // 0-1: Lower = more expressive
  similarity_boost: number; // 0-1: Voice clarity
  style: number;            // 0-1: Style exaggeration
  speed: number;            // 0.5-2.0: Playback speed
  use_speaker_boost: boolean;
}

/**
 * Voice assignment for a speaker role
 */
export interface VoiceAssignment {
  speakerId: string;         // 'moderator', 'pro_advocate', 'con_advocate', etc.
  voiceId: string;           // ElevenLabs voice ID
  voiceName: string;         // Display name (e.g., "Rachel", "Josh")
  settings: ElevenLabsVoiceSettings;
}

/**
 * Available voice from ElevenLabs
 */
export interface AvailableVoice {
  voiceId: string;
  name: string;
  recommended: boolean;
  previewUrl?: string;
}

// ============================================================================
// Podcast Script
// ============================================================================

/**
 * A single segment in the podcast script
 */
export interface PodcastSegment {
  index: number;
  speaker: string;           // Speaker identifier
  voiceId: string;           // ElevenLabs voice ID
  text: string;              // Max 5,000-10,000 chars
  voiceSettings: ElevenLabsVoiceSettings;
  previousText?: string;     // Context for natural flow
  nextText?: string;
  audioUrl?: string;         // Generated audio URL
  durationSeconds?: number;
}

/**
 * Refined podcast script ready for TTS generation
 */
export interface RefinedPodcastScript {
  title: string;
  totalCharacters: number;
  durationEstimateSeconds: number;
  segments: PodcastSegment[];
  intro?: PodcastSegment;
  outro?: PodcastSegment;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Export Configuration
// ============================================================================

/**
 * Podcast export configuration options
 */
export interface PodcastExportConfig {
  // Script refinement options
  refinementModel: string;        // LLM for script polish (e.g., "gpt-4o")
  includeIntro: boolean;
  includeOutro: boolean;
  addTransitions: boolean;

  // ElevenLabs settings
  elevenLabsModel: ElevenLabsModel;
  outputFormat: AudioOutputFormat;

  // Voice assignments per speaker
  voiceAssignments: Record<string, VoiceAssignment>;

  // Advanced options
  useCustomPronunciation: boolean;
  pronunciationDictionaryId?: string;
  normalizeVolume: boolean;
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Pipeline generation phases
 */
export type PipelinePhase =
  | 'idle'
  | 'initializing'
  | 'generating'
  | 'concatenating'
  | 'normalizing'
  | 'tagging'
  | 'complete'
  | 'error';

/**
 * Pipeline progress information
 */
export interface PipelineProgress {
  phase: PipelinePhase;
  currentSegment?: number;
  totalSegments?: number;
  percentComplete: number;
  message: string;
}

/**
 * API progress response
 */
export interface ProgressResponse {
  jobId: string;
  status: PodcastJobStatus;
  progressPercent: number;
  currentSegment?: number;
  totalSegments?: number;
  audioUrl?: string;
  durationSeconds?: number;
  actualCostCents?: number;
  errorMessage?: string;
}

// ============================================================================
// API Responses
// ============================================================================

/**
 * Refine script API response
 */
export interface RefineScriptResponse {
  jobId: string;
  script: RefinedPodcastScript;
  estimatedCostCents: number;
}

/**
 * Available voices API response
 */
export interface VoicesResponse {
  voices: {
    moderator: AvailableVoice[];
    pro_advocate: AvailableVoice[];
    con_advocate: AvailableVoice[];
    narrator: AvailableVoice[];
  };
}

/**
 * Update script API response
 */
export interface UpdateScriptResponse {
  script: RefinedPodcastScript;
  estimatedCostCents: number;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default ElevenLabs voice settings
 */
export const DEFAULT_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.4,
  speed: 1.0,
  use_speaker_boost: true,
};

/**
 * Default voice assignments for debate roles
 */
export const DEFAULT_VOICE_ASSIGNMENTS: Record<string, VoiceAssignment> = {
  moderator: {
    speakerId: 'moderator',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    voiceName: 'Bella',
    settings: {
      stability: 0.7,
      similarity_boost: 0.8,
      style: 0.3,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  pro_advocate: {
    speakerId: 'pro_advocate',
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    voiceName: 'Adam',
    settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  con_advocate: {
    speakerId: 'con_advocate',
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',
    voiceName: 'Sam',
    settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  narrator: {
    speakerId: 'narrator',
    voiceId: 'ThT5KcBeYPX3keUQqHPh',
    voiceName: 'Nicole',
    settings: {
      stability: 0.6,
      similarity_boost: 0.7,
      style: 0.4,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
};

/**
 * Default podcast export configuration
 */
export const DEFAULT_PODCAST_CONFIG: PodcastExportConfig = {
  refinementModel: 'openai/gpt-4o-mini',
  includeIntro: true,
  includeOutro: true,
  addTransitions: true,
  elevenLabsModel: 'eleven_multilingual_v2',
  outputFormat: 'mp3_44100_128',
  voiceAssignments: DEFAULT_VOICE_ASSIGNMENTS,
  useCustomPronunciation: false,
  normalizeVolume: true,
};

/**
 * Speaker role metadata
 */
export const SPEAKER_ROLES = [
  { id: 'moderator', label: 'Moderator', description: 'Professional, balanced' },
  { id: 'pro_advocate', label: 'Pro Advocate', description: 'Confident, persuasive' },
  { id: 'con_advocate', label: 'Con Advocate', description: 'Articulate, measured' },
  { id: 'narrator', label: 'Narrator (Intro/Outro)', description: 'Warm, inviting' },
] as const;

/**
 * ElevenLabs model options
 */
export const ELEVENLABS_MODELS: Array<{ id: ElevenLabsModel; name: string; description: string }> = [
  {
    id: 'eleven_multilingual_v2',
    name: 'Multilingual v2',
    description: 'Best quality, supports multiple languages',
  },
  {
    id: 'eleven_v3',
    name: 'English v3',
    description: 'Latest English model with excellent quality',
  },
  {
    id: 'eleven_turbo_v2_5',
    name: 'Turbo v2.5',
    description: 'Faster generation with good quality',
  },
  {
    id: 'eleven_flash_v2_5',
    name: 'Flash v2.5',
    description: 'Fastest generation, lower cost',
  },
];

/**
 * Audio format options
 */
export const AUDIO_FORMATS: Array<{ id: AudioOutputFormat; name: string; description: string }> = [
  {
    id: 'mp3_44100_128',
    name: 'MP3 High Quality',
    description: '44.1kHz, 128kbps',
  },
  {
    id: 'mp3_22050_32',
    name: 'MP3 Compact',
    description: '22kHz, 32kbps (smaller file)',
  },
  {
    id: 'pcm_44100',
    name: 'WAV Lossless',
    description: '44.1kHz PCM (largest file)',
  },
];
