/**
 * Human Turn Service
 * Manages pending human input requests during human participation mode.
 *
 * When a debate is in human participation mode and it's the human's turn,
 * the orchestrator calls waitForHumanInput() which creates a pending request.
 * When the frontend submits input via the API, submitHumanTurn() resolves the promise.
 */

import { createLogger } from '../../utils/logger.js';
import type { HumanSide } from '../../types/configuration.js';

const logger = createLogger({ module: 'HumanTurnService' });

/**
 * Pending human turn request
 */
interface PendingHumanTurn {
  debateId: string;
  speaker: HumanSide;
  phase: string;
  turnNumber: number;
  promptType: string;
  createdAt: number;
  timeoutMs: number | null;
  resolve: (content: string) => void;
  reject: (error: Error) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

/**
 * Human turn submission
 */
export interface HumanTurnSubmission {
  debateId: string;
  content: string;
  speaker: HumanSide;
}

/**
 * Human turn result returned after submission
 */
export interface HumanTurnResult {
  success: boolean;
  content: string;
  responseTimeMs: number;
}

/**
 * Human Turn Service
 * Singleton service for managing human turn input during debates
 */
class HumanTurnService {
  private pendingTurns: Map<string, PendingHumanTurn> = new Map();

  /**
   * Wait for human input during a debate turn.
   * Called by the orchestrator when it's the human's turn.
   *
   * @param debateId - The debate ID
   * @param speaker - Which side (pro or con) is the human
   * @param phase - Current debate phase
   * @param turnNumber - Turn number within the phase
   * @param promptType - Description of what input is needed
   * @param timeoutMs - Optional timeout in milliseconds
   * @returns Promise that resolves with the human's content
   */
  async waitForHumanInput(
    debateId: string,
    speaker: HumanSide,
    phase: string,
    turnNumber: number,
    promptType: string,
    timeoutMs: number | null = null
  ): Promise<string> {
    const key = this.getKey(debateId);

    // Check if there's already a pending request for this debate
    if (this.pendingTurns.has(key)) {
      const existing = this.pendingTurns.get(key)!;
      logger.warn(
        { debateId, existingSpeaker: existing.speaker, newSpeaker: speaker },
        'Overwriting existing pending human turn'
      );
      // Clean up existing request
      this.cancelPendingTurn(key, 'Replaced by new turn request');
    }

    logger.info(
      { debateId, speaker, phase, turnNumber, promptType, timeoutMs },
      'Waiting for human input'
    );

    return new Promise<string>((resolve, reject) => {
      const pendingTurn: PendingHumanTurn = {
        debateId,
        speaker,
        phase,
        turnNumber,
        promptType,
        createdAt: Date.now(),
        timeoutMs,
        resolve,
        reject,
      };

      // Set up timeout if configured
      if (timeoutMs && timeoutMs > 0) {
        pendingTurn.timeoutHandle = setTimeout(() => {
          logger.warn({ debateId, speaker, timeoutMs }, 'Human turn timed out');
          this.pendingTurns.delete(key);
          reject(new Error(`Human turn timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      this.pendingTurns.set(key, pendingTurn);
    });
  }

  /**
   * Submit human turn content.
   * Called by the API when the human submits their argument.
   *
   * @param submission - The human turn submission
   * @returns Result of the submission
   */
  submitHumanTurn(submission: HumanTurnSubmission): HumanTurnResult {
    const key = this.getKey(submission.debateId);
    const pendingTurn = this.pendingTurns.get(key);

    if (!pendingTurn) {
      logger.warn(
        { debateId: submission.debateId, speaker: submission.speaker },
        'No pending human turn found'
      );
      return {
        success: false,
        content: submission.content,
        responseTimeMs: 0,
      };
    }

    // Validate speaker matches
    if (pendingTurn.speaker !== submission.speaker) {
      logger.warn(
        {
          debateId: submission.debateId,
          expectedSpeaker: pendingTurn.speaker,
          actualSpeaker: submission.speaker,
        },
        'Speaker mismatch in human turn submission'
      );
      return {
        success: false,
        content: submission.content,
        responseTimeMs: 0,
      };
    }

    // Calculate response time
    const responseTimeMs = Date.now() - pendingTurn.createdAt;

    // Clear timeout if set
    if (pendingTurn.timeoutHandle) {
      clearTimeout(pendingTurn.timeoutHandle);
    }

    // Remove from pending and resolve the promise
    this.pendingTurns.delete(key);
    pendingTurn.resolve(submission.content);

    logger.info(
      {
        debateId: submission.debateId,
        speaker: submission.speaker,
        contentLength: submission.content.length,
        responseTimeMs,
      },
      'Human turn submitted successfully'
    );

    return {
      success: true,
      content: submission.content,
      responseTimeMs,
    };
  }

  /**
   * Check if there's a pending human turn for a debate
   */
  hasPendingTurn(debateId: string): boolean {
    return this.pendingTurns.has(this.getKey(debateId));
  }

  /**
   * Get pending turn info for a debate
   */
  getPendingTurn(debateId: string): Omit<PendingHumanTurn, 'resolve' | 'reject' | 'timeoutHandle'> | null {
    const pending = this.pendingTurns.get(this.getKey(debateId));
    if (!pending) return null;

    return {
      debateId: pending.debateId,
      speaker: pending.speaker,
      phase: pending.phase,
      turnNumber: pending.turnNumber,
      promptType: pending.promptType,
      createdAt: pending.createdAt,
      timeoutMs: pending.timeoutMs,
    };
  }

  /**
   * Cancel a pending human turn
   */
  cancelPendingTurn(key: string, reason: string): void {
    const pendingTurn = this.pendingTurns.get(key);
    if (!pendingTurn) return;

    if (pendingTurn.timeoutHandle) {
      clearTimeout(pendingTurn.timeoutHandle);
    }

    this.pendingTurns.delete(key);
    pendingTurn.reject(new Error(`Human turn cancelled: ${reason}`));

    logger.info({ debateId: pendingTurn.debateId, reason }, 'Human turn cancelled');
  }

  /**
   * Cancel pending turn by debate ID
   */
  cancelForDebate(debateId: string, reason: string): void {
    this.cancelPendingTurn(this.getKey(debateId), reason);
  }

  /**
   * Get all pending turns (for debugging/admin)
   */
  getAllPendingTurns(): Array<{
    debateId: string;
    speaker: HumanSide;
    phase: string;
    turnNumber: number;
    waitingMs: number;
  }> {
    const now = Date.now();
    return Array.from(this.pendingTurns.values()).map((pt) => ({
      debateId: pt.debateId,
      speaker: pt.speaker,
      phase: pt.phase,
      turnNumber: pt.turnNumber,
      waitingMs: now - pt.createdAt,
    }));
  }

  /**
   * Generate key for a debate
   */
  private getKey(debateId: string): string {
    return debateId;
  }
}

// Export singleton instance
export const humanTurnService = new HumanTurnService();

// Also export class for testing
export { HumanTurnService };
