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
  | 'pacing_change'          // Pacing parameter changed mid-debate
  // Human participation mode events
  | 'awaiting_human_input'   // Waiting for human to submit their turn
  | 'human_turn_received'    // Human turn was submitted and accepted
  | 'human_turn_timeout'     // Human took too long to respond
  // Informal discussion mode events
  | 'discussion_started'     // Informal discussion began
  | 'exchange_complete'      // One round of all participants completed
  | 'end_detection_result'   // AI evaluated ending conditions
  | 'entering_wrapup'        // Discussion entering wrap-up phase
  | 'discussion_summary'     // Auto-generated summary ready
  | 'discussion_complete'    // Informal discussion fully ended
  // Duelogic mode events
  | 'token'                  // Streaming token for live display
  | 'duelogic_debate_started' // Duelogic debate started
  | 'segment_start'          // Duelogic segment started
  | 'segment_complete'       // Duelogic segment completed
  | 'chair_interrupt'        // Chair interrupted another chair
  | 'arbiter_interjection'   // Arbiter interjected for violation
  // Research job events
  | 'research_connected'       // Client connected to research job stream
  | 'research_started'         // Research job started
  | 'research_progress'        // Progress update
  | 'research_category_start'  // Starting research on a category
  | 'research_category_complete' // Completed research on a category
  | 'research_topic_found'     // Found a potential topic
  | 'research_topic_scored'    // Topic scored for quality
  | 'topic_prescreened'        // Topic pre-screened for viral potential
  | 'research_topic_filtered'  // Topic filtered out (low quality)
  | 'episode_generating'       // Generating episode proposal
  | 'episode_generated'        // Episode proposal generated
  | 'research_complete'        // Research job completed
  | 'research_failed'          // Research job failed
  | 'research_log'
  // Conversational Podcast Mode events
  | 'conversation_connected'       // Client connected to conversation stream
  | 'conversation_started'         // Conversation session started
  | 'conversation_utterance'       // New utterance from participant or host
  | 'conversation_token'           // Streaming token for live display
  | 'conversation_speaker_changed' // Speaker changed
  | 'conversation_context_updated' // Context board updated
  | 'conversation_paused'          // Conversation paused
  | 'conversation_resumed'         // Conversation resumed
  | 'conversation_completed'       // Conversation ended normally
  | 'conversation_error'           // Error in conversation
  | 'conversation_host_message'    // Host message (intro, transition, etc.)
  | 'conversation_signal'          // Participant signaled desire to speak
  | 'conversation_truncation_retry'      // Attempting to recover from truncation
  | 'conversation_truncation_detected';  // Truncation detected, user can choose model

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

// ============================================================================
// Human Participation Mode Event Payloads
// ============================================================================

/** Awaiting human input event payload */
export interface AwaitingHumanInputEventData {
  debateId: string;
  /** Which side needs to respond: 'pro' or 'con' */
  speaker: 'pro' | 'con';
  /** Current debate phase */
  phase: string;
  /** Turn number within the phase */
  turnNumber: number;
  /** Context prompt for the human (e.g., "Opening statement", "Respond to Con's rebuttal") */
  promptType: string;
  /** Time limit in milliseconds (null = no limit) */
  timeoutMs: number | null;
  /** Timestamp when the wait started */
  timestampMs: number;
}

/** Human turn received event payload */
export interface HumanTurnReceivedEventData {
  debateId: string;
  speaker: 'pro' | 'con';
  /** Character count of submitted content */
  contentLength: number;
  /** Time taken to submit in milliseconds */
  responseTimeMs: number;
  timestampMs: number;
}

/** Human turn timeout event payload */
export interface HumanTurnTimeoutEventData {
  debateId: string;
  speaker: 'pro' | 'con';
  phase: string;
  /** How long we waited before timing out */
  waitedMs: number;
  timestampMs: number;
}

// ============================================================================
// Informal Discussion Mode Event Payloads
// ============================================================================

/** Discussion started event payload */
export interface DiscussionStartedEventData {
  discussionId: string;
  topic: string;
  participants: Array<{
    id: string;
    name: string;
    modelId: string;
  }>;
  maxExchanges: number;
  timestampMs: number;
}

/** Exchange complete event payload */
export interface ExchangeCompleteEventData {
  discussionId: string;
  exchangeNumber: number;
  maxExchanges: number;
  timestampMs: number;
}

/** End detection result event payload */
export interface EndDetectionResultEventData {
  discussionId: string;
  result: {
    shouldEnd: boolean;
    confidence: number;
    reasons: string[];
  };
  timestampMs: number;
}

/** Entering wrap-up event payload */
export interface EnteringWrapupEventData {
  discussionId: string;
  endTrigger: 'max_exchanges' | 'user_wrapup' | 'ai_detected';
  timestampMs: number;
}

