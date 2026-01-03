/**
 * AdminDebatesPage
 *
 * Admin page for managing debates with filtering, search, and bulk actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import { RerunDebateModal } from '../components/RerunDebateModal';
import styles from './AdminDebatesPage.module.css';

interface Debate {
  id: string;
  propositionText: string;
  status: string;
  currentPhase: string | null;
  flowMode: string;
  liveViewers: number;
  hasActiveOrchestrator: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface DebatesResponse {
  debates: Debate[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

type StatusFilter = 'all' | 'live' | 'paused' | 'completed' | 'failed' | 'initializing';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'initializing', label: 'Initializing' },
];

export function AdminDebatesPage() {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rerunDebateId, setRerunDebateId] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchDebates = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', '100');

      const response = await fetch(`${API_BASE_URL}/api/admin/debates?${params}`);
      if (!response.ok) throw new Error('Failed to fetch debates');
      const data: DebatesResponse = await response.json();

      setDebates(data.debates);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      console.error('Error fetching debates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load debates');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL, statusFilter, searchQuery]);

  useEffect(() => {
    fetchDebates();
  }, [fetchDebates]);

  useEffect(() => {
    // Refresh every 30 seconds when viewing live debates
    if (statusFilter === 'live' || statusFilter === 'all') {
      const interval = setInterval(fetchDebates, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchDebates, statusFilter]);

  const handleSelectAll = () => {
    if (selectedIds.size === debates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(debates.map(d => d.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleStopDebate = async (debateId: string) => {
    setActionLoading(debateId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/debates/${debateId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin stopped debate' }),
      });
      const data = await response.json();

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Debate stopped' });
        fetchDebates();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to stop debate' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to stop debate' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleDeleteDebate = async (debateId: string) => {
    if (!confirm('Are you sure you want to delete this debate?')) return;

    setActionLoading(debateId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/debates/${debateId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Debate deleted' });
        setSelectedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(debateId);
          return newSet;
        });
        fetchDebates();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to delete debate' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete debate' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} debates?`)) return;

    setActionLoading('bulk-delete');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/debates/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debateIds: Array.from(selectedIds) }),
      });
      const data = await response.json();

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Deleted ${data.deletedCount} debates` });
        setSelectedIds(new Set());
        fetchDebates();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to delete debates' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete debates' });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const canStop = (debate: Debate): boolean => {
    return debate.status === 'live' || debate.status === 'paused' || debate.status === 'initializing';
  };

  return (
    <div className={styles.container}>
      <Link to="/admin" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Debate Management</h1>
        <p className={styles.subtitle}>
          {total} debate{total !== 1 ? 's' : ''} total
        </p>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.filters}>
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={statusFilter === option.value ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <input
            type="text"
            placeholder="Search propositions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkActions}>
          <span className={styles.selectedCount}>{selectedIds.size} selected</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBulkDelete}
            loading={actionLoading === 'bulk-delete'}
          >
            Delete Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Debates Table */}
      {isLoading ? (
        <div className={styles.loading}>Loading debates...</div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : debates.length === 0 ? (
        <div className={styles.noData}>
          {searchQuery || statusFilter !== 'all'
            ? 'No debates match your filters'
            : 'No debates yet'}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === debates.length && debates.length > 0}
                    onChange={handleSelectAll}
                    className={styles.checkbox}
                  />
                </th>
                <th>Proposition</th>
                <th>Status</th>
                <th>Phase</th>
                <th>Viewers</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {debates.map((debate) => (
                <tr key={debate.id} className={selectedIds.has(debate.id) ? styles.selectedRow : ''}>
                  <td className={styles.checkboxCol}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(debate.id)}
                      onChange={() => handleSelectOne(debate.id)}
                      className={styles.checkbox}
                    />
                  </td>
                  <td>
                    <span className={styles.proposition} title={debate.propositionText}>
                      {debate.propositionText.substring(0, 80)}
                      {debate.propositionText.length > 80 ? '...' : ''}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.status} ${styles[`status${debate.status.charAt(0).toUpperCase() + debate.status.slice(1)}`]}`}>
                      {debate.status}
                      {debate.hasActiveOrchestrator && (
                        <span className={styles.activeBadge} title="Active orchestrator">*</span>
                      )}
                    </span>
                  </td>
                  <td className={styles.phase}>{debate.currentPhase || '-'}</td>
                  <td className={styles.viewers}>
                    {debate.liveViewers > 0 ? debate.liveViewers : '-'}
                  </td>
                  <td className={styles.date}>{formatDate(debate.createdAt)}</td>
                  <td className={styles.actions}>
                    <Link to={`/debates/${debate.id}`} className={styles.actionLink}>
                      View
                    </Link>
                    <button
                      onClick={() => setRerunDebateId(debate.id)}
                      className={styles.rerunBtn}
                    >
                      Re-run
                    </button>
                    {canStop(debate) && (
                      <button
                        onClick={() => handleStopDebate(debate.id)}
                        disabled={actionLoading === debate.id}
                        className={styles.stopBtn}
                      >
                        Stop
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteDebate(debate.id)}
                      disabled={actionLoading === debate.id}
                      className={styles.deleteBtn}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Re-run Debate Modal */}
      <RerunDebateModal
        isOpen={rerunDebateId !== null}
        onClose={() => setRerunDebateId(null)}
        debateId={rerunDebateId || ''}
      />
    </div>
  );
}

export default AdminDebatesPage;
