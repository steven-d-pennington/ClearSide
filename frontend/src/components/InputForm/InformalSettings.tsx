/**
 * InformalSettings Component
 *
 * Allows users to configure participants for informal discussion mode.
 * Supports 2-4 participants, each with a name and model selection.
 */

import React, { useState, useEffect } from 'react';
import type { InformalSettingsInput } from '../../types/informal';
import { INFORMAL_DEFAULTS } from '../../types/informal';
import type { ModelInfo } from '../../types/configuration';
import styles from './InformalSettings.module.css';

interface InformalSettingsProps {
  settings: InformalSettingsInput;
  onChange: (settings: InformalSettingsInput) => void;
  disabled?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const InformalSettings: React.FC<InformalSettingsProps> = ({
  settings,
  onChange,
  disabled = false,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load available models
  useEffect(() => {
    async function loadModels() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/models`);
        if (!response.ok) throw new Error('Failed to load models');
        const data = await response.json();
        setModels(data.models || []);
        setError(null);
      } catch (err) {
        setError('Failed to load models');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadModels();
  }, []);

  // Update participant at index
  const updateParticipant = (
    index: number,
    field: 'name' | 'modelId' | 'persona',
    value: string
  ) => {
    const newParticipants = [...settings.participants];
    newParticipants[index] = {
      ...newParticipants[index],
      [field]: value,
    };
    onChange({ ...settings, participants: newParticipants });
  };

  // Add a new participant
  const addParticipant = () => {
    if (settings.participants.length >= INFORMAL_DEFAULTS.maxParticipants) return;
    const newIndex = settings.participants.length + 1;
    const letters = ['A', 'B', 'C', 'D'];
    onChange({
      ...settings,
      participants: [
        ...settings.participants,
        {
          name: `Participant ${letters[newIndex - 1] || newIndex}`,
          modelId: '',
          persona: '',
        },
      ],
    });
  };

  // Remove participant at index
  const removeParticipant = (index: number) => {
    if (settings.participants.length <= INFORMAL_DEFAULTS.minParticipants) return;
    const newParticipants = settings.participants.filter((_, i) => i !== index);
    onChange({ ...settings, participants: newParticipants });
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading models...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.sectionLabel}>Discussion Participants</span>
        <span className={styles.participantCount}>
          {settings.participants.length} of {INFORMAL_DEFAULTS.maxParticipants}
        </span>
      </div>

      <div className={styles.participants}>
        {settings.participants.map((participant, index) => (
          <div key={index} className={styles.participantCard}>
            <div className={styles.participantHeader}>
              <input
                type="text"
                className={styles.nameInput}
                value={participant.name || ''}
                onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                placeholder={`Participant ${index + 1}`}
                disabled={disabled}
              />
              {settings.participants.length > INFORMAL_DEFAULTS.minParticipants && (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeParticipant(index)}
                  disabled={disabled}
                  title="Remove participant"
                >
                  &times;
                </button>
              )}
            </div>

            <select
              className={styles.modelSelect}
              value={participant.modelId || ''}
              onChange={(e) => updateParticipant(index, 'modelId', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select a model...</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>

            <input
              type="text"
              className={styles.personaInput}
              value={participant.persona || ''}
              onChange={(e) => updateParticipant(index, 'persona', e.target.value)}
              placeholder="Optional persona/perspective..."
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      {settings.participants.length < INFORMAL_DEFAULTS.maxParticipants && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={addParticipant}
          disabled={disabled}
        >
          + Add Participant
        </button>
      )}

      {/* Advanced settings toggle */}
      <button
        type="button"
        className={styles.advancedToggle}
        onClick={() => setShowAdvanced(!showAdvanced)}
        disabled={disabled}
      >
        {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
      </button>

      {showAdvanced && (
        <div className={styles.advancedSettings}>
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              Max Exchanges
              <span className={styles.settingHint}>
                Maximum rounds where all participants speak once
              </span>
            </label>
            <input
              type="number"
              className={styles.numberInput}
              min={INFORMAL_DEFAULTS.minExchanges}
              max={30}
              value={settings.maxExchanges ?? INFORMAL_DEFAULTS.maxExchanges}
              onChange={(e) =>
                onChange({ ...settings, maxExchanges: parseInt(e.target.value) || INFORMAL_DEFAULTS.maxExchanges })
              }
              disabled={disabled}
            />
          </div>

          <div className={styles.settingRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={settings.endDetectionEnabled ?? INFORMAL_DEFAULTS.endDetection.enabled}
                onChange={(e) =>
                  onChange({ ...settings, endDetectionEnabled: e.target.checked })
                }
                disabled={disabled}
              />
              <span>Enable AI end detection</span>
              <span className={styles.settingHint}>
                AI will suggest ending when the topic is exhausted
              </span>
            </label>
          </div>

          {(settings.endDetectionEnabled ?? INFORMAL_DEFAULTS.endDetection.enabled) && (
            <div className={styles.settingRow}>
              <label className={styles.settingLabel}>
                Confidence Threshold
                <span className={styles.settingHint}>
                  Higher = more confident before suggesting end (0.5-1.0)
                </span>
              </label>
              <input
                type="range"
                className={styles.slider}
                min="0.5"
                max="1.0"
                step="0.05"
                value={settings.endDetectionThreshold ?? INFORMAL_DEFAULTS.endDetection.confidenceThreshold}
                onChange={(e) =>
                  onChange({ ...settings, endDetectionThreshold: parseFloat(e.target.value) })
                }
                disabled={disabled}
              />
              <span className={styles.sliderValue}>
                {(settings.endDetectionThreshold ?? INFORMAL_DEFAULTS.endDetection.confidenceThreshold).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Validation warning */}
      {settings.participants.some((p) => !p.modelId) && (
        <div className={styles.warning}>
          Please select a model for each participant
        </div>
      )}
    </div>
  );
};

export default InformalSettings;
