/**
 * AdminDuelogicResearchPage
 *
 * Dashboard for managing Duelogic research and episode proposals
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminDuelogicResearchPage.module.css';
import type {
  DashboardStats,
  ResearchJob,
  EpisodeProposal,
  ProposalStatus,
  CATEGORY_LABELS,
} from '../types/duelogic-research';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function AdminDuelogicResearchPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<ResearchJob[]>([]);
  const [pendingProposals, setPendingProposals] = useState<EpisodeProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [runningJob, setRunningJob] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const [statsRes, jobsRes, proposalsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/duelogic/dashboard/stats`),
        fetch(`${API_BASE_URL}/api/duelogic/research/jobs?limit=5`),
        fetch(`${API_BASE_URL}/api/duelogic/proposals?status=pending`),
      ]);

      if (!statsRes.ok || !jobsRes.ok || !proposalsRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [statsData, jobsData, proposalsData] = await Promise.all([
        statsRes.json(),
        jobsRes.json(),
        proposalsRes.json(),
      ]);

      setStats(statsData);
      setRecentJobs(jobsData);
      setPendingProposals(proposalsData.slice(0, 5));
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRunJob = async () => {
    setRunningJob(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/research/jobs/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Research job started' });
        fetchDashboard();
      } else {
        const data = await response.json();
        setActionMessage({ type: 'error', text: data.error || 'Failed to start job' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to start research job' });
    } finally {
      setRunningJob(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleQuickApprove = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal approved' });
        fetchDashboard();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to approve proposal' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleQuickReject = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/proposals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Proposal rejected' });
        fetchDashboard();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to reject proposal' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to reject proposal' });
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
      running: styles.statusRunning,
      completed: styles.statusCompleted,
      failed: styles.statusFailed,
    };
    return statusMap[status] || '';
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Alert variant="error">{error}</Alert>
        <Button onClick={fetchDashboard} className={styles.retryButton}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/admin" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Admin
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Duelogic Research Dashboard</h1>
        <nav className={styles.nav}>
          <Link to="/admin/duelogic/proposals" className={styles.navLink}>All Proposals</Link>
        </nav>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {/* Stats Grid */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.pendingProposals ?? 0}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.approvedProposals ?? 0}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.scheduledProposals ?? 0}</span>
          <span className={styles.statLabel}>Scheduled</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats?.rejectedProposals ?? 0}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </section>

      {/* Recent Research Jobs */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Research Jobs</h2>
          <Button
            onClick={handleRunJob}
            loading={runningJob}
            variant="primary"
            size="sm"
          >
            Run Now
          </Button>
        </div>
        {recentJobs.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Status</th>
                <th>Topics</th>
                <th>Episodes</th>
                <th>Tokens</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map(job => (
                <tr key={job.id}>
                  <td className={styles.jobId}>{job.id.slice(0, 8)}</td>
                  <td>
                    <span className={`${styles.status} ${getStatusClass(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td>{job.topicsDiscovered}</td>
                  <td>{job.episodesGenerated}</td>
                  <td>{job.tokensUsed.toLocaleString()}</td>
                  <td>{formatDate(job.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.noData}>No research jobs yet</p>
        )}
      </section>

      {/* Pending Proposals */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Pending Proposals</h2>
          <Link to="/admin/duelogic/proposals" className={styles.viewAllLink}>
            View All
          </Link>
        </div>
        {pendingProposals.length > 0 ? (
          <div className={styles.proposalList}>
            {pendingProposals.map(proposal => (
              <div key={proposal.id} className={styles.proposalCard}>
                <div className={styles.proposalHeader}>
                  <h3 className={styles.proposalTitle}>{proposal.title}</h3>
                  <span className={styles.proposalSubtitle}>{proposal.subtitle}</span>
                </div>
                <p className={styles.proposalDescription}>{proposal.description}</p>
                <div className={styles.proposalMeta}>
                  <span>Generated: {formatDate(proposal.generatedAt)}</span>
                </div>
                <div className={styles.proposalActions}>
                  <Link to={`/admin/duelogic/proposals/${proposal.id}`} className={styles.viewBtn}>
                    View
                  </Link>
                  <Button
                    onClick={() => handleQuickApprove(proposal.id)}
                    variant="primary"
                    size="sm"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleQuickReject(proposal.id)}
                    variant="secondary"
                    size="sm"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.noData}>No pending proposals</p>
        )}
      </section>
    </div>
  );
}

export default AdminDuelogicResearchPage;
