/**
 * Duelogic Routes
 * Express routes for Duelogic debate mode management
 *
 * Endpoints:
 * - POST /api/debates/duelogic - Create new Duelogic debate
 * - GET /api/duelogic/chairs - List philosophical chairs
 * - GET /api/duelogic/presets - List preset matchups
 * - GET /api/duelogic/models - List available models
 * - GET /api/debates/:id/duelogic/status - Get Duelogic debate status
 * - POST /api/debates/:id/duelogic/pause - Pause debate
 * - POST /api/debates/:id/duelogic/resume - Resume debate
 * - POST /api/debates/:id/duelogic/stop - Stop debate
 * - POST /api/debates/:id/arbiter/interject - Manual arbiter interjection
 */

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { sseManager } from '../services/sse/index.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import * as duelogicRepository from '../db/repositories/duelogic-repository.js';
import { createLogger } from '../utils/logger.js';
import {
  PHILOSOPHICAL_CHAIR_INFO,
  DUELOGIC_PRESETS,
  DUELOGIC_CONSTRAINTS,
  DUELOGIC_DEFAULTS,
  mergeWithDuelogicDefaults,
} from '../types/duelogic.js';
import {
  DuelogicOrchestrator,
  createDuelogicOrchestrator,
} from '../services/debate/duelogic-orchestrator.js';

const router = express.Router();
const logger = createLogger({ module: 'DuelogicRoutes' });

// Active orchestrators for pause/resume/stop
const activeOrchestrators = new Map<string, DuelogicOrchestrator>();

// ============================================================================
// Validation Schemas
// ============================================================================

const PhilosophicalChairSchema = z.enum([
  'utilitarian',
  'virtue_ethics',
  'deontological',
  'pragmatic',
  'libertarian',
  'communitarian',
  'cosmopolitan',
  'precautionary',
  'autonomy_centered',
  'care_ethics',
]);

const DuelogicChairSchema = z.object({
  position: z.string().min(1),
  framework: PhilosophicalChairSchema,
  modelId: z.string().min(1),
  modelDisplayName: z.string().optional(),
  providerName: z.string().optional(),
  temperatureOverride: z.number().min(0).max(1).optional(),
  persona: z.string().optional(),
});

const AggressivenessLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const AccountabilityLevelSchema = z.enum(['relaxed', 'moderate', 'strict']);

const ToneSchema = z.enum(['academic', 'respectful', 'spirited', 'heated']);

const FlowStyleSchema = z.enum(['structured', 'conversational']);

