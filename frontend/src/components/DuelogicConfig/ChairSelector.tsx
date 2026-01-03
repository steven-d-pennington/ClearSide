/**
 * ChairSelector Component
 *
 * Manages the selection of multiple philosophical chairs for a Duelogic debate.
 */

import React, { useCallback } from 'react';
import { ChairCard } from './ChairCard';
import type {
  DuelogicChair,
  ChairInfo,
  ModelInfo,
  PhilosophicalFramework,
} from './duelogic-config.types';
import styles from './DuelogicConfig.module.css';

interface ChairSelectorProps {
  chairs: DuelogicChair[];
  onChairsChange: (chairs: DuelogicChair[]) => void;
  availableChairs: ChairInfo[];
  availableModels: ModelInfo[];
  maxChairs?: number;
  minChairs?: number;
  disabled?: boolean;
}

export const ChairSelector: React.FC<ChairSelectorProps> = ({
  chairs,
  onChairsChange,
  availableChairs,
  availableModels,
  maxChairs = 6,
  minChairs = 2,
  disabled = false,
}) => {
  const canAddChair = chairs.length < maxChairs;
  const canRemoveChair = chairs.length > minChairs;

  // Get next unused framework
  const getNextFramework = useCallback((): PhilosophicalFramework => {
    const usedFrameworks = new Set(chairs.map((c) => c.framework));
    const available = availableChairs.find((c) => !usedFrameworks.has(c.id as PhilosophicalFramework));
    return (available?.id || 'utilitarian') as PhilosophicalFramework;
  }, [chairs, availableChairs]);

  // Get default model
  const getDefaultModel = useCallback((): string => {
    return availableModels[0]?.id || '';
  }, [availableModels]);

  // Add a new chair
  const handleAddChair = useCallback(() => {
    if (!canAddChair) return;

    const newChair: DuelogicChair = {
      position: `chair_${chairs.length + 1}`,
      framework: getNextFramework(),
      modelId: getDefaultModel(),
    };

    onChairsChange([...chairs, newChair]);
  }, [chairs, canAddChair, getNextFramework, getDefaultModel, onChairsChange]);

  // Remove a chair
  const handleRemoveChair = useCallback(
    (index: number) => {
      if (!canRemoveChair) return;

      const updated = chairs.filter((_, i) => i !== index).map((chair, i) => ({
        ...chair,
        position: `chair_${i + 1}`,
      }));

      onChairsChange(updated);
    },
    [chairs, canRemoveChair, onChairsChange]
  );

  // Update chair framework
  const handleFrameworkChange = useCallback(
    (index: number, framework: PhilosophicalFramework) => {
      const updated = chairs.map((chair, i) =>
        i === index ? { ...chair, framework } : chair
      );
      onChairsChange(updated);
    },
    [chairs, onChairsChange]
  );

  // Update chair model
  const handleModelChange = useCallback(
    (index: number, modelId: string, displayName?: string, provider?: string) => {
      const updated = chairs.map((chair, i) =>
        i === index
          ? {
              ...chair,
              modelId,
              modelDisplayName: displayName,
              providerName: provider,
            }
          : chair
      );
      onChairsChange(updated);
    },
    [chairs, onChairsChange]
  );

  return (
    <div className={styles.chairSelector}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Philosophical Chairs</h3>
        <span className={styles.chairCount}>
          {chairs.length} / {maxChairs} chairs
        </span>
      </div>

      <div className={styles.chairGrid}>
        {chairs.map((chair, index) => (
          <ChairCard
            key={chair.position}
            chair={chair}
            chairNumber={index + 1}
            availableChairs={availableChairs}
            availableModels={availableModels}
            onFrameworkChange={(framework) => handleFrameworkChange(index, framework)}
            onModelChange={(modelId, displayName, provider) =>
              handleModelChange(index, modelId, displayName, provider)
            }
            onRemove={() => handleRemoveChair(index)}
            canRemove={canRemoveChair}
            disabled={disabled}
          />
        ))}
      </div>

      {canAddChair && (
        <button
          type="button"
          onClick={handleAddChair}
          className={styles.addChairButton}
          disabled={disabled}
        >
          + Add Another Chair
        </button>
      )}

      {chairs.length === maxChairs && (
        <p className={styles.maxChairsNote}>Maximum number of chairs reached</p>
      )}
    </div>
  );
};

export default ChairSelector;
