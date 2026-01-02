/**
 * Debate Type Definitions for Frontend
 *
 * These types mirror the backend types and represent the debate state
 * as it's transmitted via SSE and managed in the frontend store.
 */

/**
 * Debate phase values
 * Represents all possible states a debate can be in
 */
export const DebatePhase = {
  /** Initial state before debate starts */
  INITIALIZING: 'INITIALIZING',
  /** Phase 1: Opening statements (4 minutes) */
  PHASE_1_OPENING: 'PHASE_1_OPENING',
  /** Phase 2: Constructive arguments (6 minutes) */
  PHASE_2_CONSTRUCTIVE: 'PHASE_2_CONSTRUCTIVE',
  /** Phase 3: Cross-examination (6 minutes) */
  PHASE_3_CROSSEXAM: 'PHASE_3_CROSSEXAM',
  /** Phase 4: Rebuttals (4 minutes) */
  PHASE_4_REBUTTAL: 'PHASE_4_REBUTTAL',
  /** Phase 5: Closing statements (4 minutes) */
  PHASE_5_CLOSING: 'PHASE_5_CLOSING',
  /** Phase 6: Moderator synthesis (3 minutes) */
  PHASE_6_SYNTHESIS: 'PHASE_6_SYNTHESIS',
  /** Terminal state: Debate completed successfully */
  COMPLETED: 'COMPLETED',
  /** Special state: Debate paused by user */
  PAUSED: 'PAUSED',
  /** Terminal state: Debate encountered an error */
  ERROR: 'ERROR',
  /** Informal discussion mode - main discussion */
  INFORMAL: 'informal',
  /** Informal discussion mode - wrap-up phase */
  WRAPUP: 'wrapup',
} as const;

export type DebatePhase = (typeof DebatePhase)[keyof typeof DebatePhase];

/**
 * Speaker values
 * Identifies who is speaking or should speak next
 */
export const Speaker = {
  /** Pro advocate (arguing in favor of proposition) */
  PRO: 'PRO',
  /** Con advocate (arguing against proposition) */
  CON: 'CON',
  /** Moderator (neutral orchestrator) */
  MODERATOR: 'MODERATOR',
  /** System (for automated transitions and errors) */
  SYSTEM: 'SYSTEM',
  /** Informal discussion participants */
  PARTICIPANT_1: 'participant_1',
  PARTICIPANT_2: 'participant_2',
  PARTICIPANT_3: 'participant_3',
  PARTICIPANT_4: 'participant_4',
} as const;

export type Speaker = (typeof Speaker)[keyof typeof Speaker];

/**
 * Check if a speaker is an informal participant
 */
export function isInformalParticipant(speaker: Speaker): boolean {
  return speaker.startsWith('participant_');
}

/**
 * Phase metadata for display purposes
 */
export interface PhaseInfo {
  phase: DebatePhase;
  name: string;
  shortName: string;
  durationMinutes: number;
  description: string;
}

/**
 * Phase configuration lookup
 */
export const PHASE_INFO: Record<DebatePhase, PhaseInfo> = {
  [DebatePhase.INITIALIZING]: {
    phase: DebatePhase.INITIALIZING,
    name: 'Initializing',
    shortName: 'Init',
    durationMinutes: 0,
    description: 'Setting up the debate',
  },
  [DebatePhase.PHASE_1_OPENING]: {
    phase: DebatePhase.PHASE_1_OPENING,
    name: 'Opening Statements',
    shortName: 'Opening',
    durationMinutes: 4,
    description: 'Each side presents their initial position',
  },
  [DebatePhase.PHASE_2_CONSTRUCTIVE]: {
    phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
    name: 'Constructive Arguments',
    shortName: 'Arguments',
    durationMinutes: 6,
    description: 'Both sides build their case with evidence',
  },
  [DebatePhase.PHASE_3_CROSSEXAM]: {
    phase: DebatePhase.PHASE_3_CROSSEXAM,
    name: 'Cross-Examination',
    shortName: 'Cross-Exam',
    durationMinutes: 6,
    description: 'Each side questions the other',
  },
  [DebatePhase.PHASE_4_REBUTTAL]: {
    phase: DebatePhase.PHASE_4_REBUTTAL,
    name: 'Rebuttals',
    shortName: 'Rebuttals',
    durationMinutes: 4,
    description: 'Both sides respond to opposing arguments',
  },
  [DebatePhase.PHASE_5_CLOSING]: {
    phase: DebatePhase.PHASE_5_CLOSING,
    name: 'Closing Statements',
    shortName: 'Closing',
    durationMinutes: 4,
    description: 'Final summaries from each side',
  },
  [DebatePhase.PHASE_6_SYNTHESIS]: {
    phase: DebatePhase.PHASE_6_SYNTHESIS,
    name: 'Moderator Synthesis',
    shortName: 'Synthesis',
    durationMinutes: 3,
    description: 'Neutral summary of key points and tensions',
  },
  [DebatePhase.COMPLETED]: {
    phase: DebatePhase.COMPLETED,
    name: 'Completed',
    shortName: 'Done',
    durationMinutes: 0,
    description: 'Debate has concluded',
  },
  [DebatePhase.PAUSED]: {
    phase: DebatePhase.PAUSED,
    name: 'Paused',
    shortName: 'Paused',
    durationMinutes: 0,
    description: 'Debate is paused',
  },
  [DebatePhase.ERROR]: {
    phase: DebatePhase.ERROR,
    name: 'Error',
    shortName: 'Error',
    durationMinutes: 0,
    description: 'An error occurred',
  },
  [DebatePhase.INFORMAL]: {
    phase: DebatePhase.INFORMAL,
    name: 'Discussion',
    shortName: 'Discussion',
    durationMinutes: 0,
    description: 'Informal discussion in progress',
  },
  [DebatePhase.WRAPUP]: {
    phase: DebatePhase.WRAPUP,
    name: 'Wrap-up',
    shortName: 'Wrap-up',
    durationMinutes: 0,
    description: 'Participants sharing final thoughts',
  },
};

