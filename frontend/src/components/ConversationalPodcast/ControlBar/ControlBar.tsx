/**
 * ControlBar - Bottom control panel for conversation flow management
 * Provides controls for advancing, pausing, flow mode, and export
 */

import { useState } from 'react';
import styles from './ControlBar.module.css';
import type { SessionStatus, FlowMode } from '../../../types/conversation';

interface ControlBarProps {
  status: SessionStatus;
  flowMode: FlowMode;
  onAdvance: () => void;
  onPause: () => void;
  onResume: () => void;
  onFlowModeChange: (mode: FlowMode, paceDelayMs?: number) => void;
  onExport: () => void;
  onPodcastExport: () => void;
  onRestart: () => void;
  turnCount: number;
}

const FLOW_MODE_OPTIONS: Array<{ value: FlowMode; label: string; icon: string }> = [
  { value: 'manual', label: 'Manual', icon: '👆' },
  { value: 'auto_stream', label: 'Auto', icon: '▶️' },
  { value: 'natural_pace', label: 'Natural', icon: '🎙️' },
];

export function ControlBar({
  status,
  flowMode,
  onAdvance,
  onPause,
  onResume,
  onFlowModeChange,
  onExport,
  onPodcastExport,
  onRestart,
  turnCount,
}: ControlBarProps) {
  const [paceDelayMs, setPaceDelayMs] = useState(3000);

  const isLive = status === 'live';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const canControl = isLive || isPaused;

  const handleFlowModeChange = (mode: FlowMode) => {
    onFlowModeChange(mode, mode === 'natural_pace' ? paceDelayMs : undefined);
  };

  const handlePaceChange = (delay: number) => {
    setPaceDelayMs(delay);
    if (flowMode === 'natural_pace') {
      onFlowModeChange('natural_pace', delay);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.leftSection}>
        {/* Turn Counter */}
        <div className={styles.turnCounter}>
          <span className={styles.turnLabel}>Turn</span>
          <span className={styles.turnValue}>{turnCount}</span>
        </div>

        {/* Status Indicator */}
        <div className={`${styles.statusIndicator} ${styles[status]}`}>
          {status === 'live' && <span className={styles.liveDot} />}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </div>
      </div>

      <div className={styles.centerSection}>
        {/* Advance Button (Manual Mode) */}
        {canControl && flowMode === 'manual' && (
          <button
            className={styles.advanceButton}
            onClick={onAdvance}
            disabled={!isLive}
          >
            <span className={styles.advanceIcon}>→</span>
            Next
          </button>
        )}

        {/* Pause/Resume Button */}
        {canControl && (
          <button
            className={`${styles.controlButton} ${isPaused ? styles.resumeButton : styles.pauseButton}`}
            onClick={isPaused ? onResume : onPause}
          >
            {isPaused ? (
              <>
                <span className={styles.icon}>▶</span>
                Resume
              </>
            ) : (
              <>
                <span className={styles.icon}>⏸</span>
                Pause
              </>
            )}
          </button>
        )}

        {/* Flow Mode Selector */}
        {canControl && (
          <div className={styles.flowModeSelector}>
            {FLOW_MODE_OPTIONS.map(option => (
              <button
                key={option.value}
                className={`${styles.flowModeOption} ${flowMode === option.value ? styles.active : ''}`}
                onClick={() => handleFlowModeChange(option.value)}
                title={option.label}
              >
                <span className={styles.flowModeIcon}>{option.icon}</span>
                <span className={styles.flowModeLabel}>{option.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Pace Slider (Natural Pace Mode) */}
        {canControl && flowMode === 'natural_pace' && (
          <div className={styles.paceControl}>
            <label className={styles.paceLabel}>
              Pace: {(paceDelayMs / 1000).toFixed(1)}s
            </label>
            <input
              type="range"
              min={500}
              max={10000}
              step={500}
              value={paceDelayMs}
              onChange={e => handlePaceChange(parseInt(e.target.value))}
              className={styles.paceSlider}
            />
          </div>
        )}
      </div>

      <div className={styles.rightSection}>
        {/* Restart Button */}
        <button
          className={styles.restartButton}
          onClick={onRestart}
          disabled={turnCount === 0}
          title="Restart conversation from the beginning"
        >
          <span className={styles.icon}>↺</span>
          Restart
        </button>

        {/* Export Markdown Button */}
        <button
          className={styles.exportButton}
          onClick={onExport}
          disabled={turnCount === 0}
          title="Export as Markdown"
        >
          <span className={styles.icon}>📄</span>
          Markdown
        </button>

        {/* Podcast Export Button */}
        <button
          className={`${styles.exportButton} ${styles.podcastButton}`}
          onClick={onPodcastExport}
          disabled={turnCount === 0 || status !== 'completed'}
          title={status !== 'completed' ? 'Complete the conversation first' : 'Export as Podcast'}
        >
          <span className={styles.icon}>🎙️</span>
          Podcast
        </button>

        {/* Completed Message */}
        {isCompleted && (
          <div className={styles.completedMessage}>
            Conversation Complete
          </div>
        )}
      </div>
    </div>
  );
}

export default ControlBar;
