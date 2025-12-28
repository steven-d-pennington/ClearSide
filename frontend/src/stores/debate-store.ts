/**
 * Debate Store - Zustand State Management
 *
 * Central store for managing debate state in the frontend.
 * Handles SSE connection, turn streaming, and user interventions.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  Debate,
  DebateTurn,
  Intervention,
  ConnectionStatus,
  SSEMessage,
  FlowMode,
  PresetMode,
} from '../types/debate';
import { DebatePhase, Speaker } from '../types/debate';
import type { BrevityLevel } from '../types/configuration';

/**
 * Options for starting a new debate
 */
export interface StartDebateOptions {
  /** Flow mode - auto continues automatically, step pauses after each turn */
  flowMode?: FlowMode;
  /** Preset mode (quick, balanced, deep_dive, research, custom) */
  presetMode?: PresetMode;
  /** Brevity level (1-5) */
  brevityLevel?: BrevityLevel;
  /** LLM temperature (0-1) */
  llmTemperature?: number;
  /** Maximum tokens per response */
  maxTokensPerResponse?: number;
  /** Whether citations are required */
  requireCitations?: boolean;
  /** Persona ID for Pro advocate */
  proPersonaId?: string | null;
  /** Persona ID for Con advocate */
  conPersonaId?: string | null;
}

/**
 * Streaming turn state for progressive display
 */
interface StreamingTurn {
  turnId: string;
  speaker: Speaker;
  phase: DebatePhase;
  content: string;
  isStreaming: boolean;
}

/**
 * Debate store state
 */
interface DebateState {
  // Current debate
  debate: Debate | null;
  isLoading: boolean;
  error: string | null;

  // SSE connection
  connectionStatus: ConnectionStatus;
  eventSource: EventSource | null;
  reconnectAttempts: number;

  // Streaming state
  streamingTurn: StreamingTurn | null;

  // Step mode state
  isAwaitingContinue: boolean;

  // UI state
  isAutoScrollEnabled: boolean;
  selectedTurnId: string | null;

  // Actions
  startDebate: (proposition: string, options?: StartDebateOptions) => Promise<void>;
  pauseDebate: () => Promise<void>;
  resumeDebate: () => Promise<void>;
  continueDebate: () => Promise<void>;
  closeDebate: (status?: 'completed' | 'failed', reason?: string) => Promise<void>;
  submitIntervention: (intervention: Omit<Intervention, 'id' | 'debateId' | 'status' | 'timestamp'>) => Promise<void>;

  // SSE actions
  connectToDebate: (debateId: string) => void;
  disconnectFromDebate: () => void;

  // UI actions
  toggleAutoScroll: () => void;
  selectTurn: (turnId: string | null) => void;

  // Internal actions (used by SSE handlers)
  _handleSSEMessage: (message: SSEMessage) => void;
  _setConnectionStatus: (status: ConnectionStatus) => void;
  _appendTurnChunk: (chunk: string) => void;
  _completeTurn: (turn: DebateTurn) => void;
  _setError: (error: string | null) => void;
  _reset: () => void;
}

/**
 * Initial state values
 */
const initialState = {
  debate: null,
  isLoading: false,
  error: null,
  connectionStatus: 'disconnected' as ConnectionStatus,
  eventSource: null,
  reconnectAttempts: 0,
  streamingTurn: null,
  isAwaitingContinue: false,
  isAutoScrollEnabled: true,
  selectedTurnId: null,
};

/**
 * API base URL - configure based on environment
 */
// Use empty string for relative URLs (goes through Vite proxy in dev)
// Only use VITE_API_URL for production deployments with absolute URLs
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Debate store
 */
