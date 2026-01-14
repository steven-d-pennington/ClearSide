/**
 * Persona Memory Admin Routes
 *
 * REST API endpoints for managing persona memory:
 * - Core values (CRUD)
 * - Opinions (CRUD + evolution)
 * - Relationships (CRUD)
 * - Configuration
 * - Bulk operations
 */

import express, { type Request, type Response } from 'express';
import { pool } from '../db/index.js';
import { PersonaMemoryRepository } from '../db/repositories/persona-memory-repository.js';
import { PodcastPersonaRepository } from '../db/repositories/podcast-persona-repository.js';
import { createLogger } from '../utils/logger.js';
import type {
  CreateCoreValueInput,
  UpdateCoreValueInput,
  CreateOpinionInput,
  UpdateOpinionInput,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  UpdateMemoryConfigInput,
  CoreValueType,
  OpinionStance,
  RelationshipDynamicType,
} from '../types/persona-memory.js';

const router = express.Router();
const logger = createLogger({ module: 'PersonaMemoryRoutes' });

// Initialize repositories
const memoryRepo = new PersonaMemoryRepository(pool);
const personaRepo = new PodcastPersonaRepository(pool);

// ============================================================================
// Core Values Endpoints
// ============================================================================

/**
 * GET /admin/personas/:personaId/memory/core-values
 * Get all core values for a persona
 */
