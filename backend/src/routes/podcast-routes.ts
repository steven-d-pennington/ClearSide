import { Router, Request, Response } from 'express';
import path from 'path';
import { PodcastScriptRefiner } from '../services/podcast/script-refiner.js';
import { createPodcastPipeline, PipelineProgress } from '../services/podcast/podcast-pipeline.js';
import * as podcastRepo from '../db/repositories/podcast-export-repository.js';
import { PodcastTTSClient } from '../services/podcast/podcast-tts-client.js';
import { VoiceValidator } from '../services/podcast/voice-validator.js';
import { OpenRouterLLMClient } from '../services/llm/openrouter-adapter.js';
import * as debateRepo from '../db/repositories/debate-repository.js';
import * as utteranceRepo from '../db/repositories/utterance-repository.js';
import * as interventionRepo from '../db/repositories/intervention-repository.js';
import { createTranscriptRecorder } from '../services/transcript/transcript-recorder.js';
import { schemaValidator } from '../services/validation/index.js';
import { createLogger } from '../utils/logger.js';
import {
    PodcastExportConfig,
    RefinedPodcastScript,
    PodcastSegment,
    DEFAULT_VOICE_ASSIGNMENTS,
    ElevenLabsModel,
    AudioOutputFormat
} from '../types/podcast-export.js';
import { DebateTranscript } from '../services/transcript/transcript-recorder.js';

const router = Router();
const logger = createLogger({ module: 'PodcastRoutes' });
const transcriptRecorder = createTranscriptRecorder(schemaValidator);

/**
 * Helper to build transcript on-the-fly (copied from ExportRoutes)
 */
async function buildTranscriptFromUtterances(debateId: string): Promise<DebateTranscript | null> {
    const debate = await debateRepo.findById(debateId);
    if (!debate) return null;

    const utterances = await utteranceRepo.findByDebateId(debateId);
    if (utterances.length === 0) return null;

    const interventions = await interventionRepo.findByDebateId(debateId);

    // Convert speaker from database format to schema format
    const mapSpeaker = (s: string) => {
        const map: Record<string, string> = {
            'pro_advocate': 'pro',
            'con_advocate': 'con',
            'moderator': 'moderator',
        };
        return map[s] || s;
    };

    // Convert phase from database format to schema format
    const mapPhase = (p: string) => {
        const map: Record<string, string> = {
            'opening_statements': 'phase_1_opening',
            'evidence_presentation': 'phase_2_constructive',
            'clarifying_questions': 'phase_3_crossexam',
            'rebuttals': 'phase_4_rebuttal',
            'closing_statements': 'phase_5_closing',
            'synthesis': 'phase_6_synthesis',
        };
        return map[p] || p;
    };

    // Calculate duration in seconds
    const durationMs = debate.totalDurationMs || 0;
    const durationSeconds = Math.round(durationMs / 1000);

    // Build transcript in the format expected by markdown exporter
    return {
        meta: {
            schema_version: '2.0.0',
            debate_id: debateId,
            generated_at: new Date().toISOString(),
            debate_format: 'standard',
            total_duration_seconds: durationSeconds,
            status: debate.status,
        },
        proposition: {
            raw_input: debate.propositionText,
            normalized_question: debate.propositionText,
            context: debate.propositionContext ? JSON.stringify(debate.propositionContext) : undefined,
        },
        transcript: utterances.map((u) => ({
            id: String(u.id),
            timestamp_ms: u.timestampMs,
            phase: mapPhase(u.phase),
            speaker: mapSpeaker(u.speaker),
            content: u.content,
            metadata: (u.metadata as Record<string, unknown>) || {},
        })),
        structured_analysis: {
            pro: { executive_summary: 'Analysis not yet generated', arguments: [], assumptions: [], uncertainties: [] },
            con: { executive_summary: 'Analysis not yet generated', arguments: [], assumptions: [], uncertainties: [] },
            moderator: { areas_of_agreement: [], core_disagreements: [], assumption_conflicts: [], evidence_gaps: [], decision_hinges: [] },
        },
        user_interventions: interventions.map((i) => ({
            id: String(i.id),
            timestamp_ms: i.timestampMs,
            phase: 'unknown',
            type: i.interventionType,
            content: i.content,
            metadata: {
                directed_to: i.directedTo,
                response: i.response,
                response_timestamp_ms: i.responseTimestampMs,
            },
        })),
    } as DebateTranscript;
}

