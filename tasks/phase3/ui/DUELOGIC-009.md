# DUELOGIC-009: Frontend Configuration UI

**Priority:** P1
**Estimate:** L (2-3 days)
**Labels:** `ui`, `frontend`, `duelogic`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-008

---

## Context

The Frontend Configuration UI allows users to set up Duelogic debates by selecting philosophical chairs, assigning LLM models, choosing presets, and configuring debate parameters.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Configuration Defaults section
- [Existing UI Components](../../../frontend/src/components/) - UI patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create `frontend/src/components/DuelogicConfig/` component folder
- [ ] ChairSelector - visual selection of philosophical frameworks
- [ ] ModelSelector - dropdown for LLM model per chair
- [ ] PresetSelector - quick setup with preset matchups
- [ ] InterruptionSettings - configure interruption behavior
- [ ] ToneSelector - respectful/spirited/heated toggle
- [ ] ArbiterSettings - accountability level, model selection
- [ ] Full DuelogicConfigPanel integrating all components
- [ ] Form validation with helpful error messages
- [ ] Responsive design for mobile
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Integration with API endpoints

---

## Implementation Guide

### File Structure

```
frontend/src/components/DuelogicConfig/
├── index.ts
├── DuelogicConfigPanel.tsx
├── ChairSelector.tsx
├── ChairCard.tsx
├── ModelSelector.tsx
├── PresetSelector.tsx
├── PresetCard.tsx
├── InterruptionSettings.tsx
├── ToneSelector.tsx
├── ArbiterSettings.tsx
├── FlowSettings.tsx
└── duelogic-config.types.ts
```

### Types: `duelogic-config.types.ts`

```typescript
import type {
  PhilosophicalChair,
  DuelogicConfig,
  DuelogicChair,
  AccountabilityLevel
} from '@/types/duelogic';

export interface ChairSelectorProps {
  chairs: DuelogicChair[];
  onChairsChange: (chairs: DuelogicChair[]) => void;
  maxChairs?: number;
  minChairs?: number;
}

export interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string, displayName?: string, provider?: string) => void;
  label?: string;
}

export interface PresetSelectorProps {
  onPresetSelect: (preset: string) => void;
}

export interface DuelogicConfigPanelProps {
  onSubmit: (config: DuelogicConfig, proposition: string) => void;
  isLoading?: boolean;
}
```

### Component: `ChairCard.tsx`

```tsx
import React from 'react';
import { PhilosophicalChair, PHILOSOPHICAL_CHAIR_INFO } from '@/types/duelogic';
import { ModelSelector } from './ModelSelector';

interface ChairCardProps {
  position: string;
  framework: PhilosophicalChair;
  modelId: string;
  modelDisplayName?: string;
  onFrameworkChange: (framework: PhilosophicalChair) => void;
  onModelChange: (modelId: string, displayName?: string, provider?: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function ChairCard({
  position,
  framework,
  modelId,
  modelDisplayName,
  onFrameworkChange,
  onModelChange,
  onRemove,
  canRemove,
}: ChairCardProps) {
  const info = PHILOSOPHICAL_CHAIR_INFO[framework];
  const positionNumber = parseInt(position.replace('chair_', ''));

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold">Chair {positionNumber}</h3>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-red-500 hover:text-red-700 text-sm"
            aria-label={`Remove chair ${positionNumber}`}
          >
            Remove
          </button>
        )}
      </div>

      {/* Framework Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Philosophical Framework
        </label>
        <select
          value={framework}
          onChange={(e) => onFrameworkChange(e.target.value as PhilosophicalChair)}
          className="w-full border rounded-md px-3 py-2"
          aria-label={`Select framework for chair ${positionNumber}`}
        >
          {Object.entries(PHILOSOPHICAL_CHAIR_INFO).map(([id, info]) => (
            <option key={id} value={id}>
              {info.name}
            </option>
          ))}
        </select>
      </div>

      {/* Framework Description */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <p className="text-sm text-gray-600 italic">"{info.coreQuestion}"</p>
        <p className="text-xs text-gray-500 mt-1">{info.description}</p>
      </div>

      {/* Model Selection */}
      <ModelSelector
        value={modelId}
        onChange={onModelChange}
        label={`LLM Model for Chair ${positionNumber}`}
      />

      {/* Blind Spots Preview */}
      <details className="mt-3">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
          Known Blind Spots (what they must acknowledge)
        </summary>
        <ul className="mt-2 text-xs text-gray-600 list-disc list-inside">
          {info.blindSpotsToAdmit.map((spot, i) => (
            <li key={i}>{spot}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
```

