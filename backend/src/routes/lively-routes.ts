/**
 * Lively Mode API Routes
 *
 * REST endpoints for lively debate mode configuration and management.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as livelyRepo from '../db/repositories/lively-repository.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ module: 'lively-routes' });
const router = Router();

// ===========================================================================
// Validation Schemas
// ===========================================================================

const LivelySettingsSchema = z.object({
  aggressionLevel: z.number().int().min(1).max(5).optional(),
  maxInterruptsPerMinute: z.number().int().min(0).max(10).optional(),
  interruptCooldownMs: z.number().int().min(0).max(60000).optional(),
  minSpeakingTimeMs: z.number().int().min(0).max(30000).optional(),
  relevanceThreshold: z.number().min(0).max(1).optional(),
  contradictionBoost: z.number().min(0).max(1).optional(),
  pacingMode: z.enum(['slow', 'medium', 'fast', 'frantic']).optional(),
  interjectionMaxTokens: z.number().int().min(20).max(200).optional(),
});

// ===========================================================================
// Routes
// ===========================================================================

/**
 * GET /api/debates/:debateId/lively-settings
 * Get lively mode settings for a debate
 */
router.get('/debates/:debateId/lively-settings', async (req, res) => {
  const { debateId } = req.params;

  try {
    const settings = await livelyRepo.findLivelySettingsByDebateId(debateId);

    if (!settings) {
      return res.status(404).json({
        error: 'Lively settings not found',
        message: 'This debate does not have lively mode configured',
      });
    }

    logger.debug({ debateId }, 'Fetched lively settings');

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Failed to fetch lively settings');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch lively settings',
    });
  }
});

/**
 * POST /api/debates/:debateId/lively-settings
 * Create lively mode settings for a debate
 */
router.post('/debates/:debateId/lively-settings', async (req, res) => {
  const { debateId } = req.params;

  try {
    // Validate input
    const parsed = LivelySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.errors,
      });
    }

    // Check if settings already exist
    const existing = await livelyRepo.findLivelySettingsByDebateId(debateId);
    if (existing) {
      return res.status(409).json({
        error: 'Settings already exist',
        message: 'Use PUT to update existing settings',
      });
    }

    // Create settings
    const settings = await livelyRepo.createLivelySettings({
      debateId,
      ...parsed.data,
    });

    logger.info({ debateId }, 'Created lively settings');

    return res.status(201).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Failed to create lively settings');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create lively settings',
    });
  }
});

/**
 * PUT /api/debates/:debateId/lively-settings
 * Update lively mode settings for a debate
 */
router.put('/debates/:debateId/lively-settings', async (req, res) => {
  const { debateId } = req.params;

  try {
    // Validate input
    const parsed = LivelySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.errors,
      });
    }

    // Check if settings exist
    const existing = await livelyRepo.findLivelySettingsByDebateId(debateId);
    if (!existing) {
      // Create if doesn't exist
      const settings = await livelyRepo.createLivelySettings({
        debateId,
        ...parsed.data,
      });

      logger.info({ debateId }, 'Created lively settings (via PUT)');

      return res.status(201).json({
        success: true,
        data: settings,
      });
    }

    // Update existing
    const settings = await livelyRepo.updateLivelySettings(debateId, parsed.data);

    if (!settings) {
      return res.status(500).json({
        error: 'Update failed',
        message: 'Failed to update lively settings',
      });
    }

    logger.info({ debateId }, 'Updated lively settings');

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Failed to update lively settings');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update lively settings',
    });
  }
});

/**
 * DELETE /api/debates/:debateId/lively-settings
 * Delete lively mode settings for a debate
 */
router.delete('/debates/:debateId/lively-settings', async (req, res) => {
  const { debateId } = req.params;

  try {
    const deleted = await livelyRepo.deleteLivelySettings(debateId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lively settings not found for this debate',
      });
    }

    logger.info({ debateId }, 'Deleted lively settings');

    return res.json({
      success: true,
      message: 'Lively settings deleted',
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Failed to delete lively settings');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete lively settings',
    });
  }
});

/**
 * GET /api/debates/:debateId/interruptions
 * Get all interruptions for a debate
 */
router.get('/debates/:debateId/interruptions', async (req, res) => {
  const { debateId } = req.params;
  const { status } = req.query;

  try {
    let interruptions;

    if (status === 'pending') {
      interruptions = await livelyRepo.findPendingInterruptions(debateId);
    } else {
      interruptions = await livelyRepo.findInterruptionsByDebateId(debateId);
    }

    logger.debug({ debateId, count: interruptions.length }, 'Fetched interruptions');

    return res.json({
      success: true,
      data: interruptions,
    });
  } catch (error) {
    logger.error({ debateId, error }, 'Failed to fetch interruptions');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch interruptions',
    });
  }
});

/**
 * GET /api/lively/presets
 * Get available lively mode presets
 */
router.get('/lively/presets', (_req, res) => {
  // Presets tuned for natural debate flow
  // minSpeakingTimeMs ensures speakers can make complete points before interrupts
  const presets = [
    {
      id: 'calm',
      name: 'Calm Discussion',
      description: 'Minimal interruptions, speakers complete their thoughts',
      settings: {
        aggressionLevel: 1,
        maxInterruptsPerMinute: 1,
        pacingMode: 'slow',
        interruptCooldownMs: 45000,
        minSpeakingTimeMs: 30000,
        relevanceThreshold: 0.9,
      },
    },
    {
      id: 'balanced',
      name: 'Balanced Debate',
      description: 'Natural flow with occasional interjections',
      settings: {
        aggressionLevel: 2,
        maxInterruptsPerMinute: 2,
        pacingMode: 'medium',
        interruptCooldownMs: 20000,
        minSpeakingTimeMs: 15000,
        relevanceThreshold: 0.8,
      },
    },
    {
      id: 'heated',
      name: 'Heated Discussion',
      description: 'More frequent interruptions, energetic exchange',
      settings: {
        aggressionLevel: 3,
        maxInterruptsPerMinute: 3,
        pacingMode: 'fast',
        interruptCooldownMs: 15000,
        minSpeakingTimeMs: 10000,
        relevanceThreshold: 0.7,
      },
    },
    {
      id: 'chaotic',
      name: 'Chaotic Panel',
      description: 'Frequent interruptions, rapid-fire debate',
      settings: {
        aggressionLevel: 5,
        maxInterruptsPerMinute: 5,
        pacingMode: 'frantic',
        interruptCooldownMs: 8000,
        minSpeakingTimeMs: 5000,
        relevanceThreshold: 0.6,
      },
    },
  ];

  return res.json({
    success: true,
    data: presets,
  });
});

export default router;
