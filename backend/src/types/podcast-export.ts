export type PodcastJobStatus = 'pending' | 'refining' | 'generating' | 'complete' | 'error';

export type ElevenLabsModel =
  | 'eleven_v3'
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

export type AudioOutputFormat =
  | 'mp3_44100_128'
  | 'mp3_22050_32'
  | 'pcm_44100';

export interface ElevenLabsVoiceSettings {
  stability: number;        // 0-1: Lower = more expressive
  similarity_boost: number; // 0-1: Voice clarity
  style: number;            // 0-1: Style exaggeration
  speed: number;            // 0.5-2.0: Playback speed
  use_speaker_boost: boolean;
}

export interface VoiceAssignment {
  speakerId: string;         // 'moderator', 'pro_advocate', 'con_advocate', etc.
  voiceId: string;           // ElevenLabs voice ID
  voiceName: string;         // Display name (e.g., "Rachel", "Josh")
  settings: ElevenLabsVoiceSettings;
}

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

export interface RefinedPodcastScript {
  title: string;
  totalCharacters: number;
  durationEstimateSeconds: number;
  segments: PodcastSegment[];
  intro?: PodcastSegment;
  outro?: PodcastSegment;
  createdAt: Date;
  updatedAt: Date;
}

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

export interface PodcastExportJob {
  id: string;
  debateId: string;
  status: PodcastJobStatus;
  config: PodcastExportConfig;

  // Progress tracking
  refinedScript?: RefinedPodcastScript;
  currentSegment?: number;
  totalSegments?: number;
  progressPercent: number;

  // Output
  audioUrl?: string;
  durationSeconds?: number;
  characterCount?: number;
  estimatedCostCents?: number;
  actualCostCents?: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

// Default voice assignments for debate roles
// Optimized for ElevenLabs V3 expressiveness (lower stability = more responsive to tags)
export const DEFAULT_VOICE_ASSIGNMENTS: Record<string, VoiceAssignment> = {
  moderator: {
    speakerId: 'moderator',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',  // "Bella" - professional
    voiceName: 'Bella',
    settings: {
      stability: 0.4,           // Lower for V3 expressiveness (was 0.7)
      similarity_boost: 0.8,
      style: 0.5,               // Increased style (was 0.3)
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  pro_advocate: {
    speakerId: 'pro_advocate',
    voiceId: 'pNInz6obpgDQGcFmaJgB',  // "Adam" - confident
    voiceName: 'Adam',
    settings: {
      stability: 0.35,          // Lower for confident energy (was 0.5)
      similarity_boost: 0.75,
      style: 0.6,               // Higher style for debate punch
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  con_advocate: {
    speakerId: 'con_advocate',
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',  // "Sam" - articulate
    voiceName: 'Sam',
    settings: {
      stability: 0.35,          // Lower for thoughtful variation (was 0.5)
      similarity_boost: 0.75,
      style: 0.6,               // Higher style for engagement
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  narrator: {
    speakerId: 'narrator',
    voiceId: 'ThT5KcBeYPX3keUQqHPh',  // "Nicole" - warm
    voiceName: 'Nicole',
    settings: {
      stability: 0.5,           // Slightly more stable for intros (was 0.6)
      similarity_boost: 0.7,
      style: 0.5,               // Warmer style (was 0.4)
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
};
