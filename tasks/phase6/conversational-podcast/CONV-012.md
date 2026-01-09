# CONV-012: ConversationConfigModal

**Task ID:** CONV-012
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-002 (Types), CONV-009 (API Routes)
**Status:** Done

---

## Context

This task creates the ConversationConfigModal - the main configuration UI for setting up a new podcast conversation. Users can enter a topic, select 2-6 personas with model assignments, and choose a flow mode.

**References:**
- [CONV-002](./CONV-002.md) - Frontend types
- [CONV-009](./CONV-009.md) - API routes for personas and sessions
- Existing pattern: `frontend/src/components/LaunchDebateModal/`

---

## Requirements

### Acceptance Criteria

- [x] Create `ConversationConfigModal` component
- [x] Create `TopicInput` subcomponent for topic entry
- [x] Create `ParticipantSelector` for 2-6 participant slots
- [x] Create `PersonaCard` for persona + model assignment
- [x] Create `FlowModeSelector` for flow mode choice
- [x] Fetch personas from API on mount
- [x] Validate at least 2 participants selected
- [x] Submit creates session via API
- [x] Handle loading and error states

---

## Implementation Guide

### Directory Structure

```
frontend/src/components/ConversationalPodcast/
├── ConversationConfigModal/
│   ├── ConversationConfigModal.tsx
│   ├── ConversationConfigModal.module.css
│   ├── TopicInput.tsx
│   ├── ParticipantSelector.tsx
│   ├── PersonaCard.tsx
│   ├── FlowModeSelector.tsx
│   └── index.ts
```

### Main Modal Component

Create file: `frontend/src/components/ConversationalPodcast/ConversationConfigModal/ConversationConfigModal.tsx`

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../../ui';
import TopicInput from './TopicInput';
import ParticipantSelector from './ParticipantSelector';
import FlowModeSelector from './FlowModeSelector';
import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona, FlowMode, ModelInfo } from '../../../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ParticipantConfig {
  personaId: string | null;
  modelId: string;
  displayNameOverride?: string;
}

interface ConversationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (sessionId: string) => void;
  initialTopic?: string;
  initialContext?: string;
  episodeProposalId?: string;
}

