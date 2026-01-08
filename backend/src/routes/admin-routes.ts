/**
 * Admin Routes
 * Express routes for admin dashboard, debate management, and system monitoring
 */

import express, { type Request, type Response } from 'express';
import { sseManager } from '../services/sse/index.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import * as exportJobRepository from '../db/repositories/export-job-repository.js';
import * as eventRepository from '../db/repositories/event-repository.js';
import * as presetRepository from '../db/repositories/preset-repository.js';
import * as personaRepository from '../db/repositories/persona-repository.js';
import * as settingsRepository from '../db/repositories/settings-repository.js';
import { orchestratorRegistry } from '../services/debate/index.js';
import { createLogger } from '../utils/logger.js';
import { getRateLimiter } from '../services/llm/rate-limiter.js';
import {
  listExternalServiceStatuses,
  runExternalServiceTest,
  type ExternalServiceId,
} from '../services/admin/external-service-testing.js';
import type { DebateStatus, SystemEventType, EventSeverity } from '../types/database.js';

const router = express.Router();
const logger = createLogger({ module: 'AdminRoutes' });

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

// =============================================================================
// External Service Testing Endpoints
// =============================================================================

/**
 * GET /admin/testing/services
 * List external services and configuration status
 */
router.get('/admin/testing/services', (_req: Request, res: Response) => {
  res.json({
    services: listExternalServiceStatuses(),
  });
});

/**
 * POST /admin/testing/run
 * Execute a connectivity test for an external service
 */
router.post('/admin/testing/run', async (req: Request, res: Response) => {
  const { serviceId, config } = req.body as {
    serviceId?: ExternalServiceId;
    config?: Record<string, unknown>;
  };

  if (!serviceId) {
    res.status(400).json({ error: 'serviceId is required' });
    return;
  }

  try {
    const result = await runExternalServiceTest(
      serviceId,
      (config || {}) as any
    );
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      ok: false,
      message,
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

export default router;
