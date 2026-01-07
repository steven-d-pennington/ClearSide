/**
 * AdminDuelogicResearchPage
 *
 * Dashboard for managing Duelogic research and episode proposals
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminDuelogicResearchPage.module.css';
import type {
  DashboardStats,
  ResearchJob,
  EpisodeProposal,
  ResearchConfig,
  ResearchCategory,
} from '../types/duelogic-research';
import { CATEGORY_LABELS } from '../types/duelogic-research';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const ALL_CATEGORIES: ResearchCategory[] = [
  'technology_ethics',
  'ai_automation',
  'climate_environment',
  'bioethics_medicine',
  'economics_inequality',
  'politics_governance',
  'social_justice',
  'international_relations',
  'privacy_surveillance',
  'education_culture',
];

interface ResearchLogEntry {
  id: string;
  timestamp: string;
  event: string;
  level?: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: Record<string, unknown>;
}

export function AdminDuelogicResearchPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<ResearchJob[]>([]);
  const [pendingProposals, setPendingProposals] = useState<EpisodeProposal[]>([]);
  const [configs, setConfigs] = useState<ResearchConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [runningJob, setRunningJob] = useState(false);
  const [showNewConfig, setShowNewConfig] = useState(false);
  const [newConfig, setNewConfig] = useState({
    name: '',
    categories: ['technology_ethics', 'ai_automation'] as ResearchCategory[],
    maxTopicsPerRun: 10,
    minControversyScore: 0.6,
  });

  // Research job streaming state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<ResearchLogEntry[]>([]);
  const [jobProgress, setJobProgress] = useState<{
    categoriesCompleted: number;
    totalCategories: number;
    topicsFound: number;
    episodesGenerated: number;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [creatingConfig, setCreatingConfig] = useState(false);

  // Connect to SSE stream when a job starts
  const connectToJobStream = useCallback((jobId: string) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setActiveJobId(jobId);
    setJobLogs([]);
    setJobProgress(null);

    const eventSource = new EventSource(`${API_BASE_URL}/api/duelogic/research/jobs/${jobId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.event as string;
        const payload = data.data;
        const timestamp = data.timestamp;

        // Create log entry based on event type
        let logEntry: ResearchLogEntry | null = null;

        switch (eventType) {
          case 'research_connected':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: 'Connected to research job stream',
            };
            break;

          case 'research_started':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Starting research: ${payload.configName}`,
              details: { categories: payload.categories },
            };
            break;

          case 'research_log':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: payload.level,
              message: payload.message,
              details: payload.details,
            };
            break;

          case 'research_category_start':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Researching category ${payload.categoryIndex}/${payload.totalCategories}: ${payload.category}`,
            };
            break;

          case 'research_category_complete':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Completed ${payload.category}: found ${payload.topicsFound} topics`,
            };
            break;

          case 'research_topic_found':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Found topic: ${payload.topic}`,
              details: { sources: payload.sourceCount },
            };
            break;

          case 'research_topic_scored':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: payload.passedThreshold ? 'info' : 'debug',
              message: `Scored: controversy=${payload.controversyScore.toFixed(2)}, timeliness=${payload.timeliness.toFixed(2)}, depth=${payload.depth.toFixed(2)}`,
            };
            break;

          case 'episode_generating':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Generating episode for: ${payload.topic}`,
            };
            break;

          case 'episode_generated':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Episode created: "${payload.title}"`,
            };
            break;

          case 'research_progress':
            setJobProgress({
              categoriesCompleted: payload.categoriesCompleted,
              totalCategories: payload.totalCategories,
              topicsFound: payload.topicsFound,
              episodesGenerated: payload.episodesGenerated,
            });
            break;

          case 'research_complete':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'info',
              message: `Research complete! Topics: ${payload.topicsDiscovered}, Episodes: ${payload.episodesGenerated}`,
            };
            setRunningJob(false);
            fetchDashboard();
            // Close connection after completion
            setTimeout(() => {
              eventSource.close();
            }, 1000);
            break;

          case 'research_failed':
            logEntry = {
              id: crypto.randomUUID(),
              timestamp,
              event: eventType,
              level: 'error',
              message: `Research failed: ${payload.error}`,
            };
            setRunningJob(false);
            fetchDashboard();
            break;
        }

        if (logEntry) {
          setJobLogs(prev => [...prev, logEntry!]);
          // Auto-scroll to bottom
          if (logContainerRef.current) {
            setTimeout(() => {
              logContainerRef.current?.scrollTo({
                top: logContainerRef.current.scrollHeight,
                behavior: 'smooth',
              });
            }, 50);
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };
  }, [fetchDashboard]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const [statsRes, jobsRes, proposalsRes, configsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/duelogic/dashboard/stats`),
        fetch(`${API_BASE_URL}/api/duelogic/research/jobs?limit=5`),
        fetch(`${API_BASE_URL}/api/duelogic/proposals?status=pending`),
        fetch(`${API_BASE_URL}/api/duelogic/research/configs`),
      ]);

      if (!statsRes.ok || !jobsRes.ok || !proposalsRes.ok || !configsRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [statsData, jobsData, proposalsData, configsData] = await Promise.all([
        statsRes.json(),
        jobsRes.json(),
        proposalsRes.json(),
        configsRes.json(),
      ]);

      setStats(statsData);
      setRecentJobs(jobsData);
      setPendingProposals(proposalsData.slice(0, 5));
      setConfigs(configsData);
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

  const handleRunJob = async (configId?: string) => {
    setRunningJob(true);
    setJobLogs([]);
    setJobProgress(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/research/jobs/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configId ? { configId } : {}),
      });

      if (response.ok) {
        const job = await response.json();
        setActionMessage({ type: 'success', text: 'Research job started - see logs below' });
        // Connect to SSE stream for this job
        connectToJobStream(job.id);
      } else {
        const data = await response.json();
        setActionMessage({ type: 'error', text: data.error || 'Failed to start job' });
        setRunningJob(false);
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to start research job' });
      setRunningJob(false);
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfig.name.trim()) {
      setActionMessage({ type: 'error', text: 'Please enter a configuration name' });
      return;
    }
    if (newConfig.categories.length === 0) {
      setActionMessage({ type: 'error', text: 'Please select at least one category' });
      return;
    }

    setCreatingConfig(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/research/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newConfig.name,
          schedule: '0 8 * * *', // Default: daily at 8am
          enabled: true,
          categories: newConfig.categories,
          perplexityModel: 'perplexity/sonar-pro',
          maxTopicsPerRun: newConfig.maxTopicsPerRun,
          minControversyScore: newConfig.minControversyScore,
        }),
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Research configuration created!' });
        setShowNewConfig(false);
        setNewConfig({
          name: '',
          categories: ['technology_ethics', 'ai_automation'],
          maxTopicsPerRun: 10,
          minControversyScore: 0.6,
        });
        fetchDashboard();
      } else {
        const data = await response.json();
        setActionMessage({ type: 'error', text: data.error || 'Failed to create config' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to create configuration' });
    } finally {
      setCreatingConfig(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/duelogic/research/configs/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setActionMessage({ type: 'success', text: 'Configuration deleted' });
        fetchDashboard();
      } else {
        setActionMessage({ type: 'error', text: 'Failed to delete configuration' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed to delete configuration' });
    }
    setTimeout(() => setActionMessage(null), 5000);
  };

  const toggleCategory = (cat: ResearchCategory) => {
    setNewConfig(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }));
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

      {/* Research Configurations */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Research Configurations</h2>
          <Button
            onClick={() => setShowNewConfig(!showNewConfig)}
            variant="secondary"
            size="sm"
          >
            {showNewConfig ? 'Cancel' : '+ New Config'}
          </Button>
        </div>

        {showNewConfig && (
          <form onSubmit={handleCreateConfig} className={styles.newConfigForm}>
            <div className={styles.formGroup}>
              <label htmlFor="configName">Configuration Name</label>
              <input
                id="configName"
                type="text"
                value={newConfig.name}
                onChange={e => setNewConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Daily Tech & AI Research"
                className={styles.input}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Categories to Research</label>
              <div className={styles.categoryGrid}>
                {ALL_CATEGORIES.map(cat => (
                  <label key={cat} className={styles.categoryCheckbox}>
                    <input
                      type="checkbox"
                      checked={newConfig.categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <span>{CATEGORY_LABELS[cat]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="maxTopics">Max Topics Per Run</label>
                <input
                  id="maxTopics"
                  type="number"
                  min="1"
                  max="50"
                  value={newConfig.maxTopicsPerRun}
                  onChange={e => setNewConfig(prev => ({ ...prev, maxTopicsPerRun: parseInt(e.target.value) || 10 }))}
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="minControversy">Min Controversy Score</label>
                <input
                  id="minControversy"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newConfig.minControversyScore}
                  onChange={e => setNewConfig(prev => ({ ...prev, minControversyScore: parseFloat(e.target.value) || 0.6 }))}
                  className={styles.input}
                />
              </div>
            </div>

            <Button type="submit" variant="primary" loading={creatingConfig}>
              Create Configuration
            </Button>
          </form>
        )}

        {configs.length > 0 ? (
          <div className={styles.configList}>
            {configs.map(config => (
              <div key={config.id} className={styles.configCard}>
                <div className={styles.configInfo}>
                  <h3 className={styles.configName}>{config.name}</h3>
                  <p className={styles.configMeta}>
                    {config.categories.length} categories · Max {config.maxTopicsPerRun} topics ·
                    Min controversy: {config.minControversyScore}
                  </p>
                  <div className={styles.configCategories}>
                    {config.categories.slice(0, 3).map(cat => (
                      <span key={cat} className={styles.categoryTag}>
                        {CATEGORY_LABELS[cat]}
                      </span>
                    ))}
                    {config.categories.length > 3 && (
                      <span className={styles.categoryTag}>+{config.categories.length - 3} more</span>
                    )}
                  </div>
                </div>
                <div className={styles.configActions}>
                  <Button
                    onClick={() => handleRunJob(config.id)}
                    variant="primary"
                    size="sm"
                    loading={runningJob}
                  >
                    Run Now
                  </Button>
                  <Button
                    onClick={() => handleDeleteConfig(config.id)}
                    variant="secondary"
                    size="sm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : !showNewConfig ? (
          <div className={styles.noConfigMessage}>
            <p>No research configurations yet.</p>
            <p>Create a configuration to start discovering debate topics automatically.</p>
            <Button onClick={() => setShowNewConfig(true)} variant="primary">
              Create Your First Configuration
            </Button>
          </div>
        ) : null}
      </section>

      {/* Active Job Log */}
      {(activeJobId || jobLogs.length > 0) && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Research Job Log
              {activeJobId && <span className={styles.jobIdBadge}>{activeJobId.slice(0, 8)}</span>}
            </h2>
            {jobProgress && (
              <div className={styles.progressInfo}>
                <span>Categories: {jobProgress.categoriesCompleted}/{jobProgress.totalCategories}</span>
                <span>Topics: {jobProgress.topicsFound}</span>
                <span>Episodes: {jobProgress.episodesGenerated}</span>
              </div>
            )}
          </div>

          <div ref={logContainerRef} className={styles.logContainer}>
            {jobLogs.length === 0 ? (
              <div className={styles.logEmpty}>Waiting for events...</div>
            ) : (
              jobLogs.map(log => (
                <div
                  key={log.id}
                  className={`${styles.logEntry} ${styles[`logLevel${log.level?.charAt(0).toUpperCase()}${log.level?.slice(1)}`] || ''}`}
                >
                  <span className={styles.logTime}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={styles.logLevel}>{log.level?.toUpperCase() || 'INFO'}</span>
                  <span className={styles.logMessage}>{log.message}</span>
                </div>
              ))
            )}
          </div>

          {!runningJob && jobLogs.length > 0 && (
            <Button
              onClick={() => {
                setJobLogs([]);
                setActiveJobId(null);
                setJobProgress(null);
              }}
              variant="secondary"
              size="sm"
              className={styles.clearLogsBtn}
            >
              Clear Log
            </Button>
          )}
        </section>
      )}

      {/* Recent Research Jobs */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Research Jobs</h2>
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
          <p className={styles.noData}>No research jobs yet. Create a configuration and run your first research job!</p>
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
