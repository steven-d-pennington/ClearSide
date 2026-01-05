/**
 * FlowSettings Component
 *
 * Configures debate flow settings (exchanges, style, duration).
 */

import React from 'react';
import styles from './DuelogicConfig.module.css';

interface FlowSettingsProps {
  maxExchanges: number;
  autoAdvance: boolean;
  targetDurationMinutes?: number;
  minExchanges?: number;
  maxExchangesLimit?: number;
  onMaxExchangesChange: (exchanges: number) => void;
  onAutoAdvanceChange: (auto: boolean) => void;
  onDurationChange?: (minutes: number) => void;
  disabled?: boolean;
}

export const FlowSettings: React.FC<FlowSettingsProps> = ({
  maxExchanges,
  autoAdvance,
  targetDurationMinutes,
  minExchanges = 2,
  maxExchangesLimit = 10,
  onMaxExchangesChange,
  onAutoAdvanceChange,
  onDurationChange,
  disabled = false,
}) => {
  return (
    <div className={styles.flowSettings}>
      <h3 className={styles.sectionTitle}>Debate Flow</h3>

      {/* Max Exchanges */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>
          <span>Number of Exchanges</span>
          <span className={styles.labelValue}>{maxExchanges}</span>
        </label>
        <input
          type="range"
          min={minExchanges}
          max={maxExchangesLimit}
          step="1"
          value={maxExchanges}
          onChange={(e) => onMaxExchangesChange(Number(e.target.value))}
          disabled={disabled}
          className={styles.slider}
        />
        <div className={styles.sliderLabels}>
          <span>Brief ({minExchanges})</span>
          <span>Thorough ({maxExchangesLimit})</span>
        </div>
        <p className={styles.hint}>
          Each exchange includes one response from each chair
        </p>
      </div>

      {/* Auto Advance */}
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => onAutoAdvanceChange(e.target.checked)}
          disabled={disabled}
        />
        <span>Auto-advance between segments</span>
      </label>
      <p className={styles.hint}>
        {autoAdvance
          ? 'Debate will flow automatically without pauses'
          : 'Pause between segments for user control'}
      </p>

      {/* Optional Duration Target */}
      {onDurationChange && (
        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            <span>Target Duration</span>
            <span className={styles.labelValue}>
              {targetDurationMinutes ? `${targetDurationMinutes} min` : 'Auto'}
            </span>
          </label>
          <input
            type="range"
            min="5"
            max="60"
            step="5"
            value={targetDurationMinutes || 15}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            disabled={disabled}
            className={styles.slider}
          />
        </div>
      )}
    </div>
  );
};

export default FlowSettings;
