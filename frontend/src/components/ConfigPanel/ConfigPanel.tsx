/**
 * ConfigPanel Component
 *
 * Allows users to select debate presets or customize individual settings.
 * Features preset cards for quick selection and expandable advanced settings.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type {
  DebateConfiguration,
  DebatePreset,
  PresetMode,
  BrevityLevel,
} from '../../types/configuration';
import {
  DEFAULT_CONFIGURATION,
  PRESET_MODE_INFO,
  BREVITY_LABELS,
} from '../../types/configuration';
import { BrevitySlider } from './BrevitySlider';
import { TemperatureSlider } from './TemperatureSlider';
import styles from './ConfigPanel.module.css';

interface ConfigPanelProps {
  configuration: DebateConfiguration;
  onChange: (config: DebateConfiguration) => void;
  disabled?: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  configuration,
  onChange,
  disabled = false,
}) => {
  const [presets, setPresets] = useState<DebatePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(
    configuration.presetMode === 'custom'
  );

  // Fetch presets on mount
  useEffect(() => {
    async function loadPresets() {
      try {
        const response = await fetch('/api/presets');
        if (!response.ok) {
          throw new Error('Failed to load presets');
        }
        const data = await response.json();
        setPresets(data.presets || []);
      } catch (err) {
        console.error('Failed to load presets:', err);
        setError('Could not load presets');
      } finally {
        setIsLoading(false);
      }
    }
    loadPresets();
  }, []);

  // Handle preset selection
  const handlePresetChange = useCallback(
    (presetId: PresetMode) => {
      if (presetId === 'custom') {
        setShowAdvanced(true);
        onChange({ ...configuration, presetMode: 'custom' });
        return;
      }

      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setShowAdvanced(false);
        onChange({
          presetMode: presetId,
          brevityLevel: preset.brevityLevel,
          llmSettings: {
            temperature: preset.llmTemperature,
            maxTokensPerResponse: preset.maxTokensPerResponse,
          },
          requireCitations: preset.requireCitations,
        });
      }
    },
    [configuration, onChange, presets]
  );

  // Handle individual setting changes
  const handleBrevityChange = useCallback(
    (level: BrevityLevel) => {
      onChange({
        ...configuration,
        presetMode: 'custom',
        brevityLevel: level,
      });
      setShowAdvanced(true);
    },
    [configuration, onChange]
  );

  const handleTemperatureChange = useCallback(
    (temp: number) => {
      onChange({
        ...configuration,
        presetMode: 'custom',
        llmSettings: {
          ...configuration.llmSettings,
          temperature: temp,
        },
      });
      setShowAdvanced(true);
    },
    [configuration, onChange]
  );

  const handleCitationsChange = useCallback(
    (required: boolean) => {
      onChange({
        ...configuration,
        presetMode: 'custom',
        requireCitations: required,
      });
      setShowAdvanced(true);
    },
    [configuration, onChange]
  );

  if (isLoading) {
    return (
      <div className={styles.configPanel}>
        <div className={styles.loading}>Loading presets...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.configPanel}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  const presetModes: PresetMode[] = ['quick', 'balanced', 'deep_dive', 'research'];

  return (
    <div className={`${styles.configPanel} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Debate Style</h3>
        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </button>
      </div>

      {/* Preset Selector */}
      <div className={styles.presetGrid}>
        {presetModes.map((presetId) => {
          const info = PRESET_MODE_INFO[presetId];
          const isSelected = configuration.presetMode === presetId;

          return (
            <button
              key={presetId}
              type="button"
              className={`${styles.presetCard} ${isSelected ? styles.selected : ''}`}
              onClick={() => handlePresetChange(presetId)}
              disabled={disabled}
              aria-pressed={isSelected}
            >
              <span className={styles.presetName}>{info.name}</span>
              <span className={styles.presetDesc}>{info.description}</span>
            </button>
          );
        })}
      </div>

      {/* Custom preset indicator */}
      {configuration.presetMode === 'custom' && (
        <div className={styles.customIndicator}>
          Using custom settings
        </div>
      )}

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className={styles.advancedPanel}>
          <div className={styles.setting}>
            <label className={styles.settingLabel}>
              <span>Response Length</span>
              <span className={styles.settingValue}>
                {BREVITY_LABELS[configuration.brevityLevel]}
              </span>
            </label>
            <BrevitySlider
              value={configuration.brevityLevel}
              onChange={handleBrevityChange}
              disabled={disabled}
            />
          </div>

          <div className={styles.setting}>
            <label className={styles.settingLabel}>
              <span>Creativity</span>
              <span className={styles.settingValue}>
                {configuration.llmSettings.temperature.toFixed(1)}
              </span>
            </label>
            <TemperatureSlider
              value={configuration.llmSettings.temperature}
              onChange={handleTemperatureChange}
              disabled={disabled}
            />
            <p className={styles.settingHint}>
              Lower = more focused, Higher = more creative
            </p>
          </div>

          <div className={styles.setting}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={configuration.requireCitations}
                onChange={(e) => handleCitationsChange(e.target.checked)}
                disabled={disabled}
              />
              <span>Require citations for all claims</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;
