/**
 * LaunchDebateModal
 *
 * Modal for configuring model selection per chair before launching a debate
 * Design: Command Center Editorial aesthetic
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui';
import styles from './LaunchDebateModal.module.css';
import type { PhilosophicalChair, EpisodeProposal } from '../../types/duelogic-research';
import type { ModelInfo } from '../../types/configuration';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ChairModelSelection {
  modelId: string;
  modelDisplayName: string;
  providerName: string;
}

interface LaunchDebateModalProps {
  proposal: EpisodeProposal;
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (chairModels: ChairModelSelection[]) => Promise<void>;
  isLaunching: boolean;
}

// Default model selections per provider
const DEFAULT_MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
];

export function LaunchDebateModal({
  proposal,
  isOpen,
  onClose,
  onLaunch,
  isLaunching,
}: LaunchDebateModalProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chairSelections, setChairSelections] = useState<ChairModelSelection[]>([]);

  const chairs = proposal.chairs || [];

  // Initialize chair selections with defaults when modal opens
  useEffect(() => {
    if (isOpen && chairs.length > 0) {
      const initialSelections = chairs.map((_, index) => {
        const defaultModel = DEFAULT_MODELS[index % DEFAULT_MODELS.length];
        return {
          modelId: defaultModel.id,
          modelDisplayName: defaultModel.name,
          providerName: defaultModel.provider,
        };
      });
      setChairSelections(initialSelections);
    }
  }, [isOpen, chairs.length]);

  // Fetch available models
  useEffect(() => {
    if (!isOpen) return;

    async function loadModels() {
      setIsLoadingModels(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/models`);
        if (!response.ok) throw new Error('Failed to load models');
        const data = await response.json();
        setModels(data.models || []);
      } catch (err) {
        console.error('Failed to load models:', err);
        setError('Could not load available models');
      } finally {
        setIsLoadingModels(false);
      }
    }
    loadModels();
  }, [isOpen]);

  const handleModelChange = useCallback((chairIndex: number, modelId: string) => {
    const model = models.find(m => m.id === modelId);
    if (!model) return;

    setChairSelections(prev => {
      const updated = [...prev];
      updated[chairIndex] = {
        modelId: model.id,
        modelDisplayName: model.name,
        providerName: model.provider,
      };
      return updated;
    });
  }, [models]);

  const handleLaunch = async () => {
    await onLaunch(chairSelections);
  };

  // Group models by provider
  const modelsByProvider = models.reduce<Record<string, ModelInfo[]>>((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {});

  // Provider order preference
  const providerOrder = ['Anthropic', 'OpenAI', 'Google', 'xAI', 'Meta', 'Mistral', 'Cohere', 'DeepSeek'];
  const sortedProviders = Object.keys(modelsByProvider).sort((a, b) => {
    const aIndex = providerOrder.indexOf(a);
    const bIndex = providerOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Launch Debate</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={isLaunching}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.proposalInfo}>
          {proposal.episodeNumber && (
            <span className={styles.episodeNum}>Episode #{proposal.episodeNumber}</span>
          )}
          <h3 className={styles.proposalTitle}>{proposal.title}</h3>
        </div>

        <div className={styles.divider} />

        <div className={styles.body}>
          <h4 className={styles.sectionTitle}>Select Models for Each Chair</h4>

          {error && (
            <div className={styles.error}>{error}</div>
          )}

          {isLoadingModels ? (
            <div className={styles.loading}>
              <div className={styles.loadingSpinner} />
              <span>Loading models...</span>
            </div>
          ) : (
            <div className={styles.chairsContainer}>
              {chairs.map((chair: PhilosophicalChair, index: number) => (
                <div key={index} className={`${styles.chairCard} ${index === 0 ? styles.chairA : styles.chairB}`}>
                  <div className={styles.chairHeader}>
                    <span className={styles.chairLabel}>
                      {index === 0 ? 'Chair A' : 'Chair B'}
                    </span>
                    <span className={styles.chairName}>{chair.name}</span>
                  </div>
                  <p className={styles.chairPosition}>
                    "{chair.position.length > 80 ? chair.position.slice(0, 80) + '...' : chair.position}"
                  </p>
                  <div className={styles.modelSelectWrapper}>
                    <label className={styles.modelLabel}>Model</label>
                    <select
                      className={styles.modelSelect}
                      value={chairSelections[index]?.modelId || ''}
                      onChange={e => handleModelChange(index, e.target.value)}
                      disabled={isLaunching}
                    >
                      {sortedProviders.map(provider => (
                        <optgroup key={provider} label={provider}>
                          {modelsByProvider[provider].map(model => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose} disabled={isLaunching}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleLaunch}
            loading={isLaunching}
            disabled={isLoadingModels || chairSelections.length !== chairs.length}
          >
            Launch Debate
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LaunchDebateModal;
