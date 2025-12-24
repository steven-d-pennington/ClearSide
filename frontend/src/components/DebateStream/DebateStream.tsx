import React, { useEffect, useRef } from 'react';
import { useDebateStore } from '../../stores/debate-store';
import { PhaseIndicator } from './PhaseIndicator';
import { TurnCard } from './TurnCard';
import { StreamingTurn } from './StreamingTurn';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
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
    toggleAutoScroll,
    selectTurn,
  } = useDebateStore();

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

        <PhaseIndicator currentPhase={debate.currentPhase} />
      </header>

      {/* Error Alert */}
      {hasError && (
        <Alert variant="error" className={styles.errorAlert}>
          <strong>An error occurred:</strong> {error || debate.error || 'Connection lost'}
        </Alert>
      )}

      {/* Controls */}
      <div className={styles.controls}>
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
        <Button
          variant={isAutoScrollEnabled ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleAutoScroll}
        >
          Auto-scroll: {isAutoScrollEnabled ? 'On' : 'Off'}
        </Button>
      </div>

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
    </div>
  );
};

export default DebateStream;
