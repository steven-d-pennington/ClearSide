/**
 * Conversational Podcast Mode Frontend Types
 *
 * Frontend-specific types for the conversational podcast feature.
 * Dates are strings (ISO format from API).
 */

// ============================================================================
// Status Enums
// ============================================================================

/** Session status values */
export type SessionStatus = 'configuring' | 'live' | 'paused' | 'completed' | 'error';

/** Flow control modes */
export type FlowMode = 'manual' | 'auto_stream' | 'natural_pace';

/** Segment types for podcast structure */
export type SegmentType = 'introduction' | 'discussion' | 'closing' | 'host_question';

/** Urgency levels for speaker signals */
export type SignalUrgency = 'low' | 'medium' | 'high';

/** Reasons for wanting to speak */
export type SignalReason = 'respond' | 'disagree' | 'add_point' | 'question' | 'interrupt';

// ============================================================================
// Persona Definitions
// ============================================================================

/**
 * Voice characteristics for TTS guidance
 */
export interface VoiceCharacteristics {
  pitch?: string;
  pace?: string;
  warmth?: string;
  energy?: string;
  tone?: string;
  accent?: string;
}

/**
 * A persistent podcast persona with backstory and speaking style
 */
export interface PodcastPersona {
  id: string;
  slug: string;
  name: string;
  avatarEmoji: string;
  backstory: string;
  speakingStyle: string;
  worldview: string;
  quirks: string[];
  voiceCharacteristics: VoiceCharacteristics;
  examplePhrases: string[];
  preferredTopics: string[];
  // Default voice settings for consistent podcast generation
  defaultVoiceProvider?: string;
  defaultVoiceId?: string;
  defaultVoiceSettings?: Record<string, unknown>;
}

// ============================================================================
// Session Configuration
// ============================================================================

/**
 * Configuration for a single participant
 */
export interface ParticipantConfig {
  personaSlug: string;
  modelId: string;
  modelDisplayName?: string;
  providerName?: string;
  displayNameOverride?: string;
}

/**
 * A conversation session
 */
