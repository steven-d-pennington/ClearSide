/**
 * Admin Routes
 * Express routes for admin dashboard, debate management, and system monitoring
 */

import express, { type Request, type Response } from 'express';
import axios from 'axios';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { Pinecone } from '@pinecone-database/pinecone';
import { sseManager } from '../services/sse/index.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import * as exportJobRepository from '../db/repositories/export-job-repository.js';
import * as eventRepository from '../db/repositories/event-repository.js';
import * as presetRepository from '../db/repositories/preset-repository.js';
import * as personaRepository from '../db/repositories/persona-repository.js';
import * as settingsRepository from '../db/repositories/settings-repository.js';
import { orchestratorRegistry } from '../services/debate/index.js';
import { GoogleAuth } from 'google-auth-library';
import {
  parseServiceAccountJson,
} from '../services/audio/google-cloud-long-audio-service.js';
import { createRSSFeedService } from '../services/podcast/rss-feed-service.js';
import { publishQueue } from '../services/queue/queue-manager.js';
import { createLogger } from '../utils/logger.js';
import { getRateLimiter } from '../services/llm/rate-limiter.js';
import { getReactionLibrary } from '../services/audio/reaction-library.js';
import type { DebateStatus, SystemEventType, EventSeverity } from '../types/database.js';

const router = express.Router();
const logger = createLogger({ module: 'AdminRoutes' });
const exec = promisify(execCallback);

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * GET /admin/stats
 * Get dashboard statistics
 */
