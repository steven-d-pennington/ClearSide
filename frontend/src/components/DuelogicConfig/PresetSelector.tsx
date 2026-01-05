/**
 * PresetSelector Component
 *
 * Displays preset chair matchups for quick setup.
 */

import React from 'react';
import type { PresetInfo } from './duelogic-config.types';
import styles from './DuelogicConfig.module.css';

interface PresetSelectorProps {
  presets: PresetInfo[];
  onPresetSelect: (presetId: string, preset: PresetInfo) => void;
  disabled?: boolean;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  presets,
  onPresetSelect,
  disabled = false,
}) => {
  if (presets.length === 0) {
    return null;
  }

  return (
    <div className={styles.presetSelector}>
      <h3 className={styles.sectionTitle}>Quick Start Presets</h3>
      <p className={styles.presetDescription}>
        Choose a preset matchup or configure chairs manually below
      </p>
      <div className={styles.presetGrid}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.presetCard}
            onClick={() => onPresetSelect(preset.id, preset)}
            disabled={disabled}
          >
            <span className={styles.presetName}>{preset.name}</span>
            <span className={styles.presetDesc}>{preset.description}</span>
            <span className={styles.presetChairs}>
              {preset.chairs.length} chairs
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PresetSelector;
