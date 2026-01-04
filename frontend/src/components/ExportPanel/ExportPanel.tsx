/**
 * ExportPanel Component
 *
 * Allows users to export completed debates to various formats.
 * Supports Markdown and Audio (with multiple TTS provider options).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Badge, Alert } from '../ui';
import { TTSProviderSelector } from './TTSProviderSelector';
import { PodcastExportModal } from '../PodcastExport';
import type {
  ExportFormat,
  TTSProvider,
  TTSProviderInfo,
  AudioExportJob,
  AudioExportOptions,
  ProvidersResponse,
} from '../../types/export';
import styles from './ExportPanel.module.css';

// Extended export format to include podcast
type ExtendedExportFormat = ExportFormat | 'podcast';

interface ExportPanelProps {
  debateId: string;
  debateTitle?: string;
  className?: string;
  onExportComplete?: (format: ExportFormat, url: string) => void;
}

// API base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const ExportPanel: React.FC<ExportPanelProps> = ({
  debateId,
  debateTitle = 'Debate',
  className = '',
  onExportComplete,
}) => {
  // State
  const [selectedFormat, setSelectedFormat] = useState<ExtendedExportFormat>('markdown');
  const [isPodcastModalOpen, setIsPodcastModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<TTSProvider>('edge');
  const [providers, setProviders] = useState<TTSProviderInfo[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<TTSProvider>('edge');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<AudioExportJob | null>(null);

  // Audio export options
  const [audioOptions, setAudioOptions] = useState<AudioExportOptions>({
    format: 'mp3',
    includeIntroOutro: true,
    normalizeAudio: true,
    includeBackgroundMusic: false,
    voiceSpeed: 1.0,
  });

  // Fetch available TTS providers on mount
  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/exports/audio/providers`);
        if (res.ok) {
          const data: ProvidersResponse = await res.json();
          setProviders(data.providers);
          setDefaultProvider(data.defaultProvider);
          setSelectedProvider(data.defaultProvider);
        }
      } catch (err) {
        console.error('Failed to fetch TTS providers:', err);
      }
    }
    fetchProviders();
  }, []);

  // Poll for job status when there's an active job
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/exports/audio/${currentJob.jobId}/status`);
        if (res.ok) {
          const job: AudioExportJob = await res.json();
          setCurrentJob(job);

          if (job.status === 'completed' && job.downloadUrl) {
            onExportComplete?.('audio', job.downloadUrl);
          }
        }
      } catch (err) {
        console.error('Failed to poll job status:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentJob, onExportComplete]);

  // Export handlers
  const handleMarkdownExport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/api/exports/${debateId}/markdown?download=true`;
      window.open(url, '_blank');
      onExportComplete?.('markdown', url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsLoading(false);
    }
  }, [debateId, onExportComplete]);

  const handleAudioExport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCurrentJob(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/exports/${debateId}/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          ...audioOptions,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Export failed');
      }

      setCurrentJob({
        jobId: data.jobId,
        debateId: data.debateId,
        provider: data.provider,
        status: 'pending',
        progress: 0,
        stage: 'Starting...',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsLoading(false);
    }
  }, [debateId, selectedProvider, audioOptions]);

  const handleExport = useCallback(() => {
    if (selectedFormat === 'markdown') {
      handleMarkdownExport();
    } else if (selectedFormat === 'audio') {
      handleAudioExport();
    } else if (selectedFormat === 'podcast') {
      setIsPodcastModalOpen(true);
    }
  }, [selectedFormat, handleMarkdownExport, handleAudioExport]);

  const handleDownload = useCallback(() => {
    if (currentJob?.downloadUrl) {
      window.open(`${API_BASE_URL}${currentJob.downloadUrl}`, '_blank');
    }
  }, [currentJob]);

  // Render job progress
  const renderJobProgress = () => {
    if (!currentJob) return null;

    return (
      <div className={styles.jobProgress}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>{currentJob.stage}</span>
          <Badge
            variant={
              currentJob.status === 'completed'
                ? 'success'
                : currentJob.status === 'failed'
                  ? 'error'
                  : 'primary'
            }
          >
            {currentJob.status === 'processing'
              ? `${currentJob.progress}%`
              : currentJob.status}
          </Badge>
        </div>

        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${currentJob.progress}%` }}
          />
        </div>

        {currentJob.status === 'completed' && (
          <div className={styles.downloadSection}>
            <p className={styles.completeMessage}>
              Export complete! {currentJob.durationSeconds && (
                <span>Duration: {Math.round(currentJob.durationSeconds / 60)} min</span>
              )}
            </p>
            <Button variant="primary" onClick={handleDownload}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download MP3
            </Button>
          </div>
        )}

        {currentJob.status === 'failed' && (
          <Alert variant="error" className={styles.errorAlert}>
            {currentJob.error || 'Export failed. Please try again.'}
          </Alert>
        )}
      </div>
    );
  };

  return (
    <Card className={`${styles.exportPanel} ${className}`} padding="md">
      <h3 className={styles.title}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Export Debate
      </h3>

      {error && (
        <Alert variant="error" className={styles.errorAlert}>
          {error}
        </Alert>
      )}

      {/* Format Selection */}
      <div className={styles.formatSection}>
        <label className={styles.sectionLabel}>Format</label>
        <div className={styles.formatButtons}>
          <button
            className={`${styles.formatButton} ${selectedFormat === 'markdown' ? styles.active : ''}`}
            onClick={() => setSelectedFormat('markdown')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Markdown</span>
          </button>

          <button
            className={`${styles.formatButton} ${selectedFormat === 'audio' ? styles.active : ''}`}
            onClick={() => setSelectedFormat('audio')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <span>Audio</span>
          </button>

          <button
            className={`${styles.formatButton} ${selectedFormat === 'podcast' ? styles.active : ''}`}
            onClick={() => setSelectedFormat('podcast')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="10" r="3" />
              <path d="M12 2a8 8 0 0 0-8 8c0 1.892.402 3.13 1.5 4.5L12 22l6.5-7.5c1.098-1.37 1.5-2.608 1.5-4.5a8 8 0 0 0-8-8z" />
              <path d="M7 10a5 5 0 0 1 5-5" />
              <path d="M17 10a5 5 0 0 0-5-5" />
            </svg>
            <span>Podcast</span>
          </button>

          <button
            className={`${styles.formatButton} ${styles.disabled}`}
            disabled
            title="Coming soon"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>PDF</span>
            <Badge variant="secondary" className={styles.comingSoon}>Soon</Badge>
          </button>
        </div>
      </div>

      {/* Audio Options */}
      {selectedFormat === 'audio' && (
        <div className={styles.audioOptions}>
          <TTSProviderSelector
            providers={providers}
            selectedProvider={selectedProvider}
            onSelectProvider={setSelectedProvider}
            defaultProvider={defaultProvider}
          />

          <div className={styles.optionGroup}>
            <label className={styles.optionLabel}>
              <input
                type="checkbox"
                checked={audioOptions.includeIntroOutro}
                onChange={(e) =>
                  setAudioOptions({ ...audioOptions, includeIntroOutro: e.target.checked })
                }
              />
              Include intro and outro
            </label>

            <label className={styles.optionLabel}>
              <input
                type="checkbox"
                checked={audioOptions.normalizeAudio}
                onChange={(e) =>
                  setAudioOptions({ ...audioOptions, normalizeAudio: e.target.checked })
                }
              />
              Normalize audio levels
            </label>
          </div>
        </div>
      )}

      {/* Job Progress */}
      {renderJobProgress()}

      {/* Export Button */}
      {(!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') && (
        <Button
          variant="primary"
          className={styles.exportButton}
          onClick={handleExport}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} />
              Exporting...
            </>
          ) : selectedFormat === 'podcast' ? (
            'Create Podcast'
          ) : (
            <>
              Export as {selectedFormat === 'markdown' ? 'Markdown' : 'Audio'}
            </>
          )}
        </Button>
      )}

      {/* Podcast Export Modal */}
      <PodcastExportModal
        debateId={debateId}
        debateTitle={debateTitle}
        isOpen={isPodcastModalOpen}
        onClose={() => setIsPodcastModalOpen(false)}
      />
    </Card>
  );
};

export default ExportPanel;
