/**
 * ModelErrorModal Component
 *
 * Modal for handling model failures during a debate.
 * Allows user to select a replacement model and resume the debate.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Alert } from '../ui';
import styles from './ModelErrorModal.module.css';

interface ModelInfo {
  id: string;
  name: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
  architecture?: {
    modality?: string;
  };
}

interface ModelErrorModalProps {
  isOpen: boolean;
  speaker: 'pro' | 'con' | 'moderator';
  failedModelId: string;
  error: string;
  phase: string;
  onReassign: (newModelId: string) => Promise<void>;
  onClose: () => void;
}

const SPEAKER_LABELS: Record<string, string> = {
  pro: 'Pro Advocate',
  con: 'Con Advocate',
  moderator: 'Moderator',
};

export const ModelErrorModal: React.FC<ModelErrorModalProps> = ({
  isOpen,
  speaker,
  failedModelId,
  error,
  phase,
  onReassign,
  onClose,
}) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  // Fetch available models when modal opens
  useEffect(() => {
    if (!isOpen) return;

    async function loadModels() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/models`);
        if (!response.ok) {
          throw new Error('Failed to load models');
        }
        const data = await response.json();
        const availableModels = data.models || [];

        // Filter out the failed model
        const filteredModels = availableModels.filter(
          (m: ModelInfo) => m.id !== failedModelId
        );

        setModels(filteredModels);

        // Pre-select the first available model if none selected
        if (!selectedModelId && filteredModels.length > 0) {
          setSelectedModelId(filteredModels[0].id);
        }
      } catch (err) {
        console.error('Failed to load models:', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load models');
      } finally {
        setIsLoading(false);
      }
    }

    loadModels();
  }, [isOpen, failedModelId, selectedModelId, API_BASE_URL]);

  const handleReassign = useCallback(async () => {
    if (!selectedModelId) return;

    setIsSubmitting(true);

    try {
      await onReassign(selectedModelId);
      // onClose will be called automatically when model_reassigned event is received
    } catch (err) {
      console.error('Failed to reassign model:', err);
      // Keep modal open if reassignment fails
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedModelId, onReassign]);

  const formatModelName = (model: ModelInfo): string => {
    return model.name || model.id;
  };

  const formatPricing = (model: ModelInfo): string | null => {
    if (!model.pricing) return null;
    return `$${model.pricing.prompt}/$${model.pricing.completion} per 1M tokens`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Model Error - Select Replacement"
      size="medium"
    >
      <div className={styles.container}>
        {/* Error Information */}
        <Alert variant="error" className={styles.alert}>
          <div className={styles.errorInfo}>
            <strong>{SPEAKER_LABELS[speaker]}</strong> encountered an error during{' '}
            <strong>{phase}</strong>
          </div>
          <div className={styles.failedModel}>
            Failed model: <code>{failedModelId}</code>
          </div>
          <div className={styles.errorMessage}>{error}</div>
        </Alert>

        {/* Model Selection */}
        {isLoading ? (
          <div className={styles.loading}>Loading available models...</div>
        ) : loadError ? (
          <Alert variant="error">{loadError}</Alert>
        ) : models.length === 0 ? (
          <Alert variant="warning">
            No alternative models available. Please check your OpenRouter configuration.
          </Alert>
        ) : (
          <div className={styles.modelSelection}>
            <label htmlFor="model-select" className={styles.label}>
              Select a replacement model:
            </label>
            <select
              id="model-select"
              className={styles.select}
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={isSubmitting}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {formatModelName(model)}
                  {formatPricing(model) ? ` - ${formatPricing(model)}` : ''}
                </option>
              ))}
            </select>

            {selectedModelId && (
              <div className={styles.selectedModelInfo}>
                {models.find((m) => m.id === selectedModelId)?.context_length && (
                  <div className={styles.modelDetail}>
                    Context:{' '}
                    {models.find((m) => m.id === selectedModelId)?.context_length?.toLocaleString()}{' '}
                    tokens
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleReassign}
            disabled={!selectedModelId || isSubmitting || models.length === 0}
            loading={isSubmitting}
          >
            {isSubmitting ? 'Reassigning...' : 'Reassign Model & Resume'}
          </Button>
        </div>

        {/* Help Text */}
        <div className={styles.helpText}>
          The debate is currently paused. Select a replacement model to continue.
        </div>
      </div>
    </Modal>
  );
};
