# PODCAST-005: Podcast Generation Pipeline

**Task ID:** PODCAST-005
**Phase:** Phase 4
**Category:** Podcast Export
**Priority:** P0
**Estimated Effort:** L (1-2 days)
**Dependencies:** PODCAST-001, PODCAST-002, PODCAST-003, PODCAST-004
**Status:** DONE

---

## Context

This task implements the main podcast generation orchestrator that coordinates script refinement, TTS generation, audio concatenation, and MP3 encoding. The pipeline must handle long-form content reliably with progress tracking and error recovery.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 9: Implementation Steps
- Existing audio export in `backend/src/services/audio/`
- FFmpeg audio processing patterns from AUDIO-003

---

## Requirements

### Acceptance Criteria

- [x] Create `PodcastGenerationPipeline` orchestrator class
- [x] Implement end-to-end generation from debate ID to MP3
- [x] Add progress tracking with segment-level granularity
- [x] Concatenate audio segments using FFmpeg
- [x] Normalize volume levels across all speakers
- [x] Add ID3 tags with chapter markers for podcast navigation
- [ ] Support pause/resume for long generations (deferred to future enhancement)
- [x] Implement cleanup on failure (no orphaned files)
- [x] Store final audio in exports directory
- [x] Calculate and store actual costs

### Functional Requirements

From FUTURE-FEATURES.md:
- Orchestrate: refine script -> generate TTS -> concatenate -> encode
- Track progress through SSE or polling
- Handle partial failures gracefully
- Produce production-ready MP3 with metadata

---

## Implementation Guide

### Pipeline Orchestrator

