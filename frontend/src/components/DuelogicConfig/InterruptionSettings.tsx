/**
 * InterruptionSettings Component
 *
 * Configures chair-to-chair interruption behavior.
 */

import React from 'react';
import type { AggressivenessLevel } from './duelogic-config.types';
import { AGGRESSIVENESS_INFO } from './duelogic-config.types';
import styles from './DuelogicConfig.module.css';

interface InterruptionSettingsProps {
  enabled: boolean;
  allowChairInterruptions: boolean;
  aggressiveness: AggressivenessLevel;
  cooldownSeconds: number;
  onEnabledChange: (enabled: boolean) => void;
  onChairInterruptionsChange: (allowed: boolean) => void;
  onAggressivenessChange: (level: AggressivenessLevel) => void;
  onCooldownChange: (seconds: number) => void;
  disabled?: boolean;
}

const aggressivenessLevels: AggressivenessLevel[] = [1, 2, 3, 4, 5];

export const InterruptionSettings: React.FC<InterruptionSettingsProps> = ({
  enabled,
  allowChairInterruptions,
  aggressiveness,
  cooldownSeconds,
  onEnabledChange,
  onChairInterruptionsChange,
  onAggressivenessChange,
  onCooldownChange,
  disabled = false,
}) => {
  return (
    <div className={styles.interruptionSettings}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Interruptions</h3>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            disabled={disabled}
          />
          <span>Enable Interruptions</span>
        </label>
      </div>

      {enabled && (
        <div className={styles.interruptionOptions}>
          {/* Chair Interruptions Toggle */}
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={allowChairInterruptions}
              onChange={(e) => onChairInterruptionsChange(e.target.checked)}
              disabled={disabled}
            />
            <span>Allow chair-to-chair interruptions</span>
          </label>

          {/* Aggressiveness Slider */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>
              <span>Aggressiveness</span>
              <span className={styles.labelValue}>
                {AGGRESSIVENESS_INFO[aggressiveness].name}
              </span>
            </label>
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={aggressiveness}
                onChange={(e) =>
                  onAggressivenessChange(Number(e.target.value) as AggressivenessLevel)
                }
                disabled={disabled || !allowChairInterruptions}
                className={styles.slider}
              />
              <div className={styles.sliderLabels}>
                <span>Minimal</span>
                <span>Aggressive</span>
              </div>
            </div>
            <p className={styles.hint}>
              {AGGRESSIVENESS_INFO[aggressiveness].description}
            </p>
          </div>

          {/* Cooldown Setting */}
          <div className={styles.fieldGroup}>
            <label className={styles.label}>
              <span>Cooldown Period</span>
              <span className={styles.labelValue}>{cooldownSeconds}s</span>
            </label>
            <input
              type="range"
              min="0"
              max="120"
              step="10"
              value={cooldownSeconds}
              onChange={(e) => onCooldownChange(Number(e.target.value))}
              disabled={disabled || !allowChairInterruptions}
              className={styles.slider}
            />
            <p className={styles.hint}>
              Minimum time between interruptions from the same chair
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterruptionSettings;
