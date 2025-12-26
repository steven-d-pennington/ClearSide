# CONFIG-002: Configuration Types and Interfaces

**Priority:** P0
**Estimate:** S
**Labels:** `configuration`, `types`, `backend`
**Status:** 🟢 TO DO

---

## Context

Create TypeScript type definitions for the debate configuration system. These types will be used throughout the backend to ensure type safety when handling preset modes, brevity levels, LLM settings, and other configuration options.

**References:**
- [Database Types](../../../backend/src/types/database.ts) - Existing type patterns
- [LLM Types](../../../backend/src/types/llm.ts) - LLM-related types

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/types/configuration.ts`
- [ ] Define `PresetMode` type with all valid modes
- [ ] Define `BrevityLevel` type (1-5 scale)
- [ ] Define `DebateConfiguration` interface
- [ ] Define `DebateLLMSettings` interface for per-debate LLM config
- [ ] Define `DebatePreset` interface matching database schema
- [ ] Export `DEFAULT_CONFIGURATION` constant
- [ ] Export `CONFIGURATION_CONSTRAINTS` for validation
- [ ] Export `BREVITY_LABELS` for UI display
- [ ] Update `backend/src/types/database.ts` to include new fields

---

## Implementation Guide

### New File: `backend/src/types/configuration.ts`

```typescript
/**
 * Debate Configuration Types
 *
 * Defines all types related to debate configuration including presets,
 * LLM settings, and brevity levels.
 */

// ============================================================================
// Preset Modes
// ============================================================================

/**
 * Available preset modes for debate configuration
 */
export type PresetMode = 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom';

/**
 * Preset mode descriptions for UI
 */
export const PRESET_MODE_INFO: Record<PresetMode, { name: string; description: string }> = {
  quick: {
    name: 'Quick Mode',
    description: 'Fast, concise responses for rapid analysis',
  },
  balanced: {
    name: 'Balanced',
    description: 'Default balanced settings for most debates',
  },
  deep_dive: {
    name: 'Deep Dive',
    description: 'Thorough, comprehensive analysis',
  },
  research: {
    name: 'Research Mode',
    description: 'Academic rigor with required citations',
  },
  custom: {
    name: 'Custom',
    description: 'User-configured settings',
  },
};

// ============================================================================
// Brevity Levels
// ============================================================================

/**
 * Brevity level scale (1 = most detailed, 5 = most concise)
 */
export type BrevityLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Human-readable labels for brevity levels
 */
export const BREVITY_LABELS: Record<BrevityLevel, string> = {
  1: 'Very Detailed',
  2: 'Detailed',
  3: 'Balanced',
  4: 'Concise',
  5: 'Very Concise',
};

/**
 * Word count targets for each brevity level
 */
export const BREVITY_WORD_TARGETS: Record<BrevityLevel, { min: number; max: number }> = {
  1: { min: 500, max: 600 },
  2: { min: 400, max: 500 },
  3: { min: 300, max: 400 },
  4: { min: 200, max: 300 },
  5: { min: 150, max: 200 },
};

// ============================================================================
// LLM Settings
// ============================================================================

/**
 * Per-debate LLM configuration settings
 */
export interface DebateLLMSettings {
  /** Temperature for LLM responses (0.0 = deterministic, 1.0 = creative) */
  temperature: number;

  /** Maximum tokens per agent response */
  maxTokensPerResponse: number;
}

// ============================================================================
// Debate Configuration
// ============================================================================

/**
 * Complete debate configuration
 */
export interface DebateConfiguration {
  /** Selected preset mode */
  presetMode: PresetMode;

  /** Brevity level (1-5) */
  brevityLevel: BrevityLevel;

  /** LLM-specific settings */
  llmSettings: DebateLLMSettings;

  /** Whether citations are required for all claims */
  requireCitations: boolean;
}

/**
 * Debate preset definition (matches database schema)
 */
export interface DebatePreset {
  /** Unique preset identifier */
  id: string;

  /** Display name */
  name: string;

