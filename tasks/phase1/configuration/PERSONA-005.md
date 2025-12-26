# PERSONA-005: Frontend Persona Selector Component

**Priority:** P0
**Estimate:** M
**Labels:** `personas`, `frontend`, `ui`
**Status:** 🟢 TO DO

---

## Context

Create frontend components for selecting personas for Pro and Con advocates. This includes a card-based selector with persona details and integration with the InputForm.

**References:**
- [InputForm Component](../../../frontend/src/components/InputForm/InputForm.tsx) - Where to integrate
- [Configuration Types](./CONFIG-002.md) - Type patterns
- [Persona API](./PERSONA-004.md) - API endpoints

---

## Requirements

### Acceptance Criteria

- [ ] Add persona types to frontend configuration types
- [ ] Create `PersonaSelector` component for selecting Pro/Con personas
- [ ] Create `PersonaCard` component for individual persona display
- [ ] Fetch personas from API on component mount
- [ ] Allow independent selection for Pro and Con
- [ ] Show "Default" option for no persona selection
- [ ] Integrate with InputForm and pass to debate creation
- [ ] Display selected personas visually (emoji, color)

---

## Implementation Guide

### Frontend Types

Add to `frontend/src/types/configuration.ts`:

```typescript
// ============================================================================
// Persona Types
// ============================================================================

export type PersonaArchetype =
  | 'academic'
  | 'pragmatic'
  | 'empirical'
  | 'legal'
  | 'economic'
  | 'moral';

export interface Persona {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  description: string | null;
  avatarEmoji: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  argumentationStyle: string;
  focusAreas: string[];
  isSystemPersona: boolean;
}

export interface PersonaSelection {
  proPersonaId: string | null;
  conPersonaId: string | null;
}

export const ARCHETYPE_LABELS: Record<PersonaArchetype, string> = {
  academic: 'Theoretical',
  pragmatic: 'Pragmatic',
  empirical: 'Empirical',
  legal: 'Legal',
  economic: 'Economic',
  moral: 'Ethical',
};
```

### PersonaCard Component

Create `frontend/src/components/PersonaSelector/PersonaCard.tsx`:

```tsx
import React from 'react';
import type { Persona } from '../../types/configuration';
import { ARCHETYPE_LABELS } from '../../types/configuration';
import styles from './PersonaCard.module.css';

interface PersonaCardProps {
  persona: Persona | null; // null = Default option
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  side: 'pro' | 'con';
}

export const PersonaCard: React.FC<PersonaCardProps> = ({
  persona,
  isSelected,
  onSelect,
  disabled = false,
  side,
}) => {
  // Default card (no persona)
  if (!persona) {
    return (
      <button
        type="button"
        className={`${styles.card} ${styles.defaultCard} ${isSelected ? styles.selected : ''}`}
        onClick={onSelect}
        disabled={disabled}
      >
        <span className={styles.emoji}>⚖️</span>
        <span className={styles.name}>Default</span>
        <span className={styles.description}>Standard {side === 'pro' ? 'Pro' : 'Con'} advocate</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.card} ${isSelected ? styles.selected : ''}`}
      onClick={onSelect}
      disabled={disabled}
      style={{
        '--persona-color': persona.colorPrimary ?? '#6b7280',
        '--persona-color-light': persona.colorSecondary ?? '#9ca3af',
      } as React.CSSProperties}
    >
      <span className={styles.emoji}>{persona.avatarEmoji ?? '👤'}</span>
      <span className={styles.name}>{persona.name}</span>
      <span className={styles.archetype}>{ARCHETYPE_LABELS[persona.archetype]}</span>
      <span className={styles.description}>{persona.description}</span>
      <div className={styles.focusAreas}>
        {persona.focusAreas.slice(0, 3).map((area) => (
          <span key={area} className={styles.tag}>
            {area}
          </span>
        ))}
      </div>
    </button>
  );
};

export default PersonaCard;
```

### PersonaSelector Component

Create `frontend/src/components/PersonaSelector/PersonaSelector.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import type { Persona, PersonaSelection } from '../../types/configuration';
import { PersonaCard } from './PersonaCard';
import styles from './PersonaSelector.module.css';

