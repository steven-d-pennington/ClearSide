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
  | 'error';                 // Error occurred during debate

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