/**
 * POST /api/exports/podcast/refine
 * Generate a refined podcast script from a debate (preview before TTS)
 */
router.post('/refine', async (req: Request, res: Response): Promise<void> => {
    try {
        const { debateId, config } = req.body as {
            debateId: string;
            config: Partial<PodcastExportConfig>;
        };

        if (!debateId) {
            res.status(400).json({ error: 'debateId is required' });
            return;
        }

        // Validate debate exists
        const debate = await debateRepo.findById(debateId);
        if (!debate) {
            res.status(404).json({ error: 'Debate not found' });
            return;
        }

        // Build full config with defaults
        const fullConfig: PodcastExportConfig = {
            refinementModel: config.refinementModel || 'openai/gpt-4o-mini',
            includeIntro: config.includeIntro ?? true,
            includeOutro: config.includeOutro ?? true,
            addTransitions: config.addTransitions ?? true,
            elevenLabsModel: (config.elevenLabsModel || 'eleven_v3') as ElevenLabsModel,
            outputFormat: (config.outputFormat || 'mp3_44100_128') as AudioOutputFormat,
            voiceAssignments: {
                ...DEFAULT_VOICE_ASSIGNMENTS,
                ...config.voiceAssignments,
            },
            useCustomPronunciation: config.useCustomPronunciation ?? false,
            pronunciationDictionaryId: config.pronunciationDictionaryId,
            normalizeVolume: config.normalizeVolume ?? true,
        };

        // Create job record
        const job = await podcastRepo.create(debateId, fullConfig);

        // Update status to refining
        await podcastRepo.updateStatus(job.id, 'refining');

        // Load transcript
        let transcript = await transcriptRecorder.loadTranscript(debateId);
        if (!transcript) {
            transcript = await buildTranscriptFromUtterances(debateId);
        }

        if (!transcript) {
            await podcastRepo.updateStatus(job.id, 'error', 'No transcript available for this debate');
            res.status(404).json({ error: 'No transcript available for this debate' });
            return;
        }

        // Refine the script
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error('OPENROUTER_API_KEY is not configured');
        }
        const llmClient = new OpenRouterLLMClient(fullConfig.refinementModel, apiKey);
        const refiner = new PodcastScriptRefiner(llmClient, fullConfig);
        const refinedScript = await refiner.refineTranscript(transcript);

        // Save refined script
        await podcastRepo.saveRefinedScript(job.id, refinedScript);
        await podcastRepo.updateStatus(job.id, 'pending'); // Ready for TTS

        // Calculate cost estimate
        const estimatedCostCents = PodcastTTSClient.estimateCostCents(
            refinedScript.totalCharacters
        );

        res.json({
            jobId: job.id,
            script: refinedScript,
            estimatedCostCents,
            estimatedDurationMinutes: Math.round(refinedScript.durationEstimateSeconds / 60),
        });

    } catch (error: any) {
        logger.error({ error }, 'Script refinement error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/exports/podcast/voices
 * Get available voices for assignment
 */
router.get('/voices', async (_req: Request, res: Response): Promise<void> => {
    try {
        const ttsApiKey = process.env.ELEVENLABS_API_KEY;
        if (!ttsApiKey) {
            throw new Error('ELEVENLABS_API_KEY is not configured');
        }
        const ttsClient = new PodcastTTSClient(ttsApiKey);
        const validator = new VoiceValidator(ttsClient);

        const voices = await validator.getRecommendedVoices();

        res.json({ voices });

    } catch (error: any) {
        const errorMessage = error?.message || error?.response?.data?.detail || String(error);
        logger.error({ error: errorMessage, stack: error?.stack }, 'Get voices error');
        res.status(500).json({ error: errorMessage });
    }
});

/**
 * POST /api/exports/podcast/preview-voice
 * Generate a short voice preview sample
 */
router.post('/preview-voice', async (req: Request, res: Response): Promise<void> => {
    try {
        const { voiceId, text } = req.body as {
            voiceId: string;
            text?: string;
        };

        if (!voiceId) {
            res.status(400).json({ error: 'voiceId is required' });
            return;
        }

        const sampleText = text || 'This is a sample of how I sound. I hope you like my voice for your podcast.';

        if (sampleText.length > 500) {
            res.status(400).json({ error: 'Preview text must be under 500 characters' });
            return;
        }

        const ttsApiKey = process.env.ELEVENLABS_API_KEY;
        if (!ttsApiKey) {
            throw new Error('ELEVENLABS_API_KEY is not configured');
        }
        const ttsClient = new PodcastTTSClient(ttsApiKey);

        const response = await ttsClient.generateSegmentAudio(
            {
                index: 0,
                speaker: 'preview',
                voiceId,
                text: sampleText,
                voiceSettings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    speed: 1.0,
                    use_speaker_boost: true,
                },
            },
            {
                modelId: 'eleven_flash_v2_5', // Fast model for previews
                outputFormat: 'mp3_44100_128',
            }
        );

        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': response.audio.length,
        });
        res.send(response.audio);

    } catch (error: any) {
        logger.error({ error }, 'Voice preview error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/exports/podcast/:jobId
 * Get podcast export job details including refined script
 */
router.get('/:jobId', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        // Add cost estimate if script exists
        let estimatedCostCents: number | undefined;
        if (job.refinedScript) {
            estimatedCostCents = PodcastTTSClient.estimateCostCents(
                job.refinedScript.totalCharacters
            );
        }

        res.json({
            ...job,
            estimatedCostCents,
        });

    } catch (error: any) {
        logger.error({ error }, 'Get job error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/exports/podcast/:jobId/script
 * Update the refined script (edit segments)
 */
router.put('/:jobId/script', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;
        const { segments, intro, outro } = req.body as {
            segments?: PodcastSegment[];
            intro?: PodcastSegment;
            outro?: PodcastSegment;
        };

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (job.status !== 'pending' && job.status !== 'refining') {
            res.status(400).json({
                error: 'Cannot edit script after generation has started'
            });
            return;
        }

        if (!job.refinedScript) {
            res.status(400).json({ error: 'No script to edit' });
            return;
        }

        // Validate segment lengths
        const modelLimit = PodcastTTSClient.getModelCharLimit(job.config.elevenLabsModel);
        const allSegments = [intro, ...(segments || []), outro].filter((s): s is PodcastSegment => !!s);

        for (const segment of allSegments) {
            if (segment.text.length > modelLimit) {
                res.status(400).json({
                    error: `Segment ${segment.index} exceeds ${modelLimit} character limit`,
                });
                return;
            }
        }

        // Update script
        const updatedScript: RefinedPodcastScript = {
            ...job.refinedScript,
            segments: segments || job.refinedScript.segments,
            intro: intro !== undefined ? intro : job.refinedScript.intro,
            outro: outro !== undefined ? outro : job.refinedScript.outro,
            updatedAt: new Date(),
        };

        // Recalculate totals
        const finalSegments = [
            updatedScript.intro,
            ...updatedScript.segments,
            updatedScript.outro
        ].filter((s): s is PodcastSegment => !!s);

        updatedScript.totalCharacters = finalSegments.reduce(
            (sum, s) => sum + s.text.length, 0
        );

        const wordCount = finalSegments.reduce(
            (sum, s) => sum + s.text.split(/\s+/).length, 0
        );
        updatedScript.durationEstimateSeconds = Math.round((wordCount / 150) * 60);

        await podcastRepo.saveRefinedScript(jobId!, updatedScript);

        res.json({
            script: updatedScript,
            estimatedCostCents: PodcastTTSClient.estimateCostCents(
                updatedScript.totalCharacters
            ),
        });

    } catch (error: any) {
        logger.error({ error }, 'Update script error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/exports/podcast/:jobId/regenerate-segment
 * Regenerate a specific segment using LLM
 */
router.post('/:jobId/regenerate-segment', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;
        const { segmentIndex, instructions } = req.body as {
            segmentIndex: number;
            instructions?: string;
        };

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (!job.refinedScript) {
            res.status(400).json({ error: 'No script to regenerate' });
            return;
        }

        // Find the segment
        const allSegments = [
            job.refinedScript.intro,
            ...job.refinedScript.segments,
            job.refinedScript.outro
        ].filter((s): s is PodcastSegment => !!s);

        const segment = allSegments.find(s => s.index === segmentIndex);
        if (!segment) {
            res.status(404).json({ error: 'Segment not found' });
            return;
        }

        // Regenerate using LLM
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error('OPENROUTER_API_KEY is not configured');
        }
        const llmClient = new OpenRouterLLMClient(job.config.refinementModel, apiKey);

        const prompt = instructions
            ? `Rewrite this podcast segment following these instructions: ${instructions}\n\nOriginal:\n${segment.text}`
            : `Improve this podcast segment for better spoken delivery:\n\n${segment.text}`;

        const response = await llmClient.complete({
            messages: [
                {
                    role: 'system',
                    content: 'You are a podcast script editor. Rewrite the given text for natural spoken delivery. Output only the rewritten text, no explanations. Remove all markdown formatting.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.6,
            maxTokens: 2000,
        });

        // Update the segment
        segment.text = response.content.trim();

        // Recalculate totals
        job.refinedScript.totalCharacters = allSegments.reduce(
            (sum, s) => sum + s.text.length, 0
        );
        job.refinedScript.updatedAt = new Date();

        await podcastRepo.saveRefinedScript(jobId!, job.refinedScript);

        res.json({
            segment,
            estimatedCostCents: PodcastTTSClient.estimateCostCents(
                job.refinedScript.totalCharacters
            ),
        });

    } catch (error: any) {
        logger.error({ error }, 'Regenerate segment error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/exports/podcast/:jobId/segment/:segmentIndex
 * Delete a segment from the script
 */
router.delete('/:jobId/segment/:segmentIndex', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId, segmentIndex } = req.params;
        const index = parseInt(segmentIndex!, 10);

        const job = await podcastRepo.findById(jobId!);

        if (!job || !job.refinedScript) {
            res.status(404).json({ error: 'Job or script not found' });
            return;
        }

        if (job.status !== 'pending' && job.status !== 'refining') {
            res.status(400).json({ error: 'Cannot delete segments after generation started' });
            return;
        }

        if (index < 0 || index >= job.refinedScript.segments.length) {
            res.status(400).json({ error: 'Invalid segment index' });
            return;
        }

        // Remove segment
        job.refinedScript.segments.splice(index, 1);

        // Reindex remaining segments
        let currentIndex = job.refinedScript.intro ? 1 : 0;
        job.refinedScript.segments.forEach((seg) => {
            seg.index = currentIndex++;
        });
        if (job.refinedScript.outro) {
            job.refinedScript.outro.index = currentIndex;
        }

        // Recalculate totals
        const allSegments = [
            job.refinedScript.intro,
            ...job.refinedScript.segments,
            job.refinedScript.outro
        ].filter((s): s is PodcastSegment => !!s);

        job.refinedScript.totalCharacters = allSegments.reduce(
            (sum, s) => sum + s.text.length, 0
        );
        job.refinedScript.updatedAt = new Date();

        await podcastRepo.saveRefinedScript(jobId!, job.refinedScript);

        res.json({
            script: job.refinedScript,
            estimatedCostCents: PodcastTTSClient.estimateCostCents(
                job.refinedScript.totalCharacters
            ),
        });

    } catch (error: any) {
        logger.error({ error }, 'Delete segment error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/exports/podcast/:jobId/generate
 * Start TTS generation for a refined script
 */
router.post('/:jobId/generate', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (!job.refinedScript) {
            res.status(400).json({ error: 'No refined script - call /refine first' });
            return;
        }

        if (job.status === 'generating') {
            res.status(400).json({ error: 'Generation already in progress' });
            return;
        }

        if (job.status === 'complete') {
            res.status(400).json({
                error: 'Podcast already generated',
                audioUrl: job.audioUrl,
            });
            return;
        }

        // Start generation in background
        const pipeline = createPodcastPipeline();

        // Non-blocking - return immediately with job ID
        pipeline.generate(jobId!).catch(err => {
            logger.error({ jobId, error: err.message }, 'Pipeline background error');
        });

        res.json({
            jobId,
            status: 'generating',
            message: 'Podcast generation started',
            estimatedSegments: job.totalSegments,
        });

    } catch (error: any) {
        logger.error({ error }, 'Start generation error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/exports/podcast/:jobId/progress
 * Get generation progress (for polling)
 */
router.get('/:jobId/progress', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        res.json({
            jobId,
            status: job.status,
            progressPercent: job.progressPercent,
            currentSegment: job.currentSegment,
            totalSegments: job.totalSegments,
            audioUrl: job.audioUrl,
            durationSeconds: job.durationSeconds,
            actualCostCents: job.actualCostCents,
            errorMessage: job.errorMessage,
        });

    } catch (error: any) {
        logger.error({ error }, 'Get progress error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/exports/podcast/:jobId/download
 * Download the generated podcast
 */
router.get('/:jobId/download', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (job.status !== 'complete' || !job.audioUrl) {
            res.status(400).json({ error: 'Podcast not ready for download' });
            return;
        }

        // Convert URL path to file system path
        const filePath = path.join(process.cwd(), job.audioUrl.replace(/^\//, ''));

        res.download(filePath, `podcast-${job.debateId}.mp3`);

    } catch (error: any) {
        logger.error({ error }, 'Download error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/exports/podcast/:jobId/stream
 * Stream generation progress via SSE
 */
router.get('/:jobId/stream', async (req: Request, res: Response): Promise<void> => {
    const { jobId } = req.params;

    // Check job exists first
    const job = await podcastRepo.findById(jobId!);
    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }

    if (!job.refinedScript) {
        res.status(400).json({ error: 'No refined script - call /refine first' });
        return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ phase: 'connected', message: 'Connected to progress stream' })}\n\n`);

    const pipeline = createPodcastPipeline();

    // Send progress updates
    const progressHandler = (progress: PipelineProgress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);

        if (progress.phase === 'complete' || progress.phase === 'error') {
            res.end();
        }
    };

    pipeline.on('progress', progressHandler);

    // Handle client disconnect
    req.on('close', () => {
        pipeline.removeListener('progress', progressHandler);
    });

    // Start generation
    pipeline.generate(jobId!).catch(err => {
        res.write(`data: ${JSON.stringify({ phase: 'error', message: err.message })}\n\n`);
        res.end();
    });
});

/**
 * DELETE /api/exports/podcast/:jobId/temp
 * Manually clean up temporary files for a job (for failed jobs with partial segments)
 */
router.delete('/:jobId/temp', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const job = await podcastRepo.findById(jobId!);

        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        // Build temp directory path
        const tempDir = process.env.TEMP_DIR || './temp/podcasts';
        const workDir = path.join(tempDir, jobId!);

        let filesDeleted = 0;
        try {
            const fsPromises = await import('fs/promises');
            const files = await fsPromises.readdir(workDir);
            filesDeleted = files.length;

            // Delete all files in the directory
            for (const file of files) {
                await fsPromises.unlink(path.join(workDir, file));
            }

            // Remove the directory itself
            await fsPromises.rmdir(workDir);

            logger.info({ jobId, filesDeleted, workDir }, 'Manually cleaned up temp files');
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // Directory doesn't exist - that's OK
                res.json({
                    jobId,
                    message: 'No temp files found (already cleaned up)',
                    filesDeleted: 0,
                });
                return;
            }
            throw error;
        }

        res.json({
            jobId,
            message: 'Temp files cleaned up successfully',
            filesDeleted,
        });

    } catch (error: any) {
        logger.error({ error }, 'Cleanup temp files error');
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/exports/podcast/:jobId/recover
 * Recover audio segments from ElevenLabs history API
 * This can save money if generation failed after TTS but before concatenation
 */
router.post('/:jobId/recover', async (req: Request, res: Response): Promise<void> => {
    try {
        const { jobId } = req.params;

        const job = await podcastRepo.findById(jobId!);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        if (!job.refinedScript) {
            res.status(400).json({ error: 'No refined script available' });
            return;
        }

        const ttsApiKey = process.env.ELEVENLABS_API_KEY;
        if (!ttsApiKey) {
            res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
            return;
        }

        // Get all segments from the script
        const allSegments = [
            job.refinedScript.intro,
            ...job.refinedScript.segments,
            job.refinedScript.outro
        ].filter((s): s is import('../types/podcast-export.js').PodcastSegment => !!s);

        // Fetch history from ElevenLabs (get enough to cover all segments)
        const axios = (await import('axios')).default;
        const historyResponse = await axios.get('https://api.elevenlabs.io/v1/history', {
            headers: { 'xi-api-key': ttsApiKey },
            params: { page_size: Math.min(allSegments.length + 10, 100) }
        });

        const historyItems = historyResponse.data.history as Array<{
            history_item_id: string;
            text: string;
            voice_id: string;
            date_unix: number;
        }>;

        logger.info({ jobId, historyCount: historyItems.length, segmentCount: allSegments.length },
            'Fetched ElevenLabs history for recovery');

        // Create temp directory
        const tempDir = process.env.TEMP_DIR || './temp/podcasts';
        const workDir = path.join(tempDir, jobId!);
        const fsPromises = await import('fs/promises');
        await fsPromises.mkdir(workDir, { recursive: true });

        // Match history items to segments by text content
        const recovered: Array<{ index: number; historyId: string; text: string }> = [];
        const notFound: number[] = [];

        for (let i = 0; i < allSegments.length; i++) {
            const segment = allSegments[i];
            if (!segment) continue;

            // Find matching history item by text (trim and compare)
            const segmentText = segment.text.trim().substring(0, 100);
            const match = historyItems.find(h => h.text.trim().startsWith(segmentText));

            if (match) {
                // Download the audio file
                const audioResponse = await axios.get(
                    `https://api.elevenlabs.io/v1/history/${match.history_item_id}/audio`,
                    {
                        headers: { 'xi-api-key': ttsApiKey },
                        responseType: 'arraybuffer'
                    }
                );

                const audioFile = path.join(workDir, `segment-${i.toString().padStart(4, '0')}.mp3`);
                await fsPromises.writeFile(audioFile, Buffer.from(audioResponse.data));

                recovered.push({
                    index: i,
                    historyId: match.history_item_id,
                    text: segment.text.substring(0, 50) + '...'
                });

                logger.debug({ jobId, segmentIndex: i, historyId: match.history_item_id },
                    'Recovered segment from history');
            } else {
                notFound.push(i);
            }
        }

        // Reset job status to pending so it can be resumed
        if (recovered.length > 0) {
            await podcastRepo.updateStatus(jobId!, 'pending');
        }

        logger.info({ jobId, recoveredCount: recovered.length, notFoundCount: notFound.length },
            'Recovery complete');

        res.json({
            jobId,
            message: `Recovered ${recovered.length} of ${allSegments.length} segments from ElevenLabs history`,
            recovered: recovered.length,
            total: allSegments.length,
            notFound: notFound.length > 0 ? notFound : undefined,
            recoveredSegments: recovered,
            nextStep: recovered.length === allSegments.length
                ? 'All segments recovered! You can now retry generation - it will skip TTS and go straight to concatenation.'
                : `${notFound.length} segments not found in history. Retry generation to regenerate missing segments.`
        });

    } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Recovery error');
        res.status(500).json({ error: error.message });
    }
});

export default router;
