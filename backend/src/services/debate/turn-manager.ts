/**
 * Turn Manager
 *
 * Generates and manages turn sequences for each debate phase.
 * Determines who speaks when and what type of prompt to use.
 *
 * Based on the 6-phase debate protocol configuration.
 */

import { DebatePhase, Speaker } from '../../types/debate.js';
import { getPhaseConfig } from '../../config/debate-protocol.js';
import type { Turn, PhaseExecutionPlan } from '../../types/orchestrator.js';

/**
 * Turn progress information
 */
export interface TurnProgress {
  currentTurnIndex: number;
  totalTurns: number;
  currentTurn: Turn | null;
  isComplete: boolean;
}

/**
 * Turn Manager Class
 *
 * Responsible for generating turn sequences based on phase configuration.
 * Each phase has a specific pattern of turns between speakers.
 * Also tracks current state for stateful turn management.
 */
export class TurnManager {
  private currentPhase: DebatePhase = DebatePhase.INITIALIZING;
  private currentTurnIndex: number = 0;
  private turnStartTime: number = 0;

  /**
   * Set the current phase (resets turn index)
   */
  setPhase(phase: DebatePhase): void {
    this.currentPhase = phase;
    this.currentTurnIndex = 0;
    this.turnStartTime = Date.now();
  }

  /**
   * Get the current phase
   */
  getCurrentPhase(): DebatePhase {
    return this.currentPhase;
  }

  /**
   * Get the current turn index
   */
  getCurrentTurnIndex(): number {
    return this.currentTurnIndex;
  }

  /**
   * Get turns array for a phase
   */
  getTurnsForPhase(phase: DebatePhase): Turn[] {
    return this.getPhaseExecutionPlan(phase).turns;
  }

  /**
   * Get the current turn or null if phase is complete
   */
  getCurrentTurn(): Turn | null {
    const turns = this.getTurnsForPhase(this.currentPhase);
    if (this.currentTurnIndex >= turns.length) {
      return null;
    }
    return turns[this.currentTurnIndex] ?? null;
  }

  /**
   * Preview the next turn without advancing
   */
  getNextTurn(): Turn | null {
    const turns = this.getTurnsForPhase(this.currentPhase);
    const nextIndex = this.currentTurnIndex + 1;
    if (nextIndex >= turns.length) {
      return null;
    }
    return turns[nextIndex] ?? null;
  }

  /**
   * Advance to the next turn
   */
  advanceTurn(): void {
    this.currentTurnIndex++;
    this.turnStartTime = Date.now();
  }

  /**
   * Check if the current phase is complete
   */
  isPhaseComplete(): boolean {
    const turns = this.getTurnsForPhase(this.currentPhase);
    return this.currentTurnIndex >= turns.length;
  }

  /**
   * Get turn progress information
   */
  getTurnProgress(): TurnProgress {
    const turns = this.getTurnsForPhase(this.currentPhase);
    return {
      currentTurnIndex: this.currentTurnIndex,
      totalTurns: turns.length,
      currentTurn: this.getCurrentTurn(),
      isComplete: this.isPhaseComplete(),
    };
  }

  /**
   * Get elapsed time for current turn
   */
  getTurnElapsedTime(): number {
    if (this.turnStartTime === 0) return 0;
    return Date.now() - this.turnStartTime;
  }

  /**
   * Estimate remaining time for current phase
   */
  getEstimatedPhaseRemainingTime(): number {
    const turns = this.getTurnsForPhase(this.currentPhase);
    const remainingTurns = turns.slice(this.currentTurnIndex);
    return remainingTurns.reduce(
      (total, turn) => total + (turn.metadata?.expectedDurationMs ?? 60000),
      0
    );
  }

  /**
   * Reset the turn manager to initial state
   */
  reset(): void {
    this.currentPhase = DebatePhase.INITIALIZING;
    this.currentTurnIndex = 0;
    this.turnStartTime = 0;
  }

  /**
   * Get the execution plan for a specific phase
   * Returns ordered list of turns with speaker and prompt type
   */
  getPhaseExecutionPlan(phase: DebatePhase): PhaseExecutionPlan {
    const config = getPhaseConfig(phase);

    if (!config) {
      // Special states have no turns
      return {
        phase,
        turns: [],
        metadata: {
          name: phase,
          expectedDurationMs: 0,
          allowedSpeakers: [Speaker.SYSTEM],
        },
      };
    }

    const turns = this.generateTurns(phase, config.allowedSpeakers, config.turnsPerSpeaker);

    return {
      phase,
      turns,
      metadata: {
        name: config.name,
        expectedDurationMs: config.durationMinutes * 60 * 1000,
        allowedSpeakers: config.allowedSpeakers,
      },
    };
  }

  /**
   * Generate turns for a phase based on speaker configuration
   */
  private generateTurns(
    phase: DebatePhase,
    _allowedSpeakers: Speaker[],
    turnsPerSpeaker: number
  ): Turn[] {

    // Phase-specific turn patterns
    switch (phase) {
      case DebatePhase.PHASE_1_OPENING:
        return this.generateOpeningTurns();

      case DebatePhase.PHASE_2_CONSTRUCTIVE:
        return this.generateConstructiveTurns(turnsPerSpeaker);

      case DebatePhase.PHASE_3_CROSSEXAM:
        return this.generateCrossExamTurns(turnsPerSpeaker);

      case DebatePhase.PHASE_4_REBUTTAL:
        return this.generateRebuttalTurns(turnsPerSpeaker);

      case DebatePhase.PHASE_5_CLOSING:
        return this.generateClosingTurns();

      case DebatePhase.PHASE_6_SYNTHESIS:
        return this.generateSynthesisTurns();

      default:
        return [];
    }
  }

