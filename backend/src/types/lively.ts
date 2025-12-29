/**
 * Lively Debate Mode Type Definitions
 * Types for the dynamic, interruption-enabled debate mode
 */

import { Speaker } from './debate.js';

/**
 * Debate mode selection
 */
export type DebateMode = 'turn_based' | 'lively';

/**
 * Pacing mode for lively debates
 * Controls the intensity and frequency of interruptions
 */
export type PacingMode = 'slow' | 'medium' | 'fast' | 'frantic';

/**
 * Interrupt status in the database
 */
export type InterruptStatus = 'pending' | 'fired' | 'cancelled' | 'suppressed';

/**
 * Speaker state in lively mode
 */
export type SpeakerState = 'speaking' | 'queued' | 'cooldown' | 'ready' | 'interrupted';

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

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating lively settings
 */
export interface LivelySettingsInput {
  debateId: string;
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
 * Database record for a debate interruption
 */
export interface Interruption {
  id: number;
  debateId: string;

  /** When interrupt was scheduled (ms from debate start) */
  scheduledAtMs: number;

  /** When interrupt actually fired (null if pending/cancelled) */
  firedAtMs: number | null;

  /** Who is interrupting */
  interrupter: Speaker;

  /** Who was interrupted */
  interruptedSpeaker: Speaker;

  /** What triggered the interrupt decision */
  triggerPhrase: string | null;

  /** The interjection content (1-2 sentences) */
  interjectionContent: string | null;

  /** Token position where cutoff occurred */
  interruptedAtToken: number | null;

  /** Relevance score (0-1) */
  relevanceScore: number | null;

  /** Contradiction score (0-1) */
  contradictionScore: number | null;

  /** Current status */
  status: InterruptStatus;

  /** Reason for cancellation (if cancelled) */
  cancellationReason: string | null;

  createdAt: Date;
}

/**
 * Input for creating an interruption record
 */
export interface CreateInterruptionInput {
  debateId: string;
  scheduledAtMs: number;
  interrupter: Speaker;
  interruptedSpeaker: Speaker;
  triggerPhrase?: string;
  relevanceScore?: number;
  contradictionScore?: number;
}

/**
 * Interrupt candidate evaluated by InterruptionEngine
 */
export interface InterruptCandidate {
  /** Who would interrupt */
  speaker: Speaker;

  /** Relevance score (0-1) */
  relevanceScore: number;

  /** Contradiction score (0-1) */
  contradictionScore: number;

  /** Combined score for ranking */
  combinedScore: number;

  /** What triggered the evaluation */
  triggerPhrase: string;

  /** Suggested interjection (if pre-generated) */
  suggestedInterjection?: string;
}

/**
 * Active speaker tracking state
 */
export interface ActiveSpeakerState {
  /** Current speaker */
  speaker: Speaker;

  /** When they started speaking (ms from debate start) */
  startedAtMs: number;

  /** Current token position */
  tokenPosition: number;

  /** Content generated so far */
  partialContent: string;

  /** Whether interrupt window is open */
  interruptWindowOpen: boolean;

  /** Last safe boundary position (sentence end) */
  lastSafeBoundary: number;
}

/**
 * Lively mode state for the orchestrator
 */
export interface LivelyState {
  /** Current settings */
  settings: LivelySettings;

  /** Active speaker state */
  activeSpeaker: ActiveSpeakerState | null;

  /** Speaker states map */
  speakerStates: Map<Speaker, SpeakerState>;

  /** Pending interrupt (scheduled but not fired) */
  pendingInterrupt: InterruptCandidate | null;

  /** Last interrupt time per speaker (for cooldowns) */
  lastInterruptTime: Map<Speaker, number>;

  /** Interrupts fired this minute (for rate limiting) */
  interruptsThisMinute: number;

  /** Minute counter reset timestamp */
  minuteStartMs: number;
}

/**
 * Pacing configuration by mode
 */
export const PACING_CONFIG: Record<PacingMode, {
  evaluationIntervalMs: number;
  baseAggressionMultiplier: number;
  tokenChunkSize: number;
}> = {
  slow: {
    evaluationIntervalMs: 2000,
    baseAggressionMultiplier: 0.5,
    tokenChunkSize: 100,
  },
  medium: {
    evaluationIntervalMs: 1000,
    baseAggressionMultiplier: 1.0,
    tokenChunkSize: 50,
  },
  fast: {
    evaluationIntervalMs: 500,
    baseAggressionMultiplier: 1.5,
    tokenChunkSize: 30,
  },
  frantic: {
    evaluationIntervalMs: 250,
    baseAggressionMultiplier: 2.0,
    tokenChunkSize: 20,
  },
};

/**
 * Default lively settings
 *
 * Tuned for natural debate flow:
 * - minSpeakingTimeMs: 15s lets speakers make complete points before interrupts
 * - aggressionLevel: 2 (moderate) for balanced interruptions
 * - relevanceThreshold: 0.8 ensures only high-quality interrupts fire
 * - interruptCooldownMs: 20s prevents rapid-fire interruptions
 */
export const DEFAULT_LIVELY_SETTINGS: Omit<LivelySettingsInput, 'debateId'> = {
  aggressionLevel: 2,
  maxInterruptsPerMinute: 2,
  interruptCooldownMs: 20000,
  minSpeakingTimeMs: 15000,
  relevanceThreshold: 0.8,
  contradictionBoost: 0.3,
  pacingMode: 'medium',
  interjectionMaxTokens: 60,
};
