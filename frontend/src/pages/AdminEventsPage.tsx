/**
 * AdminEventsPage
 *
 * System event log viewer for debugging and monitoring.
 * Shows events from orchestrator, including retries, errors, and phase transitions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminEventsPage.module.css';

interface SystemEvent {
  id: number;
  eventType: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
  debateId: string | null;
  speaker: string | null;
  phase: string | null;
  promptType: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface EventsResponse {
  events: SystemEvent[];
  count: number;
  limit: number;
  offset: number;
}

const EVENT_TYPES = [
  'phase_transition',
  'turn_completed',
  'retry_attempt',
  'retry_success',
  'retry_exhausted',
  'truncated_response',
  'error',
  'interruption_fired',
  'resumption',
];

const SEVERITIES = ['debug', 'info', 'warn', 'error'];

export function AdminEventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filters from URL params
  const debateId = searchParams.get('debateId') || '';
  const selectedTypes = searchParams.get('types')?.split(',').filter(Boolean) || [];
  const selectedSeverities = searchParams.get('severities')?.split(',').filter(Boolean) || [];

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');

      if (debateId) {
        params.set('debateId', debateId);
      }
      if (selectedTypes.length > 0) {
        params.set('eventTypes', selectedTypes.join(','));
      }
      if (selectedSeverities.length > 0) {
        params.set('severities', selectedSeverities.join(','));
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/events?${params}`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data: EventsResponse = await response.json();
      setEvents(data.events);
      setError(null);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL, debateId, selectedTypes.join(','), selectedSeverities.join(',')]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchEvents, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchEvents, autoRefresh]);

  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const toggleTypeFilter = (type: string) => {
    const newTypes = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    updateFilter('types', newTypes.join(','));
  };

  const toggleSeverityFilter = (sev: string) => {
    const newSevs = selectedSeverities.includes(sev)
      ? selectedSeverities.filter(s => s !== sev)
      : [...selectedSeverities, sev];
    updateFilter('severities', newSevs.join(','));
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const getSeverityClass = (severity: string): string => {
    switch (severity) {
      case 'debug': return styles.debug;
      case 'info': return styles.info;
      case 'warn': return styles.warn;
      case 'error': return styles.error;
      default: return styles.info;
    }
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchEvents}>Retry</Button>
      </div>
    );
  }

  const hasActiveFilters = debateId || selectedTypes.length > 0 || selectedSeverities.length > 0;

  return (
    <div className={styles.container}>
      <Link to="/admin" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>System Events</h1>
          <p className={styles.subtitle}>
            {events.length} events {hasActiveFilters && '(filtered)'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.autoRefreshLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <Button variant="ghost" onClick={fetchEvents}>
            Refresh
          </Button>
        </div>
      </header>

      {/* Filters */}
      <section className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Debate ID:</label>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Filter by debate ID..."
            value={debateId}
            onChange={(e) => updateFilter('debateId', e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Event Types:</label>
          <div className={styles.filterChips}>
            {EVENT_TYPES.map(type => (
              <button
                key={type}
                className={`${styles.filterChip} ${selectedTypes.includes(type) ? styles.active : ''}`}
                onClick={() => toggleTypeFilter(type)}
              >
                {type.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Severity:</label>
          <div className={styles.filterChips}>
            {SEVERITIES.map(sev => (
              <button
                key={sev}
                className={`${styles.filterChip} ${styles[sev]} ${selectedSeverities.includes(sev) ? styles.active : ''}`}
                onClick={() => toggleSeverityFilter(sev)}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </section>

      {/* Events Table */}
      <section className={styles.section}>
        {events.length === 0 ? (
          <div className={styles.noData}>
            No events found {hasActiveFilters && 'matching the current filters'}
          </div>
        ) : (
          <div className={styles.eventsTable}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Speaker</th>
                  <th>Phase</th>
                  <th>Debate</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className={getSeverityClass(event.severity)}>
                    <td className={styles.timeCell}>
                      <span className={styles.time}>{formatTime(event.createdAt)}</span>
                      <span className={styles.date}>{formatDate(event.createdAt)}</span>
                    </td>
                    <td>
                      <span className={`${styles.severityBadge} ${getSeverityClass(event.severity)}`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className={styles.eventType}>{event.eventType}</td>
                    <td className={styles.message}>{event.message}</td>
                    <td className={styles.speaker}>{event.speaker || '-'}</td>
                    <td className={styles.phase}>
                      {event.phase ? event.phase.replace('PHASE_', 'P').replace(/_/g, ' ') : '-'}
                    </td>
                    <td className={styles.debateId}>
                      {event.debateId ? (
                        <Link to={`/debates/${event.debateId}`} className={styles.debateLink}>
                          {event.debateId.substring(0, 8)}...
                        </Link>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick Stats */}
      <section className={styles.statsSection}>
        <h2 className={styles.sectionTitle}>Quick Stats</h2>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {events.filter(e => e.severity === 'error').length}
            </span>
            <span className={`${styles.statLabel} ${styles.error}`}>Errors</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {events.filter(e => e.severity === 'warn').length}
            </span>
            <span className={`${styles.statLabel} ${styles.warn}`}>Warnings</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {events.filter(e => e.eventType === 'retry_attempt').length}
            </span>
            <span className={styles.statLabel}>Retry Attempts</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {events.filter(e => e.eventType === 'phase_transition').length}
            </span>
            <span className={styles.statLabel}>Phase Transitions</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdminEventsPage;
