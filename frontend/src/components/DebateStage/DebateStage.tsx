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
import {
  useDebateStore,
  selectIsHumanParticipationMode,
  selectIsAwaitingHumanInput,
  selectIsReadyToRespond,
  selectHumanSide,
  selectHumanInputRequest,
} from '../../stores/debate-store';
import { Speaker } from '../../types/debate';
import { SpeakerPanel } from './SpeakerPanel';
import { CenterStage } from './CenterStage';
import { HumanTurnInput } from '../DebateStream/HumanTurnInput';
import { InterjectionOverlay } from './InterjectionOverlay';
import { ReadyToRespondOverlay } from './ReadyToRespondOverlay';
import { Badge } from '../ui/Badge';
import styles from './DebateStage.module.css';

interface DebateStageProps {
  className?: string;
}

export const DebateStage: React.FC<DebateStageProps> = ({ className }) => {
  const {
    debate,
    lively,
    setReadyToRespond,
  } = useDebateStore();

  // Human participation state
  const isHumanParticipationMode = useDebateStore(selectIsHumanParticipationMode);
  const isAwaitingHumanInput = useDebateStore(selectIsAwaitingHumanInput);
  const isReadyToRespond = useDebateStore(selectIsReadyToRespond);
  const humanSide = useDebateStore(selectHumanSide);
  const humanInputRequest = useDebateStore(selectHumanInputRequest);

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

  // Get the last turn from a specific speaker (reserved for future use)
  const _getLastTurn = (speaker: Speaker) => {
    if (!debate) return null;
    const turns = [...debate.turns].reverse();
    return turns.find(t => t.speaker === speaker) ?? null;
  };
  void _getLastTurn;  // Suppress unused warning

  // Determine opponent speaker (opposite of human side)
  const opponentSpeaker = humanSide === 'pro' ? Speaker.CON : Speaker.PRO;

  // Get the last turn that just completed (what the user needs to respond to)
  const getLastCompletedTurn = () => {
    if (!debate || debate.turns.length === 0) return null;
    // Get the most recent turn
    const turns = [...debate.turns];
    return turns[turns.length - 1];
  };

  // When awaiting human input, show the last completed response in center stage
  const getDisplaySpeaker = () => {
    // If we're awaiting human input and not ready, show the last completed response
    if (isHumanParticipationMode && isAwaitingHumanInput && !isReadyToRespond) {
      const lastTurn = getLastCompletedTurn();

      if (lastTurn) {
        return {
          speaker: lastTurn.speaker,
          partialContent: lastTurn.content,
          tokenPosition: lastTurn.content.length,
          interruptWindowOpen: false,
          startedAtMs: 0,  // Historical turn - no timing info
          lastSafeBoundary: lastTurn.content.length,
        };
      }
    }

    // Otherwise use the live active speaker
    return lively.activeSpeaker;
  };

  // Get the content for a side panel
  // When ready to respond, opponent's panel shows the last response (what user needs to respond to)
  const getSidePanelContent = (speaker: Speaker): string => {
    if (isHumanParticipationMode && isAwaitingHumanInput && isReadyToRespond) {
      // Show the last completed turn in the opponent's panel
      // This is what the user needs to respond to
      if (speaker === opponentSpeaker) {
        const lastTurn = getLastCompletedTurn();
        if (lastTurn) {
          return lastTurn.content;
        }
      }
    }
    return getSpeakerContent(speaker);
  };

  // Determine if side panel should be collapsible and its initial state
  const getSidePanelProps = (speaker: Speaker) => {
    const isOpponent = speaker === opponentSpeaker;

    // Make opponent panel collapsible when ready to respond
    // This shows the response they need to respond to
    if (isHumanParticipationMode && isAwaitingHumanInput && isReadyToRespond && isOpponent) {
      return {
        collapsible: true,
        defaultExpanded: true, // Start expanded so user can see what they're responding to
      };
    }
    return {
      collapsible: false,
      defaultExpanded: true,
    };
  };

  // Determine which speaker should be in center
  const activeSpeaker = lively.activeSpeaker?.speaker;
  const pendingInterrupter = lively.pendingInterrupt?.speaker ?? null;
  const displaySpeaker = getDisplaySpeaker();

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
            content={getSidePanelContent(Speaker.PRO)}
            isActive={activeSpeaker === Speaker.PRO}
            size={activeSpeaker === Speaker.PRO ? 'lg' : 'md'}
            modelName={debate.proModelName}
            {...getSidePanelProps(Speaker.PRO)}
          />
        </div>

        {/* Center stage - Active speaker, Ready overlay, or Human Input */}
        <div className={styles.centerPanel}>
          {isHumanParticipationMode && isAwaitingHumanInput && isReadyToRespond ? (
            // User clicked "Ready" - show the input form
            <HumanTurnInput />
          ) : (
            // Show the center stage (with optional Ready overlay)
            <>
              <CenterStage
                activeSpeaker={displaySpeaker}
                currentPhase={debate.currentPhase}
                interruptWindowOpen={displaySpeaker?.interruptWindowOpen}
                pendingInterrupter={pendingInterrupter}
                isHistorical={isHumanParticipationMode && isAwaitingHumanInput && !isReadyToRespond}
                proModelName={debate.proModelName}
                conModelName={debate.conModelName}
              />
              {/* Show Ready overlay when awaiting but not ready */}
              {isHumanParticipationMode && isAwaitingHumanInput && !isReadyToRespond && (
                <ReadyToRespondOverlay
                  promptType={humanInputRequest?.promptType ?? 'Response'}
                  phase={debate.currentPhase}
                  onReady={() => setReadyToRespond(true)}
                />
              )}
            </>
          )}
        </div>

        {/* Right panel - Con advocate */}
        <div className={styles.sidePanel}>
          <SpeakerPanel
            speaker={Speaker.CON}
            state={getSpeakerState(Speaker.CON)}
            content={getSidePanelContent(Speaker.CON)}
            isActive={activeSpeaker === Speaker.CON}
            size={activeSpeaker === Speaker.CON ? 'lg' : 'md'}
            modelName={debate.conModelName}
            {...getSidePanelProps(Speaker.CON)}
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
          collapsible={true}
          defaultExpanded={false}
        />
      </div>

      {/* Status bar */}
      <div className={styles.statusBar}>
        {/* Human participation indicator */}
        {isHumanParticipationMode && humanSide && (
          <div className={styles.statusItem}>
            <Badge variant="primary">
              You are arguing {humanSide === 'pro' ? 'FOR' : 'AGAINST'} the proposition
            </Badge>
          </div>
        )}
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
