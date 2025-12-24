/**
 * User Intervention Routes
 * Express routes for managing user interventions during debates
 */

import express, { type Request, type Response } from 'express';
import { interventionQueue } from '../services/intervention/index.js';
import { sseManager } from '../services/sse/index.js';
import * as interventionRepo from '../db/repositories/intervention-repository.js';
import { createLogger } from '../utils/logger.js';
import type { InterventionType, Speaker } from '../types/database.js';

const router = express.Router();
const logger = createLogger({ module: 'InterventionRoutes' });

/**
 * POST /debates/:debateId/interventions
 * Submit a new intervention during a debate
 */
router.post('/debates/:debateId/interventions', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const { type, content, directedTo, timestampMs } = req.body;

  logger.info(
    { debateId, type, directedTo, contentLength: content?.length },
    'Intervention submission received'
  );

  try {
    // Validate required fields
    if (!type || !content) {
      res.status(400).json({
        error: 'Invalid input',
        message: 'type and content are required',
      });
      return;
    }

    // Validate intervention type
    const validTypes: InterventionType[] = [
      'question',
      'challenge',
      'evidence_injection',
      'pause_request',
      'clarification_request',
    ];

    if (!validTypes.includes(type as InterventionType)) {
      res.status(400).json({
        error: 'Invalid intervention type',
        message: `type must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    // Validate directedTo if provided
    if (directedTo) {
      const validSpeakers: Speaker[] = ['moderator', 'pro_advocate', 'con_advocate', 'user'];
      if (!validSpeakers.includes(directedTo as Speaker)) {
        res.status(400).json({
          error: 'Invalid speaker',
          message: `directedTo must be one of: ${validSpeakers.join(', ')}`,
        });
        return;
      }
    }

    // Add intervention to queue
    const interventionId = await interventionQueue.addIntervention({
      debateId: debateId!,
      timestampMs: timestampMs || Date.now(),
      interventionType: type as InterventionType,
      content: content as string,
      directedTo: (directedTo as Speaker) || null,
    });

    // Broadcast intervention event via SSE
    sseManager.broadcastToDebate(debateId!, 'intervention_submitted', {
      interventionId,
      type,
      directedTo: directedTo || null,
      timestampMs: timestampMs || Date.now(),
    });

    logger.info({ debateId, interventionId }, 'Intervention queued successfully');

    res.status(201).json({
      interventionId,
      status: 'queued',
      message: 'Intervention queued for processing',
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error submitting intervention');
    res.status(500).json({
      error: 'Failed to submit intervention',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /interventions/:interventionId
 * Get status and details of a specific intervention
 */
router.get('/interventions/:interventionId', async (req: Request, res: Response) => {
  const { interventionId } = req.params;
  const id = parseInt(interventionId!, 10);

  if (isNaN(id)) {
    res.status(400).json({
      error: 'Invalid intervention ID',
      message: 'interventionId must be a number',
    });
    return;
  }

  logger.debug({ interventionId: id }, 'Fetching intervention');

  try {
    // Try to get from queue first (includes status)
    const queued = interventionQueue.getIntervention(id);

    if (queued) {
      res.json({
        id: queued.intervention.id,
        debateId: queued.intervention.debateId,
        timestampMs: queued.intervention.timestampMs,
        interventionType: queued.intervention.interventionType,
        content: queued.intervention.content,
        directedTo: queued.intervention.directedTo,
        response: queued.intervention.response,
        responseTimestampMs: queued.intervention.responseTimestampMs,
        status: queued.status,
        error: queued.error,
        createdAt: queued.intervention.createdAt,
      });
      return;
    }

    // If not in queue, try database
    const intervention = await interventionRepo.findById(id);

    if (!intervention) {
      res.status(404).json({
        error: 'Intervention not found',
        interventionId: id,
      });
      return;
    }

    // Determine status based on response
    const status = intervention.response ? 'completed' : 'queued';

    res.json({
      id: intervention.id,
      debateId: intervention.debateId,
      timestampMs: intervention.timestampMs,
      interventionType: intervention.interventionType,
      content: intervention.content,
      directedTo: intervention.directedTo,
      response: intervention.response,
      responseTimestampMs: intervention.responseTimestampMs,
      status,
      createdAt: intervention.createdAt,
    });
  } catch (error) {
    logger.error({ interventionId: id, error }, 'Error fetching intervention');
    res.status(500).json({
      error: 'Failed to fetch intervention',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId/interventions
 * Get all interventions for a debate
 */
router.get('/debates/:debateId/interventions', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const { type, directedTo, status } = req.query;

  logger.debug({ debateId, type, directedTo, status }, 'Fetching debate interventions');

  try {
    // Get from queue (includes runtime status)
    let interventions = interventionQueue.getAllInterventions(debateId!);

    // If queue is empty, load from database
    if (interventions.length === 0) {
      await interventionQueue.loadFromDatabase(debateId!);
      interventions = interventionQueue.getAllInterventions(debateId!);
    }

    // Apply filters
    if (type) {
      interventions = interventions.filter(
        (i) => i.intervention.interventionType === type
      );
    }

    if (directedTo) {
      interventions = interventions.filter(
        (i) => i.intervention.directedTo === directedTo
      );
    }

    if (status) {
      interventions = interventions.filter((i) => i.status === status);
    }

    // Format response
    const formatted = interventions.map((i) => ({
      id: i.intervention.id,
      debateId: i.intervention.debateId,
      timestampMs: i.intervention.timestampMs,
      interventionType: i.intervention.interventionType,
      content: i.intervention.content,
      directedTo: i.intervention.directedTo,
      response: i.intervention.response,
      responseTimestampMs: i.intervention.responseTimestampMs,
      status: i.status,
      error: i.error,
      createdAt: i.intervention.createdAt,
    }));

    res.json({
      debateId,
      interventions: formatted,
      count: formatted.length,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error fetching interventions');
    res.status(500).json({
      error: 'Failed to fetch interventions',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /debates/:debateId/interventions/unanswered
 * Get count of unanswered interventions
 */
router.get('/debates/:debateId/interventions/unanswered', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.debug({ debateId }, 'Fetching unanswered intervention count');

  try {
    const count = await interventionQueue.getUnansweredCount(debateId!);

    res.json({
      debateId,
      unansweredCount: count,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Error counting unanswered interventions');
    res.status(500).json({
      error: 'Failed to count unanswered interventions',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
