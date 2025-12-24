/**
 * Debate Protocol Configuration
 *
 * Defines the structure, timing, and rules for the 6-phase debate format.
 * This configuration drives the state machine transitions and agent orchestration.
 */

import { DebatePhase, Speaker, type PhaseMetadata } from '../types/debate.js';

/**
 * Phase configuration map
 * Defines metadata, timing, and rules for each debate phase
 */
export const PHASE_CONFIG: Record<DebatePhase, PhaseMetadata | null> = {
  // Special states without configuration
  [DebatePhase.INITIALIZING]: null,
  [DebatePhase.COMPLETED]: null,
  [DebatePhase.PAUSED]: null,
  [DebatePhase.ERROR]: null,

  // Phase 1: Opening Statements (4 minutes)
  [DebatePhase.PHASE_1_OPENING]: {
    phase: DebatePhase.PHASE_1_OPENING,
    name: 'Opening Statements',
    durationMinutes: 4,
    allowedSpeakers: [Speaker.PRO, Speaker.CON, Speaker.MODERATOR],
    turnsPerSpeaker: 1, // Each advocate gets one opening statement
    description:
      'Initial opening statements where each advocate presents their position. ' +
      'Moderator introduces the proposition and provides ground rules.',
  },

  // Phase 2: Constructive Arguments (6 minutes)
  [DebatePhase.PHASE_2_CONSTRUCTIVE]: {
    phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
    name: 'Constructive Arguments',
    durationMinutes: 6,
    allowedSpeakers: [Speaker.PRO, Speaker.CON, Speaker.MODERATOR],
    turnsPerSpeaker: 2, // Each advocate gets two turns to build their case
    description:
      'Main argument construction phase. Advocates present evidence, logic, and reasoning ' +
      'to support their position. Moderator ensures proper time allocation.',
  },

  // Phase 3: Cross-Examination (6 minutes)
  [DebatePhase.PHASE_3_CROSSEXAM]: {
    phase: DebatePhase.PHASE_3_CROSSEXAM,
    name: 'Cross-Examination',
    durationMinutes: 6,
    allowedSpeakers: [Speaker.PRO, Speaker.CON, Speaker.MODERATOR],
    turnsPerSpeaker: 3, // Multiple turns for back-and-forth questioning
    description:
      'Direct questioning phase where each advocate can challenge the other\'s arguments. ' +
      'Focus on identifying weaknesses, testing assumptions, and clarifying positions.',
  },

  // Phase 4: Rebuttals (4 minutes)
  [DebatePhase.PHASE_4_REBUTTAL]: {
    phase: DebatePhase.PHASE_4_REBUTTAL,
    name: 'Rebuttals',
    durationMinutes: 4,
    allowedSpeakers: [Speaker.PRO, Speaker.CON, Speaker.MODERATOR],
    turnsPerSpeaker: 2, // Each advocate gets two rebuttal turns
    description:
      'Advocates respond to challenges raised during cross-examination and address ' +
      'weaknesses in their arguments. Opportunity to strengthen positions.',
  },

  // Phase 5: Closing Statements (4 minutes)
  [DebatePhase.PHASE_5_CLOSING]: {
    phase: DebatePhase.PHASE_5_CLOSING,
    name: 'Closing Statements',
    durationMinutes: 4,
    allowedSpeakers: [Speaker.PRO, Speaker.CON, Speaker.MODERATOR],
    turnsPerSpeaker: 1, // One final statement per advocate
    description:
      'Final opportunity for each advocate to summarize their position, highlight key points, ' +
      'and make their strongest case. No new arguments introduced.',
  },

  // Phase 6: Moderator Synthesis (3 minutes)
  [DebatePhase.PHASE_6_SYNTHESIS]: {
    phase: DebatePhase.PHASE_6_SYNTHESIS,
    name: 'Moderator Synthesis',
    durationMinutes: 3,
    allowedSpeakers: [Speaker.MODERATOR],
    turnsPerSpeaker: 1, // Moderator only
    description:
      'Moderator provides neutral synthesis of the debate, highlighting key arguments from ' +
      'both sides, areas of agreement/disagreement, and remaining uncertainties. NO judgment on winner.',
  },
};

