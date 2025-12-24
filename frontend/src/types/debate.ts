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
} as const;

export type Speaker = (typeof Speaker)[keyof typeof Speaker];

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
 * Complete debate data
 */
export interface Debate {
  id: string;
  proposition: string;
  normalizedProposition?: string;
  status: 'initializing' | 'live' | 'paused' | 'completed' | 'error';
  currentPhase: DebatePhase;
  currentSpeaker: Speaker;
  turns: DebateTurn[];
  interventions: Intervention[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  totalElapsedMs: number;
}

/**
 * SSE event types from backend
 */
export type SSEEventType =
  | 'connected'
  | 'debate_started'
  | 'phase_transition'
  | 'turn_start'
  | 'turn_chunk'
  | 'turn_complete'
  | 'intervention_received'
  | 'intervention_addressed'
  | 'debate_paused'
  | 'debate_resumed'
  | 'debate_completed'
  | 'debate_error'
  | 'heartbeat';

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
