/**
 * AdminDuelogicProposalsPage
 *
 * List of all episode proposals with filtering and bulk actions
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminDuelogicProposalsPage.module.css';
import type { EpisodeProposal, ProposalStatus } from '../types/duelogic-research';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function AdminDuelogicProposalsPage() {
  const [proposals, setProposals] = useState<EpisodeProposal[]>([]);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchProposals = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = statusFilter === 'all'
        ? `${API_BASE_URL}/api/duelogic/proposals`
        : `${API_BASE_URL}/api/duelogic/proposals?status=${statusFilter}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch proposals');

      const data = await response.json();
      setProposals(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching proposals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load proposals');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = () => {
    if (selectedIds.size === proposals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(proposals.map(p => p.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Approve ${selectedIds.size} proposals?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/bulk-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ids: Array.from(selectedIds) }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Approved ${selectedIds.size} proposals` });
        setSelectedIds(new Set());
        fetchProposals();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to approve proposals' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve proposals' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Reject ${selectedIds.size} proposals?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/bulk-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', ids: Array.from(selectedIds) }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Rejected ${selectedIds.size} proposals` });
        setSelectedIds(new Set());
        fetchProposals();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to reject proposals' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reject proposals' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusClass = (status: string): string => {
    const statusMap: Record<string, string> = {
      pending: styles.statusPending,
      approved: styles.statusApproved,
      rejected: styles.statusRejected,
      scheduled: styles.statusScheduled,
    };
    return statusMap[status] || '';
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading proposals...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchProposals} className={styles.retryButton}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/admin/duelogic/research" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Research Dashboard
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Episode Proposals</h1>
        <div className={styles.filters}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ProposalStatus | 'all')}
            className={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {selectedIds.size > 0 && (
        <div className={styles.bulkActions}>
          <span className={styles.selectedCount}>{selectedIds.size} selected</span>
          <Button onClick={handleBulkApprove} variant="primary" size="sm">
            Bulk Approve
          </Button>
          <Button onClick={handleBulkReject} variant="secondary" size="sm">
            Bulk Reject
          </Button>
        </div>
      )}

      {proposals.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkboxCol}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === proposals.length && proposals.length > 0}
                  onChange={selectAll}
                />
              </th>
              <th>Title</th>
              <th>Status</th>
              <th>Generated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(proposal => (
              <tr key={proposal.id} className={proposal.wasEdited ? styles.edited : ''}>
                <td className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(proposal.id)}
                    onChange={() => toggleSelection(proposal.id)}
                  />
                </td>
                <td>
                  <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.proposalLink}>
                    <strong>{proposal.title}</strong>
                    <span className={styles.subtitle}>{proposal.subtitle}</span>
                  </Link>
                </td>
                <td>
                  <span className={`${styles.status} ${getStatusClass(proposal.status)}`}>
                    {proposal.status}
                  </span>
                  {proposal.wasEdited && <span className={styles.editedBadge}>edited</span>}
                </td>
                <td className={styles.dateCol}>{formatDate(proposal.generatedAt)}</td>
                <td>
                  <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.viewBtn}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.noData}>No proposals found</p>
      )}
    </div>
  );
}

export default AdminDuelogicProposalsPage;
