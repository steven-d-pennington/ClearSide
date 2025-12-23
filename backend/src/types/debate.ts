/**
 * Debate State Machine Type Definitions
 *
 * These types are specific to the state machine logic and represent the
 * internal states and transitions of a debate. They differ from database
 * types which represent the persisted data model.
 */

/**
 * Debate phase enum
 * Represents all possible states a debate can be in, including special states
 * like INITIALIZING, COMPLETED, PAUSED, and ERROR
 */
export enum DebatePhase {
  /** Initial state before debate starts */
  INITIALIZING = 'INITIALIZING',

  /** Phase 1: Opening statements (4 minutes) */
  PHASE_1_OPENING = 'PHASE_1_OPENING',

  /** Phase 2: Constructive arguments (6 minutes) */
  PHASE_2_CONSTRUCTIVE = 'PHASE_2_CONSTRUCTIVE',

  /** Phase 3: Cross-examination (6 minutes) */
  PHASE_3_CROSSEXAM = 'PHASE_3_CROSSEXAM',

  /** Phase 4: Rebuttals (4 minutes) */
  PHASE_4_REBUTTAL = 'PHASE_4_REBUTTAL',

  /** Phase 5: Closing statements (4 minutes) */
  PHASE_5_CLOSING = 'PHASE_5_CLOSING',

  /** Phase 6: Moderator synthesis (3 minutes) */
  PHASE_6_SYNTHESIS = 'PHASE_6_SYNTHESIS',

  /** Terminal state: Debate completed successfully */
  COMPLETED = 'COMPLETED',

  /** Special state: Debate paused by user */
  PAUSED = 'PAUSED',

  /** Terminal state: Debate encountered an error */
  ERROR = 'ERROR',
}

/**
 * Speaker enum
 * Identifies who is speaking or should speak next
 */
export enum Speaker {
  /** Pro advocate (arguing in favor of proposition) */
  PRO = 'PRO',

  /** Con advocate (arguing against proposition) */
  CON = 'CON',

  /** Moderator (neutral orchestrator) */
  MODERATOR = 'MODERATOR',

  /** System (for automated transitions and errors) */
  SYSTEM = 'SYSTEM',
}

/**
 * Debate state interface
 * Complete snapshot of the current state of a debate
 */
export interface DebateState {
  /** Unique debate identifier */
  debateId: string;

  /** Current phase of the debate */
  currentPhase: DebatePhase;

  /** Previous phase (used for resume after pause) */
  previousPhase: DebatePhase | null;

  /** Current speaker (who should speak next) */
  currentSpeaker: Speaker;

  /** Timestamp when current phase started */
  phaseStartTime: Date;

  /** Total elapsed time in milliseconds (excluding pause time) */
  totalElapsedMs: number;

  /** Whether debate is currently paused */
  isPaused: boolean;

  /** Timestamp when debate was paused (null if not paused) */
  pausedAt: Date | null;

  /** Error message if in ERROR state */
  error: string | null;
}

/**
 * Phase transition event
 * Emitted whenever the debate transitions to a new phase
 */
export interface PhaseTransitionEvent {
  /** Unique debate identifier */
  debateId: string;

  /** Phase transitioning from */
  fromPhase: DebatePhase;

  /** Phase transitioning to */
  toPhase: DebatePhase;

  /** Speaker after transition */
  speaker: Speaker;

  /** Timestamp of transition */
  timestamp: Date;

  /** Time spent in previous phase (milliseconds) */
  phaseElapsedMs: number;

  /** Total debate elapsed time (milliseconds) */
  totalElapsedMs: number;
}

/**
 * Phase metadata
 * Configuration and metadata for each debate phase
 */
export interface PhaseMetadata {
  /** Phase identifier */
  phase: DebatePhase;

  /** Human-readable phase name */
  name: string;

  /** Maximum duration in minutes */
  durationMinutes: number;

  /** List of speakers allowed in this phase */
  allowedSpeakers: Speaker[];

  /** Number of turns each speaker gets in this phase */
  turnsPerSpeaker: number;

  /** Description of what happens in this phase */
  description: string;
}
