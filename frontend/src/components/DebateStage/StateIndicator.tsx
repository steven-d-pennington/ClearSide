/**
 * StateIndicator Component
 *
 * Visual indicator for speaker state in lively mode.
 * Shows speaking/queued/cooldown/ready/interrupted states with
 * appropriate colors and animations.
 */

import React from 'react';
import type { LivelySpeakerState } from '../../types/lively';
import styles from './StateIndicator.module.css';

interface StateIndicatorProps {
  state: LivelySpeakerState;
  size?: 'sm' | 'md' | 'lg';
}

const STATE_CONFIG: Record<LivelySpeakerState, { label: string; className: string }> = {
  speaking: {
    label: 'Speaking',
    className: styles.speaking,
  },
  queued: {
    label: 'Ready to Interrupt',
    className: styles.queued,
  },
  cooldown: {
    label: 'Cooldown',
    className: styles.cooldown,
  },
  ready: {
    label: 'Ready',
    className: styles.ready,
  },
  interrupted: {
    label: 'Interrupted',
    className: styles.interrupted,
  },
};

export const StateIndicator: React.FC<StateIndicatorProps> = ({ state, size = 'md' }) => {
  const config = STATE_CONFIG[state];

  return (
    <span
      className={`${styles.indicator} ${config.className} ${styles[size]}`}
      title={config.label}
    >
      <span className={styles.dot} />
      <span className={styles.label}>{config.label}</span>
    </span>
  );
};

export default StateIndicator;
