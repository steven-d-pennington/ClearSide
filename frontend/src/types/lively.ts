/**
 * Lively Debate Mode Type Definitions for Frontend
 *
 * Types for the dynamic, interruption-enabled debate mode.
 * Mirrors backend types for SSE communication.
 */

import { Speaker } from './debate';

/**
 * Debate mode selection
 */
export type DebateMode = 'turn_based' | 'lively' | 'informal' | 'duelogic';

/**
 * Pacing mode for lively debates
 * Controls the intensity and frequency of interruptions
 */
export type PacingMode = 'slow' | 'medium' | 'fast' | 'frantic';

/**
 * Interrupt status
 */
export type InterruptStatus = 'pending' | 'fired' | 'cancelled' | 'suppressed';

/**
 * Speaker state in lively mode
 */
export type LivelySpeakerState = 'speaking' | 'queued' | 'cooldown' | 'ready' | 'interrupted';

/**
 * Lively settings configuration
 */
export interface LivelySettings {
  id: number;
  debateId: string;

  /** Aggression level (1-5): Higher = more frequent interruptions */
  aggressionLevel: number;

  /** Maximum interruptions allowed per minute */
  maxInterruptsPerMinute: number;

  /** Cooldown period after an interrupt (ms) */
  interruptCooldownMs: number;

  /** Minimum speaking time before interrupt allowed (ms) */
  minSpeakingTimeMs: number;

  /** Relevance threshold for triggering interrupt (0-1) */
  relevanceThreshold: number;

  /** Boost to relevance score when contradiction detected (0-1) */
  contradictionBoost: number;

  /** Pacing mode */
  pacingMode: PacingMode;

  /** Maximum tokens for interjection responses */
  interjectionMaxTokens: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * Lively settings input (for creating/updating)
 */
export interface LivelySettingsInput {
  debateId?: string;
  aggressionLevel?: number;
  maxInterruptsPerMinute?: number;
  interruptCooldownMs?: number;
  minSpeakingTimeMs?: number;
  relevanceThreshold?: number;
  contradictionBoost?: number;
  pacingMode?: PacingMode;
  interjectionMaxTokens?: number;
}

/**
 * Interrupt candidate from SSE
 */
export interface InterruptCandidate {
  speaker: Speaker;
  relevanceScore: number;
  contradictionScore: number;
  combinedScore: number;
  triggerPhrase: string;
  suggestedInterjection?: string;
}

/**
 * Interruption record from database
 */
export interface Interruption {
  id: number;
  debateId: string;
  scheduledAtMs: number;
  firedAtMs: number | null;
  interrupter: Speaker;
  interruptedSpeaker: Speaker;
  triggerPhrase: string | null;
  interjectionContent: string | null;
  interruptedAtToken: number | null;
  relevanceScore: number | null;
  contradictionScore: number | null;
  status: InterruptStatus;
  cancellationReason: string | null;
  createdAt: string;
}

/**
 * Active speaker state for tracking current speaker
 */
export interface ActiveSpeakerState {
  speaker: Speaker;
  startedAtMs: number;
  tokenPosition: number;
  partialContent: string;
  interruptWindowOpen: boolean;
  lastSafeBoundary: number;
}

/**
 * Lively mode state for the store
 */
export interface LivelyState {
  /** Is lively mode enabled for current debate */
  isLivelyMode: boolean;

  /** Current lively settings */
  settings: LivelySettings | null;

  /** Active speaker state (who is currently speaking) */
  activeSpeaker: ActiveSpeakerState | null;

  /** Speaker states map */
  speakerStates: Map<Speaker, LivelySpeakerState>;

  /** Pending interrupt (scheduled but not fired) */
  pendingInterrupt: InterruptCandidate | null;

  /** Last interrupt time per speaker (for cooldown display) */
  lastInterruptTime: Map<Speaker, number>;

  /** Interrupts this minute (for rate limit display) */
  interruptsThisMinute: number;

  /** History of interruptions in this debate */
  interruptions: Interruption[];

  /** Current streaming interjection content */
  streamingInterjection: {
    speaker: Speaker;
    content: string;
    isStreaming: boolean;
  } | null;
}

/**
 * Preset configuration for lively mode
 */
export interface LivelyPreset {
  id: string;
  name: string;
  description: string;
  settings: LivelySettingsInput;
}

/**
 * Default lively settings
 */
export const DEFAULT_LIVELY_SETTINGS: LivelySettingsInput = {
  aggressionLevel: 3,
  maxInterruptsPerMinute: 2,
  interruptCooldownMs: 15000,
  minSpeakingTimeMs: 5000,
  relevanceThreshold: 0.7,
  contradictionBoost: 0.3,
  pacingMode: 'medium',
  interjectionMaxTokens: 60,
};

/**
 * Initial lively state
 */
export const initialLivelyState: LivelyState = {
  isLivelyMode: false,
  settings: null,
  activeSpeaker: null,
  speakerStates: new Map(),
  pendingInterrupt: null,
  lastInterruptTime: new Map(),
  interruptsThisMinute: 0,
  interruptions: [],
  streamingInterjection: null,
};

/**
 * Pacing mode display information
 */
export const PACING_INFO: Record<PacingMode, { name: string; description: string }> = {
  slow: {
    name: 'Calm',
    description: 'Minimal interruptions, relaxed pacing',
  },
  medium: {
    name: 'Balanced',
    description: 'Natural flow with occasional interruptions',
  },
  fast: {
    name: 'Energetic',
    description: 'Frequent interruptions, fast-paced discussion',
  },
  frantic: {
    name: 'Chaotic',
    description: 'Maximum interruptions, intense debate',
  },
};

/**
 * Aggression level display information
 */
export const AGGRESSION_INFO: Record<number, { name: string; description: string }> = {
  1: { name: 'Very Low', description: 'Rarely interrupts' },
  2: { name: 'Low', description: 'Occasionally interrupts' },
  3: { name: 'Medium', description: 'Moderate interruptions' },
  4: { name: 'High', description: 'Frequent interruptions' },
  5: { name: 'Very High', description: 'Aggressive interruptions' },
};
