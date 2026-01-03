/**
 * ChairCard Component
 *
 * Displays a single philosophical chair with framework selection and model assignment.
 */

import React from 'react';
import type {
  PhilosophicalFramework,
  ChairInfo,
  ModelInfo,
  DuelogicChair,
} from './duelogic-config.types';
import styles from './DuelogicConfig.module.css';

interface ChairCardProps {
  chair: DuelogicChair;
  chairNumber: number;
  availableChairs: ChairInfo[];
  availableModels: ModelInfo[];
  onFrameworkChange: (framework: PhilosophicalFramework) => void;
  onModelChange: (modelId: string, displayName?: string, provider?: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  disabled?: boolean;
}

const tierColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-purple-100 text-purple-800',
};

export const ChairCard: React.FC<ChairCardProps> = ({
  chair,
  chairNumber,
  availableChairs,
  availableModels,
  onFrameworkChange,
  onModelChange,
  onRemove,
  canRemove,
  disabled = false,
}) => {
  const chairInfo = availableChairs.find((c) => c.id === chair.framework);
  const selectedModel = availableModels.find((m) => m.id === chair.modelId);

  return (
    <div className={styles.chairCard}>
      <div className={styles.chairHeader}>
        <h4 className={styles.chairTitle}>Chair {chairNumber}</h4>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className={styles.removeButton}
            disabled={disabled}
            aria-label={`Remove chair ${chairNumber}`}
          >
            Remove
          </button>
        )}
      </div>

      {/* Framework Selection */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Philosophical Framework</label>
        <select
          value={chair.framework}
          onChange={(e) => onFrameworkChange(e.target.value as PhilosophicalFramework)}
          className={styles.select}
          disabled={disabled}
          aria-label={`Select framework for chair ${chairNumber}`}
        >
          {availableChairs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Framework Description */}
      {chairInfo && (
        <div className={styles.frameworkInfo}>
          <p className={styles.coreQuestion}>"{chairInfo.coreQuestion}"</p>
          <p className={styles.description}>{chairInfo.description}</p>
        </div>
      )}

      {/* Model Selection */}
      <div className={styles.fieldGroup}>
        <label className={styles.label}>LLM Model</label>
        <select
          value={chair.modelId}
          onChange={(e) => {
            const model = availableModels.find((m) => m.id === e.target.value);
            onModelChange(e.target.value, model?.displayName, model?.provider);
          }}
          className={styles.select}
          disabled={disabled}
          aria-label={`Select model for chair ${chairNumber}`}
        >
          <option value="">Select a model...</option>
          {Object.entries(
            availableModels.reduce<Record<string, ModelInfo[]>>((acc, model) => {
              if (!acc[model.provider]) acc[model.provider] = [];
              acc[model.provider].push(model);
              return acc;
            }, {})
          ).map(([provider, models]) => (
            <optgroup key={provider} label={provider}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedModel && (
          <span className={`${styles.tierBadge} ${tierColors[selectedModel.costTier]}`}>
            {selectedModel.costTier}
          </span>
        )}
      </div>

      {/* Blind Spots Preview */}
      {chairInfo && (
        <details className={styles.blindSpots}>
          <summary className={styles.blindSpotsSummary}>
            Known Blind Spots (what they must acknowledge)
          </summary>
          <ul className={styles.blindSpotsList}>
            {chairInfo.blindSpotsToAdmit.map((spot, i) => (
              <li key={i}>{spot}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export default ChairCard;
