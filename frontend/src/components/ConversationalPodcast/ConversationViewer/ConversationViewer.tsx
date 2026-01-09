/**
 * ConversationViewer Component
 *
 * Main page for viewing a live or completed podcast conversation.
 * Connects to SSE for real-time updates and provides layout for
 * transcript, context board, and controls.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConversationSSE } from '../hooks/useConversationSSE';
import { TranscriptPanel } from '../TranscriptPanel';
import { ContextBoardPanel } from '../ContextBoardPanel';
import { ControlBar } from '../ControlBar';
import { ConversationPodcastExportModal } from '../ConversationPodcastExportModal';
import styles from './ConversationViewer.module.css';
import type {
  ConversationSession,
  ConversationUtterance,
  ContextBoardState,
  SessionStatus,
  FlowMode,
} from '../../../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface ParticipantInfo {
  id: string;
  name: string;
  personaSlug: string;
  avatarEmoji: string;
}

interface SessionData {
  session: ConversationSession;
  participants: Array<{
    id: string;
    displayNameOverride?: string;
    persona?: {
      name: string;
      slug: string;
      avatarEmoji: string;
    };
  }>;
  contextBoard?: ContextBoardState;
}

export function ConversationViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // Session data
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [utterances, setUtterances] = useState<ConversationUtterance[]>([]);
  const [contextBoard, setContextBoard] = useState<ContextBoardState | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [awaitingAdvance, setAwaitingAdvance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContextBoard, setShowContextBoard] = useState(true);
  const [showPodcastExportModal, setShowPodcastExportModal] = useState(false);

  // Truncation notification state
  const [truncationRetry, setTruncationRetry] = useState<{
    personaName: string;
    retryAttempt: number;
    maxRetries: number;
  } | null>(null);
  const [truncationAlert, setTruncationAlert] = useState<{
    participantId: string;
    personaName: string;
    utteranceId?: number;
    partialContent: string;
    currentModelId: string;
  } | null>(null);
  // Pending truncation alert - waiting for utterance to be saved (using ref to avoid stale closures)
  const pendingTruncationRef = useRef<{
    participantId: string;
    personaName: string;
    partialContent: string;
    currentModelId: string;
  } | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // SSE connection
  const {
    isConnected,
    lastEvent,
    connectionError,
  } = useConversationSSE(sessionId || '');

  // Launch conversation helper
  const launchConversation = useCallback(async () => {
    if (!sessionId) return;

    setIsLaunching(true);
    console.log('Launching conversation:', sessionId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/launch`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        // Ignore "already running" error - that's fine
        if (data.error?.includes('already running')) {
          console.log('Conversation already running');
          setSession(prev => prev ? { ...prev, status: 'live' as SessionStatus } : null);
        } else {
          console.error('Failed to launch conversation:', data.error);
          setError(data.error || 'Failed to launch conversation');
        }
      } else {
        console.log('Conversation launched successfully');
        // Update local state to reflect launch
        setSession(prev => prev ? { ...prev, status: 'live' as SessionStatus } : null);
      }
    } catch (err) {
      console.error('Failed to launch conversation:', err);
      setError('Failed to connect to server');
    } finally {
      setIsLaunching(false);
    }
  }, [sessionId]);

  // Load initial session data
  useEffect(() => {
    if (!sessionId) return;

    async function loadSession() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}`);
        if (!response.ok) throw new Error('Session not found');

        const data = await response.json();
        const sessionData = data.session;
        setSession(sessionData);
        setContextBoard(sessionData.contextBoard || null);

        // Extract participant info - participants are nested in session object
        const participantInfos: ParticipantInfo[] = (sessionData.participants || []).map((p: SessionData['participants'][0]) => ({
          id: p.id,
          name: p.displayNameOverride || p.persona?.name || 'Unknown',
          personaSlug: p.persona?.slug || '',
          avatarEmoji: p.persona?.avatarEmoji || '🎙️',
        }));
        setParticipants(participantInfos);

        // Load existing utterances if any
        const utterancesRes = await fetch(
          `${API_BASE_URL}/api/conversations/sessions/${sessionId}/utterances`
        );
        if (utterancesRes.ok) {
          const utterancesData = await utterancesRes.json();
          setUtterances(utterancesData.utterances || []);
        }

        // Auto-launch if session is in 'configuring' status
        // Also re-launch if session is 'live' but orchestrator isn't active (e.g., after backend restart)
        if (sessionData.status === 'configuring' || (sessionData.status === 'live' && !sessionData.isActive)) {
          // Small delay to ensure SSE connection is established first
          setTimeout(() => {
            launchConversation();
          }, 500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [sessionId, launchConversation]);

  // Fetch context board
  const fetchContextBoard = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/context-board`
      );
      if (response.ok) {
        const data = await response.json();
        setContextBoard(data.contextBoard);
      }
    } catch (err) {
      console.error('Failed to fetch context board:', err);
    }
  }, [sessionId]);

  // Handle SSE events
  useEffect(() => {
    if (!lastEvent) return;

    // SSE manager sends type as 'event' field, with actual payload in 'data' field
    const rawEvent = lastEvent as Record<string, unknown>;
    const eventType = rawEvent.event || rawEvent.type; // Support both formats
    const eventData = (rawEvent.data as Record<string, unknown>) || rawEvent;

    switch (eventType) {
      case 'conversation_started':
        setSession(prev => prev ? { ...prev, status: 'live' as SessionStatus } : null);
        break;

      case 'conversation_utterance': {
        const newUtterance: ConversationUtterance = {
          id: typeof eventData.utteranceId === 'number' ? eventData.utteranceId : Date.now(),
          sessionId: sessionId!,
          participantId: eventData.isHost ? undefined : (eventData.participantId as string | undefined),
          content: (eventData.content as string) || '',
          isHostUtterance: Boolean(eventData.isHost),
          timestampMs: typeof eventData.timestampMs === 'number' ? eventData.timestampMs : Date.now(),
          isKeyPoint: Boolean(eventData.isKeyPoint),
          topicMarker: eventData.topicMarker as string | undefined,
          segmentType: 'discussion',
        };
        setUtterances(prev => [...prev, newUtterance]);
        setStreamingContent('');
        setCurrentSpeaker(null);
        setAwaitingAdvance(false); // Clear awaiting state when new content arrives
        setTruncationRetry(null); // Clear any retry indicator - utterance completed

        // Check if we have a pending truncation alert for this participant
        // If so, now we have the utterance ID and can show the full alert
        const pending = pendingTruncationRef.current;
        if (pending && pending.participantId === newUtterance.participantId) {
          console.log('[Truncation] Utterance arrived for pending truncation, showing alert with ID:', newUtterance.id);
          setTruncationAlert({
            participantId: pending.participantId,
            personaName: pending.personaName,
            utteranceId: newUtterance.id,
            partialContent: pending.partialContent,
            currentModelId: pending.currentModelId,
          });
          pendingTruncationRef.current = null;
        }
        break;
      }

      case 'conversation_token':
        setCurrentSpeaker((eventData.personaName as string) || null);
        setStreamingContent(prev => prev + ((eventData.token as string) || ''));
        break;

      case 'conversation_speaker_changed':
        setCurrentSpeaker((eventData.speakerName as string) || null);
        setStreamingContent('');
        break;

      case 'conversation_context_updated':
        fetchContextBoard();
        break;

      case 'conversation_paused':
        setSession(prev => prev ? { ...prev, status: 'paused' as SessionStatus } : null);
        break;

      case 'conversation_resumed':
        setSession(prev => prev ? { ...prev, status: 'live' as SessionStatus } : null);
        break;

      case 'conversation_completed':
        setSession(prev => prev ? { ...prev, status: 'completed' as SessionStatus } : null);
        break;

      case 'conversation_error':
        setError((eventData.error as string) || 'An error occurred');
        break;

      case 'conversation_awaiting_advance':
        setAwaitingAdvance(true);
        break;

      case 'conversation_truncation_retry':
        // Show user that system is trying to recover - persist until truncation_detected or utterance arrives
        console.log('[Truncation] Retry event received:', eventData);
        setTruncationRetry({
          personaName: (eventData.personaName as string) || 'Speaker',
          retryAttempt: (eventData.retryAttempt as number) || 1,
          maxRetries: (eventData.maxRetries as number) || 1,
        });
        // Don't auto-clear - will be cleared by truncation_detected or new utterance
        break;

      case 'conversation_truncation_detected':
        // Truncation persists after retries - store as pending and wait for utterance to be saved
        console.log('[Truncation] Detected event received:', eventData);
        setTruncationRetry(null); // Clear any retry indicator

        // If we already have an utterance ID, show alert immediately
        if (eventData.utteranceId) {
          setTruncationAlert({
            participantId: (eventData.participantId as string) || '',
            personaName: (eventData.personaName as string) || 'Speaker',
            utteranceId: eventData.utteranceId as number,
            partialContent: (eventData.partialContent as string) || '',
            currentModelId: (eventData.currentModelId as string) || '',
          });
        } else {
          // Store as pending - will show alert when utterance event arrives
          console.log('[Truncation] No utteranceId yet, storing as pending');
          pendingTruncationRef.current = {
            participantId: (eventData.participantId as string) || '',
            personaName: (eventData.personaName as string) || 'Speaker',
            partialContent: (eventData.partialContent as string) || '',
            currentModelId: (eventData.currentModelId as string) || '',
          };
        }
        break;
    }
  }, [lastEvent, sessionId, fetchContextBoard]);

  // Control handlers
  const handleAdvance = async () => {
    if (!sessionId) return;
    const response = await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/advance`, {
      method: 'POST',
    });

    // If orchestrator not found (e.g., after backend restart), re-launch the session
    if (response.status === 404) {
      console.log('Orchestrator not active, re-launching session...');
      const launchResponse = await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/launch`, {
        method: 'POST',
      });
      if (launchResponse.ok) {
        setSession(prev => prev ? { ...prev, status: 'live' as SessionStatus } : null);
      }
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/pause`, {
      method: 'POST',
    });
  };

  const handleResume = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
  };

  const handleFlowModeChange = async (mode: FlowMode, paceDelayMs?: number) => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/flow-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, paceDelayMs }),
    });
    setSession(prev => prev ? { ...prev, flowMode: mode } : null);
  };

  const handleExport = () => {
    if (!sessionId) return;
    window.open(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/transcript?format=md`);
  };

  const handlePodcastExport = () => {
    if (!sessionId || session?.status !== 'completed') return;
    setShowPodcastExportModal(true);
  };

  const handleRegenerateUtterance = async (modelId: string) => {
    if (!sessionId) {
      setTruncationAlert(null);
      return;
    }

    // Find the utterance ID - either from the alert or find the most recent one for this participant
    let utteranceId = truncationAlert?.utteranceId;

    if (!utteranceId && truncationAlert?.participantId) {
      // Find most recent utterance from this participant
      const participantUtterances = utterances.filter(
        u => u.participantId === truncationAlert.participantId
      );
      const lastUtterance = participantUtterances[participantUtterances.length - 1];
      utteranceId = lastUtterance?.id;
      console.log('[Regenerate] No utteranceId in alert, found last utterance:', utteranceId);
    }

    if (!utteranceId) {
      // Still no ID - just dismiss and let user know
      console.warn('[Regenerate] No utterance ID found, cannot regenerate');
      setError('Cannot regenerate - utterance not found. The partial response may not have been saved yet.');
      setTruncationAlert(null);
      return;
    }

    console.log('[Regenerate] Calling API with utteranceId:', utteranceId, 'modelId:', modelId);
    setIsRegenerating(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/utterances/${utteranceId}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('[Regenerate] Success:', data);
        // Update the utterance in our local state
        setUtterances(prev =>
          prev.map(u =>
            u.id === utteranceId
              ? { ...u, content: data.newContent }
              : u
          )
        );
        setTruncationAlert(null);
      } else {
        const data = await response.json();
        console.error('[Regenerate] API error:', data);
        setError(data.error || 'Failed to regenerate utterance');
      }
    } catch (err) {
      console.error('[Regenerate] Failed:', err);
      setError('Failed to regenerate utterance');
    } finally {
      setIsRegenerating(false);
    }
  };

  const dismissTruncationAlert = () => {
    setTruncationAlert(null);
  };

  const handleRestart = async () => {
    if (!sessionId) return;

    // Confirm with user before restarting
    const confirmed = window.confirm(
      'Are you sure you want to restart this conversation? All existing utterances and context will be cleared.'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/restart`, {
        method: 'POST',
      });

      if (response.ok) {
        // Clear local state
        setUtterances([]);
        setContextBoard(null);
        setStreamingContent('');
        setCurrentSpeaker(null);
        setSession(prev => prev ? { ...prev, status: 'configuring' as SessionStatus } : null);

        // Re-launch the conversation
        setTimeout(() => {
          launchConversation();
        }, 500);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to restart conversation');
      }
    } catch (err) {
      console.error('Failed to restart conversation:', err);
      setError('Failed to restart conversation');
    }
  };

  // Get speaker info helper
  const getSpeakerInfo = (participantId: string | undefined): ParticipantInfo | null => {
    if (!participantId || participantId === 'host') {
      return { id: 'host', name: 'Host', personaSlug: 'host', avatarEmoji: '🎙️' };
    }
    return participants.find(p => p.id === participantId) || null;
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading conversation...</span>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  const status = session?.status || 'configuring';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backButton} onClick={() => navigate(-1)}>
            &larr; Back
          </button>
          <div className={styles.sessionInfo}>
            <h1 className={styles.topic}>{session?.topic}</h1>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className={styles.headerRight}>
          <ConnectionIndicator connected={isConnected} />
          <button
            className={styles.toggleButton}
            onClick={() => setShowContextBoard(!showContextBoard)}
          >
            {showContextBoard ? 'Hide' : 'Show'} Context
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* Launching Indicator */}
        {isLaunching && (
          <div className={styles.launchingOverlay}>
            <div className={styles.spinner} />
            <span>Starting conversation...</span>
          </div>
        )}

        {/* Transcript Panel */}
        <TranscriptPanel
          utterances={utterances}
          participants={participants}
          currentSpeaker={currentSpeaker}
          streamingContent={streamingContent}
          getSpeakerInfo={getSpeakerInfo}
        />

        {/* Context Board Panel */}
        {showContextBoard && (
          <ContextBoardPanel
            contextBoard={contextBoard}
            participants={participants}
          />
        )}

        {/* Awaiting Advance Indicator (for manual mode) */}
        {awaitingAdvance && session?.flowMode === 'manual' && (
          <div className={styles.awaitingAdvance}>
            Click "Next" to continue the conversation
          </div>
        )}
      </main>

      {/* Control Bar */}
      <ControlBar
        status={status}
        flowMode={session?.flowMode || 'manual'}
        onAdvance={handleAdvance}
        onPause={handlePause}
        onResume={handleResume}
        onFlowModeChange={handleFlowModeChange}
        onExport={handleExport}
        onPodcastExport={handlePodcastExport}
        onRestart={handleRestart}
        turnCount={utterances.length}
      />

      {connectionError && (
        <div className={styles.connectionError}>
          {connectionError}
        </div>
      )}

      {/* Truncation Retry Indicator */}
      {truncationRetry && (
        <div className={styles.truncationRetry}>
          <span className={styles.retrySpinner} />
          <span>
            {truncationRetry.personaName} response was cut off — attempting recovery
            ({truncationRetry.retryAttempt}/{truncationRetry.maxRetries})...
          </span>
        </div>
      )}

      {/* Truncation Alert Dialog */}
      {truncationAlert && (
        <TruncationAlertDialog
          personaName={truncationAlert.personaName}
          currentModelId={truncationAlert.currentModelId}
          partialContent={truncationAlert.partialContent}
          isRegenerating={isRegenerating}
          onRegenerate={handleRegenerateUtterance}
          onDismiss={dismissTruncationAlert}
        />
      )}

      {/* Podcast Export Modal */}
      <ConversationPodcastExportModal
        sessionId={sessionId || ''}
        topic={session?.topic || ''}
        isOpen={showPodcastExportModal}
        onClose={() => setShowPodcastExportModal(false)}
      />
    </div>
  );
}

