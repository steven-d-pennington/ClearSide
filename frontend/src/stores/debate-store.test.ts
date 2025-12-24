import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useDebateStore } from './debate-store';
import { DebatePhase, Speaker } from '../types/debate';

describe('Debate Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useDebateStore.setState({
      debate: null,
      isLoading: false,
      error: null,
      connectionStatus: 'disconnected',
      eventSource: null,
      reconnectAttempts: 0,
      streamingTurn: null,
      isAutoScrollEnabled: true,
      selectedTurnId: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Initial State', () => {
    it('has correct initial state', () => {
      const state = useDebateStore.getState();
      expect(state.debate).toBeNull();
      expect(state.streamingTurn).toBeNull();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.error).toBeNull();
      expect(state.isAutoScrollEnabled).toBe(true);
      expect(state.selectedTurnId).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('UI Actions', () => {
    describe('toggleAutoScroll', () => {
      it('toggles auto-scroll from true to false', () => {
        const { toggleAutoScroll } = useDebateStore.getState();
        expect(useDebateStore.getState().isAutoScrollEnabled).toBe(true);

        toggleAutoScroll();

        expect(useDebateStore.getState().isAutoScrollEnabled).toBe(false);
      });

      it('toggles auto-scroll from false to true', () => {
        useDebateStore.setState({ isAutoScrollEnabled: false });
        const { toggleAutoScroll } = useDebateStore.getState();

        toggleAutoScroll();

        expect(useDebateStore.getState().isAutoScrollEnabled).toBe(true);
      });
    });

    describe('selectTurn', () => {
      it('selects a turn by id', () => {
        const { selectTurn } = useDebateStore.getState();

        selectTurn('turn-123');

        expect(useDebateStore.getState().selectedTurnId).toBe('turn-123');
      });

      it('clears selection when null is passed', () => {
        useDebateStore.setState({ selectedTurnId: 'turn-123' });
        const { selectTurn } = useDebateStore.getState();

        selectTurn(null);

        expect(useDebateStore.getState().selectedTurnId).toBeNull();
      });
    });
  });

  describe('Internal Actions', () => {
    describe('_setError', () => {
      it('sets error message', () => {
        const { _setError } = useDebateStore.getState();

        _setError('Connection failed');

        expect(useDebateStore.getState().error).toBe('Connection failed');
      });

      it('clears error when null is passed', () => {
        useDebateStore.setState({ error: 'Some error' });
        const { _setError } = useDebateStore.getState();

        _setError(null);

        expect(useDebateStore.getState().error).toBeNull();
      });
    });

    describe('_reset', () => {
      it('resets store to initial state', () => {
        useDebateStore.setState({
          debate: { id: 'test' } as never,
          error: 'test error',
          isLoading: true,
          connectionStatus: 'connected',
        });

        const { _reset } = useDebateStore.getState();
        _reset();

        const state = useDebateStore.getState();
        expect(state.debate).toBeNull();
        expect(state.error).toBeNull();
        expect(state.isLoading).toBe(false);
        expect(state.connectionStatus).toBe('disconnected');
      });
    });
  });

  describe('SSE Actions', () => {
    describe('connectToDebate', () => {
      it('sets connection status to connecting', () => {
        // Mock EventSource as a class
        let mockInstance: { onopen: (() => void) | null; onmessage: ((e: MessageEvent) => void) | null; onerror: (() => void) | null; close: ReturnType<typeof vi.fn>; readyState: number };

        class MockEventSource {
          onopen: (() => void) | null = null;
          onmessage: ((e: MessageEvent) => void) | null = null;
          onerror: (() => void) | null = null;
          close = vi.fn();
          readyState = 0;

          constructor(_url: string) {
            mockInstance = this;
          }
        }

        vi.stubGlobal('EventSource', MockEventSource);

        const { connectToDebate } = useDebateStore.getState();

        connectToDebate('debate-123');

        expect(useDebateStore.getState().connectionStatus).toBe('connecting');
        expect(mockInstance!).toBeDefined();
      });

      it('sets connection status to connected on open', async () => {
        let mockInstance: { onopen: (() => void) | null; onmessage: ((e: MessageEvent) => void) | null; onerror: (() => void) | null; close: ReturnType<typeof vi.fn>; readyState: number };

        class MockEventSource {
          onopen: (() => void) | null = null;
          onmessage: ((e: MessageEvent) => void) | null = null;
          onerror: (() => void) | null = null;
          close = vi.fn();
          readyState = 0;

          constructor(_url: string) {
            mockInstance = this;
          }
        }

        vi.stubGlobal('EventSource', MockEventSource);

        const { connectToDebate } = useDebateStore.getState();
        connectToDebate('debate-123');

        // Simulate connection open
        mockInstance!.onopen?.();

        expect(useDebateStore.getState().connectionStatus).toBe('connected');
        expect(useDebateStore.getState().reconnectAttempts).toBe(0);
      });
    });

    describe('disconnectFromDebate', () => {
      it('sets connection status to disconnected', () => {
        useDebateStore.setState({ connectionStatus: 'connected' });
        const { disconnectFromDebate } = useDebateStore.getState();

        disconnectFromDebate();

        expect(useDebateStore.getState().connectionStatus).toBe('disconnected');
      });

      it('clears eventSource', () => {
        const mockClose = vi.fn();
        useDebateStore.setState({
          eventSource: { close: mockClose } as unknown as EventSource,
          connectionStatus: 'connected',
        });

        const { disconnectFromDebate } = useDebateStore.getState();
        disconnectFromDebate();

        expect(mockClose).toHaveBeenCalled();
        expect(useDebateStore.getState().eventSource).toBeNull();
      });
    });
  });

  describe('Debate State Updates', () => {
    it('can set debate directly', () => {
      const mockDebate = {
        id: 'debate-123',
        proposition: 'Test proposition',
        normalizedProposition: 'Normalized test proposition',
        status: 'live' as const,
        currentPhase: DebatePhase.PHASE_1_OPENING,
        currentSpeaker: Speaker.PRO,
        turns: [],
        interventions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalElapsedMs: 0,
      };

      useDebateStore.setState({ debate: mockDebate });

      expect(useDebateStore.getState().debate).toEqual(mockDebate);
    });

    it('can update streaming turn', () => {
      const mockStreamingTurn = {
        turnId: 'turn-1',
        speaker: Speaker.PRO,
        phase: DebatePhase.PHASE_1_OPENING,
        content: 'Streaming content...',
        isStreaming: true,
      };

      useDebateStore.setState({ streamingTurn: mockStreamingTurn });

      expect(useDebateStore.getState().streamingTurn).toEqual(mockStreamingTurn);
    });
  });

  describe('Streaming Turn Actions', () => {
    describe('_appendTurnChunk', () => {
      it('appends chunk to existing streaming turn', () => {
        useDebateStore.setState({
          streamingTurn: {
            turnId: 'turn-1',
            speaker: Speaker.PRO,
            phase: DebatePhase.PHASE_1_OPENING,
            content: 'Hello ',
            isStreaming: true,
          },
        });

        const { _appendTurnChunk } = useDebateStore.getState();
        _appendTurnChunk('world');

        expect(useDebateStore.getState().streamingTurn?.content).toBe('Hello world');
      });

      it('does nothing if no streaming turn', () => {
        useDebateStore.setState({ streamingTurn: null });

        const { _appendTurnChunk } = useDebateStore.getState();
        _appendTurnChunk('test');

        expect(useDebateStore.getState().streamingTurn).toBeNull();
      });
    });
  });
});
