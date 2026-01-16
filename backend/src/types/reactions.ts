/**
 * Reaction Audio Types
 *
 * Types for the cross-talk reaction system that adds brief audio reactions
 * (e.g., "Mm-hmm", "Exactly", "That's right") overlaying the main podcast audio
 * to create the illusion of a shared room.
 */

/**
 * Category of reaction audio clips
 */
export type ReactionCategory =
  | 'agreement'
  | 'disagreement'
  | 'interest'
  | 'acknowledgment'
  | 'challenge'
  | 'amusement'
  | 'surprise'
  | 'skepticism';

/**
 * Definition of a reaction phrase to be generated as audio
 */
export interface ReactionPhrase {
  /** The text to speak */
  text: string;
  /** Category for contextual selection */
  category: ReactionCategory;
  /** Estimated duration in milliseconds (for planning) */
  durationEstimateMs: number;
  /** Optional direction for how to deliver this (for TTS) */
  direction?: string;
}

/**
 * Pre-defined reaction phrases organized by category (~32 total)
 * These will be generated as short audio clips for each voice
 */
export const REACTION_PHRASES: ReactionPhrase[] = [
  // ============================================
  // AGREEMENT (4) - Enthusiastic/supportive
  // ============================================
  { text: 'Mm-hmm', category: 'agreement', durationEstimateMs: 500 },
  { text: 'Exactly', category: 'agreement', durationEstimateMs: 600 },
  { text: "That's right", category: 'agreement', durationEstimateMs: 800 },
  { text: 'Absolutely', category: 'agreement', durationEstimateMs: 700 },

  // ============================================
  // DISAGREEMENT (4) - Pushback/objection
  // ============================================
  { text: 'Well...', category: 'disagreement', durationEstimateMs: 500, direction: 'hesitant, skeptical' },
  { text: 'Hold on', category: 'disagreement', durationEstimateMs: 500 },
  { text: "I don't think so", category: 'disagreement', durationEstimateMs: 800 },
  { text: 'No, no, no', category: 'disagreement', durationEstimateMs: 700, direction: 'emphatic' },

  // ============================================
  // INTEREST (4) - Curiosity/engagement
  // ============================================
  { text: 'Hmm', category: 'interest', durationEstimateMs: 400 },
  { text: 'Interesting', category: 'interest', durationEstimateMs: 700 },
  { text: 'Oh really', category: 'interest', durationEstimateMs: 600 },
  { text: 'Tell me more', category: 'interest', durationEstimateMs: 700 },

  // ============================================
  // ACKNOWLEDGMENT (4) - Understanding/following
  // ============================================
  { text: 'I see', category: 'acknowledgment', durationEstimateMs: 500 },
  { text: 'Right, right', category: 'acknowledgment', durationEstimateMs: 600 },
  { text: 'Makes sense', category: 'acknowledgment', durationEstimateMs: 600 },
  { text: 'Fair enough', category: 'acknowledgment', durationEstimateMs: 600 },

  // ============================================
  // CHALLENGE (4) - Confrontational/pressing
  // ============================================
  { text: 'Oh come on', category: 'challenge', durationEstimateMs: 700, direction: 'exasperated' },
  { text: 'Are you serious?', category: 'challenge', durationEstimateMs: 800, direction: 'incredulous' },
  { text: 'Based on what?', category: 'challenge', durationEstimateMs: 700 },
  { text: 'Oh please', category: 'challenge', durationEstimateMs: 600, direction: 'dismissive' },

  // ============================================
  // AMUSEMENT (4) - Laughs/entertainment
  // ============================================
  { text: 'Ha!', category: 'amusement', durationEstimateMs: 300 },
  { text: 'Haha', category: 'amusement', durationEstimateMs: 400 },
  { text: 'Heh heh', category: 'amusement', durationEstimateMs: 400, direction: 'amused chuckle' },
  { text: "That's funny", category: 'amusement', durationEstimateMs: 600 },

  // ============================================
  // SURPRISE (4) - Unexpected/startled
  // ============================================
  { text: 'Whoa', category: 'surprise', durationEstimateMs: 400 },
  { text: 'Wait, what?', category: 'surprise', durationEstimateMs: 600 },
  { text: 'Wow', category: 'surprise', durationEstimateMs: 400 },
  { text: "You're kidding", category: 'surprise', durationEstimateMs: 700 },

  // ============================================
  // SKEPTICISM (4) - Doubt/questioning
  // ============================================
  { text: 'Mmm...', category: 'skepticism', durationEstimateMs: 500, direction: 'doubtful' },
  { text: 'You think?', category: 'skepticism', durationEstimateMs: 550, direction: 'skeptical' },
  { text: 'If you say so', category: 'skepticism', durationEstimateMs: 700, direction: 'unconvinced' },
  { text: 'Riiiight', category: 'skepticism', durationEstimateMs: 600, direction: 'drawn out, sarcastic' },
];