export const useDebateStore = create<DebateState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      /**
       * Start a new debate with the given proposition
       */
      startDebate: async (proposition: string, options: StartDebateOptions = {}) => {
        const flowMode = options.flowMode ?? 'auto';
        console.log('🟢 Store: startDebate called with options:', options);
        console.log('🟢 Store: API_BASE_URL =', API_BASE_URL);
        set({ isLoading: true, error: null, isAwaitingContinue: false });

        try {
          // Build request body with proposition and optional config fields
          const requestBody: Record<string, unknown> = {
            propositionText: proposition,
            flowMode,
          };

          // Add configuration fields if provided
          if (options.presetMode !== undefined) {
            requestBody.presetMode = options.presetMode;
          }
          if (options.brevityLevel !== undefined) {
            requestBody.brevityLevel = options.brevityLevel;
          }
          if (options.llmTemperature !== undefined) {
            requestBody.llmTemperature = options.llmTemperature;
          }
          if (options.maxTokensPerResponse !== undefined) {
            requestBody.maxTokensPerResponse = options.maxTokensPerResponse;
          }
          if (options.requireCitations !== undefined) {
            requestBody.requireCitations = options.requireCitations;
          }
          // Add persona fields if provided
          if (options.proPersonaId !== undefined) {
            requestBody.proPersonaId = options.proPersonaId;
          }
          if (options.conPersonaId !== undefined) {
            requestBody.conPersonaId = options.conPersonaId;
          }

          console.log('🟢 Store: Fetching', `${API_BASE_URL}/api/debates`);
          const response = await fetch(`${API_BASE_URL}/api/debates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          console.log('🟢 Store: Response status:', response.status);

          if (!response.ok) {
            const errorBody = await response.text();
            console.log('🔴 Store: Error response body:', errorBody);
            throw new Error(`Failed to start debate (${response.status}): ${errorBody}`);
          }

          const debate = await response.json();

          set({
            debate: {
              ...debate,
              turns: [],
              interventions: [],
              flowMode: debate.flowMode || flowMode,
              currentPhase: DebatePhase.INITIALIZING,
              currentSpeaker: Speaker.SYSTEM,
              totalElapsedMs: 0,
              createdAt: new Date(debate.createdAt),
              // Include config fields from response
              presetMode: debate.presetMode || 'balanced',
              brevityLevel: debate.brevityLevel || 3,
              llmTemperature: debate.llmTemperature || 0.7,
              maxTokensPerResponse: debate.maxTokensPerResponse || 1024,
              requireCitations: debate.requireCitations || false,
            },
            isLoading: false,
          });

          // Connect to SSE stream
          get().connectToDebate(debate.id);
        } catch (error) {
          console.error('🔴 Store: startDebate error:', error);
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to start debate',
          });
        }
      },

      /**
       * Pause the current debate
       */
      pauseDebate: async () => {
        const { debate } = get();
        if (!debate) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debate.id}/pause`, {
            method: 'POST',
          });

          if (!response.ok) {
            throw new Error(`Failed to pause debate: ${response.statusText}`);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to pause debate',
          });
        }
      },

      /**
       * Resume the paused debate
       */
      resumeDebate: async () => {
        const { debate } = get();
        if (!debate) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debate.id}/resume`, {
            method: 'POST',
          });

          if (!response.ok) {
            throw new Error(`Failed to resume debate: ${response.statusText}`);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to resume debate',
          });
        }
      },

      /**
       * Continue to next turn (step mode only)
       */
      continueDebate: async () => {
        const { debate } = get();
        if (!debate) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debate.id}/continue`, {
            method: 'POST',
          });

          if (!response.ok) {
            throw new Error(`Failed to continue debate: ${response.statusText}`);
          }

          // The SSE 'continuing' event will clear isAwaitingContinue
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to continue debate',
          });
        }
      },

      /**
       * Manually close a stalled debate (mark as completed or failed)
       * Used when a debate is stuck in 'live' state after server restart
       */
      closeDebate: async (status = 'completed', reason) => {
        const { debate, disconnectFromDebate } = get();
        if (!debate) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debate.id}/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, reason }),
          });

          if (!response.ok) {
            throw new Error(`Failed to close debate: ${response.statusText}`);
          }

          // Update local state
          set((state) => ({
            debate: state.debate
              ? {
                  ...state.debate,
                  status: status === 'failed' ? 'error' : 'completed',
                  currentPhase: DebatePhase.COMPLETED,
                  completedAt: new Date(),
                }
              : null,
          }));

          // Disconnect from SSE
          disconnectFromDebate();
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to close debate',
          });
        }
      },

      /**
       * Submit a user intervention (question, challenge, evidence)
       */
      submitIntervention: async (intervention) => {
        const { debate } = get();
        if (!debate) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debate.id}/interventions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(intervention),
          });

          if (!response.ok) {
            throw new Error(`Failed to submit intervention: ${response.statusText}`);
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to submit intervention',
          });
        }
      },

      /**
       * Connect to SSE stream for a debate
       */
      connectToDebate: (debateId: string) => {
        const { eventSource } = get();

        // Close existing connection
        if (eventSource) {
          eventSource.close();
        }

        set({ connectionStatus: 'connecting' });

        const newEventSource = new EventSource(`${API_BASE_URL}/api/debates/${debateId}/stream`);

        newEventSource.onopen = () => {
          set({
            connectionStatus: 'connected',
            reconnectAttempts: 0,
          });
        };

        newEventSource.onmessage = (event) => {
          try {
            const message: SSEMessage = JSON.parse(event.data);
            get()._handleSSEMessage(message);
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        };

        newEventSource.onerror = () => {
          const { reconnectAttempts } = get();

          if (reconnectAttempts < 5) {
            set({
              connectionStatus: 'reconnecting',
              reconnectAttempts: reconnectAttempts + 1,
            });

            // Exponential backoff
            setTimeout(() => {
              get().connectToDebate(debateId);
            }, Math.pow(2, reconnectAttempts) * 1000);
          } else {
            set({
              connectionStatus: 'error',
              error: 'Lost connection to debate stream',
            });
            newEventSource.close();
          }
        };

        set({ eventSource: newEventSource });
      },

      /**
       * Disconnect from SSE stream
       */
      disconnectFromDebate: () => {
        const { eventSource } = get();

        if (eventSource) {
          eventSource.close();
        }

        set({
          eventSource: null,
          connectionStatus: 'disconnected',
        });
      },

      /**
       * Toggle auto-scroll behavior
       */
      toggleAutoScroll: () => {
        set((state) => ({ isAutoScrollEnabled: !state.isAutoScrollEnabled }));
      },

      /**
       * Select a specific turn (for highlighting/interaction)
       */
      selectTurn: (turnId: string | null) => {
        set({ selectedTurnId: turnId });
      },

      /**
       * Handle incoming SSE messages
       */
      _handleSSEMessage: (message: SSEMessage) => {
        switch (message.event) {
          // Connection confirmation - just acknowledge
          case 'connected':
            console.log('📡 SSE connected to debate');
            break;

          case 'debate_started':
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'live',
                    startedAt: new Date(message.timestamp),
                  }
                : null,
            }));
            break;

          case 'phase_transition': {
            const data = message.data as {
              toPhase: DebatePhase;
              speaker: Speaker;
              totalElapsedMs: number;
            };
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    currentPhase: data.toPhase,
                    currentSpeaker: data.speaker,
                    totalElapsedMs: data.totalElapsedMs,
                  }
                : null,
            }));
            break;
          }

          case 'turn_start': {
            const data = message.data as {
              turnId: string;
              speaker: Speaker;
              phase: DebatePhase;
            };
            set({
              streamingTurn: {
                turnId: data.turnId,
                speaker: data.speaker,
                phase: data.phase,
                content: '',
                isStreaming: true,
              },
            });
            break;
          }

          case 'turn_chunk': {
            const data = message.data as { chunk: string };
            get()._appendTurnChunk(data.chunk);
            break;
          }

          case 'turn_complete': {
            const data = message.data as DebateTurn;
            get()._completeTurn({
              ...data,
              timestamp: new Date(data.timestamp),
            });
            break;
          }

          case 'intervention_received': {
            const data = message.data as Intervention;
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    interventions: [
                      ...state.debate.interventions,
                      { ...data, timestamp: new Date(data.timestamp) },
                    ],
                  }
                : null,
            }));
            break;
          }

          case 'intervention_addressed': {
            const data = message.data as { id: string; response: string };
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    interventions: state.debate.interventions.map((i) =>
                      i.id === data.id
                        ? { ...i, status: 'addressed' as const, response: data.response }
                        : i
                    ),
                  }
                : null,
            }));
            break;
          }

          case 'debate_paused':
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'paused',
                    currentPhase: DebatePhase.PAUSED,
                  }
                : null,
            }));
            break;

          case 'debate_resumed': {
            const data = message.data as { phase: DebatePhase };
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'live',
                    currentPhase: data.phase,
                  }
                : null,
            }));
            break;
          }

          case 'debate_completed':
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'completed',
                    currentPhase: DebatePhase.COMPLETED,
                    completedAt: new Date(message.timestamp),
                  }
                : null,
              streamingTurn: null,
            }));
            get().disconnectFromDebate();
            break;

          case 'debate_error': {
            const data = message.data as { error: string };
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'error',
                    currentPhase: DebatePhase.ERROR,
                    error: data.error,
                  }
                : null,
              error: data.error,
              streamingTurn: null,
            }));
            get().disconnectFromDebate();
            break;
          }

          case 'heartbeat':
            // Heartbeat - just confirms connection is alive
            break;

          // Backend sends 'utterance' for each agent response
          case 'utterance': {
            const data = message.data as {
              id: number;
              timestamp_ms: number;
              phase: string;
              speaker: string;
              content: string;
              metadata?: Record<string, unknown>;
            };

            console.log('🎤 Utterance received:', {
              id: data.id,
              speaker: data.speaker,
              phase: data.phase,
              speakerValues: Object.values(Speaker),
              isValidSpeaker: Object.values(Speaker).includes(data.speaker as Speaker)
            });

            // Backend sends same string values as our enums, so direct cast works
            // Fallback to PHASE_1_OPENING/MODERATOR if unknown
            const phase = (Object.values(DebatePhase).includes(data.phase as DebatePhase)
              ? data.phase
              : DebatePhase.PHASE_1_OPENING) as DebatePhase;

            const speaker = (Object.values(Speaker).includes(data.speaker as Speaker)
              ? data.speaker
              : Speaker.MODERATOR) as Speaker;

            const currentDebate = get().debate;
            const newTurn: DebateTurn = {
              id: `${currentDebate?.id ?? 'unknown'}-${data.id}`,
              debateId: currentDebate?.id ?? '',
              phase,
              speaker,
              content: data.content,
              turnNumber: currentDebate?.turns.length ?? 0,
              timestamp: new Date(data.timestamp_ms),
              metadata: data.metadata as DebateTurn['metadata'],
            };

            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'live',
                    currentPhase: newTurn.phase,
                    currentSpeaker: newTurn.speaker,
                    turns: [...state.debate.turns, newTurn],
                  }
                : null,
              streamingTurn: null,
            }));
            break;
          }

          // Backend sends phase_start when entering a new phase
          case 'phase_start': {
            const data = message.data as { phase: string; debateId: string };
            // Backend sends same string values as our enums
            const phase = Object.values(DebatePhase).includes(data.phase as DebatePhase)
              ? (data.phase as DebatePhase)
              : null;
            if (phase) {
              set((state) => ({
                debate: state.debate
                  ? {
                      ...state.debate,
                      status: 'live',
                      currentPhase: phase,
                    }
                  : null,
              }));
            }
            break;
          }

          // Backend sends phase_complete when a phase ends
          case 'phase_complete': {
            // Just log it - the next phase_start will update the phase
            console.log('Phase complete:', message.data);
            break;
          }

          // Backend sends 'debate_complete' (not 'debate_completed')
          case 'debate_complete':
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'completed',
                    currentPhase: DebatePhase.COMPLETED,
                    completedAt: new Date(message.timestamp),
                  }
                : null,
              streamingTurn: null,
            }));
            get().disconnectFromDebate();
            break;

          // Backend sends 'error' for failures
          case 'error': {
            const data = message.data as { error: string; debateId: string };
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'error',
                    currentPhase: DebatePhase.ERROR,
                    error: data.error,
                  }
                : null,
              error: data.error,
              streamingTurn: null,
            }));
            break;
          }

          // Backend sends intervention_response
          case 'intervention_response': {
            const data = message.data as { interventionId: string; response: string };
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    interventions: state.debate.interventions.map((i) =>
                      i.id === data.interventionId
                        ? { ...i, status: 'addressed' as const, response: data.response }
                        : i
                    ),
                  }
                : null,
            }));
            break;
          }

          // Step mode: Backend waiting for user to continue
          case 'awaiting_continue':
            console.log('📍 Step mode: Waiting for continue');
            set({ isAwaitingContinue: true });
            break;

          // Step mode: User clicked continue, resuming
          case 'continuing':
            console.log('📍 Step mode: Continuing to next turn');
            set({ isAwaitingContinue: false });
            break;

          default:
            console.warn('Unknown SSE event:', message.event);
        }
      },

      /**
       * Set connection status
       */
      _setConnectionStatus: (status: ConnectionStatus) => {
        set({ connectionStatus: status });
      },

      /**
       * Append a chunk to the streaming turn
       */
      _appendTurnChunk: (chunk: string) => {
        set((state) => ({
          streamingTurn: state.streamingTurn
            ? {
                ...state.streamingTurn,
                content: state.streamingTurn.content + chunk,
              }
            : null,
        }));
      },

      /**
       * Complete the streaming turn and add to transcript
       */
      _completeTurn: (turn: DebateTurn) => {
        set((state) => ({
          debate: state.debate
            ? {
                ...state.debate,
                turns: [...state.debate.turns, turn],
              }
            : null,
          streamingTurn: null,
        }));
      },

      /**
       * Set error state
       */
      _setError: (error: string | null) => {
        set({ error });
      },

      /**
       * Reset store to initial state
       */
      _reset: () => {
        const { eventSource } = get();
        if (eventSource) {
          eventSource.close();
        }
        set(initialState);
      },
    })),
    { name: 'debate-store' }
  )
);

/**
 * Selectors for common state derivations
 */
export const selectIsDebateActive = (state: DebateState) =>
  state.debate?.status === 'live' || state.debate?.status === 'paused';

export const selectCurrentPhaseInfo = (state: DebateState) =>
  state.debate?.currentPhase;

export const selectTurnCount = (state: DebateState) =>
  state.debate?.turns.length ?? 0;

export const selectPendingInterventions = (state: DebateState) =>
  state.debate?.interventions.filter((i) => i.status === 'pending') ?? [];

export const selectIsAwaitingContinue = (state: DebateState) =>
  state.isAwaitingContinue;

export const selectFlowMode = (state: DebateState) =>
  state.debate?.flowMode ?? 'auto';

export const selectIsStepMode = (state: DebateState) =>
  state.debate?.flowMode === 'step';

export default useDebateStore;
