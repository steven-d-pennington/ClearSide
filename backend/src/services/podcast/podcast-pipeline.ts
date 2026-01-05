/**
 * Podcast Generation Pipeline
 *
 * Orchestrates the full podcast generation workflow:
 * 1. Script refinement (LLM)
 * 2. TTS generation (ElevenLabs)
 * 3. Audio concatenation (FFmpeg)
 * 4. Volume normalization (FFmpeg)
 * 5. ID3 metadata tagging
 *
 * @see tasks/phase4/podcast-export/PODCAST-005.md
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import NodeID3 from 'node-id3';
import pino from 'pino';
import { PodcastTTSClient } from './podcast-tts-client.js';
import { AudioProcessor } from '../audio/audio-processor.js';
import * as podcastRepo from '../../db/repositories/podcast-export-repository.js';
import {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastSegment,
} from '../../types/podcast-export.js';

/**
 * Retry configuration for TTS calls
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

const logger = pino({
  name: 'podcast-pipeline',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Pipeline progress event data
 */
export interface PipelineProgress {
  phase: 'initializing' | 'generating' | 'concatenating' | 'normalizing' | 'tagging' | 'complete' | 'error';
  currentSegment?: number;
  totalSegments?: number;
  percentComplete: number;
  message: string;
}

/**
 * Pipeline generation result
 */
export interface PipelineResult {
  success: boolean;
  audioUrl?: string;
  durationSeconds?: number;
  characterCount?: number;
  actualCostCents?: number;
  error?: string;
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  exportsDir: string;
  tempDir: string;
  elevenLabsApiKey: string;
}

/**
 * Default directories
 */
const DEFAULT_EXPORTS_DIR = './exports/podcasts';
const DEFAULT_TEMP_DIR = './temp/podcasts';

/**
 * Podcast Generation Pipeline
 *
 * Coordinates the entire podcast generation process from refined script
 * to final MP3 with metadata.
 */
export class PodcastGenerationPipeline extends EventEmitter {
  private ttsClient: PodcastTTSClient;
  private audioProcessor: AudioProcessor;
  private exportsDir: string;
  private tempDir: string;

  constructor(config: PipelineConfig) {
    super();
    this.ttsClient = new PodcastTTSClient(config.elevenLabsApiKey);
    this.audioProcessor = new AudioProcessor({ tempDir: config.tempDir });
    this.exportsDir = config.exportsDir || DEFAULT_EXPORTS_DIR;
    this.tempDir = config.tempDir || DEFAULT_TEMP_DIR;
  }