/**
 * Get phase configuration
 * Returns metadata for a specific phase, or null for special states
 */
export function getPhaseConfig(phase: DebatePhase): PhaseMetadata | null {
  return PHASE_CONFIG[phase];
}

/**
 * Get phase duration in milliseconds
 * Returns 0 for special states (INITIALIZING, COMPLETED, PAUSED, ERROR)
 */
export function getPhaseDurationMs(phase: DebatePhase): number {
  const config = PHASE_CONFIG[phase];
  return config ? config.durationMinutes * 60 * 1000 : 0;
}

/**
 * Get total debate duration in milliseconds
 * Sum of all 6 debate phases (excludes special states)
 */
export function getTotalDebateDurationMs(): number {
  const phases = [
    DebatePhase.PHASE_1_OPENING,
    DebatePhase.PHASE_2_CONSTRUCTIVE,
    DebatePhase.PHASE_3_CROSSEXAM,
    DebatePhase.PHASE_4_REBUTTAL,
    DebatePhase.PHASE_5_CLOSING,
    DebatePhase.PHASE_6_SYNTHESIS,
  ];

  return phases.reduce((total, phase) => total + getPhaseDurationMs(phase), 0);
}

/**
 * Check if a speaker is allowed in a phase
 */
export function isSpeakerAllowedInPhase(speaker: Speaker, phase: DebatePhase): boolean {
  const config = PHASE_CONFIG[phase];
  if (!config) {
    // For special states, only SYSTEM speaker is allowed
    return speaker === Speaker.SYSTEM;
  }
  return config.allowedSpeakers.includes(speaker);
}

/**
 * Get the next sequential phase
 * Returns null if there is no next phase (terminal state)
 */
export function getNextPhase(currentPhase: DebatePhase): DebatePhase | null {
  const phaseSequence: DebatePhase[] = [
    DebatePhase.INITIALIZING,
    DebatePhase.PHASE_1_OPENING,
    DebatePhase.PHASE_2_CONSTRUCTIVE,
    DebatePhase.PHASE_3_CROSSEXAM,
    DebatePhase.PHASE_4_REBUTTAL,
    DebatePhase.PHASE_5_CLOSING,
    DebatePhase.PHASE_6_SYNTHESIS,
    DebatePhase.COMPLETED,
  ];

  const currentIndex = phaseSequence.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === phaseSequence.length - 1) {
    return null; // No next phase
  }

  return phaseSequence[currentIndex + 1] ?? null;
}

/**
 * Get default speaker for a phase
 * Returns the first allowed speaker, or SYSTEM for special states
 */
export function getDefaultSpeaker(phase: DebatePhase): Speaker {
  const config = PHASE_CONFIG[phase];
  if (!config || config.allowedSpeakers.length === 0) {
    return Speaker.SYSTEM;
  }
  return config.allowedSpeakers[0] ?? Speaker.SYSTEM;
}

/**
 * Validate phase transition
 * Checks if a transition from one phase to another is logically valid
 */
export function isValidPhaseTransition(fromPhase: DebatePhase, toPhase: DebatePhase): boolean {
  // Can always transition to ERROR or PAUSED from any state
  if (toPhase === DebatePhase.ERROR || toPhase === DebatePhase.PAUSED) {
    return true;
  }

  // Can only resume to the previous phase from PAUSED
  if (fromPhase === DebatePhase.PAUSED) {
    // Will be validated by state machine using previousPhase
    return true;
  }

  // Cannot transition from terminal states (except PAUSED)
  if (fromPhase === DebatePhase.COMPLETED || fromPhase === DebatePhase.ERROR) {
    return false;
  }

  // Check if this is the next sequential phase
  const nextPhase = getNextPhase(fromPhase);
  return nextPhase === toPhase;
}
