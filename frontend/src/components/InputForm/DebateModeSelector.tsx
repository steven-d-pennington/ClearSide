/**
 * DebateModeSelector Component
 *
 * Allows users to choose between turn-based and lively debate modes.
 * Also provides lively mode settings when lively is selected.
 */

import React, { useState, useEffect } from 'react';
import type { DebateMode, PacingMode, LivelySettingsInput, LivelyPreset } from '../../types/lively';
import { PACING_INFO, AGGRESSION_INFO } from '../../types/lively';
import { useDebateStore } from '../../stores/debate-store';
import styles from './DebateModeSelector.module.css';

interface DebateModeSelectorProps {
  mode: DebateMode;
  settings: LivelySettingsInput;
  onModeChange: (mode: DebateMode) => void;
  onSettingsChange: (settings: LivelySettingsInput) => void;
  disabled?: boolean;
}

export const DebateModeSelector: React.FC<DebateModeSelectorProps> = ({
  mode,
  settings,
  onModeChange,
  onSettingsChange,
  disabled = false,
}) => {
  const [presets, setPresets] = useState<LivelyPreset[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { fetchLivelyPresets } = useDebateStore();

  // Fetch presets on mount
  useEffect(() => {
    fetchLivelyPresets().then(setPresets);
  }, [fetchLivelyPresets]);

  const handlePresetSelect = (preset: LivelyPreset) => {
    onSettingsChange({
      ...settings,
      ...preset.settings,
    });
  };

  return (
    <div className={styles.container}>
      {/* Mode selection */}
      <div className={styles.modeSelector}>
        <span className={styles.sectionLabel}>Debate Style:</span>
        <div className={styles.modeOptions}>
          <label
            className={`${styles.modeOption} ${mode === 'turn_based' ? styles.active : ''}`}
          >
            <input
              type="radio"
              name="debateMode"
              value="turn_based"
              checked={mode === 'turn_based'}
              onChange={() => onModeChange('turn_based')}
              disabled={disabled}
            />
            <div className={styles.modeContent}>
              <span className={styles.modeIcon}>📝</span>
              <div className={styles.modeText}>
                <strong>Turn-Based</strong>
                <small>Traditional structured debate with clear turns</small>
              </div>
            </div>
          </label>

          <label
            className={`${styles.modeOption} ${mode === 'lively' ? styles.active : ''}`}
          >
            <input
              type="radio"
              name="debateMode"
              value="lively"
              checked={mode === 'lively'}
              onChange={() => onModeChange('lively')}
              disabled={disabled}
            />
            <div className={styles.modeContent}>
              <span className={styles.modeIcon}>⚡</span>
              <div className={styles.modeText}>
                <strong>Lively Arena</strong>
                <small>Dynamic debate with interruptions and cross-talk</small>
              </div>
              <span className={styles.betaBadge}>Beta</span>
            </div>
          </label>
        </div>
      </div>

      {/* Lively mode settings */}
      {mode === 'lively' && (
        <div className={styles.livelySettings}>
          <div className={styles.settingsHeader}>
            <span className={styles.sectionLabel}>Arena Style:</span>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => setShowAdvanced(!showAdvanced)}
              disabled={disabled}
            >
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>

          {/* Preset buttons */}
          <div className={styles.presets}>
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`${styles.presetBtn} ${
                  settings.pacingMode === preset.settings.pacingMode &&
                  settings.aggressionLevel === preset.settings.aggressionLevel
                    ? styles.presetActive
                    : ''
                }`}
                onClick={() => handlePresetSelect(preset)}
                disabled={disabled}
                title={preset.description}
              >
                <span className={styles.presetName}>{preset.name}</span>
                <span className={styles.presetDesc}>{preset.description}</span>
              </button>
            ))}
          </div>

          {/* Advanced settings */}
          {showAdvanced && (
            <div className={styles.advancedSettings}>
              {/* Aggression Level */}
              <div className={styles.settingRow}>
                <label className={styles.settingLabel}>
                  Aggression Level
                  <span className={styles.settingHint}>
                    {AGGRESSION_INFO[settings.aggressionLevel ?? 3]?.description}
                  </span>
                </label>
                <div className={styles.sliderContainer}>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={settings.aggressionLevel ?? 3}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        aggressionLevel: parseInt(e.target.value),
                      })
                    }
                    disabled={disabled}
                    className={styles.slider}
                  />
                  <span className={styles.sliderValue}>
                    {settings.aggressionLevel ?? 3}
                  </span>
                </div>
              </div>

              {/* Pacing Mode */}
              <div className={styles.settingRow}>
                <label className={styles.settingLabel}>
                  Pacing Mode
                  <span className={styles.settingHint}>
                    {PACING_INFO[settings.pacingMode ?? 'medium']?.description}
                  </span>
                </label>
                <select
                  value={settings.pacingMode ?? 'medium'}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      pacingMode: e.target.value as PacingMode,
                    })
                  }
                  disabled={disabled}
                  className={styles.select}
                >
                  {Object.entries(PACING_INFO).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Max Interrupts Per Minute */}
              <div className={styles.settingRow}>
                <label className={styles.settingLabel}>
                  Max Interrupts/Minute
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.maxInterruptsPerMinute ?? 2}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      maxInterruptsPerMinute: parseInt(e.target.value),
                    })
                  }
                  disabled={disabled}
                  className={styles.numberInput}
                />
              </div>

              {/* Cooldown */}
              <div className={styles.settingRow}>
                <label className={styles.settingLabel}>
                  Interrupt Cooldown (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={(settings.interruptCooldownMs ?? 15000) / 1000}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      interruptCooldownMs: parseInt(e.target.value) * 1000,
                    })
                  }
                  disabled={disabled}
                  className={styles.numberInput}
                />
              </div>
            </div>
          )}

          {/* Lively mode info */}
          <div className={styles.livelyInfo}>
            <p>
              <strong>What is Lively Arena?</strong> AI agents can interrupt each other
              with short interjections, creating a dynamic panel discussion feel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebateModeSelector;
