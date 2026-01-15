/**
 * Model Routes
 *
 * API endpoints for OpenRouter model listing, pairing suggestions,
 * and manual selection validation.
 */

import express, { type Request, type Response } from 'express';
import { createLogger } from '../utils/logger.js';
import { getOpenRouterClient, createModelPairingService, CURATED_MODELS } from '../services/openrouter/index.js';
import type { CostThreshold, ModelTier } from '../types/openrouter.js';

const router = express.Router();
const logger = createLogger({ module: 'ModelRoutes' });

// Lazy initialization - services created on first request
// This ensures dotenv has loaded environment variables before client creation
let _openRouterClient: ReturnType<typeof getOpenRouterClient> | null = null;
let _pairingService: ReturnType<typeof createModelPairingService> | null = null;

function getServices() {
  if (!_openRouterClient) {
    _openRouterClient = getOpenRouterClient();
    _pairingService = createModelPairingService(_openRouterClient);
  }
  return { openRouterClient: _openRouterClient, pairingService: _pairingService! };
}

/**
 * Validate cost threshold parameter
 */
function isValidCostThreshold(value: unknown): value is CostThreshold {
  return ['unlimited', 'high', 'medium', 'low', 'free_only'].includes(String(value));
}

/**
 * Validate model tier parameter
 */
function isValidTier(value: unknown): value is ModelTier {
  return ['frontier', 'mid_tier', 'budget', 'free'].includes(String(value));
}

/**
 * GET /api/models
 *
 * List available OpenRouter models
 *
 * Query params:
 * - threshold: CostThreshold - filter by max cost tier
 * - tier: ModelTier - filter by specific tier
 * - provider: string - filter by provider (e.g., "anthropic")
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { openRouterClient } = getServices();
    const { threshold, tier, provider } = req.query;

    // Check if OpenRouter is configured
    if (!openRouterClient.isConfigured()) {
      res.status(503).json({
        error: 'OpenRouter not configured',
        message: 'OPENROUTER_API_KEY environment variable is not set',
      });
      return;
    }

    let models = await openRouterClient.fetchModels();

    // Filter by cost threshold
    if (threshold && isValidCostThreshold(threshold)) {
      models = await openRouterClient.getModelsForThreshold(threshold);
    }

    // Filter by specific tier
    if (tier && isValidTier(tier)) {
      models = models.filter((m) => m.tier === tier);
    }

    // Filter by provider
    if (provider && typeof provider === 'string') {
      models = models.filter((m) => m.provider === provider);
    }

    // Get unique providers for UI
    const providers = [...new Set(models.map((m) => m.provider))].sort();

    // Get tier counts
    const tierCounts: Record<ModelTier, number> = {
      frontier: models.filter((m) => m.tier === 'frontier').length,
      mid_tier: models.filter((m) => m.tier === 'mid_tier').length,
      budget: models.filter((m) => m.tier === 'budget').length,
      free: models.filter((m) => m.tier === 'free').length,
    };

    res.json({
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        tier: m.tier,
        costPer1MTokens: m.costPer1MTokens,
        contextLength: m.context_length,
        description: m.description,
        supportsReasoning: m.supportsReasoning,
      })),
      providers,
      tierCounts,
      totalCount: models.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch models');
    res.status(500).json({
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/models/pairings
 *
 * Get suggested model pairings for auto mode
 *
 * Query params:
 * - threshold: CostThreshold - maximum cost tier allowed
 */
