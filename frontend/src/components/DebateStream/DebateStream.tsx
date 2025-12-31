import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  useDebateStore,
  selectIsAwaitingContinue,
  selectIsStepMode,
  selectIsCatchingUp,
  selectCatchupState,
  selectIsAwaitingHumanInput,
  selectIsHumanParticipationMode,
  selectHumanSide,
} from '../../stores/debate-store';
import { PhaseIndicator } from './PhaseIndicator';
import { TurnCard } from './TurnCard';
import { StreamingTurn } from './StreamingTurn';
import { HumanTurnInput } from './HumanTurnInput';
import { InterventionPanel } from '../InterventionPanel';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { SPEAKER_INFO } from '../../types/debate';
import styles from './DebateStream.module.css';

interface DebateStreamProps {
  className?: string;
}

export const DebateStream: React.FC<DebateStreamProps> = ({
  className = '',
}) => {
  const {
    debate,
    streamingTurn,
    connectionStatus,
    isAutoScrollEnabled,
    selectedTurnId,
    error,
    pauseDebate,
    resumeDebate,
    stopDebate,
    toggleAutoScroll,
    selectTurn,
    continueDebate,
  } = useDebateStore();

  const isAwaitingContinue = useDebateStore(selectIsAwaitingContinue);
  const isStepMode = useDebateStore(selectIsStepMode);
  const isCatchingUp = useDebateStore(selectIsCatchingUp);
  const catchupState = useDebateStore(selectCatchupState);
  const isAwaitingHumanInput = useDebateStore(selectIsAwaitingHumanInput);
  const isHumanParticipationMode = useDebateStore(selectIsHumanParticipationMode);
  const humanSide = useDebateStore(selectHumanSide);

  // Debug human participation state
  console.log('👤 RENDER DEBUG:', {
    isHumanParticipationMode,
    isAwaitingHumanInput,
    humanSide,
    debateHumanParticipation: debate?.humanParticipation,
    streamingTurn: !!streamingTurn,
  });

  // State for intervention panel visibility
  const [isInterventionPanelOpen, setIsInterventionPanelOpen] = useState(false);

  // Get the selected turn object for the InterventionPanel
  const selectedTurn = useMemo(() => {
    if (!debate || !selectedTurnId) return null;
    return debate.turns.find((t) => t.id === selectedTurnId) ?? null;
  }, [debate, selectedTurnId]);

  const streamRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (isAutoScrollEnabled && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debate?.turns.length, streamingTurn?.content, isAutoScrollEnabled]);

  if (!debate) {
    return (
      <div className={`${styles.debateStream} ${className}`}>
        <div className={styles.emptyState}>
          <h2>No Active Debate</h2>
          <p>Start a new debate to see the live stream here.</p>
        </div>
      </div>
    );
  }

  const isLive = debate.status === 'live';
  const isPaused = debate.status === 'paused';
  const isCompleted = debate.status === 'completed';
  const hasError = debate.status === 'error' || connectionStatus === 'error';

  const getStatusBadge = () => {
    if (hasError) return <Badge variant="error" dot>Error</Badge>;
    if (isCompleted) return <Badge variant="success">Completed</Badge>;
    if (isPaused) return <Badge variant="warning" dot>Paused</Badge>;
    if (isLive) return <Badge variant="success" dot>Live</Badge>;
    return <Badge variant="secondary">Initializing</Badge>;
  };

  return (
    <div className={`${styles.debateStream} ${className}`}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.title}>Debate Stream</h2>
          <div className={styles.status}>
            {getStatusBadge()}
            {connectionStatus === 'reconnecting' && (
              <span className={styles.reconnecting}>Reconnecting...</span>
            )}
          </div>
        </div>

        <div className={styles.proposition}>
          <span className={styles.propositionLabel}>Proposition:</span>
          <span className={styles.propositionText}>
            {debate.normalizedProposition || debate.proposition}
          </span>
        </div>

        {/* Human Participation Mode Indicator */}
        {isHumanParticipationMode && humanSide && (
          <div className={styles.humanModeInfo}>
            <Badge variant="primary">
              You are arguing {humanSide === 'pro' ? 'FOR' : 'AGAINST'} the proposition
            </Badge>
          </div>
        )}

        {/* Model Info (when using OpenRouter) */}
        {(debate.proModelName || debate.conModelName) && (
          <div className={styles.modelInfo}>
            <span className={styles.modelInfoLabel}>Models:</span>
            <div className={styles.modelPairing}>
              {debate.proModelName && (
                <span className={styles.modelBadge} data-role="pro">
                  <span className={styles.modelRole}>Pro:</span> {debate.proModelName}
                  {isHumanParticipationMode && humanSide === 'pro' && ' (You)'}
                </span>
              )}
              {debate.proModelName && debate.conModelName && (
                <span className={styles.modelVs}>vs</span>
              )}
              {debate.conModelName && (
                <span className={styles.modelBadge} data-role="con">
                  <span className={styles.modelRole}>Con:</span> {debate.conModelName}
                  {isHumanParticipationMode && humanSide === 'con' && ' (You)'}
                </span>
              )}
            </div>
          </div>
        )}

        <PhaseIndicator currentPhase={debate.currentPhase} />
      </header>

      {/* Error Alert */}
      {hasError && (
        <Alert variant="error" className={styles.errorAlert}>
          <strong>An error occurred:</strong> {error || debate.error || 'Connection lost'}
        </Alert>
      )}

      {/* Catch-up Indicator */}
      {isCatchingUp && catchupState.missedTurnCount > 0 && (
        <Alert variant="info" className={styles.catchupAlert}>
          <div className={styles.catchupContent}>
            <span className={styles.catchupIcon}>🔄</span>
            <span>
              Catching up... Receiving {catchupState.receivedCount} of {catchupState.missedTurnCount} missed turns
            </span>
          </div>
        </Alert>
      )}

      {/* Catch-up Complete Indicator (shown briefly after catch-up) */}
      {!isCatchingUp && catchupState.missedTurnCount > 0 && (
        <Alert variant="success" className={styles.catchupAlert}>
          <div className={styles.catchupContent}>
            <span className={styles.catchupIcon}>✅</span>
            <span>
              Welcome back! You've caught up on {catchupState.missedTurnCount} missed turns.
            </span>
          </div>
        </Alert>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlsLeft}>
          {isLive && (
            <Button variant="secondary" size="sm" onClick={pauseDebate}>
              Pause Debate
            </Button>
          )}
          {isPaused && (
            <Button variant="primary" size="sm" onClick={resumeDebate}>
              Resume Debate
            </Button>
          )}
          {(isLive || isPaused) && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => stopDebate('User stopped debate')}
            >
              Stop Debate
            </Button>
          )}
          <Button
            variant={isAutoScrollEnabled ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleAutoScroll}
          >
            Auto-scroll: {isAutoScrollEnabled ? 'On' : 'Off'}
          </Button>
        </div>
        <div className={styles.controlsRight}>
          <Button
            variant={isInterventionPanelOpen ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setIsInterventionPanelOpen(!isInterventionPanelOpen)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={styles.buttonIcon}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {isInterventionPanelOpen ? 'Hide Interventions' : 'Interventions'}
          </Button>
        </div>
      </div>

      {/* Main Content Area with Optional Sidebar */}
      <div className={`${styles.mainArea} ${isInterventionPanelOpen ? styles.withSidebar : ''}`}>
        {/* Stream Content */}
        <div className={styles.streamContent} ref={streamRef}>
          {/* Completed Turns */}
          {debate.turns.map((turn) => (
            <TurnCard
              key={turn.id}
              turn={turn}
              isSelected={selectedTurnId === turn.id}
              onSelect={() => selectTurn(turn.id === selectedTurnId ? null : turn.id)}
            />
          ))}

          {/* Currently Streaming Turn */}
          {streamingTurn && streamingTurn.isStreaming && (
            <StreamingTurn
              speaker={streamingTurn.speaker}
              phase={streamingTurn.phase}
              content={streamingTurn.content}
            />
          )}

          {/* Human Turn Input (when it's the human's turn) */}
          {isHumanParticipationMode && isAwaitingHumanInput && (
            <HumanTurnInput />
          )}

          {/* Step Mode Continue Prompt */}
          {isStepMode && isAwaitingContinue && (
            <div className={styles.continuePrompt}>
              <div className={styles.continueContent}>
                <div className={styles.continueIcon}>⏸</div>
                <div className={styles.continueText}>
                  <h4>Turn Complete</h4>
                  <p>
                    {debate && debate.currentSpeaker && SPEAKER_INFO[debate.currentSpeaker]
                      ? `Ready for ${SPEAKER_INFO[debate.currentSpeaker].name} to respond`
                      : 'Ready for next turn'}
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={continueDebate}
                className={styles.continueButton}
              >
                Continue to Next Turn
              </Button>
            </div>
          )}

          {/* Empty state for no turns */}
          {debate.turns.length === 0 && !streamingTurn && isLive && (
            <div className={styles.waitingState}>
              <div className={styles.waitingDots}>
                <span />
                <span />
                <span />
              </div>
              <p>Waiting for debate to begin...</p>
            </div>
          )}

          {/* Completion message */}
          {isCompleted && (
            <div className={styles.completionMessage}>
              <h3>Debate Complete</h3>
              <p>
                Total time: {Math.round(debate.totalElapsedMs / 1000 / 60)} minutes
              </p>
              <p>
                Review the {debate.turns.length} turns above to understand both sides of the argument.
              </p>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>

        {/* Intervention Panel Sidebar */}
        {isInterventionPanelOpen && (
          <InterventionPanel
            selectedTurn={selectedTurn}
            onClose={() => setIsInterventionPanelOpen(false)}
            className={styles.interventionSidebar}
          />
        )}
      </div>
    </div>
  );
};

export default DebateStream;