router.get('/admin/personas/:personaId/memory/core-values', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;

    const coreValues = await memoryRepo.getCoreValues(personaId);

    res.json({
      success: true,
      coreValues,
      count: coreValues.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting core values');
    res.status(500).json({
      success: false,
      error: 'Failed to get core values',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/personas/:personaId/memory/core-values
 * Create a new core value
 */
router.post('/admin/personas/:personaId/memory/core-values', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;
    const { valueType, description, priority } = req.body as {
      valueType: CoreValueType;
      description: string;
      priority?: number;
    };

    // Validate value type
    if (!valueType || !['belief', 'principle', 'red_line', 'passion'].includes(valueType)) {
      res.status(400).json({
        success: false,
        error: 'Invalid value type',
        message: 'valueType must be one of: belief, principle, red_line, passion',
      });
      return;
    }

    if (!description || description.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Description required',
        message: 'description cannot be empty',
      });
      return;
    }

    const input: CreateCoreValueInput = {
      personaId,
      valueType,
      description: description.trim(),
      priority,
    };

    const coreValue = await memoryRepo.createCoreValue(input);

    logger.info({ personaId, coreValueId: coreValue.id }, 'Core value created');

    res.status(201).json({
      success: true,
      coreValue,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error creating core value');

    // Handle unique constraint violation
    if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
      res.status(409).json({
        success: false,
        error: 'Duplicate core value',
        message: 'This persona already has a core value with this description',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create core value',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/personas/:personaId/memory/core-values/:id
 * Update a core value
 */
router.put('/admin/personas/:personaId/memory/core-values/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const input = req.body as UpdateCoreValueInput;

    // Validate value type if provided
    if (input.valueType && !['belief', 'principle', 'red_line', 'passion'].includes(input.valueType)) {
      res.status(400).json({
        success: false,
        error: 'Invalid value type',
        message: 'valueType must be one of: belief, principle, red_line, passion',
      });
      return;
    }

    const coreValue = await memoryRepo.updateCoreValue(id, input);

    if (!coreValue) {
      res.status(404).json({
        success: false,
        error: 'Core value not found',
      });
      return;
    }

    logger.info({ coreValueId: id }, 'Core value updated');

    res.json({
      success: true,
      coreValue,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating core value');
    res.status(500).json({
      success: false,
      error: 'Failed to update core value',
      message: errorMessage,
    });
  }
});

/**
 * DELETE /admin/personas/:personaId/memory/core-values/:id
 * Delete a core value
 */
router.delete('/admin/personas/:personaId/memory/core-values/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const deleted = await memoryRepo.deleteCoreValue(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Core value not found',
      });
      return;
    }

    logger.info({ coreValueId: id }, 'Core value deleted');

    res.json({
      success: true,
      message: 'Core value deleted',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error deleting core value');
    res.status(500).json({
      success: false,
      error: 'Failed to delete core value',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/personas/:personaId/memory/core-values/reorder
 * Reorder core values by priority
 */
router.put('/admin/personas/:personaId/memory/core-values/reorder', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;
    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid input',
        message: 'orderedIds must be a non-empty array',
      });
      return;
    }

    await memoryRepo.reorderCoreValues(personaId, orderedIds);

    logger.info({ personaId, count: orderedIds.length }, 'Core values reordered');

    res.json({
      success: true,
      message: 'Core values reordered',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error reordering core values');
    res.status(500).json({
      success: false,
      error: 'Failed to reorder core values',
      message: errorMessage,
    });
  }
});

// ============================================================================
// Opinions Endpoints
// ============================================================================

/**
 * GET /admin/personas/:personaId/memory/opinions
 * Get all opinions for a persona
 */
router.get('/admin/personas/:personaId/memory/opinions', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;
    const { search } = req.query;

    let opinions;
    if (search && typeof search === 'string') {
      opinions = await memoryRepo.searchOpinions(personaId, search);
    } else {
      opinions = await memoryRepo.getOpinions(personaId);
    }

    res.json({
      success: true,
      opinions,
      count: opinions.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting opinions');
    res.status(500).json({
      success: false,
      error: 'Failed to get opinions',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/personas/:personaId/memory/opinions/:id
 * Get a specific opinion
 */
router.get('/admin/personas/:personaId/memory/opinions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const opinion = await memoryRepo.getOpinionById(id);

    if (!opinion) {
      res.status(404).json({
        success: false,
        error: 'Opinion not found',
      });
      return;
    }

    res.json({
      success: true,
      opinion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting opinion');
    res.status(500).json({
      success: false,
      error: 'Failed to get opinion',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/personas/:personaId/memory/opinions
 * Create a new opinion (admin seeding)
 */
router.post('/admin/personas/:personaId/memory/opinions', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;
    const body = req.body as {
      topicKey: string;
      topicDisplay?: string;
      stance: OpinionStance;
      stanceStrength?: number;
      summary: string;
      keyArguments?: string[];
      canEvolve?: boolean;
    };

    // Validate required fields
    if (!body.topicKey || body.topicKey.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Topic key required',
        message: 'topicKey cannot be empty',
      });
      return;
    }

    if (!body.stance || !['supports', 'opposes', 'neutral', 'mixed', 'evolving'].includes(body.stance)) {
      res.status(400).json({
        success: false,
        error: 'Invalid stance',
        message: 'stance must be one of: supports, opposes, neutral, mixed, evolving',
      });
      return;
    }

    if (!body.summary || body.summary.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Summary required',
        message: 'summary cannot be empty',
      });
      return;
    }

    const input: CreateOpinionInput = {
      personaId,
      topicKey: memoryRepo.normalizeTopicKey(body.topicKey),
      topicDisplay: body.topicDisplay,
      stance: body.stance,
      stanceStrength: body.stanceStrength,
      summary: body.summary.trim(),
      keyArguments: body.keyArguments,
      canEvolve: body.canEvolve,
      adminCurated: true, // Mark as admin-created
    };

    const opinion = await memoryRepo.createOpinion(input);

    logger.info({ personaId, opinionId: opinion.id, topicKey: opinion.topicKey }, 'Opinion created');

    res.status(201).json({
      success: true,
      opinion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error creating opinion');

    // Handle unique constraint violation
    if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
      res.status(409).json({
        success: false,
        error: 'Duplicate opinion',
        message: 'This persona already has an opinion on this topic',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create opinion',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/personas/:personaId/memory/opinions/:id
 * Update an opinion (admin edit)
 */
router.put('/admin/personas/:personaId/memory/opinions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const input = req.body as UpdateOpinionInput;

    // Validate stance if provided
    if (input.stance && !['supports', 'opposes', 'neutral', 'mixed', 'evolving'].includes(input.stance)) {
      res.status(400).json({
        success: false,
        error: 'Invalid stance',
        message: 'stance must be one of: supports, opposes, neutral, mixed, evolving',
      });
      return;
    }

    // Mark as admin-curated when edited
    input.adminCurated = true;

    const opinion = await memoryRepo.updateOpinion(id, input);

    if (!opinion) {
      res.status(404).json({
        success: false,
        error: 'Opinion not found',
      });
      return;
    }

    logger.info({ opinionId: id }, 'Opinion updated');

    res.json({
      success: true,
      opinion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating opinion');
    res.status(500).json({
      success: false,
      error: 'Failed to update opinion',
      message: errorMessage,
    });
  }
});

/**
 * DELETE /admin/personas/:personaId/memory/opinions/:id
 * Delete an opinion
 */
router.delete('/admin/personas/:personaId/memory/opinions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const deleted = await memoryRepo.deleteOpinion(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Opinion not found',
      });
      return;
    }

    logger.info({ opinionId: id }, 'Opinion deleted');

    res.json({
      success: true,
      message: 'Opinion deleted',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error deleting opinion');
    res.status(500).json({
      success: false,
      error: 'Failed to delete opinion',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/personas/:personaId/memory/opinions/:id/lock
 * Lock/unlock an opinion from auto-evolution
 */
router.put('/admin/personas/:personaId/memory/opinions/:id/lock', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { locked } = req.body as { locked: boolean };

    const opinion = await memoryRepo.updateOpinion(id, { canEvolve: !locked });

    if (!opinion) {
      res.status(404).json({
        success: false,
        error: 'Opinion not found',
      });
      return;
    }

    logger.info({ opinionId: id, locked }, `Opinion ${locked ? 'locked' : 'unlocked'}`);

    res.json({
      success: true,
      opinion,
      message: `Opinion ${locked ? 'locked from' : 'unlocked for'} auto-evolution`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating opinion lock status');
    res.status(500).json({
      success: false,
      error: 'Failed to update opinion',
      message: errorMessage,
    });
  }
});

// ============================================================================
// Relationships Endpoints
// ============================================================================

/**
 * GET /admin/personas/:personaId/memory/relationships
 * Get all relationships for a persona
 */
router.get('/admin/personas/:personaId/memory/relationships', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;

    const relationships = await memoryRepo.getRelationships(personaId);

    // Enrich with persona names
    const otherPersonaIds = relationships.map(r => r.otherPersonaId);
    const otherPersonas = await personaRepo.findByIds(otherPersonaIds);
    const personaNameMap = new Map(otherPersonas.map(p => [p.id, p.name]));

    const enrichedRelationships = relationships.map(r => ({
      ...r,
      otherPersonaName: personaNameMap.get(r.otherPersonaId) || 'Unknown',
    }));

    res.json({
      success: true,
      relationships: enrichedRelationships,
      count: relationships.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting relationships');
    res.status(500).json({
      success: false,
      error: 'Failed to get relationships',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/personas/:personaId/memory/relationships
 * Create a new relationship
 */
router.post('/admin/personas/:personaId/memory/relationships', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;
    const body = req.body as {
      otherPersonaId: string;
      rapportScore?: number;
      dynamicType?: RelationshipDynamicType;
      commonGround?: string[];
      frictionPoints?: string[];
      notableExchanges?: string[];
      bidirectional?: boolean;
    };

    if (!body.otherPersonaId) {
      res.status(400).json({
        success: false,
        error: 'Other persona ID required',
        message: 'otherPersonaId cannot be empty',
      });
      return;
    }

    if (personaId === body.otherPersonaId) {
      res.status(400).json({
        success: false,
        error: 'Invalid relationship',
        message: 'A persona cannot have a relationship with itself',
      });
      return;
    }

    // Validate dynamic type if provided
    if (body.dynamicType && !['allies', 'rivals', 'respectful_opponents', 'mentors', 'foils'].includes(body.dynamicType)) {
      res.status(400).json({
        success: false,
        error: 'Invalid dynamic type',
        message: 'dynamicType must be one of: allies, rivals, respectful_opponents, mentors, foils',
      });
      return;
    }

    const input: CreateRelationshipInput = {
      personaId,
      otherPersonaId: body.otherPersonaId,
      rapportScore: body.rapportScore,
      dynamicType: body.dynamicType,
      commonGround: body.commonGround,
      frictionPoints: body.frictionPoints,
      notableExchanges: body.notableExchanges,
    };

    let relationship;
    if (body.bidirectional) {
      const [r1] = await memoryRepo.createBidirectionalRelationship(
        personaId,
        body.otherPersonaId,
        {
          rapportScore: body.rapportScore,
          dynamicType: body.dynamicType,
          commonGround: body.commonGround,
          frictionPoints: body.frictionPoints,
          notableExchanges: body.notableExchanges,
        }
      );
      relationship = r1;
      logger.info({ personaId, otherPersonaId: body.otherPersonaId }, 'Bidirectional relationship created');
    } else {
      relationship = await memoryRepo.createRelationship(input);
      logger.info({ personaId, otherPersonaId: body.otherPersonaId }, 'Relationship created');
    }

    res.status(201).json({
      success: true,
      relationship,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error creating relationship');

    // Handle unique constraint violation
    if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
      res.status(409).json({
        success: false,
        error: 'Duplicate relationship',
        message: 'This relationship already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create relationship',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/personas/:personaId/memory/relationships/:id
 * Update a relationship
 */
router.put('/admin/personas/:personaId/memory/relationships/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const input = req.body as UpdateRelationshipInput;

    // Validate dynamic type if provided
    if (input.dynamicType && !['allies', 'rivals', 'respectful_opponents', 'mentors', 'foils'].includes(input.dynamicType)) {
      res.status(400).json({
        success: false,
        error: 'Invalid dynamic type',
        message: 'dynamicType must be one of: allies, rivals, respectful_opponents, mentors, foils',
      });
      return;
    }

    const relationship = await memoryRepo.updateRelationship(id, input);

    if (!relationship) {
      res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
      return;
    }

    logger.info({ relationshipId: id }, 'Relationship updated');

    res.json({
      success: true,
      relationship,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating relationship');
    res.status(500).json({
      success: false,
      error: 'Failed to update relationship',
      message: errorMessage,
    });
  }
});

/**
 * DELETE /admin/personas/:personaId/memory/relationships/:id
 * Delete a relationship
 */
router.delete('/admin/personas/:personaId/memory/relationships/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const deleted = await memoryRepo.deleteRelationship(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
      return;
    }

    logger.info({ relationshipId: id }, 'Relationship deleted');

    res.json({
      success: true,
      message: 'Relationship deleted',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error deleting relationship');
    res.status(500).json({
      success: false,
      error: 'Failed to delete relationship',
      message: errorMessage,
    });
  }
});

// ============================================================================
// Configuration Endpoints
// ============================================================================

/**
 * GET /admin/memory/config
 * Get memory system configuration
 */
router.get('/admin/memory/config', async (_req: Request, res: Response) => {
  try {
    const config = await memoryRepo.getConfig();

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting memory config');
    res.status(500).json({
      success: false,
      error: 'Failed to get memory config',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/memory/config
 * Update memory system configuration
 */
router.put('/admin/memory/config', async (req: Request, res: Response) => {
  try {
    const input = req.body as UpdateMemoryConfigInput;

    // Validate thresholds
    if (input.evolutionThreshold !== undefined) {
      if (input.evolutionThreshold < 0 || input.evolutionThreshold > 1) {
        res.status(400).json({
          success: false,
          error: 'Invalid threshold',
          message: 'evolutionThreshold must be between 0 and 1',
        });
        return;
      }
    }

    if (input.maxOpinionsInPrompt !== undefined && input.maxOpinionsInPrompt < 1) {
      res.status(400).json({
        success: false,
        error: 'Invalid max opinions',
        message: 'maxOpinionsInPrompt must be at least 1',
      });
      return;
    }

    const config = await memoryRepo.updateConfig(input);

    logger.info({ config }, 'Memory config updated');

    res.json({
      success: true,
      config,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating memory config');
    res.status(500).json({
      success: false,
      error: 'Failed to update memory config',
      message: errorMessage,
    });
  }
});

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * POST /admin/personas/:personaId/memory/seed
 * Bulk seed opinions for a persona
 */
router.post('/admin/personas/:personaId/memory/seed', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;
    const { opinions } = req.body as {
      opinions: Array<{
        topicKey: string;
        topicDisplay?: string;
        stance: OpinionStance;
        stanceStrength?: number;
        summary: string;
        keyArguments?: string[];
      }>;
    };

    if (!Array.isArray(opinions) || opinions.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid input',
        message: 'opinions must be a non-empty array',
      });
      return;
    }

    const results: { topicKey: string; success: boolean; error?: string }[] = [];

    for (const opinion of opinions) {
      try {
        await memoryRepo.createOpinion({
          personaId,
          topicKey: memoryRepo.normalizeTopicKey(opinion.topicKey),
          topicDisplay: opinion.topicDisplay,
          stance: opinion.stance,
          stanceStrength: opinion.stanceStrength,
          summary: opinion.summary,
          keyArguments: opinion.keyArguments,
          adminCurated: true,
        });
        results.push({ topicKey: opinion.topicKey, success: true });
      } catch (err) {
        results.push({
          topicKey: opinion.topicKey,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    logger.info({ personaId, successCount, failedCount }, 'Bulk seed completed');

    res.json({
      success: failedCount === 0,
      message: `Seeded ${successCount} opinions, ${failedCount} failed`,
      results,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error bulk seeding opinions');
    res.status(500).json({
      success: false,
      error: 'Failed to seed opinions',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/personas/:personaId/memory/summary
 * Get a summary of a persona's memory
 */
router.get('/admin/personas/:personaId/memory/summary', async (req: Request, res: Response) => {
  try {
    const personaId = req.params.personaId as string;

    const [coreValues, opinions, relationships] = await Promise.all([
      memoryRepo.getCoreValues(personaId),
      memoryRepo.getOpinions(personaId),
      memoryRepo.getRelationships(personaId),
    ]);

    // Compute stats
    const opinionsByStance: Record<string, number> = {};
    for (const op of opinions) {
      opinionsByStance[op.stance] = (opinionsByStance[op.stance] || 0) + 1;
    }

    const adminCuratedCount = opinions.filter(o => o.adminCurated).length;
    const autoExtractedCount = opinions.filter(o => !o.adminCurated).length;
    const lockedCount = opinions.filter(o => !o.canEvolve).length;

    const averageRapport = relationships.length > 0
      ? relationships.reduce((sum, r) => sum + r.rapportScore, 0) / relationships.length
      : 0;

    res.json({
      success: true,
      summary: {
        coreValues: {
          count: coreValues.length,
          byType: coreValues.reduce((acc, cv) => {
            acc[cv.valueType] = (acc[cv.valueType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
        opinions: {
          count: opinions.length,
          byStance: opinionsByStance,
          adminCurated: adminCuratedCount,
          autoExtracted: autoExtractedCount,
          locked: lockedCount,
        },
        relationships: {
          count: relationships.length,
          averageRapport: Math.round(averageRapport * 100) / 100,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting memory summary');
    res.status(500).json({
      success: false,
      error: 'Failed to get memory summary',
      message: errorMessage,
    });
  }
});

export default router;
