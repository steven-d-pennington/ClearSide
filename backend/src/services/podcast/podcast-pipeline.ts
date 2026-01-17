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
import { PodcastTTSAdapter, getAvailablePodcastProviders } from './podcast-tts-adapter.js';
import { AudioProcessor } from '../audio/audio-processor.js';
import { getReactionLibrary, ReactionLibrary } from '../audio/reaction-library.js';
import { createReactionInserter, ReactionInserter } from '../audio/reaction-inserter.js';
import type { ReactionInsertionConfig } from '../../types/reactions.js';
import { DEFAULT_REACTION_CONFIG } from '../../types/reactions.js';
import * as podcastRepo from '../../db/repositories/podcast-export-repository.js';
import {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastSegment,
  TTSProviderType,
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
  phase: 'initializing' | 'generating' | 'concatenating' | 'reactions' | 'normalizing' | 'tagging' | 'complete' | 'error';
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
  /** TTS provider to use (defaults to 'elevenlabs') */
  ttsProvider?: TTSProviderType;
  /** ElevenLabs API key (required if using ElevenLabs provider) */
  elevenLabsApiKey?: string;
  /** Configuration for cross-talk reactions (optional) */
  reactions?: Partial<ReactionInsertionConfig>;
}

/**
 * Default directories - using /storage mount for persistence
 */
const DEFAULT_EXPORTS_DIR = process.env.EXPORTS_DIR || '/storage/exports/podcasts';
const DEFAULT_TEMP_DIR = process.env.TEMP_DIR || '/storage/temp/podcasts';

/**
 * Podcast Generation Pipeline
 *
 * Coordinates the entire podcast generation process from refined script
 * to final MP3 with metadata.
 *
 * Supports both ElevenLabs and Gemini TTS providers:
 * - ElevenLabs: Premium quality with V3 audio tags
 * - Gemini: Cost-effective with natural text
 */
export class PodcastGenerationPipeline extends EventEmitter {
  private ttsClient: PodcastTTSClient | null = null;
  private ttsAdapter: PodcastTTSAdapter | null = null;
  private ttsProvider: TTSProviderType;
  private audioProcessor: AudioProcessor;
  private exportsDir: string;
  private tempDir: string;
  private reactionConfig: ReactionInsertionConfig;
  private reactionLibrary: ReactionLibrary | null = null;
  private reactionInserter: ReactionInserter | null = null;

  constructor(config: PipelineConfig) {
    super();
    this.ttsProvider = config.ttsProvider || 'elevenlabs';
    this.audioProcessor = new AudioProcessor({ tempDir: config.tempDir });
    this.exportsDir = config.exportsDir || DEFAULT_EXPORTS_DIR;
    this.tempDir = config.tempDir || DEFAULT_TEMP_DIR;

    // Initialize reaction configuration
    this.reactionConfig = { ...DEFAULT_REACTION_CONFIG, ...config.reactions };
    if (this.reactionConfig.enabled) {
      this.reactionLibrary = getReactionLibrary();
      this.reactionInserter = createReactionInserter(this.reactionConfig);
      logger.info({
        reactionsPerMinute: this.reactionConfig.reactionsPerMinute,
        minimumGapMs: this.reactionConfig.minimumGapMs,
      }, 'Reactions enabled');
    }

    // Initialize the appropriate TTS client/adapter
    if (this.ttsProvider === 'elevenlabs' && config.elevenLabsApiKey) {
      // Use legacy client for ElevenLabs with full control
      this.ttsClient = new PodcastTTSClient(config.elevenLabsApiKey);
    } else {
      // Use new adapter for any provider
      this.ttsAdapter = new PodcastTTSAdapter(this.ttsProvider);
    }

    logger.info({ ttsProvider: this.ttsProvider, reactionsEnabled: this.reactionConfig.enabled }, 'Pipeline initialized');
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

      // Set Gemini director's notes if available and using adapter
      if (this.ttsAdapter && script.geminiDirectorNotes) {
        this.ttsAdapter.setGeminiDirectorNotes(script.geminiDirectorNotes);
        logger.debug({ jobId }, 'Gemini director\'s notes configured for TTS');
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

      // Phase 2.5: Add cross-talk reactions (if enabled)
      let audioForNormalization = concatenatedFile;
      if (this.reactionConfig.enabled && this.reactionInserter && this.reactionLibrary) {
        await podcastRepo.updateGenerationPhase(jobId, 'reactions');
        this.emitProgress({
          phase: 'reactions',
          percentComplete: 78,
          message: 'Adding cross-talk reactions...',
        });

        const reactedFile = await this.processReactionsPhase(
          jobId,
          allSegments,
          audioFiles,
          concatenatedFile,
          workDir
        );
        if (reactedFile) {
          audioForNormalization = reactedFile;
        }
      }

      // Phase 3: Normalize volume levels
      await podcastRepo.updateGenerationPhase(jobId, 'normalize');
      this.emitProgress({
        phase: 'normalizing',
        percentComplete: 85,
        message: 'Normalizing audio levels...',
      });

      const normalizedFile = path.join(workDir, 'normalized.mp3');
      const processingResult = await this.audioProcessor.normalizeAudio(audioForNormalization, normalizedFile);

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
      const stats = this.getUsageStats();
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
      const stats = this.getUsageStats();
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
   * Supports both ElevenLabs (legacy client) and Gemini (new adapter)
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

    // Reset usage stats for accurate cost tracking of NEW segments only
    this.resetUsageStats();

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
        message: `Generating audio for segment ${i + 1} of ${total} (${segment.speaker}) via ${this.ttsProvider}...`,
      });

