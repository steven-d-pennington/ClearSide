/**
 * GenerationProgress Component
 *
 * Displays podcast generation progress with phase indicators,
 * error handling, and download functionality.
 */

import React from 'react';
import { Button } from '../ui';
import type { PipelineProgress } from '../../types/podcast';
import styles from './GenerationProgress.module.css';

interface GenerationProgressProps {
  progress: PipelineProgress;
  error?: string;
  audioUrl?: string;
  actualCost?: number;
  onDownload: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export function GenerationProgress({
  progress,
  error,
  audioUrl,
  actualCost,
  onDownload,
  onRetry,
  onClose,
}: GenerationProgressProps) {
  const isComplete = progress.phase === 'complete';
  const hasError = progress.phase === 'error' || !!error;

  return (
    <div className={styles.container}>
      {/* Status Icon */}
      <div className={styles.statusIcon}>
        {isComplete && (
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={styles.successIcon}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        )}
        {hasError && (
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={styles.errorIcon}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        {!isComplete && !hasError && (
          <div className={styles.spinner}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Status Title */}
      <h3 className={styles.title}>
        {isComplete && 'Podcast Ready!'}
        {hasError && 'Generation Failed'}
        {!isComplete && !hasError && 'Generating Podcast...'}
      </h3>

      {/* Status Message */}
      <p className={styles.message}>{progress.message}</p>

      {/* Progress Bar */}
      {!isComplete && !hasError && (
        <div className={styles.progressSection}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
          <div className={styles.progressDetails}>
            <span className={styles.phase}>{formatPhase(progress.phase)}</span>
            {progress.currentSegment && progress.totalSegments && (
              <span className={styles.segments}>
                Segment {progress.currentSegment} of {progress.totalSegments}
              </span>
            )}
            <span className={styles.percent}>{progress.percentComplete}%</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {hasError && (
        <div className={styles.errorBox}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error || progress.message}</span>
        </div>
      )}

      {/* Success Info */}
      {isComplete && actualCost !== undefined && (
        <div className={styles.successBox}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span>
            Generation cost: <strong>${(actualCost / 100).toFixed(2)}</strong>
          </span>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        {isComplete && (
          <>
            <Button variant="primary" onClick={onDownload} className={styles.downloadButton}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Podcast
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {hasError && (
          <>
            <Button variant="primary" onClick={onRetry}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Try Again
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Format phase name for display
 */
function formatPhase(phase: string): string {
  const phaseLabels: Record<string, string> = {
    idle: 'Ready',
    initializing: 'Initializing',
    generating: 'Generating Audio',
    concatenating: 'Combining Segments',
    normalizing: 'Normalizing Volume',
    tagging: 'Adding Metadata',
    complete: 'Complete',
    error: 'Error',
  };
  return phaseLabels[phase] || phase;
}

export default GenerationProgress;