  /** Preset description */
  description: string | null;

  /** Brevity level setting */
  brevityLevel: BrevityLevel;

  /** LLM temperature setting */
  llmTemperature: number;

  /** Max tokens per response */
  maxTokensPerResponse: number;

  /** Whether citations are required */
  requireCitations: boolean;

  /** Whether this is a system preset (cannot be modified) */
  isSystemPreset: boolean;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

// ============================================================================
// Defaults and Constraints
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIGURATION: DebateConfiguration = {
  presetMode: 'balanced',
  brevityLevel: 3,
  llmSettings: {
    temperature: 0.7,
    maxTokensPerResponse: 1024,
  },
  requireCitations: false,
};

/**
 * Configuration constraints for validation
 */
export const CONFIGURATION_CONSTRAINTS = {
  temperature: {
    min: 0.0,
    max: 1.0,
    step: 0.1,
  },
  maxTokensPerResponse: {
    min: 100,
    max: 8000,
    step: 100,
  },
  brevityLevel: {
    min: 1,
    max: 5,
  },
} as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for PresetMode
 */
export function isPresetMode(value: unknown): value is PresetMode {
  return (
    typeof value === 'string' &&
    ['quick', 'balanced', 'deep_dive', 'research', 'custom'].includes(value)
  );
}

/**
 * Type guard for BrevityLevel
 */
export function isBrevityLevel(value: unknown): value is BrevityLevel {
  return typeof value === 'number' && [1, 2, 3, 4, 5].includes(value);
}

/**
 * Validate configuration values
 */
export function validateConfiguration(config: Partial<DebateConfiguration>): string[] {
  const errors: string[] = [];

  if (config.presetMode !== undefined && !isPresetMode(config.presetMode)) {
    errors.push(`Invalid preset mode: ${config.presetMode}`);
  }

  if (config.brevityLevel !== undefined && !isBrevityLevel(config.brevityLevel)) {
    errors.push(`Invalid brevity level: ${config.brevityLevel}. Must be 1-5.`);
  }

  if (config.llmSettings?.temperature !== undefined) {
    const { min, max } = CONFIGURATION_CONSTRAINTS.temperature;
    if (config.llmSettings.temperature < min || config.llmSettings.temperature > max) {
      errors.push(`Temperature must be between ${min} and ${max}`);
    }
  }

  if (config.llmSettings?.maxTokensPerResponse !== undefined) {
    const { min, max } = CONFIGURATION_CONSTRAINTS.maxTokensPerResponse;
    if (
      config.llmSettings.maxTokensPerResponse < min ||
      config.llmSettings.maxTokensPerResponse > max
    ) {
      errors.push(`Max tokens must be between ${min} and ${max}`);
    }
  }

  return errors;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a preset to a full configuration
 */
export function presetToConfiguration(preset: DebatePreset): DebateConfiguration {
  return {
    presetMode: preset.id as PresetMode,
    brevityLevel: preset.brevityLevel,
    llmSettings: {
      temperature: preset.llmTemperature,
      maxTokensPerResponse: preset.maxTokensPerResponse,
    },
    requireCitations: preset.requireCitations,
  };
}

/**
 * Merge partial configuration with defaults
 */
export function mergeWithDefaults(
  partial: Partial<DebateConfiguration>
): DebateConfiguration {
  return {
    presetMode: partial.presetMode ?? DEFAULT_CONFIGURATION.presetMode,
    brevityLevel: partial.brevityLevel ?? DEFAULT_CONFIGURATION.brevityLevel,
    llmSettings: {
      temperature:
        partial.llmSettings?.temperature ?? DEFAULT_CONFIGURATION.llmSettings.temperature,
      maxTokensPerResponse:
        partial.llmSettings?.maxTokensPerResponse ??
        DEFAULT_CONFIGURATION.llmSettings.maxTokensPerResponse,
    },
    requireCitations: partial.requireCitations ?? DEFAULT_CONFIGURATION.requireCitations,
  };
}
```

### Update: `backend/src/types/database.ts`

Add these fields to the `Debate` interface:

```typescript
// Add to Debate interface after flowMode field:

/** Selected preset mode for this debate */
presetMode: PresetMode;

/** Brevity level (1 = detailed, 5 = concise) */
brevityLevel: number;

/** LLM temperature setting (0.0 - 1.0) */
llmTemperature: number;

/** Maximum tokens per response */
maxTokensPerResponse: number;

/** Whether citations are required */
requireCitations: boolean;
```

Add to `DebateRow` interface:

```typescript
preset_mode: string;
brevity_level: number;
llm_temperature: number;
max_tokens_per_response: number;
require_citations: boolean;
```

Update `CreateDebateInput` interface:

```typescript
export interface CreateDebateInput {
  propositionText: string;
  propositionContext?: Record<string, unknown>;
  flowMode?: FlowMode;
  // Configuration fields
  presetMode?: PresetMode;
  brevityLevel?: number;
  llmTemperature?: number;
  maxTokensPerResponse?: number;
  requireCitations?: boolean;
}
```

Add import at top:

```typescript
import type { PresetMode } from './configuration.js';
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-001: Database migration (schema must exist first)

---

## Validation

### Unit Tests

Create `backend/src/types/__tests__/configuration.test.ts`:

```typescript
import {
  isPresetMode,
  isBrevityLevel,
  validateConfiguration,
  presetToConfiguration,
  mergeWithDefaults,
  DEFAULT_CONFIGURATION,
} from '../configuration.js';

describe('Configuration Types', () => {
  describe('isPresetMode', () => {
    it('returns true for valid preset modes', () => {
      expect(isPresetMode('quick')).toBe(true);
      expect(isPresetMode('balanced')).toBe(true);
      expect(isPresetMode('deep_dive')).toBe(true);
      expect(isPresetMode('research')).toBe(true);
      expect(isPresetMode('custom')).toBe(true);
    });

    it('returns false for invalid values', () => {
      expect(isPresetMode('invalid')).toBe(false);
      expect(isPresetMode(123)).toBe(false);
      expect(isPresetMode(null)).toBe(false);
    });
  });

  describe('isBrevityLevel', () => {
    it('returns true for valid levels 1-5', () => {
      expect(isBrevityLevel(1)).toBe(true);
      expect(isBrevityLevel(3)).toBe(true);
      expect(isBrevityLevel(5)).toBe(true);
    });

    it('returns false for invalid levels', () => {
      expect(isBrevityLevel(0)).toBe(false);
      expect(isBrevityLevel(6)).toBe(false);
      expect(isBrevityLevel('3')).toBe(false);
    });
  });

  describe('validateConfiguration', () => {
    it('returns no errors for valid configuration', () => {
      const errors = validateConfiguration({
        presetMode: 'balanced',
        brevityLevel: 3,
        llmSettings: { temperature: 0.7, maxTokensPerResponse: 1024 },
      });
      expect(errors).toHaveLength(0);
    });

    it('returns errors for invalid values', () => {
      const errors = validateConfiguration({
        brevityLevel: 10 as any,
        llmSettings: { temperature: 1.5, maxTokensPerResponse: 50 },
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('mergeWithDefaults', () => {
    it('fills in missing values with defaults', () => {
      const result = mergeWithDefaults({ presetMode: 'quick' });
      expect(result.presetMode).toBe('quick');
      expect(result.brevityLevel).toBe(DEFAULT_CONFIGURATION.brevityLevel);
    });
  });
});
```

### Definition of Done

- [ ] `configuration.ts` created with all types and interfaces
- [ ] Type guards implemented and tested
- [ ] Validation function works correctly
- [ ] Helper functions implemented
- [ ] `database.ts` updated with new fields
- [ ] Import statements added correctly
- [ ] Unit tests pass

---

## Notes

- Types are designed to be shared between backend and frontend (can be copied to frontend)
- Validation is strict to prevent invalid configurations from reaching the database
- Type guards enable runtime checking of user input

---

**Estimated Time:** 2 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
