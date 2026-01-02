/**
 * Informal Discussion Mode Types for Frontend
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
 * Settings for informal discussion mode
 */
export interface InformalSettingsInput {
  /** Participants in the discussion (2-4) */
  participants: Array<{
    name?: string;
    modelId: string;
    persona?: string;
  }>;
  /** Maximum number of exchanges (default: 15) */
  maxExchanges?: number;
  /** End detection enabled (default: true) */
  endDetectionEnabled?: boolean;
  /** End detection check interval (default: 3) */
  endDetectionInterval?: number;
  /** End detection confidence threshold (default: 0.75) */
  endDetectionThreshold?: number;
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

/**
 * Default participant template
 */
export const DEFAULT_PARTICIPANT = {
  name: '',
  modelId: '',
  persona: '',
};

/**
 * Default informal settings
 */
export const DEFAULT_INFORMAL_SETTINGS: InformalSettingsInput = {
  participants: [
    { name: 'Participant A', modelId: '', persona: '' },
    { name: 'Participant B', modelId: '', persona: '' },
  ],
  maxExchanges: INFORMAL_DEFAULTS.maxExchanges,
  endDetectionEnabled: INFORMAL_DEFAULTS.endDetection.enabled,
  endDetectionInterval: INFORMAL_DEFAULTS.endDetection.checkInterval,
  endDetectionThreshold: INFORMAL_DEFAULTS.endDetection.confidenceThreshold,
};
