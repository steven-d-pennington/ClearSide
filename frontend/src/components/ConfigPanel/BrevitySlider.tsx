/**
 * BrevitySlider Component
 *
 * A 5-level slider for controlling response verbosity.
 * Level 1 = Very Detailed, Level 5 = Very Concise
 */

import React from 'react';
import type { BrevityLevel } from '../../types/configuration';
import styles from './BrevitySlider.module.css';

interface BrevitySliderProps {
  value: BrevityLevel;
  onChange: (level: BrevityLevel) => void;
  disabled?: boolean;
}

export const BrevitySlider: React.FC<BrevitySliderProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(e.target.value, 10) as BrevityLevel);
  };

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={styles.slider}
        aria-label="Response length"
      />
      <div className={styles.labels}>
        <span className={value === 1 ? styles.active : ''}>Detailed</span>
        <span className={value === 3 ? styles.active : ''}>Balanced</span>
        <span className={value === 5 ? styles.active : ''}>Concise</span>
      </div>
      <div className={styles.ticks}>
        {[1, 2, 3, 4, 5].map((tick) => (
          <span
            key={tick}
            className={`${styles.tick} ${value === tick ? styles.activeTick : ''}`}
          />
        ))}
      </div>
    </div>
  );
};

export default BrevitySlider;