  /**
   * Phase 1: Opening Statements
   * Pro opens first, then Con
   */
  private generateOpeningTurns(): Turn[] {
    return [
      {
        turnNumber: 1,
        speaker: Speaker.PRO,
        promptType: 'opening_statement',
        metadata: { expectedDurationMs: 120000 }, // 2 minutes
      },
      {
        turnNumber: 2,
        speaker: Speaker.CON,
        promptType: 'opening_statement',
        metadata: { expectedDurationMs: 120000 }, // 2 minutes
      },
    ];
  }

  /**
   * Phase 2: Constructive Arguments
   * Alternating turns between Pro and Con
   */
  private generateConstructiveTurns(turnsPerSpeaker: number): Turn[] {
    const turns: Turn[] = [];
    let turnNumber = 1;

    // Alternate between Pro and Con for constructive arguments
    for (let i = 0; i < turnsPerSpeaker; i++) {
      // Pro's turn
      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.PRO,
        promptType: 'constructive_argument',
        metadata: { expectedDurationMs: 90000 }, // 1:30
      });

      // Con's turn
      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.CON,
        promptType: 'constructive_argument',
        metadata: { expectedDurationMs: 90000 }, // 1:30
      });
    }

    return turns;
  }

  /**
   * Phase 3: Cross-Examination
   * Back-and-forth questioning between advocates
   */
  private generateCrossExamTurns(turnsPerSpeaker: number): Turn[] {
    const turns: Turn[] = [];
    let turnNumber = 1;

    // First round: Pro questions, Con responds
    for (let i = 0; i < Math.floor(turnsPerSpeaker / 2); i++) {
      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.PRO,
        promptType: 'cross_exam_question',
        metadata: { expectedDurationMs: 45000 }, // 45 seconds
      });

      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.CON,
        promptType: 'cross_exam_response',
        metadata: {
          isResponse: true,
          respondsTo: turnNumber - 2,
          expectedDurationMs: 60000, // 1 minute
        },
      });
    }

    // Second round: Con questions, Pro responds
    for (let i = 0; i < Math.floor(turnsPerSpeaker / 2); i++) {
      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.CON,
        promptType: 'cross_exam_question',
        metadata: { expectedDurationMs: 45000 }, // 45 seconds
      });

      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.PRO,
        promptType: 'cross_exam_response',
        metadata: {
          isResponse: true,
          respondsTo: turnNumber - 2,
          expectedDurationMs: 60000, // 1 minute
        },
      });
    }

    return turns;
  }

  /**
   * Phase 4: Rebuttals
   * Each side responds to challenges
   */
  private generateRebuttalTurns(turnsPerSpeaker: number): Turn[] {
    const turns: Turn[] = [];
    let turnNumber = 1;

    // Alternate rebuttals between Con and Pro
    for (let i = 0; i < turnsPerSpeaker; i++) {
      // Con rebuts first (responding to Pro's constructive arguments)
      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.CON,
        promptType: 'rebuttal',
        metadata: { expectedDurationMs: 60000 }, // 1 minute
      });

      // Pro rebuts (responding to Con's constructive arguments)
      turns.push({
        turnNumber: turnNumber++,
        speaker: Speaker.PRO,
        promptType: 'rebuttal',
        metadata: { expectedDurationMs: 60000 }, // 1 minute
      });
    }

    return turns;
  }

  /**
   * Phase 5: Closing Statements
   * Final statements from each advocate
   */
  private generateClosingTurns(): Turn[] {
    return [
      {
        turnNumber: 1,
        speaker: Speaker.CON,
        promptType: 'closing_statement',
        metadata: { expectedDurationMs: 120000 }, // 2 minutes
      },
      {
        turnNumber: 2,
        speaker: Speaker.PRO,
        promptType: 'closing_statement',
        metadata: { expectedDurationMs: 120000 }, // 2 minutes (Pro gets last word)
      },
    ];
  }

  /**
   * Phase 6: Moderator Synthesis
   * Moderator provides neutral summary
   */
  private generateSynthesisTurns(): Turn[] {
    return [
      {
        turnNumber: 1,
        speaker: Speaker.MODERATOR,
        promptType: 'synthesis',
        metadata: { expectedDurationMs: 180000 }, // 3 minutes
      },
    ];
  }

  /**
   * Get all turns for the entire debate (all 6 phases)
   * Useful for understanding complete debate flow
   */
  getAllDebateTurns(): PhaseExecutionPlan[] {
    const debatePhases = [
      DebatePhase.PHASE_1_OPENING,
      DebatePhase.PHASE_2_CONSTRUCTIVE,
      DebatePhase.PHASE_3_CROSSEXAM,
      DebatePhase.PHASE_4_REBUTTAL,
      DebatePhase.PHASE_5_CLOSING,
      DebatePhase.PHASE_6_SYNTHESIS,
    ];

    return debatePhases.map((phase) => this.getPhaseExecutionPlan(phase));
  }

  /**
   * Get total turn count for entire debate
   */
  getTotalTurnCount(): number {
    return this.getAllDebateTurns().reduce((total, plan) => total + plan.turns.length, 0);
  }

  /**
   * Validate a turn against phase configuration
   */
  isValidTurn(phase: DebatePhase, speaker: Speaker, turnNumber: number): boolean {
    const plan = this.getPhaseExecutionPlan(phase);
    const turn = plan.turns.find((t) => t.turnNumber === turnNumber);

    if (!turn) {
      return false;
    }

    return turn.speaker === speaker;
  }
}

/**
 * Singleton turn manager instance
 */
export const turnManager = new TurnManager();