export function ConversationConfigModal({
  isOpen,
  onClose,
  onLaunch,
  initialTopic = '',
  initialContext = '',
  episodeProposalId,
}: ConversationConfigModalProps) {
  // State
  const [topic, setTopic] = useState(initialTopic);
  const [topicContext, setTopicContext] = useState(initialContext);
  const [personas, setPersonas] = useState<PodcastPersona[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [participants, setParticipants] = useState<ParticipantConfig[]>([
    { personaId: null, modelId: '' },
    { personaId: null, modelId: '' },
  ]);
  const [flowMode, setFlowMode] = useState<FlowMode>('manual');
  const [paceDelayMs, setPaceDelayMs] = useState(3000);

  // Loading/error states
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch personas and models on mount
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [personasRes, modelsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/conversations/personas`),
          fetch(`${API_BASE_URL}/api/models`),
        ]);

        if (!personasRes.ok) throw new Error('Failed to load personas');
        if (!modelsRes.ok) throw new Error('Failed to load models');

        const personasData = await personasRes.json();
        const modelsData = await modelsRes.json();

        setPersonas(personasData.personas || []);
        setModels(modelsData.models || []);

        // Set default models for participants
        const defaultModel = modelsData.models?.[0]?.id || '';
        setParticipants(prev =>
          prev.map(p => ({ ...p, modelId: p.modelId || defaultModel }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [isOpen]);

  // Update participant
  const updateParticipant = useCallback((index: number, updates: Partial<ParticipantConfig>) => {
    setParticipants(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  }, []);

  // Add participant (max 6)
  const addParticipant = useCallback(() => {
    if (participants.length >= 6) return;
    const defaultModel = models[0]?.id || '';
    setParticipants(prev => [...prev, { personaId: null, modelId: defaultModel }]);
  }, [participants.length, models]);

  // Remove participant (min 2)
  const removeParticipant = useCallback((index: number) => {
    if (participants.length <= 2) return;
    setParticipants(prev => prev.filter((_, i) => i !== index));
  }, [participants.length]);

  // Validate form
  const isValid = useCallback(() => {
    if (!topic.trim()) return false;
    if (participants.length < 2) return false;

    for (const p of participants) {
      if (!p.personaId || !p.modelId) return false;
    }

    // Check for duplicate personas
    const personaIds = participants.map(p => p.personaId).filter(Boolean);
    if (new Set(personaIds).size !== personaIds.length) return false;

    return true;
  }, [topic, participants]);

  // Create session
  const handleCreate = async () => {
    if (!isValid()) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          topicContext: topicContext.trim() || undefined,
          episodeProposalId,
          flowMode,
          paceDelayMs,
          participants: participants.map(p => ({
            personaId: p.personaId,
            modelId: p.modelId,
            displayNameOverride: p.displayNameOverride || undefined,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const { session } = await response.json();
      onLaunch(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Start Conversation</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={isCreating}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading personas...</span>
          </div>
        ) : (
          <div className={styles.body}>
            <TopicInput
              topic={topic}
              onTopicChange={setTopic}
              topicContext={topicContext}
              onContextChange={setTopicContext}
              disabled={isCreating}
            />

            <div className={styles.divider} />

            <ParticipantSelector
              participants={participants}
              personas={personas}
              models={models}
              onUpdateParticipant={updateParticipant}
              onAddParticipant={addParticipant}
              onRemoveParticipant={removeParticipant}
              disabled={isCreating}
            />

            <div className={styles.divider} />

            <FlowModeSelector
              mode={flowMode}
              onModeChange={setFlowMode}
              paceDelayMs={paceDelayMs}
              onPaceChange={setPaceDelayMs}
              disabled={isCreating}
            />
          </div>
        )}

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            loading={isCreating}
            disabled={!isValid() || isLoading}
          >
            Start Conversation
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConversationConfigModal;
```

### TopicInput Component

Create file: `TopicInput.tsx`

```tsx
import styles from './ConversationConfigModal.module.css';

interface TopicInputProps {
  topic: string;
  onTopicChange: (topic: string) => void;
  topicContext: string;
  onContextChange: (context: string) => void;
  disabled?: boolean;
}

export default function TopicInput({
  topic,
  onTopicChange,
  topicContext,
  onContextChange,
  disabled,
}: TopicInputProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Topic</h3>

      <div className={styles.inputGroup}>
        <label className={styles.label}>What should we discuss?</label>
        <input
          type="text"
          className={styles.input}
          value={topic}
          onChange={e => onTopicChange(e.target.value)}
          placeholder="e.g., The future of AI in healthcare"
          disabled={disabled}
          maxLength={500}
        />
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.label}>Additional context (optional)</label>
        <textarea
          className={styles.textarea}
          value={topicContext}
          onChange={e => onContextChange(e.target.value)}
          placeholder="Any specific angles or questions you want explored..."
          disabled={disabled}
          rows={3}
          maxLength={2000}
        />
      </div>
    </div>
  );
}
```

### ParticipantSelector Component

Create file: `ParticipantSelector.tsx`

```tsx
import PersonaCard from './PersonaCard';
import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona, ModelInfo } from '../../../types/conversation';

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
}

export default function ParticipantSelector({
  participants,
  personas,
  models,
  onUpdateParticipant,
  onAddParticipant,
  onRemoveParticipant,
  disabled,
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
          />
        ))}
      </div>
    </div>
  );
}
```

### PersonaCard Component

Create file: `PersonaCard.tsx`

```tsx
import styles from './ConversationConfigModal.module.css';
import type { PodcastPersona, ModelInfo } from '../../../types/conversation';

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
            ×
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
```

### FlowModeSelector Component

Create file: `FlowModeSelector.tsx`

```tsx
import styles from './ConversationConfigModal.module.css';
import type { FlowMode } from '../../../types/conversation';

interface FlowModeSelectorProps {
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  paceDelayMs: number;
  onPaceChange: (delay: number) => void;
  disabled?: boolean;
}

const FLOW_MODES = [
  {
    id: 'manual' as FlowMode,
    name: 'Manual',
    description: 'Click "Next" to advance each turn',
    icon: '👆',
  },
  {
    id: 'auto_stream' as FlowMode,
    name: 'Auto Stream',
    description: 'Conversation flows automatically',
    icon: '▶️',
  },
  {
    id: 'natural_pace' as FlowMode,
    name: 'Natural Pace',
    description: 'Automatic with realistic pauses',
    icon: '🎙️',
  },
];

export default function FlowModeSelector({
  mode,
  onModeChange,
  paceDelayMs,
  onPaceChange,
  disabled,
}: FlowModeSelectorProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Flow Mode</h3>

      <div className={styles.flowModeGrid}>
        {FLOW_MODES.map(flowMode => (
          <button
            key={flowMode.id}
            className={`${styles.flowModeCard} ${mode === flowMode.id ? styles.selected : ''}`}
            onClick={() => onModeChange(flowMode.id)}
            disabled={disabled}
          >
            <span className={styles.flowModeIcon}>{flowMode.icon}</span>
            <span className={styles.flowModeName}>{flowMode.name}</span>
            <span className={styles.flowModeDesc}>{flowMode.description}</span>
          </button>
        ))}
      </div>

      {mode === 'natural_pace' && (
        <div className={styles.paceControl}>
          <label className={styles.label}>
            Pause between turns: {(paceDelayMs / 1000).toFixed(1)}s
          </label>
          <input
            type="range"
            min={500}
            max={10000}
            step={500}
            value={paceDelayMs}
            onChange={e => onPaceChange(parseInt(e.target.value))}
            disabled={disabled}
            className={styles.slider}
          />
        </div>
      )}
    </div>
  );
}
```

### Export Index

Create file: `index.ts`

```typescript
export { default as ConversationConfigModal } from './ConversationConfigModal';
export { default as TopicInput } from './TopicInput';
export { default as ParticipantSelector } from './ParticipantSelector';
export { default as PersonaCard } from './PersonaCard';
export { default as FlowModeSelector } from './FlowModeSelector';
```

---

## Validation

### How to Test

1. Import modal in a page and render:
   ```tsx
   <ConversationConfigModal
     isOpen={isModalOpen}
     onClose={() => setIsModalOpen(false)}
     onLaunch={(sessionId) => navigate(`/conversation/${sessionId}`)}
   />
   ```

2. Verify:
   - Personas load from API
   - Can select 2-6 participants
   - Cannot select same persona twice
   - Model dropdowns work
   - Flow mode selection works
   - Form validation prevents invalid submission
   - Session creation works

### Definition of Done

- [x] Modal opens and closes correctly
- [x] Personas and models load from API
- [x] Can configure 2-6 participants
- [x] Each participant has persona + model selection
- [x] Duplicate persona selection prevented
- [x] Flow mode selection works
- [x] Natural pace shows delay slider
- [x] Validation prevents invalid submissions
- [x] Session creation calls API correctly
- [x] Loading and error states displayed
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-012 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
