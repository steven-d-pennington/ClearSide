/**
 * Export Routes
 * Express routes for exporting debate transcripts to various formats
 */

import express, { type Request, type Response } from 'express';
import { createMarkdownExporter } from '../services/export/markdownExporter.js';
import { createTranscriptRecorder } from '../services/transcript/transcript-recorder.js';
import { schemaValidator } from '../services/validation/schema-validator.js';
import { createLogger } from '../utils/logger.js';
import type { MarkdownExportOptions } from '../services/export/types.js';

const router = express.Router();
const logger = createLogger({ module: 'ExportRoutes' });

// Initialize services
const transcriptRecorder = createTranscriptRecorder(schemaValidator);
const markdownExporter = createMarkdownExporter();

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
      availableFormats: ['markdown'], // Will expand with PDF, audio, video
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

export default router;
