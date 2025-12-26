/**
 * DebateList Component
 *
 * Displays a list of all debates with status, proposition, and date.
 * Allows users to browse and select debates to view/replay.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Button, Alert } from '../ui';
import styles from './DebateList.module.css';

/**
 * Debate summary from API
 */
interface DebateSummary {
  id: string;
  propositionText: string;
  status: 'initializing' | 'live' | 'paused' | 'completed' | 'failed';
  currentPhase: string;
  createdAt: string;
  updatedAt: string;
  totalDurationMs?: number;
}

/**
 * API response for debate list
 */
interface DebateListResponse {
  debates: DebateSummary[];
  count: number;
  limit: number;
  offset: number;
}

/**
 * Status badge variant mapping
 */
const STATUS_VARIANTS: Record<DebateSummary['status'], 'success' | 'warning' | 'error' | 'info' | 'primary'> = {
  completed: 'success',
  live: 'primary',
  paused: 'warning',
  initializing: 'info',
  failed: 'error',
};

/**
 * Status display labels
 */
const STATUS_LABELS: Record<DebateSummary['status'], string> = {
  completed: 'Completed',
  live: 'Live',
  paused: 'Paused',
  initializing: 'Starting...',
  failed: 'Failed',
};

/**
 * Format duration from milliseconds
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Truncate text to specified length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

interface DebateListProps {
  /** Filter by status */
  statusFilter?: DebateSummary['status'];
  /** Maximum number of debates to show */
  limit?: number;
  /** Show compact view */
  compact?: boolean;
}

export function DebateList({ statusFilter, limit = 50, compact = false }: DebateListProps) {
  const [debates, setDebates] = useState<DebateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use empty string for relative URLs (goes through Vite proxy)
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    async function fetchDebates() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        params.set('limit', String(limit));

        const url = `${API_BASE_URL}/api/debates${params.toString() ? `?${params}` : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch debates: ${response.status}`);
        }

        const data: DebateListResponse = await response.json();
        setDebates(data.debates);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load debates');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDebates();
  }, [API_BASE_URL, statusFilter, limit]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} aria-label="Loading debates" />
        <p>Loading debates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error loading debates">
        {error}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.location.reload()}
          style={{ marginTop: '0.5rem' }}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  if (debates.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No debates yet</p>
        <p className={styles.emptyDescription}>
          Start a new debate to see it appear here.
        </p>
        <Link to="/">
          <Button variant="primary">Start a Debate</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.list} role="list" aria-label="Debate history">
      {debates.map((debate) => (
        <Link
          key={debate.id}
          to={`/debates/${debate.id}`}
          className={styles.link}
        >
          <Card
            className={`${styles.card} ${compact ? styles.compact : ''}`}
            padding={compact ? 'sm' : 'md'}
          >
            <div className={styles.header}>
              <Badge
                variant={STATUS_VARIANTS[debate.status]}
                dot={debate.status === 'live'}
              >
                {STATUS_LABELS[debate.status]}
              </Badge>
              <span className={styles.date}>
                {formatDate(debate.createdAt)}
              </span>
            </div>

            <h3 className={styles.proposition}>
              {truncate(debate.propositionText, compact ? 80 : 150)}
            </h3>

            <div className={styles.meta}>
              {debate.totalDurationMs && debate.totalDurationMs > 0 && (
                <span className={styles.duration}>
                  {formatDuration(debate.totalDurationMs)}
                </span>
              )}
              <span className={styles.phase}>
                {debate.currentPhase.replace('PHASE_', '').replace(/_/g, ' ')}
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default DebateList;
