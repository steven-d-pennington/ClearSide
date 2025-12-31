/**
 * SpeakerPanel Component
 *
 * Individual speaker card showing their avatar, name, state,
 * and current/recent content. Used in the multi-panel debate stage.
 */

import React, { useState } from 'react';
import { Speaker, SPEAKER_INFO } from '../../types/debate';
import type { LivelySpeakerState } from '../../types/lively';
import { StateIndicator } from './StateIndicator';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import styles from './SpeakerPanel.module.css';

interface SpeakerPanelProps {
  speaker: Speaker;
  state: LivelySpeakerState;
  content?: string;
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  isQueued?: boolean;
  isInterjecting?: boolean;
  wasCutoff?: boolean;
  /** When true, shows expand/collapse toggle and full content when expanded */
  collapsible?: boolean;
  /** Default expanded state for collapsible panels */
  defaultExpanded?: boolean;
  /** Model name to display (e.g., "claude-3-opus") */
  modelName?: string;
}

export const SpeakerPanel: React.FC<SpeakerPanelProps> = ({
  speaker,
  state,
  content,
  isActive = false,
  size = 'md',
  onClick,
  isQueued = false,
  isInterjecting = false,
  wasCutoff = false,
  collapsible = false,
  defaultExpanded = true,
  modelName,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const speakerInfo = SPEAKER_INFO[speaker];

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
        return styles.system;
    }
  };

  // Get state-based animation class
  const getStateClass = () => {
    if (isInterjecting) return styles.interjecting;
    if (wasCutoff) return styles.cutoff;
    if (isQueued) return styles.queued;
    if (state === 'cooldown') return styles.cooldown;
    if (state === 'ready') return styles.ready;
    return '';
  };

  return (
    <div
      className={`${styles.panel} ${getSpeakerClass()} ${styles[size]} ${isActive ? styles.active : ''} ${getStateClass()}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Header with avatar and name */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          {speakerInfo.shortName.charAt(0)}
        </div>
        <div className={styles.info}>
          <h4 className={styles.name}>{speakerInfo.name}</h4>
          {modelName && (
            <span className={styles.modelBadge} title={modelName}>
              🤖 {modelName}
            </span>
          )}
          <StateIndicator state={state} size={size === 'lg' ? 'md' : 'sm'} />
        </div>
      </div>

      {/* Content area */}
      {content && (
        <div className={`${styles.content} ${collapsible ? (isExpanded ? styles.expanded : styles.collapsed) : ''}`}>
          {collapsible && (
            <button
              className={styles.expandToggle}
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse content' : 'Expand content'}
            >
              <svg
                className={`${styles.chevron} ${isExpanded ? styles.chevronUp : ''}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          {collapsible && !isExpanded ? (
            // Collapsed - show truncated preview as plain text
            <p className={styles.text}>
              {content.length > 200 ? `${content.slice(-200)}...` : content}
            </p>
          ) : (
            // Expanded or non-collapsible - render with markdown
            <MarkdownRenderer content={content} className={styles.markdown} />
          )}
          {state === 'speaking' && (
            <span className={styles.cursor}>|</span>
          )}
        </div>
      )}

      {/* Active indicator ring */}
      {isActive && <div className={styles.activeRing} />}
    </div>
  );
};

export default SpeakerPanel;