// Status Badge Sub-component
function StatusBadge({ status }: { status: SessionStatus }) {
  const statusStyles: Record<SessionStatus, string> = {
    configuring: styles.statusConfiguring,
    live: styles.statusLive,
    paused: styles.statusPaused,
    completed: styles.statusCompleted,
    error: styles.statusError,
  };

  const statusLabels: Record<SessionStatus, string> = {
    configuring: 'Setting Up',
    live: 'Live',
    paused: 'Paused',
    completed: 'Completed',
    error: 'Error',
  };

  return (
    <span className={`${styles.statusBadge} ${statusStyles[status] || ''}`}>
      {status === 'live' && '● '}
      {statusLabels[status] || status}
    </span>
  );
}

// Connection Indicator Sub-component
function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <span className={`${styles.connectionIndicator} ${connected ? styles.connected : styles.disconnected}`}>
      {connected ? '● Connected' : '○ Disconnected'}
    </span>
  );
}

// Truncation Alert Dialog Sub-component
interface TruncationAlertDialogProps {
  personaName: string;
  currentModelId: string;
  partialContent: string;
  isRegenerating: boolean;
  onRegenerate: (modelId: string) => void;
  onDismiss: () => void;
}

// Common models that tend to have better context handling
const ALTERNATIVE_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
];

