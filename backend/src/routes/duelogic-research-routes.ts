/**
 * Duelogic Research Routes
 * API endpoints for research dashboard and proposal management
 */

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { ResearchRepository } from '../db/repositories/research-repository.js';
import { EpisodeProposalRepository } from '../db/repositories/episode-proposal-repository.js';
import * as debateRepository from '../db/repositories/debate-repository.js';
import { ProposalStatus, ResearchConfig } from '../types/duelogic-research.js';
import { researchSSEManager } from '../services/sse/research-sse-manager.js';
import { sseManager } from '../services/sse/index.js';
import { DuelogicResearchService } from '../services/research/duelogic-research-service.js';
import { EpisodeGenerator } from '../services/research/episode-generator.js';
import { OpenRouterLLMClient } from '../services/llm/openrouter-adapter.js';
import { createVectorDBClient } from '../services/research/vector-db-factory.js';
import { createEmbeddingService } from '../services/research/embedding-service.js';
import { ResearchIndexer } from '../services/research/research-indexer.js';
import { createDuelogicOrchestrator } from '../services/debate/duelogic-orchestrator.js';
import { mergeWithDuelogicDefaults, type PhilosophicalChair } from '../types/duelogic.js';

const router = express.Router();
const logger = createLogger({ module: 'DuelogicResearchRoutes' });

// Initialize repositories
const researchRepo = new ResearchRepository(pool);
const proposalRepo = new EpisodeProposalRepository(pool);

// Track running jobs to prevent duplicates
const runningJobs = new Set<string>();

/**
 * Execute research job asynchronously with SSE events
 */
async function executeResearchJob(jobId: string, config: ResearchConfig): Promise<void> {
  const startTime = Date.now();
  let topicsDiscovered = 0;
  let episodesGenerated = 0;
  let tokensUsed = 0;

  try {
    // Emit job started event
    researchSSEManager.broadcastToJob(jobId, 'research_started', {
      jobId,
      configId: config.id,
      configName: config.name,
      categories: config.categories,
      maxTopicsPerRun: config.maxTopicsPerRun,
      timestampMs: Date.now(),
    });

    researchSSEManager.broadcastToJob(jobId, 'research_log', {
      jobId,
      level: 'info',
      message: `Starting research with config "${config.name}"`,
      details: { categories: config.categories },
      timestampMs: Date.now(),
    });

    // Check for OpenRouter API key
    if (!process.env.OPENROUTER_API_KEY) {
      researchSSEManager.broadcastToJob(jobId, 'research_log', {
        jobId,
        level: 'warn',
        message: 'OPENROUTER_API_KEY not configured - running in demo mode',
        timestampMs: Date.now(),
      });

      // Demo mode: simulate research with fake data
      await runDemoResearch(jobId, config);
      return;
    }

    // Initialize services
    const llmClient = new OpenRouterLLMClient(config.perplexityModel);

    const researchService = new DuelogicResearchService(
      llmClient,
      researchRepo,
      { model: config.perplexityModel },
      { minControversyScore: config.minControversyScore }
    );

    const episodeGenerator = new EpisodeGenerator(llmClient, proposalRepo);

    // Process each category
    for (let i = 0; i < config.categories.length; i++) {
      const category = config.categories[i];
      const categoryStartTime = Date.now();

      researchSSEManager.broadcastToJob(jobId, 'research_category_start', {
        jobId,
        category,
        categoryIndex: i + 1,
        totalCategories: config.categories.length,
        timestampMs: Date.now(),
      });

      researchSSEManager.broadcastToJob(jobId, 'research_log', {
        jobId,
        level: 'info',
        message: `Researching category: ${category}`,
        timestampMs: Date.now(),
      });

      try {
        // Discover topics for this category
        const results = await researchService.discoverTopics(config, jobId);

        for (const result of results) {
          topicsDiscovered++;

          researchSSEManager.broadcastToJob(jobId, 'research_topic_found', {
            jobId,
            topic: result.topic,
            category: result.category,
            summary: result.summary.slice(0, 200),
            sourceCount: result.sources.length,
            timestampMs: Date.now(),
          });

          researchSSEManager.broadcastToJob(jobId, 'research_topic_scored', {
            jobId,
            topic: result.topic,
            controversyScore: result.controversyScore,
            timeliness: result.timeliness,
            depth: result.depth,
            passedThreshold: true,
            timestampMs: Date.now(),
          });

          // Generate episode proposal
          researchSSEManager.broadcastToJob(jobId, 'episode_generating', {
            jobId,
            topic: result.topic,
            category: result.category,
            timestampMs: Date.now(),
          });

          const proposal = await episodeGenerator.generateProposal(result);
          if (proposal) {
            episodesGenerated++;

            researchSSEManager.broadcastToJob(jobId, 'episode_generated', {
              jobId,
              proposalId: proposal.id,
              title: proposal.title,
              subtitle: proposal.subtitle,
              category: result.category,
              tokensUsed: 0,
              timestampMs: Date.now(),
            });
          }
        }

        researchSSEManager.broadcastToJob(jobId, 'research_category_complete', {
          jobId,
          category,
          topicsFound: results.length,
          tokensUsed: 0,
          durationMs: Date.now() - categoryStartTime,
          timestampMs: Date.now(),
        });

      } catch (categoryError) {
        researchSSEManager.broadcastToJob(jobId, 'research_log', {
          jobId,
          level: 'error',
          message: `Error processing category ${category}: ${categoryError instanceof Error ? categoryError.message : 'Unknown error'}`,
          timestampMs: Date.now(),
        });
      }

      // Progress update
      researchSSEManager.broadcastToJob(jobId, 'research_progress', {
        jobId,
        phase: 'discovery',
        categoriesCompleted: i + 1,
        totalCategories: config.categories.length,
        topicsFound: topicsDiscovered,
        episodesGenerated,
        tokensUsed,
        timestampMs: Date.now(),
      });
    }

    // Complete the job
    await researchRepo.completeJob(jobId, topicsDiscovered, episodesGenerated, tokensUsed);

    researchSSEManager.broadcastToJob(jobId, 'research_complete', {
      jobId,
      topicsDiscovered,
      episodesGenerated,
      tokensUsed,
      durationMs: Date.now() - startTime,
      timestampMs: Date.now(),
    });

    logger.info({ jobId, topicsDiscovered, episodesGenerated }, 'Research job completed');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await researchRepo.failJob(jobId, errorMessage);

    researchSSEManager.broadcastToJob(jobId, 'research_failed', {
      jobId,
      error: errorMessage,
      timestampMs: Date.now(),
    });

    logger.error({ jobId, error }, 'Research job failed');
  } finally {
    runningJobs.delete(jobId);
  }
}

