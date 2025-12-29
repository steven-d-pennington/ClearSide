/**
 * InterjectionOverlay Component
 *
 * Overlay popup that appears when a speaker interjects/interrupts.
 * Shows the interjection content with animation.
 */

import React, { useEffect, useState } from 'react';
import { Speaker, SPEAKER_INFO } from '../../types/debate';
import styles from './InterjectionOverlay.module.css';

interface InterjectionOverlayProps {
  speaker: Speaker;
  content: string;
  isStreaming?: boolean;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export const InterjectionOverlay: React.FC<InterjectionOverlayProps> = ({
  speaker,
  content,
  isStreaming = false,
  onDismiss,
  autoDismissMs = 5000,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const speakerInfo = SPEAKER_INFO[speaker];

  useEffect(() => {
    // Auto-dismiss after content is complete
    if (!isStreaming && autoDismissMs > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onDismiss) {
          setTimeout(onDismiss, 300); // Wait for exit animation
        }
      }, autoDismissMs);

      return () => clearTimeout(timer);
    }
  }, [isStreaming, autoDismissMs, onDismiss]);

  // Get speaker-specific styling class
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

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`${styles.overlay} ${getSpeakerClass()} ${isVisible ? styles.visible : styles.hidden}`}>
      <div className={styles.container}>
        {/* Speaker indicator */}
        <div className={styles.header}>
          <div className={styles.avatar}>
            {speakerInfo.shortName.charAt(0)}
          </div>
          <div className={styles.speakerInfo}>
            <span className={styles.label}>Interruption by</span>
            <span className={styles.name}>{speakerInfo.name}</span>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <p className={styles.text}>
            "{content}"
            {isStreaming && <span className={styles.cursor}>|</span>}
          </p>
        </div>

        {/* Dismiss button */}
        {!isStreaming && onDismiss && (
          <button
            className={styles.dismissBtn}
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4L12 12M4 12L12 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default InterjectionOverlay;
