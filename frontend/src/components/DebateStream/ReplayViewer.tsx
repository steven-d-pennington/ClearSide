/**
 * ReplayViewer Component
 *
 * Step-through transcript viewer for completed debates.
 * Shows one turn at a time with navigation controls and keyboard support.
 * Displays interruption context for lively debates.
 */

import { useState, useCallback, useEffect } from 'react';
import { Button, Card, Badge } from '../ui';
import type { DebateTurn } from '../../types/debate';
import { Speaker, DebatePhase } from '../../types/debate';
import styles from './ReplayViewer.module.css';

interface ReplayViewerProps {
  turns: DebateTurn[];
  onExit?: () => void;
}

/**
 * Get display name for speaker
 */
function getSpeakerName(speaker: Speaker): string {
  switch (speaker) {
    case Speaker.PRO:
      return 'Pro Advocate';
    case Speaker.CON:
      return 'Con Advocate';
    case Speaker.MODERATOR:
      return 'Moderator';
    default:
      return speaker;
  }
}

/**
 * Get display name for phase
 */
function getPhaseName(phase: DebatePhase): string {
  const phaseNames: Record<string, string> = {
    [DebatePhase.OPENING]: 'Opening Statements',
    [DebatePhase.CONSTRUCTIVE]: 'Evidence Presentation',
    [DebatePhase.CROSSEXAM]: 'Clarifying Questions',
    [DebatePhase.REBUTTAL]: 'Rebuttals',
    [DebatePhase.CLOSING]: 'Closing Statements',
    [DebatePhase.SYNTHESIS]: 'Moderator Synthesis',
    [DebatePhase.COMPLETED]: 'Completed',
  };
  return phaseNames[phase] || phase;
}

/**
 * Get speaker color class
 */
function getSpeakerColorClass(speaker: Speaker): string {
  switch (speaker) {
    case Speaker.PRO:
      return styles.speakerPro;
    case Speaker.CON:
      return styles.speakerCon;
    case Speaker.MODERATOR:
      return styles.speakerModerator;
    default:
      return '';
  }
}

export function ReplayViewer({ turns, onExit }: ReplayViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentTurn = turns[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < turns.length - 1;

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (hasPrevious) {
      setCurrentIndex((i) => i - 1);
    }
  }, [hasPrevious]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex((i) => i + 1);
    }
  }, [hasNext]);

  const goToStart = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  const goToEnd = useCallback(() => {
    setCurrentIndex(turns.length - 1);
  }, [turns.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          goToNext();
          break;
        case 'Home':
          e.preventDefault();
          goToStart();
          break;
        case 'End':
          e.preventDefault();
          goToEnd();
          break;
        case 'Escape':
          if (onExit) {
            onExit();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, goToStart, goToEnd, onExit]);

  if (!currentTurn) {
    return (
      <div className={styles.empty}>
        <p>No turns to display</p>
        {onExit && (
          <Button variant="ghost" onClick={onExit}>
            Exit Replay
          </Button>
        )}
      </div>
    );
  }

  // Extract interruption metadata
  const metadata = currentTurn.metadata || {};
  const wasInterrupted = metadata.wasInterrupted as boolean | undefined;
  const isInterjection = metadata.isInterjection as boolean | undefined;
  const interruptedBy = metadata.interruptedBy as string | undefined;
  const interruptionEnergy = metadata.interruptionEnergy as number | undefined;

  // Calculate progress percentage
  const progressPercent = ((currentIndex + 1) / turns.length) * 100;

  return (
    <div className={styles.container}>
      {/* Progress Bar */}
      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className={styles.progressText}>
          {currentIndex + 1} of {turns.length}
        </span>
      </div>

      {/* Phase Indicator */}
      <div className={styles.phaseIndicator}>
        <Badge variant="secondary">{getPhaseName(currentTurn.phase)}</Badge>
      </div>

      {/* Featured Turn Card */}
      <Card className={`${styles.turnCard} ${getSpeakerColorClass(currentTurn.speaker)}`}>
        <div className={styles.turnHeader}>
          <span className={styles.speakerName}>
            {getSpeakerName(currentTurn.speaker)}
          </span>

          {/* Interruption indicators */}
          {wasInterrupted && (
            <Badge variant="warning" className={styles.interruptedBadge}>
              INTERRUPTED
              {interruptedBy && ` by ${getSpeakerName(interruptedBy as Speaker)}`}
            </Badge>
          )}

          {isInterjection && (
            <Badge variant="primary" className={styles.interjectionBadge}>
              Interjection
              {interruptionEnergy && interruptionEnergy >= 4 && ' (High Energy)'}
            </Badge>
          )}
        </div>

        <div className={styles.turnContent}>
          {currentTurn.content}
          {wasInterrupted && <span className={styles.cutoff}>—</span>}
        </div>

        <div className={styles.turnMeta}>
          <span className={styles.turnNumber}>Turn {currentTurn.turnNumber + 1}</span>
          {currentTurn.timestamp && (
            <span className={styles.timestamp}>
              {new Date(currentTurn.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </Card>

      {/* Navigation Controls */}
      <div className={styles.navigation}>
        <div className={styles.navGroup}>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToStart}
            disabled={!hasPrevious}
            aria-label="Go to first turn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 19l-7-7 7-7" />
              <path d="M18 19l-7-7 7-7" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            onClick={goToPrevious}
            disabled={!hasPrevious}
            aria-label="Previous turn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </Button>
        </div>

        <div className={styles.navGroup}>
          <Button
            variant="primary"
            onClick={goToNext}
            disabled={!hasNext}
            aria-label="Next turn"
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToEnd}
            disabled={!hasNext}
            aria-label="Go to last turn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 5l7 7-7 7" />
              <path d="M6 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className={styles.keyboardHints}>
        <span><kbd>←</kbd> / <kbd>→</kbd> Navigate</span>
        <span><kbd>Space</kbd> Next</span>
        <span><kbd>Home</kbd> / <kbd>End</kbd> Jump</span>
        {onExit && <span><kbd>Esc</kbd> Exit</span>}
      </div>

      {/* Exit button */}
      {onExit && (
        <div className={styles.exitContainer}>
          <Button variant="ghost" onClick={onExit}>
            Exit Step-Through Mode
          </Button>
        </div>
      )}
    </div>
  );
}

export default ReplayViewer;
