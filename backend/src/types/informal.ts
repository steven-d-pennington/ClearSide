/**
 * Informal Discussion Mode Types
 *
 * Types for freeform discussions between 2+ AI models without structured
 * debate roles, phases, or moderation.
 */

/**
 * Participant in an informal discussion
 */
export interface InformalParticipant {
  /** Unique identifier (e.g., 'participant_1') */
  id: string;
  /** Display name for the participant */
  name: string;
  /** LLM model ID to use for this participant */
  modelId: string;
  /** Optional persona/perspective for the participant */
  persona?: string;
}

/**
 * Configuration for an informal discussion
 */
export interface InformalDiscussionConfig {
  /** Discussion mode discriminator */
  mode: 'informal';
  /** The topic or question to discuss */
  topic: string;
  /** Participants in the discussion (2-4) */
  participants: InformalParticipant[];
  /** Maximum number of exchanges (rounds where all participants speak once) */
  maxExchanges: number;
  /** End detection settings */
  endDetection: EndDetectionConfig;
}

/**
 * Configuration for AI-based end detection
 */
export interface EndDetectionConfig {
  /** Whether to enable AI end detection */
  enabled: boolean;
  /** Check for natural end every N exchanges */
  checkInterval: number;
  /** Confidence threshold (0-1) to trigger ending */
  confidenceThreshold: number;
}

/**
 * Runtime state of an informal discussion
 */
export interface InformalState {
  /** Current exchange number (0-indexed) */
  exchangeCount: number;
  /** Index of current participant in the turn order */
  currentParticipantIndex: number;
  /** Whether the discussion is in wrap-up mode */
  isWrappingUp: boolean;
  /** What triggered the end of the discussion */
  endTrigger?: EndTrigger;
  /** Whether the discussion is complete */
  isComplete: boolean;
}

/**
 * What triggered the discussion to end
 */
export type EndTrigger = 'max_exchanges' | 'user_wrapup' | 'ai_detected';

/**
 * Result of AI end detection evaluation
 */
export interface EndDetectionResult {
  /** Whether the discussion should end */
  shouldEnd: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasons for the recommendation */
  reasons: string[];
}

/**
 * Auto-generated summary of an informal discussion
 */
export interface InformalSummary {
  /** Key topics covered in the discussion */
  topicsCovered: string[];
  /** Most valuable insights or points raised */
  keyInsights: string[];
  /** Areas where participants agreed */
  areasOfAgreement: string[];
  /** Areas where participants disagreed */
  areasOfDisagreement: string[];
  /** Standout point from each participant */
  participantHighlights: Array<{
    participant: string;
    highlight: string;
  }>;
  /** When the summary was generated */
  generatedAt: string;
}

/**
 * Context for end detection evaluation
 */
export interface EndDetectionContext {
  /** Discussion ID */
  discussionId: string;
  /** The topic being discussed */
  topic: string;
  /** Recent exchanges to evaluate */
  recentExchanges: Array<{
    exchangeNumber: number;
    utterances: Array<{
      participant: string;
      content: string;
    }>;
  }>;
  /** Total exchanges completed */
  totalExchanges: number;
  /** Max exchanges configured */
  maxExchanges: number;
}

/**
 * Context for summary generation
 */
export interface SummaryGenerationContext {
  /** Discussion ID */
  discussionId: string;
  /** The topic discussed */
  topic: string;
  /** Participant names */
  participants: string[];
  /** Full transcript of the discussion */
  transcript: Array<{
    participant: string;
    content: string;
    exchangeNumber: number;
  }>;
  /** What triggered the end */
  endTrigger: EndTrigger;
}

/**
 * Input for creating an informal discussion
 */
export interface CreateInformalDiscussionInput {
  /** The topic or question to discuss */
  topic: string;
  /** Optional context/background for the topic */
  topicContext?: string;
  /** Participant configuration */
  participants: Array<{
    name?: string;
    modelId: string;
    persona?: string;
  }>;
  /** Maximum exchanges (default: 15) */
  maxExchanges?: number;
  /** End detection enabled (default: true) */
  endDetectionEnabled?: boolean;
  /** End detection check interval (default: 3) */
  endDetectionInterval?: number;
  /** End detection confidence threshold (default: 0.75) */
  endDetectionThreshold?: number;
}

/**
 * Default configuration values
 */
export const INFORMAL_DEFAULTS = {
  maxExchanges: 15,
  minExchanges: 3,
  maxParticipants: 4,
  minParticipants: 2,
  endDetection: {
    enabled: true,
    checkInterval: 3,
    confidenceThreshold: 0.75,
  },
} as const;