/**
 * Speaker display information
 */
export interface SpeakerInfo {
  speaker: Speaker;
  name: string;
  shortName: string;
  color: string;
  bgColor: string;
}

/**
 * Speaker configuration lookup
 */
export const SPEAKER_INFO: Record<Speaker, SpeakerInfo> = {
  [Speaker.PRO]: {
    speaker: Speaker.PRO,
    name: 'Pro Advocate',
    shortName: 'Pro',
    color: 'var(--color-pro)',
    bgColor: 'var(--color-pro-bg)',
  },
  [Speaker.CON]: {
    speaker: Speaker.CON,
    name: 'Con Advocate',
    shortName: 'Con',
    color: 'var(--color-con)',
    bgColor: 'var(--color-con-bg)',
  },
  [Speaker.MODERATOR]: {
    speaker: Speaker.MODERATOR,
    name: 'Moderator',
    shortName: 'Mod',
    color: 'var(--color-moderator)',
    bgColor: 'var(--color-moderator-bg)',
  },
  [Speaker.SYSTEM]: {
    speaker: Speaker.SYSTEM,
    name: 'System',
    shortName: 'Sys',
    color: 'var(--color-text-secondary)',
    bgColor: 'var(--color-bg-tertiary)',
  },
  [Speaker.PARTICIPANT_1]: {
    speaker: Speaker.PARTICIPANT_1,
    name: 'Participant 1',
    shortName: 'P1',
    color: 'var(--color-participant-1, #6366f1)',
    bgColor: 'var(--color-participant-1-bg, rgba(99, 102, 241, 0.1))',
  },
  [Speaker.PARTICIPANT_2]: {
    speaker: Speaker.PARTICIPANT_2,
    name: 'Participant 2',
    shortName: 'P2',
    color: 'var(--color-participant-2, #ec4899)',
    bgColor: 'var(--color-participant-2-bg, rgba(236, 72, 153, 0.1))',
  },
  [Speaker.PARTICIPANT_3]: {
    speaker: Speaker.PARTICIPANT_3,
    name: 'Participant 3',
    shortName: 'P3',
    color: 'var(--color-participant-3, #f59e0b)',
    bgColor: 'var(--color-participant-3-bg, rgba(245, 158, 11, 0.1))',
  },
  [Speaker.PARTICIPANT_4]: {
    speaker: Speaker.PARTICIPANT_4,
    name: 'Participant 4',
    shortName: 'P4',
    color: 'var(--color-participant-4, #14b8a6)',
    bgColor: 'var(--color-participant-4-bg, rgba(20, 184, 166, 0.1))',
  },
};

/**
 * Turn entry in the debate transcript
 */
export interface DebateTurn {
  id: string;
  debateId: string;
  phase: DebatePhase;
  speaker: Speaker;
  content: string;
  turnNumber: number;
  timestamp: Date;
  metadata?: {
    assumptions?: string[];
    evidenceType?: string;
    uncertaintyLevel?: 'low' | 'medium' | 'high';
    // Model attribution
    model?: string;
    // Lively mode interruption metadata
    wasInterrupted?: boolean;
    isInterjection?: boolean;
    interruptedBy?: Speaker;
    interruptionEnergy?: 'low' | 'medium' | 'high';
    // Human participation mode
    isHumanGenerated?: boolean;
  };
}

/**
 * User intervention/challenge
 */
export interface Intervention {
  id: string;
  debateId: string;
  type: 'question' | 'challenge' | 'evidence' | 'clarification';
  content: string;
  targetTurnId?: string;
  targetSpeaker?: Speaker;
  status: 'pending' | 'acknowledged' | 'addressed' | 'dismissed';
  timestamp: Date;
  response?: string;
}

/**
 * Flow mode for debate progression
 */
export type FlowMode = 'auto' | 'step';

/**
 * Preset mode for debate configuration
 */
export type PresetMode = 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom';

/**
 * Human side selection for participation mode
 */
export type HumanSide = 'pro' | 'con';

/**
 * Human participation configuration
 */
export interface HumanParticipation {
  /** Whether human participation is enabled */
  enabled: boolean;
  /** Which side the human is arguing */
  humanSide: HumanSide;
  /** Optional time limit per turn in seconds */
  timeLimitSeconds: number | null;
}