### Component: `ChairSelector.tsx`

```tsx
import React from 'react';
import { ChairCard } from './ChairCard';
import { DuelogicChair, PhilosophicalChair, DUELOGIC_CONSTRAINTS } from '@/types/duelogic';

interface ChairSelectorProps {
  chairs: DuelogicChair[];
  onChairsChange: (chairs: DuelogicChair[]) => void;
}

export function ChairSelector({ chairs, onChairsChange }: ChairSelectorProps) {
  const canAddChair = chairs.length < DUELOGIC_CONSTRAINTS.maxChairs;
  const canRemoveChair = chairs.length > DUELOGIC_CONSTRAINTS.minChairs;

  const handleAddChair = () => {
    if (!canAddChair) return;

    const usedFrameworks = chairs.map(c => c.framework);
    const availableFrameworks: PhilosophicalChair[] = [
      'utilitarian', 'virtue_ethics', 'deontological', 'pragmatic',
      'libertarian', 'communitarian', 'cosmopolitan', 'precautionary',
      'autonomy_centered', 'care_ethics'
    ].filter(f => !usedFrameworks.includes(f as PhilosophicalChair)) as PhilosophicalChair[];

    const newChair: DuelogicChair = {
      position: `chair_${chairs.length + 1}`,
      framework: availableFrameworks[0] || 'pragmatic',
      modelId: 'anthropic/claude-sonnet-4',
      modelDisplayName: 'Claude Sonnet 4',
      providerName: 'Anthropic',
    };

    onChairsChange([...chairs, newChair]);
  };

  const handleRemoveChair = (index: number) => {
    if (!canRemoveChair) return;
    const newChairs = chairs.filter((_, i) => i !== index);
    // Renumber positions
    const renumbered = newChairs.map((chair, i) => ({
      ...chair,
      position: `chair_${i + 1}`,
    }));
    onChairsChange(renumbered);
  };

  const handleFrameworkChange = (index: number, framework: PhilosophicalChair) => {
    const newChairs = [...chairs];
    newChairs[index] = { ...newChairs[index], framework };
    onChairsChange(newChairs);
  };

  const handleModelChange = (
    index: number,
    modelId: string,
    displayName?: string,
    provider?: string
  ) => {
    const newChairs = [...chairs];
    newChairs[index] = {
      ...newChairs[index],
      modelId,
      modelDisplayName: displayName,
      providerName: provider,
    };
    onChairsChange(newChairs);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Debate Chairs</h2>
        <span className="text-sm text-gray-500">
          {chairs.length} of {DUELOGIC_CONSTRAINTS.maxChairs} chairs
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chairs.map((chair, index) => (
          <ChairCard
            key={chair.position}
            position={chair.position}
            framework={chair.framework}
            modelId={chair.modelId}
            modelDisplayName={chair.modelDisplayName}
            onFrameworkChange={(f) => handleFrameworkChange(index, f)}
            onModelChange={(m, d, p) => handleModelChange(index, m, d, p)}
            onRemove={() => handleRemoveChair(index)}
            canRemove={canRemoveChair}
          />
        ))}
      </div>

      {canAddChair && (
        <button
          onClick={handleAddChair}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg
                     text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors"
        >
          + Add Chair (up to {DUELOGIC_CONSTRAINTS.maxChairs})
        </button>
      )}
    </div>
  );
}
```

### Component: `PresetSelector.tsx`

```tsx
import React from 'react';
import { DUELOGIC_PRESETS } from '@/types/duelogic';

interface PresetSelectorProps {
  onPresetSelect: (presetId: string) => void;
}

export function PresetSelector({ onPresetSelect }: PresetSelectorProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">Quick Start: Preset Matchups</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Object.entries(DUELOGIC_PRESETS).map(([id, preset]) => (
          <button
            key={id}
            onClick={() => onPresetSelect(id)}
            className="p-4 border rounded-lg text-left hover:border-blue-500
                       hover:bg-blue-50 transition-colors"
          >
            <h3 className="font-semibold">{preset.name}</h3>
            <p className="text-sm text-gray-600 mt-1">{preset.description}</p>
            <p className="text-xs text-gray-400 mt-2">
              {preset.chairs.length} chairs
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Component: `ToneSelector.tsx`

```tsx
import React from 'react';

type Tone = 'respectful' | 'spirited' | 'heated';

interface ToneSelectorProps {
  value: Tone;
  onChange: (tone: Tone) => void;
}

