/**
 * TemperatureSlider Component
 *
 * A slider for controlling LLM temperature (0-1).
 * Lower values = more focused/consistent, Higher values = more creative/varied
 */

import React from 'react';
import styles from './TemperatureSlider.module.css';

interface TemperatureSliderProps {
  value: number;
  onChange: (temp: number) => void;
  disabled?: boolean;
}

export const TemperatureSlider: React.FC<TemperatureSliderProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  // Determine which label is active based on value range
  const isFocused = value < 0.4;
  const isBalanced = value >= 0.4 && value <= 0.7;
  const isCreative = value > 0.7;

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={styles.slider}
        aria-label="Creativity level"
      />
      <div className={styles.labels}>
        <span className={isFocused ? styles.active : ''}>Focused</span>
        <span className={isBalanced ? styles.active : ''}>Balanced</span>
        <span className={isCreative ? styles.active : ''}>Creative</span>
      </div>
    </div>
  );
};

export default TemperatureSlider;
