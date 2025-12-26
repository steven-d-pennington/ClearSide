import React from 'react';
import { DebatePhase, PHASE_INFO } from '../../types/debate';
import styles from './PhaseIndicator.module.css';

interface PhaseIndicatorProps {
  currentPhase: DebatePhase;
  className?: string;
}

const DEBATE_PHASES: DebatePhase[] = [
  DebatePhase.PHASE_1_OPENING,
  DebatePhase.PHASE_2_CONSTRUCTIVE,
  DebatePhase.PHASE_3_CROSSEXAM,
  DebatePhase.PHASE_4_REBUTTAL,
  DebatePhase.PHASE_5_CLOSING,
  DebatePhase.PHASE_6_SYNTHESIS,
];

export const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({
  currentPhase,
  className = '',
}) => {
  // Handle case where phase might not be in PHASE_INFO
  const currentInfo = PHASE_INFO[currentPhase] || {
    name: currentPhase?.replace('PHASE_', '').replace(/_/g, ' ') || 'Unknown',
    shortName: currentPhase?.replace('PHASE_', '').replace(/_/g, ' ').slice(0, 10) || '?',
    description: 'Debate in progress',
  };
  const currentIndex = DEBATE_PHASES.indexOf(currentPhase);

  const getPhaseStatus = (_phase: DebatePhase, index: number) => {
    if (currentPhase === DebatePhase.COMPLETED) return 'completed';
    if (currentPhase === DebatePhase.PAUSED) return index <= currentIndex ? 'active' : 'pending';
    if (currentPhase === DebatePhase.ERROR) return 'error';
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className={`${styles.phaseIndicator} ${className}`}>
      <div className={styles.currentPhase}>
        <span className={styles.phaseName}>{currentInfo.name}</span>
        <span className={styles.phaseDescription}>{currentInfo.description}</span>
      </div>

      <div className={styles.timeline}>
        {DEBATE_PHASES.map((phase, index) => {
          const status = getPhaseStatus(phase, index);
          const info = PHASE_INFO[phase];

          return (
            <div
              key={phase}
              className={`${styles.phase} ${styles[status]}`}
              title={info.name}
            >
              <div className={styles.dot} />
              <span className={styles.label}>{info.shortName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhaseIndicator;
