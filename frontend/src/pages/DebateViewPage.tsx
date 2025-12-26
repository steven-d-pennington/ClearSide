/**
 * DebateViewPage
 *
 * Page for viewing/replaying a specific debate by ID.
 * Loads debate data from API and displays it using DebateStream.
 */

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Badge } from '../components/ui';
import { DebateStream } from '../components/DebateStream';
import { useDebateStore } from '../stores/debate-store';
import { DebatePhase, Speaker } from '../types/debate';
import type { Debate, DebateTurn } from '../types/debate';
import styles from './DebateViewPage.module.css';

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

export function DebateViewPage() {
  const { debateId } = useParams<{ debateId: string }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get store state and actions
  const debate = useDebateStore((state) => state.debate);
  const setDebate = useDebateStore.setState;
  const connectToDebate = useDebateStore((state) => state.connectToDebate);
  const _reset = useDebateStore((state) => state._reset);

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

        // For live debates, connect to SSE stream
        if (debateData.status === 'live' || debateData.status === 'paused') {
          // Set initial state
          setDebate({
            debate: {
              id: debateData.id,
              proposition: debateData.propositionText,
              status: debateData.status,
              currentPhase: debateData.currentPhase as DebatePhase,
              currentSpeaker: Speaker.MODERATOR,
              turns: [],
              interventions: [],
              createdAt: new Date(debateData.createdAt),
              totalElapsedMs: debateData.totalDurationMs || 0,
            },
            isLoading: false,
          });

          // Connect to SSE for live updates
          connectToDebate(debateId!);
          setIsLoading(false);
          return;
        }

        // For completed/failed debates, fetch all utterances
        const utterancesRes = await fetch(
          `${API_BASE_URL}/api/debates/${debateId}/utterances`
        );

        let utterances: UtteranceResponse[] = [];
        if (utterancesRes.ok) {
          const utteranceData = await utterancesRes.json();
          utterances = utteranceData.utterances || [];
        }

        // Map utterances to turns
        const turns: DebateTurn[] = utterances.map((u) => ({
          id: u.id,
          debateId: u.debateId,
          phase: u.phase as DebatePhase,
          speaker: u.speaker as Speaker,
          content: u.content,
          turnNumber: u.turnNumber,
          timestamp: new Date(u.createdAt),
          metadata: u.metadata as DebateTurn['metadata'],
        }));

        // Determine current phase from last turn or debate data
        const lastTurn = turns[turns.length - 1];
        const currentPhase = lastTurn?.phase || (debateData.currentPhase as DebatePhase);
        const currentSpeaker = lastTurn?.speaker || Speaker.MODERATOR;

        // Build debate object
        const fullDebate: Debate = {
          id: debateData.id,
          proposition: debateData.propositionText,
          status: debateData.status,
          currentPhase: debateData.status === 'completed' ? DebatePhase.COMPLETED : currentPhase,
          currentSpeaker,
          turns,
          interventions: [],
          createdAt: new Date(debateData.createdAt),
          completedAt: debateData.status === 'completed' ? new Date(debateData.updatedAt) : undefined,
          totalElapsedMs: debateData.totalDurationMs || 0,
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
      <header className={styles.header}>
        <Link to="/history" className={styles.backLink}>
          <svg
            width="20"
            height="20"
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
          <div className={styles.meta}>
            <Badge
              variant={
                debate.status === 'completed'
                  ? 'success'
                  : debate.status === 'live'
                  ? 'primary'
                  : debate.status === 'failed'
                  ? 'error'
                  : 'warning'
              }
              dot={debate.status === 'live'}
            >
              {debate.status === 'completed'
                ? 'Completed'
                : debate.status === 'live'
                ? 'Live'
                : debate.status === 'failed'
                ? 'Failed'
                : 'Paused'}
            </Badge>

            {debate.totalElapsedMs > 0 && (
              <span className={styles.duration}>
                {formatDuration(debate.totalElapsedMs)}
              </span>
            )}

            <span className={styles.turnCount}>
              {debate.turns.length} turns
            </span>
          </div>
        )}
      </header>

      <main className={styles.main}>
        <DebateStream />
      </main>

      <footer className={styles.footer}>
        <Link to="/">
          <Button variant="primary">Start New Debate</Button>
        </Link>
      </footer>
    </div>
  );
}

export default DebateViewPage;
