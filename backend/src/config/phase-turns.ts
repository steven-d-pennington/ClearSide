/**
 * Phase Turn Configuration
 *
 * Defines the exact turn-by-turn structure for each debate phase.
 * Each turn specifies who speaks, what type of prompt they receive,
 * how long they have, and any metadata about the turn.
 */

import { DebatePhase, Speaker } from '../types/debate.js';

/**
 * Prompt type for each turn
 * Determines which prompt template the agent receives
 */
export type PromptType =
  | 'opening_statement'
  | 'constructive_argument'
  | 'cross_examination_question'
  | 'cross_examination_response'
  | 'rebuttal'
  | 'closing_statement'
  | 'moderator_synthesis';

/**
 * Turn configuration interface
 * Complete specification for a single turn in the debate
 */
export interface TurnConfig {
  /** Which agent speaks in this turn */
  speaker: Speaker;

  /** Type of prompt this turn uses */
  promptType: PromptType;

  /** Maximum duration for this turn in seconds */
  durationSeconds: number;

  /** Optional metadata about this turn */
  metadata?: {
    /** Round number (for multi-round phases) */
    round?: number;

    /** Category or focus area (e.g., "economic", "ethical") */
    category?: string;

    /** Turn number within the phase */
    turnNumber?: number;

    /** Additional context-specific data */
    [key: string]: unknown;
  };
}

/**
 * Phase turn configurations
 * Maps each debate phase to its ordered sequence of turns
 */
export const PHASE_TURN_CONFIGS: Record<DebatePhase, TurnConfig[]> = {
  // Special states have no turns
  [DebatePhase.INITIALIZING]: [],
  [DebatePhase.COMPLETED]: [],
  [DebatePhase.PAUSED]: [],
  [DebatePhase.ERROR]: [],

  // Phase 1: Opening Statements (2 turns, 4 minutes total)
  [DebatePhase.PHASE_1_OPENING]: [
    {
      speaker: Speaker.PRO,
      promptType: 'opening_statement',
      durationSeconds: 120, // 2 minutes
      metadata: {
        turnNumber: 1,
        category: 'opening',
      },
    },
    {
      speaker: Speaker.CON,
      promptType: 'opening_statement',
      durationSeconds: 120, // 2 minutes
      metadata: {
        turnNumber: 2,
        category: 'opening',
      },
    },
  ],

  // Phase 2: Constructive Arguments (6 turns, 12 minutes total)
  // 3 rounds of Pro/Con arguments, each focusing on different aspects
  [DebatePhase.PHASE_2_CONSTRUCTIVE]: [
    // Round 1: Economic arguments
    {
      speaker: Speaker.PRO,
      promptType: 'constructive_argument',
      durationSeconds: 120, // 2 minutes
      metadata: {
        round: 1,
        turnNumber: 1,
        category: 'economic',
      },
    },
    {
      speaker: Speaker.CON,
      promptType: 'constructive_argument',
      durationSeconds: 120, // 2 minutes
      metadata: {
        round: 1,
        turnNumber: 2,
        category: 'economic',
      },
    },

    // Round 2: Ethical arguments
    {
      speaker: Speaker.PRO,
      promptType: 'constructive_argument',
      durationSeconds: 120, // 2 minutes
      metadata: {
        round: 2,
        turnNumber: 3,
        category: 'ethical',
      },
    },
    {
      speaker: Speaker.CON,
      promptType: 'constructive_argument',
      durationSeconds: 120, // 2 minutes
      metadata: {
        round: 2,
        turnNumber: 4,
        category: 'ethical',
      },
    },

    // Round 3: Practical arguments
    {
      speaker: Speaker.PRO,
      promptType: 'constructive_argument',
      durationSeconds: 120, // 2 minutes
      metadata: {
        round: 3,
        turnNumber: 5,
        category: 'practical',
      },
    },
    {
      speaker: Speaker.CON,
      promptType: 'constructive_argument',
      durationSeconds: 120, // 2 minutes
      metadata: {
        round: 3,
        turnNumber: 6,
        category: 'practical',
      },
    },
  ],

  // Phase 3: Cross-Examination (2 turns, 6 minutes total)
  // Each side gets time to ask questions
  [DebatePhase.PHASE_3_CROSSEXAM]: [
    {
      speaker: Speaker.PRO,
      promptType: 'cross_examination_question',
      durationSeconds: 180, // 3 minutes
      metadata: {
        turnNumber: 1,
        category: 'questioning',
      },
    },
    {
      speaker: Speaker.CON,
      promptType: 'cross_examination_question',
      durationSeconds: 180, // 3 minutes
      metadata: {
        turnNumber: 2,
        category: 'questioning',
      },
    },
  ],

  // Phase 4: Rebuttals (2 turns, 4 minutes total)
  // Con goes first in rebuttals (standard debate format)
  [DebatePhase.PHASE_4_REBUTTAL]: [
    {
      speaker: Speaker.CON,
      promptType: 'rebuttal',
      durationSeconds: 120, // 2 minutes
      metadata: {
        turnNumber: 1,
        category: 'rebuttal',
      },
    },
    {
      speaker: Speaker.PRO,
      promptType: 'rebuttal',
      durationSeconds: 120, // 2 minutes
      metadata: {
        turnNumber: 2,
        category: 'rebuttal',
      },
    },
  ],

  // Phase 5: Closing Statements (2 turns, 4 minutes total)
  // Con goes first in closing (gives Pro last word, standard debate format)
  [DebatePhase.PHASE_5_CLOSING]: [
    {
      speaker: Speaker.CON,
      promptType: 'closing_statement',
      durationSeconds: 120, // 2 minutes
      metadata: {
        turnNumber: 1,
        category: 'closing',
      },
    },
    {
      speaker: Speaker.PRO,
      promptType: 'closing_statement',
      durationSeconds: 120, // 2 minutes
      metadata: {
        turnNumber: 2,
        category: 'closing',
      },
    },
  ],

  // Phase 6: Moderator Synthesis (1 turn, 3 minutes total)
  // Only moderator speaks
  [DebatePhase.PHASE_6_SYNTHESIS]: [
    {
      speaker: Speaker.MODERATOR,
      promptType: 'moderator_synthesis',
      durationSeconds: 180, // 3 minutes
      metadata: {
        turnNumber: 1,
        category: 'synthesis',
      },
    },
  ],
};

/**
 * Get turn configurations for a specific phase
 */
export function getTurnsForPhase(phase: DebatePhase): TurnConfig[] {
  return PHASE_TURN_CONFIGS[phase] || [];
}

/**
 * Get total duration for a phase in seconds
 */
export function getPhaseTurnDurationSeconds(phase: DebatePhase): number {
  const turns = PHASE_TURN_CONFIGS[phase] || [];
  return turns.reduce((total, turn) => total + turn.durationSeconds, 0);
}

/**
 * Get total number of turns for a phase
 */
export function getTurnCountForPhase(phase: DebatePhase): number {
  return (PHASE_TURN_CONFIGS[phase] || []).length;
}
