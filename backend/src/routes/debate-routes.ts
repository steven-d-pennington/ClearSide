/**
 * Debate Routes
 * Express routes for debate management and SSE streaming
 */

import express, { type Request, type Response } from 'express';
import { sseManager } from '../services/sse/index.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import * as utteranceRepository from '../db/repositories/utterance-repository.js';
import * as presetRepository from '../db/repositories/preset-repository.js';
import { createLogger } from '../utils/logger.js';
import type { CreateDebateInput, FlowMode } from '../types/database.js';
import {
  isPresetMode,
  isBrevityLevel,
  type PresetMode,
  type BrevityLevel,
} from '../types/configuration.js';

// Orchestrator and dependencies
import { DebateOrchestrator, DebateStateMachine, turnManager } from '../services/debate/index.js';
import { defaultLLMClient } from '../services/llm/index.js';
import {
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
} from '../services/agents/index.js';
import { schemaValidator } from '../services/validation/index.js';

const router = express.Router();
const logger = createLogger({ module: 'DebateRoutes' });

/**
 * Validate configuration input from request body
 * Returns validation errors array (empty if valid)
 */
interface ConfigInput {
  presetMode?: unknown;
  brevityLevel?: unknown;
  llmTemperature?: unknown;
  maxTokensPerResponse?: unknown;
  requireCitations?: unknown;
}

function validateConfigInput(config: ConfigInput): string[] {
  const errors: string[] = [];

  if (config.presetMode !== undefined && !isPresetMode(config.presetMode)) {
    errors.push(
      `Invalid presetMode: must be one of 'quick', 'balanced', 'deep_dive', 'research', or 'custom'`
    );
  }

  if (config.brevityLevel !== undefined && !isBrevityLevel(config.brevityLevel)) {
    errors.push(`Invalid brevityLevel: must be an integer between 1 and 5`);
  }

  if (config.llmTemperature !== undefined) {
    const temp = Number(config.llmTemperature);
    if (isNaN(temp) || temp < 0 || temp > 1) {
      errors.push(`Invalid llmTemperature: must be a number between 0 and 1`);
    }
  }

  if (config.maxTokensPerResponse !== undefined) {
    const tokens = Number(config.maxTokensPerResponse);
    if (isNaN(tokens) || !Number.isInteger(tokens) || tokens < 128 || tokens > 4096) {
      errors.push(`Invalid maxTokensPerResponse: must be an integer between 128 and 4096`);
    }
  }

  if (config.requireCitations !== undefined && typeof config.requireCitations !== 'boolean') {
    errors.push(`Invalid requireCitations: must be a boolean`);
  }

  return errors;
}

/**
 * Start the debate orchestrator in the background
 * This is a fire-and-forget operation - the HTTP response is sent before this completes
 */