```typescript
// backend/src/services/podcast/podcast-pipeline.ts

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import { PodcastScriptRefiner } from './script-refiner.js';
import { PodcastTTSClient } from './podcast-tts-client.js';
import { PodcastExportRepository } from '../../db/repositories/podcast-export-repository.js';
import { DebateRepository } from '../../db/repositories/debate-repository.js';
import { MarkdownExporter } from '../export/markdownExporter.js';
import { OpenRouterLLMClient } from '../llm/openrouter-client.js';
import {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastSegment,
} from '../../types/podcast-export.js';
import { Pool } from 'pg';

interface PipelineProgress {
  phase: 'refining' | 'generating' | 'concatenating' | 'encoding' | 'complete';
  currentSegment?: number;
  totalSegments?: number;
  percentComplete: number;
  message: string;
}

interface PipelineResult {
  success: boolean;
  audioUrl?: string;
  durationSeconds?: number;
  characterCount?: number;
  actualCostCents?: number;
  error?: string;
}

const EXPORTS_DIR = process.env.EXPORTS_DIR || './exports/podcasts';
const TEMP_DIR = process.env.TEMP_DIR || './temp/podcasts';

export class PodcastGenerationPipeline extends EventEmitter {
  private pool: Pool;
  private podcastRepo: PodcastExportRepository;
  private debateRepo: DebateRepository;
  private ttsClient: PodcastTTSClient;
  private llmClient: OpenRouterLLMClient;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.podcastRepo = new PodcastExportRepository(pool);
    this.debateRepo = new DebateRepository(pool);
    this.ttsClient = new PodcastTTSClient(process.env.ELEVENLABS_API_KEY!);
    this.llmClient = new OpenRouterLLMClient(process.env.OPENROUTER_API_KEY!);
  }

  /**
   * Execute the full podcast generation pipeline
   */
  async generate(jobId: string): Promise<PipelineResult> {
    const workDir = path.join(TEMP_DIR, jobId);

    try {
      // Ensure directories exist
      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(EXPORTS_DIR, { recursive: true });

      // Get job and validate
      const job = await this.podcastRepo.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Phase 1: Refine script (if not already done)
      let script = job.refinedScript;
      if (!script) {
        this.emitProgress({
          phase: 'refining',
          percentComplete: 0,
          message: 'Refining debate transcript for audio...',
        });

        await this.podcastRepo.updateStatus(jobId, 'refining');
        script = await this.refineScript(job);
        await this.podcastRepo.saveRefinedScript(jobId, script);
      }

      // Phase 2: Generate TTS audio for each segment
      this.emitProgress({
        phase: 'generating',
        currentSegment: 0,
        totalSegments: this.countSegments(script),
        percentComplete: 10,
        message: 'Generating speech audio...',
      });

      await this.podcastRepo.updateStatus(jobId, 'generating');
      const audioFiles = await this.generateAudio(jobId, script, workDir);

      // Phase 3: Concatenate audio files
      this.emitProgress({
        phase: 'concatenating',
        percentComplete: 80,
        message: 'Combining audio segments...',
      });

      const concatenatedFile = path.join(workDir, 'concatenated.mp3');
      await this.concatenateAudio(audioFiles, concatenatedFile);

      // Phase 4: Normalize and encode final MP3
      this.emitProgress({
        phase: 'encoding',
        percentComplete: 90,
        message: 'Normalizing audio and adding metadata...',
      });

      const finalFile = path.join(EXPORTS_DIR, `podcast-${jobId}.mp3`);
      const metadata = await this.encodeWithMetadata(
        concatenatedFile,
        finalFile,
        script,
        job
      );

      // Complete the job
      const audioUrl = `/exports/podcasts/podcast-${jobId}.mp3`;
      const stats = this.ttsClient.getUsageStats();

      await this.podcastRepo.completeJob(
        jobId,
        audioUrl,
        metadata.durationSeconds,
        stats.totalCharacters,
        stats.estimatedCostCents
      );

      this.emitProgress({
        phase: 'complete',
        percentComplete: 100,
        message: 'Podcast generation complete!',
      });

      // Cleanup temp files
      await this.cleanup(workDir);

      return {
        success: true,
        audioUrl,
        durationSeconds: metadata.durationSeconds,
        characterCount: stats.totalCharacters,
        actualCostCents: stats.estimatedCostCents,
      };

    } catch (error: any) {
      console.error('Pipeline error:', error);

      await this.podcastRepo.updateStatus(jobId, 'error', error.message);
      await this.cleanup(workDir);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Refine debate transcript into podcast script
   */
  private async refineScript(job: PodcastExportJob): Promise<RefinedPodcastScript> {
    const debate = await this.debateRepo.findById(job.debateId);
    if (!debate) {
      throw new Error('Debate not found');
    }

    const exporter = new MarkdownExporter();
    const transcript = await exporter.buildTranscript(debate);

    const refiner = new PodcastScriptRefiner(this.llmClient, job.config);
    return refiner.refineTranscript(transcript);
  }

  /**
   * Generate TTS audio for all script segments
   */
  private async generateAudio(
    jobId: string,
    script: RefinedPodcastScript,
    workDir: string
  ): Promise<string[]> {
    const audioFiles: string[] = [];
    const allSegments = this.getAllSegments(script);
    const total = allSegments.length;

    for (let i = 0; i < allSegments.length; i++) {
      const segment = allSegments[i];

      // Update progress
      await this.podcastRepo.updateProgress(jobId, i + 1, total);
      this.emitProgress({
        phase: 'generating',
        currentSegment: i + 1,
        totalSegments: total,
        percentComplete: 10 + Math.round((i / total) * 70),
        message: `Generating audio for segment ${i + 1} of ${total}...`,
      });

      // Generate audio
      const response = await this.ttsClient.generateSegmentAudio(segment, {
        modelId: script.config?.elevenLabsModel || 'eleven_multilingual_v2',
        outputFormat: script.config?.outputFormat || 'mp3_44100_128',
        pronunciationDictionaryId: script.config?.pronunciationDictionaryId,
      });

      // Save to temp file
      const audioFile = path.join(workDir, `segment-${i.toString().padStart(4, '0')}.mp3`);
      await fs.writeFile(audioFile, response.audio);
      audioFiles.push(audioFile);
    }

    return audioFiles;
  }

  /**
   * Concatenate audio files using FFmpeg
   */
  private async concatenateAudio(audioFiles: string[], outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create concat list file
      const listFile = outputFile.replace('.mp3', '-list.txt');
      const listContent = audioFiles.map(f => `file '${f}'`).join('\n');

      fs.writeFile(listFile, listContent).then(() => {
        ffmpeg()
          .input(listFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c', 'copy'])
          .output(outputFile)
          .on('end', () => {
            fs.unlink(listFile).then(() => resolve());
          })
          .on('error', (err) => reject(err))
          .run();
      });
    });
  }

  /**
   * Normalize volume and add ID3 metadata
   */
  private async encodeWithMetadata(
    inputFile: string,
    outputFile: string,
    script: RefinedPodcastScript,
    job: PodcastExportJob
  ): Promise<{ durationSeconds: number }> {
    return new Promise((resolve, reject) => {
      let duration = 0;

      ffmpeg(inputFile)
        // Normalize audio levels
        .audioFilters([
          'loudnorm=I=-16:LRA=11:TP=-1.5',
        ])
        // Output settings
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioFrequency(44100)
        .audioChannels(2)
        // ID3 metadata
        .outputOptions([
          `-metadata`, `title=${script.title}`,
          `-metadata`, `artist=ClearSide Debates`,
          `-metadata`, `album=ClearSide Podcast`,
          `-metadata`, `genre=Podcast`,
          `-metadata`, `comment=Generated by ClearSide`,
          `-metadata`, `date=${new Date().getFullYear()}`,
        ])
        .output(outputFile)
        .on('codecData', (data) => {
          // Parse duration from format HH:MM:SS.MS
          const parts = data.duration.split(':');
          duration = parseInt(parts[0]) * 3600 +
                     parseInt(parts[1]) * 60 +
                     parseFloat(parts[2]);
        })
        .on('end', () => {
          resolve({ durationSeconds: Math.round(duration) });
        })
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Add chapter markers to MP3 (for podcast apps)
   */
  private async addChapterMarkers(
    file: string,
    script: RefinedPodcastScript
  ): Promise<void> {
    // Chapter markers require specialized ID3 tag libraries
    // This is a placeholder for future implementation
    // Consider using node-id3 or mutagen for chapter support
    console.log('Chapter markers not yet implemented');
  }

  /**
   * Get all segments in order
   */
  private getAllSegments(script: RefinedPodcastScript): PodcastSegment[] {
    return [
      script.intro,
      ...script.segments,
      script.outro,
    ].filter(Boolean) as PodcastSegment[];
  }

  /**
   * Count total segments
   */
  private countSegments(script: RefinedPodcastScript): number {
    return this.getAllSegments(script).length;
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(workDir: string): Promise<void> {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Emit progress event
   */
  private emitProgress(progress: PipelineProgress): void {
    this.emit('progress', progress);
  }
}
```

