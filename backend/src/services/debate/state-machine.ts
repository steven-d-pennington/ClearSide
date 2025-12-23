/**
 * Debate State Machine
 *
 * Core orchestration component that manages debate phase transitions,
 * state persistence, and event emission. Enforces strict transition rules
 * and maintains debate state consistency.
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import { DebatePhase, Speaker, type DebateState, type PhaseTransitionEvent } from '../../types/debate.js';
import { getDefaultSpeaker } from '../../config/debate-protocol.js';
import type { DebatePhase as DbDebatePhase, Speaker as DbSpeaker, DebateStatus } from '../../types/database.js';
import * as debateRepo from '../../db/repositories/debate-repository.js';

/**
 * Logger instance for state machine operations
 */
const logger = pino({
  name: 'debate-state-machine',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Transition map defining valid state transitions
 * Key: from phase, Value: array of allowed destination phases
 */
const TRANSITIONS: Map<DebatePhase, DebatePhase[]> = new Map([
  // From INITIALIZING, can only go to PHASE_1_OPENING or ERROR
  [DebatePhase.INITIALIZING, [DebatePhase.PHASE_1_OPENING, DebatePhase.ERROR]],

  // From PHASE_1_OPENING, can go to PHASE_2_CONSTRUCTIVE, PAUSED, or ERROR
  [DebatePhase.PHASE_1_OPENING, [DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PAUSED, DebatePhase.ERROR]],

  // From PHASE_2_CONSTRUCTIVE, can go to PHASE_3_CROSSEXAM, PAUSED, or ERROR
  [DebatePhase.PHASE_2_CONSTRUCTIVE, [DebatePhase.PHASE_3_CROSSEXAM, DebatePhase.PAUSED, DebatePhase.ERROR]],

  // From PHASE_3_CROSSEXAM, can go to PHASE_4_REBUTTAL, PAUSED, or ERROR
  [DebatePhase.PHASE_3_CROSSEXAM, [DebatePhase.PHASE_4_REBUTTAL, DebatePhase.PAUSED, DebatePhase.ERROR]],

  // From PHASE_4_REBUTTAL, can go to PHASE_5_CLOSING, PAUSED, or ERROR
  [DebatePhase.PHASE_4_REBUTTAL, [DebatePhase.PHASE_5_CLOSING, DebatePhase.PAUSED, DebatePhase.ERROR]],

  // From PHASE_5_CLOSING, can go to PHASE_6_SYNTHESIS, PAUSED, or ERROR
  [DebatePhase.PHASE_5_CLOSING, [DebatePhase.PHASE_6_SYNTHESIS, DebatePhase.PAUSED, DebatePhase.ERROR]],

  // From PHASE_6_SYNTHESIS, can only go to COMPLETED or ERROR
  [DebatePhase.PHASE_6_SYNTHESIS, [DebatePhase.COMPLETED, DebatePhase.ERROR]],

  // From PAUSED, can resume to any debate phase (validated by previousPhase)
  [
    DebatePhase.PAUSED,
    [
      DebatePhase.PHASE_1_OPENING,
      DebatePhase.PHASE_2_CONSTRUCTIVE,
      DebatePhase.PHASE_3_CROSSEXAM,
      DebatePhase.PHASE_4_REBUTTAL,
      DebatePhase.PHASE_5_CLOSING,
      DebatePhase.PHASE_6_SYNTHESIS,
      DebatePhase.ERROR,
    ],
  ],

  // Terminal states: COMPLETED and ERROR cannot transition to anything
  [DebatePhase.COMPLETED, []],
  [DebatePhase.ERROR, []],
]);

/**
 * Map state machine phase to database phase
 */
function mapToDbPhase(phase: DebatePhase): DbDebatePhase {
  const phaseMap: Record<string, DbDebatePhase> = {
    [DebatePhase.PHASE_1_OPENING]: 'opening_statements',
    [DebatePhase.PHASE_2_CONSTRUCTIVE]: 'evidence_presentation',
    [DebatePhase.PHASE_3_CROSSEXAM]: 'clarifying_questions',
    [DebatePhase.PHASE_4_REBUTTAL]: 'rebuttals',
    [DebatePhase.PHASE_5_CLOSING]: 'closing_statements',
    [DebatePhase.PHASE_6_SYNTHESIS]: 'synthesis',
  };

  return phaseMap[phase] || 'opening_statements';
}

/**
 * Map state machine speaker to database speaker
 */
function mapToDbSpeaker(speaker: Speaker): DbSpeaker {
  const speakerMap: Record<Speaker, DbSpeaker> = {
    [Speaker.PRO]: 'pro_advocate',
    [Speaker.CON]: 'con_advocate',
    [Speaker.MODERATOR]: 'moderator',
    [Speaker.SYSTEM]: 'moderator', // Map SYSTEM to moderator for database
  };

  return speakerMap[speaker];
}

/**
 * Map state machine phase to database status
 */
function mapToDbStatus(phase: DebatePhase): DebateStatus {
  if (phase === DebatePhase.INITIALIZING) return 'initializing';
  if (phase === DebatePhase.COMPLETED) return 'completed';
  if (phase === DebatePhase.PAUSED) return 'paused';
  if (phase === DebatePhase.ERROR) return 'error';
  return 'live'; // All debate phases are 'live' status
}

/**
 * Debate State Machine Events
 * Events emitted by the state machine
 */
export interface DebateStateMachineEvents {
  phase_transition: (event: PhaseTransitionEvent) => void;
  paused: (debateId: string, phase: DebatePhase) => void;
  resumed: (debateId: string, phase: DebatePhase) => void;
  completed: (debateId: string, totalElapsedMs: number) => void;
  error: (debateId: string, error: string) => void;
}

/**
 * Debate State Machine
 *
 * Manages debate state transitions, persistence, and event emission.
 * Extends EventEmitter to allow external components to listen to state changes.
 */
export class DebateStateMachine extends EventEmitter {
  private state: DebateState;
  private pauseStartTime: Date | null = null;

  /**
   * Create a new debate state machine
   * @param debateId - Unique debate identifier
   */
  constructor(debateId: string) {
    super();

    // Initialize state
    this.state = {
      debateId,
      currentPhase: DebatePhase.INITIALIZING,
      previousPhase: null,
      currentSpeaker: Speaker.SYSTEM,
      phaseStartTime: new Date(),
      totalElapsedMs: 0,
      isPaused: false,
      pausedAt: null,
      error: null,
    };

    logger.info({ debateId }, 'State machine created');
  }

  /**
   * Initialize the debate and transition to PHASE_1_OPENING
   */
  async initialize(): Promise<void> {
    if (this.state.currentPhase !== DebatePhase.INITIALIZING) {
      throw new Error('Debate has already been initialized');
    }

    logger.info({ debateId: this.state.debateId }, 'Initializing debate');

    // Transition to Phase 1 with moderator as first speaker
    await this.transition(DebatePhase.PHASE_1_OPENING, Speaker.MODERATOR);
  }

  /**
   * Transition to a new phase
   * @param toPhase - Target phase
   * @param nextSpeaker - Speaker for the new phase (optional, will use default if not provided)
   */
  async transition(toPhase: DebatePhase, nextSpeaker?: Speaker): Promise<void> {
    const fromPhase = this.state.currentPhase;

    // Validate transition
    if (!this.isValidTransition(fromPhase, toPhase)) {
      const error = `Invalid transition from ${fromPhase} to ${toPhase}`;
      logger.error({ debateId: this.state.debateId, fromPhase, toPhase }, error);
      throw new Error(error);
    }

    // Calculate elapsed time for current phase
    const now = new Date();
    const phaseElapsedMs = now.getTime() - this.state.phaseStartTime.getTime();

    // Determine next speaker
    const speaker = nextSpeaker || getDefaultSpeaker(toPhase);

    logger.info(
      { debateId: this.state.debateId, fromPhase, toPhase, speaker, phaseElapsedMs },
      'Transitioning phase'
    );

    // Update state
    this.state.currentPhase = toPhase;
    this.state.currentSpeaker = speaker;
    this.state.phaseStartTime = now;
    this.state.totalElapsedMs += phaseElapsedMs;

    // Persist state to database
    await this.persistState();

    // Emit transition event
    const event: PhaseTransitionEvent = {
      debateId: this.state.debateId,
      fromPhase,
      toPhase,
      speaker,
      timestamp: now,
      phaseElapsedMs,
      totalElapsedMs: this.state.totalElapsedMs,
    };

    this.emit('phase_transition', event);

    logger.info(
      { debateId: this.state.debateId, toPhase, totalElapsedMs: this.state.totalElapsedMs },
      'Phase transition complete'
    );
  }

  /**
   * Pause the debate
   * Stores the current phase so it can be resumed later
   */
  async pause(): Promise<void> {
    if (this.state.isPaused) {
      logger.warn({ debateId: this.state.debateId }, 'Debate is already paused');
      return;
    }

    if (this.state.currentPhase === DebatePhase.COMPLETED || this.state.currentPhase === DebatePhase.ERROR) {
      throw new Error('Cannot pause a debate in terminal state');
    }

    logger.info({ debateId: this.state.debateId, currentPhase: this.state.currentPhase }, 'Pausing debate');

    // Store previous phase for resume
    this.state.previousPhase = this.state.currentPhase;
    this.state.isPaused = true;
    this.state.pausedAt = new Date();
    this.pauseStartTime = new Date();

    // Update phase to PAUSED
    const fromPhase = this.state.currentPhase;
    this.state.currentPhase = DebatePhase.PAUSED;
    this.state.currentSpeaker = Speaker.SYSTEM;

    // Persist state
    await this.persistState();

    // Emit paused event
    this.emit('paused', this.state.debateId, fromPhase);

    logger.info({ debateId: this.state.debateId, previousPhase: this.state.previousPhase }, 'Debate paused');
  }

  /**
   * Resume the debate from pause
   * Transitions back to the phase that was active before pause
   */
  async resume(): Promise<void> {
    if (!this.state.isPaused) {
      throw new Error('Debate is not paused');
    }

    if (!this.state.previousPhase) {
      throw new Error('Cannot resume: no previous phase stored');
    }

    logger.info(
      { debateId: this.state.debateId, previousPhase: this.state.previousPhase },
      'Resuming debate'
    );

    const resumeToPhase = this.state.previousPhase;
    const resumeSpeaker = getDefaultSpeaker(resumeToPhase);

    // Calculate pause duration (don't add to total elapsed time)
    if (this.pauseStartTime) {
      const pauseDurationMs = new Date().getTime() - this.pauseStartTime.getTime();
      logger.debug({ debateId: this.state.debateId, pauseDurationMs }, 'Pause duration calculated');
    }

    // Reset pause state
    this.state.isPaused = false;
    this.state.pausedAt = null;
    this.state.previousPhase = null;
    this.pauseStartTime = null;

    // Update phase back to previous phase
    this.state.currentPhase = resumeToPhase;
    this.state.currentSpeaker = resumeSpeaker;
    this.state.phaseStartTime = new Date(); // Reset phase start time

    // Persist state
    await this.persistState();

    // Emit resumed event
    this.emit('resumed', this.state.debateId, resumeToPhase);

    logger.info({ debateId: this.state.debateId, resumedToPhase: resumeToPhase }, 'Debate resumed');
  }

  /**
   * Transition to error state
   * @param errorMessage - Error description
   */
  async error(errorMessage: string): Promise<void> {
    logger.error({ debateId: this.state.debateId, error: errorMessage }, 'Debate error');

    const fromPhase = this.state.currentPhase;
    this.state.currentPhase = DebatePhase.ERROR;
    this.state.currentSpeaker = Speaker.SYSTEM;
    this.state.error = errorMessage;
    this.state.isPaused = false;
    this.state.pausedAt = null;

    // Persist state
    await this.persistState();

    // Emit error event
    this.emit('error', this.state.debateId, errorMessage);

    logger.info({ debateId: this.state.debateId, fromPhase }, 'Transitioned to ERROR state');
  }

  /**
   * Complete the debate
   * Transitions to COMPLETED state (terminal)
   */
  async complete(): Promise<void> {
    if (this.state.currentPhase !== DebatePhase.PHASE_6_SYNTHESIS) {
      throw new Error('Can only complete debate from PHASE_6_SYNTHESIS');
    }

    logger.info({ debateId: this.state.debateId }, 'Completing debate');

    // Calculate final elapsed time
    const now = new Date();
    const phaseElapsedMs = now.getTime() - this.state.phaseStartTime.getTime();
    this.state.totalElapsedMs += phaseElapsedMs;

    this.state.currentPhase = DebatePhase.COMPLETED;
    this.state.currentSpeaker = Speaker.SYSTEM;

    // Persist state
    await this.persistState();

    // Emit completed event
    this.emit('completed', this.state.debateId, this.state.totalElapsedMs);

    logger.info({ debateId: this.state.debateId, totalElapsedMs: this.state.totalElapsedMs }, 'Debate completed');
  }

  /**
   * Check if a transition is valid
   * @param fromPhase - Current phase
   * @param toPhase - Target phase
   */
  isValidTransition(fromPhase: DebatePhase, toPhase: DebatePhase): boolean {
    // From PAUSED, can only resume to the stored previousPhase
    if (fromPhase === DebatePhase.PAUSED) {
      return toPhase === this.state.previousPhase || toPhase === DebatePhase.ERROR;
    }

    const allowedTransitions = TRANSITIONS.get(fromPhase);
    if (!allowedTransitions) {
      return false;
    }

    return allowedTransitions.includes(toPhase);
  }

  /**
   * Persist current state to database
   */
  async persistState(): Promise<void> {
    try {
      const dbStatus = mapToDbStatus(this.state.currentPhase);
      const dbPhase = mapToDbPhase(this.state.currentPhase);
      const dbSpeaker = mapToDbSpeaker(this.state.currentSpeaker);

      await debateRepo.updateStatus(this.state.debateId, {
        status: dbStatus,
        currentPhase: dbPhase,
        currentSpeaker: dbSpeaker,
      });

      logger.debug(
        { debateId: this.state.debateId, phase: this.state.currentPhase, status: dbStatus },
        'State persisted to database'
      );
    } catch (error) {
      logger.error(
        { debateId: this.state.debateId, error },
        'Failed to persist state to database'
      );
      throw new Error(`State persistence failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current state (read-only)
   */
  getState(): Readonly<DebateState> {
    return { ...this.state };
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): DebatePhase {
    return this.state.currentPhase;
  }

  /**
   * Get current speaker
   */
  getCurrentSpeaker(): Speaker {
    return this.state.currentSpeaker;
  }

  /**
   * Check if debate is paused
   */
  isPaused(): boolean {
    return this.state.isPaused;
  }

  /**
   * Get total elapsed time in milliseconds
   */
  getTotalElapsed(): number {
    if (this.state.isPaused || this.state.currentPhase === DebatePhase.COMPLETED) {
      return this.state.totalElapsedMs;
    }

    // Add current phase elapsed time
    const now = new Date();
    const currentPhaseElapsed = now.getTime() - this.state.phaseStartTime.getTime();
    return this.state.totalElapsedMs + currentPhaseElapsed;
  }
}