export interface ConversationSession {
  id: string;
  episodeProposalId?: string;
  topic: string;
  topicContext?: string;
  participantCount: number;
  flowMode: FlowMode;
  paceDelayMs: number;
  rapidFire: boolean;
  minimalPersonaMode: boolean;
  status: SessionStatus;
  currentSpeakerIndex: number;
  hostModelId?: string;
  hostDisplayName: string;
  startedAt?: string;
  completedAt?: string;
  totalDurationMs?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A participant in a conversation (persona + model assignment)
 */
export interface ConversationParticipant {
  id: string;
  sessionId: string;
  personaId: string;
  persona?: PodcastPersona;
  modelId: string;
  modelDisplayName?: string;
  providerName?: string;
  displayNameOverride?: string;
  participantOrder: number;
}

// ============================================================================
// Utterances
// ============================================================================

/**
 * A single utterance in the conversation
 */
export interface ConversationUtterance {
  id: number;
  sessionId: string;
  participantId?: string;
  participant?: ConversationParticipant;
  content: string;
  isHostUtterance: boolean;
  addressedToParticipantId?: string;
  addressedTo?: ConversationParticipant;
  timestampMs: number;
  isKeyPoint: boolean;
  topicMarker?: string;
  segmentType: SegmentType;
}

// ============================================================================
// Context Board
// ============================================================================

/**
 * A topic discussed in the conversation
 */
export interface TopicEntry {
  topic: string;
  introducedBy: string;
  introducedByName?: string;
  timestampMs: number;
  status: 'active' | 'resolved' | 'tabled';
}

/**
 * A claim made by a participant
 */
export interface ClaimEntry {
  claim: string;
  participantId: string;
  participantName?: string;
  stance: 'assertion' | 'hypothesis' | 'question';
  supportedBy: string[];
  challengedBy: string[];
  timestampMs: number;
}

/**
 * An agreement between participants
 */
export interface AgreementEntry {
  topic: string;
  participants: string[];
  participantNames?: string[];
  timestampMs: number;
}

/**
 * A disagreement between participants
 */
export interface DisagreementEntry {
  topic: string;
  sideA: string[];
  sideB: string[];
  sideANames?: string[];
  sideBNames?: string[];
  timestampMs: number;
}

/**
 * The shared context board tracking conversation state
 */
export interface ContextBoardState {
  sessionId: string;
  topicsDiscussed: TopicEntry[];
  claims: ClaimEntry[];
  agreements: AgreementEntry[];
  disagreements: DisagreementEntry[];
  keyPointsByParticipant: Record<string, string[]>;
  currentThread?: string;
  speakerQueue: SpeakerSignal[];
}

// ============================================================================
// Flow Control
// ============================================================================

/**
 * A signal from a participant wanting to speak
 */
export interface SpeakerSignal {
  participantId: string;
  participantName?: string;
  urgency: SignalUrgency;
  reason: SignalReason;
  preview?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request to create a new conversation session
 */
export interface CreateSessionRequest {
  topic: string;
  topicContext?: string;
  episodeProposalId?: string;
  participants: ParticipantConfig[];
  flowMode: FlowMode;
  paceDelayMs?: number;
  rapidFire?: boolean;
  hostModelId?: string;
  hostDisplayName?: string;
}

/**
 * Response after creating a session
 */
export interface CreateSessionResponse {
  session: ConversationSession;
  participants: ConversationParticipant[];
}

/**
 * Session status with full details
 */
export interface SessionStatusResponse {
  session: ConversationSession;
  participants: ConversationParticipant[];
  utteranceCount: number;
  contextBoard?: ContextBoardState;
}

/**
 * Transcript response with markdown
 */
export interface TranscriptResponse {
  session: ConversationSession;
  participants: ConversationParticipant[];
  utterances: ConversationUtterance[];
  markdown?: string;
}

// ============================================================================
// SSE Event Types
// ============================================================================

/** All possible SSE event types for conversations */
export type ConversationSSEEventType =
  | 'conversation_started'
  | 'conversation_paused'
  | 'conversation_resumed'
  | 'conversation_completed'
  | 'conversation_error'
  | 'host_speaking'
  | 'participant_speaking'
  | 'utterance'
  | 'token'
  | 'context_board_update'
  | 'speaker_signal'
  | 'flow_mode_changed';

/**
 * SSE event wrapper
 */
export interface ConversationSSEEvent {
  type: ConversationSSEEventType;
  sessionId: string;
  timestamp: number;
  payload: unknown;
}

/**
 * Token event payload for streaming
 */
export interface TokenEventPayload {
  token: string;
  participantId?: string;
  isHost: boolean;
}

/**
 * Utterance event payload
 */
export interface UtteranceEventPayload {
  utterance: ConversationUtterance;
}

/**
 * Context board update event payload
 */
export interface ContextBoardUpdatePayload {
  contextBoard: ContextBoardState;
}

// ============================================================================
// Display Labels
// ============================================================================

/** Human-readable labels for flow modes */
export const FLOW_MODE_LABELS: Record<FlowMode, string> = {
  manual: 'Step-through (Next button)',
  auto_stream: 'Auto-stream (Fast forward)',
  natural_pace: 'Natural Pace (Realistic timing)',
};

/** Human-readable labels for session statuses */
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  configuring: 'Setting up...',
  live: 'Live',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Error',
};

/** CSS class names for session statuses */
export const SESSION_STATUS_CLASSES: Record<SessionStatus, string> = {
  configuring: 'status-configuring',
  live: 'status-live',
  paused: 'status-paused',
  completed: 'status-completed',
  error: 'status-error',
};

/** Human-readable labels for segment types */
export const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  introduction: 'Introduction',
  discussion: 'Discussion',
  closing: 'Closing',
  host_question: 'Host Question',
};

/** Human-readable labels for signal reasons */
export const SIGNAL_REASON_LABELS: Record<SignalReason, string> = {
  respond: 'Wants to respond',
  disagree: 'Wants to disagree',
  add_point: 'Has something to add',
  question: 'Has a question',
  interrupt: 'Urgent interjection',
};

// ============================================================================
// Constants
// ============================================================================

/** Constraints for conversation sessions */
export const CONVERSATION_CONSTRAINTS = {
  minParticipants: 2,
  maxParticipants: 6,
  defaultPaceDelayMs: 3000,
  minPaceDelayMs: 1000,
  maxPaceDelayMs: 10000,
} as const;

/** Default pace options for natural pace mode */
export const PACE_OPTIONS = [
  { value: 1000, label: 'Fast (1s)' },
  { value: 3000, label: 'Normal (3s)' },
  { value: 5000, label: 'Relaxed (5s)' },
  { value: 10000, label: 'Slow (10s)' },
] as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display name for a participant
 */
export function getParticipantDisplayName(participant: ConversationParticipant): string {
  return participant.displayNameOverride || participant.persona?.name || 'Guest';
}

/**
 * Get avatar for a participant
 */
export function getParticipantAvatar(participant: ConversationParticipant): string {
  return participant.persona?.avatarEmoji || '🎙️';
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Check if a session is in a terminal state
 */
export function isSessionTerminal(status: SessionStatus): boolean {
  return status === 'completed' || status === 'error';
}

/**
 * Check if a session can be controlled
 */
export function isSessionControllable(status: SessionStatus): boolean {
  return status === 'live' || status === 'paused';
}
