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
  /** Maximum cost tier allowed (auto mode) */
  costThreshold?: CostThreshold;
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