const toneDescriptions: Record<Tone, { label: string; description: string; icon: string }> = {
  respectful: {
    label: 'Respectful',
    description: 'Professional, collegial discourse. Disagree with ideas, not people.',
    icon: '🤝',
  },
  spirited: {
    label: 'Spirited',
    description: 'Engage with passion and conviction. Be direct and pointed.',
    icon: '⚡',
  },
  heated: {
    label: 'Heated',
    description: 'Argue forcefully. Challenge aggressively. Make disagreements memorable.',
    icon: '🔥',
  },
};

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Debate Tone</h3>
      <div className="flex gap-2">
        {(Object.keys(toneDescriptions) as Tone[]).map((tone) => {
          const info = toneDescriptions[tone];
          const isSelected = value === tone;

          return (
            <button
              key={tone}
              onClick={() => onChange(tone)}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              aria-pressed={isSelected}
            >
              <span className="text-2xl block mb-1">{info.icon}</span>
              <span className="font-medium block">{info.label}</span>
              <span className="text-xs text-gray-500 block mt-1">{info.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### Component: `DuelogicConfigPanel.tsx`

```tsx
import React, { useState } from 'react';
import { ChairSelector } from './ChairSelector';
import { PresetSelector } from './PresetSelector';
import { ToneSelector } from './ToneSelector';
import { ArbiterSettings } from './ArbiterSettings';
import { InterruptionSettings } from './InterruptionSettings';
import { FlowSettings } from './FlowSettings';
import {
  DuelogicConfig,
  DuelogicChair,
  DUELOGIC_DEFAULTS,
  DUELOGIC_PRESETS
} from '@/types/duelogic';

interface DuelogicConfigPanelProps {
  onSubmit: (proposition: string, config: DuelogicConfig) => void;
  isLoading?: boolean;
}

export function DuelogicConfigPanel({ onSubmit, isLoading }: DuelogicConfigPanelProps) {
  const [proposition, setProposition] = useState('');
  const [propositionContext, setPropositionContext] = useState('');
  const [config, setConfig] = useState<DuelogicConfig>(DUELOGIC_DEFAULTS);
  const [activeTab, setActiveTab] = useState<'preset' | 'custom'>('preset');

  const handlePresetSelect = (presetId: string) => {
    const preset = DUELOGIC_PRESETS[presetId as keyof typeof DUELOGIC_PRESETS];
    if (!preset) return;

    const chairs: DuelogicChair[] = preset.chairs.map((c, i) => ({
      position: `chair_${i + 1}`,
      framework: c.framework,
      modelId: 'anthropic/claude-sonnet-4',
      modelDisplayName: 'Claude Sonnet 4',
      providerName: 'Anthropic',
    }));

    setConfig(prev => ({ ...prev, chairs }));
    setActiveTab('custom'); // Switch to custom to show the loaded preset
  };

  const handleChairsChange = (chairs: DuelogicChair[]) => {
    setConfig(prev => ({ ...prev, chairs }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposition.trim()) return;
    onSubmit(proposition, { ...config, propositionContext } as any);
  };

  const isValid = proposition.trim().length >= 10 && config.chairs.length >= 2;

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
      {/* Proposition Input */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Debate Proposition</h2>
        <input
          type="text"
          value={proposition}
          onChange={(e) => setProposition(e.target.value)}
          placeholder="e.g., Should AI development be paused for safety research?"
          className="w-full px-4 py-3 border rounded-lg text-lg"
          aria-label="Debate proposition"
          required
        />
        <textarea
          value={propositionContext}
          onChange={(e) => setPropositionContext(e.target.value)}
          placeholder="Optional: Provide context for the debate..."
          className="w-full px-4 py-2 border rounded-lg text-sm"
          rows={3}
          aria-label="Proposition context"
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab('preset')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'preset'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          Preset Matchups
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('custom')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'custom'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500'
          }`}
        >
          Custom Configuration
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'preset' && (
        <PresetSelector onPresetSelect={handlePresetSelect} />
      )}

      {activeTab === 'custom' && (
        <>
          <ChairSelector
            chairs={config.chairs}
            onChairsChange={handleChairsChange}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ToneSelector
              value={config.tone}
              onChange={(tone) => setConfig(prev => ({ ...prev, tone }))}
            />

            <ArbiterSettings
              value={config.arbiter}
              onChange={(arbiter) => setConfig(prev => ({ ...prev, arbiter }))}
            />
          </div>

          <InterruptionSettings
            value={config.interruptions}
            onChange={(interruptions) => setConfig(prev => ({ ...prev, interruptions }))}
          />

          <FlowSettings
            value={config.flow}
            onChange={(flow) => setConfig(prev => ({ ...prev, flow }))}
          />
        </>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!isValid || isLoading}
        className={`w-full py-4 rounded-lg text-white font-bold text-lg transition-colors ${
          isValid && !isLoading
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-gray-400 cursor-not-allowed'
        }`}
      >
        {isLoading ? 'Starting Debate...' : 'Start Duelogic Debate'}
      </button>
    </form>
  );
}
```

---

## Dependencies

- DUELOGIC-008: API Routes (for fetching models, presets)

---

## Validation

```bash
# Component tests
npm run test -- --grep "DuelogicConfig"

# Storybook (if available)
npm run storybook

# Visual regression
npm run test:visual
```

---

## Test Cases

```typescript
describe('DuelogicConfigPanel', () => {
  it('renders preset selector by default', () => {
    render(<DuelogicConfigPanel onSubmit={jest.fn()} />);
    expect(screen.getByText('Quick Start: Preset Matchups')).toBeInTheDocument();
  });

  it('applies preset configuration', async () => {
    render(<DuelogicConfigPanel onSubmit={jest.fn()} />);

    await userEvent.click(screen.getByText('Classic Clash'));

    expect(screen.getByText('Chair 1')).toBeInTheDocument();
    expect(screen.getByText('Utilitarian Chair')).toBeInTheDocument();
  });

  it('allows adding and removing chairs', async () => {
    render(<DuelogicConfigPanel onSubmit={jest.fn()} />);

    // Switch to custom tab first
    await userEvent.click(screen.getByText('Custom Configuration'));

    const addButton = screen.getByText(/Add Chair/);
    await userEvent.click(addButton);

    expect(screen.getByText('Chair 3')).toBeInTheDocument();
  });

  it('validates proposition length', async () => {
    const onSubmit = jest.fn();
    render(<DuelogicConfigPanel onSubmit={onSubmit} />);

    const input = screen.getByLabelText('Debate proposition');
    await userEvent.type(input, 'Short');

    const submitButton = screen.getByText('Start Duelogic Debate');
    expect(submitButton).toBeDisabled();
  });

  it('submits valid configuration', async () => {
    const onSubmit = jest.fn();
    render(<DuelogicConfigPanel onSubmit={onSubmit} />);

    await userEvent.type(
      screen.getByLabelText('Debate proposition'),
      'Should artificial intelligence development be paused?'
    );
    await userEvent.click(screen.getByText('Classic Clash'));
    await userEvent.click(screen.getByText('Start Duelogic Debate'));

    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][1].chairs.length).toBe(2);
  });
});
```

---

## Definition of Done

- [ ] All configuration components implemented
- [ ] Preset selection works correctly
- [ ] Chair add/remove works with proper limits
- [ ] Model selection integrated with API
- [ ] All settings persist in form state
- [ ] Form validation prevents invalid submissions
- [ ] Responsive design works on mobile
- [ ] Accessibility requirements met (ARIA, keyboard nav)
- [ ] Component tests pass

---

## 📝 Implementation Notes from DUELOGIC-001 & DUELOGIC-002

> Added by agent completing Sprint 1 on 2026-01-03

### Types to Import (Frontend)

Copy types from backend or create shared package:

```typescript
// frontend/src/types/duelogic.ts (or import from shared)
import type {
  PhilosophicalChair,
  DuelogicConfig,
  DuelogicChair,
  DuelogicPreset,
  AccountabilityLevel,  // 'relaxed' | 'moderate' | 'strict'
  AggressivenessLevel,  // 1 | 2 | 3 | 4 | 5
  DebateTone,           // 'respectful' | 'spirited' | 'heated'
  FlowStyle,            // 'structured' | 'conversational'
} from '@/types/duelogic';
```

### Constants to Include (Frontend)

```typescript
// Copy these from backend or fetch from API
const PHILOSOPHICAL_CHAIR_INFO = {
  utilitarian: {
    name: 'Utilitarian Chair',
    description: 'Greatest good for greatest number...',
    coreQuestion: 'What outcome produces the most overall well-being?',
    blindSpotsToAdmit: [...],
  },
  // ... 9 more frameworks
};

