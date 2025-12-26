import React from 'react';
import { Speaker, SPEAKER_INFO } from '../../types/debate';
import styles from './SpeakerBadge.module.css';

interface SpeakerBadgeProps {
  speaker: Speaker;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({
  speaker,
  size = 'md',
  showName = true,
  className = '',
}) => {
  // Handle case where speaker might not be in SPEAKER_INFO
  const info = SPEAKER_INFO[speaker] || {
    shortName: speaker || 'Unknown',
    color: 'var(--color-text-secondary)',
    bgColor: 'var(--color-bg-tertiary)',
  };

  const speakerClass = speaker ? styles[speaker.toLowerCase()] : '';

  return (
    <span
      className={`${styles.badge} ${speakerClass} ${styles[size]} ${className}`}
      style={{
        '--speaker-color': info.color,
        '--speaker-bg': info.bgColor,
      } as React.CSSProperties}
    >
      <span className={styles.indicator} />
      {showName && <span className={styles.name}>{info.shortName}</span>}
    </span>
  );
};

export default SpeakerBadge;