/**
 * Demo research mode when no API key is configured
 */
async function runDemoResearch(jobId: string, config: ResearchConfig): Promise<void> {
  const startTime = Date.now();

  // Simulate processing each category
  for (let i = 0; i < config.categories.length; i++) {
    const category = config.categories[i];

    researchSSEManager.broadcastToJob(jobId, 'research_category_start', {
      jobId,
      category,
      categoryIndex: i + 1,
      totalCategories: config.categories.length,
      timestampMs: Date.now(),
    });

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    researchSSEManager.broadcastToJob(jobId, 'research_log', {
      jobId,
      level: 'info',
      message: `[Demo] Would research topics in: ${category}`,
      timestampMs: Date.now(),
    });

    researchSSEManager.broadcastToJob(jobId, 'research_category_complete', {
      jobId,
      category,
      topicsFound: 0,
      tokensUsed: 0,
      durationMs: 1000,
      timestampMs: Date.now(),
    });

    researchSSEManager.broadcastToJob(jobId, 'research_progress', {
      jobId,
      phase: 'discovery',
      categoriesCompleted: i + 1,
      totalCategories: config.categories.length,
      topicsFound: 0,
      episodesGenerated: 0,
      tokensUsed: 0,
      timestampMs: Date.now(),
    });
  }

  await researchRepo.completeJob(jobId, 0, 0, 0);

  researchSSEManager.broadcastToJob(jobId, 'research_complete', {
    jobId,
    topicsDiscovered: 0,
    episodesGenerated: 0,
    tokensUsed: 0,
    durationMs: Date.now() - startTime,
    timestampMs: Date.now(),
  });

  researchSSEManager.broadcastToJob(jobId, 'research_log', {
    jobId,
    level: 'info',
    message: 'Demo research completed. Configure OPENROUTER_API_KEY for real research.',
    timestampMs: Date.now(),
  });
}

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
      config = configs[0] ?? null;
    }

    if (!config) {
      return res.status(400).json({ error: 'No research configuration found' });
    }

    const job = await researchRepo.createJob(config.id);
    await researchRepo.startJob(job.id);

    // Prevent duplicate runs
    if (runningJobs.has(job.id)) {
      return res.status(409).json({ error: 'Job is already running' });
    }
    runningJobs.add(job.id);

    // Start research job asynchronously (don't await)
    executeResearchJob(job.id, config).catch(err => {
      logger.error({ jobId: job.id, error: err }, 'Research job execution failed');
    });

    logger.info({ jobId: job.id, configId: config.id }, 'Research job started');

    return res.status(201).json(job);
  } catch (error) {
    logger.error({ error }, 'Failed to start research job');
    return res.status(500).json({ error: 'Failed to start research job' });
  }
});

