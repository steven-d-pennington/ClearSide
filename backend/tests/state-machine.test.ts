/**
 * Debate State Machine Unit Tests
 *
 * Comprehensive tests for the debate state machine covering:
 * - Initialization
 * - Valid and invalid phase transitions
 * - Pause/resume functionality
 * - Error state handling
 * - Event emission
 * - Time tracking
 * - State persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueryResult } from 'pg';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock the database connection
vi.mock('../src/db/connection.js', () => ({
  pool: {
    query: mockQuery,
  },
}));

// Import after mocking
import { DebateStateMachine } from '../src/services/debate/state-machine.js';
import { DebatePhase, Speaker } from '../src/types/debate.js';
import type { DebateRow } from '../src/types/database.js';

describe('DebateStateMachine', () => {
  const mockDebateId = 'test-debate-123';
  let stateMachine: DebateStateMachine;

  // Helper to create a mock debate row
  const createMockDebateRow = (overrides: Partial<DebateRow> = {}): DebateRow => ({
    id: mockDebateId,
    proposition_text: 'Test proposition',
    proposition_context: {},
    status: 'initializing',
    current_phase: 'opening_statements',
    current_speaker: 'moderator',
    started_at: null,
    completed_at: null,
    total_duration_ms: null,
    transcript_json: null,
    structured_analysis_json: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stateMachine = new DebateStateMachine(mockDebateId);

    // Default mock: successful database update
    mockQuery.mockResolvedValue({
      rows: [createMockDebateRow()],
      rowCount: 1,
    } as QueryResult<DebateRow>);
  });

  afterEach(() => {
    // Remove all listeners to prevent memory leaks
    stateMachine.removeAllListeners();
  });

  describe('constructor', () => {
    it('should initialize with INITIALIZING phase', () => {
      const state = stateMachine.getState();
      expect(state.debateId).toBe(mockDebateId);
      expect(state.currentPhase).toBe(DebatePhase.INITIALIZING);
      expect(state.currentSpeaker).toBe(Speaker.SYSTEM);
      expect(state.isPaused).toBe(false);
      expect(state.pausedAt).toBe(null);
      expect(state.previousPhase).toBe(null);
      expect(state.error).toBe(null);
    });

    it('should set initial totalElapsedMs to 0', () => {
      const state = stateMachine.getState();
      expect(state.totalElapsedMs).toBe(0);
    });
  });

  describe('initialize', () => {
    it('should transition from INITIALIZING to PHASE_1_OPENING', async () => {
      const transitionSpy = vi.fn();
      stateMachine.on('phase_transition', transitionSpy);

      await stateMachine.initialize();

      const state = stateMachine.getState();
      expect(state.currentPhase).toBe(DebatePhase.PHASE_1_OPENING);
      expect(state.currentSpeaker).toBe(Speaker.MODERATOR);
      expect(transitionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          debateId: mockDebateId,
          fromPhase: DebatePhase.INITIALIZING,
          toPhase: DebatePhase.PHASE_1_OPENING,
          speaker: Speaker.MODERATOR,
        })
      );
    });

    it('should throw error if already initialized', async () => {
      await stateMachine.initialize();
      await expect(stateMachine.initialize()).rejects.toThrow('already been initialized');
    });

    it('should persist state to database', async () => {
      await stateMachine.initialize();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE debates'),
        expect.arrayContaining([mockDebateId, 'live'])
      );
    });
  });

  describe('transition', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      vi.clearAllMocks();
    });

    it('should transition through all 6 phases sequentially', async () => {
      const phases = [
        { from: DebatePhase.PHASE_1_OPENING, to: DebatePhase.PHASE_2_CONSTRUCTIVE },
        { from: DebatePhase.PHASE_2_CONSTRUCTIVE, to: DebatePhase.PHASE_3_CROSSEXAM },
        { from: DebatePhase.PHASE_3_CROSSEXAM, to: DebatePhase.PHASE_4_REBUTTAL },
        { from: DebatePhase.PHASE_4_REBUTTAL, to: DebatePhase.PHASE_5_CLOSING },
        { from: DebatePhase.PHASE_5_CLOSING, to: DebatePhase.PHASE_6_SYNTHESIS },
      ];

      for (const { from, to } of phases) {
        expect(stateMachine.getCurrentPhase()).toBe(from);
        await stateMachine.transition(to);
        expect(stateMachine.getCurrentPhase()).toBe(to);
      }
    });

    it('should emit phase_transition event with correct data', async () => {
      const transitionSpy = vi.fn();
      stateMachine.on('phase_transition', transitionSpy);

      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE, Speaker.PRO);

      expect(transitionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          debateId: mockDebateId,
          fromPhase: DebatePhase.PHASE_1_OPENING,
          toPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          speaker: Speaker.PRO,
          timestamp: expect.any(Date),
          phaseElapsedMs: expect.any(Number),
          totalElapsedMs: expect.any(Number),
        })
      );
    });

    it('should use default speaker if not provided', async () => {
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      expect(stateMachine.getCurrentSpeaker()).toBe(Speaker.PRO); // Default for phase 2
    });

    it('should update totalElapsedMs on each transition', async () => {
      const initialElapsed = stateMachine.getTotalElapsed();

      // Wait a bit to ensure time passes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);

      const newElapsed = stateMachine.getTotalElapsed();
      expect(newElapsed).toBeGreaterThan(initialElapsed);
    });

    it('should persist state on each transition', async () => {
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE debates'),
        expect.arrayContaining([mockDebateId])
      );
    });
  });

  describe('invalid transitions', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
    });

    it('should reject skipping phases', async () => {
      await expect(stateMachine.transition(DebatePhase.PHASE_3_CROSSEXAM)).rejects.toThrow(
        'Invalid transition'
      );
    });

    it('should reject backward transitions', async () => {
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      await expect(stateMachine.transition(DebatePhase.PHASE_1_OPENING)).rejects.toThrow(
        'Invalid transition'
      );
    });

    it('should reject transitions from COMPLETED state', async () => {
      // Fast-forward to PHASE_6_SYNTHESIS
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      await stateMachine.transition(DebatePhase.PHASE_3_CROSSEXAM);
      await stateMachine.transition(DebatePhase.PHASE_4_REBUTTAL);
      await stateMachine.transition(DebatePhase.PHASE_5_CLOSING);
      await stateMachine.transition(DebatePhase.PHASE_6_SYNTHESIS);
      await stateMachine.complete();

      await expect(stateMachine.transition(DebatePhase.PHASE_1_OPENING)).rejects.toThrow(
        'Invalid transition'
      );
    });

    it('should reject transitions from ERROR state', async () => {
      // Add error listener to prevent unhandled error
      stateMachine.on('error', () => {});
      await stateMachine.error('Test error');

      await expect(stateMachine.transition(DebatePhase.PHASE_1_OPENING)).rejects.toThrow(
        'Invalid transition'
      );
    });
  });

  describe('pause', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      vi.clearAllMocks();
    });

    it('should pause from any active debate phase', async () => {
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);

      const pausedSpy = vi.fn();
      stateMachine.on('paused', pausedSpy);

      await stateMachine.pause();

      expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PAUSED);
      expect(stateMachine.isPaused()).toBe(true);
      expect(pausedSpy).toHaveBeenCalledWith(mockDebateId, DebatePhase.PHASE_2_CONSTRUCTIVE);
    });

    it('should store previousPhase for resume', async () => {
      const currentPhase = stateMachine.getCurrentPhase();
      await stateMachine.pause();

      const state = stateMachine.getState();
      expect(state.previousPhase).toBe(currentPhase);
    });

    it('should set pausedAt timestamp', async () => {
      await stateMachine.pause();

      const state = stateMachine.getState();
      expect(state.pausedAt).toBeInstanceOf(Date);
    });

    it('should emit paused event', async () => {
      const pausedSpy = vi.fn();
      stateMachine.on('paused', pausedSpy);

      await stateMachine.pause();

      expect(pausedSpy).toHaveBeenCalledWith(mockDebateId, DebatePhase.PHASE_1_OPENING);
    });

    it('should not pause if already paused', async () => {
      await stateMachine.pause();
      const pausedSpy = vi.fn();
      stateMachine.on('paused', pausedSpy);

      await stateMachine.pause();

      expect(pausedSpy).not.toHaveBeenCalled();
    });

    it('should throw error when pausing terminal states', async () => {
      // Fast-forward to completion
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      await stateMachine.transition(DebatePhase.PHASE_3_CROSSEXAM);
      await stateMachine.transition(DebatePhase.PHASE_4_REBUTTAL);
      await stateMachine.transition(DebatePhase.PHASE_5_CLOSING);
      await stateMachine.transition(DebatePhase.PHASE_6_SYNTHESIS);
      await stateMachine.complete();

      await expect(stateMachine.pause()).rejects.toThrow('Cannot pause a debate in terminal state');
    });
  });

  describe('resume', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      await stateMachine.pause();
      vi.clearAllMocks();
    });

    it('should resume to previousPhase', async () => {
      const resumedSpy = vi.fn();
      stateMachine.on('resumed', resumedSpy);

      await stateMachine.resume();

      expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PHASE_2_CONSTRUCTIVE);
      expect(stateMachine.isPaused()).toBe(false);
      expect(resumedSpy).toHaveBeenCalledWith(mockDebateId, DebatePhase.PHASE_2_CONSTRUCTIVE);
    });

    it('should clear pause state', async () => {
      await stateMachine.resume();

      const state = stateMachine.getState();
      expect(state.isPaused).toBe(false);
      expect(state.pausedAt).toBe(null);
      expect(state.previousPhase).toBe(null);
    });

    it('should emit resumed event', async () => {
      const resumedSpy = vi.fn();
      stateMachine.on('resumed', resumedSpy);

      await stateMachine.resume();

      expect(resumedSpy).toHaveBeenCalledWith(mockDebateId, DebatePhase.PHASE_2_CONSTRUCTIVE);
    });

    it('should throw error if not paused', async () => {
      await stateMachine.resume(); // First resume works

      await expect(stateMachine.resume()).rejects.toThrow('Debate is not paused');
    });

    it('should throw error if no previousPhase', async () => {
      // Resume once first
      await stateMachine.resume();

      // Now corrupt the internal state by pausing and manually clearing previousPhase
      // We need to access the private state field
      await stateMachine.pause();
      (stateMachine as any).state.previousPhase = null;

      await expect(stateMachine.resume()).rejects.toThrow('no previous phase stored');
    });
  });

  describe('error', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      vi.clearAllMocks();
    });

    it('should transition to ERROR state', async () => {
      const errorSpy = vi.fn();
      stateMachine.on('error', errorSpy);

      await stateMachine.error('Test error message');

      expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.ERROR);
      expect(stateMachine.getCurrentSpeaker()).toBe(Speaker.SYSTEM);
      expect(errorSpy).toHaveBeenCalledWith(mockDebateId, 'Test error message');
    });

    it('should store error message in state', async () => {
      // Add error listener to prevent unhandled error
      stateMachine.on('error', () => {});
      await stateMachine.error('Test error message');

      const state = stateMachine.getState();
      expect(state.error).toBe('Test error message');
    });

    it('should clear pause state on error', async () => {
      await stateMachine.pause();
      // Add error listener to prevent unhandled error
      stateMachine.on('error', () => {});
      await stateMachine.error('Test error');

      const state = stateMachine.getState();
      expect(state.isPaused).toBe(false);
      expect(state.pausedAt).toBe(null);
    });

    it('should emit error event', async () => {
      const errorSpy = vi.fn();
      stateMachine.on('error', errorSpy);

      await stateMachine.error('Critical failure');

      expect(errorSpy).toHaveBeenCalledWith(mockDebateId, 'Critical failure');
    });
  });

  describe('complete', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      await stateMachine.transition(DebatePhase.PHASE_3_CROSSEXAM);
      await stateMachine.transition(DebatePhase.PHASE_4_REBUTTAL);
      await stateMachine.transition(DebatePhase.PHASE_5_CLOSING);
      await stateMachine.transition(DebatePhase.PHASE_6_SYNTHESIS);
      vi.clearAllMocks();
    });

    it('should transition to COMPLETED state', async () => {
      const completedSpy = vi.fn();
      stateMachine.on('completed', completedSpy);

      await stateMachine.complete();

      expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.COMPLETED);
      expect(completedSpy).toHaveBeenCalledWith(mockDebateId, expect.any(Number));
    });

    it('should emit completed event with totalElapsedMs', async () => {
      const completedSpy = vi.fn();
      stateMachine.on('completed', completedSpy);

      // Add a small delay to ensure some time passes
      await new Promise((resolve) => setTimeout(resolve, 5));

      await stateMachine.complete();

      expect(completedSpy).toHaveBeenCalledWith(
        mockDebateId,
        expect.any(Number)
      );
      const totalMs = completedSpy.mock.calls[0][1];
      expect(totalMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw error if not in PHASE_6_SYNTHESIS', async () => {
      const sm = new DebateStateMachine('test-123');
      await sm.initialize();

      await expect(sm.complete()).rejects.toThrow('Can only complete debate from PHASE_6_SYNTHESIS');
    });
  });

  describe('time tracking', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
    });

    it('should track elapsed time across phases', async () => {
      const elapsed1 = stateMachine.getTotalElapsed();

      await new Promise((resolve) => setTimeout(resolve, 20));
      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);

      const elapsed2 = stateMachine.getTotalElapsed();
      expect(elapsed2).toBeGreaterThan(elapsed1);

      await new Promise((resolve) => setTimeout(resolve, 20));
      await stateMachine.transition(DebatePhase.PHASE_3_CROSSEXAM);

      const elapsed3 = stateMachine.getTotalElapsed();
      expect(elapsed3).toBeGreaterThan(elapsed2);
    });

    it('should not include pause time in elapsed time', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await stateMachine.pause();

      const elapsedBeforePause = stateMachine.getTotalElapsed();

      // Time passes while paused
      await new Promise((resolve) => setTimeout(resolve, 50));

      const elapsedDuringPause = stateMachine.getTotalElapsed();
      expect(elapsedDuringPause).toBe(elapsedBeforePause);

      await stateMachine.resume();

      // Elapsed should be same immediately after resume
      const elapsedAfterResume = stateMachine.getTotalElapsed();
      expect(elapsedAfterResume).toBeGreaterThanOrEqual(elapsedBeforePause);
    });
  });

  describe('isValidTransition', () => {
    it('should validate sequential phase transitions', () => {
      expect(stateMachine.isValidTransition(DebatePhase.INITIALIZING, DebatePhase.PHASE_1_OPENING)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_1_OPENING, DebatePhase.PHASE_2_CONSTRUCTIVE)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PHASE_3_CROSSEXAM)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_3_CROSSEXAM, DebatePhase.PHASE_4_REBUTTAL)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_4_REBUTTAL, DebatePhase.PHASE_5_CLOSING)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_5_CLOSING, DebatePhase.PHASE_6_SYNTHESIS)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_6_SYNTHESIS, DebatePhase.COMPLETED)).toBe(true);
    });

    it('should allow transition to PAUSED from any active phase', () => {
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_1_OPENING, DebatePhase.PAUSED)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PAUSED)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_3_CROSSEXAM, DebatePhase.PAUSED)).toBe(true);
    });

    it('should allow transition to ERROR from any phase', () => {
      expect(stateMachine.isValidTransition(DebatePhase.INITIALIZING, DebatePhase.ERROR)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_1_OPENING, DebatePhase.ERROR)).toBe(true);
      expect(stateMachine.isValidTransition(DebatePhase.PAUSED, DebatePhase.ERROR)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_1_OPENING, DebatePhase.PHASE_3_CROSSEXAM)).toBe(false);
      expect(stateMachine.isValidTransition(DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PHASE_1_OPENING)).toBe(false);
      expect(stateMachine.isValidTransition(DebatePhase.COMPLETED, DebatePhase.PHASE_1_OPENING)).toBe(false);
      expect(stateMachine.isValidTransition(DebatePhase.ERROR, DebatePhase.PHASE_1_OPENING)).toBe(false);
    });
  });

  describe('getters', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
    });

    it('getState should return complete state snapshot', () => {
      const state = stateMachine.getState();
      expect(state).toHaveProperty('debateId');
      expect(state).toHaveProperty('currentPhase');
      expect(state).toHaveProperty('currentSpeaker');
      expect(state).toHaveProperty('totalElapsedMs');
      expect(state).toHaveProperty('isPaused');
    });

    it('getCurrentPhase should return current phase', () => {
      expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PHASE_1_OPENING);
    });

    it('getCurrentSpeaker should return current speaker', () => {
      expect(stateMachine.getCurrentSpeaker()).toBe(Speaker.MODERATOR);
    });

    it('isPaused should return pause state', () => {
      expect(stateMachine.isPaused()).toBe(false);
    });

    it('getTotalElapsed should return total elapsed time', () => {
      const elapsed = stateMachine.getTotalElapsed();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(typeof elapsed).toBe('number');
    });
  });

  describe('database persistence errors', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      vi.clearAllMocks();
    });

    it('should throw error if database update fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE)).rejects.toThrow(
        'State persistence failed'
      );
    });

    it('should propagate database errors during pause', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(stateMachine.pause()).rejects.toThrow('State persistence failed');
    });

    it('should propagate database errors during resume', async () => {
      await stateMachine.pause();
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(stateMachine.resume()).rejects.toThrow('State persistence failed');
    });
  });

  describe('event emission', () => {
    beforeEach(async () => {
      await stateMachine.initialize();
      vi.clearAllMocks();
    });

    it('should emit all event types', async () => {
      const transitionSpy = vi.fn();
      const pausedSpy = vi.fn();
      const resumedSpy = vi.fn();
      const errorSpy = vi.fn();

      stateMachine.on('phase_transition', transitionSpy);
      stateMachine.on('paused', pausedSpy);
      stateMachine.on('resumed', resumedSpy);
      stateMachine.on('error', errorSpy);

      await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
      expect(transitionSpy).toHaveBeenCalled();

      await stateMachine.pause();
      expect(pausedSpy).toHaveBeenCalled();

      await stateMachine.resume();
      expect(resumedSpy).toHaveBeenCalled();

      // Create new instance for error test (can't transition from current state)
      const errorSm = new DebateStateMachine('error-test');
      errorSm.on('error', errorSpy);
      await errorSm.initialize();
      await errorSm.error('Test error');
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
