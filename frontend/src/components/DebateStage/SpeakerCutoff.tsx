/**
 * SpeakerCutoff Component
 *
 * Visual feedback when a speaker is interrupted mid-sentence.
 * Shows a brief "cut" animation and truncation indicator.
 */

import React, { useEffect, useState } from 'react';
import { Speaker, SPEAKER_INFO } from '../../types/debate';
import styles from './SpeakerCutoff.module.css';

interface SpeakerCutoffProps {
  speaker: Speaker;
  interruptedBy: Speaker;
  partialContent?: string;
  onComplete?: () => void;
  durationMs?: number;
}

export const SpeakerCutoff: React.FC<SpeakerCutoffProps> = ({
  speaker,
  interruptedBy,
  partialContent,
  onComplete,
  durationMs = 2000,
}) => {
  const [phase, setPhase] = useState<'cut' | 'fade' | 'done'>('cut');
  const cutSpeakerInfo = SPEAKER_INFO[speaker];
  const interrupterInfo = SPEAKER_INFO[interruptedBy];

  useEffect(() => {
    // Phase transitions
    const cutTimer = setTimeout(() => setPhase('fade'), 500);
    const fadeTimer = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, durationMs);

    return () => {
      clearTimeout(cutTimer);
      clearTimeout(fadeTimer);
    };
  }, [durationMs, onComplete]);

  // Get speaker color class
  const getSpeakerClass = () => {
    switch (speaker) {
      case Speaker.PRO:
        return styles.pro;
      case Speaker.CON:
        return styles.con;
      case Speaker.MODERATOR:
        return styles.moderator;
      default:
        return '';
    }
  };

  const getInterrupterClass = () => {
    switch (interruptedBy) {
      case Speaker.PRO:
        return styles.interrupterPro;
      case Speaker.CON:
        return styles.interrupterCon;
      case Speaker.MODERATOR:
        return styles.interrupterModerator;
      default:
        return '';
    }
  };

  if (phase === 'done') {
    return null;
  }

  return (
    <div
      className={`${styles.cutoff} ${getSpeakerClass()} ${styles[phase]}`}
      role="status"
      aria-live="assertive"
      aria-label={`${cutSpeakerInfo.name} was interrupted by ${interrupterInfo.name}`}
    >
      {/* Cut flash effect */}
      {phase === 'cut' && (
        <div className={styles.flashOverlay}>
          <div className={styles.flashLine} />
        </div>
      )}

      {/* Content area */}
      <div className={styles.content}>
        {/* Truncated text preview */}
        {partialContent && (
          <div className={styles.truncatedText}>
            <span className={styles.textContent}>
              {partialContent.slice(-80)}
            </span>
            <span className={styles.ellipsis}>...</span>
          </div>
        )}

        {/* Interruption indicator */}
        <div className={`${styles.indicator} ${getInterrupterClass()}`}>
          <span className={styles.cutIcon}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8H14M2 8L6 4M2 8L6 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className={styles.cutLabel}>
            Cut by {interrupterInfo.shortName}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SpeakerCutoff;
