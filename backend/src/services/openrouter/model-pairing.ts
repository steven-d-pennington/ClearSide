/**
 * Model Pairing Service
 *
 * Smart pairing algorithm that matches models by capability tier
 * ensuring fair debates (e.g., Claude Opus vs GPT-4, not Claude Haiku vs GPT-4).
 */

import pino from 'pino';
import type { OpenRouterClient } from './openrouter-client.js';
import type {
  TieredModel,
  ModelTier,
  CostThreshold,
  ModelPairing,
  PairingValidation,
} from '../../types/openrouter.js';

const logger = pino({
  name: 'model-pairing',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Mapping from cost threshold to allowed tiers
 */
const COST_THRESHOLD_TO_TIERS: Record<CostThreshold, ModelTier[]> = {
  unlimited: ['frontier', 'mid_tier', 'budget', 'free'],
  high: ['frontier', 'mid_tier', 'budget', 'free'],
  medium: ['mid_tier', 'budget', 'free'],
  low: ['budget', 'free'],
  free_only: ['free'],
};

/**
 * Tier priority order (prefer higher capability tiers)
 */
const TIER_PRIORITY: ModelTier[] = ['frontier', 'mid_tier', 'budget', 'free'];

/**
 * Estimated tokens per typical debate (for cost estimation)
 */
const ESTIMATED_TOKENS_PER_DEBATE = 50000;

/**
 * Model Pairing Service
 *
 * Provides smart auto-selection of model pairs and validation of manual selections.
 */
export class ModelPairingService {
  constructor(private openRouterClient: OpenRouterClient) {}

  /**
   * Auto-select a model pairing based on cost threshold
   *
   * Algorithm:
   * 1. Get models within cost threshold
   * 2. Filter out preview/experimental models (unreliable for long-form content)
   * 3. Group by tier, then by provider
   * 4. Pick highest available tier with 2+ providers
   * 5. Randomly select two different providers
   * 6. Pick best model from each (by context length)
   * 7. Return pairing
   */
  async autoSelectPairing(threshold: CostThreshold = 'unlimited'): Promise<ModelPairing | null> {
    logger.info({ threshold }, 'Auto-selecting model pairing');

    const allowedTiers = COST_THRESHOLD_TO_TIERS[threshold];
    const models = await this.openRouterClient.fetchModels();

    // Filter to allowed tiers and exclude preview/experimental models
    // Preview models often produce truncated or unreliable long-form responses
    const eligible = models.filter((m) => {
      if (!allowedTiers.includes(m.tier)) return false;

      // Exclude preview, experimental, and beta models
      // These models often produce truncated or unreliable long-form responses
      const modelIdLower = m.id.toLowerCase();
      const modelNameLower = m.name.toLowerCase();
      const excludePatterns = ['preview', 'experimental', 'beta', ':free'];

      for (const pattern of excludePatterns) {
        if (modelIdLower.includes(pattern) || modelNameLower.includes(pattern)) {
          logger.debug({ modelId: m.id, pattern }, 'Excluding model from pairing (preview/experimental)');
          return false;
        }
      }

      return true;
    });

    if (eligible.length < 2) {
      throw new Error(`Not enough models available for threshold: ${threshold}`);
    }

    // Try each tier in priority order
    for (const tier of TIER_PRIORITY) {
      if (!allowedTiers.includes(tier)) continue;

      const tierModels = eligible.filter((m) => m.tier === tier);

      // Group by provider
      const byProvider = this.groupByProvider(tierModels);
      const providers = Object.keys(byProvider);

      // Need at least 2 different providers for a fair debate
      if (providers.length >= 2) {
        // Randomly shuffle providers
        const shuffled = this.shuffle(providers);
        const prov1 = shuffled[0]!;
        const prov2 = shuffled[1]!;

        // Pick best model from each provider (by context length, then cost)
        const prov1Models = byProvider[prov1];
        const prov2Models = byProvider[prov2];

        if (!prov1Models || !prov2Models) continue;

        const proModel = this.selectBestModel(prov1Models);
        const conModel = this.selectBestModel(prov2Models);

        if (!proModel || !conModel) continue;

        const pairing: ModelPairing = {
          proModel,
          conModel,
          tier,
          estimatedCostPerDebate: this.estimateCost(proModel, conModel),
        };

        logger.info(
          {
            proModel: proModel.id,
            conModel: conModel.id,
            tier,
          },
          'Model pairing selected'
        );

        return pairing;
      }
    }

    // Fallback: pick any two different models
    logger.warn('No tier with 2+ providers found, using fallback pairing');
    const shuffled = this.shuffle(eligible);
    const proModel = shuffled[0];
    const conModel = shuffled.find((m) => m.provider !== proModel?.provider) || shuffled[1];

    if (!proModel || !conModel) {
      return null;
    }

    return {
      proModel,
      conModel,
      tier: proModel.tier,
      estimatedCostPerDebate: this.estimateCost(proModel, conModel),
    };
  }

  /**
   * Validate a manual model pairing
   * Returns warnings if models are in different tiers
   */
  async validateManualPairing(
    proModelId: string,
    conModelId: string
  ): Promise<PairingValidation> {
    logger.info({ proModelId, conModelId }, 'Validating manual pairing');

    const proModel = await this.openRouterClient.getModel(proModelId);
    const conModel = await this.openRouterClient.getModel(conModelId);

    const warnings: string[] = [];

    if (!proModel) {
      return {
        valid: false,
        warnings: [`Pro model not found: ${proModelId}`],
      };
    }

    if (!conModel) {
      return {
        valid: false,
        warnings: [`Con model not found: ${conModelId}`],
      };
    }

    // Check for same model
    if (proModelId === conModelId) {
      warnings.push('Pro and Con are using the same model');
    }

    // Check for tier mismatch
    if (proModel.tier !== conModel.tier) {
      warnings.push(
        `Models are in different tiers: ${proModel.name} (${proModel.tier}) vs ${conModel.name} (${conModel.tier})`
      );
    }

    // Check for same provider (less interesting debate)
    if (proModel.provider === conModel.provider) {
      warnings.push(
        `Both models are from the same provider (${proModel.provider})`
      );
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      proModel,
      conModel,
    };
  }

  /**
   * Get suggested pairings for each tier
   */
  async getSuggestedPairings(): Promise<ModelPairing[]> {
    const pairings: ModelPairing[] = [];

    for (const tier of TIER_PRIORITY) {
      try {
        // Set threshold to include this tier
        const threshold = this.tierToThreshold(tier);
        const pairing = await this.autoSelectPairing(threshold);
        if (pairing && pairing.tier === tier) {
          pairings.push(pairing);
        }
      } catch {
        // No valid pairing for this tier
      }
    }

    return pairings;
  }

  /**
   * Estimate cost for a debate with given models
   */
  estimateCost(proModel: TieredModel, conModel: TieredModel): number {
    // Rough estimate: assume equal token usage between models
    const tokensPerModel = ESTIMATED_TOKENS_PER_DEBATE / 2;

    const proCost = (tokensPerModel / 1_000_000) * proModel.costPer1MTokens;
    const conCost = (tokensPerModel / 1_000_000) * conModel.costPer1MTokens;

    return proCost + conCost;
  }

  /**
   * Group models by provider
   */
  private groupByProvider(models: TieredModel[]): Record<string, TieredModel[]> {
    const grouped: Record<string, TieredModel[]> = {};

    for (const model of models) {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider]!.push(model);
    }

    return grouped;
  }

  /**
   * Select the best model from a list
   * Prefers larger context length, then lower cost
   */
  private selectBestModel(models: TieredModel[]): TieredModel | undefined {
    if (models.length === 0) return undefined;

    return models.reduce((best, current) => {
      // Prefer larger context length
      if (current.context_length > best.context_length) {
        return current;
      }
      // If equal context, prefer lower cost
      if (
        current.context_length === best.context_length &&
        current.costPer1MTokens < best.costPer1MTokens
      ) {
        return current;
      }
      return best;
    });
  }

  /**
   * Shuffle an array (Fisher-Yates)
   */
  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = result[i];
      result[i] = result[j]!;
      result[j] = temp!;
    }
    return result;
  }

  /**
   * Map tier to minimum threshold that includes it
   */
  private tierToThreshold(tier: ModelTier): CostThreshold {
    switch (tier) {
      case 'frontier':
        return 'unlimited';
      case 'mid_tier':
        return 'medium';
      case 'budget':
        return 'low';
      case 'free':
        return 'free_only';
    }
  }
}

/**
 * Create a new ModelPairingService instance
 */
export function createModelPairingService(
  openRouterClient: OpenRouterClient
): ModelPairingService {
  return new ModelPairingService(openRouterClient);
}