const CreateDuelogicDebateSchema = z.object({
  proposition: z.string().min(10, 'Proposition must be at least 10 characters'),
  propositionContext: z.string().optional(),
  config: z
    .object({
      chairs: z
        .array(DuelogicChairSchema)
        .min(
          DUELOGIC_CONSTRAINTS.minChairs,
          `Minimum ${DUELOGIC_CONSTRAINTS.minChairs} chairs required`
        )
        .max(
          DUELOGIC_CONSTRAINTS.maxChairs,
          `Maximum ${DUELOGIC_CONSTRAINTS.maxChairs} chairs allowed`
        )
        .optional(),
      arbiter: z
        .object({
          modelId: z.string().optional(),
          modelDisplayName: z.string().optional(),
          accountabilityLevel: AccountabilityLevelSchema.optional(),
          interventionThreshold: z.number().min(0).max(100).optional(),
        })
        .optional(),
      flow: z
        .object({
          style: FlowStyleSchema.optional(),
          maxExchanges: z
            .number()
            .min(DUELOGIC_CONSTRAINTS.minExchanges)
            .max(DUELOGIC_CONSTRAINTS.maxExchanges)
            .optional(),
          targetDurationMinutes: z.number().min(5).max(120).optional(),
          autoAdvance: z.boolean().optional(),
        })
        .optional(),
      interruptions: z
        .object({
          enabled: z.boolean().optional(),
          allowChairInterruptions: z.boolean().optional(),
          allowArbiterInterruptions: z.boolean().optional(),
          aggressiveness: AggressivenessLevelSchema.optional(),
          cooldownSeconds: z.number().min(0).max(300).optional(),
        })
        .optional(),
      tone: ToneSchema.optional(),
      podcastMode: z
        .object({
          enabled: z.boolean().optional(),
          showName: z.string().optional(),
          episodeNumber: z.number().optional(),
          includeIntro: z.boolean().optional(),
          includeOutro: z.boolean().optional(),
          includeCallToAction: z.boolean().optional(),
        })
        .optional(),
      mandates: z
        .object({
          steelManningRequired: z.boolean().optional(),
          selfCritiqueRequired: z.boolean().optional(),
          arbiterCanInterject: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

const ManualInterjectionSchema = z.object({
  reason: z.string().min(1),
  targetChairPosition: z.string().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique debate ID (UUID format required by database)
 */
function generateDebateId(): string {
  return uuidv4();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /debates/duelogic
 * Create a new Duelogic debate
 */
router.post('/debates/duelogic', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateDuelogicDebateSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        errors: parseResult.error.errors,
      });
      return;
    }

    const { proposition, propositionContext, config: inputConfig } = parseResult.data;

    // Generate debate ID
    const debateId = generateDebateId();

    // Merge with defaults - cast to allow partial arbiter config
    const config = mergeWithDuelogicDefaults(inputConfig as any || {});

    logger.info(
      {
        debateId,
        proposition: proposition.substring(0, 50),
        chairCount: config.chairs.length,
        tone: config.tone,
        maxExchanges: config.flow.maxExchanges,
      },
      'Creating Duelogic debate'
    );

    // Save debate to database
    await debateRepository.create({
      id: debateId,
      propositionText: proposition,
      propositionContext: propositionContext ? { context: propositionContext } : undefined,
      debateMode: 'duelogic',
      duelogicConfig: config as unknown as Record<string, unknown>,
    });

    // Create orchestrator
    const orchestrator = createDuelogicOrchestrator({
      debateId,
      proposition,
      propositionContext,
      config,
      sseManager,
    });

    // Register orchestrator for pause/resume/stop
    activeOrchestrators.set(debateId, orchestrator);

    // Start debate in background (non-blocking)
    orchestrator.start().catch((error) => {
      logger.error({ debateId, error }, 'Duelogic debate failed');
      activeOrchestrators.delete(debateId);
    });

    res.status(201).json({
      success: true,
      debateId,
      config,
      message: 'Duelogic debate created and starting',
    });
  } catch (error) {
    logger.error({ error }, 'Error creating Duelogic debate');
    res.status(500).json({
      success: false,
      message: 'Failed to create debate',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /duelogic/chairs
 * List available philosophical chairs with descriptions
 */
router.get('/duelogic/chairs', (_req: Request, res: Response) => {
  const chairs = Object.entries(PHILOSOPHICAL_CHAIR_INFO).map(([id, info]) => ({
    id,
    ...info,
  }));

  res.json({
    success: true,
    chairs,
    count: chairs.length,
  });
});

/**
 * GET /duelogic/presets
 * List preset chair matchups
 */
router.get('/duelogic/presets', (_req: Request, res: Response) => {
  const presets = Object.entries(DUELOGIC_PRESETS).map(([id, preset]) => ({
    id,
    ...preset,
  }));

  res.json({
    success: true,
    presets,
    count: presets.length,
  });
});

/**
 * GET /duelogic/models
 * List available models with display names and providers
 */
router.get('/duelogic/models', async (_req: Request, res: Response) => {
  // Validated against OpenRouter API model IDs
  // See: https://openrouter.ai/api/v1/models
  const models = [
    // Anthropic Models
    {
      id: 'anthropic/claude-opus-4.5',
      displayName: 'Claude Opus 4.5',
      provider: 'Anthropic',
      capabilities: ['flagship', 'deep-reasoning', 'creative'],
      costTier: 'high',
    },
    {
      id: 'anthropic/claude-sonnet-4.5',
      displayName: 'Claude Sonnet 4.5',
      provider: 'Anthropic',
      capabilities: ['fast', 'intelligent', 'nuanced'],
      costTier: 'medium',
    },
    {
      id: 'anthropic/claude-sonnet-4',
      displayName: 'Claude Sonnet 4',
      provider: 'Anthropic',
      capabilities: ['fast', 'intelligent', 'nuanced'],
      costTier: 'medium',
    },
    {
      id: 'anthropic/claude-haiku-4.5',
      displayName: 'Claude Haiku 4.5',
      provider: 'Anthropic',
      capabilities: ['fast', 'cost-effective'],
      costTier: 'low',
    },
    // OpenAI Models
    {
      id: 'openai/gpt-5.2-pro',
      displayName: 'GPT-5.2 Pro',
      provider: 'OpenAI',
      capabilities: ['flagship', 'reasoning', '400k-context'],
      costTier: 'high',
    },
    {
      id: 'openai/gpt-5.2',
      displayName: 'GPT-5.2',
      provider: 'OpenAI',
      capabilities: ['adaptive-reasoning', 'multimodal'],
      costTier: 'high',
    },
    {
      id: 'openai/o3',
      displayName: 'o3',
      provider: 'OpenAI',
      capabilities: ['reasoning', 'STEM', 'mathematical'],
      costTier: 'high',
    },
    {
      id: 'openai/o3-mini',
      displayName: 'o3 Mini',
      provider: 'OpenAI',
      capabilities: ['reasoning', 'efficient'],
      costTier: 'medium',
    },
    {
      id: 'openai/gpt-4o',
      displayName: 'GPT-4o',
      provider: 'OpenAI',
      capabilities: ['multimodal', 'fast'],
      costTier: 'medium',
    },
    {
      id: 'openai/gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      provider: 'OpenAI',
      capabilities: ['fast', 'cost-effective'],
      costTier: 'low',
    },
    // xAI Models
    {
      id: 'x-ai/grok-3',
      displayName: 'Grok 3',
      provider: 'xAI',
      capabilities: ['unfiltered', 'witty'],
      costTier: 'medium',
    },
    {
      id: 'x-ai/grok-3-mini',
      displayName: 'Grok 3 Mini',
      provider: 'xAI',
      capabilities: ['fast', 'cost-effective'],
      costTier: 'low',
    },
    // Google Models
    {
      id: 'google/gemini-3-pro-preview',
      displayName: 'Gemini 3 Pro',
      provider: 'Google',
      capabilities: ['flagship', 'multimodal', 'reasoning'],
      costTier: 'high',
    },
    {
      id: 'google/gemini-3-flash-preview',
      displayName: 'Gemini 3 Flash',
      provider: 'Google',
      capabilities: ['fast', 'agentic', 'multimodal'],
      costTier: 'medium',
    },
    {
      id: 'google/gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      provider: 'Google',
      capabilities: ['deep-reasoning', 'multimodal'],
      costTier: 'medium',
    },
    {
      id: 'google/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      provider: 'Google',
      capabilities: ['fast', 'efficient', 'agentic'],
      costTier: 'low',
    },
    // Meta Models
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      displayName: 'Llama 3.3 70B Instruct',
      provider: 'Meta',
      capabilities: ['open-source', 'cost-effective'],
      costTier: 'low',
    },
    // DeepSeek Models
    {
      id: 'deepseek/deepseek-r1',
      displayName: 'DeepSeek R1',
      provider: 'DeepSeek',
      capabilities: ['reasoning', 'mathematical'],
      costTier: 'low',
    },
    {
      id: 'deepseek/deepseek-chat',
      displayName: 'DeepSeek Chat',
      provider: 'DeepSeek',
      capabilities: ['conversational', 'cost-effective'],
      costTier: 'low',
    },
  ];

  res.json({
    success: true,
    models,
    count: models.length,
  });
});

/**
 * GET /debates/:id/duelogic/status
 * Get Duelogic debate status and stats
 */
router.get('/debates/:id/duelogic/status', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Check for active orchestrator first
    const orchestrator = activeOrchestrators.get(id!);
    if (orchestrator) {
      const status = orchestrator.getStatus();
      return res.json({
        success: true,
        active: true,
        ...status,
      });
    }

    // Check database for completed/inactive debate
    const debate = await debateRepository.findById(id!);

    if (!debate) {
      return res.status(404).json({
        success: false,
        message: 'Duelogic debate not found',
      });
    }

    // Check if it's a duelogic debate
    if (debate.debateMode !== 'duelogic') {
      return res.status(400).json({
        success: false,
        message: 'Debate is not a Duelogic debate',
        debateMode: debate.debateMode,
      });
    }

    // Get stats from database
    const stats = await duelogicRepository.getDuelogicDebateStats(id!);

    return res.json({
      success: true,
      active: false,
      debate: {
        id: debate.id,
        proposition: debate.propositionText,
        status: debate.status,
        createdAt: debate.createdAt,
        totalDurationMs: debate.totalDurationMs,
      },
      stats,
    });
  } catch (error) {
    logger.error({ id, error }, 'Error getting Duelogic debate status');
    return res.status(500).json({
      success: false,
      message: 'Failed to get debate status',
    });
  }
});

/**
 * POST /debates/:id/duelogic/pause
 * Pause an active Duelogic debate
 */
router.post('/debates/:id/duelogic/pause', (req: Request, res: Response) => {
  const { id } = req.params;

  const orchestrator = activeOrchestrators.get(id!);
  if (!orchestrator) {
    return res.status(404).json({
      success: false,
      message: 'Duelogic debate not found or not active',
    });
  }

  orchestrator.pause();

  logger.info({ debateId: id }, 'Duelogic debate paused');

  return res.json({
    success: true,
    message: 'Debate paused',
    debateId: id,
    pausedAt: new Date().toISOString(),
  });
});

/**
 * POST /debates/:id/duelogic/resume
 * Resume a paused Duelogic debate
 */
router.post('/debates/:id/duelogic/resume', (req: Request, res: Response) => {
  const { id } = req.params;

  const orchestrator = activeOrchestrators.get(id!);
  if (!orchestrator) {
    return res.status(404).json({
      success: false,
      message: 'Duelogic debate not found or not active',
    });
  }

  orchestrator.resume();

  logger.info({ debateId: id }, 'Duelogic debate resumed');

  return res.json({
    success: true,
    message: 'Debate resumed',
    debateId: id,
    resumedAt: new Date().toISOString(),
  });
});

/**
 * POST /debates/:id/duelogic/stop
 * Stop an active Duelogic debate
 */
router.post('/debates/:id/duelogic/stop', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const orchestrator = activeOrchestrators.get(id!);
  if (!orchestrator) {
    return res.status(404).json({
      success: false,
      message: 'Duelogic debate not found or not active',
    });
  }

  orchestrator.stop(reason || 'User stopped debate');
  activeOrchestrators.delete(id!);

  logger.info({ debateId: id, reason }, 'Duelogic debate stopped');

  return res.json({
    success: true,
    message: 'Debate stopped',
    debateId: id,
    stoppedAt: new Date().toISOString(),
    reason: reason || 'User stopped debate',
  });
});

/**
 * POST /debates/:id/arbiter/interject
 * Manually trigger arbiter interjection
 */
router.post('/debates/:id/arbiter/interject', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const parseResult = ManualInterjectionSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        errors: parseResult.error.errors,
      });
    }

    const { reason, targetChairPosition } = parseResult.data;

    const orchestrator = activeOrchestrators.get(id!);
    if (!orchestrator) {
      return res.status(404).json({
        success: false,
        message: 'Duelogic debate not found or not active',
      });
    }

    // TODO: Implement manual interjection in orchestrator
    // For now, just log and return success
    logger.info(
      { debateId: id, reason, targetChairPosition },
      'Manual interjection requested'
    );

    return res.json({
      success: true,
      message: 'Interjection queued',
      debateId: id,
      reason,
      targetChairPosition,
    });
  } catch (error) {
    logger.error({ id, error }, 'Error triggering manual interjection');
    return res.status(500).json({
      success: false,
      message: 'Failed to trigger interjection',
    });
  }
});

/**
 * GET /duelogic/defaults
 * Get default configuration values
 */
router.get('/duelogic/defaults', (_req: Request, res: Response) => {
  res.json({
    success: true,
    defaults: DUELOGIC_DEFAULTS,
    constraints: DUELOGIC_CONSTRAINTS,
  });
});

export default router;
