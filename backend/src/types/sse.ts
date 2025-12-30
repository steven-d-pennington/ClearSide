/**
 * Server-Sent Events (SSE) type definitions for ClearSide
 * Defines interfaces for real-time debate streaming
 */

import type { Response } from 'express';

/**
 * SSE Event Type
 * Defines all possible event types that can be streamed to clients
 */
export type SSEEventType =
  | 'connected'              // Initial connection confirmation
  | 'utterance'              // New utterance from an agent
  | 'phase_transition'       // Debate moved to a new phase
  | 'phase_start'            // Phase started
  | 'phase_complete'         // Phase completed
  | 'intervention_submitted' // User intervention submitted
  | 'intervention_response'  // Response to a user intervention
  | 'pause'                  // Debate paused by user
  | 'resume'                 // Debate resumed after pause
  | 'debate_paused'          // Debate paused (alternative)
  | 'debate_resumed'         // Debate resumed (alternative)
  | 'awaiting_continue'      // Step mode: waiting for user to continue
  | 'continuing'             // Step mode: user clicked continue, resuming
  | 'complete'               // Debate completed
  | 'debate_complete'        // Debate completed (alternative)
  | 'debate_stopped'         // Debate stopped by user
  | 'error'                  // Error occurred during debate
  // Catch-up events for reconnecting clients
  | 'catchup_start'          // Client reconnected, catch-up beginning
  | 'catchup_utterance'      // Historical utterance sent during catch-up
  | 'catchup_complete'       // All catch-up data sent, switching to live
  // Lively mode events
  | 'speaker_started'        // Speaker takes the floor in lively mode
  | 'speaker_cutoff'         // Speaker was interrupted mid-utterance
  | 'token_chunk'            // Streaming token chunk for live display
  | 'interrupt_scheduled'    // Interrupt is queued, UI shows anticipation
  | 'interrupt_fired'        // Interrupt happens, interrupter takes floor
  | 'interrupt_cancelled'    // Scheduled interrupt was cancelled
  | 'interjection'           // Short 1-2 sentence interrupt content
  | 'speaking_resumed'       // Original speaker continues after interjection
  | 'lively_mode_started'    // Debate switched to lively mode
  | 'pacing_change';         // Pacing parameter changed mid-debate

/**
 * SSE Client
 * Represents a connected client listening to a debate stream
 */
export interface SSEClient {
  /** Unique client identifier (UUID v4) */
  id: string;

  /** ID of the debate this client is watching */
  debateId: string;

  /** Express response object for streaming */
  res: Response;

  /** Timestamp when client connected */
  connectedAt: Date;

  /** Last event ID received (for reconnection) */
  lastEventId: string | null;
}

/**
 * SSE Event
 * Standard structure for all SSE events sent to clients
 * Note: Uses 'event' field to match frontend SSEMessage interface
 */
export interface SSEEvent<T = unknown> {
  /** Type of event (named 'event' to match frontend) */
  event: SSEEventType;

  /** Event payload data */
  data: T;

  /** Timestamp when event was created (ISO 8601) */
  timestamp: string;

  /** Optional event ID (for reconnection support) */
  id?: string;
}

/**
 * Event-specific payload types
 */

/** Connected event payload */
export interface ConnectedEventData {
  debateId: string;
  clientId: string;
  message: string;
}

/** Utterance event payload */
export interface UtteranceEventData {
  id: number;
  debateId: string;
  timestampMs: number;
  phase: string;
  speaker: string;
  content: string;
  metadata: Record<string, unknown>;
}

/** Phase transition event payload */
export interface PhaseTransitionEventData {
  debateId: string;
  fromPhase: string | null;
  toPhase: string;
  timestamp: string;
}

/** Intervention response event payload */
export interface InterventionResponseEventData {
  interventionId: number;
  debateId: string;
  speaker: string;
  response: string;
  timestampMs: number;
}

/** Pause event payload */
export interface PauseEventData {
  debateId: string;
  reason?: string;
  timestamp: string;
}

/** Resume event payload */
export interface ResumeEventData {
  debateId: string;
  timestamp: string;
}

/** Complete event payload */
export interface CompleteEventData {
  debateId: string;
  totalDurationMs: number;
  finalPhase: string;
  timestamp: string;
}

/** Error event payload */
export interface ErrorEventData {
  debateId: string;
  error: string;
  code?: string;
  timestamp: string;
}

/** Debate stopped event payload */
export interface DebateStoppedEventData {
  debateId: string;
  stoppedAt: string;
  reason: string;
  totalDurationMs?: number;
}

// ============================================================================
// Lively Mode Event Payloads
// ============================================================================

/** Speaker started event payload (lively mode) */
export interface SpeakerStartedEventData {
  debateId: string;
  speaker: string;
  phase: string;
  timestampMs: number;
  expectedDurationMs?: number;
}

/** Speaker cutoff event payload (lively mode) */
export interface SpeakerCutoffEventData {
  debateId: string;
  cutoffSpeaker: string;
  interruptedBy: string;
  atTokenPosition: number;
  partialContent: string;
  timestampMs: number;
}

/** Token chunk event payload (lively mode streaming) */
export interface TokenChunkEventData {
  debateId: string;
  speaker: string;
  chunk: string;
  tokenPosition: number;
  timestampMs: number;
}

/** Interrupt scheduled event payload (lively mode) */
export interface InterruptScheduledEventData {
  debateId: string;
  interrupter: string;
  currentSpeaker: string;
  scheduledForMs: number;
  relevanceScore: number;
  triggerPhrase?: string;
}

/** Interrupt fired event payload (lively mode) */
export interface InterruptFiredEventData {
  debateId: string;
  interrupter: string;
  interruptedSpeaker: string;
  timestampMs: number;
}

/** Interrupt cancelled event payload (lively mode) */
export interface InterruptCancelledEventData {
  debateId: string;
  interrupter: string;
  reason: string;
  timestampMs: number;
}

/** Interjection event payload (lively mode) */
export interface InterjectionEventData {
  id: number;
  debateId: string;
  speaker: string;
  content: string;
  timestampMs: number;
  isInterjection: true;
}

/** Speaking resumed event payload (lively mode) */
export interface SpeakingResumedEventData {
  debateId: string;
  speaker: string;
  resumeFromToken: number;
  timestampMs: number;
}

/** Lively mode started event payload */
export interface LivelyModeStartedEventData {
  debateId: string;
  settings: {
    aggressionLevel: number;
    pacingMode: string;
    maxInterruptsPerMinute: number;
  };
  timestampMs: number;
}

/** Pacing change event payload */
export interface PacingChangeEventData {
  debateId: string;
  previousPacing: string;
  newPacing: string;
  timestampMs: number;
}

// ============================================================================
// Catch-up Event Payloads (for reconnecting clients)
// ============================================================================

/** Catch-up start event payload */
export interface CatchupStartEventData {
  debateId: string;
  missedTurnCount: number;
  fromTurnNumber: number;
  toTurnNumber: number;
}

/** Catch-up utterance event payload (same as utterance but marked) */
export interface CatchupUtteranceEventData {
  id: number;
  timestamp_ms: number;
  phase: string;
  speaker: string;
  content: string;
  metadata: Record<string, unknown>;
  isCatchup: true;
}

/** Catch-up complete event payload */
export interface CatchupCompleteEventData {
  debateId: string;
  utterancesSent: number;
  currentPhase: string;
  debateStatus: string;
}