async function startDebateOrchestrator(
  debateId: string,
  propositionText: string,
  propositionContext?: Record<string, unknown>,
  flowMode: FlowMode = 'auto'
): Promise<void> {
  logger.info({ debateId, propositionText, flowMode }, 'Starting debate orchestrator');

  try {
    // Create per-debate state machine
    const stateMachine = new DebateStateMachine(debateId);

    // Create per-debate agent instances
    const agents = {
      pro: new ProAdvocateAgent(defaultLLMClient),
      con: new ConAdvocateAgent(defaultLLMClient),
      moderator: new ModeratorAgent(defaultLLMClient),
      orchestrator: new OrchestratorAgent(defaultLLMClient),
    };

    // Create orchestrator with all dependencies
    const orchestrator = new DebateOrchestrator(
      debateId,
      stateMachine,
      turnManager,
      sseManager,
      schemaValidator,
      agents,
      {
        validateUtterances: true,
        broadcastEvents: true,
        autoSaveTranscript: true,
        flowMode,
      }
    );

    // Start the debate - this runs all 6 phases
    const transcript = await orchestrator.startDebate(propositionText, propositionContext);

    logger.info(
      { debateId, phases: transcript.utterances.length },
      'Debate completed successfully'
    );
  } catch (error) {
    logger.error({ debateId, error }, 'Debate orchestrator failed');

    // Broadcast error to connected SSE clients
    sseManager.broadcastToDebate(debateId, 'error', {
      debateId,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    // Update debate status to failed
    try {
      await debateRepository.updateStatus(debateId, { status: 'failed' });
    } catch (updateError) {
      logger.error({ debateId, updateError }, 'Failed to update debate status to failed');
    }
  }
}

/**
 * GET /debates/:debateId/stream
 * SSE endpoint for streaming debate events in real-time
 */
router.get('/debates/:debateId/stream', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const lastEventId = req.headers['last-event-id'] as string | undefined;

  logger.info({ debateId, lastEventId }, 'SSE stream requested');

  try {
    // Verify debate exists
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      logger.warn({ debateId }, 'Debate not found for SSE stream');
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Register SSE client
    const clientId = sseManager.registerClient(debateId!, res, lastEventId);

    logger.info({ debateId, clientId, debateStatus: debate.status }, 'SSE client connected');

    // Handle client disconnect
    req.on('close', () => {
      logger.info({ debateId: debateId!, clientId }, 'SSE client disconnected');
      sseManager.unregisterClient(clientId);
    });

    // Handle connection errors
    res.on('error', (error) => {
      logger.error({ debateId: debateId!, clientId, error }, 'SSE stream error');
      sseManager.unregisterClient(clientId);
    });

    // If debate is already completed, send complete event immediately
    if (debate.status === 'completed') {
      sseManager.sendToClient(clientId, 'complete', {
        debateId: debate.id,
        totalDurationMs: debate.totalDurationMs || 0,
        finalPhase: debate.currentPhase,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error({ debateId, error }, 'Error setting up SSE stream');

    // If headers not sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to set up SSE stream',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

/**
 * POST /debates
 * Create a new debate and start the orchestrator
 *
 * Request body:
 * - propositionText (required): The debate proposition
 * - propositionContext (optional): Additional context object
 * - flowMode (optional): 'auto' or 'step' (default: 'auto')
 * - presetMode (optional): 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom'
 * - brevityLevel (optional): 1-5 (1=detailed, 5=concise)
 * - llmTemperature (optional): 0-1
 * - maxTokensPerResponse (optional): 128-4096
 * - requireCitations (optional): boolean
 */
router.post('/debates', async (req: Request, res: Response) => {
  try {
    // Validate flowMode if provided
    const flowMode: FlowMode = req.body.flowMode === 'step' ? 'step' : 'auto';

    // Validate configuration input
    const configInput: ConfigInput = {
      presetMode: req.body.presetMode,
      brevityLevel: req.body.brevityLevel,
      llmTemperature: req.body.llmTemperature,
      maxTokensPerResponse: req.body.maxTokensPerResponse,
      requireCitations: req.body.requireCitations,
    };

    const configErrors = validateConfigInput(configInput);
    if (configErrors.length > 0) {
      res.status(400).json({
        error: 'Invalid configuration',
        messages: configErrors,
      });
      return;
    }

    // Build CreateDebateInput with optional config fields
    const input: CreateDebateInput = {
      propositionText: req.body.propositionText,
      propositionContext: req.body.propositionContext,
      flowMode,
      // Include config fields only if provided
      ...(configInput.presetMode !== undefined && {
        presetMode: configInput.presetMode as PresetMode,
      }),
      ...(configInput.brevityLevel !== undefined && {
        brevityLevel: configInput.brevityLevel as BrevityLevel,
      }),
      ...(configInput.llmTemperature !== undefined && {
        llmTemperature: Number(configInput.llmTemperature),
      }),
      ...(configInput.maxTokensPerResponse !== undefined && {
        maxTokensPerResponse: Number(configInput.maxTokensPerResponse),
      }),
      ...(configInput.requireCitations !== undefined && {
        requireCitations: configInput.requireCitations as boolean,
      }),
    };

    // Validate required input
    if (!input.propositionText || typeof input.propositionText !== 'string') {
      res.status(400).json({
        error: 'Invalid input',
        message: 'propositionText is required and must be a string',
      });
      return;
    }

    // Create debate in database
    const debate = await debateRepository.create(input);

    logger.info(
      {
        debateId: debate.id,
        propositionText: debate.propositionText,
        flowMode,
        presetMode: debate.presetMode,
        brevityLevel: debate.brevityLevel,
      },
      'Debate created'
    );

    // Return 201 immediately - don't wait for orchestrator
    res.status(201).json(debate);

    // Start orchestrator in background (fire and forget)
    // The .catch() ensures errors don't crash the server
    startDebateOrchestrator(
      debate.id,
      input.propositionText,
      input.propositionContext as Record<string, unknown> | undefined,
      flowMode
    ).catch((error) => {
      // This catch is a safety net - startDebateOrchestrator has its own error handling
      logger.error({ debateId: debate.id, error }, 'Unhandled orchestrator error');
    });
  } catch (error) {
    logger.error({ error }, 'Error creating debate');
    res.status(500).json({
      error: 'Failed to create debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId
 * Get debate status and details
 */
router.get('/debates/:debateId', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Include client count in response
    const clientCount = sseManager.getClientCount(debateId);

    res.json({
      ...debate,
      liveViewers: clientCount,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error getting debate');
    res.status(500).json({
      error: 'Failed to get debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId/utterances
 * Get all utterances for a debate (for replay)
 */
router.get('/debates/:debateId/utterances', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    const utterances = await utteranceRepository.findByDebateId(debateId!);

    res.json({
      debateId,
      utterances,
      count: utterances.length,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error getting utterances');
    res.status(500).json({
      error: 'Failed to get utterances',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates
 * List all debates with optional filtering
 */
router.get('/debates', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const debates = await debateRepository.list({
      status: status as any,
      limit,
      offset,
    });

    res.json({
      debates,
      count: debates.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing debates');
    res.status(500).json({
      error: 'Failed to list debates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/pause
 * Pause a live debate
 */
router.post('/debates/:debateId/pause', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Pause request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Check if debate is in a pausable state
    if (debate.status !== 'live') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot pause debate with status: ${debate.status}`,
        currentStatus: debate.status,
      });
      return;
    }

    // Update debate status to paused
    await debateRepository.updateStatus(debateId!, { status: 'paused' });

    // Broadcast pause event
    sseManager.broadcastToDebate(debateId!, 'debate_paused', {
      debateId,
      pausedAt: new Date().toISOString(),
      phase: debate.currentPhase,
    });

    logger.info({ debateId }, 'Debate paused');

    res.json({
      status: 'paused',
      debateId,
      pausedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error pausing debate');
    res.status(500).json({
      error: 'Failed to pause debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/resume
 * Resume a paused debate
 */
router.post('/debates/:debateId/resume', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Resume request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Check if debate is paused
    if (debate.status !== 'paused') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot resume debate with status: ${debate.status}`,
        currentStatus: debate.status,
      });
      return;
    }

    // Update debate status back to live
    await debateRepository.updateStatus(debateId!, { status: 'live' });

    // Broadcast resume event
    sseManager.broadcastToDebate(debateId!, 'debate_resumed', {
      debateId,
      resumedAt: new Date().toISOString(),
      phase: debate.currentPhase,
    });

    logger.info({ debateId }, 'Debate resumed');

    res.json({
      status: 'live',
      debateId,
      resumedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error resuming debate');
    res.status(500).json({
      error: 'Failed to resume debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/continue
 * Signal the orchestrator to continue to the next turn (step mode only)
 */
router.post('/debates/:debateId/continue', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Continue request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Verify debate is in step mode
    if (debate.flowMode !== 'step') {
      res.status(400).json({
        error: 'Invalid flow mode',
        message: 'Continue is only available for debates in step mode',
        flowMode: debate.flowMode,
      });
      return;
    }

    // Verify debate is waiting for continue
    if (!debate.isAwaitingContinue) {
      res.status(400).json({
        error: 'Not awaiting continue',
        message: 'Debate is not currently waiting for continue signal',
        isAwaitingContinue: debate.isAwaitingContinue,
      });
      return;
    }

    // Clear the awaiting continue flag
    await debateRepository.setAwaitingContinue(debateId!, false);

    // Broadcast continuing event
    sseManager.broadcastToDebate(debateId!, 'continuing', {
      debateId,
      continuedAt: new Date().toISOString(),
    });

    logger.info({ debateId }, 'Debate continued');

    res.json({
      success: true,
      debateId,
      continuedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error continuing debate');
    res.status(500).json({
      error: 'Failed to continue debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /debates/:debateId/close
 * Manually close a stalled debate (mark as completed or cancelled)
 * Used when a debate is stuck in 'live' state after server restart
 */
router.post('/debates/:debateId/close', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const { status = 'completed', reason } = req.body as {
    status?: 'completed' | 'failed';
    reason?: string;
  };

  logger.info({ debateId, status, reason }, 'Close debate request received');

  try {
    const debate = await debateRepository.findById(debateId!);

    if (!debate) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    // Only allow closing live or paused debates
    if (debate.status !== 'live' && debate.status !== 'paused') {
      res.status(400).json({
        error: 'Invalid debate status',
        message: `Cannot close debate with status: ${debate.status}. Only 'live' or 'paused' debates can be closed.`,
        currentStatus: debate.status,
      });
      return;
    }

    // Update debate status
    const finalStatus = status === 'failed' ? 'failed' : 'completed';
    await debateRepository.updateStatus(debateId!, { status: finalStatus });

    // Broadcast close event
    sseManager.broadcastToDebate(debateId!, 'debate_complete', {
      debateId,
      completedAt: new Date().toISOString(),
      reason: reason || 'Manually closed',
      wasManualClose: true,
    });

    logger.info({ debateId, finalStatus }, 'Debate manually closed');

    res.json({
      success: true,
      debateId,
      status: finalStatus,
      closedAt: new Date().toISOString(),
      reason: reason || 'Manually closed',
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error closing debate');
    res.status(500).json({
      error: 'Failed to close debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /debates/:debateId
 * Delete a debate and all associated data
 */
router.delete('/debates/:debateId', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  try {
    const deleted = await debateRepository.deleteById(debateId!);

    if (!deleted) {
      res.status(404).json({
        error: 'Debate not found',
        debateId,
      });
      return;
    }

    logger.info({ debateId }, 'Debate deleted');

    res.json({
      success: true,
      debateId,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error deleting debate');
    res.status(500).json({
      error: 'Failed to delete debate',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Preset Routes
// ============================================================================

/**
 * GET /presets
 * List all available debate presets (system presets)
 */
router.get('/presets', async (_req: Request, res: Response) => {
  try {
    const presets = await presetRepository.listSystemPresets();

    res.json({
      presets,
      count: presets.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing presets');
    res.status(500).json({
      error: 'Failed to list presets',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /presets/:presetId
 * Get details for a specific preset
 */
router.get('/presets/:presetId', async (req: Request, res: Response) => {
  const { presetId } = req.params;

  try {
    const preset = await presetRepository.findById(presetId!);

    if (!preset) {
      res.status(404).json({
        error: 'Preset not found',
        presetId,
      });
      return;
    }

    res.json(preset);
  } catch (error) {
    logger.error({ presetId, error }, 'Error getting preset');
    res.status(500).json({
      error: 'Failed to get preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
