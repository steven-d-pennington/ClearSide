import React from 'react';
import { Speaker, DebatePhase, PHASE_INFO } from '../../types/debate';
import { SpeakerBadge } from './SpeakerBadge';
import styles from './StreamingTurn.module.css';

interface StreamingTurnProps {
  speaker: Speaker;
  phase: DebatePhase;
  content: string;
  className?: string;
}

export const StreamingTurn: React.FC<StreamingTurnProps> = ({
  speaker,
  phase,
  content,
  className = '',
}) => {
  // Handle case where phase might not be in PHASE_INFO
  const phaseInfo = PHASE_INFO[phase] || {
    shortName: phase?.replace('PHASE_', '').replace(/_/g, ' ') || 'Unknown',
  };
  const speakerClass = speaker ? styles[speaker.toLowerCase()] : '';

  return (
    <article
      className={`${styles.streamingTurn} ${speakerClass} ${className}`}
      aria-live="polite"
      aria-atomic="false"
    >
      <header className={styles.header}>
        <SpeakerBadge speaker={speaker} size="sm" />
        <span className={styles.phase}>{phaseInfo.shortName}</span>
        <span className={styles.streaming}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
      </header>

      <div className={styles.content}>
        <p>{content}</p>
        <span className={styles.cursor} aria-hidden="true" />
      </div>
    </article>
  );
};

export default StreamingTurn;