function TruncationAlertDialog({
  personaName,
  currentModelId,
  partialContent,
  isRegenerating,
  onRegenerate,
  onDismiss,
}: TruncationAlertDialogProps) {
  const [selectedModel, setSelectedModel] = useState(ALTERNATIVE_MODELS[0]?.id || '');

  // Filter out current model from alternatives
  const availableModels = ALTERNATIVE_MODELS.filter(m => m.id !== currentModelId);

  return (
    <div className={styles.truncationAlertOverlay}>
      <div className={styles.truncationAlertDialog}>
        <div className={styles.truncationAlertHeader}>
          <span className={styles.warningIcon}>⚠️</span>
          <h3>Response Truncated</h3>
        </div>

        <div className={styles.truncationAlertContent}>
          <p>
            <strong>{personaName}</strong>'s response was cut off and automatic recovery failed.
          </p>
          <p className={styles.truncationPreview}>
            "...{partialContent.slice(-100)}"
          </p>
          <p className={styles.truncationHint}>
            This usually happens when the model hits its output limit. Try regenerating with a different model.
          </p>
        </div>

        <div className={styles.truncationAlertActions}>
          <div className={styles.modelSelector}>
            <label htmlFor="model-select">Try different model:</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isRegenerating}
            >
              {availableModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.truncationButtons}>
            <button
              className={styles.dismissButton}
              onClick={onDismiss}
              disabled={isRegenerating}
            >
              Keep Partial
            </button>
            <button
              className={styles.regenerateButton}
              onClick={() => onRegenerate(selectedModel)}
              disabled={isRegenerating || !selectedModel}
            >
              {isRegenerating ? (
                <>
                  <span className={styles.buttonSpinner} />
                  Regenerating...
                </>
              ) : (
                'Regenerate'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConversationViewer;
