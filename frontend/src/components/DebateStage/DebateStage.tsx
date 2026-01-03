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
  selectIsInformalMode,
  selectInformalParticipants,
  selectExchangeCount,
  selectMaxExchanges,
  selectDevilsAdvocateParticipantId,
} from '../../stores/debate-store';
import { Speaker, DebatePhase } from '../../types/debate';
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

  // Informal discussion mode state
  const isInformalMode = useDebateStore(selectIsInformalMode);
  const informalParticipants = useDebateStore(selectInformalParticipants);
  const exchangeCount = useDebateStore(selectExchangeCount);
  const maxExchanges = useDebateStore(selectMaxExchanges);
  const devilsAdvocateParticipantId = useDebateStore(selectDevilsAdvocateParticipantId);

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

  // For informal discussion mode, show participant-based view
  if (isInformalMode) {
    // Get content for a participant from turns, using metadata for speaker name
    const getParticipantContent = (participantId: string): string => {
      if (!debate) return '';
      const turns = [...debate.turns].reverse();
      const lastTurn = turns.find((t) => t.speaker === participantId);
      return lastTurn?.content ?? '';
    };

    // Participant colors based on index
    const getParticipantColor = (index: number): string => {
      const colors = [
        'var(--color-participant-1, #6366f1)',
        'var(--color-participant-2, #ec4899)',
        'var(--color-participant-3, #f59e0b)',
        'var(--color-participant-4, #14b8a6)',
      ];
      return colors[index] ?? colors[0];
    };

    return (
      <div className={`${styles.stage} ${styles.informal} ${className ?? ''}`}>
        {/* Header with topic and exchange counter */}
        <div className={styles.informalHeader}>
          <div className={styles.topicLabel}>Topic</div>
          <div className={styles.topic}>{debate.proposition}</div>
          <div className={styles.exchangeCounter}>
            <span className={styles.exchangeLabel}>Exchange</span>
            <span className={styles.exchangeValue}>
              {exchangeCount} / {maxExchanges}
            </span>
            <span className={styles.phaseLabel}>
              {debate.currentPhase === DebatePhase.WRAPUP ? '(Wrap-up)' : ''}
            </span>
          </div>
        </div>

        {/* Participant panels */}
        <div className={styles.informalGrid}>
          {informalParticipants.map((participant, index) => (
            <div
              key={participant.id}
              className={styles.participantPanel}
              style={{ '--participant-color': getParticipantColor(index) } as React.CSSProperties}
            >
              <div className={styles.participantHeader}>
                <span className={styles.participantName}>
                  {participant.name}
                  {devilsAdvocateParticipantId === participant.id && (
                    <span className={styles.devilIcon} title="Devil's Advocate">
                      😈
                    </span>
                  )}
                </span>
                <span className={styles.participantModel}>
                  {participant.modelId.split('/').pop()}
                </span>
              </div>
              <div className={styles.participantContent}>
                {getParticipantContent(participant.id)}
              </div>
            </div>
          ))}
        </div>

        {/* Show summary if available */}
        {debate.informalSummary && (
          <div className={styles.summaryPanel}>
            <h3>Discussion Summary</h3>
            <div className={styles.summarySection}>
              <h4>Key Insights</h4>
              <ul>
                {debate.informalSummary.keyInsights.map((insight, i) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
            <div className={styles.summarySection}>
              <h4>Areas of Agreement</h4>
              <ul>
                {debate.informalSummary.areasOfAgreement.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div className={styles.summarySection}>
              <h4>Areas of Disagreement</h4>
              <ul>
                {debate.informalSummary.areasOfDisagreement.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
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
      {/* Don't show content here - when moderator speaks, they appear in center stage */}
      {/* This panel only shows avatar, name, and status to avoid duplicate content */}
      <div className={styles.bottomPanel}>
        <SpeakerPanel
          speaker={Speaker.MODERATOR}
          state={getSpeakerState(Speaker.MODERATOR)}
          content={undefined}
          isActive={activeSpeaker === Speaker.MODERATOR}
          size="md"
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

      {/* Interjection overlay - hide when debate is completed */}
      {lively.streamingInterjection && debate.currentPhase !== DebatePhase.COMPLETED && (
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
