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

  /** Whether this is a system preset */
  isSystemPreset: boolean;

  /** Default Pro model ID for manual mode */
  proModelId?: string | null;

  /** Default Con model ID for manual mode */
  conModelId?: string | null;

  /** Default Moderator model ID for manual mode */
  moderatorModelId?: string | null;

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

// ============================================================================
// Persona Types
// ============================================================================

/**
 * Persona archetype categories
 */
export type PersonaArchetype =
  | 'academic'
  | 'pragmatic'
  | 'empirical'
  | 'legal'
  | 'economic'
  | 'moral';

/**
 * Persona definition
 */
export interface Persona {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Category/archetype */
  archetype: PersonaArchetype;

  /** Brief description */
  description: string | null;

  /** How this persona argues */
  argumentationStyle: string;

  /** Suggested vocabulary */
  vocabularyHints: string | null;

  /** Topic areas of focus */
  focusAreas: string[];

  /** Rhetorical approach */
  rhetoricalPreferences: string | null;

  /** Text to inject into agent system prompt */
  systemPromptAddition: string;

  /** Emoji avatar */
  avatarEmoji: string | null;

  /** Primary color (hex) */
  colorPrimary: string | null;

  /** Secondary color (hex) */
  colorSecondary: string | null;

  /** Whether this is a system-defined persona */
  isSystemPersona: boolean;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Simplified persona for display/selection
 */
export interface PersonaSummary {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  description: string | null;
  avatarEmoji: string | null;
  colorPrimary: string | null;
}

/**
 * Persona selection for a debate
 */
export interface PersonaSelection {
  proPersonaId: string | null;
  conPersonaId: string | null;
}

/**
 * Archetype display info
 */
export const ARCHETYPE_INFO: Record<PersonaArchetype, { name: string; description: string }> = {
  academic: {
    name: 'Academic',
    description: 'Theoretical and philosophical approach',
  },
  pragmatic: {
    name: 'Pragmatic',
    description: 'Practical and politically-aware approach',
  },
  empirical: {
    name: 'Empirical',
    description: 'Evidence-based and data-driven approach',
  },
  legal: {
    name: 'Legal',
    description: 'Rights-focused and precedent-based approach',
  },
  economic: {
    name: 'Economic',
    description: 'Incentive and trade-off focused approach',
  },
  moral: {
    name: 'Moral',
    description: 'Ethics and values focused approach',
  },
};
