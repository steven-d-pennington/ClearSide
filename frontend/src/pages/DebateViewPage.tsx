/**
 * DebateViewPage
 *
 * Page for viewing/replaying a specific debate by ID.
 * Loads debate data from API and displays it using DebateStream.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Badge } from '../components/ui';
import { DebateStream, ReplayViewer } from '../components/DebateStream';
import { ExportPanel } from '../components/ExportPanel';
import { ModelErrorModal } from '../components/ModelErrorModal';
import { useDebateStore } from '../stores/debate-store';
import { DebatePhase, Speaker } from '../types/debate';
import type { Debate, DebateTurn, FlowMode, PresetMode } from '../types/debate';
import styles from './DebateViewPage.module.css';

/**
 * View mode for completed debates
 * - 'stream': Standard scrolling transcript view
 * - 'replay': Step-through view one turn at a time
 */
type ViewMode = 'stream' | 'replay';

/**
 * API response for a single debate
 */
interface DebateResponse {
  id: string;
  propositionText: string;
  status: 'initializing' | 'live' | 'paused' | 'completed' | 'failed';
  currentPhase: string;
  createdAt: string;
  updatedAt: string;
  totalDurationMs?: number;
  liveViewers?: number;
}

/**
 * API response for utterances
 */
interface UtteranceResponse {
  id: string;
  debateId: string;
  phase: string;
  speaker: string;
  content: string;
  turnNumber: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Format duration from milliseconds
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Map API status to internal Debate status
 * API uses 'failed', internal type uses 'error'
 */
function mapApiStatus(apiStatus: string): Debate['status'] {
  if (apiStatus === 'failed') return 'error';
  return apiStatus as Debate['status'];
}

export function DebateViewPage() {
  const { debateId } = useParams<{ debateId: string }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLivelyDebate, setIsLivelyDebate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('stream');

  // Get store state and actions
  const debate = useDebateStore((state) => state.debate);
  const connectionStatus = useDebateStore((state) => state.connectionStatus);
  const streamingTurn = useDebateStore((state) => state.streamingTurn);
  const hasModelError = useDebateStore((state) => state.hasModelError);
  const modelError = useDebateStore((state) => state.modelError);
  const setDebate = useDebateStore.setState;
  const connectToDebate = useDebateStore((state) => state.connectToDebate);
  const closeDebate = useDebateStore((state) => state.closeDebate);
  const reassignModel = useDebateStore((state) => state.reassignModel);
  const clearModelError = useDebateStore((state) => state.clearModelError);
  const _reset = useDebateStore((state) => state._reset);

  // Detect stalled debate: marked as 'live' but not actively streaming
  const isStalled = debate?.status === 'live' &&
    connectionStatus === 'connected' &&
    !streamingTurn &&
    debate.turns.length > 0;

  // Use empty string for relative URLs (goes through Vite proxy)
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    if (!debateId) {
      setError('No debate ID provided');
      setIsLoading(false);
      return;
    }

    async function loadDebate() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch debate details
        const debateRes = await fetch(`${API_BASE_URL}/api/debates/${debateId}`);

        if (!debateRes.ok) {
          if (debateRes.status === 404) {
            throw new Error('Debate not found');
          }
          throw new Error(`Failed to load debate: ${debateRes.status}`);
        }

        const debateData: DebateResponse = await debateRes.json();

        // Check if this was a lively debate
        try {
          const livelyRes = await fetch(`${API_BASE_URL}/api/debates/${debateId}/lively-settings`);
          if (livelyRes.ok) {
            setIsLivelyDebate(true);
          }
        } catch {
          // Not a lively debate or settings don't exist
        }

        // Fetch existing utterances for ALL debates (live, paused, or completed)
        const utterancesRes = await fetch(
          `${API_BASE_URL}/api/debates/${debateId}/utterances`
        );

        let utterances: UtteranceResponse[] = [];
        if (utterancesRes.ok) {
          const utteranceData = await utterancesRes.json();
          utterances = utteranceData.utterances || [];
        }

        // Map utterances to turns
        const turns: DebateTurn[] = utterances.map((u, index) => ({
          id: u.id,
          debateId: u.debateId,
          phase: u.phase as DebatePhase,
          speaker: u.speaker as Speaker,
          content: u.content,
          turnNumber: u.turnNumber ?? index,
          timestamp: new Date(u.createdAt),
          metadata: u.metadata as DebateTurn['metadata'],
        }));

        // Determine current phase/speaker from last turn or debate data
        const lastTurn = turns[turns.length - 1];
        const currentPhase = lastTurn?.phase || (debateData.currentPhase as DebatePhase);
        const currentSpeaker = lastTurn?.speaker || Speaker.MODERATOR;

        // For live/paused debates, set state and connect to SSE for new events
        if (debateData.status === 'live' || debateData.status === 'paused') {
          setDebate({
            debate: {
              id: debateData.id,
              proposition: debateData.propositionText,
              status: debateData.status,
              currentPhase: currentPhase,
              currentSpeaker: currentSpeaker,
              turns: turns, // Include existing turns!
              interventions: [],
              createdAt: new Date(debateData.createdAt),
              totalElapsedMs: debateData.totalDurationMs || 0,
              // Configuration defaults (API doesn't return these yet)
              flowMode: 'auto' as FlowMode,
              presetMode: 'balanced' as PresetMode,
              brevityLevel: 3,
              llmTemperature: 0.7,
              maxTokensPerResponse: 1024,
              requireCitations: false,
            },
            isLoading: false,
          });

          // Connect to SSE for live updates
          connectToDebate(debateId!);
          setIsLoading(false);
          return;
        }

        // For completed/failed debates, build the full debate object
        // (utterances already fetched above)
        const mappedStatus = mapApiStatus(debateData.status);
        const fullDebate: Debate = {
          id: debateData.id,
          proposition: debateData.propositionText,
          status: mappedStatus,
          currentPhase: mappedStatus === 'completed' ? DebatePhase.COMPLETED : currentPhase,
          currentSpeaker,
          turns,
          interventions: [],
          createdAt: new Date(debateData.createdAt),
          completedAt: mappedStatus === 'completed' ? new Date(debateData.updatedAt) : undefined,
          totalElapsedMs: debateData.totalDurationMs || 0,
          // Configuration defaults (API doesn't return these yet)
          flowMode: 'auto' as FlowMode,
          presetMode: 'balanced' as PresetMode,
          brevityLevel: 3,
          llmTemperature: 0.7,
          maxTokensPerResponse: 1024,
          requireCitations: false,
        };

        // Update store
        setDebate({
          debate: fullDebate,
          isLoading: false,
          connectionStatus: 'disconnected',
        });

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load debate');
        setIsLoading(false);
      }
    }

    loadDebate();

    // Cleanup on unmount
    return () => {
      _reset();
    };
  }, [debateId, API_BASE_URL, connectToDebate, setDebate, _reset]);

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading debate...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.container}>
        <Card padding="lg">
          <Alert variant="error" title="Error">
            {error}
          </Alert>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => navigate('/history')}>
              Back to History
            </Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Debate loaded - show using DebateStream
  return (
    <div className={styles.container}>
      <Link to="/history" className={styles.backLink}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to History
      </Link>

      {debate && (
        <header className={styles.header}>
          <h1 className={styles.proposition}>"{debate.proposition}"</h1>

          <div className={styles.meta}>
            <Badge
              variant={
                debate.status === 'completed'
                  ? 'success'
                  : debate.status === 'live'
                  ? 'primary'
                  : debate.status === 'error'
                  ? 'error'
                  : 'warning'
              }
              dot={debate.status === 'live'}
            >
              {debate.status === 'completed'
                ? 'Completed'
                : debate.status === 'live'
                ? 'Live'
                : debate.status === 'error'
                ? 'Error'
                : 'Paused'}
            </Badge>

            {isLivelyDebate && (
              <Badge variant="secondary">
                Lively Mode
              </Badge>
            )}

            {/* View mode toggle for completed lively debates */}
            {isLivelyDebate && debate.status === 'completed' && (
              <div className={styles.viewModeToggle}>
                <Button
                  variant={viewMode === 'stream' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('stream')}
                  aria-pressed={viewMode === 'stream'}
                >
                  Stream View
                </Button>
                <Button
                  variant={viewMode === 'replay' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('replay')}
                  aria-pressed={viewMode === 'replay'}
                >
                  Step-Through
                </Button>
              </div>
            )}

            {debate.totalElapsedMs > 0 && (
              <span className={styles.metaItem}>
                <span className={styles.duration}>
                  {formatDuration(debate.totalElapsedMs)}
                </span>
              </span>
            )}

            <span className={styles.metaItem}>
              <span className={styles.turnCount}>
                {debate.turns.length} turns
              </span>
            </span>

            <span className={styles.metaItem}>
              Started {new Date(debate.createdAt).toLocaleDateString()}
            </span>
          </div>
        </header>
      )}

      {/* Stalled debate warning */}
      {isStalled && (
        <Alert variant="warning" className={styles.stalledAlert}>
          <div className={styles.stalledContent}>
            <div>
              <strong>This debate appears to be stalled.</strong>
              <p>The server may have restarted. You can mark this debate as completed to preserve the transcript, or cancel it.</p>
            </div>
            <div className={styles.stalledActions}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => closeDebate('completed', 'Server restart - marked as complete')}
              >
                Mark as Completed
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => closeDebate('failed', 'Server restart - cancelled by user')}
              >
                Cancel Debate
              </Button>
            </div>
          </div>
        </Alert>
      )}

      <main className={styles.main}>
        <div className={styles.transcript}>
          {viewMode === 'stream' ? (
            <DebateStream />
          ) : (
            <ReplayViewer
              turns={debate?.turns || []}
              onExit={() => setViewMode('stream')}
            />
          )}
        </div>

        {/* Export Panel - show for completed debates */}
        {debate?.status === 'completed' && (
          <aside className={styles.sidebar}>
            <ExportPanel
              debateId={debateId!}
              debateTitle={debate.proposition}
              onExportComplete={(format, url) => {
                console.log(`Export complete: ${format} - ${url}`);
              }}
            />
          </aside>
        )}
      </main>

      <footer className={styles.footer}>
        <Link to="/">
          <Button variant="primary">Start New Debate</Button>
        </Link>
      </footer>

      {/* Model Error Modal */}
      {hasModelError && modelError && (
        <ModelErrorModal
          isOpen={hasModelError}
          speaker={modelError.speaker}
          failedModelId={modelError.failedModelId}
          error={modelError.error}
          phase={modelError.phase}
          onReassign={(newModelId) => reassignModel(modelError.speaker, newModelId)}
          onClose={clearModelError}
        />
      )}
    </div>
  );
}

export default DebateViewPage;
