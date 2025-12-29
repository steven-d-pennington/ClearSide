/**
 * OpenRouter Client
 *
 * Manages fetching models from OpenRouter API, caching,
 * and tier classification for smart model pairing.
 */

import pino from 'pino';
import type {
  OpenRouterModel,
  OpenRouterModelsResponse,
  TieredModel,
  ModelTier,
  CostThreshold,
} from '../../types/openrouter.js';

const logger = pino({
  name: 'openrouter-client',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Tier thresholds in USD per 1M completion tokens
 */
const TIER_THRESHOLDS = {
  frontier: 5.0,    // >= $5/1M
  mid_tier: 0.5,    // $0.50-$5/1M
  budget: 0.001,    // $0.001-$0.50/1M (anything above free)
  free: 0,          // $0/1M
};

/**
 * Mapping from cost threshold to allowed tiers
 */
const COST_THRESHOLD_TO_TIERS_MAP: Record<CostThreshold, ModelTier[]> = {
  unlimited: ['frontier', 'mid_tier', 'budget', 'free'],
  high: ['frontier', 'mid_tier', 'budget', 'free'],
  medium: ['mid_tier', 'budget', 'free'],
  low: ['budget', 'free'],
  free_only: ['free'],
};

/**
 * OpenRouter API Client
 *
 * Fetches and caches model information with tier classification.
 */
export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private modelCache: TieredModel[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheTTL: number;

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    cacheTTLMs?: number;
  }) {
    this.apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = options?.baseUrl || 'https://openrouter.ai/api/v1';
    this.cacheTTL = options?.cacheTTLMs || 5 * 60 * 1000; // 5 minutes default

    if (!this.apiKey) {
      logger.warn('OpenRouter API key not configured');
    }
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Fetch all available models from OpenRouter
   * Uses cache if available and not expired
   */
  async fetchModels(): Promise<TieredModel[]> {
    // Check cache
    const now = Date.now();
    if (this.modelCache && now - this.cacheTimestamp < this.cacheTTL) {
      logger.debug('Returning cached models');
      return this.modelCache;
    }

    logger.info('Fetching models from OpenRouter API');

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OpenRouterModelsResponse;

      // Process and classify models
      const tieredModels = data.data
        .filter(this.isTextModel)
        .map(this.classifyModel.bind(this))
        .sort((a, b) => b.costPer1MTokens - a.costPer1MTokens); // Sort by cost desc

      // Update cache
      this.modelCache = tieredModels;
      this.cacheTimestamp = now;

      logger.info({ modelCount: tieredModels.length }, 'Models fetched and cached');

      return tieredModels;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch models from OpenRouter');
      throw error;
    }
  }

  /**
   * Get models filtered by cost threshold
   */
  async getModelsForThreshold(threshold: CostThreshold): Promise<TieredModel[]> {
    const models = await this.fetchModels();
    const allowedTiers = COST_THRESHOLD_TO_TIERS_MAP[threshold];
    return models.filter((m) => allowedTiers.includes(m.tier));
  }

  /**
   * Get models grouped by tier
   */
  async getModelsByTier(): Promise<Record<ModelTier, TieredModel[]>> {
    const models = await this.fetchModels();

    const grouped: Record<ModelTier, TieredModel[]> = {
      frontier: [],
      mid_tier: [],
      budget: [],
      free: [],
    };

    for (const model of models) {
      grouped[model.tier].push(model);
    }

    return grouped;
  }

  /**
   * Get models grouped by provider within a tier
   */
  async getModelsByProvider(tier?: ModelTier): Promise<Record<string, TieredModel[]>> {
    const models = await this.fetchModels();
    const filtered = tier ? models.filter((m) => m.tier === tier) : models;

    const grouped: Record<string, TieredModel[]> = {};

    for (const model of filtered) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider]!.push(model);
    }

    return grouped;
  }

  /**
   * Get a specific model by ID
   */
  async getModel(modelId: string): Promise<TieredModel | null> {
    const models = await this.fetchModels();
    return models.find((m) => m.id === modelId) || null;
  }

  /**
   * Clear the model cache
   */
  clearCache(): void {
    this.modelCache = null;
    this.cacheTimestamp = 0;
    logger.debug('Model cache cleared');
  }

  /**
   * Filter for text-to-text models only
   */
  private isTextModel(model: OpenRouterModel): boolean {
    // Filter out image/audio models
    const modality = model.architecture?.modality || '';
    return modality.includes('text') || modality === '';
  }

  /**
   * Classify a model with tier and provider info
   */
  private classifyModel(model: OpenRouterModel): TieredModel {
    // Extract provider from model ID (e.g., "anthropic/claude-3-opus" -> "anthropic")
    const provider = this.extractProvider(model.id);

    // Calculate cost per 1M completion tokens
    const costPer1MTokens = this.calculateCostPer1M(model);

    // Determine tier
    const tier = this.classifyTier(costPer1MTokens);

    return {
      ...model,
      provider,
      costPer1MTokens,
      tier,
    };
  }

  /**
   * Extract provider name from model ID
   */
  private extractProvider(modelId: string): string {
    const parts = modelId.split('/');
    return parts[0] || 'unknown';
  }

  /**
   * Calculate cost per 1M completion tokens
   */
  private calculateCostPer1M(model: OpenRouterModel): number {
    const completionPrice = parseFloat(model.pricing.completion) || 0;
    return completionPrice * 1_000_000;
  }

  /**
   * Classify model into tier based on cost
   */
  private classifyTier(costPer1M: number): ModelTier {
    if (costPer1M === 0) return 'free';
    if (costPer1M < TIER_THRESHOLDS.mid_tier) return 'budget';
    if (costPer1M < TIER_THRESHOLDS.frontier) return 'mid_tier';
    return 'frontier';
  }
}

/**
 * Singleton instance with default configuration
 */
let defaultClient: OpenRouterClient | null = null;

/**
 * Get the default OpenRouter client instance
 */
export function getOpenRouterClient(): OpenRouterClient {
  if (!defaultClient) {
    defaultClient = new OpenRouterClient();
  }
  return defaultClient;
}

/**
 * Create a new OpenRouter client with custom configuration
 */
export function createOpenRouterClient(options?: {
  apiKey?: string;
  baseUrl?: string;
  cacheTTLMs?: number;
}): OpenRouterClient {
  return new OpenRouterClient(options);
}
