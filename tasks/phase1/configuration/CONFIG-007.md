# CONFIG-007: Frontend Configuration Panel

**Priority:** P0
**Estimate:** M
**Labels:** `configuration`, `frontend`, `ui`
**Status:** 🟢 TO DO

---

## Context

Create the frontend components for debate configuration, including a preset selector, custom settings panel with sliders, and integration with the InputForm component.

**References:**
- [InputForm Component](../../../frontend/src/components/InputForm/InputForm.tsx) - Where to integrate
- [Configuration Types](./CONFIG-002.md) - Type definitions to mirror

---

## Requirements

### Acceptance Criteria

- [ ] Create `frontend/src/types/configuration.ts` mirroring backend types
- [ ] Create `ConfigPanel` component with preset selector
- [ ] Create `BrevitySlider` component (1-5 scale)
- [ ] Create `TemperatureSlider` component (0-1 scale)
- [ ] Integrate ConfigPanel into InputForm
- [ ] Update debate store to include configuration
- [ ] Fetch presets from API on component mount
- [ ] Pass configuration to startDebate API call

---

## Implementation Guide

### Frontend Types

Create `frontend/src/types/configuration.ts`:

```typescript
/**
 * Frontend configuration types (mirrors backend)
 */

export type PresetMode = 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom';
export type BrevityLevel = 1 | 2 | 3 | 4 | 5;

export interface DebateLLMSettings {
  temperature: number;
  maxTokensPerResponse: number;
}

export interface DebateConfiguration {
  presetMode: PresetMode;
  brevityLevel: BrevityLevel;
  llmSettings: DebateLLMSettings;
  requireCitations: boolean;
}

export interface DebatePreset {
  id: string;
  name: string;
  description: string | null;
  brevityLevel: BrevityLevel;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
  isSystemPreset: boolean;
}

export const DEFAULT_CONFIGURATION: DebateConfiguration = {
  presetMode: 'balanced',
  brevityLevel: 3,
  llmSettings: {
    temperature: 0.7,
    maxTokensPerResponse: 1024,
  },
  requireCitations: false,
};

export const BREVITY_LABELS: Record<BrevityLevel, string> = {
  1: 'Very Detailed',
  2: 'Detailed',
  3: 'Balanced',
  4: 'Concise',
  5: 'Very Concise',
};

export const PRESET_INFO: Record<PresetMode, { name: string; description: string; icon: string }> = {
  quick: {
    name: 'Quick',
    description: 'Fast, concise analysis',
    icon: 'zap',
  },
  balanced: {
    name: 'Balanced',
    description: 'Default settings',
    icon: 'scale',
  },
  deep_dive: {
    name: 'Deep Dive',
    description: 'Thorough exploration',
    icon: 'search',
  },
  research: {
    name: 'Research',
    description: 'Citations required',
    icon: 'book',
  },
  custom: {
    name: 'Custom',
    description: 'Your settings',
    icon: 'settings',
  },
};
```

### ConfigPanel Component

