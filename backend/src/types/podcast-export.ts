import type { DebateTone } from './duelogic.js';

export type PodcastJobStatus = 'pending' | 'refining' | 'generating' | 'complete' | 'error';

export type GenerationPhase = 'pending' | 'tts' | 'concat' | 'reactions' | 'normalize' | 'tag' | 'complete' | 'error';

export type TTSProviderType = 'elevenlabs' | 'gemini' | 'google-cloud-long';

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

  /** Gemini-specific director's notes for TTS performance guidance */
  geminiDirectorNotes?: GeminiDirectorNotes;
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

  // Chair framework mapping for Duelogic debates (e.g., { chair_1: 'Precautionary Chair', chair_2: 'Pragmatic Chair' })
  chairFrameworks?: Record<string, string>;
}

export interface PodcastExportJob {
  id: string;
  debateId?: string;
  conversationSessionId?: string;
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

/**
 * Gemini Director's Notes - Natural language guidance for TTS performance
 *
 * Based on Google's recommended prompt structure:
 * - Audio Profile: Character identity/archetype
 * - Scene: Environment and emotional context
 * - Director's Notes: Style, accent, pacing guidance
 *
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export interface GeminiDirectorNotes {
  /** Show/podcast identity and format */
  showContext: string;

  /** Per-speaker performance direction */
  speakerDirections: Record<string, GeminiSpeakerDirection>;

  /** Overall scene/emotional context */
  sceneContext: string;

  /** Pacing and delivery guidance */
  pacingNotes: string;
}

export interface GeminiSpeakerDirection {
  /** Speaker identifier (matches segment speaker) */
  speakerId: string;

  /** Character archetype/identity */
  characterProfile: string;

  /** Emotional tone and vocal style */
  vocalStyle: string;

  /** Specific performance notes */
  performanceNotes: string;
}

/**
 * Tone-specific performance profiles for debate speakers
 */
export const GEMINI_TONE_PROFILES: Record<DebateTone, {
  overall: string;
  pro: GeminiSpeakerDirection;
  con: GeminiSpeakerDirection;
  moderator: GeminiSpeakerDirection;
  narrator: GeminiSpeakerDirection;
}> = {
  respectful: {
    overall: 'Professional, collegial intellectual discourse. Think academic conference meets quality podcast.',
    pro: {
      speakerId: 'pro_advocate',
      characterProfile: 'Thoughtful academic presenting a well-reasoned position',
      vocalStyle: 'Measured, confident but not aggressive. Warm yet authoritative.',
      performanceNotes: 'Speak with conviction but maintain respect. Allow natural pauses for emphasis. Project intellectual confidence without arrogance.',
    },
    con: {
      speakerId: 'con_advocate',
      characterProfile: 'Constructive critic offering valuable counterpoints',
      vocalStyle: 'Thoughtfully skeptical, fair-minded. Curious rather than combative.',
      performanceNotes: 'Question with genuine curiosity. Acknowledge valid points before countering. Sound like someone seeking truth, not winning.',
    },
    moderator: {
      speakerId: 'moderator',
      characterProfile: 'Wise facilitator ensuring productive dialogue',
      vocalStyle: 'Calm, neutral, gently authoritative. Like an NPR host.',
      performanceNotes: 'Maintain warm neutrality. Guide without taking sides. Project quiet authority that commands respect.',
    },
    narrator: {
      speakerId: 'narrator',
      characterProfile: 'Welcoming podcast host',
      vocalStyle: 'Warm, inviting, professional. Clear enunciation.',
      performanceNotes: 'Sound genuinely interested in the topic. Create atmosphere of intellectual curiosity.',
    },
  },
  spirited: {
    overall: 'Energetic intellectual debate. Think passionate but civil discourse - the best dinner party argument.',
    pro: {
      speakerId: 'pro_advocate',
      characterProfile: 'Passionate advocate with strong convictions',
      vocalStyle: 'Confident, energetic, occasionally emphatic. Conviction without aggression.',
      performanceNotes: 'Vary pace - slower for key points, faster when building momentum. Let enthusiasm come through. Emphasize with conviction.',
    },
    con: {
      speakerId: 'con_advocate',
      characterProfile: 'Sharp-minded challenger who loves the intellectual sparring',
      vocalStyle: 'Engaged, probing, intellectually playful. Quick-witted.',
      performanceNotes: 'Sound genuinely interested in dismantling weak arguments. Allow occasional wry humor. Be incisive but not mean.',
    },
    moderator: {
      speakerId: 'moderator',
      characterProfile: 'Engaged referee who appreciates good debate',
      vocalStyle: 'Alert, interested, occasionally amused. Professional but not stiff.',
      performanceNotes: 'React subtly to good points. Keep energy up while maintaining control. Sound like you\'re enjoying this.',
    },
    narrator: {
      speakerId: 'narrator',
      characterProfile: 'Enthusiastic podcast host who loves this topic',
      vocalStyle: 'Warm, engaging, energetic. Build anticipation.',
      performanceNotes: 'Convey genuine excitement about the debate to come. Draw listeners in.',
    },
  },
  heated: {
    overall: 'Intense intellectual confrontation. High stakes, strong emotions, but still substantive. Think cable news debate done right.',
    pro: {
      speakerId: 'pro_advocate',
      characterProfile: 'Fierce defender of an important cause',
      vocalStyle: 'Forceful, passionate, occasionally frustrated. Righteous conviction.',
      performanceNotes: 'Allow emotion to color delivery - controlled intensity. Speak with urgency. Don\'t be afraid of dramatic emphasis.',
    },
    con: {
      speakerId: 'con_advocate',
      characterProfile: 'Tenacious challenger who won\'t let bad arguments stand',
      vocalStyle: 'Sharp, persistent, occasionally exasperated. Determined truth-seeker.',
      performanceNotes: 'Push back firmly. Allow frustration at weak arguments to show. Be relentless but not cruel.',
    },
    moderator: {
      speakerId: 'moderator',
      characterProfile: 'Firm referee keeping a heated match civil',
      vocalStyle: 'Authoritative, calming presence. Cuts through tension.',
      performanceNotes: 'Project calm authority. Occasionally use firm tone to redirect. Be the stable center in the storm.',
    },
    narrator: {
      speakerId: 'narrator',
      characterProfile: 'Host setting up a consequential debate',
      vocalStyle: 'Serious, weighty, builds tension. Conveys importance.',
      performanceNotes: 'Communicate that this matters. Create sense of stakes and significance.',
    },
  },
};

