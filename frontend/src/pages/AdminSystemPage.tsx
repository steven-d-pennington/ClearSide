/**
 * AdminSystemPage
 *
 * System monitoring page showing memory usage, rate limits, connections, and node info.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminSystemPage.module.css';

interface SystemStats {
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    heapUsedPercent: number;
  };
  connections: {
    total: number;
    byDebate: Record<string, number>;
  };
  orchestrators: {
    active: number;
    debateIds: string[];
  };
  rateLimiter: {
    globalRequests: number;
    models: Record<string, {
      requestsInWindow: number;
      knownLimit?: number;
      knownRemaining?: number;
      resetTimestamp?: number;
    }>;
  };
  debates: {
    total: number;
    live: number;
    paused: number;
    completed: number;
    failed: number;
  };
  exports: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  };
  node: {
    version: string;
    platform: string;
    pid: number;
  };
}

export function AdminSystemPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/system`);
      if (!response.ok) throw new Error('Failed to fetch system stats');
      const data: SystemStats = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching system stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load system stats');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchStats, autoRefresh]);

  const getMemoryColor = (percent: number): string => {
    if (percent < 50) return styles.good;
    if (percent < 75) return styles.warning;
    return styles.danger;
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading system stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchStats}>Retry</Button>
      </div>
    );
  }

  if (!stats) return null;

  const modelEntries = Object.entries(stats.rateLimiter.models || {});

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
          <h1 className={styles.title}>System Monitoring</h1>
          <p className={styles.subtitle}>
            Last updated: {new Date(stats.timestamp).toLocaleTimeString()}
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
          <Button variant="ghost" onClick={fetchStats}>
            Refresh
          </Button>
        </div>
      </header>

      {/* Overview Cards */}
      <div className={styles.overviewGrid}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Uptime</h3>
          <div className={styles.bigValue}>{stats.uptime.formatted}</div>
          <div className={styles.cardDetail}>PID: {stats.node.pid}</div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Node.js</h3>
          <div className={styles.bigValue}>{stats.node.version}</div>
          <div className={styles.cardDetail}>{stats.node.platform}</div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Active Connections</h3>
          <div className={styles.bigValue}>{stats.connections.total}</div>
          <div className={styles.cardDetail}>SSE clients</div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Active Orchestrators</h3>
          <div className={styles.bigValue}>{stats.orchestrators.active}</div>
          <div className={styles.cardDetail}>Running debates</div>
        </div>
      </div>

      {/* Memory Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Memory Usage</h2>
        <div className={styles.memoryGrid}>
          <div className={styles.memoryCard}>
            <div className={styles.memoryLabel}>Heap Used</div>
            <div className={styles.memoryBar}>
              <div
                className={`${styles.memoryFill} ${getMemoryColor(stats.memory.heapUsedPercent)}`}
                style={{ width: `${stats.memory.heapUsedPercent}%` }}
              />
            </div>
            <div className={styles.memoryValue}>
              {stats.memory.heapUsed} MB / {stats.memory.heapTotal} MB ({stats.memory.heapUsedPercent}%)
            </div>
          </div>

          <div className={styles.memoryStats}>
            <div className={styles.memoryStat}>
              <span className={styles.memoryStatLabel}>RSS</span>
              <span className={styles.memoryStatValue}>{stats.memory.rss} MB</span>
            </div>
            <div className={styles.memoryStat}>
              <span className={styles.memoryStatLabel}>External</span>
              <span className={styles.memoryStatValue}>{stats.memory.external} MB</span>
            </div>
          </div>
        </div>
      </section>

      {/* Rate Limiter Section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Rate Limiter</h2>
        <div className={styles.rateLimiterInfo}>
          <div className={styles.globalRequests}>
            <span className={styles.label}>Global Requests (last minute):</span>
            <span className={styles.value}>{stats.rateLimiter.globalRequests}</span>
          </div>
        </div>

        {modelEntries.length > 0 ? (
          <div className={styles.modelsTable}>
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Requests (1m)</th>
                  <th>Known Limit</th>
                  <th>Remaining</th>
                  <th>Reset</th>
                </tr>
              </thead>
              <tbody>
                {modelEntries.map(([modelId, info]) => (
                  <tr key={modelId}>
                    <td className={styles.modelId}>{modelId}</td>
                    <td>{info.requestsInWindow}</td>
                    <td>{info.knownLimit ?? '-'}</td>
                    <td>{info.knownRemaining ?? '-'}</td>
                    <td>
                      {info.resetTimestamp
                        ? new Date(info.resetTimestamp).toLocaleTimeString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.noData}>No models have been used yet</div>
        )}
      </section>

      {/* Debates & Exports Summary */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Stats</h2>
        <div className={styles.quickStatsGrid}>
          <div className={styles.quickStatGroup}>
            <h4>Debates</h4>
            <div className={styles.quickStatRow}>
              <span>Total:</span>
              <span>{stats.debates.total}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span className={styles.live}>Live:</span>
              <span>{stats.debates.live}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span>Paused:</span>
              <span>{stats.debates.paused}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span className={styles.completed}>Completed:</span>
              <span>{stats.debates.completed}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span className={styles.failed}>Failed:</span>
              <span>{stats.debates.failed}</span>
            </div>
          </div>

          <div className={styles.quickStatGroup}>
            <h4>Export Jobs</h4>
            <div className={styles.quickStatRow}>
              <span>Total:</span>
              <span>{stats.exports.total}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span>Pending:</span>
              <span>{stats.exports.pending}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span className={styles.processing}>Processing:</span>
              <span>{stats.exports.processing}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span className={styles.completed}>Completed:</span>
              <span>{stats.exports.completed}</span>
            </div>
            <div className={styles.quickStatRow}>
              <span className={styles.failed}>Failed:</span>
              <span>{stats.exports.failed}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Active Orchestrators */}
      {stats.orchestrators.debateIds.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Active Debate Orchestrators</h2>
          <div className={styles.orchestratorList}>
            {stats.orchestrators.debateIds.map((debateId) => (
              <Link
                key={debateId}
                to={`/debates/${debateId}`}
                className={styles.orchestratorLink}
              >
                {debateId}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default AdminSystemPage;