Create `frontend/src/components/ConfigPanel/ConfigPanel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import type { DebateConfiguration, DebatePreset, PresetMode, BrevityLevel } from '../../types/configuration';
import { DEFAULT_CONFIGURATION, PRESET_INFO, BREVITY_LABELS } from '../../types/configuration';
import { BrevitySlider } from './BrevitySlider';
import { TemperatureSlider } from './TemperatureSlider';
import styles from './ConfigPanel.module.css';

interface ConfigPanelProps {
  configuration: DebateConfiguration;
  onChange: (config: DebateConfiguration) => void;
  disabled?: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  configuration,
  onChange,
  disabled = false,
}) => {
  const [presets, setPresets] = useState<DebatePreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(configuration.presetMode === 'custom');

  // Fetch presets on mount
  useEffect(() => {
    async function loadPresets() {
      try {
        const response = await fetch('/api/presets');
        const data = await response.json();
        setPresets(data.presets);
      } catch (error) {
        console.error('Failed to load presets:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadPresets();
  }, []);

  // Handle preset selection
  const handlePresetChange = (presetId: PresetMode) => {
    if (presetId === 'custom') {
      setShowAdvanced(true);
      onChange({ ...configuration, presetMode: 'custom' });
      return;
    }

    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setShowAdvanced(false);
      onChange({
        presetMode: presetId,
        brevityLevel: preset.brevityLevel,
        llmSettings: {
          temperature: preset.llmTemperature,
          maxTokensPerResponse: preset.maxTokensPerResponse,
        },
        requireCitations: preset.requireCitations,
      });
    }
  };

  // Handle individual setting changes
  const handleBrevityChange = (level: BrevityLevel) => {
    onChange({
      ...configuration,
      presetMode: 'custom',
      brevityLevel: level,
    });
    setShowAdvanced(true);
  };

  const handleTemperatureChange = (temp: number) => {
    onChange({
      ...configuration,
      presetMode: 'custom',
      llmSettings: {
        ...configuration.llmSettings,
        temperature: temp,
      },
    });
    setShowAdvanced(true);
  };

  const handleCitationsChange = (required: boolean) => {
    onChange({
      ...configuration,
      presetMode: 'custom',
      requireCitations: required,
    });
    setShowAdvanced(true);
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading presets...</div>;
  }

  return (
    <div className={`${styles.configPanel} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Debate Style</h3>
        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </button>
      </div>

      {/* Preset Selector */}
      <div className={styles.presetGrid}>
        {(['quick', 'balanced', 'deep_dive', 'research'] as PresetMode[]).map((presetId) => {
          const info = PRESET_INFO[presetId];
          const isSelected = configuration.presetMode === presetId;

          return (
            <button
              key={presetId}
              type="button"
              className={`${styles.presetCard} ${isSelected ? styles.selected : ''}`}
              onClick={() => handlePresetChange(presetId)}
              disabled={disabled}
            >
              <span className={styles.presetName}>{info.name}</span>
              <span className={styles.presetDesc}>{info.description}</span>
            </button>
          );
        })}
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className={styles.advancedPanel}>
          <div className={styles.setting}>
            <label className={styles.settingLabel}>
              Response Length
              <span className={styles.settingValue}>
                {BREVITY_LABELS[configuration.brevityLevel]}
              </span>
            </label>
            <BrevitySlider
              value={configuration.brevityLevel}
              onChange={handleBrevityChange}
              disabled={disabled}
            />
          </div>

          <div className={styles.setting}>
            <label className={styles.settingLabel}>
              Creativity
              <span className={styles.settingValue}>
                {configuration.llmSettings.temperature.toFixed(1)}
              </span>
            </label>
            <TemperatureSlider
              value={configuration.llmSettings.temperature}
              onChange={handleTemperatureChange}
              disabled={disabled}
            />
            <p className={styles.settingHint}>
              Lower = more focused, Higher = more creative
            </p>
          </div>

          <div className={styles.setting}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={configuration.requireCitations}
                onChange={(e) => handleCitationsChange(e.target.checked)}
                disabled={disabled}
              />
              <span>Require citations for all claims</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;
```

### BrevitySlider Component

Create `frontend/src/components/ConfigPanel/BrevitySlider.tsx`:

```tsx
import React from 'react';
import type { BrevityLevel } from '../../types/configuration';
import { BREVITY_LABELS } from '../../types/configuration';
import styles from './BrevitySlider.module.css';

interface BrevitySliderProps {
  value: BrevityLevel;
  onChange: (level: BrevityLevel) => void;
  disabled?: boolean;
}

export const BrevitySlider: React.FC<BrevitySliderProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(e.target.value, 10) as BrevityLevel);
  };

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={styles.slider}
      />
      <div className={styles.labels}>
        <span className={value === 1 ? styles.active : ''}>Detailed</span>
        <span className={value === 3 ? styles.active : ''}>Balanced</span>
        <span className={value === 5 ? styles.active : ''}>Concise</span>
      </div>
    </div>
  );
};

export default BrevitySlider;
```

### TemperatureSlider Component

Create `frontend/src/components/ConfigPanel/TemperatureSlider.tsx`:

```tsx
import React from 'react';
import styles from './TemperatureSlider.module.css';

interface TemperatureSliderProps {
  value: number;
  onChange: (temp: number) => void;
  disabled?: boolean;
}

export const TemperatureSlider: React.FC<TemperatureSliderProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={styles.slider}
      />
      <div className={styles.labels}>
        <span className={value < 0.4 ? styles.active : ''}>Focused</span>
        <span className={value >= 0.4 && value <= 0.7 ? styles.active : ''}>Balanced</span>
        <span className={value > 0.7 ? styles.active : ''}>Creative</span>
      </div>
    </div>
  );
};

export default TemperatureSlider;
```

### Update InputForm

Integrate ConfigPanel into `frontend/src/components/InputForm/InputForm.tsx`:

```tsx
import { ConfigPanel } from '../ConfigPanel/ConfigPanel';
import type { DebateConfiguration } from '../../types/configuration';
import { DEFAULT_CONFIGURATION } from '../../types/configuration';

// Add to FormState interface:
interface FormState {
  question: string;
  context: string;
  flowMode: FlowMode;
  configuration: DebateConfiguration; // NEW
}

// In component:
const [formState, setFormState] = useState<FormState>({
  question: '',
  context: '',
  flowMode: 'auto',
  configuration: DEFAULT_CONFIGURATION, // NEW
});

// Add handler:
const handleConfigChange = useCallback((config: DebateConfiguration) => {
  setFormState(prev => ({ ...prev, configuration: config }));
}, []);

