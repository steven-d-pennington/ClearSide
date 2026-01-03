/**
 * Database type definitions for ClearSide
 * Defines interfaces for debates, utterances, and user interventions
 */

import type { PresetMode } from './configuration.js';

/**
 * Debate status enum
 * Tracks the lifecycle of a debate from initialization to completion
 */
export type DebateStatus = 'initializing' | 'live' | 'paused' | 'completed' | 'error' | 'failed';

/**
 * Current debate phase
 * Maps to the 6-phase debate protocol or informal discussion phases
 */
export type DebatePhase =
  | 'opening_statements'
  | 'clarifying_questions'
  | 'evidence_presentation'
  | 'rebuttals'
  | 'synthesis'
  | 'closing_statements'
  // Informal discussion phases
  | 'informal'
  | 'wrapup';

/**
 * Speaker identifier
 * Identifies who is currently speaking in the debate or discussion
 */
export type Speaker =
  | 'moderator'
  | 'pro_advocate'
  | 'con_advocate'
  | 'user'
  // Informal discussion participants
  | 'participant_1'
  | 'participant_2'
  | 'participant_3'
  | 'participant_4';

/**
 * Flow mode for debate progression
 * Controls whether debate runs automatically or pauses for user review
 */
export type FlowMode = 'auto' | 'step';

/**
 * Intervention type
 * Classifies the type of user intervention during a debate
 */
export type InterventionType =
  | 'question'
  | 'challenge'
  | 'evidence_injection'
  | 'pause_request'
  | 'clarification_request';

/**
 * Main debate entity
 * Represents a complete debate session with all metadata and state
 */
export interface Debate {
  /** Unique identifier (UUID v4) */
  id: string;

  /** The proposition being debated (e.g., "AI data centers should be subject to a moratorium") */
  propositionText: string;

  /** Additional context about the proposition (JSON object) */
  propositionContext: Record<string, unknown>;

  /** Current status of the debate */
  status: DebateStatus;

  /** Current phase of the debate protocol */
  currentPhase: DebatePhase;

  /** Current speaker in the debate */
  currentSpeaker: Speaker;

  /** Flow mode - auto continues automatically, step pauses after each turn */
  flowMode: FlowMode;

  /** Whether the debate is awaiting user continue signal (step mode) */
  isAwaitingContinue: boolean;

  /** Selected preset mode for this debate */
  presetMode: PresetMode;

  /** Brevity level (1 = detailed, 5 = concise) */
  brevityLevel: number;

  /** LLM temperature setting (0.0 - 1.0) */
  llmTemperature: number;

  /** Maximum tokens per response */
  maxTokensPerResponse: number;

  /** Whether citations are required */
  requireCitations: boolean;

  /** Optional persona for Pro advocate */
  proPersonaId: string | null;

  /** Optional persona for Con advocate */
  conPersonaId: string | null;

  /** Model ID used for Pro advocate (e.g., anthropic/claude-3.5-sonnet) */
  proModelId: string | null;

  /** Model ID used for Con advocate (e.g., openai/gpt-4o) */
  conModelId: string | null;

  /** Model ID used for Moderator */
  moderatorModelId: string | null;

  /** Debate mode (turn_based, lively, informal, duelogic) */
  debateMode: 'turn_based' | 'lively' | 'informal' | 'duelogic';

  /** Timestamp when debate started (ISO 8601) */
  startedAt: Date | null;

  /** Timestamp when debate completed (ISO 8601) */
  completedAt: Date | null;

  /** Total duration of the debate in milliseconds */
  totalDurationMs: number | null;

  /** Complete transcript of the debate (JSON array of utterances) */
  transcriptJson: Record<string, unknown> | null;

  /** Structured analysis output (JSON object) */
  structuredAnalysisJson: Record<string, unknown> | null;

  /** Record creation timestamp */
  createdAt: Date;

  /** Record last update timestamp */
  updatedAt: Date;
}

/**
 * Single utterance/turn in a debate
 * Represents one speech act by any speaker
 */
export interface Utterance {
  /** Unique identifier (auto-increment) */
  id: number;

  /** Foreign key to debates table */
  debateId: string;

  /** Timestamp relative to debate start (milliseconds) */
  timestampMs: number;

  /** Phase during which this utterance occurred */
  phase: DebatePhase;

  /** Who spoke this utterance */
  speaker: Speaker;

  /** The actual text content of the utterance */
  content: string;

  /** Additional metadata (e.g., tokens used, model, confidence, etc.) */
  metadata: Record<string, unknown>;

  /** Record creation timestamp */
  createdAt: Date;
}

/**
 * User intervention during a debate
 * Tracks when users pause to ask questions or inject evidence
 */
export interface UserIntervention {
  /** Unique identifier (auto-increment) */
  id: number;

  /** Foreign key to debates table */
  debateId: string;

  /** Timestamp relative to debate start (milliseconds) */
  timestampMs: number;

  /** Type of intervention */
  interventionType: InterventionType;

  /** User's intervention content (question, evidence, etc.) */
  content: string;

  /** Which agent the intervention is directed to (null = all/moderator) */
  directedTo: Speaker | null;

  /** Agent's response to the intervention (null until answered) */
  response: string | null;

  /** Timestamp when response was provided (milliseconds, null until answered) */
  responseTimestampMs: number | null;

  /** Record creation timestamp */
  createdAt: Date;
}

/**
 * Database query result types
 * Used by repositories for type-safe query results
 */

