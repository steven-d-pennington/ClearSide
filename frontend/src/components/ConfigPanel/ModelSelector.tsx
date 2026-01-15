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
  ReasoningEffort,
} from '../../types/configuration';
import type { HumanSide } from '../../types/debate';
import {
  COST_THRESHOLD_INFO,
  MODEL_TIER_INFO,
  REASONING_EFFORT_INFO,
} from '../../types/configuration';
import styles from './ModelSelector.module.css';

interface ModelDefaults {
  proModelId: string | null;
  conModelId: string | null;
  moderatorModelId: string | null;
}

interface ModelSelectorProps {
  selection: ModelSelection;
  onChange: (selection: ModelSelection) => void;
  disabled?: boolean;
  /** Current preset ID to load preset-specific defaults */
  presetId?: string;
  /** If set, the user is participating on this side (hide that model selector) */
  humanSide?: HumanSide;
}

interface OpenRouterStatus {
  configured: boolean;
  message: string;
}

interface HealthcheckResult {
  modelId: string;
  healthy: boolean;
  latencyMs: number | null;
  error: string | null;
}

type HealthcheckStatus = 'idle' | 'checking' | 'healthy' | 'unhealthy';

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selection,
  onChange,
  disabled = false,
  presetId,
  humanSide,
}) => {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [previewPairing, setPreviewPairing] = useState<ModelPairing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [healthcheckStatus, setHealthcheckStatus] = useState<Record<string, HealthcheckStatus>>({});
  const [healthcheckErrors, setHealthcheckErrors] = useState<Record<string, string>>({});

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  // Fetch model defaults - first from preset, then from system settings
  const fetchModelDefaults = useCallback(async (): Promise<ModelDefaults | null> => {
    try {
      // Try preset-specific defaults first
      if (presetId) {
        const presetResponse = await fetch(`${API_BASE_URL}/api/admin/presets/${presetId}`);
        if (presetResponse.ok) {
          const preset = await presetResponse.json();
          // Only use preset defaults if at least one model is set
          if (preset.proModelId || preset.conModelId || preset.moderatorModelId) {
            return {
              proModelId: preset.proModelId || null,
              conModelId: preset.conModelId || null,
              moderatorModelId: preset.moderatorModelId || null,
            };
          }
        }
      }

      // Fall back to system defaults
      const systemResponse = await fetch(`${API_BASE_URL}/api/admin/settings/models`);
      if (systemResponse.ok) {
        return await systemResponse.json();
      }

      return null;
    } catch (err) {
      console.error('Failed to fetch model defaults:', err);
      return null;
    }
  }, [API_BASE_URL, presetId]);

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

  // Fetch curated models when configured
  useEffect(() => {
    if (!isConfigured) return;

    async function loadModels() {
      try {
        // Use curated models endpoint for reliable, vetted models
        const response = await fetch(`${API_BASE_URL}/api/models/curated`);
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

  // Healthcheck a model on-demand
  const runHealthcheck = useCallback(async (modelId: string) => {
    setHealthcheckStatus(prev => ({ ...prev, [modelId]: 'checking' }));
    setHealthcheckErrors(prev => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/models/${encodeURIComponent(modelId)}/healthcheck`,
        { method: 'POST' }
      );
      const result: HealthcheckResult = await response.json();

      if (result.healthy) {
        setHealthcheckStatus(prev => ({ ...prev, [modelId]: 'healthy' }));
      } else {
        setHealthcheckStatus(prev => ({ ...prev, [modelId]: 'unhealthy' }));
        setHealthcheckErrors(prev => ({ ...prev, [modelId]: result.error || 'Unknown error' }));
      }
    } catch (err) {
      console.error('Healthcheck failed:', err);
      setHealthcheckStatus(prev => ({ ...prev, [modelId]: 'unhealthy' }));
      setHealthcheckErrors(prev => ({ ...prev, [modelId]: 'Network error' }));
    }
  }, [API_BASE_URL]);

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

  // Reset defaultsLoaded when preset changes so new defaults can be loaded
  useEffect(() => {
    setDefaultsLoaded(false);
  }, [presetId]);

  // Handle mode toggle
  const handleModeChange = useCallback(
    async (mode: ModelSelectionMode) => {
      if (mode === 'auto') {
        // Clear manual selections when switching to auto
        onChange({
          ...selection,
          mode,
          proModelId: null,
          conModelId: null,
          moderatorModelId: null,
        });
        setDefaultsLoaded(false);
      } else {
        // Switching to manual - load defaults if no selections exist
        if (!selection.proModelId && !selection.conModelId && !selection.moderatorModelId && !defaultsLoaded) {
          const defaults = await fetchModelDefaults();
          if (defaults) {
            onChange({
              ...selection,
              mode,
              proModelId: defaults.proModelId,
              conModelId: defaults.conModelId,
              moderatorModelId: defaults.moderatorModelId,
            });
            setDefaultsLoaded(true);
            return;
          }
        }
        onChange({
          ...selection,
          mode,
        });
      }
    },
    [selection, onChange, fetchModelDefaults, defaultsLoaded]
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

  // Handle reasoning effort change
  const handleReasoningEffortChange = useCallback(
    (effort: ReasoningEffort) => {
      onChange({
        ...selection,
        reasoningEffort: effort,
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

      {/* Reasoning Effort Control */}
      <div className={styles.reasoningControl}>
        <label className={styles.sliderLabel}>
          <span>Extended Thinking</span>
          <span className={styles.thresholdValue}>
            {REASONING_EFFORT_INFO[selection.reasoningEffort].name}
          </span>
        </label>
        <select
          value={selection.reasoningEffort}
          onChange={(e) => handleReasoningEffortChange(e.target.value as ReasoningEffort)}
          disabled={disabled}
          className={styles.select}
        >
          <option value="none">Disabled - No extended thinking</option>
          <option value="minimal">Minimal - Quick reasoning (~10%)</option>
          <option value="low">Low - Light reasoning (~20%)</option>
          <option value="medium">Medium - Balanced reasoning (~50%)</option>
          <option value="high">High - Thorough reasoning (~80%)</option>
          <option value="xhigh">Maximum - Deepest reasoning (~95%)</option>
        </select>
        <p className={styles.reasoningNote}>
          Extended thinking allows reasoning-capable models (marked with 🧠) to "think through" complex arguments before responding.
        </p>
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
          {/* Pro Advocate - hidden when human is arguing Pro */}
          {humanSide !== 'pro' && (
            <div className={styles.modelSelect}>
              <label className={styles.selectLabel}>
                <span className={styles.roleIndicator} style={{ backgroundColor: 'var(--color-pro)' }} />
                Pro Advocate
              </label>
              <div className={styles.selectWithHealthcheck}>
                <select
                  value={selection.proModelId || ''}
                  onChange={(e) => handleModelChange('pro', e.target.value)}
                  disabled={disabled}
                  className={`${styles.select} ${selection.proModelId && healthcheckStatus[selection.proModelId] === 'unhealthy' ? styles.unhealthy : ''}`}
                >
                  <option value="">Select a model...</option>
                  <ModelOptionsByProvider models={models} healthcheckStatus={healthcheckStatus} />
                </select>
                {selection.proModelId && (
                  <HealthcheckButton
                    modelId={selection.proModelId}
                    status={healthcheckStatus[selection.proModelId] || 'idle'}
                    error={healthcheckErrors[selection.proModelId]}
                    onCheck={runHealthcheck}
                    disabled={disabled}
                  />
                )}
              </div>
            </div>
          )}

          {/* Con Advocate - hidden when human is arguing Con */}
          {humanSide !== 'con' && (
            <div className={styles.modelSelect}>
              <label className={styles.selectLabel}>
                <span className={styles.roleIndicator} style={{ backgroundColor: 'var(--color-con)' }} />
                Con Advocate
              </label>
              <div className={styles.selectWithHealthcheck}>
                <select
                  value={selection.conModelId || ''}
                  onChange={(e) => handleModelChange('con', e.target.value)}
                  disabled={disabled}
                  className={`${styles.select} ${selection.conModelId && healthcheckStatus[selection.conModelId] === 'unhealthy' ? styles.unhealthy : ''}`}
                >
                  <option value="">Select a model...</option>
                  <ModelOptionsByProvider models={models} healthcheckStatus={healthcheckStatus} />
                </select>
                {selection.conModelId && (
                  <HealthcheckButton
                    modelId={selection.conModelId}
                    status={healthcheckStatus[selection.conModelId] || 'idle'}
                    error={healthcheckErrors[selection.conModelId]}
                    onCheck={runHealthcheck}
                    disabled={disabled}
                  />
                )}
              </div>
            </div>
          )}

          {/* Moderator - always shown */}
          <div className={styles.modelSelect}>
            <label className={styles.selectLabel}>
              <span className={styles.roleIndicator} style={{ backgroundColor: 'var(--color-moderator, #8b5cf6)' }} />
              Moderator
            </label>
            <div className={styles.selectWithHealthcheck}>
              <select
                value={selection.moderatorModelId || ''}
                onChange={(e) => handleModelChange('moderator', e.target.value)}
                disabled={disabled}
                className={`${styles.select} ${selection.moderatorModelId && healthcheckStatus[selection.moderatorModelId] === 'unhealthy' ? styles.unhealthy : ''}`}
              >
                <option value="">Select a model...</option>
                <ModelOptionsByProvider models={models} healthcheckStatus={healthcheckStatus} />
              </select>
              {selection.moderatorModelId && (
                <HealthcheckButton
                  modelId={selection.moderatorModelId}
                  status={healthcheckStatus[selection.moderatorModelId] || 'idle'}
                  error={healthcheckErrors[selection.moderatorModelId]}
                  onCheck={runHealthcheck}
                  disabled={disabled}
                />
              )}
            </div>
          </div>

          {/* Tier mismatch warning - only when both AI models are selected */}
          {!humanSide && selection.proModelId && selection.conModelId && (
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

// Sub-component for healthcheck button
const HealthcheckButton: React.FC<{
  modelId: string;
  status: HealthcheckStatus;
  error?: string;
  onCheck: (modelId: string) => void;
  disabled?: boolean;
}> = ({ modelId, status, error, onCheck, disabled }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'checking':
        return '⏳';
      case 'healthy':
        return '✓';
      case 'unhealthy':
        return '⚠';
      default:
        return '🔍';
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case 'checking':
        return styles.checking;
      case 'healthy':
        return styles.healthy;
      case 'unhealthy':
        return styles.unhealthyBtn;
      default:
        return '';
    }
  };

  return (
    <div className={styles.healthcheckContainer}>
      <button
        type="button"
        className={`${styles.healthcheckBtn} ${getStatusClass()}`}
        onClick={() => onCheck(modelId)}
        disabled={disabled || status === 'checking'}
        title={error || (status === 'healthy' ? 'Model is responding' : status === 'unhealthy' ? 'Model is not responding' : 'Test model availability')}
      >
        {getStatusIcon()}
      </button>
      {status === 'unhealthy' && error && (
        <span className={styles.healthcheckError} title={error}>
          {error.length > 25 ? error.substring(0, 25) + '...' : error}
        </span>
      )}
    </div>
  );
};

// Sub-component to render models grouped by provider with reasoning indicator
const ModelOptionsByProvider: React.FC<{
  models: ModelInfo[];
  healthcheckStatus?: Record<string, HealthcheckStatus>;
}> = ({ models, healthcheckStatus = {} }) => {
  // Group models by provider (models are already sorted alphabetically from backend)
  const groupedByProvider = models.reduce<Record<string, ModelInfo[]>>((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {});

  // Sort providers alphabetically
  const sortedProviders = Object.keys(groupedByProvider).sort();

  // Format provider name for display (capitalize first letter)
  const formatProviderName = (provider: string): string => {
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  // Get status indicator for model
  const getStatusIndicator = (modelId: string): string => {
    const status = healthcheckStatus[modelId];
    if (status === 'unhealthy') return '⚠️ ';
    if (status === 'healthy') return '✓ ';
    return '';
  };

  return (
    <>
      {sortedProviders.map((provider) => (
        <optgroup key={provider} label={formatProviderName(provider)}>
          {groupedByProvider[provider].map((model) => (
            <option key={model.id} value={model.id}>
              {getStatusIndicator(model.id)}{model.supportsReasoning ? '🧠 ' : ''}{model.name} - ${model.costPer1MTokens.toFixed(2)}/1M
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};

export default ModelSelector;