      logger.debug({ jobId, segment: i + 1, total, speaker: segment.speaker, provider: this.ttsProvider }, 'Generating segment');

      // Mark segment as generating
      await podcastRepo.updateSegmentStatus(jobId, i, 'generating');

      try {
        // Generate audio using appropriate client/adapter with retry logic
        const response = await this.withRetry(
          () => this.generateSegmentAudio(segment, config),
          `segment ${i + 1}`
        );

        // Save to temp file with zero-padded index for proper ordering
        await fs.writeFile(audioFile, response.audio);
        audioFiles.push(audioFile);

        // Mark segment as complete with cost info
        // Cost varies by provider: ElevenLabs ~$0.03/char, Gemini ~$0.0015/char
        const costPerChar = this.ttsProvider === 'gemini' ? 0.0015 : 0.03;
        const segmentCost = Math.round(segment.text.length * costPerChar);
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
   * Generate audio for a single segment using the appropriate TTS service
   */
  private async generateSegmentAudio(
    segment: PodcastSegment,
    config: PodcastExportConfig
  ): Promise<{ audio: Buffer; characterCount: number; durationMs?: number }> {
    if (this.ttsClient) {
      // Use legacy ElevenLabs client
      return this.ttsClient.generateSegmentAudio(segment, {
        modelId: config.elevenLabsModel || 'eleven_multilingual_v2',
        outputFormat: config.outputFormat || 'mp3_44100_128',
        pronunciationDictionaryId: config.pronunciationDictionaryId,
      });
    } else if (this.ttsAdapter) {
      // Use new adapter (supports ElevenLabs, Gemini, etc.)
      return this.ttsAdapter.generateSegmentAudio(segment);
    } else {
      throw new Error('No TTS client or adapter configured');
    }
  }

  /**
   * Get usage statistics from whichever TTS service is being used
   */
  private getUsageStats(): { totalCharacters: number; totalRequests: number; estimatedCostCents: number } {
    if (this.ttsClient) {
      return this.ttsClient.getUsageStats();
    } else if (this.ttsAdapter) {
      return this.ttsAdapter.getUsageStats();
    }
    return { totalCharacters: 0, totalRequests: 0, estimatedCostCents: 0 };
  }

  /**
   * Reset usage statistics
   */
  private resetUsageStats(): void {
    if (this.ttsClient) {
      this.ttsClient.resetUsageStats();
    } else if (this.ttsAdapter) {
      this.ttsAdapter.resetUsageStats();
    }
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
          value: job.debateId || job.conversationSessionId || 'unknown',
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
   * Process reactions phase: identify insertion points and mix reactions into audio
   *
   * @param jobId - Job ID for logging
   * @param segments - Podcast segments with speaker/text info
   * @param audioFiles - Paths to generated audio files for each segment
   * @param concatenatedFile - Path to the concatenated audio file
   * @param workDir - Working directory for temp files
   * @returns Path to the audio file with reactions mixed in, or null if no reactions added
   */
  private async processReactionsPhase(
    jobId: string,
    segments: PodcastSegment[],
    audioFiles: string[],
    concatenatedFile: string,
    workDir: string
  ): Promise<string | null> {
    if (!this.reactionInserter || !this.reactionLibrary) {
      return null;
    }

    try {
      // Get durations of each segment by probing the audio files
      const segmentDurationsMs = await this.getSegmentDurations(audioFiles);

      if (segmentDurationsMs.length === 0) {
        logger.warn({ jobId }, 'Could not get segment durations, skipping reactions');
        return null;
      }

      // Collect unique voice IDs from segments
      const voiceIds = [...new Set(segments.map(s => s.voiceId).filter(Boolean))];

      // Check which voices have reaction clips available
      const availableVoiceIds: string[] = [];
      for (const voiceId of voiceIds) {
        if (voiceId && await this.reactionLibrary.hasReactionsForVoice(voiceId)) {
          availableVoiceIds.push(voiceId);
        }
      }

      if (availableVoiceIds.length < 2) {
        // Need at least 2 voices to have cross-talk (reactions from other speakers)
        logger.info({ jobId, availableVoiceIds }, 'Not enough voices with reactions, skipping');
        return null;
      }

      // Identify insertion points based on segment content
      const insertionPoints = this.reactionInserter.identifyInsertionPoints(
        segments,
        segmentDurationsMs
      );

      if (insertionPoints.length === 0) {
        logger.info({ jobId }, 'No suitable insertion points found, skipping reactions');
        return null;
      }

      // Create mix instructions with actual reaction clips
      const mixInstructions = await this.reactionInserter.createMixInstructions(
        insertionPoints,
        this.reactionLibrary,
        availableVoiceIds
      );

      if (mixInstructions.length === 0) {
        logger.info({ jobId }, 'No mix instructions created, skipping reactions');
        return null;
      }

      logger.info({
        jobId,
        insertionPoints: insertionPoints.length,
        mixInstructions: mixInstructions.length,
        availableVoices: availableVoiceIds.length,
      }, 'Processing reactions');

      // Mix reactions into the concatenated audio
      const reactedFile = path.join(workDir, 'reacted.mp3');
      await this.audioProcessor.mixWithReactions(
        concatenatedFile,
        mixInstructions,
        reactedFile
      );

      logger.info({
        jobId,
        reactionsAdded: mixInstructions.length,
        outputFile: reactedFile,
      }, 'Reactions mixed successfully');

      return reactedFile;

    } catch (error) {
      logger.error({
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Error in reactions phase (continuing without reactions)');
      return null;
    }
  }

  /**
   * Get durations of audio files by probing with FFmpeg
   *
   * @param audioFiles - Paths to audio files
   * @returns Array of durations in milliseconds
   */
  private async getSegmentDurations(audioFiles: string[]): Promise<number[]> {
    const durations: number[] = [];

    for (const file of audioFiles) {
      try {
        const result = await this.audioProcessor.probeAudio(file);
        if (result && result.durationSeconds) {
          durations.push(Math.round(result.durationSeconds * 1000));
        } else {
          // Fallback: estimate from file size (rough approximation for MP3)
          const stats = await fs.stat(file);
          // Assuming ~128kbps MP3: size_bytes / (128000/8) = duration_seconds
          const estimatedSeconds = stats.size / 16000;
          durations.push(Math.round(estimatedSeconds * 1000));
          logger.debug({ file, estimatedSeconds }, 'Used file size estimate for duration');
        }
      } catch (error) {
        logger.warn({
          file,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Could not get duration for file');
        durations.push(0);
      }
    }

    return durations;
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
 *
 * @param config Optional configuration overrides
 * @param config.ttsProvider TTS provider to use ('elevenlabs' or 'gemini')
 * @param config.elevenLabsApiKey ElevenLabs API key (required for ElevenLabs provider)
 * @param config.exportsDir Directory for final exports
 * @param config.tempDir Directory for temp files
 */
export function createPodcastPipeline(config?: Partial<PipelineConfig>): PodcastGenerationPipeline {
  const ttsProvider = config?.ttsProvider || 'elevenlabs';
  const elevenLabsApiKey = config?.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;

  // Validate provider availability
  const availableProviders = getAvailablePodcastProviders();
  if (!availableProviders.includes(ttsProvider)) {
    const availableList = availableProviders.join(', ') || 'none';
    throw new Error(
      `TTS provider '${ttsProvider}' is not available. ` +
      `Available providers: ${availableList}. ` +
      `Configure the required API key for your desired provider.`
    );
  }

  return new PodcastGenerationPipeline({
    ttsProvider,
    elevenLabsApiKey,
    exportsDir: config?.exportsDir || process.env.EXPORTS_DIR || DEFAULT_EXPORTS_DIR,
    tempDir: config?.tempDir || process.env.TEMP_DIR || DEFAULT_TEMP_DIR,
  });
}
