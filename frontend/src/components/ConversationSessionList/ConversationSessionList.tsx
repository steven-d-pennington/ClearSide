/**
 * ConversationSessionList Component
 *
 * Displays a list of all conversation sessions with status, topic, and date.
 * Allows users to browse and select conversations to view/replay.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Button, Alert } from '../ui';
import styles from './ConversationSessionList.module.css';

/**
 * Session summary from API
 */
interface SessionSummary {
  id: string;
  topic: string;
  topicContext: string | null;
  status: 'configuring' | 'live' | 'paused' | 'completed' | 'error';
  participantCount: number;
  flowMode: 'manual' | 'auto_stream' | 'natural_pace';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalDurationMs: number | null;
}

/**
 * API response for session list
 */
interface SessionListResponse {
  sessions: SessionSummary[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Status badge variant mapping
 */
const STATUS_VARIANTS: Record<SessionSummary['status'], 'success' | 'warning' | 'error' | 'info' | 'primary'> = {
  completed: 'success',
  live: 'primary',
  paused: 'warning',
  configuring: 'info',
  error: 'error',
};

/**
 * Status display labels
 */
const STATUS_LABELS: Record<SessionSummary['status'], string> = {
  completed: 'Completed',
  live: 'Live',
  paused: 'Paused',
  configuring: 'Setting Up',
  error: 'Error',
};

/**
 * Flow mode display labels
 */
const FLOW_MODE_LABELS: Record<SessionSummary['flowMode'], string> = {
  manual: 'Manual',
  auto_stream: 'Auto',
  natural_pace: 'Natural',
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

interface ConversationSessionListProps {
  /** Filter by status */
  statusFilter?: SessionSummary['status'];
  /** Maximum number of sessions to show */
  limit?: number;
  /** Show compact view */
  compact?: boolean;
}

export function ConversationSessionList({ statusFilter, limit = 50, compact = false }: ConversationSessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    async function fetchSessions() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        params.set('limit', String(limit));

        const url = `${API_BASE_URL}/api/conversations/sessions${params.toString() ? `?${params}` : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch conversations: ${response.status}`);
        }

        const data: SessionListResponse = await response.json();
        setSessions(data.sessions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSessions();
  }, [API_BASE_URL, statusFilter, limit]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} aria-label="Loading conversations" />
        <p>Loading conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error loading conversations">
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

  if (sessions.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No conversations yet</p>
        <p className={styles.emptyDescription}>
          Start a new conversation to see it appear here.
        </p>
        <Link to="/">
          <Button variant="primary">Start a Conversation</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.list} role="list" aria-label="Conversation history">
      {sessions.map((session) => (
        <Link
          key={session.id}
          to={`/conversation/${session.id}`}
          className={styles.link}
        >
          <Card
            className={`${styles.card} ${styles[session.status]} ${compact ? styles.compact : ''}`}
            padding={compact ? 'sm' : 'md'}
          >
            <div className={styles.header}>
              <Badge
                variant={STATUS_VARIANTS[session.status]}
                dot={session.status === 'live'}
              >
                {STATUS_LABELS[session.status]}
              </Badge>
              <span className={styles.date}>
                {formatDate(session.createdAt)}
              </span>
            </div>

            <h3 className={styles.topic}>
              {truncate(session.topic, compact ? 80 : 150)}
            </h3>

            <div className={styles.footer}>
              <div className={styles.meta}>
                {session.totalDurationMs && session.totalDurationMs > 0 && (
                  <span className={styles.duration}>
                    {formatDuration(session.totalDurationMs)}
                  </span>
                )}
                <span className={styles.participants}>
                  {session.participantCount} guests
                </span>
                <span className={styles.flowMode}>
                  {FLOW_MODE_LABELS[session.flowMode]}
                </span>
              </div>
              <span className={styles.viewArrow}>
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
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default ConversationSessionList;
