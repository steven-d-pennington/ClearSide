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