/**
 * Awaiting human input event data
 */
export interface AwaitingHumanInputData {
  debateId: string;
  speaker: HumanSide;
  phase: string;
  turnNumber: number;
  promptType: string;
  timeoutMs: number | null;
  timestampMs: number;
}

/**
 * Complete debate data
 */
export interface Debate {
  id: string;
  proposition: string;
  normalizedProposition?: string;
  status: 'initializing' | 'live' | 'paused' | 'completed' | 'error';
  currentPhase: DebatePhase;
  currentSpeaker: Speaker;
  /** Flow mode - auto continues automatically, step pauses after each turn */
  flowMode: FlowMode;
  turns: DebateTurn[];
  interventions: Intervention[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  totalElapsedMs: number;

  // Configuration fields
  /** Preset mode used for this debate */
  presetMode: PresetMode;
  /** Brevity level (1-5, where 1=detailed, 5=concise) */
  brevityLevel: number;
  /** LLM temperature (0-1) */
  llmTemperature: number;
  /** Maximum tokens per response */
  maxTokensPerResponse: number;
  /** Whether citations are required */
  requireCitations: boolean;

  // Model information (optional - only present when using OpenRouter)
  /** Model ID used for Pro advocate */
  proModelId?: string;
  /** Model ID used for Con advocate */
  conModelId?: string;
  /** Model ID used for Moderator */
  moderatorModelId?: string;
  /** Display name for Pro model */
  proModelName?: string;
  /** Display name for Con model */
  conModelName?: string;
  /** Display name for Moderator model */
  moderatorModelName?: string;

  // Human participation mode
  /** Human participation configuration (if enabled) */
  humanParticipation?: HumanParticipation;

  // Debate mode
  /** Mode of debate: turn_based, lively, or informal */
  debateMode?: 'turn_based' | 'lively' | 'informal';

  // Informal discussion specific fields
  /** Participant info for informal discussions */
  informalParticipants?: Array<{
    id: string;
    name: string;
    modelId: string;
  }>;
  /** Current exchange number (informal mode) */
  exchangeCount?: number;
  /** Maximum exchanges (informal mode) */
  maxExchanges?: number;
  /** Auto-generated discussion summary (informal mode) */
  informalSummary?: {
    topicsCovered: string[];
    keyInsights: string[];
    areasOfAgreement: string[];
    areasOfDisagreement: string[];
    participantHighlights: Array<{
      participant: string;
      highlight: string;
    }>;
    generatedAt: string;
  };
}

/**
 * SSE event types from backend
 */
export type SSEEventType =
  | 'connected'
  | 'debate_started'
  | 'phase_transition'
  | 'phase_start'        // Backend sends this
  | 'phase_complete'     // Backend sends this
  | 'turn_start'
  | 'turn_chunk'
  | 'turn_complete'
  | 'utterance'          // Backend sends this for each agent response
  | 'intervention_received'
  | 'intervention_addressed'
  | 'intervention_response'  // Backend sends this
  | 'debate_paused'
  | 'debate_resumed'
  | 'awaiting_continue'  // Step mode: waiting for user to click Continue
  | 'continuing'         // Step mode: user clicked Continue, resuming
  | 'debate_completed'
  | 'debate_complete'    // Backend sends this (without 'd')
  | 'debate_stopped'     // Backend sends this when user stops debate
  | 'debate_error'
  | 'error'              // Backend sends this
  | 'heartbeat'
  // Catch-up events for reconnecting clients
  | 'catchup_start'        // Client reconnected, receiving missed turns
  | 'catchup_utterance'    // Historical utterance during catch-up
  | 'catchup_complete'     // All catch-up data sent
  // Lively mode events
  | 'speaker_started'      // Speaker takes the floor
  | 'speaker_cutoff'       // Speaker was interrupted mid-turn
  | 'token_chunk'          // Streaming token for live display
  | 'interrupt_scheduled'  // Interrupt queued (UI shows anticipation)
  | 'interrupt_fired'      // Interrupt happens
  | 'interrupt_cancelled'  // Scheduled interrupt was cancelled
  | 'interjection'         // Short 1-2 sentence interrupt content
  | 'speaking_resumed'     // Original speaker continues
  | 'lively_mode_started'  // Lively mode activated for debate
  | 'pacing_change'        // Pacing mode changed
  // Human participation mode events
  | 'awaiting_human_input' // Waiting for human to submit their turn
  | 'human_turn_received'  // Human turn was submitted
  | 'human_turn_timeout'   // Human took too long to respond
  // Informal discussion mode events
  | 'discussion_started'   // Informal discussion has begun
  | 'exchange_complete'    // One round where all participants spoke
  | 'entering_wrapup'      // Discussion is wrapping up
  | 'end_detection_result' // AI detected natural end point
  | 'discussion_summary'   // Auto-generated summary
  | 'discussion_complete'; // Informal discussion completed

/**
 * SSE message structure
 */
export interface SSEMessage<T = unknown> {
  event: SSEEventType;
  data: T;
  timestamp: string;
}

/**
 * Connection status for SSE
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