/**
 * GET /duelogic/research/jobs/:id/stream
 * SSE endpoint for streaming research job events
 */
router.get('/research/jobs/:id/stream', (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: 'Job ID required' });
    return;
  }

  // Check if job exists (async but we handle it inline)
  researchRepo.findJobById(id).then(job => {
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // Register SSE client
    const clientId = researchSSEManager.registerClient(id, res);

    // Handle client disconnect
    req.on('close', () => {
      researchSSEManager.unregisterClient(clientId);
    });

    // If job is already completed, send final status immediately
    if (job.status === 'completed') {
      researchSSEManager.broadcastToJob(id, 'research_complete', {
        jobId: id,
        topicsDiscovered: job.topicsDiscovered,
        episodesGenerated: job.episodesGenerated,
        tokensUsed: job.tokensUsed,
        durationMs: job.completedAt && job.startedAt
          ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
          : 0,
        timestampMs: Date.now(),
      });
    } else if (job.status === 'failed') {
      researchSSEManager.broadcastToJob(id, 'research_failed', {
        jobId: id,
        error: job.error || 'Unknown error',
        timestampMs: Date.now(),
      });
    }
    // Keep connection open - SSE manager handles heartbeats
  }).catch(err => {
    console.error('Failed to find job:', err);
    res.status(500).json({ error: 'Failed to find job' });
  });
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
    if (!id) return res.status(400).json({ error: 'ID required' });
    await researchRepo.updateConfig(id, req.body);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update research config');
    return res.status(500).json({ error: 'Failed to update research config' });
  }
});

/**
 * DELETE /duelogic/research/configs/:id
 * Delete a research configuration
 */
router.delete('/research/configs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID required' });
    await researchRepo.deleteConfig(id);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete research config');
    return res.status(500).json({ error: 'Failed to delete research config' });
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
    if (!id) return res.status(400).json({ error: 'ID required' });
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
    if (!id) return res.status(400).json({ error: 'ID required' });
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
 * Approve a proposal and index research into Pinecone for RAG
 */
router.post('/proposals/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { episodeNumber } = req.body;

    // Get the proposal first
    const proposal = await proposalRepo.findById(id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const nextNumber = episodeNumber || await proposalRepo.getNextEpisodeNumber();
    await proposalRepo.approve(id, 'admin', nextNumber);

    logger.info({ proposalId: id, episodeNumber: nextNumber }, 'Proposal approved');

    // Index research into Pinecone for RAG (async, don't block response)
    indexResearchAsync(proposal).catch(err => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ errorMessage: errMsg, proposalId: id }, 'Failed to index research into Pinecone');
    });

    return res.json({ success: true, episodeNumber: nextNumber });
  } catch (error) {
    logger.error({ error }, 'Failed to approve proposal');
    return res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

/**
 * Index research into Pinecone asynchronously
 */
async function indexResearchAsync(proposal: Awaited<ReturnType<typeof proposalRepo.findById>>): Promise<void> {
  if (!proposal) return;

  const vectorDB = createVectorDBClient();
  if (!vectorDB) {
    logger.info('Vector DB not configured, skipping research indexing');
    return;
  }

  try {
    const embeddingService = createEmbeddingService();
    const indexer = new ResearchIndexer(vectorDB, embeddingService, researchRepo);

    const chunksIndexed = await indexer.indexEpisodeResearch(proposal);
    logger.info({ proposalId: proposal.id, chunksIndexed }, 'Research indexed into Pinecone');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      errorMessage,
      errorStack,
      proposalId: proposal.id
    }, 'Failed to index research');
    throw error;
  }
}

/**
 * POST /duelogic/proposals/:id/reject
 * Reject a proposal
 */
router.post('/proposals/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const { notes } = req.body;

    await proposalRepo.reject(id, 'admin', notes);

    logger.info({ proposalId: id }, 'Proposal rejected');
    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to reject proposal');
    return res.status(500).json({ error: 'Failed to reject proposal' });
  }
});