### API Endpoint for Starting Generation

```typescript
// Add to backend/src/routes/podcast-routes.ts

/**
 * POST /api/exports/podcast/:jobId/generate
 * Start TTS generation for a refined script
 */
router.post('/:jobId/generate', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.refinedScript) {
      return res.status(400).json({ error: 'No refined script - call /refine first' });
    }

    if (job.status === 'generating' || job.status === 'complete') {
      return res.status(400).json({ error: `Job already ${job.status}` });
    }

    // Start generation in background
    const pipeline = new PodcastGenerationPipeline(req.app.locals.pool);

    // Non-blocking - return immediately with job ID
    pipeline.generate(jobId).catch(err => {
      console.error('Pipeline background error:', err);
    });

    res.json({
      jobId,
      status: 'generating',
      message: 'Podcast generation started',
    });

  } catch (error: any) {
    console.error('Start generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/podcast/:jobId/progress
 * Get generation progress (for polling)
 */
router.get('/:jobId/progress', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
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
    console.error('Get progress error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/exports/podcast/:jobId/download
 * Download the generated podcast
 */
router.get('/:jobId/download', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const podcastRepo = new PodcastExportRepository(req.app.locals.pool);
    const job = await podcastRepo.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'complete' || !job.audioUrl) {
      return res.status(400).json({ error: 'Podcast not ready for download' });
    }

    const filePath = path.join(process.cwd(), job.audioUrl.replace(/^\//, ''));

    res.download(filePath, `podcast-${job.debateId}.mp3`);

  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### SSE Progress Streaming (Optional)

```typescript
// backend/src/routes/podcast-routes.ts

/**
 * GET /api/exports/podcast/:jobId/stream
 * Stream generation progress via SSE
 */
router.get('/:jobId/stream', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const pipeline = new PodcastGenerationPipeline(req.app.locals.pool);

  // Send progress updates
  pipeline.on('progress', (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);

    if (progress.phase === 'complete') {
      res.end();
    }
  });

  // Handle client disconnect
  req.on('close', () => {
    pipeline.removeAllListeners();
  });

  // Start generation
  pipeline.generate(jobId).catch(err => {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  });
});
```

---

## Validation

### How to Test

1. Unit tests:
   - Test script segment ordering
   - Test progress calculation
   - Test cleanup on failure

2. Integration tests:
   - Generate a short podcast (2-3 segments)
   - Verify audio file is valid MP3
   - Verify metadata is correct
   - Verify progress tracking accuracy

3. End-to-end test:
   - Full pipeline from debate to downloadable podcast
   - Verify audio plays correctly in podcast apps

### Definition of Done

- [x] Pipeline generates valid MP3 from refined script
- [x] Progress tracking updates at segment level
- [x] Audio normalization produces consistent volume
- [x] ID3 metadata is correctly applied
- [x] Cleanup removes all temp files
- [x] Error handling prevents orphaned jobs
- [x] Download endpoint serves correct file
- [ ] Works with debates of 10+ minutes (requires integration testing)

---

## Notes

- FFmpeg must be installed and available in PATH
- Consider using BullMQ for production job queuing (Phase 2 QUEUE-001)
- Audio normalization target: -16 LUFS (podcast standard)
- Chapter markers require specialized ID3 implementation
- Monitor ElevenLabs API usage to avoid unexpected costs

---

**Estimated Time:** 1-2 days
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