// Update handleSubmit to pass configuration:
const handleSubmit = async (e: React.FormEvent) => {
  // ... validation code ...

  await startDebate(proposition, formState.flowMode, formState.configuration);
  // ... rest of submit logic
};

// In JSX, add ConfigPanel after flow mode selector:
<ConfigPanel
  configuration={formState.configuration}
  onChange={handleConfigChange}
  disabled={isLoading}
/>
```

### Update Debate Store

Update `frontend/src/stores/debate-store.ts`:

```typescript
import type { DebateConfiguration } from '../types/configuration';

interface DebateStore {
  // ... existing fields
  startDebate: (
    proposition: string,
    flowMode: FlowMode,
    configuration?: DebateConfiguration
  ) => Promise<void>;
}

// Update startDebate action:
startDebate: async (proposition, flowMode, configuration) => {
  set({ isLoading: true, error: null });

  try {
    const response = await fetch('/api/debates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propositionText: proposition,
        flowMode,
        // Configuration fields
        presetMode: configuration?.presetMode,
        brevityLevel: configuration?.brevityLevel,
        llmTemperature: configuration?.llmSettings?.temperature,
        maxTokensPerResponse: configuration?.llmSettings?.maxTokensPerResponse,
        requireCitations: configuration?.requireCitations,
      }),
    });

    // ... rest of implementation
  } catch (error) {
    // ... error handling
  }
};
```

### CSS Styles

Create `frontend/src/components/ConfigPanel/ConfigPanel.module.css`:

```css
.configPanel {
  margin: var(--space-4) 0;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.advancedToggle {
  font-size: var(--text-sm);
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
}

.presetGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}

.presetCard {
  padding: var(--space-3);
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.presetCard:hover {
  border-color: var(--color-primary);
}

.presetCard.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.presetName {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-1);
}

.presetDesc {
  display: block;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.advancedPanel {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.setting {
  margin-bottom: var(--space-4);
}

.settingLabel {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  font-weight: 500;
  margin-bottom: var(--space-2);
}

.settingValue {
  color: var(--color-primary);
}

.settingHint {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin-top: var(--space-1);
}

.checkboxLabel {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  cursor: pointer;
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

/* Responsive */
@media (max-width: 640px) {
  .presetGrid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-006: API endpoints (to fetch presets)

---

## Validation

### Component Tests

```tsx
// frontend/src/components/ConfigPanel/__tests__/ConfigPanel.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigPanel } from '../ConfigPanel';
import { DEFAULT_CONFIGURATION } from '../../../types/configuration';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({
      presets: [
        { id: 'quick', name: 'Quick', brevityLevel: 5, llmTemperature: 0.5, maxTokensPerResponse: 512, requireCitations: false },
        { id: 'balanced', name: 'Balanced', brevityLevel: 3, llmTemperature: 0.7, maxTokensPerResponse: 1024, requireCitations: false },
      ],
    }),
  })
) as jest.Mock;

describe('ConfigPanel', () => {
  it('renders preset options', async () => {
    render(
      <ConfigPanel
        configuration={DEFAULT_CONFIGURATION}
        onChange={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Quick')).toBeInTheDocument();
      expect(screen.getByText('Balanced')).toBeInTheDocument();
    });
  });

  it('calls onChange when preset selected', async () => {
    const onChange = jest.fn();
    render(
      <ConfigPanel
        configuration={DEFAULT_CONFIGURATION}
        onChange={onChange}
      />
    );

    await waitFor(() => screen.getByText('Quick'));
    fireEvent.click(screen.getByText('Quick'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ presetMode: 'quick' })
    );
  });

  it('shows advanced settings when expanded', async () => {
    render(
      <ConfigPanel
        configuration={DEFAULT_CONFIGURATION}
        onChange={jest.fn()}
      />
    );

    await waitFor(() => screen.getByText('Show Advanced'));
    fireEvent.click(screen.getByText('Show Advanced'));

    expect(screen.getByText('Response Length')).toBeInTheDocument();
    expect(screen.getByText('Creativity')).toBeInTheDocument();
  });
});
```

### Definition of Done

- [ ] Configuration types created in frontend
- [ ] ConfigPanel component created and styled
- [ ] BrevitySlider component created
- [ ] TemperatureSlider component created
- [ ] ConfigPanel integrated into InputForm
- [ ] Debate store updated to pass configuration
- [ ] Presets fetched from API
- [ ] Component tests written and passing
- [ ] Responsive design working

---

## Notes

### UX Considerations

- Presets are shown as primary option (most users won't customize)
- Advanced settings collapsed by default
- Selecting any advanced setting automatically switches to "custom" mode
- Clear visual feedback on selected preset

### Accessibility

- All controls keyboard accessible
- Sliders have proper labels
- Checkboxes have associated labels

---

**Estimated Time:** 6 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
