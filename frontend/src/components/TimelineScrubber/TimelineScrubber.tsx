/**
 * TimelineScrubber - Interactive timeline for debate navigation
 *
 * Displays debate phases with progress, allows clicking to navigate,
 * and supports keyboard navigation.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useDebateStore } from '../../stores/debate-store';
import type { DebatePhase, DebateTurn } from '../../types/debate';
import { PHASE_INFO } from '../../types/debate';
import { ProgressBar } from './ProgressBar';
import { TimelinePhase } from './TimelinePhase';
import styles from './TimelineScrubber.module.css';

/**
 * Debate phases in order
 */
const DEBATE_PHASES: DebatePhase[] = [
  'PHASE_1_OPENING',
  'PHASE_2_CONSTRUCTIVE',
  'PHASE_3_CROSSEXAM',
  'PHASE_4_REBUTTAL',
  'PHASE_5_CLOSING',
  'PHASE_6_SYNTHESIS',
];

export interface TimelineScrubberProps {
  /** Callback when a phase is selected */
  onPhaseSelect?: (phase: DebatePhase, turnIndex: number) => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Calculate debate progress as percentage
 */
function calculateProgress(
  currentPhase: DebatePhase,
  turns: DebateTurn[]
): number {
  // Handle terminal states
  if (currentPhase === 'COMPLETED') return 100;
  if (currentPhase === 'ERROR') return 0;
  if (currentPhase === 'INITIALIZING') return 0;
  if (currentPhase === 'PAUSED') {
    // Return progress at pause point based on turns
    const lastTurn = turns[turns.length - 1];
    if (!lastTurn) return 0;
    const phaseIndex = DEBATE_PHASES.indexOf(lastTurn.phase as DebatePhase);
    return phaseIndex >= 0 ? ((phaseIndex + 1) / DEBATE_PHASES.length) * 100 : 0;
  }

  const phaseIndex = DEBATE_PHASES.indexOf(currentPhase);
  if (phaseIndex < 0) return 0;

  // Base progress on phase position (0-6 phases = 0-100%)
  return (phaseIndex / DEBATE_PHASES.length) * 100;
}

/**
 * Get completed phases from turns
 */
function getCompletedPhases(turns: DebateTurn[]): Set<DebatePhase> {
  const completed = new Set<DebatePhase>();

  for (const turn of turns) {
    completed.add(turn.phase as DebatePhase);
  }

  return completed;
}

/**
 * Get first turn index for a phase
 */
function getFirstTurnIndexForPhase(
  turns: DebateTurn[],
  phase: DebatePhase
): number {
  return turns.findIndex((turn) => turn.phase === phase);
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  onPhaseSelect,
  className = '',
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const debate = useDebateStore((state) => state.debate);
  const currentPhase = debate?.currentPhase ?? 'INITIALIZING';
  const turns = debate?.turns ?? [];

  const progress = calculateProgress(currentPhase, turns);
  const completedPhases = getCompletedPhases(turns);
  const isDebateActive = debate?.status === 'live' || debate?.status === 'paused';

  /**
   * Handle phase click
   */
  const handlePhaseClick = useCallback(
    (phase: DebatePhase) => {
      // Only allow clicking phases that have turns
      const turnIndex = getFirstTurnIndexForPhase(turns, phase);
      if (turnIndex >= 0) {
        onPhaseSelect?.(phase, turnIndex);

        // Scroll to section
        const sectionId = `phase-${phase}`;
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [turns, onPhaseSelect]
  );

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newIndex = focusedIndex;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        newIndex = Math.min(focusedIndex + 1, DEBATE_PHASES.length - 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        newIndex = Math.max(focusedIndex - 1, 0);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const phase = DEBATE_PHASES[focusedIndex];
        if (completedPhases.has(phase)) {
          handlePhaseClick(phase);
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIndex = DEBATE_PHASES.length - 1;
      }

      if (newIndex !== focusedIndex) {
        setFocusedIndex(newIndex);
      }
    },
    [focusedIndex, completedPhases, handlePhaseClick]
  );

  /**
   * Update focused index when current phase changes
   */
  useEffect(() => {
    const currentIndex = DEBATE_PHASES.indexOf(currentPhase as DebatePhase);
    if (currentIndex >= 0) {
      setFocusedIndex(currentIndex);
    }
  }, [currentPhase]);

  if (!isDebateActive && debate?.status !== 'completed') {
    return null;
  }

  return (
    <nav
      ref={timelineRef}
      className={`${styles.timeline} ${className}`}
      aria-label="Debate timeline"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Progress Bar */}
      <ProgressBar progress={progress} className={styles.progressBar} />

      {/* Phase List */}
      <ol className={styles.phases} role="tablist">
        {DEBATE_PHASES.map((phase, index) => {
          const info = PHASE_INFO[phase];
          const isCompleted = completedPhases.has(phase);
          const isCurrent = currentPhase === phase;
          const isPending = !isCompleted && !isCurrent;
          const isFocused = focusedIndex === index;

          return (
            <TimelinePhase
              key={phase}
              phase={phase}
              label={info.shortName}
              fullLabel={info.name}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              isPending={isPending}
              isFocused={isFocused}
              onClick={() => handlePhaseClick(phase)}
              showConnector={index < DEBATE_PHASES.length - 1}
            />
          );
        })}
      </ol>

      {/* Mobile Progress Indicator */}
      <div className={styles.mobileInfo}>
        <span className={styles.currentLabel}>
          {PHASE_INFO[currentPhase as DebatePhase]?.name ?? 'Starting...'}
        </span>
        <span className={styles.progressText}>{Math.round(progress)}%</span>
      </div>
    </nav>
  );
};

export default TimelineScrubber;
