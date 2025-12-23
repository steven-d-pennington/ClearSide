/**
 * Debate Orchestrator Type Definitions
 *
 * Types specific to the debate orchestration layer.
 * These types represent the data structures used by the orchestrator
 * to manage debate flow, utterances, interventions, and transcripts.
 */

import type { DebatePhase, Speaker } from './debate.js';

/**
 * Orchestrator utterance - extends database utterance with runtime metadata
 * Used internally by the orchestrator during debate execution
 */
export interface OrchestratorUtterance {
  /** Unique identifier (will be assigned after persistence) */
  id?: number;

  /** Debate this utterance belongs to */
  debateId: string;

  /** Timestamp relative to debate start (milliseconds) */
  timestampMs: number;

  /** Phase during which this utterance occurred */
  phase: DebatePhase;

  /** Who spoke this utterance */
  speaker: Speaker;

  /** The actual text content */
  content: string;

  /** Additional metadata */
  metadata: {
    /** Model used to generate this utterance (for AI agents) */
    model?: string;

    /** Token count */
    tokens?: number;

    /** Generation time in milliseconds */
    generationTimeMs?: number;

    /** Temperature or other model parameters */
    modelParams?: Record<string, unknown>;

    /** Validation status */
    validated?: boolean;

    /** Any warnings or notices */
    warnings?: string[];

    /** Prompt type used (e.g., "opening_statement", "rebuttal") */
    promptType?: string;

    /** Turn number within the current phase */
    turnNumber?: number;
  };
}

/**
 * User intervention wrapper with orchestrator metadata
 */
export interface OrchestratorIntervention {
  /** Intervention ID (assigned after persistence) */
  id?: number;

  /** Debate ID */
  debateId: string;

  /** Timestamp relative to debate start */
  timestampMs: number;

  /** Type of intervention */
  interventionType: 'question' | 'challenge' | 'evidence_injection' | 'pause_request' | 'clarification_request';

  /** User's intervention content */
  content: string;

  /** Which agent the intervention is directed to */
  directedTo: Speaker | null;

  /** Agent's response (null until answered) */
  response: string | null;

  /** Response timestamp */
  responseTimestampMs: number | null;

  /** Metadata */
  metadata?: {
    /** Whether this intervention caused a pause */
    causedPause?: boolean;

    /** How long it took to respond */
    responseTimeMs?: number;

    /** Response quality indicators */
    responseQuality?: Record<string, unknown>;
  };
}

/**
 * Debate transcript - complete record of a debate
 * Conforms to JSON Schema v2.0.0 specification
 */
export interface DebateTranscript {
  /** Metadata section */
  meta: {
    /** Schema version (always 2.0.0) */
    schema_version: '2.0.0';

    /** Unique debate identifier */
    debate_id: string;

    /** Proposition being debated */
    proposition: string;

    /** Additional proposition context */
    proposition_context?: Record<string, unknown>;

    /** Debate start timestamp (ISO 8601) */
    started_at: string;

    /** Debate completion timestamp (ISO 8601) */
    completed_at: string;

    /** Total duration in milliseconds */
    total_duration_ms: number;

    /** Number of utterances */
    utterance_count: number;

    /** Number of user interventions */
    intervention_count: number;

    /** Agent metadata */
    agents: {
      pro_advocate: {
        name: string;
        version: string;
        model?: string;
      };
      con_advocate: {
        name: string;
        version: string;
        model?: string;
      };
      moderator: {
        name: string;
        version: string;
        model?: string;
      };
    };
  };

  /** Chronologically ordered utterances */
  utterances: Array<{
    id: number;
    timestamp_ms: number;
    phase: string;
    speaker: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;

  /** User interventions (if any) */
  interventions: Array<{
    id: number;
    timestamp_ms: number;
    intervention_type: string;
    content: string;
    directed_to: string | null;
    response: string | null;
    response_timestamp_ms: number | null;
  }>;

  /** Phase summary */
  phases: Array<{
    phase: string;
    started_at_ms: number;
    ended_at_ms: number;
    duration_ms: number;
    utterance_count: number;
    speakers: string[];
  }>;

  /** Optional structured analysis */
  analysis?: {
    /** Key points from pro side */
    pro_key_points?: string[];

    /** Key points from con side */
    con_key_points?: string[];

    /** Areas of agreement */
    areas_of_agreement?: string[];

    /** Areas of disagreement */
    areas_of_disagreement?: string[];

    /** Remaining uncertainties */
    uncertainties?: string[];

    /** Evidence quality assessment */
    evidence_quality?: Record<string, unknown>;
  };
}

/**
 * Proposition context for normalization
 * Additional information provided by user when starting a debate
 */
export interface PropositionContext {
  /** User-provided background information */
  background?: string;

  /** Time sensitivity or deadline */
  time_context?: string;

  /** Geographic or jurisdictional scope */
  scope?: string;

  /** Known stakeholders */
  stakeholders?: string[];

  /** Related prior debates or references */
  references?: string[];

  /** Any other contextual information */
  [key: string]: unknown;
}

/**
 * Turn specification - defines a single speaking turn
 */
export interface Turn {
  /** Turn number within the phase */
  turnNumber: number;

  /** Speaker for this turn */
  speaker: Speaker;

  /** Expected prompt type */
  promptType: string;

  /** Optional metadata */
  metadata?: {
    /** Is this a response to previous turn? */
    isResponse?: boolean;

    /** Turn this responds to */
    respondsTo?: number;

    /** Expected duration hint */
    expectedDurationMs?: number;
  };
}

/**
 * Phase execution plan
 */
export interface PhaseExecutionPlan {
  /** Phase identifier */
  phase: DebatePhase;

  /** Ordered list of turns */
  turns: Turn[];

  /** Phase metadata */
  metadata: {
    /** Phase name */
    name: string;

    /** Expected duration in milliseconds */
    expectedDurationMs: number;

    /** Allowed speakers */
    allowedSpeakers: Speaker[];
  };
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Retry attempts for failed agent calls */
  maxRetries: number;

  /** Retry delay in milliseconds */
  retryDelayMs: number;

  /** Timeout for agent calls in milliseconds */
  agentTimeoutMs: number;

  /** Whether to validate utterances before persistence */
  validateUtterances: boolean;

  /** Whether to broadcast events via SSE */
  broadcastEvents: boolean;

  /** Whether to auto-save transcript periodically */
  autoSaveTranscript: boolean;

  /** Auto-save interval in milliseconds */
  autoSaveIntervalMs?: number;
}

/**
 * Orchestrator state
 * Runtime state of the orchestrator
 */
export interface OrchestratorState {
  /** Debate ID */
  debateId: string;

  /** Current phase */
  currentPhase: DebatePhase;

  /** Is debate paused? */
  isPaused: boolean;

  /** Current turn index within phase */
  currentTurnIndex: number;

  /** Total turns executed */
  totalTurnsExecuted: number;

  /** Debate start time */
  startTime: Date;

  /** Errors encountered */
  errors: Array<{
    timestamp: Date;
    phase: DebatePhase;
    message: string;
    context?: Record<string, unknown>;
  }>;
}
