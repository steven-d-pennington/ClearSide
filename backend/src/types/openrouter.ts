/**
 * OpenRouter Type Definitions
 *
 * Types for OpenRouter API integration including model information,
 * tier classification, and debate model configuration.
 */

/**
 * Raw model data from OpenRouter API
 * @see https://openrouter.ai/docs#models
 */
export interface OpenRouterModel {
  /** Model identifier (e.g., "anthropic/claude-3-opus") */
  id: string;
  /** Display name */
  name: string;
  /** Model description */
  description?: string;
  /** Pricing per token in USD (as strings to avoid float precision issues) */
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
  };
  /** Maximum context length in tokens */
  context_length: number;
  /** Model architecture info */
  architecture?: {
    modality: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
    instruct_type?: string;
  };
  /** Provider-specific info */
  top_provider?: {
    is_moderated: boolean;
    context_length: number;
    max_completion_tokens?: number;
  };
  /** Supported parameters */
  supported_parameters?: string[];
}

/**
 * Model capability/cost tier for smart pairing
 *
 * - frontier: Premium models ($5+/1M tokens) - GPT-4, Claude 3 Opus
 * - mid_tier: Good models ($0.50-$5/1M) - GPT-4o-mini, Claude 3.5 Sonnet
 * - budget: Cheap models (<$0.50/1M) - Llama, Mistral
 * - free: Free models - Some Llama variants
 */
export type ModelTier = 'frontier' | 'mid_tier' | 'budget' | 'free';

/**
 * Cost threshold for model filtering
 */
export type CostThreshold = 'unlimited' | 'high' | 'medium' | 'low' | 'free_only';

/**
 * Model selection mode
 */
export type ModelSelectionMode = 'auto' | 'manual';

/**
 * Model with computed tier and provider information
 */
export interface TieredModel extends OpenRouterModel {
  /** Computed capability tier */
  tier: ModelTier;
  /** Provider extracted from model ID (e.g., "anthropic") */
  provider: string;
  /** Cost per 1M completion tokens in USD */
  costPer1MTokens: number;
  /** Whether this model supports extended thinking/reasoning */
  supportsReasoning: boolean;
}

/**
 * Per-debate model configuration
 */
export interface DebateModelConfig {
  /** Selection mode: auto (smart pairing) or manual (user picks) */
  selectionMode: ModelSelectionMode;
  /** OpenRouter model ID for Pro advocate (manual mode) */
  proModelId?: string;
  /** OpenRouter model ID for Con advocate (manual mode) */
  conModelId?: string;
  /** OpenRouter model ID for Moderator (manual mode) */
  moderatorModelId?: string;
  /** Maximum cost tier allowed (auto mode) */
  costThreshold?: CostThreshold;
  /** Reasoning/thinking configuration for extended reasoning */
  reasoning?: ReasoningConfig;
}

/**
 * Result of auto model pairing
 */
export interface ModelPairing {
  /** Model selected for Pro advocate */
  proModel: TieredModel;
  /** Model selected for Con advocate */
  conModel: TieredModel;
  /** Tier of both models */
  tier: ModelTier;
  /** Estimated cost for a typical debate (rough) */
  estimatedCostPerDebate: number;
}

/**
 * Result of manual pairing validation
 */
export interface PairingValidation {
  /** Whether the pairing is valid */
  valid: boolean;
  /** Warnings (e.g., tier mismatch) */
  warnings?: string[];
  /** Pro model info (if found) */
  proModel?: TieredModel;
  /** Con model info (if found) */
  conModel?: TieredModel;
}

/**
 * OpenRouter API response for /models endpoint
 */
export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * Mapping from cost threshold to allowed tiers
 */
export const COST_THRESHOLD_TO_TIERS: Record<CostThreshold, ModelTier[]> = {
  unlimited: ['frontier', 'mid_tier', 'budget', 'free'],
  high: ['frontier', 'mid_tier', 'budget', 'free'],
  medium: ['mid_tier', 'budget', 'free'],
  low: ['budget', 'free'],
  free_only: ['free'],
};

/**
 * Tier display names
 */
export const TIER_DISPLAY_NAMES: Record<ModelTier, string> = {
  frontier: 'Frontier',
  mid_tier: 'Mid-Tier',
  budget: 'Budget',
  free: 'Free',
};

/**
 * Cost threshold display names
 */
export const COST_THRESHOLD_DISPLAY_NAMES: Record<CostThreshold, string> = {
  unlimited: 'Unlimited',
  high: 'High ($5+/1M)',
  medium: 'Medium ($0.50-$5/1M)',
  low: 'Low (<$0.50/1M)',
  free_only: 'Free Only',
};

/**
 * Reasoning effort level for models that support extended thinking
 * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
 */
export type ReasoningEffort = 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';

/**
 * Reasoning configuration for OpenRouter requests
 * Controls extended thinking/reasoning tokens for supported models
 */
export interface ReasoningConfig {
  /** Enable reasoning (defaults to true if effort is set) */
  enabled?: boolean;
  /** Reasoning effort level - controls token allocation for thinking */
  effort?: ReasoningEffort;
  /** Max tokens for reasoning (alternative to effort, 1024-32000 for Anthropic) */
  maxTokens?: number;
  /** Exclude reasoning from response (still processes internally) */
  exclude?: boolean;
}

/**
 * Default reasoning configurations
 */
export const REASONING_PRESETS: Record<string, ReasoningConfig> = {
  /** Maximum reasoning for complex analysis */
  deep: { enabled: true, effort: 'xhigh' },
  /** High reasoning for thorough responses */
  thorough: { enabled: true, effort: 'high' },
  /** Balanced reasoning (default for debates) */
  balanced: { enabled: true, effort: 'medium' },
  /** Light reasoning for faster responses */
  light: { enabled: true, effort: 'low' },
  /** Minimal reasoning for quick responses */
  quick: { enabled: true, effort: 'minimal' },
  /** No extended reasoning */
  disabled: { enabled: false, effort: 'none' },
};

/**
 * Reasoning effort display names
 */
export const REASONING_EFFORT_DISPLAY_NAMES: Record<ReasoningEffort, string> = {
  xhigh: 'Deep (~95% tokens)',
  high: 'Thorough (~80% tokens)',
  medium: 'Balanced (~50% tokens)',
  low: 'Light (~20% tokens)',
  minimal: 'Quick (~10% tokens)',
  none: 'Disabled',
};