const DUELOGIC_PRESETS = {
  classic_clash: { name: 'Classic Clash', chairs: [...], description: '...' },
  three_way: { ... },
  battle_royale: { ... },
};

const DUELOGIC_CONSTRAINTS = {
  minChairs: 2,
  maxChairs: 6,
  minExchanges: 2,
  maxExchanges: 10,
};
```

### API Endpoints to Integrate

```typescript
// Fetch available data
GET /api/duelogic/chairs    // Returns PHILOSOPHICAL_CHAIR_INFO
GET /api/duelogic/presets   // Returns DUELOGIC_PRESETS
GET /api/duelogic/models    // Returns available LLM models

// Create debate
POST /api/debates/duelogic  // { proposition: string, config?: Partial<DuelogicConfig> }

// Debate controls
POST /api/debates/:id/pause
POST /api/debates/:id/resume
POST /api/debates/:id/stop
```

### Form State Shape

```typescript
interface DuelogicFormState {
  proposition: string;
  propositionContext?: string;
  chairs: DuelogicChair[];
  arbiter: {
    modelId: string;
    modelDisplayName?: string;
    accountabilityLevel: AccountabilityLevel;
  };
  flow: {
    style: FlowStyle;
    maxExchanges: number;
    targetDurationMinutes: number;
  };
  interruptions: {
    enabled: boolean;
    allowChairInterruptions: boolean;
    allowArbiterInterruptions: boolean;
    aggressiveness: AggressivenessLevel;
    cooldownSeconds: number;
  };
  tone: DebateTone;
  podcastMode: {
    enabled: boolean;
    showName: string;
    episodeNumber?: number;
  };
}
```

### Existing UI Patterns

Check `frontend/src/components/ConfigPanel/` for patterns:
- Form state management with React hooks
- Validation feedback display
- API integration patterns
- Loading states and error handling

### Accessibility Requirements

- All form elements need `aria-label` or associated `<label>`
- Tab order should be logical
- Color contrast for framework cards
- Keyboard navigation for preset selection

---

## 📝 Implementation Notes from DUELOGIC-003 & DUELOGIC-004

> Added by agent completing Sprint 2 on 2026-01-03

### SSE Events to Handle

The UI needs to handle these token streaming events from agents:

```typescript
// Chair token streaming
interface ChairTokenEvent {
  type: 'token';
  data: {
    speaker: string;    // 'chair_1', 'chair_2', etc.
    segment: string;    // 'opening', 'exchange', 'synthesis'
    framework: string;  // 'utilitarian', 'virtue_ethics', etc.
    token: string;
  };
}

