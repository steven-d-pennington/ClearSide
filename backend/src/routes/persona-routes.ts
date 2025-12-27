/**
 * Persona Routes
 *
 * API endpoints for retrieving and managing debate personas.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as personaRepo from '../db/repositories/persona-repository.js';
import pino from 'pino';

const logger = pino({
  name: 'persona-routes',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();

/**
 * GET /api/personas
 *
 * List all available personas for debate configuration.
 * Returns summaries for selection UI.
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching persona list');

    const personas = await personaRepo.listPersonaSummaries();

    logger.info({ count: personas.length }, 'Personas retrieved');

    res.json({
      success: true,
      data: personas,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to fetch personas');
    next(error);
  }
});

/**
 * GET /api/personas/all
 *
 * List all personas with full details.
 * Used for admin/debugging.
 */
router.get('/all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching all personas with full details');

    const personas = await personaRepo.listAll();

    logger.info({ count: personas.length }, 'All personas retrieved');

    res.json({
      success: true,
      data: personas,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to fetch all personas');
    next(error);
  }
});

/**
 * GET /api/personas/system
 *
 * List system-defined personas with full details.
 */
router.get('/system', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Fetching system personas');

    const personas = await personaRepo.listSystemPersonas();

    logger.info({ count: personas.length }, 'System personas retrieved');

    res.json({
      success: true,
      data: personas,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to fetch system personas');
    next(error);
  }
});

/**
 * GET /api/personas/:id
 *
 * Get a specific persona by ID.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    logger.info({ personaId: id }, 'Fetching persona by ID');

    const persona = await personaRepo.findById(id);

    if (!persona) {
      logger.warn({ personaId: id }, 'Persona not found');
      return res.status(404).json({
        success: false,
        error: 'Persona not found',
      });
    }

    logger.info({ personaId: id }, 'Persona retrieved');

    res.json({
      success: true,
      data: persona,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      personaId: req.params.id,
    }, 'Failed to fetch persona');
    next(error);
  }
});

/**
 * GET /api/personas/archetype/:archetype
 *
 * Get personas by archetype.
 */
router.get('/archetype/:archetype', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { archetype } = req.params;
    logger.info({ archetype }, 'Fetching personas by archetype');

    // Validate archetype
    const validArchetypes = ['academic', 'pragmatic', 'empirical', 'legal', 'economic', 'moral'];
    if (!validArchetypes.includes(archetype)) {
      return res.status(400).json({
        success: false,
        error: `Invalid archetype: ${archetype}. Valid options: ${validArchetypes.join(', ')}`,
      });
    }

    const personas = await personaRepo.findByArchetype(archetype as any);

    logger.info({ archetype, count: personas.length }, 'Personas by archetype retrieved');

    res.json({
      success: true,
      data: personas,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      archetype: req.params.archetype,
    }, 'Failed to fetch personas by archetype');
    next(error);
  }
});

export default router;
