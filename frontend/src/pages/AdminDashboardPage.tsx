/**
 * AdminDashboardPage
 *
 * Admin dashboard showing statistics, system health, and quick actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminDashboardPage.module.css';

interface DebateStats {
  total: number;
  live: number;
  paused: number;
  completed: number;
  failed: number;
  initializing: number;
}

interface ExportStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

interface SystemStats {
  activeConnections: number;
  activeOrchestrators: number;
  uptime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

interface RecentDebate {
  id: string;
  proposition: string;
  status: string;
  currentPhase: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface AdminStats {
  debates: DebateStats;
  exports: ExportStats;
  system: SystemStats;
  recentDebates: RecentDebate[];
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching admin stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleStopAllDebates = async () => {
    if (!confirm('Are you sure you want to stop all live debates?')) return;

    setActionLoading('stop-all');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/debates/stop-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin stopped all debates' }),
      });
      const data = await response.json();

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Stopped ${data.stoppedCount} debates` });
        fetchStats();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to stop debates' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to stop debates' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Delete completed/failed debates older than 7 days?')) return;

    setActionLoading('cleanup');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/debates/cleanup?maxAgeDays=7`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Deleted ${data.deletedCount} old debates` });
        fetchStats();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to cleanup debates' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cleanup' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading admin dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchStats} className={styles.retryButton}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <p className={styles.subtitle}>System monitoring and management</p>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {/* Statistics Cards */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statIcon}>💬</span>
            <span className={styles.statLabel}>Total Debates</span>
          </div>
          <div className={styles.statValue}>{stats?.debates.total ?? 0}</div>
          <div className={styles.statDetails}>
            <span className={styles.statLive}>{stats?.debates.live ?? 0} live</span>
            <span className={styles.statDivider}>|</span>
            <span className={styles.statCompleted}>{stats?.debates.completed ?? 0} completed</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statIcon}>🎙️</span>
            <span className={styles.statLabel}>Export Jobs</span>
          </div>
          <div className={styles.statValue}>{stats?.exports.total ?? 0}</div>
          <div className={styles.statDetails}>
            <span className={styles.statProcessing}>{stats?.exports.processing ?? 0} processing</span>
            <span className={styles.statDivider}>|</span>
            <span className={styles.statPending}>{stats?.exports.pending ?? 0} pending</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statIcon}>🔌</span>
            <span className={styles.statLabel}>Connections</span>
          </div>
          <div className={styles.statValue}>{stats?.system.activeConnections ?? 0}</div>
          <div className={styles.statDetails}>
            <span>{stats?.system.activeOrchestrators ?? 0} active orchestrators</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statIcon}>💾</span>
            <span className={styles.statLabel}>Memory</span>
          </div>
          <div className={styles.statValue}>{stats?.system.memoryUsage.heapUsed ?? 0} MB</div>
          <div className={styles.statDetails}>
            <span>Uptime: {formatUptime(stats?.system.uptime ?? 0)}</span>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className={styles.actionsSection}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actionsGrid}>
          <Button
            variant="secondary"
            onClick={handleStopAllDebates}
            loading={actionLoading === 'stop-all'}
            disabled={(stats?.debates.live ?? 0) === 0 && (stats?.debates.paused ?? 0) === 0}
            className={styles.actionButton}
          >
            Stop All Live Debates
          </Button>

          <Link to="/admin/debates" className={styles.actionLink}>
            <Button variant="secondary" className={styles.actionButton}>
              Manage Debates
            </Button>
          </Link>

          <Link to="/admin/exports" className={styles.actionLink}>
            <Button variant="secondary" className={styles.actionButton}>
              Export Center
            </Button>
          </Link>

          <Link to="/admin/system" className={styles.actionLink}>
            <Button variant="ghost" className={styles.actionButton}>
              System Monitor
            </Button>
          </Link>

          <Link to="/admin/testing" className={styles.actionLink}>
            <Button variant="ghost" className={styles.actionButton}>
              Service Testing
            </Button>
          </Link>

          <Link to="/admin/config" className={styles.actionLink}>
            <Button variant="ghost" className={styles.actionButton}>
              Configuration
            </Button>
          </Link>

          <Link to="/admin/events" className={styles.actionLink}>
            <Button variant="ghost" className={styles.actionButton}>
              Event Logs
            </Button>
          </Link>

          <Link to="/admin/duelogic/research" className={styles.actionLink}>
            <Button variant="secondary" className={styles.actionButton}>
              Duelogic Research
            </Button>
          </Link>

          <Button
            variant="ghost"
            onClick={handleCleanup}
            loading={actionLoading === 'cleanup'}
            className={styles.actionButton}
          >
            Cleanup Old Debates
          </Button>

          <Button
            variant="ghost"
            onClick={fetchStats}
            className={styles.actionButton}
          >
            Refresh Stats
          </Button>
        </div>
      </section>

      {/* Recent Debates */}
      <section className={styles.recentSection}>
        <h2 className={styles.sectionTitle}>Recent Debates</h2>
        {stats?.recentDebates && stats.recentDebates.length > 0 ? (
          <div className={styles.recentTable}>
            <div className={styles.tableHeader}>
              <span>Proposition</span>
              <span>Status</span>
              <span>Created</span>
              <span>Actions</span>
            </div>
            {stats.recentDebates.map((debate) => (
              <div key={debate.id} className={styles.tableRow}>
                <span className={styles.proposition} title={debate.proposition}>
                  {debate.proposition}
                </span>
                <span className={`${styles.status} ${styles[`status${debate.status.charAt(0).toUpperCase() + debate.status.slice(1)}`]}`}>
                  {debate.status}
                </span>
                <span className={styles.date}>{formatDate(debate.createdAt)}</span>
                <span className={styles.actions}>
                  <Link to={`/debates/${debate.id}`} className={styles.viewLink}>
                    View
                  </Link>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.noData}>No debates yet</p>
        )}
      </section>
    </div>
  );
}

export default AdminDashboardPage;
