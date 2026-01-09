/**
 * Conversational Podcast Mode Type Definitions
 *
 * Supports free-form podcast conversations with 2-6 AI personas,
 * a talk show-style host, and shared context tracking.
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
  pitch?: 'low' | 'medium-low' | 'medium' | 'medium-high' | 'high';
  pace?: 'slow' | 'measured' | 'steady' | 'quick' | 'fast' | 'variable';
  warmth?: 'low' | 'medium' | 'high' | 'very high';
  energy?: 'low' | 'medium' | 'high' | 'bright' | 'engaging' | 'fierce';
  tone?: 'authoritative' | 'commanding' | 'dreamy' | 'serious' | 'warm';
  accent?: string;
}

/**
 * A persistent podcast persona with backstory and speaking style
 */
export interface PodcastPersona {
  id: string;
  slug: string;                      // URL-friendly identifier
  name: string;                      // Display name
  avatarEmoji: string;               // Quick visual identifier
  backstory: string;                 // Full character backstory
  speakingStyle: string;             // How they communicate
  worldview: string;                 // Their perspective/philosophy
  quirks: string[];                  // Character quirks
  voiceCharacteristics: VoiceCharacteristics;
  examplePhrases: string[];          // Sample phrases for consistency
  preferredTopics: string[];         // Topics they engage with most
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for podcast_personas table
 */
export interface PodcastPersonaRow {
  id: string;
  slug: string;
  name: string;
  avatar_emoji: string;
  backstory: string;
  speaking_style: string;
  worldview: string;
  quirks: string[];
  voice_characteristics: VoiceCharacteristics;
  example_phrases: string[];
  preferred_topics: string[];
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Session Configuration
// ============================================================================

/**
 * Configuration for a conversation session
 */
export interface ConversationSessionConfig {
  topic: string;
  topicContext?: string;
  episodeProposalId?: string;
  participants: ParticipantConfig[];
  flowMode: FlowMode;
  paceDelayMs?: number;
  hostModelId?: string;
  hostDisplayName?: string;
}

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
  status: SessionStatus;
  currentSpeakerIndex: number;
  hostModelId?: string;
  hostDisplayName: string;
  startedAt?: Date;
  completedAt?: Date;
  totalDurationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for conversation_sessions table
 */
export interface ConversationSessionRow {
  id: string;
  episode_proposal_id?: string;
  topic: string;
  topic_context?: string;
  participant_count: number;
  flow_mode: string;
  pace_delay_ms: number;
  status: string;
  current_speaker_index: number;
  host_model_id?: string;
  host_display_name: string;
  started_at?: Date;
  completed_at?: Date;
  total_duration_ms?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * A participant in a conversation (persona + model assignment)
 */
export interface ConversationParticipant {
  id: string;
  sessionId: string;
  personaId: string;
  persona?: PodcastPersona;          // Populated when fetched
  modelId: string;
  modelDisplayName?: string;
  providerName?: string;
  displayNameOverride?: string;
  participantOrder: number;
  createdAt: Date;
}

/**
 * Database row for conversation_participants table
 */
export interface ConversationParticipantRow {
  id: string;
  session_id: string;
  persona_id: string;
  model_id: string;
  model_display_name?: string;
  provider_name?: string;
  display_name_override?: string;
  participant_order: number;
  created_at: Date;
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
  participant?: ConversationParticipant; // Populated when fetched
  content: string;
  isHostUtterance: boolean;
  addressedToParticipantId?: string;
  addressedTo?: ConversationParticipant; // Populated when fetched
  timestampMs: number;
  isKeyPoint: boolean;
  topicMarker?: string;
  segmentType: SegmentType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Database row for conversation_utterances table
 */
export interface ConversationUtteranceRow {
  id: number;
  session_id: string;
  participant_id?: string;
  content: string;
  is_host_utterance: boolean;
  addressed_to_participant_id?: string;
  timestamp_ms: number;
  is_key_point: boolean;
  topic_marker?: string;
  segment_type: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ============================================================================
// Context Board
// ============================================================================

/**
 * A topic discussed in the conversation
 */
export interface TopicEntry {
  topic: string;
  introducedBy: string;              // Participant ID
  introducedByName?: string;         // Display name
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
  supportedBy: string[];             // Participant IDs who agreed
  challengedBy: string[];            // Participant IDs who disagreed
  timestampMs: number;
}

/**
 * An agreement between participants
 */
export interface AgreementEntry {
  topic: string;
  participants: string[];            // Participant IDs
  participantNames?: string[];
  timestampMs: number;
}

/**
 * A disagreement between participants
 */
export interface DisagreementEntry {
  topic: string;
  sideA: string[];                   // Participant IDs
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
  updatedAt: Date;
}

/**
 * Database row for conversation_context_boards table
 */
export interface ContextBoardRow {
  id: string;
  session_id: string;
  topics_discussed: TopicEntry[];
  claims: ClaimEntry[];
  agreements: AgreementEntry[];
  disagreements: DisagreementEntry[];
  key_points_by_participant: Record<string, string[]>;
  current_thread?: string;
  speaker_queue: SpeakerSignal[];
  updated_at: Date;
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
  preview?: string;                  // Brief preview of what they want to say
  createdAt?: Date;
}

/**
 * Decision from the host about who speaks next
 */
export interface SpeakerDecision {
  type: 'speak' | 'conclude';
  participantId?: string;
  steeringPrompt: string;            // Guidance for the next speaker
  reason: string;                    // Why this choice
}

// ============================================================================
// API Types
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
 * Request to change flow mode
 */
export interface UpdateFlowModeRequest {
  mode: FlowMode;
  paceDelayMs?: number;
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
 * Transcript export response
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

// ============================================================================
// Type Guards
// ============================================================================

/** Check if value is a valid SessionStatus */
export function isSessionStatus(value: unknown): value is SessionStatus {
  return (
    typeof value === 'string' &&
    ['configuring', 'live', 'paused', 'completed', 'error'].includes(value)
  );
}

/** Check if value is a valid FlowMode */
export function isFlowMode(value: unknown): value is FlowMode {
  return (
    typeof value === 'string' &&
    ['manual', 'auto_stream', 'natural_pace'].includes(value)
  );
}

/** Check if value is a valid SegmentType */
export function isSegmentType(value: unknown): value is SegmentType {
  return (
    typeof value === 'string' &&
    ['introduction', 'discussion', 'closing', 'host_question'].includes(value)
  );
}

/** Check if value is a valid SignalUrgency */
export function isSignalUrgency(value: unknown): value is SignalUrgency {
  return (
    typeof value === 'string' &&
    ['low', 'medium', 'high'].includes(value)
  );
}

/** Check if value is a valid SignalReason */
export function isSignalReason(value: unknown): value is SignalReason {
  return (
    typeof value === 'string' &&
    ['respond', 'disagree', 'add_point', 'question', 'interrupt'].includes(value)
  );
}

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

/** Default configuration values */
export const DEFAULT_SESSION_CONFIG: Partial<ConversationSessionConfig> = {
  flowMode: 'manual',
  paceDelayMs: 3000,
  hostDisplayName: 'Host',
};

/**
 * Get urgency weight for sorting speaker signals
 */
export function getUrgencyWeight(urgency: SignalUrgency): number {
  const weights: Record<SignalUrgency, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };
  return weights[urgency];
}

// ============================================================================
// Row Mappers
// ============================================================================

/**
 * Map database row to PodcastPersona
 */
export function mapPersonaRow(row: PodcastPersonaRow): PodcastPersona {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    avatarEmoji: row.avatar_emoji,
    backstory: row.backstory,
    speakingStyle: row.speaking_style,
    worldview: row.worldview,
    quirks: row.quirks,
    voiceCharacteristics: row.voice_characteristics,
    examplePhrases: row.example_phrases,
    preferredTopics: row.preferred_topics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map database row to ConversationSession
 */
export function mapSessionRow(row: ConversationSessionRow): ConversationSession {
  return {
    id: row.id,
    episodeProposalId: row.episode_proposal_id,
    topic: row.topic,
    topicContext: row.topic_context,
    participantCount: row.participant_count,
    flowMode: row.flow_mode as FlowMode,
    paceDelayMs: row.pace_delay_ms,
    status: row.status as SessionStatus,
    currentSpeakerIndex: row.current_speaker_index,
    hostModelId: row.host_model_id,
    hostDisplayName: row.host_display_name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalDurationMs: row.total_duration_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map database row to ConversationParticipant
 */
export function mapParticipantRow(row: ConversationParticipantRow): ConversationParticipant {
  return {
    id: row.id,
    sessionId: row.session_id,
    personaId: row.persona_id,
    modelId: row.model_id,
    modelDisplayName: row.model_display_name,
    providerName: row.provider_name,
    displayNameOverride: row.display_name_override,
    participantOrder: row.participant_order,
    createdAt: row.created_at,
  };
}

/**
 * Map database row to ConversationUtterance
 */
export function mapUtteranceRow(row: ConversationUtteranceRow): ConversationUtterance {
  return {
    id: row.id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    content: row.content,
    isHostUtterance: row.is_host_utterance,
    addressedToParticipantId: row.addressed_to_participant_id,
    timestampMs: row.timestamp_ms,
    isKeyPoint: row.is_key_point,
    topicMarker: row.topic_marker,
    segmentType: row.segment_type as SegmentType,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/**
 * Map database row to ContextBoardState
 */
export function mapContextBoardRow(row: ContextBoardRow): ContextBoardState {
  return {
    sessionId: row.session_id,
    topicsDiscussed: row.topics_discussed,
    claims: row.claims,
    agreements: row.agreements,
    disagreements: row.disagreements,
    keyPointsByParticipant: row.key_points_by_participant,
    currentThread: row.current_thread,
    speakerQueue: row.speaker_queue,
    updatedAt: row.updated_at,
  };
}
