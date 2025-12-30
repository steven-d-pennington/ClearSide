/**
 * Configuration Type Definitions for Frontend
 *
 * These types mirror the backend configuration types and represent
 * debate configuration options available to users.
 */

// ============================================================================
// Preset Modes
// ============================================================================

/**
 * Available preset modes for debates
 */
export type PresetMode = 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom';

/**
 * Preset mode display information
 */
export interface PresetModeInfo {
  id: PresetMode;
  name: string;
  description: string;
  icon: string;
}

/**
 * Preset mode metadata for UI display
 */
export const PRESET_MODE_INFO: Record<PresetMode, PresetModeInfo> = {
  quick: {
    id: 'quick',
    name: 'Quick Mode',
    description: 'Fast, focused debates with concise responses',
    icon: 'zap',
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    description: 'Standard depth and detail for most debates',
    icon: 'scale',
  },
  deep_dive: {
    id: 'deep_dive',
    name: 'Deep Dive',
    description: 'Comprehensive analysis with detailed arguments',
    icon: 'microscope',
  },
  research: {
    id: 'research',
    name: 'Research Mode',
    description: 'Academic style with required citations',
    icon: 'book-open',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'Configure your own settings',
    icon: 'settings',
  },
};

// ============================================================================
// Brevity Levels
// ============================================================================

/**
 * Brevity level (1 = most detailed, 5 = most concise)
 */
export type BrevityLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Brevity level labels
 */
export const BREVITY_LABELS: Record<BrevityLevel, string> = {
  1: 'Very Detailed',
  2: 'Detailed',
  3: 'Balanced',
  4: 'Concise',
  5: 'Very Concise',
};

/**
 * Brevity level descriptions
 */
export const BREVITY_DESCRIPTIONS: Record<BrevityLevel, string> = {
  1: 'Comprehensive exploration with multiple examples (500-600 words)',
  2: 'Thorough coverage of key points (400-500 words)',
  3: 'Balanced depth with select examples (300-400 words)',
  4: 'Focused and efficient (200-300 words)',
  5: 'Maximum clarity, bullet points encouraged (150-200 words)',
};

// ============================================================================
// LLM Settings
// ============================================================================

/**
 * LLM configuration settings
 */
export interface LLMSettings {
  /** Temperature (0-1): Lower = more consistent, higher = more creative */
  temperature: number;
  /** Maximum tokens per response (128-4096) */
  maxTokensPerResponse: number;
}

/**
 * Default LLM settings
 */
export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  temperature: 0.7,
  maxTokensPerResponse: 1024,
};

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
  /** LLM settings */
  llmSettings: LLMSettings;
  /** Whether citations are required */
  requireCitations: boolean;
}

/**
 * Default debate configuration (matches 'balanced' preset)
 */
export const DEFAULT_CONFIGURATION: DebateConfiguration = {
  presetMode: 'balanced',
  brevityLevel: 3,
  llmSettings: DEFAULT_LLM_SETTINGS,
  requireCitations: false,
};

// ============================================================================
// Preset Data
// ============================================================================

/**
 * Full preset data from API
 */
