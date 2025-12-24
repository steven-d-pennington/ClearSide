/**
 * Debate Routes
 * Express routes for debate management and SSE streaming
 */

import express, { type Request, type Response } from 'express';
import { sseManager } from '../services/sse/index.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import { createLogger } from '../utils/logger.js';
import type { CreateDebateInput } from '../types/database.js';

const router = express.Router();
const logger = createLogger({ module: 'DebateRoutes' });

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
 * Create a new debate
 */
router.post('/debates', async (req: Request, res: Response) => {
  try {
    const input: CreateDebateInput = {
      propositionText: req.body.propositionText,
      propositionContext: req.body.propositionContext,
    };

    // Validate input
    if (!input.propositionText || typeof input.propositionText !== 'string') {
      res.status(400).json({
        error: 'Invalid input',
        message: 'propositionText is required and must be a string',
      });
      return;
    }

    // Create debate
    const debate = await debateRepository.create(input);

    logger.info({ debateId: debate.id, propositionText: debate.propositionText }, 'Debate created');

    res.status(201).json(debate);
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

export default router;
