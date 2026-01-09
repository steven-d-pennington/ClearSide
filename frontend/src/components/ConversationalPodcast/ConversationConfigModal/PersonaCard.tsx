/**
 * PersonaCard Component
 *
 * A single participant configuration card with persona and model selection.
 */

import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona } from '../../../types/conversation';
import type { ModelInfo } from '../../../types/configuration';

interface ParticipantConfig {
  personaId: string | null;
  modelId: string;
  displayNameOverride?: string;
}

interface PersonaCardProps {
  index: number;
  participant: ParticipantConfig;
  personas: PodcastPersona[];
  availablePersonas: PodcastPersona[];
  models: ModelInfo[];
  onUpdate: (updates: Partial<ParticipantConfig>) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

export default function PersonaCard({
  index,
  participant,
  personas,
  availablePersonas,
  models,
  onUpdate,
  onRemove,
  disabled,
}: PersonaCardProps) {
  const selectedPersona = personas.find(p => p.id === participant.personaId);

  // Group models by provider
  const modelsByProvider = models.reduce<Record<string, ModelInfo[]>>((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider].push(model);
    return acc;
  }, {});

  return (
    <div className={styles.personaCard}>
      <div className={styles.cardHeader}>
        <span className={styles.guestLabel}>Guest {index + 1}</span>
        {onRemove && (
          <button
            className={styles.removeButton}
            onClick={onRemove}
            disabled={disabled}
            title="Remove guest"
          >
            &times;
          </button>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.selectGroup}>
          <label className={styles.selectLabel}>Persona</label>
          <select
            className={styles.select}
            value={participant.personaId || ''}
            onChange={e => onUpdate({ personaId: e.target.value || null })}
            disabled={disabled}
          >
            <option value="">Select persona...</option>
            {/* Show selected persona even if not in available list */}
            {selectedPersona && (
              <option key={selectedPersona.id} value={selectedPersona.id}>
                {selectedPersona.avatarEmoji} {selectedPersona.name}
              </option>
            )}
            {availablePersonas.map(persona => (
              <option key={persona.id} value={persona.id}>
                {persona.avatarEmoji} {persona.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPersona && (
          <p className={styles.personaPreview}>
            {selectedPersona.backstory.split('.')[0]}.
          </p>
        )}

        <div className={styles.selectGroup}>
          <label className={styles.selectLabel}>Model</label>
          <select
            className={styles.select}
            value={participant.modelId}
            onChange={e => onUpdate({ modelId: e.target.value })}
            disabled={disabled}
          >
            {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
              <optgroup key={provider} label={provider}>
                {providerModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className={styles.selectGroup}>
          <label className={styles.selectLabel}>Display name (optional)</label>
          <input
            type="text"
            className={styles.smallInput}
            value={participant.displayNameOverride || ''}
            onChange={e => onUpdate({ displayNameOverride: e.target.value })}
            placeholder={selectedPersona?.name || 'Custom name...'}
            disabled={disabled}
            maxLength={100}
          />
        </div>
      </div>
    </div>
  );
}
