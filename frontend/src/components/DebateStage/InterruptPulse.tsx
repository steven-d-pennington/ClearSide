/**
 * InterruptPulse Component
 *
 * Animated indicator showing that a speaker is about to interrupt.
 * Creates anticipation for the interruption with escalating visual effects.
 */

import React, { useEffect, useState } from 'react';
import { Speaker, SPEAKER_INFO } from '../../types/debate';
import styles from './InterruptPulse.module.css';

interface InterruptPulseProps {
  speaker: Speaker;
  isActive: boolean;
  intensity?: 'low' | 'medium' | 'high';
  onInterrupt?: () => void;
}

export const InterruptPulse: React.FC<InterruptPulseProps> = ({
  speaker,
  isActive,
  intensity = 'medium',
  onInterrupt,
}) => {
  const [pulseCount, setPulseCount] = useState(0);
  const speakerInfo = SPEAKER_INFO[speaker];

  // Escalate pulse intensity over time
  useEffect(() => {
    if (!isActive) {
      setPulseCount(0);
      return;
    }

    const interval = setInterval(() => {
      setPulseCount((prev) => {
        const next = prev + 1;
        // Trigger interrupt callback after 3 pulses
        if (next >= 3 && onInterrupt) {
          onInterrupt();
        }
        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isActive, onInterrupt]);

  // Get speaker-specific color class
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

  // Get intensity class
  const getIntensityClass = () => {
    switch (intensity) {
      case 'low':
        return styles.intensityLow;
      case 'high':
        return styles.intensityHigh;
      default:
        return styles.intensityMedium;
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <div
      className={`${styles.pulseContainer} ${getSpeakerClass()} ${getIntensityClass()}`}
      role="status"
      aria-live="polite"
      aria-label={`${speakerInfo.name} is preparing to interject`}
    >
      {/* Ripple rings */}
      <div className={styles.ripples}>
        <div className={`${styles.ripple} ${styles.ripple1}`} />
        <div className={`${styles.ripple} ${styles.ripple2}`} />
        <div className={`${styles.ripple} ${styles.ripple3}`} />
      </div>

      {/* Center indicator */}
      <div className={styles.center}>
        <div className={styles.icon}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 2V18M10 2L6 6M10 2L14 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className={styles.label}>Interjecting...</span>
      </div>

      {/* Progress indicator */}
      <div className={styles.progress}>
        <div
          className={styles.progressBar}
          style={{ width: `${Math.min(pulseCount * 33.33, 100)}%` }}
        />
      </div>
    </div>
  );
};

export default InterruptPulse;
