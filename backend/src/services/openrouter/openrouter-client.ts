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
 * Known-good providers for debate
 * These are major, reliable providers with well-tested models
 */
const TRUSTED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'meta-llama',
  'mistralai',
  'cohere',
  'deepseek',
  'qwen',
  'microsoft',
  'nvidia',
  'perplexity',
  'x-ai',
]);

/**
 * Curated list of latest 2 models from each preferred provider
 * These are verified to work reliably with OpenRouter
 * Updated: 2025-01
 */
export const CURATED_MODELS: Record<string, string[]> = {
  'anthropic': [
    'anthropic/claude-sonnet-4.5',      // Latest Sonnet - fast & capable
    'anthropic/claude-opus-4.5',        // Latest Opus - flagship
    'anthropic/claude-haiku-4.5',       // Latest Haiku - fast & affordable
  ],
  'openai': [
    'openai/gpt-4.1',                   // Latest stable GPT
    'openai/o4-mini',                   // Latest reasoning model
  ],
  'google': [
    'google/gemini-2.5-pro',            // Latest Pro - flagship
    'google/gemini-2.5-flash',          // Latest Flash - fast
  ],
  'x-ai': [
    'x-ai/grok-4',                      // Latest Grok flagship
    'x-ai/grok-4.1-fast',               // Latest Grok fast
  ],
  'deepseek': [
    'deepseek/deepseek-v3.2',           // Latest chat model
    'deepseek/deepseek-r1-0528',        // Latest reasoning model
  ],
  'qwen': [
    'qwen/qwen3-235b-a22b',             // Latest flagship MoE
    'qwen/qwen3-coder',                 // Latest coder model
  ],
};

/**
 * Flat list of all curated model IDs
 */
export const CURATED_MODEL_IDS = Object.values(CURATED_MODELS).flat();

/**
 * Models known to support extended thinking/reasoning
 * Based on OpenRouter documentation and model capabilities
 */
const REASONING_MODEL_PATTERNS = [
  // Claude 4.x models with thinking support
  'claude-sonnet-4.5',
  'claude-sonnet-4',
  'claude-opus-4.5',
  'claude-opus-4.1',
  'claude-opus-4',
  'claude-haiku-4.5',
  // Claude 3.7 models
  'claude-3-7-sonnet',
  'claude-3.7-sonnet',
  // OpenAI o1/o3 reasoning models
  'o1-preview',
  'o1-mini',
  'o1',
  'o3-mini',
  'o3',
  // DeepSeek reasoning
  'deepseek-r1',
  'deepseek-reasoner',
  // Qwen with reasoning
  'qwq',
  // Generic :thinking variants
  ':thinking',
];

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
    } else {
      logger.info('OpenRouter client initialized');
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
      // Filter to text models from trusted providers only
      const tieredModels = data.data
        .filter(this.isDebateSuitableModel.bind(this))
        .map(this.classifyModel.bind(this))
        // Sort alphabetically by provider, then by model name
        .sort((a, b) => {
          const providerCompare = a.provider.localeCompare(b.provider);
          if (providerCompare !== 0) return providerCompare;
          return a.name.localeCompare(b.name);
        });

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
   * Get only curated models (latest 2 from preferred providers)
   * These are verified to work reliably
   */
  async getCuratedModels(): Promise<TieredModel[]> {
    const allModels = await this.fetchModels();
    return allModels.filter((m) => CURATED_MODEL_IDS.includes(m.id));
  }

  /**
   * Healthcheck a model by sending a simple test prompt
   * Returns success/failure with latency
   */
  async healthcheckModel(modelId: string): Promise<{
    modelId: string;
    healthy: boolean;
    latencyMs: number | null;
    error: string | null;
  }> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clearside.app',
          'X-Title': 'ClearSide Healthcheck',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
          max_tokens: 10,
          temperature: 0,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        logger.warn({ modelId, error: errorMessage, latencyMs }, 'Model healthcheck failed');
        return {
          modelId,
          healthy: false,
          latencyMs,
          error: errorMessage,
        };
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content || '';

      // Check if we got a valid response (not empty)
      if (!content || content.trim().length === 0) {
        logger.warn({ modelId, latencyMs }, 'Model healthcheck returned empty response');
        return {
          modelId,
          healthy: false,
          latencyMs,
          error: 'Empty response from model',
        };
      }

      logger.info({ modelId, latencyMs, response: content.substring(0, 20) }, 'Model healthcheck passed');
      return {
        modelId,
        healthy: true,
        latencyMs,
        error: null,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ modelId, error: errorMessage, latencyMs }, 'Model healthcheck error');
      return {
        modelId,
        healthy: false,
        latencyMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Filter for models suitable for debate
   * - Must be text-to-text (not image/audio)
   * - Must be from a trusted provider
   * - Must not be a specialized model (embedding, code-only, etc.)
   */
  private isDebateSuitableModel(model: OpenRouterModel): boolean {
    // Filter out image/audio models
    const modality = model.architecture?.modality || '';
    const isTextModel = modality.includes('text') || modality === '';

    if (!isTextModel) {
      return false;
    }

    // Check for trusted provider
    const provider = this.extractProvider(model.id);
    if (!TRUSTED_PROVIDERS.has(provider)) {
      return false;
    }

    // Filter out specialized models that aren't suitable for debate
    const lowerName = model.name.toLowerCase();
    const lowerId = model.id.toLowerCase();

    // Exclude embedding, vision-only, and code-only models
    const excludePatterns = [
      'embed',
      'vision-only',
      'code-only',
      'instruct-only',
      'base-only',
    ];

    for (const pattern of excludePatterns) {
      if (lowerName.includes(pattern) || lowerId.includes(pattern)) {
        return false;
      }
    }

    return true;
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

    // Check if model supports reasoning/extended thinking
    const supportsReasoning = this.checkReasoningSupport(model);

    return {
      ...model,
      provider,
      costPer1MTokens,
      tier,
      supportsReasoning,
    };
  }

  /**
   * Check if a model supports extended thinking/reasoning tokens
   */
  private checkReasoningSupport(model: OpenRouterModel): boolean {
    const lowerId = model.id.toLowerCase();
    const lowerName = model.name.toLowerCase();

    // Check against known reasoning model patterns
    for (const pattern of REASONING_MODEL_PATTERNS) {
      if (lowerId.includes(pattern) || lowerName.includes(pattern)) {
        return true;
      }
    }

    // Also check supported_parameters if available
    if (model.supported_parameters) {
      if (model.supported_parameters.includes('reasoning') ||
          model.supported_parameters.includes('reasoning_effort')) {
        return true;
      }
    }

    return false;
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