router.get('/pairings', async (req: Request, res: Response) => {
  try {
    const { openRouterClient, pairingService } = getServices();
    const { threshold } = req.query;

    // Check if OpenRouter is configured
    if (!openRouterClient.isConfigured()) {
      res.status(503).json({
        error: 'OpenRouter not configured',
        message: 'OPENROUTER_API_KEY environment variable is not set',
      });
      return;
    }

    const costThreshold: CostThreshold = isValidCostThreshold(threshold)
      ? threshold
      : 'unlimited';

    const pairing = await pairingService.autoSelectPairing(costThreshold);

    if (!pairing) {
      res.status(404).json({
        error: 'No pairing available',
        message: 'Could not find suitable models for a pairing with the given cost threshold',
      });
      return;
    }

    res.json({
      pairing: {
        proModel: {
          id: pairing.proModel.id,
          name: pairing.proModel.name,
          provider: pairing.proModel.provider,
          tier: pairing.proModel.tier,
          costPer1MTokens: pairing.proModel.costPer1MTokens,
          contextLength: pairing.proModel.context_length,
          supportsReasoning: pairing.proModel.supportsReasoning,
        },
        conModel: {
          id: pairing.conModel.id,
          name: pairing.conModel.name,
          provider: pairing.conModel.provider,
          tier: pairing.conModel.tier,
          costPer1MTokens: pairing.conModel.costPer1MTokens,
          contextLength: pairing.conModel.context_length,
          supportsReasoning: pairing.conModel.supportsReasoning,
        },
        tier: pairing.tier,
        estimatedCostPerDebate: pairing.estimatedCostPerDebate,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get model pairings');
    res.status(500).json({
      error: 'Failed to get model pairings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/models/pairings/suggestions
 *
 * Get suggested pairings for each tier
 */
router.get('/pairings/suggestions', async (_req: Request, res: Response) => {
  try {
    const { openRouterClient, pairingService } = getServices();

    // Check if OpenRouter is configured
    if (!openRouterClient.isConfigured()) {
      res.status(503).json({
        error: 'OpenRouter not configured',
        message: 'OPENROUTER_API_KEY environment variable is not set',
      });
      return;
    }

    const pairings = await pairingService.getSuggestedPairings();

    res.json({
      pairings: pairings.map((p) => ({
        proModel: {
          id: p.proModel.id,
          name: p.proModel.name,
          provider: p.proModel.provider,
          tier: p.proModel.tier,
          costPer1MTokens: p.proModel.costPer1MTokens,
          supportsReasoning: p.proModel.supportsReasoning,
        },
        conModel: {
          id: p.conModel.id,
          name: p.conModel.name,
          provider: p.conModel.provider,
          tier: p.conModel.tier,
          costPer1MTokens: p.conModel.costPer1MTokens,
          supportsReasoning: p.conModel.supportsReasoning,
        },
        tier: p.tier,
        estimatedCostPerDebate: p.estimatedCostPerDebate,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get pairing suggestions');
    res.status(500).json({
      error: 'Failed to get pairing suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/models/validate
 *
 * Validate a manual model pairing
 *
 * Body:
 * - proModelId: string
 * - conModelId: string
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { openRouterClient, pairingService } = getServices();
    const { proModelId, conModelId } = req.body;

    // Check if OpenRouter is configured
    if (!openRouterClient.isConfigured()) {
      res.status(503).json({
        error: 'OpenRouter not configured',
        message: 'OPENROUTER_API_KEY environment variable is not set',
      });
      return;
    }

    // Validate required fields
    if (!proModelId || typeof proModelId !== 'string') {
      res.status(400).json({
        error: 'Validation failed',
        message: 'proModelId is required and must be a string',
      });
      return;
    }

    if (!conModelId || typeof conModelId !== 'string') {
      res.status(400).json({
        error: 'Validation failed',
        message: 'conModelId is required and must be a string',
      });
      return;
    }

    const validation = await pairingService.validateManualPairing(proModelId, conModelId);

    res.json({
      valid: validation.valid,
      warnings: validation.warnings,
      proModel: validation.proModel
        ? {
            id: validation.proModel.id,
            name: validation.proModel.name,
            provider: validation.proModel.provider,
            tier: validation.proModel.tier,
            costPer1MTokens: validation.proModel.costPer1MTokens,
            contextLength: validation.proModel.context_length,
            supportsReasoning: validation.proModel.supportsReasoning,
          }
        : null,
      conModel: validation.conModel
        ? {
            id: validation.conModel.id,
            name: validation.conModel.name,
            provider: validation.conModel.provider,
            tier: validation.conModel.tier,
            costPer1MTokens: validation.conModel.costPer1MTokens,
            contextLength: validation.conModel.context_length,
            supportsReasoning: validation.conModel.supportsReasoning,
          }
        : null,
      estimatedCost:
        validation.proModel && validation.conModel
          ? pairingService.estimateCost(validation.proModel, validation.conModel)
          : null,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to validate model pairing');
    res.status(500).json({
      error: 'Failed to validate model pairing',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/models/curated
 *
 * Get curated list of reliable models (latest 2 from each preferred provider)
 */
router.get('/curated', async (_req: Request, res: Response) => {
  try {
    const { openRouterClient } = getServices();

    // Check if OpenRouter is configured
    if (!openRouterClient.isConfigured()) {
      res.status(503).json({
        error: 'OpenRouter not configured',
        message: 'OPENROUTER_API_KEY environment variable is not set',
      });
      return;
    }

    const curatedModels = await openRouterClient.getCuratedModels();

    // Get unique providers for UI
    const providers = [...new Set(curatedModels.map((m) => m.provider))].sort();

    // Get tier counts
    const tierCounts: Record<ModelTier, number> = {
      frontier: curatedModels.filter((m) => m.tier === 'frontier').length,
      mid_tier: curatedModels.filter((m) => m.tier === 'mid_tier').length,
      budget: curatedModels.filter((m) => m.tier === 'budget').length,
      free: curatedModels.filter((m) => m.tier === 'free').length,
    };

    res.json({
      models: curatedModels.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        tier: m.tier,
        costPer1MTokens: m.costPer1MTokens,
        contextLength: m.context_length,
        description: m.description,
        supportsReasoning: m.supportsReasoning,
        curated: true,
      })),
      providers,
      tierCounts,
      totalCount: curatedModels.length,
      curatedProviders: Object.keys(CURATED_MODELS),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch curated models');
    res.status(500).json({
      error: 'Failed to fetch curated models',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/models/:modelId/healthcheck
 *
 * Run a healthcheck on a specific model
 * Sends a simple test prompt and validates the response
 */
router.post('/:modelId/healthcheck', async (req: Request, res: Response) => {
  try {
    const { openRouterClient } = getServices();
    const modelIdParam = req.params.modelId;
    if (!modelIdParam) {
      res.status(400).json({ error: 'Model ID is required' });
      return;
    }
    const modelId = decodeURIComponent(modelIdParam);

    // Check if OpenRouter is configured
    if (!openRouterClient.isConfigured()) {
      res.status(503).json({
        error: 'OpenRouter not configured',
        message: 'OPENROUTER_API_KEY environment variable is not set',
      });
      return;
    }

    logger.info({ modelId }, 'Running model healthcheck');
    const result = await openRouterClient.healthcheckModel(modelId);

    res.json(result);
  } catch (error) {
    logger.error({ error, modelId: req.params.modelId }, 'Failed to run model healthcheck');
    res.status(500).json({
      error: 'Failed to run healthcheck',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/models/status
 *
 * Check OpenRouter configuration status
 */
router.get('/status', (_req: Request, res: Response) => {
  const { openRouterClient } = getServices();
  res.json({
    configured: openRouterClient.isConfigured(),
    message: openRouterClient.isConfigured()
      ? 'OpenRouter is configured and ready'
      : 'OpenRouter API key not configured',
  });
});

export default router;
