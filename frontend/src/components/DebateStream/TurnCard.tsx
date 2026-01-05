import React from 'react';
import type { DebateTurn } from '../../types/debate';
import { PHASE_INFO } from '../../types/debate';
import { SpeakerBadge } from './SpeakerBadge';
import { EvaluationDisplay } from '../DuelogicDebate/EvaluationDisplay';
import styles from './TurnCard.module.css';

interface TurnCardProps {
  turn: DebateTurn;
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
}

export const TurnCard: React.FC<TurnCardProps> = ({
  turn,
  isSelected = false,
  onSelect,
  className = '',
}) => {
  // Handle case where phase might not be in PHASE_INFO (e.g., from backend with different format)
  const phaseInfo = PHASE_INFO[turn.phase] || {
    shortName: turn.phase?.replace('PHASE_', '').replace(/_/g, ' ') || 'Unknown',
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Check if this is an interjection from lively mode
  const isInterjection = turn.metadata?.isInterjection === true;

  // Extract model name for attribution (show short version)
  const modelName = turn.metadata?.model;
  const shortModelName = modelName
    ? modelName.split('/').pop()?.split(':')[0] || modelName
    : null;

  return (
    <article
      className={`${styles.turnCard} ${styles[turn.speaker.toLowerCase()]} ${isSelected ? styles.selected : ''} ${isInterjection ? styles.interjection : ''} ${className}`}
      onClick={onSelect}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-selected={isSelected}
    >
      <header className={styles.header}>
        <SpeakerBadge speaker={turn.speaker} size="sm" />
        {isInterjection && (
          <span className={styles.interjectionBadge} title="Lively mode interjection">
            ⚡ Interjection
          </span>
        )}
        <span className={styles.phase}>{phaseInfo.shortName}</span>
        {shortModelName && (
          <span className={styles.modelBadge} title={modelName}>
            🤖 {shortModelName}
          </span>
        )}
        <span className={styles.time}>{formatTime(turn.timestamp)}</span>
      </header>

      <div className={styles.content}>
        <p>{turn.content}</p>
      </div>

      {turn.metadata && (
        <footer className={styles.metadata}>
          {turn.metadata.evaluation && (
            <div className={styles.evaluation}>
              <EvaluationDisplay evaluation={turn.metadata.evaluation} />
            </div>
          )}

          {isInterjection && turn.metadata.interruptionReason && (
            <div className={styles.interjectionReason}>
              <strong>Interruption Reason:</strong> {(turn.metadata.interruptionReason as string).replace(/_/g, ' ')}
            </div>
          )}

          {turn.metadata.assumptions && turn.metadata.assumptions.length > 0 && (
            <div className={styles.assumptions}>
              <span className={styles.metaLabel}>Assumptions:</span>
              <ul>
                {turn.metadata.assumptions.map((assumption, i) => (
                  <li key={i}>{assumption}</li>
                ))}
              </ul>
            </div>
          )}
          {turn.metadata.evidenceType && (
            <span className={styles.evidenceType}>
              Evidence: {turn.metadata.evidenceType}
            </span>
          )}
          {turn.metadata.uncertaintyLevel && (
            <span className={`${styles.uncertainty} ${styles[turn.metadata.uncertaintyLevel]}`}>
              Uncertainty: {turn.metadata.uncertaintyLevel}
            </span>
          )}
        </footer>
      )}
    </article>
  );
};

export default TurnCard;