// Arbiter token streaming
interface ArbiterTokenEvent {
  type: 'token';
  data: {
    speaker: 'arbiter';
    segment: 'introduction' | 'synthesis';
    token: string;
  };
}
```

### Displaying Framework Info

Each chair has rich metadata for display:

```typescript
// From PHILOSOPHICAL_CHAIR_INFO (fetch from /api/duelogic/chairs)
interface FrameworkInfo {
  name: string;           // "Utilitarian Chair"
  description: string;    // Full description
  coreQuestion: string;   // "What produces the greatest good..."
  strengthsToAcknowledge: string[];  // What this framework does well
  blindSpotsToAdmit: string[];       // Known weaknesses
}

// Display these in:
// - Chair selector cards (name, description)
// - Debate viewer (framework badge next to speaker)
// - Stats panel (show blind spots)
```

### Chair Position Labels

Map positions to display labels:

```typescript
const positionLabels: Record<string, string> = {
  chair_1: 'First Chair',
  chair_2: 'Second Chair',
  chair_3: 'Third Chair',
  chair_4: 'Fourth Chair',
  chair_5: 'Fifth Chair',
  chair_6: 'Sixth Chair',
};
```

### Evaluation Display

When evaluation data is included:

```typescript
interface EvaluationDisplay {
  adherenceScore: number;  // 0-100, show as progress bar
  steelManning: {
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    // Show as badge: 🟢 strong, 🟡 adequate, 🟠 weak, 🔴 absent
  };
  selfCritique: { quality: QualityLevel };
  frameworkConsistency: { consistent: boolean };
}
```

---

## 📝 Implementation Notes from DUELOGIC-005

> Added by agent completing Sprint 2 on 2026-01-03

### Evaluation Badge Component

Create visual indicators for evaluation quality:

```tsx
interface EvaluationBadgeProps {
  quality: 'strong' | 'adequate' | 'weak' | 'absent';
  type: 'steelManning' | 'selfCritique';
}