interface PersonaSelectorProps {
  selection: PersonaSelection;
  onChange: (selection: PersonaSelection) => void;
  disabled?: boolean;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({
  selection,
  onChange,
  disabled = false,
}) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch personas on mount
  useEffect(() => {
    async function loadPersonas() {
      try {
        const response = await fetch('/api/personas');
        const data = await response.json();
        setPersonas(data.personas);
      } catch (error) {
        console.error('Failed to load personas:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadPersonas();
  }, []);

  const handleProSelect = (personaId: string | null) => {
    onChange({ ...selection, proPersonaId: personaId });
  };

  const handleConSelect = (personaId: string | null) => {
    onChange({ ...selection, conPersonaId: personaId });
  };

  // Get selected persona objects for display
  const selectedPro = personas.find((p) => p.id === selection.proPersonaId);
  const selectedCon = personas.find((p) => p.id === selection.conPersonaId);

  if (isLoading) {
    return <div className={styles.loading}>Loading personas...</div>;
  }

  return (
    <div className={`${styles.selector} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Debate Personas</h3>
        <span className={styles.subtitle}>Choose argumentation styles for each side</span>
        <button
          type="button"
          className={styles.expandToggle}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Collapse' : 'Customize'}
        </button>
      </div>

      {/* Quick view of current selection */}
      <div className={styles.quickView}>
        <div className={styles.selectedPersona}>
          <span className={styles.sideLabel}>PRO:</span>
          <span className={styles.selectedEmoji}>{selectedPro?.avatarEmoji ?? '⚖️'}</span>
          <span className={styles.selectedName}>{selectedPro?.name ?? 'Default'}</span>
        </div>
        <span className={styles.vs}>vs</span>
        <div className={styles.selectedPersona}>
          <span className={styles.sideLabel}>CON:</span>
          <span className={styles.selectedEmoji}>{selectedCon?.avatarEmoji ?? '⚖️'}</span>
          <span className={styles.selectedName}>{selectedCon?.name ?? 'Default'}</span>
        </div>
      </div>

      {/* Expanded selection panel */}
      {isExpanded && (
        <div className={styles.expandedPanel}>
          {/* Pro side */}
          <div className={styles.sideSection}>
            <h4 className={styles.sideTitle}>
              <span className={styles.proLabel}>PRO</span> Advocate
            </h4>
            <div className={styles.cardGrid}>
              {/* Default option */}
              <PersonaCard
                persona={null}
                isSelected={selection.proPersonaId === null}
                onSelect={() => handleProSelect(null)}
                disabled={disabled}
                side="pro"
              />
              {/* Persona options */}
              {personas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  isSelected={selection.proPersonaId === persona.id}
                  onSelect={() => handleProSelect(persona.id)}
                  disabled={disabled}
                  side="pro"
                />
              ))}
            </div>
          </div>

          {/* Con side */}
          <div className={styles.sideSection}>
            <h4 className={styles.sideTitle}>
              <span className={styles.conLabel}>CON</span> Advocate
            </h4>
            <div className={styles.cardGrid}>
              {/* Default option */}
              <PersonaCard
                persona={null}
                isSelected={selection.conPersonaId === null}
                onSelect={() => handleConSelect(null)}
                disabled={disabled}
                side="con"
              />
              {/* Persona options */}
              {personas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  isSelected={selection.conPersonaId === persona.id}
                  onSelect={() => handleConSelect(persona.id)}
                  disabled={disabled}
                  side="con"
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonaSelector;
```

### Update InputForm

Integrate into `frontend/src/components/InputForm/InputForm.tsx`:

```tsx
import { PersonaSelector } from '../PersonaSelector/PersonaSelector';
import type { PersonaSelection } from '../../types/configuration';

// Add to FormState:
interface FormState {
  question: string;
  context: string;
  flowMode: FlowMode;
  configuration: DebateConfiguration;
  personas: PersonaSelection; // NEW
}

// In component:
const [formState, setFormState] = useState<FormState>({
  question: '',
  context: '',
  flowMode: 'auto',
  configuration: DEFAULT_CONFIGURATION,
  personas: { proPersonaId: null, conPersonaId: null }, // NEW
});

// Add handler:
const handlePersonaChange = useCallback((selection: PersonaSelection) => {
  setFormState((prev) => ({ ...prev, personas: selection }));
}, []);

// Update handleSubmit:
await startDebate(
  proposition,
  formState.flowMode,
  formState.configuration,
  formState.personas // Pass personas
);

// In JSX, add PersonaSelector after ConfigPanel:
<PersonaSelector
  selection={formState.personas}
  onChange={handlePersonaChange}
  disabled={isLoading}
/>
```

### Update Debate Store

Update `frontend/src/stores/debate-store.ts`:

```typescript
import type { PersonaSelection } from '../types/configuration';

interface DebateStore {
  startDebate: (
    proposition: string,
    flowMode: FlowMode,
    configuration?: DebateConfiguration,
    personas?: PersonaSelection
  ) => Promise<void>;
}

// Update startDebate:
startDebate: async (proposition, flowMode, configuration, personas) => {
  // ...
  body: JSON.stringify({
    propositionText: proposition,
    flowMode,
    // Configuration
    presetMode: configuration?.presetMode,
    // ... other config fields
    // Personas
    proPersonaId: personas?.proPersonaId ?? null,
    conPersonaId: personas?.conPersonaId ?? null,
  }),
};
```

### CSS Styles

Create `frontend/src/components/PersonaSelector/PersonaSelector.module.css`:

```css
.selector {
  margin: var(--space-4) 0;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.subtitle {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  flex: 1;
}

.expandToggle {
  font-size: var(--text-sm);
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
}

.quickView {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-3);
  background: var(--color-background);
  border-radius: var(--radius-md);
}

.selectedPersona {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.sideLabel {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.selectedEmoji {
  font-size: var(--text-xl);
}

.selectedName {
  font-weight: 500;
}

.vs {
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
  font-weight: 600;
}

.expandedPanel {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.sideSection {
  margin-bottom: var(--space-4);
}

.sideTitle {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-3);
}

.proLabel {
  color: var(--color-pro);
}

.conLabel {
  color: var(--color-con);
}

.cardGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-3);
}

.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.loading {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-text-secondary);
}
```

Create `frontend/src/components/PersonaSelector/PersonaCard.module.css`:

```css
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-3);
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.card:hover {
  border-color: var(--persona-color, var(--color-primary));
}

.card.selected {
  border-color: var(--persona-color, var(--color-primary));
  background: color-mix(in srgb, var(--persona-color, var(--color-primary)) 10%, transparent);
}

.defaultCard {
  --persona-color: var(--color-text-tertiary);
}

.emoji {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-2);
}

.name {
  font-weight: 600;
  font-size: var(--text-sm);
  margin-bottom: var(--space-1);
}

.archetype {
  font-size: var(--text-xs);
  color: var(--persona-color, var(--color-primary));
  font-weight: 500;
  margin-bottom: var(--space-1);
}

.description {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin-bottom: var(--space-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.focusAreas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  justify-content: center;
}

.tag {
  font-size: var(--text-xs);
  padding: 2px 6px;
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}
```

---

## Dependencies

**Task Dependencies:**
- PERSONA-004: Persona API endpoints
- CONFIG-007: ConfigPanel (similar integration pattern)

---

## Validation

### Component Tests

```tsx
// frontend/src/components/PersonaSelector/__tests__/PersonaSelector.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonaSelector } from '../PersonaSelector';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        personas: [
          { id: 'theorist', name: 'The Theorist', archetype: 'academic', avatarEmoji: '🎓', focusAreas: ['philosophy'] },
          { id: 'scientist', name: 'The Scientist', archetype: 'empirical', avatarEmoji: '🔬', focusAreas: ['research'] },
        ],
      }),
  })
) as jest.Mock;

describe('PersonaSelector', () => {
  it('renders quick view with default selection', async () => {
    render(
      <PersonaSelector
        selection={{ proPersonaId: null, conPersonaId: null }}
        onChange={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('PRO:')).toBeInTheDocument();
      expect(screen.getByText('CON:')).toBeInTheDocument();
      expect(screen.getAllByText('Default')).toHaveLength(2);
    });
  });

  it('expands to show persona cards', async () => {
    render(
      <PersonaSelector
        selection={{ proPersonaId: null, conPersonaId: null }}
        onChange={jest.fn()}
      />
    );

    await waitFor(() => screen.getByText('Customize'));
    fireEvent.click(screen.getByText('Customize'));

    expect(screen.getByText('The Theorist')).toBeInTheDocument();
    expect(screen.getByText('The Scientist')).toBeInTheDocument();
  });

  it('calls onChange when persona selected', async () => {
    const onChange = jest.fn();
    render(
      <PersonaSelector
        selection={{ proPersonaId: null, conPersonaId: null }}
        onChange={onChange}
      />
    );

    await waitFor(() => screen.getByText('Customize'));
    fireEvent.click(screen.getByText('Customize'));
    fireEvent.click(screen.getByText('The Theorist'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ proPersonaId: 'theorist' })
    );
  });
});
```

### Definition of Done

- [ ] Persona types added to frontend
- [ ] PersonaCard component created and styled
- [ ] PersonaSelector component created
- [ ] Personas fetched from API
- [ ] Quick view shows current selection
- [ ] Expanded view shows all options
- [ ] Pro and Con can be selected independently
- [ ] Default option available
- [ ] Integrated into InputForm
- [ ] Debate store passes personas to API
- [ ] Component tests written and passing

---

## Notes

### UX Design

- **Quick view**: Shows selected personas without expanding
- **Customize button**: Expands to full selection grid
- **Visual cues**: Emoji and color make selection clear
- **Independent selection**: Pro and Con are separate choices

### Accessibility

- All cards are keyboard accessible
- Selected state is visually distinct
- Focus states properly styled

---

**Estimated Time:** 6 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
