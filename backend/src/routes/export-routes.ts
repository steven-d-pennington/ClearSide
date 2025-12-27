/**
 * Export Routes
 * Express routes for exporting debate transcripts to various formats
 */

import express, { type Request, type Response } from 'express';
import { promises as fs } from 'fs';
import { createMarkdownExporter } from '../services/export/markdownExporter.js';
import { createTranscriptRecorder } from '../services/transcript/transcript-recorder.js';
import { schemaValidator } from '../services/validation/schema-validator.js';
import { createLogger } from '../utils/logger.js';
import type { MarkdownExportOptions } from '../services/export/types.js';
import {
  createAudioExportOrchestrator,
  getAvailableProviders,
  getDefaultProvider,
  getProvidersWithStatus,
  isProviderAvailable,
  type AudioExportOptions,
  type TTSProvider,
} from '../services/audio/index.js';

const router = express.Router();
const logger = createLogger({ module: 'ExportRoutes' });

// Initialize services
const transcriptRecorder = createTranscriptRecorder(schemaValidator);
const markdownExporter = createMarkdownExporter();

// Audio orchestrators per provider (lazy init to avoid requiring API keys at startup)
const audioOrchestrators = new Map<TTSProvider, ReturnType<typeof createAudioExportOrchestrator>>();

function getAudioOrchestrator(provider?: TTSProvider): ReturnType<typeof createAudioExportOrchestrator> {
  const selectedProvider = provider || getDefaultProvider();

  // Check if we already have an orchestrator for this provider
  const cached = audioOrchestrators.get(selectedProvider);
  if (cached) {
    return cached;
  }

  // Create new orchestrator with the selected provider
  const orchestrator = createAudioExportOrchestrator({ provider: selectedProvider });
  audioOrchestrators.set(selectedProvider, orchestrator);
  return orchestrator;
}

/**
 * GET /exports/:debateId/markdown
 * Export a debate transcript as Markdown
 *
 * Query parameters:
 * - includeMetadata: boolean (default: true)
 * - includeProposition: boolean (default: true)
 * - includePro: boolean (default: true)
 * - includeCon: boolean (default: true)
 * - includeModerator: boolean (default: true)
 * - includeChallenges: boolean (default: false)
 * - includeTranscript: boolean (default: false)
 * - format: 'standard' | 'compact' (default: 'standard')
 * - download: boolean (default: false) - if true, sets Content-Disposition header
 */
router.get('/exports/:debateId/markdown', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Markdown export requested');

  try {
    // Load transcript from database
    const transcript = await transcriptRecorder.loadTranscript(debateId!);

    if (!transcript) {
      logger.warn({ debateId }, 'Transcript not found for export');
      res.status(404).json({
        error: 'Transcript not found',
        debateId,
        message: 'No transcript exists for this debate. Has the debate completed?',
      });
      return;
    }

    // Parse export options from query parameters
    const options: MarkdownExportOptions = {
      includeMetadata: req.query.includeMetadata !== 'false',
      includeProposition: req.query.includeProposition !== 'false',
      includePro: req.query.includePro !== 'false',
      includeCon: req.query.includeCon !== 'false',
      includeModerator: req.query.includeModerator !== 'false',
      includeChallenges: req.query.includeChallenges === 'true',
      includeTranscript: req.query.includeTranscript === 'true',
      format: (req.query.format as 'standard' | 'compact') || 'standard',
    };

    // Export to Markdown
    const result = markdownExporter.export(transcript, options);

    if (!result.success) {
      logger.error({ debateId, error: result.error }, 'Markdown export failed');
      res.status(500).json({
        error: 'Export failed',
        message: result.error,
        debateId,
      });
      return;
    }

    logger.info(
      { debateId, sizeBytes: result.metadata.fileSizeBytes },
      'Markdown export successful'
    );

    // Set appropriate headers
    if (req.query.download === 'true') {
      // Download as file
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.metadata.fileName}"`
      );
    } else {
      // Display inline
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    }

    // Send the Markdown content
    res.send(result.content);
  } catch (error) {
    logger.error({ error, debateId }, 'Error processing markdown export request');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      debateId,
    });
  }
});

/**
 * GET /exports/:debateId/preview
 * Preview available export formats and metadata
 *
 * Returns information about the debate and available export options
 * without generating the full export.
 */