router.get('/admin/stats', async (_req: Request, res: Response) => {
  try {
    // Get debate counts by status
    const debates = await debateRepository.list({ limit: 1000 });
    const debateCounts = {
      total: debates.length,
      live: debates.filter(d => d.status === 'live').length,
      paused: debates.filter(d => d.status === 'paused').length,
      completed: debates.filter(d => d.status === 'completed').length,
      failed: debates.filter(d => d.status === 'failed').length,
      initializing: debates.filter(d => d.status === 'initializing').length,
    };

    // Get export job counts
    const exportCounts = await exportJobRepository.countByStatus();

    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const system = {
      activeConnections: sseManager.getClientCount(),
      activeOrchestrators: orchestratorRegistry.getCount(),
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      memoryUsage: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
    };

    // Get recent debates
    const recentDebates = await debateRepository.list({ limit: 10 });
    const recentDebatesFormatted = recentDebates.map(d => ({
      id: d.id,
      proposition: d.propositionText.substring(0, 100) + (d.propositionText.length > 100 ? '...' : ''),
      status: d.status,
      currentPhase: d.currentPhase,
      createdAt: d.createdAt,
      startedAt: d.startedAt,
      completedAt: d.completedAt,
    }));

    res.json({
      debates: debateCounts,
      exports: exportCounts,
      system,
      recentDebates: recentDebatesFormatted,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ errorMessage, errorStack }, 'Error getting admin stats');
    res.status(500).json({
      error: 'Failed to get admin stats',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/debates/stop-all
 * Stop all currently live debates
 */
router.post('/admin/debates/stop-all', async (req: Request, res: Response) => {
  const { reason } = req.body as { reason?: string };
  const stopReason = reason || 'Admin stopped all debates';

  logger.info({ reason: stopReason }, 'Stop all debates request received');

  try {
    // Get all live debates
    const liveDebates = await debateRepository.list({ status: 'live' as DebateStatus });
    const pausedDebates = await debateRepository.list({ status: 'paused' as DebateStatus });
    const allActiveDebates = [...liveDebates, ...pausedDebates];

    if (allActiveDebates.length === 0) {
      res.json({
        success: true,
        message: 'No active debates to stop',
        stoppedCount: 0,
      });
      return;
    }

    const results: { debateId: string; success: boolean; error?: string }[] = [];

    for (const debate of allActiveDebates) {
      try {
        // Try to stop the orchestrator if running
        const orchestrator = orchestratorRegistry.get(debate.id);
        if (orchestrator) {
          await orchestrator.stop(stopReason);
        } else {
          // No orchestrator - update status directly
          await debateRepository.updateStatus(debate.id, { status: 'completed' });
          sseManager.broadcastToDebate(debate.id, 'debate_stopped', {
            debateId: debate.id,
            stoppedAt: new Date().toISOString(),
            reason: stopReason,
          });
        }
        results.push({ debateId: debate.id, success: true });
      } catch (err) {
        logger.error({ debateId: debate.id, error: err }, 'Error stopping debate');
        results.push({
          debateId: debate.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    logger.info({ successCount, failedCount }, 'Stop all debates completed');

    res.json({
      success: failedCount === 0,
      stoppedCount: successCount,
      failedCount,
      results,
    });
  } catch (error) {
    logger.error({ error }, 'Error stopping all debates');
    res.status(500).json({
      error: 'Failed to stop all debates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /admin/debates/cleanup
 * Delete old completed/failed debates
 */
router.delete('/admin/debates/cleanup', async (req: Request, res: Response) => {
  const maxAgeDays = parseInt(req.query.maxAgeDays as string) || 7;
  const dryRun = req.query.dryRun === 'true';

  logger.info({ maxAgeDays, dryRun }, 'Cleanup debates request received');

  try {
    // Get all completed and failed debates
    const completedDebates = await debateRepository.list({ status: 'completed' as DebateStatus, limit: 1000 });
    const failedDebates = await debateRepository.list({ status: 'failed' as DebateStatus, limit: 1000 });
    const allDebates = [...completedDebates, ...failedDebates];

    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const debatesToDelete = allDebates.filter(d => d.createdAt < cutoffDate);

    if (dryRun) {
      res.json({
        dryRun: true,
        wouldDelete: debatesToDelete.length,
        debates: debatesToDelete.map(d => ({
          id: d.id,
          proposition: d.propositionText.substring(0, 50),
          status: d.status,
          createdAt: d.createdAt,
        })),
      });
      return;
    }

    let deletedCount = 0;
    const errors: { debateId: string; error: string }[] = [];

    for (const debate of debatesToDelete) {
      try {
        await debateRepository.deleteById(debate.id);
        deletedCount++;
      } catch (err) {
        errors.push({
          debateId: debate.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info({ deletedCount, errorCount: errors.length }, 'Cleanup debates completed');

    res.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error({ error }, 'Error cleaning up debates');
    res.status(500).json({
      error: 'Failed to cleanup debates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /admin/export-jobs
 * List export jobs with filtering
 */
router.get('/admin/export-jobs', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const jobType = req.query.jobType as string | undefined;
    const debateId = req.query.debateId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const jobs = await exportJobRepository.list({
      status: status as any,
      jobType: jobType as any,
      debateId,
      limit,
      offset,
      orderBy: 'created_at',
      orderDir: 'desc',
    });

    const counts = await exportJobRepository.countByStatus();

    res.json({
      jobs,
      count: jobs.length,
      total: counts.total,
      limit,
      offset,
      counts,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing export jobs');
    res.status(500).json({
      error: 'Failed to list export jobs',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /admin/export-jobs/cleanup
 * Delete old completed export jobs
 */
router.delete('/admin/export-jobs/cleanup', async (req: Request, res: Response) => {
  const maxAgeHours = parseInt(req.query.maxAgeHours as string) || 24;

  logger.info({ maxAgeHours }, 'Cleanup export jobs request received');

  try {
    const deletedCount = await exportJobRepository.deleteOldCompleted(maxAgeHours);

    logger.info({ deletedCount }, 'Cleanup export jobs completed');

    res.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    logger.error({ error }, 'Error cleaning up export jobs');
    res.status(500).json({
      error: 'Failed to cleanup export jobs',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /admin/debates
 * List all debates with filtering for admin view
 */
router.get('/admin/debates', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as DebateStatus | undefined;
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let debates = await debateRepository.list({
      status,
      limit: limit + 100, // Fetch extra for search filtering
      offset: 0,
    });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      debates = debates.filter(d =>
        d.propositionText.toLowerCase().includes(searchLower) ||
        d.id.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination after search
    const total = debates.length;
    debates = debates.slice(offset, offset + limit);

    // Add live viewer counts
    const debatesWithViewers = debates.map(d => ({
      ...d,
      liveViewers: sseManager.getClientCount(d.id),
      hasActiveOrchestrator: orchestratorRegistry.has(d.id),
    }));

    res.json({
      debates: debatesWithViewers,
      count: debates.length,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing admin debates');
    res.status(500).json({
      error: 'Failed to list debates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /admin/debates/bulk
 * Delete multiple debates at once
 */
router.delete('/admin/debates/bulk', async (req: Request, res: Response) => {
  const { debateIds } = req.body as { debateIds: string[] };

  if (!Array.isArray(debateIds) || debateIds.length === 0) {
    res.status(400).json({
      error: 'Invalid input',
      message: 'debateIds must be a non-empty array of strings',
    });
    return;
  }

  logger.info({ count: debateIds.length }, 'Bulk delete debates request received');

  try {
    let deletedCount = 0;
    const errors: { debateId: string; error: string }[] = [];

    for (const debateId of debateIds) {
      try {
        // Stop orchestrator if running
        const orchestrator = orchestratorRegistry.get(debateId);
        if (orchestrator) {
          await orchestrator.stop('Debate deleted by admin');
        }

        const deleted = await debateRepository.deleteById(debateId);
        if (deleted) {
          deletedCount++;
        } else {
          errors.push({ debateId, error: 'Debate not found' });
        }
      } catch (err) {
        errors.push({
          debateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info({ deletedCount, errorCount: errors.length }, 'Bulk delete completed');

    res.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error({ error }, 'Error bulk deleting debates');
    res.status(500).json({
      error: 'Failed to bulk delete debates',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /admin/system
 * Get detailed system monitoring stats
 */
router.get('/admin/system', async (_req: Request, res: Response) => {
  try {
    // Get memory usage
    const memoryUsage = process.memoryUsage();

    // Get rate limiter stats
    const rateLimiter = getRateLimiter();
    const rateLimitStats = rateLimiter.getStats();

    // Get uptime
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

    // Get SSE connection stats
    const connectionStats = {
      total: sseManager.getClientCount(),
      // Get per-debate viewer counts
      byDebate: {} as Record<string, number>,
    };

    // Get active orchestrator info
    const activeOrchestrators = orchestratorRegistry.getRunningDebateIds();

    // Get debate counts for quick reference
    const debates = await debateRepository.list({ limit: 1000 });
    const debateStats = {
      total: debates.length,
      live: debates.filter(d => d.status === 'live').length,
      paused: debates.filter(d => d.status === 'paused').length,
      completed: debates.filter(d => d.status === 'completed').length,
      failed: debates.filter(d => d.status === 'failed').length,
    };

    // Get export job counts
    const exportCounts = await exportJobRepository.countByStatus();

    res.json({
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptime,
        formatted: formatUptime(uptime),
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        heapUsedPercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
      },
      connections: connectionStats,
      orchestrators: {
        active: activeOrchestrators.length,
        debateIds: activeOrchestrators,
      },
      rateLimiter: rateLimitStats,
      debates: debateStats,
      exports: exportCounts,
      node: {
        version: process.version,
        platform: process.platform,
        pid: process.pid,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting system stats');
    res.status(500).json({
      error: 'Failed to get system stats',
      message: errorMessage,
    });
  }
});

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

// =============================================================================
// System Events Endpoints
// =============================================================================

/**
 * GET /admin/events
 * List system events with filtering
 */
router.get('/admin/events', async (req: Request, res: Response) => {
  try {
    const debateId = req.query.debateId as string | undefined;
    const eventType = req.query.eventType as SystemEventType | undefined;
    const severity = req.query.severity as EventSeverity | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Parse multiple event types or severities if provided as comma-separated
    const eventTypes = req.query.eventTypes
      ? (req.query.eventTypes as string).split(',') as SystemEventType[]
      : undefined;
    const severities = req.query.severities
      ? (req.query.severities as string).split(',') as EventSeverity[]
      : undefined;

    const events = await eventRepository.findWithFilters({
      debateId,
      eventType: eventTypes || eventType,
      severity: severities || severity,
      limit,
      offset,
    });

    res.json({
      events,
      count: events.length,
      limit,
      offset,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error listing events');
    res.status(500).json({
      error: 'Failed to list events',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/events/debate/:debateId
 * Get events for a specific debate
 */
router.get('/admin/events/debate/:debateId', async (req: Request, res: Response) => {
  try {
    const debateId = req.params.debateId as string;
    const limit = parseInt(req.query.limit as string) || 100;

    const events = await eventRepository.findByDebateId(debateId, limit);

    res.json({
      debateId,
      events,
      count: events.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error listing debate events');
    res.status(500).json({
      error: 'Failed to list debate events',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/events/debate/:debateId/stats
 * Get event statistics for a specific debate
 */
router.get('/admin/events/debate/:debateId/stats', async (req: Request, res: Response) => {
  try {
    const debateId = req.params.debateId as string;
    const stats = await eventRepository.getDebateStats(debateId);

    res.json({
      debateId,
      ...stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting debate event stats');
    res.status(500).json({
      error: 'Failed to get debate event stats',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/events/issues
 * Get recent warnings and errors
 */
router.get('/admin/events/issues', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = await eventRepository.findIssues(limit);

    res.json({
      events,
      count: events.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error listing issue events');
    res.status(500).json({
      error: 'Failed to list issue events',
      message: errorMessage,
    });
  }
});

/**
 * DELETE /admin/events/cleanup
 * Delete old events (default: older than 7 days)
 */
router.delete('/admin/events/cleanup', async (req: Request, res: Response) => {
  const daysToKeep = parseInt(req.query.days as string) || 7;

  logger.info({ daysToKeep }, 'Cleanup events request received');

  try {
    const deletedCount = await eventRepository.deleteOlderThan(daysToKeep);

    logger.info({ deletedCount, daysToKeep }, 'Event cleanup completed');

    res.json({
      success: true,
      deletedCount,
      daysToKeep,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error cleaning up events');
    res.status(500).json({
      error: 'Failed to cleanup events',
      message: errorMessage,
    });
  }
});

// =============================================================================
// Presets Endpoints
// =============================================================================

/**
 * GET /admin/presets
 * List all debate presets (system and user-created)
 */
router.get('/admin/presets', async (_req: Request, res: Response) => {
  try {
    const presets = await presetRepository.listAll();
    res.json({
      success: true,
      presets,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error listing presets');
    res.status(500).json({
      success: false,
      error: 'Failed to list presets',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/presets/system
 * List only system presets
 */
router.get('/admin/presets/system', async (_req: Request, res: Response) => {
  try {
    const presets = await presetRepository.listSystemPresets();
    res.json({
      success: true,
      presets,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error listing system presets');
    res.status(500).json({
      success: false,
      error: 'Failed to list system presets',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/presets/:id
 * Get a specific preset by ID
 */
router.get('/admin/presets/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const preset = await presetRepository.findById(id);

    if (!preset) {
      res.status(404).json({
        success: false,
        error: 'Preset not found',
      });
      return;
    }

    res.json({
      success: true,
      preset,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting preset');
    res.status(500).json({
      success: false,
      error: 'Failed to get preset',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/presets/:id
 * Update a preset
 */
router.put('/admin/presets/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const updateData = req.body as presetRepository.UpdatePresetInput;

    logger.info({ presetId: id, updateData }, 'Updating preset');

    const preset = await presetRepository.update(id, updateData);

    if (!preset) {
      res.status(404).json({
        success: false,
        error: 'Preset not found',
      });
      return;
    }

    res.json({
      success: true,
      preset,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating preset');
    res.status(500).json({
      success: false,
      error: 'Failed to update preset',
      message: errorMessage,
    });
  }
});

// =============================================================================
// Personas Endpoints
// =============================================================================

/**
 * GET /admin/personas
 * List all personas
 */
router.get('/admin/personas', async (_req: Request, res: Response) => {
  try {
    const personas = await personaRepository.listAll();
    res.json({
      success: true,
      personas,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error listing personas');
    res.status(500).json({
      success: false,
      error: 'Failed to list personas',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/personas/:id
 * Get a specific persona by ID
 */
router.get('/admin/personas/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const persona = await personaRepository.findById(id);

    if (!persona) {
      res.status(404).json({
        success: false,
        error: 'Persona not found',
      });
      return;
    }

    res.json({
      success: true,
      persona,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting persona');
    res.status(500).json({
      success: false,
      error: 'Failed to get persona',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/personas/:id
 * Update a persona
 */
router.put('/admin/personas/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const updateData = req.body as personaRepository.UpdatePersonaInput;

    logger.info({ personaId: id, updateData }, 'Updating persona');

    const persona = await personaRepository.update(id, updateData);

    if (!persona) {
      res.status(404).json({
        success: false,
        error: 'Persona not found',
      });
      return;
    }

    res.json({
      success: true,
      persona,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating persona');
    res.status(500).json({
      success: false,
      error: 'Failed to update persona',
      message: errorMessage,
    });
  }
});

// =============================================================================
// Settings Endpoints
// =============================================================================

/**
 * GET /admin/settings/models
 * Get default model settings
 */
router.get('/admin/settings/models', async (_req: Request, res: Response) => {
  try {
    const defaults = await settingsRepository.getDefaultModels();
    res.json({
      success: true,
      defaults,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error getting model defaults');
    res.status(500).json({
      success: false,
      error: 'Failed to get model defaults',
      message: errorMessage,
    });
  }
});

/**
 * PUT /admin/settings/models
 * Update default model settings
 */
router.put('/admin/settings/models', async (req: Request, res: Response) => {
  try {
    const defaults = req.body as settingsRepository.ModelDefaults;

    logger.info({ defaults }, 'Updating model defaults');

    await settingsRepository.setDefaultModels(defaults);

    res.json({
      success: true,
      defaults,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Error updating model defaults');
    res.status(500).json({
      success: false,
      error: 'Failed to update model defaults',
      message: errorMessage,
    });
  }
});

// =============================================================================
// External Service Testing
// =============================================================================

type ExternalServiceId =
  | 'elevenlabs'
  | 'gemini-tts'
  | 'google-cloud-tts'
  | 'google-cloud-long'
  | 'azure-tts'
  | 'edge-tts'
  | 'openrouter'
  | 'openai'
  | 'pinecone'
  | 'listen-notes';

interface ExternalServiceInfo {
  id: ExternalServiceId;
  name: string;
  category: 'tts' | 'llm' | 'research' | 'vector';
  description: string;
  configured: boolean;
  keyPreview?: string | null;
  metadata?: Record<string, string | null>;
  warning?: string | null;
}

interface ExternalServiceTestRequest {
  apiKey?: string;
  serviceAccountJson?: string;
  bucket?: string;
  location?: string;
  projectId?: string;
  region?: string;
  indexName?: string;
  namespace?: string;
}

interface ExternalServiceTestResult {
  name: string;
  success: boolean;
  message: string;
}

function maskKey(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) {
    return `${value.slice(0, 2)}…${value.slice(-2)}`;
  }
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function safeParseServiceAccount(input?: string): { credentials: ReturnType<typeof parseServiceAccountJson> | null; error?: string } {
  if (!input) return { credentials: null };
  try {
    return { credentials: parseServiceAccountJson(input) };
  } catch (error) {
    return {
      credentials: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

router.get('/admin/testing/services', (_req: Request, res: Response) => {
  const serviceAccountInput = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;
  const { credentials, error } = safeParseServiceAccount(serviceAccountInput);

  const services: ExternalServiceInfo[] = [
    {
      id: 'elevenlabs',
      name: 'ElevenLabs TTS',
      category: 'tts',
      description: 'Premium multi-voice TTS (API key auth).',
      configured: !!process.env.ELEVENLABS_API_KEY,
      keyPreview: maskKey(process.env.ELEVENLABS_API_KEY),
    },
    {
      id: 'gemini-tts',
      name: 'Google Gemini TTS',
      category: 'tts',
      description: 'Gemini 2.5 TTS via AI Studio API key.',
      configured: !!process.env.GOOGLE_AI_API_KEY,
      keyPreview: maskKey(process.env.GOOGLE_AI_API_KEY),
    },
    {
      id: 'google-cloud-tts',
      name: 'Google Cloud TTS',
      category: 'tts',
      description: 'Google Cloud Text-to-Speech API (API key).',
      configured: !!process.env.GOOGLE_CLOUD_API_KEY,
      keyPreview: maskKey(process.env.GOOGLE_CLOUD_API_KEY),
    },
    {
      id: 'google-cloud-long',
      name: 'Google Cloud Long Audio',
      category: 'tts',
      description: 'Long audio synthesis (service account + GCS bucket).',
      configured: !!process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON && !!process.env.GOOGLE_CLOUD_TTS_BUCKET,
      keyPreview: maskKey(credentials?.private_key_id || credentials?.client_email),
      metadata: {
        bucket: process.env.GOOGLE_CLOUD_TTS_BUCKET || null,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || credentials?.project_id || null,
        location: process.env.GOOGLE_CLOUD_TTS_LOCATION || 'us-central1',
        clientEmail: credentials?.client_email ? maskKey(credentials.client_email) : null,
      },
      warning: error || null,
    },
    {
      id: 'azure-tts',
      name: 'Azure TTS',
      category: 'tts',
      description: 'Azure Speech Services TTS.',
      configured: !!process.env.AZURE_SPEECH_KEY,
      keyPreview: maskKey(process.env.AZURE_SPEECH_KEY),
      metadata: {
        region: process.env.AZURE_SPEECH_REGION || 'eastus',
      },
    },
    {
      id: 'edge-tts',
      name: 'Edge TTS (Free)',
      category: 'tts',
      description: 'Edge neural voices (Python edge-tts required).',
      configured: true,
      keyPreview: null,
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      category: 'llm',
      description: 'LLM routing for debates and embeddings.',
      configured: !!process.env.OPENROUTER_API_KEY,
      keyPreview: maskKey(process.env.OPENROUTER_API_KEY),
    },
    {
      id: 'openai',
      name: 'OpenAI',
      category: 'llm',
      description: 'OpenAI embeddings/models.',
      configured: !!process.env.OPENAI_API_KEY,
      keyPreview: maskKey(process.env.OPENAI_API_KEY),
    },
    {
      id: 'pinecone',
      name: 'Pinecone',
      category: 'vector',
      description: 'Vector database for research retrieval.',
      configured: !!process.env.PINECONE_API_KEY && !!process.env.PINECONE_INDEX_NAME,
      keyPreview: maskKey(process.env.PINECONE_API_KEY),
      metadata: {
        indexName: process.env.PINECONE_INDEX_NAME || null,
        namespace: process.env.PINECONE_NAMESPACE || 'duelogic-research',
      },
    },
    {
      id: 'listen-notes',
      name: 'Listen Notes',
      category: 'research',
      description: 'Podcast discovery for Duelogic research.',
      configured: !!process.env.LISTEN_NOTES_API_KEY,
      keyPreview: maskKey(process.env.LISTEN_NOTES_API_KEY),
    },
  ];

  res.json({ services });
});

router.post('/admin/testing/services/:serviceId/test', async (req: Request, res: Response) => {
  const serviceId = req.params.serviceId as ExternalServiceId;
  const payload = req.body as ExternalServiceTestRequest;
  const startTime = Date.now();

  const finish = (
    success: boolean,
    message: string,
    details?: Record<string, unknown>,
    checks?: ExternalServiceTestResult[]
  ) => {
    res.json({
      success,
      message,
      durationMs: Date.now() - startTime,
      details,
      checks,
    });
  };

  try {
    switch (serviceId) {
      case 'elevenlabs': {
        const apiKey = payload.apiKey || process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'ElevenLabs API key is required.' });
          return;
        }

        const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': apiKey },
          timeout: 15000,
        });

        finish(true, 'ElevenLabs API reachable.', {
          voiceCount: response.data?.voices?.length || 0,
        });
        return;
      }
      case 'gemini-tts': {
        const apiKey = payload.apiKey || process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'Gemini API key is required.' });
          return;
        }

        const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
          params: { key: apiKey, pageSize: 5 },
          timeout: 15000,
        });

        finish(true, 'Gemini API reachable.', {
          modelCount: response.data?.models?.length || 0,
        });
        return;
      }
      case 'google-cloud-tts': {
        const apiKey = payload.apiKey || process.env.GOOGLE_CLOUD_API_KEY;
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'Google Cloud TTS API key is required.' });
          return;
        }

        const response = await axios.get('https://texttospeech.googleapis.com/v1/voices', {
          params: { key: apiKey, languageCode: 'en-US' },
          timeout: 15000,
        });

        finish(true, 'Google Cloud TTS API reachable.', {
          voiceCount: response.data?.voices?.length || 0,
        });
        return;
      }
      case 'google-cloud-long': {
        const serviceAccountJson = payload.serviceAccountJson || process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON;
        const bucket = payload.bucket || process.env.GOOGLE_CLOUD_TTS_BUCKET;
        if (!serviceAccountJson || !bucket) {
          res.status(400).json({
            success: false,
            message: 'Service account JSON and GCS bucket are required.',
          });
          return;
        }

        const credentials = parseServiceAccountJson(serviceAccountJson);
        const location = payload.location || process.env.GOOGLE_CLOUD_TTS_LOCATION || 'global';
        const projectId = payload.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || credentials.project_id;

        // Use google-auth-library for reliable token generation
        const auth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        const client = await auth.getClient();
        const accessTokenResponse = await client.getAccessToken();
        const accessToken = accessTokenResponse?.token;

        if (!accessToken) {
          finish(false, 'Failed to generate access token.');
          return;
        }

        const checks: ExternalServiceTestResult[] = [];

        // Use global endpoint with v1 API for better compatibility
        const ttsUrl = `https://texttospeech.googleapis.com/v1/projects/${projectId}/locations/${location}/operations`;
        try {
          await axios.get(ttsUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { pageSize: 1 },
            timeout: 15000,
          });
          checks.push({ name: 'Long Audio API', success: true, message: 'Operations endpoint reachable.' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          checks.push({ name: 'Long Audio API', success: false, message });
        }

        const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}`;
        try {
          await axios.get(bucketUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000,
          });
          checks.push({ name: 'GCS Bucket', success: true, message: 'Bucket metadata accessible.' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          checks.push({ name: 'GCS Bucket', success: false, message });
        }

        const success = checks.every(check => check.success);
        finish(
          success,
          success ? 'Google Cloud Long Audio checks passed.' : 'Google Cloud Long Audio checks failed.',
          {
            projectId,
            bucket,
            location,
          },
          checks
        );
        return;
      }
      case 'azure-tts': {
        const apiKey = payload.apiKey || process.env.AZURE_SPEECH_KEY;
        const region = payload.region || process.env.AZURE_SPEECH_REGION || 'eastus';
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'Azure Speech API key is required.' });
          return;
        }

        const response = await axios.get(
          `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
          {
            headers: {
              'Ocp-Apim-Subscription-Key': apiKey,
            },
            timeout: 15000,
          }
        );

        finish(true, 'Azure TTS API reachable.', {
          voiceCount: response.data?.length || 0,
          region,
        });
        return;
      }
      case 'edge-tts': {
        try {
          await exec('python3 -c "import edge_tts"');
          finish(true, 'edge-tts Python package available.', { command: 'python3 -c "import edge_tts"' });
          return;
        } catch {
          try {
            await exec('python -c "import edge_tts"');
            finish(true, 'edge-tts Python package available (python).', { command: 'python -c "import edge_tts"' });
            return;
          } catch {
            finish(false, 'edge-tts Python package not available.', {
              suggestion: 'Install with: pip install edge-tts',
            });
            return;
          }
        }
      }
      case 'openrouter': {
        const apiKey = payload.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'OpenRouter API key is required.' });
          return;
        }

        const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });

        finish(true, 'OpenRouter API reachable.', {
          label: response.data?.label || null,
          rateLimit: response.data?.rate_limit || null,
        });
        return;
      }
      case 'openai': {
        const apiKey = payload.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'OpenAI API key is required.' });
          return;
        }

        const response = await axios.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });

        finish(true, 'OpenAI API reachable.', {
          modelCount: response.data?.data?.length || 0,
        });
        return;
      }
      case 'pinecone': {
        const apiKey = payload.apiKey || process.env.PINECONE_API_KEY;
        const indexName = payload.indexName || process.env.PINECONE_INDEX_NAME;
        const namespace = payload.namespace || process.env.PINECONE_NAMESPACE || 'duelogic-research';

        if (!apiKey || !indexName) {
          res.status(400).json({
            success: false,
            message: 'Pinecone API key and index name are required.',
          });
          return;
        }

        const client = new Pinecone({ apiKey });
        const index = client.index(indexName);
        await index.describeIndexStats();

        finish(true, 'Pinecone reachable.', {
          indexName,
          namespace,
        });
        return;
      }
      case 'listen-notes': {
        const apiKey = payload.apiKey || process.env.LISTEN_NOTES_API_KEY;
        if (!apiKey) {
          res.status(400).json({ success: false, message: 'Listen Notes API key is required.' });
          return;
        }

        const response = await axios.get('https://listen-api.listennotes.com/api/v2/trending_searches', {
          headers: { 'X-ListenAPI-Key': apiKey },
          timeout: 15000,
        });

        finish(true, 'Listen Notes API reachable.', {
          termCount: response.data?.terms?.length || 0,
        });
        return;
      }
      default: {
        res.status(400).json({ success: false, message: `Unknown service: ${serviceId}` });
        return;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ serviceId, errorMessage }, 'External service test failed');
    res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/rss/regenerate
 * Force regenerate RSS feed from database
 */
router.post('/admin/rss/regenerate', async (_req: Request, res: Response) => {
  try {
    const rssService = createRSSFeedService();
    await rssService.generateFeed();

    logger.info('RSS feed regenerated manually');

    res.json({
      success: true,
      message: 'RSS feed regenerated successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to regenerate RSS feed');
    res.status(500).json({
      error: 'Failed to regenerate RSS feed',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/queue/stats
 * View job queue statistics
 */
router.get('/admin/queue/stats', async (_req: Request, res: Response) => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      publishQueue.getWaitingCount(),
      publishQueue.getActiveCount(),
      publishQueue.getCompletedCount(),
      publishQueue.getFailedCount(),
      publishQueue.getDelayedCount(),
    ]);

    res.json({
      queue: 'podcast-publish',
      counts: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to get queue stats');
    res.status(500).json({
      error: 'Failed to get queue stats',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/queue/retry/:jobId
 * Retry a failed job
 */
router.post('/admin/queue/retry/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' });
      return;
    }

    const job = await publishQueue.getJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    await job.retry();

    logger.info({ jobId }, 'Job retry triggered');

    res.json({
      success: true,
      message: `Job ${jobId} queued for retry`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to retry job');
    res.status(500).json({
      error: 'Failed to retry job',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/queue/failed
 * List failed jobs
 */
router.get('/admin/queue/failed', async (_req: Request, res: Response) => {
  try {
    const failed = await publishQueue.getFailed(0, 50);

    const jobs = failed.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));

    res.json({
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to list failed jobs');
    res.status(500).json({
      error: 'Failed to list failed jobs',
      message: errorMessage,
    });
  }
});

// =============================================================================
// Reaction Library Management
// =============================================================================

/**
 * GET /admin/reactions
 * Get reaction library status and list of voices with reactions
 */
router.get('/admin/reactions', async (_req: Request, res: Response) => {
  try {
    const reactionLibrary = getReactionLibrary();
    const availableVoices = await reactionLibrary.getAvailableVoices();

    // Get clip counts for each voice
    const voiceDetails = await Promise.all(
      availableVoices.map(async (voiceId) => {
        const counts = await reactionLibrary.getClipCounts(voiceId);
        const totalClips = Object.values(counts).reduce((sum, n) => sum + n, 0);
        return {
          voiceId,
          totalClips,
          clipsByCategory: counts,
        };
      })
    );

    res.json({
      success: true,
      voiceCount: availableVoices.length,
      voices: voiceDetails,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to get reaction library status');
    res.status(500).json({
      error: 'Failed to get reaction library status',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/reactions/generate
 * Generate reaction clips for a voice
 * Body: { voiceId: string, voiceName?: string, speakingStyle?: string, backstory?: string, accent?: string }
 */
router.post('/admin/reactions/generate', async (req: Request, res: Response) => {
  try {
    const { voiceId, voiceName, speakingStyle, backstory, accent } = req.body;

    if (!voiceId || typeof voiceId !== 'string') {
      res.status(400).json({
        error: 'Missing required field: voiceId',
      });
      return;
    }

    logger.info({ voiceId, voiceName, hasCharacterContext: !!(speakingStyle || backstory || accent) }, 'Starting reaction clip generation');

    const reactionLibrary = getReactionLibrary();

    // Check if already has reactions
    const hasReactions = await reactionLibrary.hasReactionsForVoice(voiceId);
    if (hasReactions) {
      const counts = await reactionLibrary.getClipCounts(voiceId);
      res.json({
        success: true,
        message: 'Reactions already exist for this voice',
        voiceId,
        alreadyExists: true,
        clipsByCategory: counts,
      });
      return;
    }

    // Build character context if provided
    const characterContext = (speakingStyle || backstory || accent) ? {
      speakingStyle,
      backstory,
      accent,
    } : undefined;

    // Generate reactions (this may take a while)
    const generatedCount = await reactionLibrary.generateForVoice(voiceId, voiceName, characterContext);
    const counts = await reactionLibrary.getClipCounts(voiceId);

    logger.info({ voiceId, generatedCount }, 'Reaction clip generation complete');

    res.json({
      success: true,
      message: `Generated ${generatedCount} reaction clips`,
      voiceId,
      generatedCount,
      clipsByCategory: counts,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to generate reaction clips');
    res.status(500).json({
      error: 'Failed to generate reaction clips',
      message: errorMessage,
    });
  }
});

/**
 * DELETE /admin/reactions/:voiceId
 * Delete all reaction clips for a voice
 */
router.delete('/admin/reactions/:voiceId', async (req: Request, res: Response) => {
  try {
    const { voiceId } = req.params;

    if (!voiceId) {
      res.status(400).json({
        error: 'Missing required parameter: voiceId',
      });
      return;
    }

    logger.info({ voiceId }, 'Deleting reaction clips');

    const reactionLibrary = getReactionLibrary();
    await reactionLibrary.deleteForVoice(voiceId);

    res.json({
      success: true,
      message: `Deleted reaction clips for voice ${voiceId}`,
      voiceId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to delete reaction clips');
    res.status(500).json({
      error: 'Failed to delete reaction clips',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/reactions/:voiceId
 * Get reaction clips for a specific voice with audio URLs for preview
 */
router.get('/admin/reactions/:voiceId', async (req: Request, res: Response) => {
  try {
    const { voiceId } = req.params;

    if (!voiceId) {
      res.status(400).json({
        error: 'Missing required parameter: voiceId',
      });
      return;
    }

    const reactionLibrary = getReactionLibrary();
    const hasReactions = await reactionLibrary.hasReactionsForVoice(voiceId);

    if (!hasReactions) {
      res.json({
        success: true,
        voiceId,
        hasReactions: false,
        clips: [],
      });
      return;
    }

    const counts = await reactionLibrary.getClipCounts(voiceId);

    // Get all clips for this voice from manifest
    const allClips = await reactionLibrary.getAllClipsForVoice(voiceId);
    const clips = allClips.map(clip => ({
      category: clip.category,
      text: clip.text,
      audioUrl: `/api/admin/reactions/${voiceId}/audio/${encodeURIComponent(clip.text)}`,
    }));

    res.json({
      success: true,
      voiceId,
      hasReactions: true,
      clipsByCategory: counts,
      totalClips: Object.values(counts).reduce((sum, n) => sum + n, 0),
      clips,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to get reaction clips');
    res.status(500).json({
      error: 'Failed to get reaction clips',
      message: errorMessage,
    });
  }
});

/**
 * GET /admin/reactions/:voiceId/audio/:phrase
 * Stream a specific reaction audio clip for preview
 */
router.get('/admin/reactions/:voiceId/audio/:phrase', async (req: Request, res: Response) => {
  try {
    const { voiceId, phrase } = req.params;

    if (!voiceId || !phrase) {
      res.status(400).json({
        error: 'Missing required parameters',
      });
      return;
    }

    const decodedPhrase = decodeURIComponent(phrase);
    const fs = await import('fs');
    const path = await import('path');

    // Sanitize phrase for filename
    const sanitized = decodedPhrase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Try each category (all 8 categories)
    const allCategories = ['agreement', 'disagreement', 'interest', 'acknowledgment', 'challenge', 'amusement', 'surprise', 'skepticism'] as const;
    for (const category of allCategories) {
      const filename = `${category}_${sanitized}.mp3`;
      const audioPath = path.join('./assets/reactions', voiceId, filename);

      if (fs.existsSync(audioPath)) {
        const stat = fs.statSync(audioPath);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');

        const stream = fs.createReadStream(audioPath);
        stream.pipe(res);
        return;
      }
    }

    res.status(404).json({ error: 'Reaction clip not found' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to stream reaction audio');
    res.status(500).json({
      error: 'Failed to stream reaction audio',
      message: errorMessage,
    });
  }
});

/**
 * POST /admin/reactions/generate-all
 * Generate reaction clips for all voices used in recent conversations
 * This finds unique voice IDs from conversation personas and generates clips for each
 */
router.post('/admin/reactions/generate-all', async (req: Request, res: Response) => {
  try {
    // Get voice IDs from request body, or we could query from personas
    const { voiceIds } = req.body as { voiceIds?: string[] };

    if (!voiceIds || !Array.isArray(voiceIds) || voiceIds.length === 0) {
      res.status(400).json({
        error: 'Missing required field: voiceIds (array of voice IDs)',
        hint: 'Provide an array of ElevenLabs/Gemini voice IDs to generate reactions for',
      });
      return;
    }

    logger.info({ voiceCount: voiceIds.length }, 'Starting bulk reaction generation');

    const reactionLibrary = getReactionLibrary();
    const results: Array<{
      voiceId: string;
      status: 'generated' | 'skipped' | 'error';
      generatedCount?: number;
      error?: string;
    }> = [];

    for (const voiceId of voiceIds) {
      try {
        const hasReactions = await reactionLibrary.hasReactionsForVoice(voiceId);
        if (hasReactions) {
          results.push({ voiceId, status: 'skipped' });
          continue;
        }

        const generatedCount = await reactionLibrary.generateForVoice(voiceId);
        results.push({ voiceId, status: 'generated', generatedCount });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ voiceId, status: 'error', error: errorMessage });
      }
    }

    const generated = results.filter(r => r.status === 'generated').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    logger.info({ generated, skipped, errors }, 'Bulk reaction generation complete');

    res.json({
      success: true,
      summary: {
        total: voiceIds.length,
        generated,
        skipped,
        errors,
      },
      results,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage }, 'Failed to generate bulk reaction clips');
    res.status(500).json({
      error: 'Failed to generate bulk reaction clips',
      message: errorMessage,
    });
  }
});

export default router;
