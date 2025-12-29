/**
 * CenterStage Component
 *
 * The main stage area showing the currently active speaker
 * with their content streaming in real-time.
 */

import React from 'react';
import { Speaker, SPEAKER_INFO, PHASE_INFO, DebatePhase } from '../../types/debate';
import type { ActiveSpeakerState } from '../../types/lively';
import { StateIndicator } from './StateIndicator';
import styles from './CenterStage.module.css';

interface CenterStageProps {
  activeSpeaker: ActiveSpeakerState | null;
  currentPhase: DebatePhase;
  interruptWindowOpen?: boolean;
  pendingInterrupter?: Speaker | null;
}

export const CenterStage: React.FC<CenterStageProps> = ({
  activeSpeaker,
  currentPhase,
  interruptWindowOpen = false,
  pendingInterrupter = null,
}) => {
  const phaseInfo = PHASE_INFO[currentPhase];

  if (!activeSpeaker) {
    return (
      <div className={styles.stage}>
        <div className={styles.empty}>
          <div className={styles.phaseIndicator}>
            <span className={styles.phaseName}>{phaseInfo.name}</span>
          </div>
          <p className={styles.waiting}>Waiting for speaker...</p>
        </div>
      </div>
    );
  }

  const speakerInfo = SPEAKER_INFO[activeSpeaker.speaker];

  // Get speaker-specific styling class
  const getSpeakerClass = () => {
    switch (activeSpeaker.speaker) {
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

  return (
    <div className={`${styles.stage} ${getSpeakerClass()}`}>
      {/* Phase indicator */}
      <div className={styles.phaseIndicator}>
        <span className={styles.phaseName}>{phaseInfo.name}</span>
        {interruptWindowOpen && (
          <span className={styles.interruptBadge}>Interrupt Window Open</span>
        )}
      </div>

      {/* Speaker header */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          {speakerInfo.shortName.charAt(0)}
        </div>
        <div className={styles.speakerInfo}>
          <h2 className={styles.speakerName}>{speakerInfo.name}</h2>
          <StateIndicator state="speaking" size="lg" />
        </div>
      </div>

      {/* Content area */}
      <div className={styles.content}>
        <p className={styles.text}>
          {activeSpeaker.partialContent || 'Starting...'}
          <span className={styles.cursor}>|</span>
        </p>
      </div>

      {/* Token progress */}
      <div className={styles.progress}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.min((activeSpeaker.tokenPosition / 500) * 100, 100)}%` }}
          />
        </div>
        <span className={styles.tokenCount}>
          {activeSpeaker.tokenPosition} tokens
        </span>
      </div>

      {/* Pending interrupt indicator */}
      {pendingInterrupter && (
        <div className={styles.interruptWarning}>
          <span className={styles.interruptIcon}>⚡</span>
          <span>{SPEAKER_INFO[pendingInterrupter].name} is preparing to interrupt...</span>
        </div>
      )}
    </div>
  );
};

export default CenterStage;
