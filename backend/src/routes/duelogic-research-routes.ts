/**
 * Duelogic Research Routes
 * API endpoints for research dashboard and proposal management
 */

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { ResearchRepository } from '../db/repositories/research-repository.js';
import { EpisodeProposalRepository } from '../db/repositories/episode-proposal-repository.js';
import { ProposalStatus } from '../types/duelogic-research.js';

const router = express.Router();
const logger = createLogger({ module: 'DuelogicResearchRoutes' });

// Initialize repositories
const researchRepo = new ResearchRepository(pool);
const proposalRepo = new EpisodeProposalRepository(pool);

// ============================================================================
// Validation Schemas
// ============================================================================

const UpdateProposalSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  proposition: z.string().optional(),
  contextForPanel: z.string().optional(),
  chairs: z.array(z.object({
    name: z.string(),
    position: z.string(),
    mustAcknowledge: z.string(),
  })).optional(),
  keyTensions: z.array(z.string()).optional(),
});

const BulkActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  ids: z.array(z.string().uuid()),
});

// ============================================================================
// Dashboard Stats
// ============================================================================

/**
 * GET /duelogic/dashboard/stats
 * Get dashboard statistics
 */
router.get('/dashboard/stats', async (_req: Request, res: Response) => {
  try {
    const proposalStats = await proposalRepo.getStats();
    const recentJobs = await researchRepo.findRecentJobs(10);

    const totalTopics = recentJobs.reduce((sum, job) => sum + job.topicsDiscovered, 0);
    const totalEpisodes = recentJobs.reduce((sum, job) => sum + job.episodesGenerated, 0);

    res.json({
      pendingProposals: proposalStats.pending,
      approvedProposals: proposalStats.approved,
      rejectedProposals: proposalStats.rejected,
      scheduledProposals: proposalStats.scheduled,
      recentJobsCount: recentJobs.length,
      totalTopicsDiscovered: totalTopics,
      totalEpisodesGenerated: totalEpisodes,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get dashboard stats');
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// ============================================================================
// Research Jobs
// ============================================================================

/**
 * GET /duelogic/research/jobs
 * Get recent research jobs
 */
router.get('/research/jobs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const jobs = await researchRepo.findRecentJobs(limit);
    res.json(jobs);
  } catch (error) {
    logger.error({ error }, 'Failed to get research jobs');
    res.status(500).json({ error: 'Failed to get research jobs' });
  }
});

/**
 * POST /duelogic/research/jobs/run
 * Manually trigger a research job
 */
router.post('/research/jobs/run', async (req: Request, res: Response) => {
  try {
    const { configId } = req.body;

    // Find config or use default
    let config = configId ? await researchRepo.findConfigById(configId) : null;
    if (!config) {
      const configs = await researchRepo.findEnabledConfigs();
      config = configs[0];
    }

    if (!config) {
      return res.status(400).json({ error: 'No research configuration found' });
    }

    const job = await researchRepo.createJob(config.id);
    await researchRepo.startJob(job.id);

    // In a real implementation, this would trigger the actual research job
    // For now, we just create the job record
    logger.info({ jobId: job.id, configId: config.id }, 'Research job started');

    return res.status(201).json(job);
  } catch (error) {
    logger.error({ error }, 'Failed to start research job');
    return res.status(500).json({ error: 'Failed to start research job' });
  }
});

// ============================================================================
// Research Configs
// ============================================================================

/**
 * GET /duelogic/research/configs
 * Get all research configurations
 */
router.get('/research/configs', async (_req: Request, res: Response) => {
  try {
    const configs = await researchRepo.findAllConfigs();
    res.json(configs);
  } catch (error) {
    logger.error({ error }, 'Failed to get research configs');
    res.status(500).json({ error: 'Failed to get research configs' });
  }
});

/**
 * POST /duelogic/research/configs
 * Create a new research configuration
 */
router.post('/research/configs', async (req: Request, res: Response) => {
  try {
    const config = await researchRepo.createConfig(req.body);
    res.status(201).json(config);
  } catch (error) {
    logger.error({ error }, 'Failed to create research config');
    res.status(500).json({ error: 'Failed to create research config' });
  }
});

/**
 * PUT /duelogic/research/configs/:id
 * Update a research configuration
 */
router.put('/research/configs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await researchRepo.updateConfig(id, req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update research config');
    res.status(500).json({ error: 'Failed to update research config' });
  }
});