/**
 * POST /duelogic/proposals/:id/schedule
 * Schedule a proposal for a specific date
 */
router.post('/proposals/:id/schedule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID required' });
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

// Default philosophical frameworks to assign to proposal chairs
const DEFAULT_CHAIR_FRAMEWORKS: PhilosophicalChair[] = [
  'pragmatic',
  'precautionary',
  'utilitarian',
  'deontological',
  'virtue_ethics',
  'libertarian',
];

/**
 * POST /duelogic/proposals/:id/launch
 * Launch a Duelogic debate from an approved proposal
 * Creates a new debate using the proposal's content and the Duelogic orchestrator
 */
router.post('/proposals/:id/launch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID required' });

    // Get the proposal
    const proposal = await proposalRepo.findById(id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check proposal is approved or scheduled
    if (proposal.status !== 'approved' && proposal.status !== 'scheduled') {
      return res.status(400).json({
        error: 'Proposal must be approved or scheduled to launch',
        currentStatus: proposal.status,
      });
    }

    const debateId = uuidv4();

    // Map proposal chairs to Duelogic chairs with philosophical frameworks
    // The proposal's chair positions become persona overlays
    const proposalChairs = proposal.chairs || [];
    const duelogicChairs = proposalChairs.map((chair, index) => ({
      position: `chair_${index + 1}` as const,
      framework: DEFAULT_CHAIR_FRAMEWORKS[index % DEFAULT_CHAIR_FRAMEWORKS.length],
      modelId: 'gpt-4o', // Default model - TODO: make configurable
      modelDisplayName: chair.name,
      providerName: 'OpenAI',
      // Include the custom position as persona context
      persona: `You are "${chair.name}". Your core position: ${chair.position}. You must acknowledge: ${chair.mustAcknowledge}`,
    }));

    // Build proposition context string for the arbiter
    const propositionContext = `
Episode ${proposal.episodeNumber}: "${proposal.title}"
${proposal.subtitle ? `Subtitle: ${proposal.subtitle}` : ''}

${proposal.description}

Background: ${proposal.contextForPanel}

Key Tensions to Explore:
${proposal.keyTensions?.map((t, i) => `${i + 1}. ${t}`).join('\n') || 'None specified'}

Chair Positions:
${proposalChairs.map(c => `- ${c.name}: ${c.position}`).join('\n')}
`.trim();

    // Build Duelogic config with the proposal's chairs
    const duelogicConfig = mergeWithDuelogicDefaults({
      chairs: duelogicChairs.length >= 2 ? duelogicChairs : undefined,
      tone: 'professional',
      podcastMode: {
        enabled: true,
        showName: 'Duelogic',
        episodeTitle: proposal.title,
        episodeNumber: proposal.episodeNumber || undefined,
      },
    });

    // Create the debate in database with duelogic mode
    await debateRepository.create({
      id: debateId,
      propositionText: proposal.proposition,
      propositionContext: {
        title: proposal.title,
        subtitle: proposal.subtitle,
        description: proposal.description,
        contextForPanel: proposal.contextForPanel,
        chairs: proposal.chairs,
        keyTensions: proposal.keyTensions,
        episodeNumber: proposal.episodeNumber,
        proposalId: proposal.id,
        researchResultId: proposal.researchResultId,
      },
      debateMode: 'duelogic',
      duelogicConfig: duelogicConfig as unknown as Record<string, unknown>,
    });

    // Update proposal status to indicate it's been launched
    await proposalRepo.updateStatus(id, 'launched');

    logger.info({
      proposalId: id,
      debateId,
      title: proposal.title,
      chairCount: duelogicChairs.length,
    }, 'Duelogic debate launched from proposal');

    // Create and start the Duelogic orchestrator
    const orchestrator = createDuelogicOrchestrator({
      debateId,
      proposition: proposal.proposition,
      propositionContext,
      config: duelogicConfig,
      sseManager,
    });

    // Start debate in background (non-blocking)
    orchestrator.start().catch((error) => {
      logger.error({ debateId, error }, 'Duelogic debate failed');
    });

    return res.status(201).json({
      success: true,
      debateId,
      proposalId: id,
      chairCount: duelogicChairs.length,
      message: `Duelogic debate created and starting: ${proposal.title}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to launch debate from proposal');
    return res.status(500).json({ error: 'Failed to launch debate' });
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