router.get('/exports/:debateId/preview', async (req: Request, res: Response) => {
  const { debateId } = req.params;

  logger.info({ debateId }, 'Export preview requested');

  try {
    // Load transcript from database
    const transcript = await transcriptRecorder.loadTranscript(debateId!);

    if (!transcript) {
      logger.warn({ debateId }, 'Transcript not found for preview');
      res.status(404).json({
        error: 'Transcript not found',
        debateId,
      });
      return;
    }

    // Build preview information
    const preview = {
      debateId: transcript.meta.debate_id,
      proposition: transcript.proposition.normalized_question,
      status: transcript.meta.status,
      duration: transcript.meta.total_duration_seconds,
      generatedAt: transcript.meta.generated_at,
      schemaVersion: transcript.meta.schema_version,
      availableFormats: ['markdown', 'audio'], // Will expand with PDF, video
      sections: {
        pro: {
          argumentCount: transcript.structured_analysis?.pro?.arguments?.length || 0,
          hasAssumptions: (transcript.structured_analysis?.pro?.assumptions?.length || 0) > 0,
          hasUncertainties:
            (transcript.structured_analysis?.pro?.uncertainties?.length || 0) > 0,
        },
        con: {
          argumentCount: transcript.structured_analysis?.con?.arguments?.length || 0,
          hasAssumptions: (transcript.structured_analysis?.con?.assumptions?.length || 0) > 0,
          hasUncertainties:
            (transcript.structured_analysis?.con?.uncertainties?.length || 0) > 0,
        },
        moderator: {
          agreementCount:
            transcript.structured_analysis?.moderator?.areas_of_agreement?.length || 0,
          disagreementCount:
            transcript.structured_analysis?.moderator?.core_disagreements?.length || 0,
          decisionHingeCount:
            transcript.structured_analysis?.moderator?.decision_hinges?.length || 0,
        },
        interventions: transcript.user_interventions?.length || 0,
        utterances: transcript.transcript?.length || 0,
      },
    };

    logger.info({ debateId }, 'Export preview generated');
    res.json(preview);
  } catch (error) {
    logger.error({ error, debateId }, 'Error processing export preview request');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      debateId,
    });
  }
});

// ============================================================================
// AUDIO EXPORT ROUTES
// ============================================================================

/**
 * GET /exports/audio/providers
 * Get list of available TTS providers
 *
 * Returns provider info with availability status based on configured API keys
 */
router.get('/exports/audio/providers', async (_req: Request, res: Response) => {
  try {
    const providers = getProvidersWithStatus();
    const defaultProvider = getDefaultProvider();

    res.json({
      providers,
      defaultProvider,
      availableProviders: getAvailableProviders(),
    });
  } catch (error) {
    logger.error({ error }, 'Error getting TTS providers');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /exports/:debateId/audio
 * Start an audio export job
 *
 * Request body (optional):
 * - provider: 'elevenlabs' | 'gemini' | 'google-cloud' | 'azure' | 'edge' (default: auto-detect)
 * - format: 'mp3' | 'wav' | 'ogg' (default: 'mp3')
 * - includeBackgroundMusic: boolean (default: false)
 * - backgroundMusicVolume: number 0-1 (default: 0.1)
 * - voiceSpeed: number 0.5-2.0 (default: 1.0)
 * - includeIntroOutro: boolean (default: true)
 * - normalizeAudio: boolean (default: true)
 *
 * Returns: { jobId, status, message, provider }
 */
router.post('/exports/:debateId/audio', async (req: Request, res: Response) => {
  const { debateId } = req.params;
  const requestedProvider = req.body.provider as TTSProvider | undefined;

  logger.info({ debateId, requestedProvider }, 'Audio export requested');

  try {
    // Determine which provider to use
    const provider = requestedProvider || getDefaultProvider();

    // Check if the requested provider is available
    if (!isProviderAvailable(provider)) {
      const available = getAvailableProviders();
      const providerInfo = getProvidersWithStatus().find((p) => p.id === provider);

      logger.error({ provider, available }, 'Requested TTS provider not available');
      res.status(503).json({
        error: 'TTS provider not available',
        message: providerInfo?.requiresApiKey
          ? `${providerInfo.name} requires ${providerInfo.envVar} environment variable to be set.`
          : `${provider} is not available.`,
        provider,
        availableProviders: available,
        debateId,
      });
      return;
    }

    // Load transcript
    const transcript = await transcriptRecorder.loadTranscript(debateId!);

    if (!transcript) {
      logger.warn({ debateId }, 'Transcript not found for audio export');
      res.status(404).json({
        error: 'Transcript not found',
        debateId,
        message: 'No transcript exists for this debate. Has the debate completed?',
      });
      return;
    }

    // Parse export options from request body
    const options: Partial<AudioExportOptions> = {
      format: req.body.format || 'mp3',
      includeBackgroundMusic: req.body.includeBackgroundMusic === true,
      backgroundMusicVolume: req.body.backgroundMusicVolume || 0.1,
      voiceSpeed: req.body.voiceSpeed || 1.0,
      includeIntroOutro: req.body.includeIntroOutro !== false,
      normalizeAudio: req.body.normalizeAudio !== false,
    };

    // Start export job with selected provider
    const orchestrator = getAudioOrchestrator(provider);
    const jobId = await orchestrator.startExport(transcript, options);

    logger.info({ debateId, jobId, provider }, 'Audio export job started');

    res.status(202).json({
      jobId,
      debateId,
      provider,
      status: 'pending',
      message: `Audio export job started using ${provider}. Use GET /exports/audio/:jobId/status to check progress.`,
      statusUrl: `/api/exports/audio/${jobId}/status`,
    });
  } catch (error) {
    logger.error({ error, debateId }, 'Error starting audio export');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      debateId,
    });
  }
});

/**
 * GET /exports/audio/:jobId/status
 * Get audio export job status
 *
 * Returns job details including progress percentage
 */
router.get('/exports/audio/:jobId/status', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const orchestrator = getAudioOrchestrator();
    const job = orchestrator.getJobStatus(jobId!);

    if (!job) {
      res.status(404).json({
        error: 'Job not found',
        jobId,
      });
      return;
    }

    res.json({
      jobId: job.id,
      debateId: job.debateId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      ...(job.status === 'completed' && {
        downloadUrl: `/api/exports/audio/${jobId}/download`,
        fileSizeBytes: job.fileSizeBytes,
        durationSeconds: job.durationSeconds,
      }),
      ...(job.status === 'failed' && {
        error: job.error,
      }),
    });
  } catch (error) {
    logger.error({ error, jobId }, 'Error getting audio job status');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      jobId,
    });
  }
});