  /**
   * Execute the full podcast generation pipeline
   * Supports resume from any phase, with segment-level granularity for TTS
   */
  async generate(jobId: string): Promise<PipelineResult> {
    const workDir = path.join(this.tempDir, jobId);

    try {
      // Initialize
      this.emitProgress({
        phase: 'initializing',
        percentComplete: 0,
        message: 'Initializing podcast generation...',
      });

      // Ensure directories exist
      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(this.exportsDir, { recursive: true });

      // Get job and validate
      const job = await podcastRepo.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      if (!job.refinedScript) {
        throw new Error('No refined script available - call /refine first');
      }

      const script = job.refinedScript;
      const allSegments = this.getAllSegments(script);
      const totalSegments = allSegments.length;

      if (totalSegments === 0) {
        throw new Error('Script has no segments to generate');
      }

      logger.info({ jobId, totalSegments, resumePhase: job.generationPhase }, 'Starting podcast generation');

      // Initialize segment tracking if not resuming
      if (!job.generationPhase || job.generationPhase === 'pending') {
        await podcastRepo.createSegmentStatuses(jobId, totalSegments);
      }

      // Phase 1: Generate TTS audio for each segment
      await podcastRepo.updateStatus(jobId, 'generating');
      await podcastRepo.updateGenerationPhase(jobId, 'tts');
      const audioFiles = await this.generateAllAudio(jobId, allSegments, job.config, workDir);

      // Phase 2: Concatenate audio files
      await podcastRepo.updateGenerationPhase(jobId, 'concat');
      this.emitProgress({
        phase: 'concatenating',
        percentComplete: 75,
        message: 'Combining audio segments...',
      });

      const concatenatedFile = path.join(workDir, 'concatenated.mp3');
      await this.audioProcessor.concatenateSegments(audioFiles, concatenatedFile, 'mp3');

      // Phase 3: Normalize volume levels
      await podcastRepo.updateGenerationPhase(jobId, 'normalize');
      this.emitProgress({
        phase: 'normalizing',
        percentComplete: 85,
        message: 'Normalizing audio levels...',
      });

      const normalizedFile = path.join(workDir, 'normalized.mp3');
      const processingResult = await this.audioProcessor.normalizeAudio(concatenatedFile, normalizedFile);

      // Phase 4: Add ID3 metadata and move to exports
      await podcastRepo.updateGenerationPhase(jobId, 'tag');
      this.emitProgress({
        phase: 'tagging',
        percentComplete: 95,
        message: 'Adding podcast metadata...',
      });

      const finalFilename = `podcast-${jobId}.mp3`;
      const finalFile = path.join(this.exportsDir, finalFilename);
      await this.addID3Tags(normalizedFile, finalFile, script, job);

      // Get final stats (from DB for accuracy after resume)
      const stats = this.ttsClient.getUsageStats();
      const dbCost = await podcastRepo.getSegmentsTotalCost(jobId);
      const totalCost = dbCost > 0 ? dbCost : stats.estimatedCostCents;
      const audioUrl = `/exports/podcasts/${finalFilename}`;

      // Mark complete
      await podcastRepo.updateGenerationPhase(jobId, 'complete');
      await podcastRepo.completeJob(
        jobId,
        audioUrl,
        Math.round(processingResult.durationSeconds),
        stats.totalCharacters,
        totalCost
      );

      this.emitProgress({
        phase: 'complete',
        percentComplete: 100,
        message: 'Podcast generation complete!',
      });

      logger.info({
        jobId,
        audioUrl,
        durationSeconds: processingResult.durationSeconds,
        characterCount: stats.totalCharacters,
        costCents: totalCost,
      }, 'Podcast generation complete');

      // Cleanup temp files
      await this.cleanup(workDir);

      return {
        success: true,
        audioUrl,
        durationSeconds: Math.round(processingResult.durationSeconds),
        characterCount: stats.totalCharacters,
        actualCostCents: totalCost,
      };

    } catch (error: any) {
      logger.error({ jobId, error: error.message }, 'Pipeline error');

      // Record partial cost and mark as error
      const stats = this.ttsClient.getUsageStats();
      if (stats.estimatedCostCents > 0) {
        await podcastRepo.updatePartialCost(jobId, stats.estimatedCostCents);
      }
      await podcastRepo.updateGenerationPhase(jobId, 'error');
      await podcastRepo.updateStatus(jobId, 'error', error.message);

      this.emitProgress({
        phase: 'error',
        percentComplete: 0,
        message: `Generation failed: ${error.message}`,
      });

      // NOTE: Intentionally NOT cleaning up on failure to allow resume
      // Use DELETE /api/exports/podcast/:jobId/temp to manually cleanup
      logger.info({ jobId, workDir }, 'Keeping temp files for potential resume');

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate TTS audio for all segments, skipping any that already exist (for resume)
   * Includes segment-level status tracking and retry logic with exponential backoff
   */
  private async generateAllAudio(
    jobId: string,
    segments: PodcastSegment[],
    config: PodcastExportConfig,
    workDir: string
  ): Promise<string[]> {
    const audioFiles: string[] = [];
    const total = segments.length;

    // Check for existing segments (for resume capability)
    const existingSegments = await this.getExistingSegments(workDir);
    const skippedCount = existingSegments.size;

    if (skippedCount > 0) {
      logger.info({ jobId, skippedCount, total }, 'Resuming generation - skipping existing segments');
    }

    // Reset TTS client stats for accurate cost tracking of NEW segments only
    this.ttsClient.resetUsageStats();

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const audioFile = path.join(workDir, `segment-${i.toString().padStart(4, '0')}.mp3`);

      // Check if this segment already exists (resume case)
      if (existingSegments.has(i)) {
        const percentComplete = 5 + Math.round((i / total) * 70);
        await podcastRepo.updateProgress(jobId, i + 1, total);

        this.emitProgress({
          phase: 'generating',
          currentSegment: i + 1,
          totalSegments: total,
          percentComplete,
          message: `Segment ${i + 1} of ${total} already exists (resuming)...`,
        });

        logger.debug({ jobId, segment: i + 1, total }, 'Skipping existing segment');
        audioFiles.push(audioFile);
        continue;
      }

      // Update progress
      const percentComplete = 5 + Math.round((i / total) * 70);
      await podcastRepo.updateProgress(jobId, i + 1, total);

      this.emitProgress({
        phase: 'generating',
        currentSegment: i + 1,
        totalSegments: total,
        percentComplete,
        message: `Generating audio for segment ${i + 1} of ${total} (${segment.speaker})...`,
      });

      logger.debug({ jobId, segment: i + 1, total, speaker: segment.speaker }, 'Generating segment');

      // Mark segment as generating
      await podcastRepo.updateSegmentStatus(jobId, i, 'generating');

      try {
        // Generate audio via ElevenLabs with retry logic
        const response = await this.withRetry(
          () => this.ttsClient.generateSegmentAudio(segment, {
            modelId: config.elevenLabsModel || 'eleven_multilingual_v2',
            outputFormat: config.outputFormat || 'mp3_44100_128',
            pronunciationDictionaryId: config.pronunciationDictionaryId,
          }),
          `segment ${i + 1}`
        );

        // Save to temp file with zero-padded index for proper ordering
        await fs.writeFile(audioFile, response.audio);
        audioFiles.push(audioFile);

        // Mark segment as complete with cost info
        const segmentCost = Math.round(segment.text.length * 0.03); // Approx cost per char
        await podcastRepo.updateSegmentStatus(jobId, i, 'complete', {
          characterCount: segment.text.length,
          costCents: segmentCost,
        });

      } catch (error: any) {
        // Mark segment as failed
        await podcastRepo.updateSegmentStatus(jobId, i, 'error', {
          errorMessage: error.message,
        });
        // Re-throw to stop the pipeline
        throw error;
      }
    }

    return audioFiles;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delayMs = RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on authentication or validation errors
        const errorMessage = error.message?.toLowerCase() || '';
        if (
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('invalid') ||
          errorMessage.includes('authentication') ||
          error.status === 401 ||
          error.status === 403
        ) {
          throw error;
        }

        if (attempt < RETRY_CONFIG.maxAttempts) {
          logger.warn(
            { operationName, attempt, maxAttempts: RETRY_CONFIG.maxAttempts, delayMs, error: error.message },
            'Retrying after error'
          );

          await this.sleep(delayMs);
          delayMs = Math.min(delayMs * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        }
      }
    }

    logger.error(
      { operationName, attempts: RETRY_CONFIG.maxAttempts, error: lastError?.message },
      'All retry attempts exhausted'
    );
    throw lastError;
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add ID3 tags to the final MP3 file
   */
  private async addID3Tags(
    inputFile: string,
    outputFile: string,
    script: RefinedPodcastScript,
    job: PodcastExportJob
  ): Promise<void> {
    // First copy the file to output location
    await fs.copyFile(inputFile, outputFile);

    // Build ID3 tags
    const tags: NodeID3.Tags = {
      title: script.title || 'ClearSide Debate Podcast',
      artist: 'ClearSide Debates',
      album: 'ClearSide Podcast',
      genre: 'Podcast',
      year: new Date().getFullYear().toString(),
      comment: {
        language: 'eng',
        text: `Generated by ClearSide from debate ${job.debateId}`,
      },
      userDefinedText: [
        {
          description: 'Generator',
          value: 'ClearSide Podcast Pipeline',
        },
        {
          description: 'DebateID',
          value: job.debateId,
        },
      ],
    };

    // Write tags to file
    const success = NodeID3.write(tags, outputFile);
    if (!success) {
      logger.warn({ outputFile }, 'Failed to write ID3 tags');
    }
  }

  /**
   * Get all segments from script in order
   */
  private getAllSegments(script: RefinedPodcastScript): PodcastSegment[] {
    const segments: PodcastSegment[] = [];

    if (script.intro) {
      segments.push(script.intro);
    }

    segments.push(...script.segments);

    if (script.outro) {
      segments.push(script.outro);
    }

    return segments;
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(workDir: string): Promise<void> {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
      logger.debug({ workDir }, 'Cleaned up temp directory');
    } catch (error) {
      logger.warn({ workDir, error }, 'Cleanup error (non-fatal)');
    }
  }

  /**
   * Check which segments already exist in the work directory (for resume)
   * Returns a Set of segment indices that have already been generated
   */
  private async getExistingSegments(workDir: string): Promise<Set<number>> {
    const existing = new Set<number>();
    try {
      const files = await fs.readdir(workDir);
      const segmentPattern = /^segment-(\d{4})\.mp3$/;

      for (const file of files) {
        const match = file.match(segmentPattern);
        if (match && match[1]) {
          const index = parseInt(match[1], 10);
          const filePath = path.join(workDir, file);
          const stats = await fs.stat(filePath);
          // Only count non-empty files (corrupted files have 0 bytes)
          if (stats.size > 0) {
            existing.add(index);
          }
        }
      }

      if (existing.size > 0) {
        logger.info({
          workDir,
          existingCount: existing.size,
          existingIndices: Array.from(existing).sort((a, b) => a - b),
        }, 'Detected existing segments for resume');
      }
    } catch (error) {
      // Directory doesn't exist or can't be read - no existing segments
      logger.debug({ workDir }, 'No existing segments found (directory may not exist)');
    }
    return existing;
  }

  /**
   * Emit progress event
   */
  private emitProgress(progress: PipelineProgress): void {
    this.emit('progress', progress);
  }
}

/**
 * Create a configured pipeline instance
 */
export function createPodcastPipeline(config?: Partial<PipelineConfig>): PodcastGenerationPipeline {
  const elevenLabsApiKey = config?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;

  if (!elevenLabsApiKey) {
    throw new Error('ELEVENLABS_API_KEY is required for podcast generation');
  }

  return new PodcastGenerationPipeline({
    elevenLabsApiKey,
    exportsDir: config?.exportsDir || process.env.EXPORTS_DIR || DEFAULT_EXPORTS_DIR,
    tempDir: config?.tempDir || process.env.TEMP_DIR || DEFAULT_TEMP_DIR,
  });
}