/**
 * A generated reaction audio clip stored on disk
 */
export interface ReactionClip {
  /** Voice ID this clip was generated for */
  voiceId: string;
  /** The reaction phrase */
  phrase: ReactionPhrase;
  /** Path to the audio file */
  audioPath: string;
  /** Actual duration in milliseconds (after generation) */
  durationMs: number;
  /** File size in bytes */
  fileSizeBytes: number;
}

/**
 * Manifest tracking all generated reaction clips
 */
export interface ReactionLibraryManifest {
  /** Version of the manifest format */
  version: string;
  /** When the manifest was last updated */
  updatedAt: string;
  /** Voices that have reaction clips generated */
  voices: Record<string, ReactionVoiceManifest>;
}

/**
 * Manifest entry for a single voice's reaction clips
 */
export interface ReactionVoiceManifest {
  /** Voice ID */
  voiceId: string;
  /** Voice display name (if known) */
  voiceName?: string;
  /** TTS provider used to generate clips */
  ttsProvider: string;
  /** When clips were generated */
  generatedAt: string;
  /** List of generated clips */
  clips: ReactionClipManifest[];
}

/**
 * Manifest entry for a single reaction clip
 */
export interface ReactionClipManifest {
  /** Filename (relative to voice directory) */
  filename: string;
  /** The phrase text */
  text: string;
  /** Category */
  category: ReactionCategory;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Point in the audio where a reaction should be inserted
 */
export interface ReactionInsertionPoint {
  /** Milliseconds into the podcast where reaction should start */
  insertAtMs: number;
  /** What triggered this insertion point */
  triggerType: 'strong_statement' | 'question' | 'key_point' | 'interval';
  /** Segment index this occurs during/after */
  duringSegmentIndex: number;
  /** Suggested reaction category based on context */
  suggestedCategory: ReactionCategory;
  /** Voice IDs to exclude (don't use reaction from current speaker) */
  excludeVoiceIds: string[];
  /** Context snippet for debugging */
  contextSnippet?: string;
}

/**
 * Instruction for mixing a reaction into the audio
 */
export interface ReactionMixInstruction {
  /** Path to the reaction audio clip */
  audioPath: string;
  /** Milliseconds into the main audio to insert this reaction */
  insertAtMs: number;
  /** Volume level (0.0-1.0), typically 0.6-0.8 for reactions */
  volume: number;
  /** Voice ID of the reactor (for logging/debugging) */
  voiceId?: string;
  /** The phrase being spoken (for logging/debugging) */
  phrase?: string;
}

/**
 * Configuration for reaction insertion
 */
export interface ReactionInsertionConfig {
  /** Target number of reactions per minute (default: 2.5 for "moderate") */
  reactionsPerMinute: number;
  /** Minimum gap between reactions in milliseconds (default: 10000) */
  minimumGapMs: number;
  /** Volume level for reactions (0.0-1.0, default: 0.7) */
  reactionVolume: number;
  /** Whether to enable reactions at all */
  enabled: boolean;
}

/**
 * Default reaction insertion configuration
 */
export const DEFAULT_REACTION_CONFIG: ReactionInsertionConfig = {
  reactionsPerMinute: 2.5,  // Moderate frequency
  minimumGapMs: 10000,      // 10 seconds minimum between reactions
  reactionVolume: 0.7,      // 70% volume
  enabled: true,
};

/**
 * Result of reaction insertion for a podcast
 */
export interface ReactionInsertionResult {
  /** Number of reactions inserted */
  reactionCount: number;
  /** Total duration of all reaction audio in milliseconds */
  totalReactionDurationMs: number;
  /** Details of each inserted reaction */
  insertions: Array<{
    insertAtMs: number;
    voiceId: string;
    phrase: string;
    category: ReactionCategory;
  }>;
}