/**
 * DELETE /duelogic/research/configs/:id
 * Delete a research configuration
 */
router.delete('/research/configs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await researchRepo.deleteConfig(id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete research config');
    res.status(500).json({ error: 'Failed to delete research config' });
  }
});

// ============================================================================
// Episode Proposals
// ============================================================================

/**
 * GET /duelogic/proposals
 * Get episode proposals with optional status filter
 */
router.get('/proposals', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as ProposalStatus | undefined;
    let proposals;

    if (status) {
      proposals = await proposalRepo.findByStatus(status);
    } else {
      // Get all proposals - we'll combine multiple queries
      const [pending, approved, rejected, scheduled] = await Promise.all([
        proposalRepo.findByStatus('pending'),
        proposalRepo.findByStatus('approved'),
        proposalRepo.findByStatus('rejected'),
        proposalRepo.findByStatus('scheduled'),
      ]);
      proposals = [...pending, ...approved, ...rejected, ...scheduled];
    }

    res.json(proposals);
  } catch (error) {
    logger.error({ error }, 'Failed to get proposals');
    res.status(500).json({ error: 'Failed to get proposals' });
  }
});

/**
 * GET /duelogic/proposals/:id
 * Get a single proposal by ID
 */
router.get('/proposals/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const proposal = await proposalRepo.findById(id);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    return res.json(proposal);
  } catch (error) {
    logger.error({ error }, 'Failed to get proposal');
    return res.status(500).json({ error: 'Failed to get proposal' });
  }
});

/**
 * PUT /duelogic/proposals/:id
 * Update proposal content
 */
router.put('/proposals/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = UpdateProposalSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({ errors: parseResult.error.errors });
    }

    await proposalRepo.updateContent(id, parseResult.data, 'admin');
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update proposal');
    return res.status(500).json({ error: 'Failed to update proposal' });
  }
});

/**
 * POST /duelogic/proposals/:id/approve
 * Approve a proposal
 */
router.post('/proposals/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { episodeNumber } = req.body;

    const nextNumber = episodeNumber || await proposalRepo.getNextEpisodeNumber();
    await proposalRepo.approve(id, 'admin', nextNumber);

    logger.info({ proposalId: id, episodeNumber: nextNumber }, 'Proposal approved');
    res.json({ success: true, episodeNumber: nextNumber });
  } catch (error) {
    logger.error({ error }, 'Failed to approve proposal');
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

/**
 * POST /duelogic/proposals/:id/reject
 * Reject a proposal
 */
router.post('/proposals/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    await proposalRepo.reject(id, 'admin', notes);

    logger.info({ proposalId: id }, 'Proposal rejected');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to reject proposal');
    res.status(500).json({ error: 'Failed to reject proposal' });
  }
});

/**
 * POST /duelogic/proposals/:id/schedule
 * Schedule a proposal for a specific date
 */
router.post('/proposals/:id/schedule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { scheduledFor } = req.body;

    if (!scheduledFor) {
      return res.status(400).json({ error: 'scheduledFor date required' });
    }

    await proposalRepo.schedule(id, new Date(scheduledFor));

    logger.info({ proposalId: id, scheduledFor }, 'Proposal scheduled');
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to schedule proposal');
    return res.status(500).json({ error: 'Failed to schedule proposal' });
  }
});

/**
 * POST /duelogic/proposals/bulk-action
 * Bulk approve or reject proposals
 */
router.post('/proposals/bulk-action', async (req: Request, res: Response) => {
  try {
    const parseResult = BulkActionSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({ errors: parseResult.error.errors });
    }

    const { action, ids } = parseResult.data;

    if (action === 'approve') {
      await proposalRepo.bulkApprove(ids, 'admin');
    } else {
      await proposalRepo.bulkReject(ids, 'admin');
    }

    logger.info({ action, count: ids.length }, 'Bulk action completed');
    return res.json({ success: true, count: ids.length });
  } catch (error) {
    logger.error({ error }, 'Failed to perform bulk action');
    return res.status(500).json({ error: 'Failed to perform bulk action' });
  }
});

export default router;
