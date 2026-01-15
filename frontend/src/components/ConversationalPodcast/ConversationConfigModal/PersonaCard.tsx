/**
 * PersonaCard Component
 *
 * A single participant configuration card with persona and model selection.
 */

import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona } from '../../../types/conversation';
import type { ModelInfo } from '../../../types/configuration';

type HealthcheckStatus = 'idle' | 'checking' | 'healthy' | 'unhealthy';

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
  healthcheckStatus?: Record<string, HealthcheckStatus>;
  healthcheckErrors?: Record<string, string>;
  onHealthcheck?: (modelId: string) => void;
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
  healthcheckStatus = {},
  healthcheckErrors = {},
  onHealthcheck,
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
          <div className={styles.modelSelectRow}>
            <select
              className={`${styles.select} ${participant.modelId && healthcheckStatus[participant.modelId] === 'unhealthy' ? styles.unhealthySelect : ''}`}
              value={participant.modelId}
              onChange={e => onUpdate({ modelId: e.target.value })}
              disabled={disabled}
            >
              {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                <optgroup key={provider} label={provider}>
                  {providerModels.map(model => {
                    const status = healthcheckStatus[model.id];
                    const statusIcon = status === 'unhealthy' ? '⚠️ ' : status === 'healthy' ? '✓ ' : '';
                    return (
                      <option key={model.id} value={model.id}>
                        {statusIcon}{model.name}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            {participant.modelId && onHealthcheck && (
              <button
                type="button"
                className={`${styles.healthcheckBtn} ${
                  healthcheckStatus[participant.modelId] === 'checking' ? styles.checking :
                  healthcheckStatus[participant.modelId] === 'healthy' ? styles.healthyBtn :
                  healthcheckStatus[participant.modelId] === 'unhealthy' ? styles.unhealthyBtn : ''
                }`}
                onClick={() => onHealthcheck(participant.modelId)}
                disabled={disabled || healthcheckStatus[participant.modelId] === 'checking'}
                title={
                  healthcheckErrors[participant.modelId] ||
                  (healthcheckStatus[participant.modelId] === 'healthy' ? 'Model is responding' :
                   healthcheckStatus[participant.modelId] === 'unhealthy' ? 'Model is not responding' :
                   'Test model availability')
                }
              >
                {healthcheckStatus[participant.modelId] === 'checking' ? '⏳' :
                 healthcheckStatus[participant.modelId] === 'healthy' ? '✓' :
                 healthcheckStatus[participant.modelId] === 'unhealthy' ? '⚠' : '🔍'}
              </button>
            )}
          </div>
          {participant.modelId && healthcheckStatus[participant.modelId] === 'unhealthy' && healthcheckErrors[participant.modelId] && (
            <span className={styles.healthcheckError}>
              {healthcheckErrors[participant.modelId]}
            </span>
          )}
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
