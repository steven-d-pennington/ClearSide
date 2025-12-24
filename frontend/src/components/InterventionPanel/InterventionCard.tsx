/**
 * InterventionCard - Displays a single intervention with status and response
 *
 * Shows intervention type, content, status, and any responses from the debate agents.
 */

import React from 'react';
import { Button, Badge } from '../ui';
import type { Intervention } from '../../types/debate';
import { SPEAKER_INFO } from '../../types/debate';
import styles from './InterventionCard.module.css';

interface InterventionCardProps {
  intervention: Intervention;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

/**
 * Get status badge variant
 */
function getStatusVariant(
  status: Intervention['status']
): 'secondary' | 'warning' | 'success' | 'info' {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'acknowledged':
      return 'info';
    case 'addressed':
      return 'success';
    case 'dismissed':
      return 'secondary';
    default:
      return 'secondary';
  }
}

/**
 * Get intervention type icon
 */
function getTypeIcon(type: Intervention['type']): string {
  switch (type) {
    case 'question':
      return '?';
    case 'challenge':
      return '!';
    case 'evidence':
      return '+';
    case 'clarification':
      return 'i';
    default:
      return '?';
  }
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return new Date(date).toLocaleDateString();
}

export const InterventionCard: React.FC<InterventionCardProps> = ({
  intervention,
  isExpanded,
  onToggleExpand,
}) => {
  const { type, content, status, timestamp, response, targetSpeaker } = intervention;
  const statusVariant = getStatusVariant(status);
  const typeIcon = getTypeIcon(type);
  const relativeTime = formatRelativeTime(timestamp);

  return (
    <article
      className={`${styles.card} ${styles[status]}`}
      aria-expanded={isExpanded}
    >
      {/* Card Header */}
      <header className={styles.header} onClick={onToggleExpand}>
        <div className={styles.headerLeft}>
          <span className={styles.typeIcon} aria-hidden="true">
            {typeIcon}
          </span>
          <span className={styles.type}>{type}</span>
          {targetSpeaker && (
            <Badge
              variant={targetSpeaker === 'PRO' ? 'success' : 'error'}
              size="sm"
            >
              to {SPEAKER_INFO[targetSpeaker].shortName}
            </Badge>
          )}
        </div>
        <div className={styles.headerRight}>
          <Badge variant={statusVariant} size="sm">
            {status}
          </Badge>
          <span className={styles.time}>{relativeTime}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            aria-expanded={isExpanded}
            className={styles.expandButton}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`${styles.expandIcon} ${isExpanded ? styles.rotated : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Button>
        </div>
      </header>

      {/* Card Content (collapsible) */}
      <div
        className={`${styles.content} ${isExpanded ? styles.expanded : ''}`}
        aria-hidden={!isExpanded}
      >
        {/* User's intervention */}
        <div className={styles.userContent}>
          <p>{content}</p>
        </div>

        {/* Response (if addressed) */}
        {status === 'addressed' && response && (
          <div className={styles.response}>
            <span className={styles.responseLabel}>Response:</span>
            <p>{response}</p>
          </div>
        )}

        {/* Pending indicator */}
        {status === 'pending' && (
          <div className={styles.pendingNote}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Waiting to be addressed...</span>
          </div>
        )}

        {/* Acknowledged indicator */}
        {status === 'acknowledged' && (
          <div className={styles.acknowledgedNote}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Received, will be addressed shortly</span>
          </div>
        )}

        {/* Dismissed indicator */}
        {status === 'dismissed' && (
          <div className={styles.dismissedNote}>
            <span>This intervention was not addressed in the debate</span>
          </div>
        )}
      </div>
    </article>
  );
};

export default InterventionCard;
