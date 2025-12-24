/**
 * TimelinePhase - Individual phase indicator in the timeline
 */

import React from 'react';
import type { DebatePhase } from '../../types/debate';
import styles from './TimelinePhase.module.css';

interface TimelinePhaseProps {
  phase: DebatePhase;
  label: string;
  fullLabel: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isPending: boolean;
  isFocused: boolean;
  onClick: () => void;
  showConnector: boolean;
}

export const TimelinePhase: React.FC<TimelinePhaseProps> = ({
  phase,
  label,
  fullLabel,
  isCompleted,
  isCurrent,
  isPending,
  isFocused,
  onClick,
  showConnector,
}) => {
  const getStatusClass = () => {
    if (isCurrent) return styles.current;
    if (isCompleted) return styles.completed;
    if (isPending) return styles.pending;
    return '';
  };

  return (
    <li
      className={`${styles.phase} ${getStatusClass()} ${isFocused ? styles.focused : ''}`}
      role="tab"
      aria-selected={isCurrent}
    >
      <button
        type="button"
        className={styles.button}
        onClick={onClick}
        disabled={isPending}
        aria-label={`${fullLabel}${isCompleted ? ' - completed' : isCurrent ? ' - in progress' : ' - pending'}`}
        data-phase={phase}
        tabIndex={-1}
      >
        {/* Dot indicator */}
        <span className={styles.dot}>
          {isCurrent && !isCompleted && (
            <span className={styles.spinner} aria-hidden="true" />
          )}
          {isCompleted && (
            <svg
              className={styles.checkIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>

        {/* Label */}
        <span className={styles.label}>{label}</span>
      </button>

      {/* Connector line */}
      {showConnector && (
        <span
          className={`${styles.connector} ${isCompleted ? styles.connectorCompleted : ''}`}
          aria-hidden="true"
        />
      )}
    </li>
  );
};

export default TimelinePhase;