/** Discussion summary event payload */
export interface DiscussionSummaryEventData {
  discussionId: string;
  summary: {
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
  timestampMs: number;
}

/** Discussion complete event payload */
export interface DiscussionCompleteEventData {
  discussionId: string;
  completedAt: string;
  totalDurationMs: number;
  totalExchanges: number;
  endTrigger: 'max_exchanges' | 'user_wrapup' | 'ai_detected';
  summary: {
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

// ============================================================================
// Research Job Event Types and Payloads
// ============================================================================

/** Research-specific SSE event types */
export type ResearchSSEEventType =
  | 'research_connected'       // Client connected to research job stream
  | 'research_started'         // Research job started
  | 'research_progress'        // Progress update
  | 'research_category_start'  // Starting research on a category
  | 'research_category_complete' // Completed research on a category
  | 'research_topic_found'     // Found a potential topic
  | 'research_topic_scored'    // Topic scored for quality
  | 'research_topic_filtered'  // Topic filtered out (low quality)
  | 'episode_generating'       // Generating episode proposal
  | 'episode_generated'        // Episode proposal generated
  | 'research_complete'        // Research job completed
  | 'research_failed'          // Research job failed
  | 'research_log';            // General log message

/** Research connected event payload */
export interface ResearchConnectedEventData {
  jobId: string;
  configId: string;
  configName: string;
  message: string;
}

/** Research started event payload */
export interface ResearchStartedEventData {
  jobId: string;
  configId: string;
  configName: string;
  categories: string[];
  maxTopicsPerRun: number;
  timestampMs: number;
}

/** Research progress event payload */
export interface ResearchProgressEventData {
  jobId: string;
  phase: 'discovery' | 'scoring' | 'generation';
  categoriesCompleted: number;
  totalCategories: number;
  topicsFound: number;
  episodesGenerated: number;
  tokensUsed: number;
  timestampMs: number;
}

/** Research category start event payload */
export interface ResearchCategoryStartEventData {
  jobId: string;
  category: string;
  categoryIndex: number;
  totalCategories: number;
  timestampMs: number;
}

/** Research category complete event payload */
export interface ResearchCategoryCompleteEventData {
  jobId: string;
  category: string;
  topicsFound: number;
  tokensUsed: number;
  durationMs: number;
  timestampMs: number;
}

/** Research topic found event payload */
export interface ResearchTopicFoundEventData {
  jobId: string;
  topic: string;
  category: string;
  summary: string;
  sourceCount: number;
  timestampMs: number;
}

/** Research topic scored event payload */
export interface ResearchTopicScoredEventData {
  jobId: string;
  topic: string;
  controversyScore: number;
  timeliness: number;
  depth: number;
  passedThreshold: boolean;
  timestampMs: number;
}

/** Research topic filtered event payload */
export interface ResearchTopicFilteredEventData {
  jobId: string;
  topic: string;
  reason: string;
  scores: {
    controversyScore: number;
    timeliness: number;
    depth: number;
  };
  thresholds: {
    minControversy: number;
    minTimeliness: number;
    minDepth: number;
  };
  timestampMs: number;
}

/** Episode generating event payload */
export interface EpisodeGeneratingEventData {
  jobId: string;
  topic: string;
  category: string;
  timestampMs: number;
}

/** Episode generated event payload */
export interface EpisodeGeneratedEventData {
  jobId: string;
  proposalId: string;
  title: string;
  subtitle: string;
  category: string;
  tokensUsed: number;
  timestampMs: number;
}

/** Research complete event payload */
export interface ResearchCompleteEventData {
  jobId: string;
  topicsDiscovered: number;
  episodesGenerated: number;
  tokensUsed: number;
  durationMs: number;
  timestampMs: number;
}

/** Research failed event payload */
export interface ResearchFailedEventData {
  jobId: string;
  error: string;
  phase?: string;
  category?: string;
  timestampMs: number;
}

/** Research log event payload */
export interface ResearchLogEventData {
  jobId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: Record<string, unknown>;
  timestampMs: number;
}

// ============================================================================
// Conversational Podcast Mode Event Types and Payloads
// ============================================================================

/** Conversation-specific SSE event types */
export type ConversationSSEEventType =
  | 'conversation_connected'
  | 'conversation_started'
  | 'conversation_utterance'
  | 'conversation_token'
  | 'conversation_speaker_changed'
  | 'conversation_context_updated'
  | 'conversation_paused'
  | 'conversation_resumed'
  | 'conversation_completed'
  | 'conversation_error'
  | 'conversation_host_message'
  | 'conversation_signal'
  | 'conversation_truncation_retry'
  | 'conversation_truncation_detected';

/** Conversation connected event payload */
export interface ConversationConnectedEventData {
  sessionId: string;
  clientId: string;
  status: string;
  isActive: boolean;
  message: string;
}

/** Conversation started event payload */
export interface ConversationStartedEventData {
  sessionId: string;
  topic: string;
  participants: Array<{
    id: string;
    name: string;
    personaSlug: string;
    modelId: string;
  }>;
  flowMode: string;
  timestampMs: number;
}

/** Conversation utterance event payload */
export interface ConversationUtteranceEventData {
  sessionId: string;
  utteranceId: number;
  participantId: string | null;
  speakerName: string;
  personaSlug: string;
  content: string;
  isHost: boolean;
  isKeyPoint: boolean;
  topicMarker?: string;
  addressedToId?: string;
  turnCount: number;
  timestampMs: number;
}

/** Conversation token event payload (for streaming) */
export interface ConversationTokenEventData {
  sessionId: string;
  participantId: string | null;
  personaSlug: string;
  personaName: string;
  isHost: boolean;
  segment: string;
  token: string;
  tokenPosition: number;
  timestampMs: number;
}

/** Conversation speaker changed event */
export interface ConversationSpeakerChangedEventData {
  sessionId: string;
  speakerId: string | null;
  speakerName: string;
  personaSlug?: string;
  isHost: boolean;
  turnCount: number;
  timestampMs: number;
}

/** Conversation context update event */
export interface ConversationContextUpdateEventData {
  sessionId: string;
  summary: string;
  topicsDiscussed: string[];
  keyPointsCount: number;
  turnCount: number;
  timestampMs: number;
}

/** Conversation paused event payload */
export interface ConversationPausedEventData {
  sessionId: string;
  pausedAt: string;
  turnCount: number;
  reason?: string;
}

/** Conversation resumed event payload */
export interface ConversationResumedEventData {
  sessionId: string;
  resumedAt: string;
  turnCount: number;
}

/** Conversation completed event payload */
export interface ConversationCompletedEventData {
  sessionId: string;
  completedAt: string;
  totalDurationMs: number;
  turnCount: number;
  utteranceCount: number;
  summary?: string;
}

/** Conversation error event payload */
export interface ConversationErrorEventData {
  sessionId: string;
  error: string;
  code?: string;
  phase?: string;
  timestampMs: number;
}

/** Conversation host message event payload */
export interface ConversationHostMessageEventData {
  sessionId: string;
  messageType: 'opening' | 'question' | 'bridge' | 'redirect' | 'interjection' | 'closing';
  content: string;
  targetParticipantId?: string;
  turnCount: number;
  timestampMs: number;
}

/** Conversation signal event payload */
export interface ConversationSignalEventData {
  sessionId: string;
  participantId: string;
  personaSlug: string;
  personaName: string;
  urgency: 'high' | 'medium' | 'low';
  reason: string;
  preview?: string;
  timestampMs: number;
}

/** Conversation truncation retry event payload */
export interface ConversationTruncationRetryEventData {
  sessionId: string;
  participantId: string;
  personaSlug: string;
  personaName: string;
  /** Which retry attempt this is (1, 2, etc.) */
  retryAttempt: number;
  /** Maximum retries that will be attempted */
  maxRetries: number;
  /** Current content length before retry */
  currentContentLength: number;
  timestampMs: number;
}

/** Conversation truncation detected event payload */
export interface ConversationTruncationDetectedEventData {
  sessionId: string;
  participantId: string;
  personaSlug: string;
  personaName: string;
  /** The partial content that was truncated */
  partialContent: string;
  /** Character count of truncated content */
  contentLength: number;
  /** How the response ended */
  lastChars: string;
  /** What triggered truncation detection: 'length' (API limit) or 'heuristic' (mid-sentence) */
  detectionType: 'length' | 'heuristic';
  /** The current model that produced the truncated response */
  currentModelId: string;
  /** Turn count when this occurred */
  turnCount: number;
  /** Utterance ID if already saved (for regeneration) */
  utteranceId?: number;
  timestampMs: number;
}

/** All conversation event payloads */
export type ConversationSSEEventPayload =
  | ConversationConnectedEventData
  | ConversationStartedEventData
  | ConversationUtteranceEventData
  | ConversationTokenEventData
  | ConversationSpeakerChangedEventData
  | ConversationContextUpdateEventData
  | ConversationPausedEventData
  | ConversationResumedEventData
  | ConversationCompletedEventData
  | ConversationErrorEventData
  | ConversationHostMessageEventData
  | ConversationSignalEventData
  | ConversationTruncationRetryEventData
  | ConversationTruncationDetectedEventData;