const qualityColors = {
  strong: 'bg-green-100 text-green-800 border-green-300',
  adequate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  weak: 'bg-orange-100 text-orange-800 border-orange-300',
  absent: 'bg-red-100 text-red-800 border-red-300',
};

const qualityEmojis = {
  strong: '🟢',
  adequate: '🟡',
  weak: '🟠',
  absent: '🔴',
};

export function EvaluationBadge({ quality, type }: EvaluationBadgeProps) {
  const label = type === 'steelManning' ? 'Steel-Man' : 'Self-Critique';

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${qualityColors[quality]}`}>
      <span className="mr-1">{qualityEmojis[quality]}</span>
      {label}: {quality}
    </span>
  );
}
```

### Adherence Score Progress Bar

Display adherence score as a visual progress bar:

```tsx
interface AdherenceScoreProps {
  score: number;  // 0-100
}

export function AdherenceScore({ score }: AdherenceScoreProps) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-medium">{score}</span>
    </div>
  );
}
```

### Evaluation Card for Utterance

Complete evaluation display component:

```tsx
interface EvaluationCardProps {
  evaluation: ResponseEvaluation;
}

export function EvaluationCard({ evaluation }: EvaluationCardProps) {
  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium">Duelogic Evaluation</span>
        <AdherenceScore score={evaluation.adherenceScore} />
      </div>

      <div className="flex flex-wrap gap-2">
        <EvaluationBadge quality={evaluation.steelManning.quality} type="steelManning" />
        <EvaluationBadge quality={evaluation.selfCritique.quality} type="selfCritique" />

        {!evaluation.frameworkConsistency.consistent && (
          <span className="text-orange-600 text-xs">⚠️ Framework violation</span>
        )}
      </div>

      {evaluation.interjectionReason && (
        <p className="mt-2 text-xs text-red-600 italic">
          Arbiter interjection: {evaluation.interjectionReason}
        </p>
      )}
    </div>
  );
}
```

### Debate Stats Panel

Display aggregate evaluation statistics:

```tsx
interface DebateStatsProps {
  stats: {
    averageAdherence: number | null;
    steelManningRate: number | null;
    selfCritiqueRate: number | null;
  };
}

export function DebateStatsPanel({ stats }: DebateStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-white rounded-lg shadow">
      <StatCard label="Avg. Adherence" value={stats.averageAdherence} unit="%" />
      <StatCard label="Steel-Manning Rate" value={stats.steelManningRate} unit="%" />
      <StatCard label="Self-Critique Rate" value={stats.selfCritiqueRate} unit="%" />
    </div>
  );
}
```

---

## 📝 Implementation Notes from DUELOGIC-006

> Added by agent completing Sprint 3 on 2026-01-03

### Interrupt Indicator Component

Display when an interrupt occurs in the debate stream:

```tsx
interface InterruptIndicatorProps {
  interrupter: string;
  interrupted: string;
  reason: ChairInterruptReason;
  opener: string;
}

const reasonLabels: Record<ChairInterruptReason, string> = {
  factual_correction: 'Factual Correction',
  straw_man_detected: 'Straw Man Detected',
  direct_challenge: 'Direct Challenge',
  clarification_needed: 'Clarification',
  strong_agreement: 'Strong Agreement',
  pivotal_point: 'Pivotal Point',
};

const reasonIcons: Record<ChairInterruptReason, string> = {
  factual_correction: '📝',
  straw_man_detected: '⚠️',
  direct_challenge: '💥',
  clarification_needed: '❓',
  strong_agreement: '✨',
  pivotal_point: '🎯',
};

export function InterruptIndicator({ interrupter, interrupted, reason, opener }: InterruptIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-l-4 border-amber-400 rounded-r">
      <span className="text-lg">{reasonIcons[reason]}</span>
      <div className="flex-1">
        <div className="text-xs text-amber-700 font-medium">
          {interrupter} interrupts {interrupted}
        </div>
        <div className="text-sm text-amber-900">{reasonLabels[reason]}</div>
      </div>
    </div>
  );
}
```

### Aggressiveness Slider for Configuration

```tsx
interface AggressivenessSliderProps {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
}

const aggressivenessLabels = {
  1: 'Very Polite',
  2: 'Conservative',
  3: 'Moderate',
  4: 'Aggressive',
  5: 'Very Aggressive',
};

export function AggressivenessSlider({ value, onChange }: AggressivenessSliderProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Interruption Aggressiveness</label>
      <input
        type="range"
        min={1}
        max={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5)}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-gray-500">
        <span>Polite</span>
        <span className="font-medium">{aggressivenessLabels[value]}</span>
        <span>Aggressive</span>
      </div>
    </div>
  );
}
```

### Interruption Stats Display

```tsx
interface InterruptionStatsProps {
  byReason: Record<ChairInterruptReason, number>;
  byChair: {
    made: Record<string, number>;
    received: Record<string, number>;
  };
}

export function InterruptionStats({ byReason, byChair }: InterruptionStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4 className="font-medium mb-2">By Reason</h4>
        {Object.entries(byReason).map(([reason, count]) => (
          <div key={reason} className="flex justify-between text-sm">
            <span>{reasonIcons[reason as ChairInterruptReason]} {reasonLabels[reason as ChairInterruptReason]}</span>
            <span className="font-medium">{count}</span>
          </div>
        ))}
      </div>
      <div>
        <h4 className="font-medium mb-2">By Chair</h4>
        {Object.entries(byChair.made).map(([chair, count]) => (
          <div key={chair} className="flex justify-between text-sm">
            <span>{chair}</span>
            <span className="font-medium">{count} made</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### SSE Event Handler for Interrupts

```typescript
// In useDebateStream hook:
case 'chair_interrupt':
  // Show interrupt notification
  setInterruptNotification({
    interrupter: event.data.interrupter,
    interrupted: event.data.interrupted,
    reason: event.data.reason,
    opener: event.data.opener,
  });
  // Auto-clear after delay
  setTimeout(() => setInterruptNotification(null), 5000);
  break;
```

---

## 📝 Implementation Notes from DUELOGIC-007

> Added by agent completing Sprint 3 on 2026-01-03

### SSE Events to Handle from Orchestrator

The DuelogicOrchestrator broadcasts these events. Handle in `useDebateStream` hook:

```typescript
interface DuelogicSSEEvents {
  // Debate lifecycle
  duelogic_debate_started: {
    debateId: string;
    proposition: string;
    chairs: Array<{ position: string; framework: string; displayName: string }>;
    config: { maxExchanges: number; tone: string; podcastMode: boolean; interruptionsEnabled: boolean };
  };
  debate_paused: { debateId: string; pausedAt: string; segment: string; exchangeNumber: number };
  debate_resumed: { debateId: string; resumedAt: string; segment: string; exchangeNumber: number };
  debate_stopped: { debateId: string; stoppedAt: string; reason: string; segment: string; utteranceCount: number; durationMs: number };
  debate_complete: { debateId: string; completedAt: string; stats: DebateStats };
  error: { debateId: string; message: string; timestamp: number };

  // Segment lifecycle
  segment_start: { segment: 'introduction' | 'opening' | 'exchange' | 'synthesis'; timestamp: number };
  segment_complete: { segment: string; timestamp: number };
  exchange_complete: { exchangeNumber: number; maxExchanges: number };

  // Speaker events
  speaker_started: { speaker: string; framework?: string; segment: string; exchangeNumber?: number };
  utterance: {
    speaker: string;
    segment: string;
    content: string;
    timestampMs: number;
    evaluation?: { adherenceScore: number; steelManning: object; selfCritique: object };
    isInterruption?: boolean;
  };

  // Interventions
  chair_interrupt: { interrupter: string; interrupted: string; reason: string; opener: string; urgency: number };
  arbiter_interjection: { chair: string; violation: string; adherenceScore: number };
}
```

### Segment Progress Component

```tsx
interface SegmentProgressProps {
  currentSegment: 'introduction' | 'opening' | 'exchange' | 'synthesis';
  exchangeNumber: number;
  maxExchanges: number;
}

const segmentOrder = ['introduction', 'opening', 'exchange', 'synthesis'];

export function SegmentProgress({ currentSegment, exchangeNumber, maxExchanges }: SegmentProgressProps) {
  const currentIndex = segmentOrder.indexOf(currentSegment);

  return (
    <div className="flex items-center gap-2">
      {segmentOrder.map((segment, index) => (
        <div key={segment} className="flex items-center">
          <div className={`w-3 h-3 rounded-full ${
            index < currentIndex ? 'bg-green-500' :
            index === currentIndex ? 'bg-blue-500 animate-pulse' :
            'bg-gray-300'
          }`} />
          <span className={`ml-1 text-xs ${index === currentIndex ? 'font-bold' : ''}`}>
            {segment === 'exchange' ? `Exchange ${exchangeNumber}/${maxExchanges}` : segment}
          </span>
          {index < segmentOrder.length - 1 && <div className="w-4 h-0.5 bg-gray-300 mx-2" />}
        </div>
      ))}
    </div>
  );
}
```

### Debate Controls Component

```tsx
interface DebateControlsProps {
  debateId: string;
  isRunning: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function DebateControls({ debateId, isRunning, isPaused, onPause, onResume, onStop }: DebateControlsProps) {
  if (!isRunning) return null;

  return (
    <div className="flex gap-2">
      {isPaused ? (
        <button onClick={onResume} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
          Resume
        </button>
      ) : (
        <button onClick={onPause} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">
          Pause
        </button>
      )}
      <button onClick={onStop} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
        Stop
      </button>
    </div>
  );
}
```

### API Integration for Controls

```typescript
// In useDuelogicDebate hook:
const pauseDebate = async () => {
  await fetch(`/api/debates/${debateId}/pause`, { method: 'POST' });
  setIsPaused(true);
};

const resumeDebate = async () => {
  await fetch(`/api/debates/${debateId}/resume`, { method: 'POST' });
  setIsPaused(false);
};

const stopDebate = async () => {
  await fetch(`/api/debates/${debateId}/stop`, { method: 'POST' });
  setIsRunning(false);
};
```

### Debate Stats Display

```tsx
interface DebateStatsDisplayProps {
  stats: {
    durationMs: number;
    utteranceCount: number;
    interruptionCount: number;
    chairStats: Record<string, {
      averageAdherence: number;
      steelManningRate: number;
      selfCritiqueRate: number;
      utteranceCount: number;
      interruptionsMade: number;
    }>;
  };
}

export function DebateStatsDisplay({ stats }: DebateStatsDisplayProps) {
  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-bold mb-4">Debate Complete</h3>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{formatDuration(stats.durationMs)}</div>
          <div className="text-sm text-gray-500">Duration</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats.utteranceCount}</div>
          <div className="text-sm text-gray-500">Utterances</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats.interruptionCount}</div>
          <div className="text-sm text-gray-500">Interruptions</div>
        </div>
      </div>

      <h4 className="font-medium mb-2">Chair Performance</h4>
      {Object.entries(stats.chairStats).map(([position, chairStat]) => (
        <div key={position} className="flex justify-between items-center py-2 border-b">
          <span className="font-medium">{position}</span>
          <div className="flex gap-4 text-sm">
            <span>Adherence: {chairStat.averageAdherence}%</span>
            <span>Steel-Man: {chairStat.steelManningRate}%</span>
            <span>Self-Critique: {chairStat.selfCritiqueRate}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 📝 Implementation Notes from DUELOGIC-008

> Added by agent completing DUELOGIC-008 on 2026-01-03

### API Endpoints Available

The following endpoints are implemented and ready to use from the frontend:

```typescript
// Base URL: /api

// Get all philosophical chairs with descriptions
GET /api/duelogic/chairs
// Response: { success: true, chairs: ChairInfo[], count: number }

// Get preset matchups
GET /api/duelogic/presets
// Response: { success: true, presets: Preset[], count: number }

// Get available LLM models
GET /api/duelogic/models
// Response: { success: true, models: Model[], count: number }

// Get default configuration values
GET /api/duelogic/defaults
// Response: { success: true, defaults: DuelogicConfig, constraints: Constraints }

// Create a new Duelogic debate
POST /api/debates/duelogic
// Body: { proposition: string, propositionContext?: string, config?: DuelogicConfig }
// Response: { success: true, debateId: string, config: DuelogicConfig }
```

### React Hooks for API Integration

```typescript
// hooks/useDuelogicConfig.ts
export function useDuelogicChairs() {
  const [chairs, setChairs] = useState<ChairInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/duelogic/chairs')
      .then(res => res.json())
      .then(data => data.success && setChairs(data.chairs))
      .finally(() => setLoading(false));
  }, []);

  return { chairs, loading };
}

export function useDuelogicModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/duelogic/models')
      .then(res => res.json())
      .then(data => data.success && setModels(data.models))
      .finally(() => setLoading(false));
  }, []);

  return { models, loading };
}
```

### Create Debate Function

```typescript
export async function createDuelogicDebate(
  proposition: string,
  config?: Partial<DuelogicConfig>
): Promise<{ debateId: string; config: DuelogicConfig }> {
  const response = await fetch('/api/debates/duelogic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposition, config }),
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message);
  return { debateId: data.debateId, config: data.config };
}
```

### Model Tier Styling

```tsx
const tierColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-purple-100 text-purple-800',
};
```
