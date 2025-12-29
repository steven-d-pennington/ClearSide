/**
 * ModelSelector Component
 *
 * Allows users to select AI models for Pro and Con advocates.
 * Supports Auto mode (smart pairing) and Manual mode (user picks).
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  ModelSelection,
  ModelSelectionMode,
  CostThreshold,
  ModelInfo,
  ModelPairing,
} from '../../types/configuration';
import {
  COST_THRESHOLD_INFO,
  MODEL_TIER_INFO,
} from '../../types/configuration';
import styles from './ModelSelector.module.css';

interface ModelSelectorProps {
  selection: ModelSelection;
  onChange: (selection: ModelSelection) => void;
  disabled?: boolean;
}

interface OpenRouterStatus {
  configured: boolean;
  message: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selection,
  onChange,
  disabled = false,
}) => {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [previewPairing, setPreviewPairing] = useState<ModelPairing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  // Check if OpenRouter is configured
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/models/status`);
        const data: OpenRouterStatus = await response.json();
        setIsConfigured(data.configured);
        if (!data.configured) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to check OpenRouter status:', err);
        setIsConfigured(false);
        setIsLoading(false);
      }
    }
    checkStatus();
  }, [API_BASE_URL]);

  // Fetch models when configured
  useEffect(() => {
    if (!isConfigured) return;

    async function loadModels() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/models`);
        if (!response.ok) throw new Error('Failed to load models');
        const data = await response.json();
        setModels(data.models || []);
      } catch (err) {
        console.error('Failed to load models:', err);
        setError('Could not load models');
      } finally {
        setIsLoading(false);
      }
    }
    loadModels();
  }, [isConfigured, API_BASE_URL]);

  // Fetch preview pairing when in auto mode
  useEffect(() => {
    if (!isConfigured || selection.mode !== 'auto') {
      setPreviewPairing(null);
      return;
    }

    async function loadPairing() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/models/pairings?threshold=${selection.costThreshold}`
        );
        if (!response.ok) {
          setPreviewPairing(null);
          return;
        }
        const data = await response.json();
        setPreviewPairing(data.pairing || null);
      } catch (err) {
        console.error('Failed to load pairing:', err);
        setPreviewPairing(null);
      }
    }
    loadPairing();
  }, [isConfigured, selection.mode, selection.costThreshold, API_BASE_URL]);

  // Handle mode toggle
  const handleModeChange = useCallback(
    (mode: ModelSelectionMode) => {
      onChange({
        ...selection,
        mode,
        // Clear manual selections when switching to auto
        proModelId: mode === 'auto' ? null : selection.proModelId,
        conModelId: mode === 'auto' ? null : selection.conModelId,
        moderatorModelId: mode === 'auto' ? null : selection.moderatorModelId,
      });
    },
    [selection, onChange]
  );

  // Handle cost threshold change
  const handleCostThresholdChange = useCallback(
    (threshold: CostThreshold) => {
      onChange({
        ...selection,
        costThreshold: threshold,
      });
    },
    [selection, onChange]
  );

  // Handle model selection
  const handleModelChange = useCallback(
    (role: 'pro' | 'con' | 'moderator', modelId: string) => {
      const fieldMap = {
        pro: 'proModelId',
        con: 'conModelId',
        moderator: 'moderatorModelId',
      };
      onChange({
        ...selection,
        [fieldMap[role]]: modelId || null,
      });
    },
    [selection, onChange]
  );

  // If not configured, show a disabled state
  if (isConfigured === false) {
    return (
      <div className={`${styles.modelSelector} ${styles.notConfigured}`}>
        <div className={styles.header}>
          <h3 className={styles.title}>AI Models</h3>
        </div>
        <p className={styles.notConfiguredMessage}>
          Multi-model debates are not configured. Using default models.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.modelSelector}>
        <div className={styles.header}>
          <h3 className={styles.title}>AI Models</h3>
        </div>
        <div className={styles.loading}>Loading model options...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.modelSelector}>
        <div className={styles.header}>
          <h3 className={styles.title}>AI Models</h3>
        </div>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  const costThresholds: CostThreshold[] = ['free_only', 'low', 'medium', 'high', 'unlimited'];

  return (
    <div className={`${styles.modelSelector} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>AI Models</h3>
      </div>

      {/* Mode Toggle */}
      <div className={styles.modeToggle}>
        <button
          type="button"
          className={`${styles.modeButton} ${selection.mode === 'auto' ? styles.active : ''}`}
          onClick={() => handleModeChange('auto')}
          disabled={disabled}
        >
          <span className={styles.modeIcon}>&#9733;</span>
          <span className={styles.modeName}>Auto</span>
          <span className={styles.modeDesc}>Smart model pairing</span>
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${selection.mode === 'manual' ? styles.active : ''}`}
          onClick={() => handleModeChange('manual')}
          disabled={disabled}
        >
          <span className={styles.modeIcon}>&#9881;</span>
          <span className={styles.modeName}>Manual</span>
          <span className={styles.modeDesc}>Choose specific models</span>
        </button>
      </div>

      {/* Auto Mode: Cost Threshold Slider */}
      {selection.mode === 'auto' && (
        <div className={styles.autoMode}>
          <label className={styles.sliderLabel}>
            <span>Cost Limit</span>
            <span className={styles.thresholdValue}>
              {COST_THRESHOLD_INFO[selection.costThreshold].name}
            </span>
          </label>
          <div className={styles.thresholdSlider}>
            {costThresholds.map((threshold, index) => (
              <button
                key={threshold}
                type="button"
                className={`${styles.thresholdStep} ${
                  selection.costThreshold === threshold ? styles.active : ''
                } ${costThresholds.indexOf(selection.costThreshold) >= index ? styles.filled : ''}`}
                onClick={() => handleCostThresholdChange(threshold)}
                disabled={disabled}
                title={COST_THRESHOLD_INFO[threshold].description}
              />
            ))}
          </div>
          <div className={styles.thresholdLabels}>
            <span>Free</span>
            <span>Premium</span>
          </div>

          {/* Preview Pairing */}
          {previewPairing && (
            <div className={styles.pairingPreview}>
              <div
                className={styles.tierBadge}
                style={{ backgroundColor: MODEL_TIER_INFO[previewPairing.tier].color }}
              >
                {MODEL_TIER_INFO[previewPairing.tier].name} Tier
              </div>
              <div className={styles.pairingModels}>
                <div className={styles.modelPreview}>
                  <span className={styles.roleLabel}>Pro:</span>
                  <span className={styles.modelName}>{previewPairing.proModel.name}</span>
                </div>
                <span className={styles.versus}>vs</span>
                <div className={styles.modelPreview}>
                  <span className={styles.roleLabel}>Con:</span>
                  <span className={styles.modelName}>{previewPairing.conModel.name}</span>
                </div>
              </div>
              <div className={styles.estimatedCost}>
                Est. cost: ${previewPairing.estimatedCostPerDebate.toFixed(4)}/debate
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Mode: Model Dropdowns */}
      {selection.mode === 'manual' && (
        <div className={styles.manualMode}>
          <div className={styles.modelSelect}>
            <label className={styles.selectLabel}>
              <span className={styles.roleIndicator} style={{ backgroundColor: 'var(--color-pro)' }} />
              Pro Advocate
            </label>
            <select
              value={selection.proModelId || ''}
              onChange={(e) => handleModelChange('pro', e.target.value)}
              disabled={disabled}
              className={styles.select}
            >
              <option value="">Select a model...</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - ${model.costPer1MTokens.toFixed(2)}/1M
                </option>
              ))}
            </select>
          </div>

          <div className={styles.modelSelect}>
            <label className={styles.selectLabel}>
              <span className={styles.roleIndicator} style={{ backgroundColor: 'var(--color-con)' }} />
              Con Advocate
            </label>
            <select
              value={selection.conModelId || ''}
              onChange={(e) => handleModelChange('con', e.target.value)}
              disabled={disabled}
              className={styles.select}
            >
              <option value="">Select a model...</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - ${model.costPer1MTokens.toFixed(2)}/1M
                </option>
              ))}
            </select>
          </div>

          <div className={styles.modelSelect}>
            <label className={styles.selectLabel}>
              <span className={styles.roleIndicator} style={{ backgroundColor: 'var(--color-moderator, #8b5cf6)' }} />
              Moderator
            </label>
            <select
              value={selection.moderatorModelId || ''}
              onChange={(e) => handleModelChange('moderator', e.target.value)}
              disabled={disabled}
              className={styles.select}
            >
              <option value="">Select a model...</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - ${model.costPer1MTokens.toFixed(2)}/1M
                </option>
              ))}
            </select>
          </div>

          {/* Tier mismatch warning */}
          {selection.proModelId && selection.conModelId && (
            <TierWarning
              models={models}
              proModelId={selection.proModelId}
              conModelId={selection.conModelId}
            />
          )}
        </div>
      )}
    </div>
  );
};

// Sub-component for tier mismatch warning
const TierWarning: React.FC<{
  models: ModelInfo[];
  proModelId: string;
  conModelId: string;
}> = ({ models, proModelId, conModelId }) => {
  const proModel = models.find((m) => m.id === proModelId);
  const conModel = models.find((m) => m.id === conModelId);

  if (!proModel || !conModel || proModel.tier === conModel.tier) {
    return null;
  }

  return (
    <div className={styles.tierWarning}>
      <span className={styles.warningIcon}>&#9888;</span>
      <span>
        Models are in different tiers ({MODEL_TIER_INFO[proModel.tier].name} vs{' '}
        {MODEL_TIER_INFO[conModel.tier].name}). This may affect debate balance.
      </span>
    </div>
  );
};

export default ModelSelector;
