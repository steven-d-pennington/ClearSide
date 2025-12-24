/**
 * ProgressBar - Visual progress indicator
 */

import React from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  progress: number;
  /** Additional CSS class */
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className = '',
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div
      className={`${styles.progressBar} ${className}`}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Debate progress"
    >
      <div
        className={styles.fill}
        style={{ width: `${clampedProgress}%` }}
      />
      <div
        className={styles.glow}
        style={{ left: `${clampedProgress}%` }}
      />
    </div>
  );
};

export default ProgressBar;
