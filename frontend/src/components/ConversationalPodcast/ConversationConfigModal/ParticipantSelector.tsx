/**
 * ParticipantSelector Component
 *
 * Manages 2-6 participant slots for the conversation.
 */

import PersonaCard from './PersonaCard';
import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona } from '../../../types/conversation';
import type { ModelInfo } from '../../../types/configuration';

type HealthcheckStatus = 'idle' | 'checking' | 'healthy' | 'unhealthy';

interface ParticipantConfig {
  personaId: string | null;
  modelId: string;
  displayNameOverride?: string;
}

interface ParticipantSelectorProps {
  participants: ParticipantConfig[];
  personas: PodcastPersona[];
  models: ModelInfo[];
  onUpdateParticipant: (index: number, updates: Partial<ParticipantConfig>) => void;
  onAddParticipant: () => void;
  onRemoveParticipant: (index: number) => void;
  disabled?: boolean;
  healthcheckStatus?: Record<string, HealthcheckStatus>;
  healthcheckErrors?: Record<string, string>;
  onHealthcheck?: (modelId: string) => void;
}

export default function ParticipantSelector({
  participants,
  personas,
  models,
  onUpdateParticipant,
  onAddParticipant,
  onRemoveParticipant,
  disabled,
  healthcheckStatus,
  healthcheckErrors,
  onHealthcheck,
}: ParticipantSelectorProps) {
  const selectedPersonaIds = participants.map(p => p.personaId).filter(Boolean);
  const availablePersonas = personas.filter(p => !selectedPersonaIds.includes(p.id));

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Participants ({participants.length}/6)</h3>
        {participants.length < 6 && (
          <button
            className={styles.addButton}
            onClick={onAddParticipant}
            disabled={disabled}
          >
            + Add Guest
          </button>
        )}
      </div>

      <div className={styles.participantGrid}>
        {participants.map((participant, index) => (
          <PersonaCard
            key={index}
            index={index}
            participant={participant}
            personas={personas}
            availablePersonas={availablePersonas}
            models={models}
            onUpdate={updates => onUpdateParticipant(index, updates)}
            onRemove={participants.length > 2 ? () => onRemoveParticipant(index) : undefined}
            disabled={disabled}
            healthcheckStatus={healthcheckStatus}
            healthcheckErrors={healthcheckErrors}
            onHealthcheck={onHealthcheck}
          />
        ))}
      </div>
    </div>
  );
}