export interface DebatePreset {
  id: string;
  name: string;
  description: string | null;
  brevityLevel: BrevityLevel;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
  isSystemPreset: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert a preset to a configuration object
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

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid preset mode
 */
export function isPresetMode(value: unknown): value is PresetMode {
  return (
    typeof value === 'string' &&
    ['quick', 'balanced', 'deep_dive', 'research', 'custom'].includes(value)
  );
}

/**
 * Check if a value is a valid brevity level
 */
export function isBrevityLevel(value: unknown): value is BrevityLevel {
  return typeof value === 'number' && [1, 2, 3, 4, 5].includes(value);
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
 * Persona summary for selection UI
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
 * Full persona with all details
 */
export interface Persona extends PersonaSummary {
  argumentationStyle: string;
  vocabularyHints: string | null;
  focusAreas: string[];
  rhetoricalPreferences: string | null;
  systemPromptAddition: string;
  colorSecondary: string | null;
  isSystemPersona: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Persona selection for a debate
 */
export interface PersonaSelection {
  proPersonaId: string | null;
  conPersonaId: string | null;
}

/**
 * Default persona selection (no personas = standard behavior)
 */
export const DEFAULT_PERSONA_SELECTION: PersonaSelection = {
  proPersonaId: null,
  conPersonaId: null,
};

/**
 * Archetype display information
 */
export const ARCHETYPE_INFO: Record<PersonaArchetype, { name: string; description: string; icon: string }> = {
  academic: {
    name: 'Academic',
    description: 'Theoretical and philosophical',
    icon: '🎓',
  },
  pragmatic: {
    name: 'Pragmatic',
    description: 'Practical and politically-aware',
    icon: '🏛️',
  },
  empirical: {
    name: 'Empirical',
    description: 'Evidence-based and data-driven',
    icon: '🔬',
  },
  legal: {
    name: 'Legal',
    description: 'Rights-focused and precedent-based',
    icon: '⚖️',
  },
  economic: {
    name: 'Economic',
    description: 'Incentive and trade-off focused',
    icon: '📊',
  },
  moral: {
    name: 'Moral',
    description: 'Ethics and values focused',
    icon: '🧭',
  },
};

// ============================================================================
// Model Selection Types (OpenRouter Integration)
// ============================================================================

/**
 * Model tier classification
 */
export type ModelTier = 'frontier' | 'mid_tier' | 'budget' | 'free';

/**
 * Reasoning effort levels for extended thinking
 * xhigh = ~95% of budget, high = ~80%, medium = ~50%, low = ~20%, minimal = ~10%
 */
export type ReasoningEffort = 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';

/**
 * Reasoning effort display info
 */
export const REASONING_EFFORT_INFO: Record<ReasoningEffort, { name: string; description: string }> = {
  xhigh: {
    name: 'Maximum',
    description: 'Deepest reasoning (~95% token budget)',
  },
  high: {
    name: 'High',
    description: 'Thorough reasoning (~80% token budget)',
  },
  medium: {
    name: 'Medium',
    description: 'Balanced reasoning (~50% token budget)',
  },
  low: {
    name: 'Low',
    description: 'Light reasoning (~20% token budget)',
  },
  minimal: {
    name: 'Minimal',
    description: 'Quick reasoning (~10% token budget)',
  },
  none: {
    name: 'Disabled',
    description: 'No extended thinking',
  },
};

/**
 * Cost threshold for model filtering
 */
export type CostThreshold = 'unlimited' | 'high' | 'medium' | 'low' | 'free_only';

/**
 * Model selection mode
 */
export type ModelSelectionMode = 'auto' | 'manual';

/**
 * Model information from OpenRouter
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
  costPer1MTokens: number;
  contextLength: number;
  /** Whether the model supports extended thinking/reasoning */
  supportsReasoning: boolean;
}

/**
 * Model pairing from the backend
 */
export interface ModelPairing {
  proModel: ModelInfo;
  conModel: ModelInfo;
  tier: ModelTier;
  estimatedCostPerDebate: number;
}

/**
 * Model selection configuration
 */
export interface ModelSelection {
  mode: ModelSelectionMode;
  costThreshold: CostThreshold;
  proModelId: string | null;
  conModelId: string | null;
  moderatorModelId: string | null;
  /** Extended thinking effort level (only for reasoning-capable models) */
  reasoningEffort: ReasoningEffort;
}

/**
 * Default model selection (auto mode with medium cost)
 */
export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  mode: 'auto',
  costThreshold: 'medium',
  proModelId: null,
  conModelId: null,
  moderatorModelId: null,
  reasoningEffort: 'none',
};

/**
 * Cost threshold display info
 */
export const COST_THRESHOLD_INFO: Record<CostThreshold, { name: string; description: string }> = {
  unlimited: {
    name: 'Unlimited',
    description: 'Use any models (highest quality)',
  },
  high: {
    name: 'High',
    description: 'Premium models only',
  },
  medium: {
    name: 'Medium',
    description: 'Balanced cost and quality',
  },
  low: {
    name: 'Low',
    description: 'Budget-friendly options',
  },
  free_only: {
    name: 'Free Only',
    description: 'Only free models',
  },
};

/**
 * Model tier display info
 */
export const MODEL_TIER_INFO: Record<ModelTier, { name: string; description: string; color: string }> = {
  frontier: {
    name: 'Frontier',
    description: 'State-of-the-art models',
    color: '#8b5cf6', // Purple
  },
  mid_tier: {
    name: 'Mid-Tier',
    description: 'Great balance of quality and cost',
    color: '#3b82f6', // Blue
  },
  budget: {
    name: 'Budget',
    description: 'Cost-effective options',
    color: '#22c55e', // Green
  },
  free: {
    name: 'Free',
    description: 'No cost models',
    color: '#6b7280', // Gray
  },
};
