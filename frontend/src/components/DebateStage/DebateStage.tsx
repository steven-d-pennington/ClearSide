/**
 * DebateStage Component
 *
 * Multi-panel layout for lively debate mode.
 * Shows active speaker in center with other speakers on sides.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │  [Pro Panel]    [ACTIVE SPEAKER]   [Con Panel]  │
 * │    (small)         (large)           (small)    │
 * │                                                 │
 * │              [Moderator Panel]                  │
 * │                  (medium)                       │
 * └─────────────────────────────────────────────────┘
 */

import React from 'react';
import { useDebateStore } from '../../stores/debate-store';
import { Speaker } from '../../types/debate';
import { SpeakerPanel } from './SpeakerPanel';
import { CenterStage } from './CenterStage';
import { InterjectionOverlay } from './InterjectionOverlay';
import styles from './DebateStage.module.css';

interface DebateStageProps {
  className?: string;
}

export const DebateStage: React.FC<DebateStageProps> = ({ className }) => {
  const {
    debate,
    lively,
  } = useDebateStore();

  // Get speaker states from lively state
  const getSpeakerState = (speaker: Speaker) => {
    return lively.speakerStates.get(speaker) ?? 'ready';
  };

  // Get recent content for a speaker from turns
  const getSpeakerContent = (speaker: Speaker): string => {
    if (!debate) return '';

    // Find last turn from this speaker
    const turns = [...debate.turns].reverse();
    const lastTurn = turns.find(t => t.speaker === speaker);

    // If this speaker is currently active, show their streaming content
    if (lively.activeSpeaker?.speaker === speaker) {
      return lively.activeSpeaker.partialContent;
    }

    return lastTurn?.content ?? '';
  };

  // Determine which speaker should be in center
  const activeSpeaker = lively.activeSpeaker?.speaker;
  const pendingInterrupter = lively.pendingInterrupt?.speaker ?? null;

  if (!debate) {
    return (
      <div className={`${styles.stage} ${className ?? ''}`}>
        <div className={styles.empty}>
          <p>No active debate</p>
        </div>
      </div>
    );
  }

  // For non-lively mode, show simple view
  if (!lively.isLivelyMode) {
    return (
      <div className={`${styles.stage} ${styles.turnBased} ${className ?? ''}`}>
        <div className={styles.turnBasedContent}>
          <CenterStage
            activeSpeaker={null}
            currentPhase={debate.currentPhase}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.stage} ${className ?? ''}`}>
      {/* Main grid layout */}
      <div className={styles.grid}>
        {/* Left panel - Pro advocate */}
        <div className={styles.sidePanel}>
          <SpeakerPanel
            speaker={Speaker.PRO}
            state={getSpeakerState(Speaker.PRO)}
            content={getSpeakerContent(Speaker.PRO)}
            isActive={activeSpeaker === Speaker.PRO}
            size={activeSpeaker === Speaker.PRO ? 'lg' : 'md'}
          />
        </div>

        {/* Center stage - Active speaker */}
        <div className={styles.centerPanel}>
          <CenterStage
            activeSpeaker={lively.activeSpeaker}
            currentPhase={debate.currentPhase}
            interruptWindowOpen={lively.activeSpeaker?.interruptWindowOpen}
            pendingInterrupter={pendingInterrupter}
          />
        </div>

        {/* Right panel - Con advocate */}
        <div className={styles.sidePanel}>
          <SpeakerPanel
            speaker={Speaker.CON}
            state={getSpeakerState(Speaker.CON)}
            content={getSpeakerContent(Speaker.CON)}
            isActive={activeSpeaker === Speaker.CON}
            size={activeSpeaker === Speaker.CON ? 'lg' : 'md'}
          />
        </div>
      </div>

      {/* Bottom panel - Moderator */}
      <div className={styles.bottomPanel}>
        <SpeakerPanel
          speaker={Speaker.MODERATOR}
          state={getSpeakerState(Speaker.MODERATOR)}
          content={getSpeakerContent(Speaker.MODERATOR)}
          isActive={activeSpeaker === Speaker.MODERATOR}
          size="md"
        />
      </div>

      {/* Status bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Pacing:</span>
          <span className={styles.statusValue}>
            {lively.settings?.pacingMode ?? 'medium'}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Interrupts this minute:</span>
          <span className={styles.statusValue}>
            {lively.interruptsThisMinute} / {lively.settings?.maxInterruptsPerMinute ?? 2}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Aggression:</span>
          <span className={styles.statusValue}>
            Level {lively.settings?.aggressionLevel ?? 3}
          </span>
        </div>
      </div>

      {/* Interjection overlay */}
      {lively.streamingInterjection && (
        <InterjectionOverlay
          speaker={lively.streamingInterjection.speaker}
          content={lively.streamingInterjection.content}
          isStreaming={lively.streamingInterjection.isStreaming}
        />
      )}
    </div>
  );
};

export default DebateStage;