// ============================================================================
// TTS Prompt Preview Types (for visibility into voice direction)
// ============================================================================

/**
 * Type of injected tag for categorization
 */
export type InjectedTagType = 'emotion' | 'pause' | 'micro-expression' | 'modifier';

/**
 * Information about a single injected tag
 */
export interface InjectedTag {
  /** The tag itself, e.g., "[excited]" */
  tag: string;
  /** Position in the enhanced content */
  position: number;
  /** Why this tag was chosen */
  reason: string;
  /** Category of tag */
  type: InjectedTagType;
}

/**
 * Full TTS prompt preview for a single segment
 * Shows exactly what will be sent to Gemini TTS
 */
export interface TTSPromptPreview {
  /** Segment index in the script */
  segmentIndex: number;
  /** Speaker name for this segment */
  speakerName: string;
  /** Speaker role (host or guest) */
  speakerRole: 'host' | 'guest';

  /** The four sections that make up the TTS prompt */
  sections: {
    /** Character identity and archetype */
    audioProfile: string;
    /** Environment and emotional vibe */
    scene: string;
    /** Performance guidance (style, accent, pace) */
    directorsNotes: string;
    /** The actual dialogue */
    transcript: {
      /** Original content before enhancement */
      original: string;
      /** Enhanced content with tags injected */
      enhanced: string;
    };
  };

  /** List of all tags that were injected */
  injectedTags: InjectedTag[];

  /** Character counts for reference */
  characterCounts: {
    audioProfile: number;
    scene: number;
    directorsNotes: number;
    transcript: number;
    total: number;
  };
}

/**
 * Full director's notes preview for a conversation session
 */
export interface DirectorNotesPreview {
  /** Session ID */
  sessionId: string;
  /** Session topic */
  topic: string;
  /** Show context description */
  showContext: string;
  /** Scene context description */
  sceneContext: string;
  /** Pacing notes */
  pacingNotes: string;
  /** Per-speaker directions */
  speakerDirections: Record<string, GeminiSpeakerDirection>;
  /** Per-segment preview */
  segmentPreviews: TTSPromptPreview[];
}
