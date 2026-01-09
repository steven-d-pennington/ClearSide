# CONV-002: TypeScript Types for Conversational Podcast Mode

**Task ID:** CONV-002
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** CONV-001 (Database Schema)
**Status:** Ready

---

## Context

This task creates TypeScript type definitions for the Conversational Podcast Mode feature. Types are needed for both backend and frontend, with shared definitions for API contracts.

**References:**
- [CONV-001](./CONV-001.md) - Database schema (mirrors types)
- [Implementation Plan](../../../.claude/plans/async-noodling-tiger.md)
- Existing patterns: `backend/src/types/duelogic.ts`, `backend/src/types/duelogic-research.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/types/conversation.ts` with all backend types
- [ ] Create `frontend/src/types/conversation.ts` with frontend types
- [ ] Define PodcastPersona interface with all persona fields
- [ ] Define ConversationSession interface with status tracking
- [ ] Define ConversationParticipant interface for persona+model mapping
- [ ] Define ConversationUtterance interface with direct addressing
- [ ] Define ContextBoardState interface for shared whiteboard
- [ ] Define SpeakerSignal interface for hybrid flow control
- [ ] Define all status enums with type guards
- [ ] Define API request/response types
- [ ] Add JSDoc comments for all exported types
- [ ] Ensure types match database schema from CONV-001

---

## Implementation Guide

### Backend Types

Create file: `backend/src/types/conversation.ts`

```typescript
/**
 * Conversational Podcast Mode Type Definitions
 *
 * Supports free-form podcast conversations with 2-6 AI personas,
 * a talk show-style host, and shared context tracking.
 */

// ============================================================================
// Status Enums
// ============================================================================

export type SessionStatus = 'configuring' | 'live' | 'paused' | 'completed' | 'error';
export type FlowMode = 'manual' | 'auto_stream' | 'natural_pace';
export type SegmentType = 'introduction' | 'discussion' | 'closing' | 'host_question';
export type SignalUrgency = 'low' | 'medium' | 'high';
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

export interface ConversationSSEEvent {
  type: ConversationSSEEventType;
  sessionId: string;
  timestamp: number;
  payload: unknown;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isSessionStatus(value: unknown): value is SessionStatus {
  return (
    typeof value === 'string' &&
    ['configuring', 'live', 'paused', 'completed', 'error'].includes(value)
  );
}

export function isFlowMode(value: unknown): value is FlowMode {
  return (
    typeof value === 'string' &&
    ['manual', 'auto_stream', 'natural_pace'].includes(value)
  );
}

export function isSegmentType(value: unknown): value is SegmentType {
  return (
    typeof value === 'string' &&
    ['introduction', 'discussion', 'closing', 'host_question'].includes(value)
  );
}

export function isSignalUrgency(value: unknown): value is SignalUrgency {
  return (
    typeof value === 'string' &&
    ['low', 'medium', 'high'].includes(value)
  );
}

export function isSignalReason(value: unknown): value is SignalReason {
  return (
    typeof value === 'string' &&
    ['respond', 'disagree', 'add_point', 'question', 'interrupt'].includes(value)
  );
}

// ============================================================================
// Constants
// ============================================================================

export const CONVERSATION_CONSTRAINTS = {
  minParticipants: 2,
  maxParticipants: 6,
  defaultPaceDelayMs: 3000,
  minPaceDelayMs: 1000,
  maxPaceDelayMs: 10000,
} as const;

export const DEFAULT_SESSION_CONFIG: Partial<ConversationSessionConfig> = {
  flowMode: 'manual',
  paceDelayMs: 3000,
  hostDisplayName: 'Host',
};

/**
 * Urgency weight for sorting speaker signals
 */
export function getUrgencyWeight(urgency: SignalUrgency): number {
  const weights: Record<SignalUrgency, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };
  return weights[urgency];
}
```

### Frontend Types

Create file: `frontend/src/types/conversation.ts`

```typescript
/**
 * Conversational Podcast Mode Frontend Types
 */

// Re-export shared types from a common location or define frontend-specific versions

export type SessionStatus = 'configuring' | 'live' | 'paused' | 'completed' | 'error';
export type FlowMode = 'manual' | 'auto_stream' | 'natural_pace';
export type SegmentType = 'introduction' | 'discussion' | 'closing' | 'host_question';
export type SignalUrgency = 'low' | 'medium' | 'high';
export type SignalReason = 'respond' | 'disagree' | 'add_point' | 'question' | 'interrupt';

export interface VoiceCharacteristics {
  pitch?: string;
  pace?: string;
  warmth?: string;
  energy?: string;
  tone?: string;
  accent?: string;
}

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
}

export interface ParticipantConfig {
  personaSlug: string;
  modelId: string;
  modelDisplayName?: string;
  providerName?: string;
  displayNameOverride?: string;
}

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
  startedAt?: string;
  completedAt?: string;
  totalDurationMs?: number;
  createdAt: string;
  updatedAt: string;
}

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

export interface TopicEntry {
  topic: string;
  introducedBy: string;
  introducedByName?: string;
  timestampMs: number;
  status: 'active' | 'resolved' | 'tabled';
}

export interface ClaimEntry {
  claim: string;
  participantId: string;
  participantName?: string;
  stance: 'assertion' | 'hypothesis' | 'question';
  supportedBy: string[];
  challengedBy: string[];
  timestampMs: number;
}

export interface AgreementEntry {
  topic: string;
  participants: string[];
  participantNames?: string[];
  timestampMs: number;
}

export interface DisagreementEntry {
  topic: string;
  sideA: string[];
  sideB: string[];
  sideANames?: string[];
  sideBNames?: string[];
  timestampMs: number;
}

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

export interface SpeakerSignal {
  participantId: string;
  participantName?: string;
  urgency: SignalUrgency;
  reason: SignalReason;
  preview?: string;
}

// API Request/Response types
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

export interface SessionStatusResponse {
  session: ConversationSession;
  participants: ConversationParticipant[];
  utteranceCount: number;
  contextBoard?: ContextBoardState;
}

// SSE Event types
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

export interface ConversationSSEEvent {
  type: ConversationSSEEventType;
  sessionId: string;
  timestamp: number;
  payload: unknown;
}

// Display helpers
export const FLOW_MODE_LABELS: Record<FlowMode, string> = {
  manual: 'Step-through (Next button)',
  auto_stream: 'Auto-stream (Fast forward)',
  natural_pace: 'Natural Pace (Realistic timing)',
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  configuring: 'Setting up...',
  live: 'Live',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Error',
};
```

---

## Validation

### How to Test

1. Verify TypeScript compilation:
   ```bash
   cd backend && npm run build
   cd ../frontend && npm run build
   ```

2. Verify types are exported:
   ```typescript
   // In a test file or REPL
   import { PodcastPersona, ConversationSession } from './types/conversation';
   ```

3. Test type guards:
   ```typescript
   import { isSessionStatus, isFlowMode } from './types/conversation';

   console.log(isSessionStatus('live'));      // true
   console.log(isSessionStatus('invalid'));   // false
   console.log(isFlowMode('manual'));         // true
   ```

4. Verify types match database schema from CONV-001

### Definition of Done

- [ ] `backend/src/types/conversation.ts` created with all types
- [ ] `frontend/src/types/conversation.ts` created with frontend types
- [ ] All interfaces have JSDoc comments
- [ ] Type guards implemented for all status enums
- [ ] Constants defined (constraints, defaults)
- [ ] Types match database schema exactly
- [ ] TypeScript compiles without errors
- [ ] Types exported correctly

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-002 COMPLETE</promise>
```

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
