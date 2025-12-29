/**
 * Debate Flow Integration Tests
 *
 * Tests the complete debate generation flow from user input through
 * agent processing to results display.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupSSEMock } from '../../test-utils/sseMock';
import {
  useDebateStore,
  selectIsDebateActive,
  selectPendingInterventions,
} from '../../stores/debate-store';
import { DebatePhase, Speaker } from '../../types/debate';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Debate Flow Integration', () => {
  const sseMock = setupSSEMock();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store
    useDebateStore.getState()._reset();
  });

  afterEach(() => {
    sseMock.cleanup();
  });

  describe('Debate Start Flow', () => {
    it('starts a debate and connects to SSE stream', async () => {
      // Mock the API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'debate-123',
          proposition: 'Should we implement a moratorium on AI data centers?',
          status: 'initializing',
        }),
      });

      // Get store actions
      const { startDebate } = useDebateStore.getState();

      // Start a debate
      await startDebate('Should we implement a moratorium on AI data centers?');

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/debates'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('moratorium'),
        })
      );

      // Verify state updated
      const state = useDebateStore.getState();
      expect(state.debate?.proposition).toBe(
        'Should we implement a moratorium on AI data centers?'
      );
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      });

      const { startDebate } = useDebateStore.getState();
      await startDebate('Test proposition');

      const state = useDebateStore.getState();
      expect(state.error).toBe('Failed to start debate (500): Internal Server Error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('SSE Message Handling', () => {
    it('handles phase transition events', () => {
      // Set up initial debate state
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.INITIALIZING,
          currentSpeaker: Speaker.SYSTEM,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      // Handle phase transition
      _handleSSEMessage({
        event: 'phase_transition',
        data: {
          toPhase: DebatePhase.PHASE_1_OPENING,
          speaker: Speaker.PRO,
          totalElapsedMs: 1000,
        },
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      expect(state.debate?.currentPhase).toBe(DebatePhase.PHASE_1_OPENING);
      expect(state.debate?.currentSpeaker).toBe(Speaker.PRO);
    });

    it('handles turn start and chunk events', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_1_OPENING,
          currentSpeaker: Speaker.PRO,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage, _appendTurnChunk } = useDebateStore.getState();

      // Handle turn start
      _handleSSEMessage({
        event: 'turn_start',
        data: {
          turnId: 'turn-1',
          speaker: Speaker.PRO,
          phase: DebatePhase.PHASE_1_OPENING,
        },
        timestamp: new Date().toISOString(),
      });

      let state = useDebateStore.getState();
      expect(state.streamingTurn?.turnId).toBe('turn-1');
      expect(state.streamingTurn?.speaker).toBe(Speaker.PRO);

      // Handle turn chunks
      _appendTurnChunk('Hello, ');
      _appendTurnChunk('this is my opening statement.');

      state = useDebateStore.getState();
      expect(state.streamingTurn?.content).toBe(
        'Hello, this is my opening statement.'
      );
    });

    it('completes turn and adds to transcript', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_1_OPENING,
          currentSpeaker: Speaker.PRO,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        streamingTurn: {
          turnId: 'turn-1',
          speaker: Speaker.PRO,
          phase: DebatePhase.PHASE_1_OPENING,
          content: 'My opening statement.',
          isStreaming: true,
        },
        connectionStatus: 'connected',
      });

      const { _completeTurn } = useDebateStore.getState();

      // Complete the turn
      _completeTurn({
        id: 'turn-1',
        debateId: 'debate-123',
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: 'My complete opening statement.',
        turnNumber: 1,
        timestamp: new Date(),
      });

      const state = useDebateStore.getState();
      expect(state.streamingTurn).toBeNull();
      expect(state.debate?.turns.length).toBe(1);
      expect(state.debate?.turns[0].content).toBe(
        'My complete opening statement.'
      );
    });

    it('handles debate completion', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_6_SYNTHESIS,
          currentSpeaker: Speaker.MODERATOR,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      // Emit debate completed
      _handleSSEMessage({
        event: 'debate_completed',
        data: {},
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      expect(state.debate?.status).toBe('completed');
      expect(state.debate?.currentPhase).toBe(DebatePhase.COMPLETED);
    });
  });

  describe('Intervention Flow', () => {
    it('submits an intervention successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'intervention-1',
          status: 'pending',
        }),
      });

      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          currentSpeaker: Speaker.CON,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { submitIntervention } = useDebateStore.getState();

      await submitIntervention({
        type: 'question',
        content: 'Can you elaborate on this point?',
        targetSpeaker: Speaker.CON,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/interventions'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('question'),
        })
      );
    });

    it('handles intervention addressed event', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          currentSpeaker: Speaker.CON,
          turns: [],
          interventions: [
            {
              id: 'intervention-1',
              debateId: 'debate-123',
              type: 'question',
              content: 'Can you elaborate?',
              status: 'pending',
              timestamp: new Date(),
            },
          ],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      _handleSSEMessage({
        event: 'intervention_addressed',
        data: {
          id: 'intervention-1',
          response: 'Here is my response to your question.',
        },
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      const intervention = state.debate?.interventions[0];
      expect(intervention?.status).toBe('addressed');
      expect(intervention?.response).toBe(
        'Here is my response to your question.'
      );
    });

    it('handles intervention received event', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          currentSpeaker: Speaker.CON,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      _handleSSEMessage({
        event: 'intervention_received',
        data: {
          id: 'intervention-1',
          debateId: 'debate-123',
          type: 'question',
          content: 'What about the costs?',
          status: 'pending',
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      expect(state.debate?.interventions.length).toBe(1);
      expect(state.debate?.interventions[0].content).toBe('What about the costs?');
    });
  });

  describe('Pause and Resume Flow', () => {
    it('pauses a debate', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          currentSpeaker: Speaker.CON,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { pauseDebate } = useDebateStore.getState();
      await pauseDebate();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pause'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('handles pause event from SSE', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          currentSpeaker: Speaker.CON,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      _handleSSEMessage({
        event: 'debate_paused',
        data: {},
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      expect(state.debate?.status).toBe('paused');
      expect(state.debate?.currentPhase).toBe(DebatePhase.PAUSED);
    });

    it('handles resume event from SSE', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'paused',
          currentPhase: DebatePhase.PAUSED,
          currentSpeaker: Speaker.CON,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      _handleSSEMessage({
        event: 'debate_resumed',
        data: { phase: DebatePhase.PHASE_2_CONSTRUCTIVE },
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      expect(state.debate?.status).toBe('live');
      expect(state.debate?.currentPhase).toBe(DebatePhase.PHASE_2_CONSTRUCTIVE);
    });
  });

  describe('Error Handling', () => {
    it('handles debate error event', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test proposition',
          status: 'live',
          currentPhase: DebatePhase.PHASE_1_OPENING,
          currentSpeaker: Speaker.PRO,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      const { _handleSSEMessage } = useDebateStore.getState();

      _handleSSEMessage({
        event: 'debate_error',
        data: { error: 'LLM rate limit exceeded' },
        timestamp: new Date().toISOString(),
      });

      const state = useDebateStore.getState();
      expect(state.debate?.status).toBe('error');
      expect(state.error).toBe('LLM rate limit exceeded');
    });

    it('handles connection status changes', () => {
      useDebateStore.setState({
        connectionStatus: 'connected',
      });

      const { _setConnectionStatus } = useDebateStore.getState();
      _setConnectionStatus('reconnecting');

      const state = useDebateStore.getState();
      expect(state.connectionStatus).toBe('reconnecting');
    });
  });

  describe('State Selectors', () => {
    it('correctly identifies active debate when live', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test',
          status: 'live',
          currentPhase: DebatePhase.PHASE_1_OPENING,
          currentSpeaker: Speaker.PRO,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
      });

      const state = useDebateStore.getState();
      expect(selectIsDebateActive(state)).toBe(true);
    });

    it('correctly identifies active debate when paused', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test',
          status: 'paused',
          currentPhase: DebatePhase.PAUSED,
          currentSpeaker: Speaker.PRO,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
      });

      const state = useDebateStore.getState();
      expect(selectIsDebateActive(state)).toBe(true);
    });

    it('correctly identifies inactive debate when completed', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test',
          status: 'completed',
          currentPhase: DebatePhase.COMPLETED,
          currentSpeaker: Speaker.SYSTEM,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
      });

      const state = useDebateStore.getState();
      expect(selectIsDebateActive(state)).toBe(false);
    });

    it('counts pending interventions correctly', () => {
      useDebateStore.setState({
        debate: {
          id: 'debate-123',
          proposition: 'Test',
          status: 'live',
          currentPhase: DebatePhase.PHASE_1_OPENING,
          currentSpeaker: Speaker.PRO,
          turns: [],
          interventions: [
            {
              id: 'int-1',
              debateId: 'debate-123',
              type: 'question',
              content: 'Question 1',
              status: 'pending',
              timestamp: new Date(),
            },
            {
              id: 'int-2',
              debateId: 'debate-123',
              type: 'challenge',
              content: 'Challenge 1',
              status: 'addressed',
              timestamp: new Date(),
            },
            {
              id: 'int-3',
              debateId: 'debate-123',
              type: 'question',
              content: 'Question 2',
              status: 'pending',
              timestamp: new Date(),
            },
          ],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
      });

      const state = useDebateStore.getState();
      const pending = selectPendingInterventions(state);

      expect(pending.length).toBe(2);
      expect(pending[0].id).toBe('int-1');
      expect(pending[1].id).toBe('int-3');
    });

    it('returns empty array when no debate exists', () => {
      useDebateStore.setState({
        debate: null,
      });

      const state = useDebateStore.getState();
      const pending = selectPendingInterventions(state);

      expect(pending).toEqual([]);
    });
  });

  describe('Full Debate Flow', () => {
    it('simulates a complete debate from start to finish', () => {
      const { _handleSSEMessage, _appendTurnChunk, _completeTurn } =
        useDebateStore.getState();

      // Initialize debate
      useDebateStore.setState({
        debate: {
          id: 'debate-full',
          proposition: 'Should we ban AI?',
          status: 'live',
          currentPhase: DebatePhase.INITIALIZING,
          currentSpeaker: Speaker.SYSTEM,
          turns: [],
          interventions: [],
          createdAt: new Date(),
          totalElapsedMs: 0,
        },
        connectionStatus: 'connected',
      });

      // Phase 1: Opening
      _handleSSEMessage({
        event: 'phase_transition',
        data: {
          toPhase: DebatePhase.PHASE_1_OPENING,
          speaker: Speaker.PRO,
          totalElapsedMs: 1000,
        },
        timestamp: new Date().toISOString(),
      });

      _handleSSEMessage({
        event: 'turn_start',
        data: {
          turnId: 'turn-1',
          speaker: Speaker.PRO,
          phase: DebatePhase.PHASE_1_OPENING,
        },
        timestamp: new Date().toISOString(),
      });

      _appendTurnChunk('I argue in favor of this proposition.');

      _completeTurn({
        id: 'turn-1',
        debateId: 'debate-full',
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: 'I argue in favor of this proposition.',
        turnNumber: 1,
        timestamp: new Date(),
      });

      let state = useDebateStore.getState();
      expect(state.debate?.turns.length).toBe(1);
      expect(state.streamingTurn).toBeNull();

      // Con opening
      _handleSSEMessage({
        event: 'turn_start',
        data: {
          turnId: 'turn-2',
          speaker: Speaker.CON,
          phase: DebatePhase.PHASE_1_OPENING,
        },
        timestamp: new Date().toISOString(),
      });

      _appendTurnChunk('I oppose this proposition.');

      _completeTurn({
        id: 'turn-2',
        debateId: 'debate-full',
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.CON,
        content: 'I oppose this proposition.',
        turnNumber: 2,
        timestamp: new Date(),
      });

      state = useDebateStore.getState();
      expect(state.debate?.turns.length).toBe(2);

      // Complete the debate
      _handleSSEMessage({
        event: 'phase_transition',
        data: {
          toPhase: DebatePhase.PHASE_6_SYNTHESIS,
          speaker: Speaker.MODERATOR,
          totalElapsedMs: 600000,
        },
        timestamp: new Date().toISOString(),
      });

      _handleSSEMessage({
        event: 'debate_completed',
        data: {},
        timestamp: new Date().toISOString(),
      });

      state = useDebateStore.getState();
      expect(state.debate?.status).toBe('completed');
      expect(state.debate?.currentPhase).toBe(DebatePhase.COMPLETED);
    });
  });
});
