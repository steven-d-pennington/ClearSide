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
import type {
  DebateMode,
  LivelySettings,
  LivelySettingsInput,
  LivelyState,
  InterruptCandidate,
  LivelyPreset,
  PacingMode,
} from '../types/lively';
import { initialLivelyState } from '../types/lively';

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
  /** Model selection mode - auto (smart pairing) or manual (user picks) */
  modelSelectionMode?: 'auto' | 'manual';
  /** Cost threshold for model selection (auto mode) */
  costThreshold?: 'unlimited' | 'high' | 'medium' | 'low' | 'free_only';
  /** Model ID for Pro advocate (manual mode) */
  proModelId?: string | null;
  /** Model ID for Con advocate (manual mode) */
  conModelId?: string | null;
  /** Model ID for Moderator (manual mode) */
  moderatorModelId?: string | null;
  /** Extended thinking effort level (for reasoning-capable models) */
  reasoningEffort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';
  /** Debate mode - turn_based or lively */
  debateMode?: DebateMode;
  /** Lively mode settings (only used if debateMode is 'lively') */
  livelySettings?: LivelySettingsInput;
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

  // Lively mode state
  lively: LivelyState;

  // Actions
  startDebate: (proposition: string, options?: StartDebateOptions) => Promise<void>;
  pauseDebate: () => Promise<void>;
  resumeDebate: () => Promise<void>;
  continueDebate: () => Promise<void>;
  closeDebate: (status?: 'completed' | 'failed', reason?: string) => Promise<void>;
  stopDebate: (reason?: string) => Promise<void>;
  submitIntervention: (intervention: Omit<Intervention, 'id' | 'debateId' | 'status' | 'timestamp'>) => Promise<void>;

  // SSE actions
  connectToDebate: (debateId: string) => void;
  disconnectFromDebate: () => void;

  // UI actions
  toggleAutoScroll: () => void;
  selectTurn: (turnId: string | null) => void;

  // Lively mode actions
  fetchLivelySettings: (debateId: string) => Promise<void>;
  updateLivelySettings: (debateId: string, settings: LivelySettingsInput) => Promise<void>;
  fetchLivelyPresets: () => Promise<LivelyPreset[]>;

  // Internal actions (used by SSE handlers)
  _handleSSEMessage: (message: SSEMessage) => void;
  _setConnectionStatus: (status: ConnectionStatus) => void;
  _appendTurnChunk: (chunk: string) => void;
  _completeTurn: (turn: DebateTurn) => void;
  _setError: (error: string | null) => void;
  _reset: () => void;
  _handleLivelySSEMessage: (message: SSEMessage) => void;
  _parseSpeaker: (value: string | undefined) => Speaker | null;
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
  lively: initialLivelyState,
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

          // Add debate mode and lively settings
          if (options.debateMode !== undefined) {
            requestBody.debateMode = options.debateMode;
          }
          if (options.debateMode === 'lively' && options.livelySettings) {
            requestBody.livelySettings = options.livelySettings;
          }

          // Add model selection fields if provided
          if (options.modelSelectionMode !== undefined) {
            requestBody.modelSelectionMode = options.modelSelectionMode;
          }
          if (options.costThreshold !== undefined) {
            requestBody.costThreshold = options.costThreshold;
          }
          if (options.proModelId !== undefined) {
            requestBody.proModelId = options.proModelId;
          }
          if (options.conModelId !== undefined) {
            requestBody.conModelId = options.conModelId;
          }
          if (options.moderatorModelId !== undefined) {
            requestBody.moderatorModelId = options.moderatorModelId;
          }
          // Add reasoning effort if provided and not 'none'
          if (options.reasoningEffort !== undefined && options.reasoningEffort !== 'none') {
            requestBody.reasoningEffort = options.reasoningEffort;
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

          // Check if this is a lively mode debate
          const isLively = options.debateMode === 'lively';

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
              // Include model info if available
              proModelId: options.proModelId || undefined,
              conModelId: options.conModelId || undefined,
              moderatorModelId: options.moderatorModelId || undefined,
              // Extract model names from IDs (format: "provider/model-name")
              proModelName: options.proModelId?.split('/').pop() || undefined,
              conModelName: options.conModelId?.split('/').pop() || undefined,
              moderatorModelName: options.moderatorModelId?.split('/').pop() || undefined,
            },
            isLoading: false,
            // Set lively mode immediately if selected (don't wait for SSE event)
            // Settings will be fully populated when lively_mode_started SSE event arrives
            lively: isLively
              ? {
                  ...get().lively,
                  isLivelyMode: true,
                  // Keep settings null for now - will be set by SSE event
                }
              : get().lively,
          });

          console.log('🎭 Lively mode set:', isLively);

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
       * Stop a running debate immediately
       * This actually stops the orchestrator execution on the backend
       */
      stopDebate: async (reason) => {
        const { debate, disconnectFromDebate } = get();
        if (!debate) return;

        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debate.id}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          });

          if (!response.ok) {
            throw new Error(`Failed to stop debate: ${response.statusText}`);
          }

          // The SSE 'debate_stopped' event will update the state
          // But we also update immediately for responsiveness
          set((state) => ({
            debate: state.debate
              ? {
                  ...state.debate,
                  status: 'completed',
                  currentPhase: DebatePhase.COMPLETED,
                  completedAt: new Date(),
                }
              : null,
            streamingTurn: null,
          }));

          // Disconnect from SSE
          disconnectFromDebate();
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to stop debate',
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
       * Fetch lively settings for a debate
       */
      fetchLivelySettings: async (debateId: string) => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debateId}/lively-settings`);
          if (response.status === 404) {
            // No lively settings - turn-based mode
            set((state) => ({
              lively: {
                ...state.lively,
                isLivelyMode: false,
                settings: null,
              },
            }));
            return;
          }

          if (!response.ok) {
            throw new Error(`Failed to fetch lively settings: ${response.statusText}`);
          }

          const result = await response.json();
          set((state) => ({
            lively: {
              ...state.lively,
              isLivelyMode: true,
              settings: result.data,
            },
          }));
        } catch (error) {
          console.error('Failed to fetch lively settings:', error);
        }
      },

      /**
       * Update lively settings for a debate
       */
      updateLivelySettings: async (debateId: string, settings: LivelySettingsInput) => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/debates/${debateId}/lively-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
          });

          if (!response.ok) {
            throw new Error(`Failed to update lively settings: ${response.statusText}`);
          }

          const result = await response.json();
          set((state) => ({
            lively: {
              ...state.lively,
              settings: result.data,
            },
          }));
        } catch (error) {
          console.error('Failed to update lively settings:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to update lively settings',
          });
        }
      },

      /**
       * Fetch available lively presets
       */
      fetchLivelyPresets: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/lively/presets`);
          if (!response.ok) {
            throw new Error(`Failed to fetch lively presets: ${response.statusText}`);
          }
          const result = await response.json();
          return result.data as LivelyPreset[];
        } catch (error) {
          console.error('Failed to fetch lively presets:', error);
          return [];
        }
      },

      /**
       * Convert backend speaker format to frontend Speaker enum
       * Backend sends: 'pro_advocate', 'con_advocate', 'moderator'
       * Frontend uses: Speaker.PRO, Speaker.CON, Speaker.MODERATOR
       */
      _parseSpeaker: (value: string | undefined): Speaker | null => {
        if (!value) return null;
        const normalized = value.toLowerCase().trim();
        switch (normalized) {
          case 'pro_advocate':
          case 'pro':
            return Speaker.PRO;
          case 'con_advocate':
          case 'con':
            return Speaker.CON;
          case 'moderator':
            return Speaker.MODERATOR;
          default:
            return null;
        }
      },

      /**
       * Handle lively mode SSE messages
       */
      _handleLivelySSEMessage: (message: SSEMessage) => {
        const parseSpeaker = get()._parseSpeaker;

        switch (message.event) {
          case 'lively_mode_started': {
            const data = message.data as { debateId: string; settings: LivelySettings };
            console.log('🎭 Lively mode started:', data);
            set((state) => ({
              lively: {
                ...state.lively,
                isLivelyMode: true,
                settings: data.settings,
              },
            }));
            break;
          }

          case 'speaker_started': {
            const data = message.data as {
              speaker: string;
              timestampMs: number;
              phase: string;
            };
            const speaker = parseSpeaker(data.speaker);
            if (!speaker) {
              console.warn('Unknown speaker in speaker_started:', data.speaker);
              break;
            }
            console.log('🎤 Speaker started:', data);
            set((state) => ({
              lively: {
                ...state.lively,
                activeSpeaker: {
                  speaker,
                  startedAtMs: data.timestampMs,
                  tokenPosition: 0,
                  partialContent: '',
                  interruptWindowOpen: false,
                  lastSafeBoundary: 0,
                },
                speakerStates: new Map(state.lively.speakerStates).set(speaker, 'speaking'),
              },
            }));
            break;
          }

          case 'token_chunk': {
            const data = message.data as {
              speaker: string;
              chunk: string;
              tokenPosition: number;
              timestampMs: number;
            };
            set((state) => ({
              lively: {
                ...state.lively,
                activeSpeaker: state.lively.activeSpeaker
                  ? {
                      ...state.lively.activeSpeaker,
                      partialContent: state.lively.activeSpeaker.partialContent + data.chunk,
                      tokenPosition: data.tokenPosition,
                    }
                  : null,
              },
            }));
            break;
          }

          case 'interrupt_scheduled': {
            // Backend sends: { interrupter, currentSpeaker, scheduledForMs, relevanceScore, triggerPhrase }
            const data = message.data as {
              interrupter: string;
              currentSpeaker: string;
              scheduledForMs: number;
              relevanceScore: number;
              triggerPhrase: string;
            };
            const interrupter = parseSpeaker(data.interrupter);
            if (!interrupter) {
              console.warn('Unknown interrupter in interrupt_scheduled:', data.interrupter);
              break;
            }
            console.log('⏱️ Interrupt scheduled:', data);
            // Create a candidate object from the flat data
            const candidate: InterruptCandidate = {
              speaker: interrupter,
              relevanceScore: data.relevanceScore,
              contradictionScore: 0,
              combinedScore: data.relevanceScore,
              triggerPhrase: data.triggerPhrase,
            };
            set((state) => ({
              lively: {
                ...state.lively,
                pendingInterrupt: candidate,
                speakerStates: new Map(state.lively.speakerStates).set(interrupter, 'queued'),
              },
            }));
            break;
          }

          case 'interrupt_cancelled': {
            const data = message.data as {
              interruptId: number;
              reason: string;
            };
            console.log('❌ Interrupt cancelled:', data);
            set((state) => ({
              lively: {
                ...state.lively,
                pendingInterrupt: null,
              },
            }));
            break;
          }

          case 'interrupt_fired': {
            // Backend sends: { interrupter, interruptedSpeaker, timestampMs }
            const data = message.data as {
              interrupter: string;
              interruptedSpeaker: string;
              timestampMs: number;
            };
            const interrupter = parseSpeaker(data.interrupter);
            const interruptedSpeaker = parseSpeaker(data.interruptedSpeaker);
            if (!interrupter || !interruptedSpeaker) {
              console.warn('Unknown speaker in interrupt_fired:', data);
              break;
            }
            console.log('🔥 Interrupt fired:', data);
            const newSpeakerStates = new Map(get().lively.speakerStates);
            newSpeakerStates.set(interrupter, 'speaking');
            newSpeakerStates.set(interruptedSpeaker, 'interrupted');

            set((state) => ({
              lively: {
                ...state.lively,
                pendingInterrupt: null,
                speakerStates: newSpeakerStates,
                lastInterruptTime: new Map(state.lively.lastInterruptTime).set(
                  interrupter,
                  data.timestampMs
                ),
                interruptsThisMinute: state.lively.interruptsThisMinute + 1,
              },
            }));
            break;
          }

          case 'speaker_cutoff': {
            // Backend sends: { cutoffSpeaker, interruptedBy, atTokenPosition, partialContent, timestampMs }
            const data = message.data as {
              cutoffSpeaker: string;
              interruptedBy: string;
              atTokenPosition: number;
              partialContent: string;
              timestampMs: number;
            };
            const cutoffSpeaker = parseSpeaker(data.cutoffSpeaker);
            if (!cutoffSpeaker) {
              console.warn('Unknown speaker in speaker_cutoff:', data.cutoffSpeaker);
              break;
            }
            console.log('✂️ Speaker cutoff:', data);
            set((state) => ({
              lively: {
                ...state.lively,
                speakerStates: new Map(state.lively.speakerStates).set(cutoffSpeaker, 'interrupted'),
                activeSpeaker: null,
              },
            }));
            break;
          }

          case 'interjection': {
            const data = message.data as {
              speaker: string;
              content: string;
              isComplete?: boolean;
              isInterjection?: boolean;
            };
            const speaker = parseSpeaker(data.speaker);
            console.log('💬 Interjection:', data);
            if (data.isComplete) {
              set((state) => ({
                lively: {
                  ...state.lively,
                  streamingInterjection: null,
                },
              }));
            } else if (speaker) {
              set((state) => ({
                lively: {
                  ...state.lively,
                  streamingInterjection: {
                    speaker,
                    content: data.content,
                    isStreaming: !data.isComplete,
                  },
                },
              }));
            }
            break;
          }

          case 'speaking_resumed': {
            const data = message.data as {
              speaker: string;
              resumedAtMs: number;
              phase: string;
            };
            const speaker = parseSpeaker(data.speaker);
            if (!speaker) {
              console.warn('Unknown speaker in speaking_resumed:', data.speaker);
              break;
            }
            console.log('▶️ Speaking resumed:', data);
            set((state) => ({
              lively: {
                ...state.lively,
                activeSpeaker: state.lively.activeSpeaker
                  ? { ...state.lively.activeSpeaker, speaker }
                  : {
                      speaker,
                      startedAtMs: data.resumedAtMs,
                      tokenPosition: 0,
                      partialContent: '',
                      interruptWindowOpen: false,
                      lastSafeBoundary: 0,
                    },
                speakerStates: new Map(state.lively.speakerStates).set(speaker, 'speaking'),
              },
            }));
            break;
          }

          case 'pacing_change': {
            const data = message.data as {
              pacingMode: PacingMode;
              reason?: string;
            };
            console.log('⚡ Pacing change:', data);
            set((state) => ({
              lively: {
                ...state.lively,
                settings: state.lively.settings
                  ? { ...state.lively.settings, pacingMode: data.pacingMode }
                  : null,
              },
            }));
            break;
          }

          default:
            // Not a lively mode event - ignore
            break;
        }
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

          // Backend sends 'debate_stopped' when user stops the debate
          case 'debate_stopped': {
            const data = message.data as { debateId: string; stoppedAt: string; reason: string };
            console.log('🛑 Debate stopped:', data);
            set((state) => ({
              debate: state.debate
                ? {
                    ...state.debate,
                    status: 'completed',
                    currentPhase: DebatePhase.COMPLETED,
                    completedAt: new Date(data.stoppedAt),
                  }
                : null,
              streamingTurn: null,
            }));
            get().disconnectFromDebate();
            break;
          }

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
            // Check if it's a lively mode event
            const livelyEvents = [
              'speaker_started',
              'speaker_cutoff',
              'token_chunk',
              'interrupt_scheduled',
              'interrupt_fired',
              'interrupt_cancelled',
              'interjection',
              'speaking_resumed',
              'lively_mode_started',
              'pacing_change',
            ];
            if (livelyEvents.includes(message.event)) {
              get()._handleLivelySSEMessage(message);
            } else {
              console.warn('Unknown SSE event:', message.event);
            }
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

/**
 * Lively mode selectors
 */
export const selectIsLivelyMode = (state: DebateState) => state.lively.isLivelyMode;

export const selectLivelySettings = (state: DebateState) => state.lively.settings;

export const selectActiveSpeaker = (state: DebateState) => state.lively.activeSpeaker;

export const selectPendingInterrupt = (state: DebateState) => state.lively.pendingInterrupt;

export const selectSpeakerState = (state: DebateState, speaker: Speaker) =>
  state.lively.speakerStates.get(speaker) ?? 'ready';

export const selectInterruptsThisMinute = (state: DebateState) =>
  state.lively.interruptsThisMinute;

export const selectStreamingInterjection = (state: DebateState) =>
  state.lively.streamingInterjection;

export const selectCanInterrupt = (state: DebateState) => {
  const { lively } = state;
  if (!lively.isLivelyMode || !lively.settings || !lively.activeSpeaker) {
    return false;
  }
  return (
    lively.activeSpeaker.interruptWindowOpen &&
    lively.interruptsThisMinute < lively.settings.maxInterruptsPerMinute
  );
};

export const selectLivelyPacingMode = (state: DebateState) =>
  state.lively.settings?.pacingMode ?? 'medium';

export default useDebateStore;
