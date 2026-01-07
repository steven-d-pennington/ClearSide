import type { DebateTone } from './duelogic.js';

export type PodcastJobStatus = 'pending' | 'refining' | 'generating' | 'complete' | 'error';

export type GenerationPhase = 'pending' | 'tts' | 'concat' | 'normalize' | 'tag' | 'complete' | 'error';

export type TTSProviderType = 'elevenlabs' | 'gemini';

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
  // TTS Provider selection (defaults to 'elevenlabs')
  ttsProvider?: TTSProviderType;

  // Script refinement options
  refinementModel: string;        // LLM for script polish (e.g., "gpt-4o")
  includeIntro: boolean;
  includeOutro: boolean;
  addTransitions: boolean;

  // ElevenLabs settings (used when ttsProvider is 'elevenlabs')
  elevenLabsModel: ElevenLabsModel;
  outputFormat: AudioOutputFormat;

  // Voice assignments per speaker
  voiceAssignments: Record<string, VoiceAssignment>;

  // Advanced options
  useCustomPronunciation: boolean;
  pronunciationDictionaryId?: string;
  normalizeVolume: boolean;

  // Debate context for tone-aware refinement
  tone?: DebateTone;              // 'respectful' | 'spirited' | 'heated'
  debateMode?: 'turn_based' | 'lively' | 'informal' | 'duelogic';
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

  // Generation phase tracking for recovery
  generationPhase?: GenerationPhase;
  phaseStartedAt?: Date;
  partialCostCents?: number;    // Cost incurred even on failure

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

// Segment-level status for granular recovery
export interface PodcastSegmentStatus {
  id: string;
  jobId: string;
  segmentIndex: number;
  status: 'pending' | 'generating' | 'complete' | 'error';
  startedAt?: Date;
  completedAt?: Date;
  characterCount?: number;
  costCents?: number;
  errorMessage?: string;
  retryCount: number;
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

  // Duelogic extended chairs (chairs 1-2 use pro_advocate/con_advocate)
  chair_3: {
    speakerId: 'chair_3',
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',  // "Josh" - analytical
    voiceName: 'Josh',
    settings: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.55,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  chair_4: {
    speakerId: 'chair_4',
    voiceId: 'VR6AewLTigWG4xSOukaG',  // "Arnold" - authoritative
    voiceName: 'Arnold',
    settings: {
      stability: 0.4,
      similarity_boost: 0.8,
      style: 0.5,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  chair_5: {
    speakerId: 'chair_5',
    voiceId: 'IKne3meq5aSn9XLyUdCD',  // "Charlie" - conversational
    voiceName: 'Charlie',
    settings: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.6,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  chair_6: {
    speakerId: 'chair_6',
    voiceId: 'onwK4e9ZLuTAKqWW03F9',  // "Daniel" - measured
    voiceName: 'Daniel',
    settings: {
      stability: 0.45,
      similarity_boost: 0.8,
      style: 0.45,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },

  // Informal discussion participants
  participant_1: {
    speakerId: 'participant_1',
    voiceId: 'pNInz6obpgDQGcFmaJgB',  // "Adam"
    voiceName: 'Adam',
    settings: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.6,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  participant_2: {
    speakerId: 'participant_2',
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',  // "Sam"
    voiceName: 'Sam',
    settings: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.6,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  participant_3: {
    speakerId: 'participant_3',
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',  // "Josh"
    voiceName: 'Josh',
    settings: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.55,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  participant_4: {
    speakerId: 'participant_4',
    voiceId: 'VR6AewLTigWG4xSOukaG',  // "Arnold"
    voiceName: 'Arnold',
    settings: {
      stability: 0.4,
      similarity_boost: 0.8,
      style: 0.5,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
};

// Gemini voice assignments for debate roles
// Uses Gemini 2.5 TTS native voices (no settings needed - Gemini handles tone via voice selection)
export interface GeminiVoiceAssignment {
  speakerId: string;
  voiceId: string;    // Gemini voice name (e.g., 'Kore', 'Charon')
  voiceName: string;  // Display name
}

export const GEMINI_VOICE_ASSIGNMENTS: Record<string, GeminiVoiceAssignment> = {
  moderator: {
    speakerId: 'moderator',
    voiceId: 'Aoede',    // Neutral, calm voice
    voiceName: 'Aoede',
  },
  pro_advocate: {
    speakerId: 'pro_advocate',
    voiceId: 'Kore',     // Firm, clear female voice
    voiceName: 'Kore',
  },
  con_advocate: {
    speakerId: 'con_advocate',
    voiceId: 'Charon',   // Thoughtful male voice
    voiceName: 'Charon',
  },
  narrator: {
    speakerId: 'narrator',
    voiceId: 'Puck',     // Clear narrator voice
    voiceName: 'Puck',
  },

  // Duelogic extended chairs
  chair_3: {
    speakerId: 'chair_3',
    voiceId: 'Fenrir',
    voiceName: 'Fenrir',
  },
  chair_4: {
    speakerId: 'chair_4',
    voiceId: 'Leda',
    voiceName: 'Leda',
  },
  chair_5: {
    speakerId: 'chair_5',
    voiceId: 'Orus',
    voiceName: 'Orus',
  },
  chair_6: {
    speakerId: 'chair_6',
    voiceId: 'Zephyr',
    voiceName: 'Zephyr',
  },

  // Informal discussion participants
  participant_1: {
    speakerId: 'participant_1',
    voiceId: 'Kore',
    voiceName: 'Kore',
  },
  participant_2: {
    speakerId: 'participant_2',
    voiceId: 'Charon',
    voiceName: 'Charon',
  },
  participant_3: {
    speakerId: 'participant_3',
    voiceId: 'Fenrir',
    voiceName: 'Fenrir',
  },
  participant_4: {
    speakerId: 'participant_4',
    voiceId: 'Leda',
    voiceName: 'Leda',
  },
};

// Available Gemini TTS voices
export const GEMINI_AVAILABLE_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
];