/** Raw database row for debates table */
export interface DebateRow {
  id: string;
  proposition_text: string;
  proposition_context: unknown;
  status: DebateStatus;
  current_phase: DebatePhase;
  current_speaker: Speaker;
  flow_mode: FlowMode;
  is_awaiting_continue: boolean;
  preset_mode: string;
  brevity_level: number;
  llm_temperature: number;
  max_tokens_per_response: number;
  require_citations: boolean;
  pro_persona_id: string | null;
  con_persona_id: string | null;
  pro_model_id: string | null;
  con_model_id: string | null;
  moderator_model_id: string | null;
  debate_mode: string;
  started_at: Date | null;
  completed_at: Date | null;
  total_duration_ms: number | null;
  transcript_json: unknown | null;
  structured_analysis_json: unknown | null;
  created_at: Date;
  updated_at: Date;
}

/** Raw database row for utterances table */
export interface UtteranceRow {
  id: number;
  debate_id: string;
  timestamp_ms: number;
  phase: DebatePhase;
  speaker: Speaker;
  content: string;
  metadata: unknown;
  created_at: Date;
}

/** Raw database row for user_interventions table */
export interface UserInterventionRow {
  id: number;
  debate_id: string;
  timestamp_ms: number;
  intervention_type: InterventionType;
  content: string;
  directed_to: Speaker | null;
  response: string | null;
  response_timestamp_ms: number | null;
  created_at: Date;
}

/**
 * Create debate input (omits auto-generated fields)
 */
export interface CreateDebateInput {
  /** Optional custom ID (auto-generated if not provided) */
  id?: string;
  propositionText: string;
  propositionContext?: Record<string, unknown>;
  flowMode?: FlowMode;
  /** Configuration fields */
  presetMode?: PresetMode;
  brevityLevel?: number;
  llmTemperature?: number;
  maxTokensPerResponse?: number;
  requireCitations?: boolean;
  /** Persona selections */
  proPersonaId?: string | null;
  conPersonaId?: string | null;
  /** Model selections (OpenRouter model IDs) */
  proModelId?: string | null;
  conModelId?: string | null;
  moderatorModelId?: string | null;
  /** Debate mode */
  debateMode?: 'turn_based' | 'lively' | 'informal' | 'duelogic';
  /** Duelogic configuration (only for duelogic mode) */
  duelogicConfig?: Record<string, unknown>;
}

/**
 * Create utterance input (omits auto-generated fields)
 */
export interface CreateUtteranceInput {
  debateId: string;
  timestampMs: number;
  phase: DebatePhase;
  speaker: Speaker;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create intervention input (omits auto-generated fields)
 */
export interface CreateInterventionInput {
  debateId: string;
  timestampMs: number;
  interventionType: InterventionType;
  content: string;
  directedTo?: Speaker | null;
}

/**
 * Update debate status input
 */
export interface UpdateDebateStatusInput {
  status: DebateStatus;
  currentPhase?: DebatePhase;
  currentSpeaker?: Speaker;
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

/**
 * Event severity levels
 */
export type EventSeverity = 'debug' | 'info' | 'warn' | 'error';

/**
 * Event types for the system events table
 * Categorizes different types of orchestrator and system events
 */
export type SystemEventType =
  // Debate lifecycle
  | 'debate_started'
  | 'debate_completed'
  | 'debate_error'
  | 'debate_paused'
  | 'debate_resumed'
  // Phase management
  | 'phase_transition'
  | 'turn_started'
  | 'turn_completed'
  | 'turn_skipped'
  // Response quality
  | 'empty_response'
  | 'retry_attempt'
  | 'retry_success'
  | 'retry_exhausted'
  | 'truncated_response'
  // Rate limiting
  | 'rate_limit_hit'
  | 'rate_limit_wait'
  // Interruptions
  | 'interruption_fired'
  | 'resumption'
  // Model events
  | 'model_selected'
  | 'reasoning_enabled'
  // Generic
  | 'info'
  | 'warning'
  | 'error';

/**
 * System event entity
 * Represents a logged event for monitoring and debugging
 */
export interface SystemEvent {
  /** Unique identifier (auto-increment) */
  id: number;

  /** Type of event */
  eventType: SystemEventType;

  /** Severity level */
  severity: EventSeverity;

  /** Optional reference to associated debate */
  debateId: string | null;

  /** Speaker involved (if applicable) */
  speaker: string | null;

  /** Debate phase (if applicable) */
  phase: string | null;

  /** Prompt type being processed (if applicable) */
  promptType: string | null;

  /** Human-readable event message */
  message: string;

  /** Additional event metadata */
  metadata: Record<string, unknown>;

  /** Record creation timestamp */
  createdAt: Date;
}

/**
 * Raw database row for system_events table
 */
export interface SystemEventRow {
  id: number;
  event_type: string;
  severity: EventSeverity;
  debate_id: string | null;
  speaker: string | null;
  phase: string | null;
  prompt_type: string | null;
  message: string;
  metadata: unknown;
  created_at: Date;
}

/**
 * Create system event input
 */
export interface CreateSystemEventInput {
  eventType: SystemEventType;
  severity?: EventSeverity;
  debateId?: string | null;
  speaker?: string | null;
  phase?: string | null;
  promptType?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * System event query filters
 */
export interface SystemEventFilters {
  debateId?: string;
  eventType?: SystemEventType | SystemEventType[];
  severity?: EventSeverity | EventSeverity[];
  speaker?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
