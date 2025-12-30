/**
 * AdminExportsPage
 *
 * Admin page for managing debate exports - start new exports, track progress, download completed.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Alert } from '../components/ui';
import styles from './AdminExportsPage.module.css';

interface ExportJob {
  id: string;
  debateId: string;
  jobType: 'audio' | 'video' | 'markdown' | 'pdf';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stage: string | null;
  outputUrl: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  error: string | null;
  provider: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface Debate {
  id: string;
  propositionText: string;
  status: string;
}

interface ExportJobsResponse {
  jobs: ExportJob[];
  count: number;
  total: number;
  counts: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
  };
}

interface TTSProvider {
  id: string;
  name: string;
  available: boolean;
  requiresApiKey: boolean;
  envVar?: string;
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';
type FormatFilter = 'all' | 'audio' | 'markdown' | 'pdf' | 'video';

export function AdminExportsPage() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [counts, setCounts] = useState({ pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New export modal state
  const [showNewExport, setShowNewExport] = useState(false);
  const [debates, setDebates] = useState<Debate[]>([]);
  const [selectedDebateId, setSelectedDebateId] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<'markdown' | 'audio'>('markdown');
  const [providers, setProviders] = useState<TTSProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (formatFilter !== 'all') params.set('jobType', formatFilter);
      params.set('limit', '100');

      const response = await fetch(`${API_BASE_URL}/api/admin/export-jobs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch export jobs');
      const data: ExportJobsResponse = await response.json();

      setJobs(data.jobs);
      setCounts(data.counts);
      setError(null);
    } catch (err) {
      console.error('Error fetching export jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load export jobs');
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL, statusFilter, formatFilter]);

  const fetchDebates = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/debates?status=completed&limit=50`);
      if (!response.ok) throw new Error('Failed to fetch debates');
      const data = await response.json();
      setDebates(data.debates);
    } catch (err) {
      console.error('Error fetching debates:', err);
    }
  }, [API_BASE_URL]);

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/exports/audio/providers`);
      if (!response.ok) throw new Error('Failed to fetch providers');
      const data = await response.json();
      setProviders(data.providers);
      if (data.defaultProvider) {
        setSelectedProvider(data.defaultProvider);
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh for active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    if (hasActiveJobs) {
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchJobs, jobs]);

  const handleStartExport = async () => {
    if (!selectedDebateId) return;

    setExportLoading(true);
    try {
      let response: Response;

      if (selectedFormat === 'markdown') {
        // Markdown export is synchronous - download directly
        response = await fetch(`${API_BASE_URL}/api/exports/${selectedDebateId}/markdown?download=true`);
        if (!response.ok) throw new Error('Failed to export markdown');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debate-${selectedDebateId}.md`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setActionMessage({ type: 'success', text: 'Markdown downloaded successfully!' });
      } else if (selectedFormat === 'audio') {
        // Audio export is async - start job
        response = await fetch(`${API_BASE_URL}/api/exports/${selectedDebateId}/audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: selectedProvider }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to start audio export');
        }

        const data = await response.json();
        setActionMessage({ type: 'success', text: `Audio export started (Job: ${data.jobId})` });
        fetchJobs();
      }

      setShowNewExport(false);
      setSelectedDebateId('');
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setExportLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleDownload = async (job: ExportJob) => {
    if (job.jobType === 'audio' && job.status === 'completed') {
      window.open(`${API_BASE_URL}/api/exports/audio/${job.id}/download`, '_blank');
    } else if (job.jobType === 'markdown') {
      window.open(`${API_BASE_URL}/api/exports/${job.debateId}/markdown?download=true`, '_blank');
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Delete all completed/failed export jobs older than 24 hours?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/export-jobs/cleanup?maxAgeHours=24`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (response.ok) {
        setActionMessage({ type: 'success', text: `Cleaned up ${data.deletedCount} old jobs` });
        fetchJobs();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Cleanup failed' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Cleanup failed' });
    } finally {
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const openNewExportModal = () => {
    fetchDebates();
    fetchProviders();
    setShowNewExport(true);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusClass = (status: string): string => {
    const map: Record<string, string> = {
      pending: styles.statusPending,
      processing: styles.statusProcessing,
      completed: styles.statusCompleted,
      failed: styles.statusFailed,
      cancelled: styles.statusCancelled,
    };
    return map[status] || '';
  };

  const getFormatIcon = (format: string): string => {
    const map: Record<string, string> = {
      audio: '🎧',
      markdown: '📝',
      pdf: '📄',
      video: '🎬',
    };
    return map[format] || '📁';
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
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Export Center</h1>
          <p className={styles.subtitle}>
            {counts.total} export job{counts.total !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="primary" onClick={openNewExportModal}>
            + New Export
          </Button>
          <Button variant="ghost" onClick={handleCleanup}>
            Cleanup Old Jobs
          </Button>
        </div>
      </header>

      {actionMessage && (
        <Alert variant={actionMessage.type} className={styles.actionAlert}>
          {actionMessage.text}
        </Alert>
      )}

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{counts.pending}</div>
          <div className={styles.statLabel}>Pending</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.processing}`}>{counts.processing}</div>
          <div className={styles.statLabel}>Processing</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.completed}`}>{counts.completed}</div>
          <div className={styles.statLabel}>Completed</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.failed}`}>{counts.failed}</div>
          <div className={styles.statLabel}>Failed</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Status:</span>
          <div className={styles.filters}>
            {(['all', 'pending', 'processing', 'completed', 'failed'] as StatusFilter[]).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Format:</span>
          <div className={styles.filters}>
            {(['all', 'audio', 'markdown'] as FormatFilter[]).map((format) => (
              <Button
                key={format}
                variant={formatFilter === format ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setFormatFilter(format)}
              >
                {format === 'all' ? 'All' : format.charAt(0).toUpperCase() + format.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchJobs}>
          Refresh
        </Button>
      </div>

      {/* Jobs Table */}
      {isLoading ? (
        <div className={styles.loading}>Loading export jobs...</div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : jobs.length === 0 ? (
        <div className={styles.noData}>
          {statusFilter !== 'all' || formatFilter !== 'all'
            ? 'No export jobs match your filters'
            : 'No export jobs yet. Start a new export above!'}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Format</th>
                <th>Debate</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Size</th>
                <th>Duration</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className={styles.formatBadge}>
                      {getFormatIcon(job.jobType)} {job.jobType}
                    </span>
                  </td>
                  <td>
                    <Link to={`/debates/${job.debateId}`} className={styles.debateLink}>
                      {job.debateId.substring(0, 8)}...
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.status} ${getStatusClass(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td>
                    {job.status === 'processing' ? (
                      <div className={styles.progressWrapper}>
                        <div className={styles.progressBar}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className={styles.progressText}>{job.progress}%</span>
                      </div>
                    ) : job.status === 'completed' ? (
                      '100%'
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className={styles.size}>{formatFileSize(job.fileSizeBytes)}</td>
                  <td className={styles.duration}>{formatDuration(job.durationSeconds)}</td>
                  <td className={styles.date}>{formatDate(job.createdAt)}</td>
                  <td className={styles.actions}>
                    {job.status === 'completed' && (
                      <button onClick={() => handleDownload(job)} className={styles.downloadBtn}>
                        Download
                      </button>
                    )}
                    {job.status === 'failed' && job.error && (
                      <span className={styles.errorHint} title={job.error}>
                        View Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Export Modal */}
      {showNewExport && (
        <div className={styles.modalOverlay} onClick={() => setShowNewExport(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New Export</h2>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Select Debate</label>
              <select
                value={selectedDebateId}
                onChange={(e) => setSelectedDebateId(e.target.value)}
                className={styles.select}
              >
                <option value="">-- Select a completed debate --</option>
                {debates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.propositionText.substring(0, 60)}...
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Export Format</label>
              <div className={styles.formatOptions}>
                <label className={`${styles.formatOption} ${selectedFormat === 'markdown' ? styles.selected : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="markdown"
                    checked={selectedFormat === 'markdown'}
                    onChange={() => setSelectedFormat('markdown')}
                  />
                  <span className={styles.formatIcon}>📝</span>
                  <span>Markdown</span>
                </label>
                <label className={`${styles.formatOption} ${selectedFormat === 'audio' ? styles.selected : ''}`}>
                  <input
                    type="radio"
                    name="format"
                    value="audio"
                    checked={selectedFormat === 'audio'}
                    onChange={() => setSelectedFormat('audio')}
                  />
                  <span className={styles.formatIcon}>🎧</span>
                  <span>Audio (Podcast)</span>
                </label>
              </div>
            </div>

            {selectedFormat === 'audio' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>TTS Provider</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className={styles.select}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.available}>
                      {p.name} {!p.available && '(Not Available)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={() => setShowNewExport(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleStartExport}
                disabled={!selectedDebateId || exportLoading}
                loading={exportLoading}
              >
                {selectedFormat === 'markdown' ? 'Download' : 'Start Export'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminExportsPage;