/**
 * GET /exports/audio/:jobId/download
 * Download completed audio export
 *
 * Returns the MP3 file
 */
router.get('/exports/audio/:jobId/download', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const orchestrator = getAudioOrchestrator();
    const job = orchestrator.getJobStatus(jobId!);

    if (!job) {
      res.status(404).json({
        error: 'Job not found',
        jobId,
      });
      return;
    }

    if (job.status !== 'completed') {
      res.status(400).json({
        error: 'Job not complete',
        jobId,
        status: job.status,
        progress: job.progress,
        message: job.status === 'processing'
          ? `Export in progress: ${job.progress}% (${job.stage})`
          : `Export ${job.status}`,
      });
      return;
    }

    if (!job.outputPath) {
      res.status(500).json({
        error: 'Output file not found',
        jobId,
      });
      return;
    }

    // Check file exists
    try {
      await fs.access(job.outputPath);
    } catch {
      res.status(404).json({
        error: 'Output file not found',
        jobId,
        message: 'The export file may have been deleted',
      });
      return;
    }

    // Generate filename
    const filename = `debate-${job.debateId}-audio.mp3`;

    logger.info({ jobId, debateId: job.debateId }, 'Audio download started');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', job.fileSizeBytes || 0);

    // Stream the file
    const fileStream = await fs.open(job.outputPath, 'r');
    const stream = fileStream.createReadStream();

    stream.pipe(res);

    stream.on('end', () => {
      fileStream.close();
    });

    stream.on('error', (err) => {
      logger.error({ error: err, jobId }, 'Error streaming audio file');
      fileStream.close();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
  } catch (error) {
    logger.error({ error, jobId }, 'Error downloading audio');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      jobId,
    });
  }
});

/**
 * DELETE /exports/audio/:jobId
 * Delete an audio export job and its file
 */
router.delete('/exports/audio/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const orchestrator = getAudioOrchestrator();
    const deleted = await orchestrator.deleteJob(jobId!);

    if (!deleted) {
      res.status(404).json({
        error: 'Job not found',
        jobId,
      });
      return;
    }

    logger.info({ jobId }, 'Audio job deleted');

    res.json({
      success: true,
      jobId,
      message: 'Job and associated files deleted',
    });
  } catch (error) {
    logger.error({ error, jobId }, 'Error deleting audio job');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
      jobId,
    });
  }
});

/**
 * GET /exports/audio/jobs
 * List all audio export jobs
 *
 * Query parameters:
 * - status: Filter by status (pending, processing, completed, failed)
 * - debateId: Filter by debate ID
 */
router.get('/exports/audio/jobs', async (req: Request, res: Response) => {
  try {
    const orchestrator = getAudioOrchestrator();
    let jobs = orchestrator.listJobs();

    // Filter by status
    if (req.query.status) {
      jobs = jobs.filter((j) => j.status === req.query.status);
    }

    // Filter by debate ID
    if (req.query.debateId) {
      jobs = jobs.filter((j) => j.debateId === req.query.debateId);
    }

    // Sort by creation time (newest first)
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      jobs: jobs.map((job) => ({
        jobId: job.id,
        debateId: job.debateId,
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        ...(job.status === 'completed' && {
          downloadUrl: `/api/exports/audio/${job.id}/download`,
          fileSizeBytes: job.fileSizeBytes,
          durationSeconds: job.durationSeconds,
        }),
        ...(job.status === 'failed' && {
          error: job.error,
        }),
      })),
      total: jobs.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing audio jobs');
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
