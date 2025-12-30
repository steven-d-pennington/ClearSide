/**
 * Audio Export Orchestrator
 *
 * Coordinates the complete audio export pipeline from transcript to final MP3.
 * Manages job tracking, progress updates, and cleanup.
 *
 * @see tasks/phase2/audio-export/AUDIO-004.md
 */

import { promises as fs } from 'fs';
import path from 'path';
import pino from 'pino';
import type { DebateTranscript } from '../transcript/transcript-recorder.js';
import { ScriptGenerator, createScriptGenerator } from './script-generator.js';
import { AudioProcessor, createAudioProcessor } from './audio-processor.js';
import { ID3Manager, createID3Manager } from './id3-manager.js';
import { getTTSService, getDefaultProvider } from './tts-provider-factory.js';
import * as exportJobRepository from '../../db/repositories/export-job-repository.js';
import type { ExportJob } from '../../types/export-job.js';
import type {
  AudioExportJob,
  AudioExportOptions,
  AudioExportResult,
  AudioSegment,
  ITTSService,
  TTSProvider,
} from './types.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'audio-export-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Current exporter version
 */
const EXPORTER_VERSION = '1.0.0';

/**
 * Orchestrator Configuration
 */
export interface AudioExportOrchestratorConfig {
  /** TTS provider to use (defaults to auto-detect based on available API keys) */
  provider?: TTSProvider;
  /** Working directory for audio processing */
  workDir?: string;
  /** Output directory for final files */
  outputDir?: string;
  /** Base URL for file access */
  baseUrl?: string;
}

/**
 * Audio Export Orchestrator Class
 *
 * Manages the complete audio export pipeline
 */
export class AudioExportOrchestrator {
  private readonly ttsService: ITTSService;
  private readonly provider: TTSProvider;
  private readonly scriptGenerator: ScriptGenerator;
  private readonly audioProcessor: AudioProcessor;
  private readonly id3Manager: ID3Manager;
  private readonly workDir: string;
  private readonly outputDir: string;
  private readonly baseUrl: string;

  constructor(config: AudioExportOrchestratorConfig = {}) {
    // Determine and initialize TTS provider
    this.provider = config.provider || getDefaultProvider();
    this.ttsService = getTTSService(this.provider);

    this.scriptGenerator = createScriptGenerator();
    this.audioProcessor = createAudioProcessor();
    this.id3Manager = createID3Manager();

    this.workDir = config.workDir || '/tmp/clearside-audio/work';
    this.outputDir = config.outputDir || '/tmp/clearside-audio/output';
    this.baseUrl = config.baseUrl || '/api/exports/audio';

    logger.info(
      { workDir: this.workDir, outputDir: this.outputDir, provider: this.provider },
      'Audio export orchestrator initialized'
    );
  }

  /**
   * Start an audio export job
   *
   * @param transcript - Debate transcript to export
   * @param options - Export options
   * @returns Job ID for tracking
   */
  async startExport(
    transcript: DebateTranscript,
    options: Partial<AudioExportOptions> = {}
  ): Promise<string> {
    // Create job record in database
    const job = await exportJobRepository.create({
      debateId: transcript.meta.debate_id,
      jobType: 'audio',
      options: { ...options },
      provider: this.provider,
    });

    const jobId = job.id;

    logger.info(
      { jobId, debateId: transcript.meta.debate_id },
      'Starting audio export job'
    );

    // Start async export process
    this.runExport(jobId, transcript, options).catch(async (error) => {
      logger.error({ jobId, error }, 'Audio export failed');
      await exportJobRepository.markFailed(
        jobId,
        error instanceof Error ? error.message : String(error)
      );
    });

    return jobId;
  }

  /**
   * Get job status
   *
   * @param jobId - Job ID
   * @returns Job status or null if not found
   */
  async getJobStatus(jobId: string): Promise<AudioExportJob | null> {
    const job = await exportJobRepository.findById(jobId);
    if (!job) return null;

    // Convert ExportJob to AudioExportJob format for backwards compatibility
    return {
      id: job.id,
      debateId: job.debateId,
      status: job.status as AudioExportJob['status'],
      progress: job.progress,
      stage: job.stage || undefined,
      options: job.options as Partial<AudioExportOptions>,
      outputPath: job.outputPath || undefined,
      outputUrl: job.outputUrl || undefined,
      fileSizeBytes: job.fileSizeBytes || undefined,
      durationSeconds: job.durationSeconds || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }

  /**
   * Run the complete export pipeline
   */
  private async runExport(
    jobId: string,
    transcript: DebateTranscript,
    options: Partial<AudioExportOptions>
  ): Promise<void> {
    const debateId = transcript.meta.debate_id;

    // Create working directory
    const jobDir = path.join(this.workDir, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    try {
      // Stage 1: Generate script
      await this.updateJob(jobId, {
        status: 'processing',
        stage: 'Generating script',
        progress: 5,
      });

      const script = this.scriptGenerator.generate(transcript, options);

      logger.info(
        { jobId, segmentCount: script.segments.length },
        'Script generated'
      );

      // Stage 2: Generate TTS for each segment
      await this.updateJob(jobId, {
        stage: 'Generating speech',
        progress: 10,
      });

      const segmentPaths = await this.generateSegmentAudio(
        jobId,
        jobDir,
        script.segments
      );

      // Stage 3: Add silence between segments
      await this.updateJob(jobId, {
        stage: 'Processing segments',
        progress: 60,
      });

      const paddedPaths = await this.addSegmentPadding(
        jobDir,
        segmentPaths,
        options
      );

      // Stage 4: Concatenate all segments
      await this.updateJob(jobId, {
        stage: 'Combining audio',
        progress: 70,
      });

      const concatenatedPath = path.join(jobDir, 'concatenated.mp3');
      await this.audioProcessor.concatenateSegments(
        paddedPaths,
        concatenatedPath,
        options.format || 'mp3'
      );

      // Stage 5: Normalize audio
      await this.updateJob(jobId, {
        stage: 'Normalizing audio',
        progress: 80,
      });

      let finalAudioPath = concatenatedPath;

      if (options.normalizeAudio !== false) {
        const normalizedPath = path.join(jobDir, 'normalized.mp3');
        await this.audioProcessor.normalizeAudio(concatenatedPath, normalizedPath);
        finalAudioPath = normalizedPath;
      }

      // Stage 6: Add background music (if requested)
      if (options.includeBackgroundMusic) {
        await this.updateJob(jobId, {
          stage: 'Adding background music',
          progress: 85,
        });

        // Note: Background music file would need to be provided
        // For now, skip if music file doesn't exist
        const musicPath = path.join(__dirname, '../assets/background-music.mp3');
        try {
          await fs.access(musicPath);
          const withMusicPath = path.join(jobDir, 'with-music.mp3');
          await this.audioProcessor.addBackgroundMusic(
            finalAudioPath,
            musicPath,
            withMusicPath,
            options.backgroundMusicVolume || 0.1
          );
          finalAudioPath = withMusicPath;
        } catch {
          logger.warn('Background music file not found, skipping');
        }
      }

      // Stage 7: Add ID3 tags and chapter markers
      await this.updateJob(jobId, {
        stage: 'Adding metadata',
        progress: 90,
      });

      const outputPath = path.join(
        this.outputDir,
        `${debateId}-${jobId}.mp3`
      );
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(finalAudioPath, outputPath);

      // Write ID3 tags with chapters
      const tags = this.id3Manager.generateDebateTags(
        debateId,
        transcript.proposition.normalized_question
      );

      await this.id3Manager.writeTagsWithChapters(
        outputPath,
        tags,
        script.chapters
      );

      // Stage 8: Get final file info
      const stats = await fs.stat(outputPath);
      const audioInfo = await this.audioProcessor.getAudioInfo(outputPath);

      // Stage 9: Cleanup temp files
      await this.updateJob(jobId, {
        stage: 'Cleaning up',
        progress: 95,
      });

      await this.audioProcessor.cleanup(jobDir);

      // Complete job
      await this.updateJob(jobId, {
        status: 'completed',
        stage: 'Complete',
        progress: 100,
        outputPath,
        outputUrl: `${this.baseUrl}/${jobId}/download`,
        fileSizeBytes: stats.size,
        durationSeconds: audioInfo.duration,
        completedAt: new Date().toISOString(),
      });

      logger.info(
        {
          jobId,
          debateId,
          fileSizeBytes: stats.size,
          durationSeconds: audioInfo.duration,
        },
        'Audio export completed successfully'
      );
    } catch (error) {
      // Cleanup on error
      await this.audioProcessor.cleanup(jobDir).catch(() => {});
      throw error;
    }
  }

  /**
   * Generate audio for each segment using TTS
   */
  private async generateSegmentAudio(
    jobId: string,
    jobDir: string,
    segments: AudioSegment[]
  ): Promise<string[]> {
    const segmentPaths: string[] = [];
    const totalSegments = segments.length;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;

      // Update progress (10-60% range for TTS generation)
      const progress = 10 + Math.floor((i / totalSegments) * 50);
      await this.updateJob(jobId, {
        stage: `Generating speech (${i + 1}/${totalSegments})`,
        progress,
      });

      try {
        // Generate TTS
        const result = await this.ttsService.generateSpeech(
          segment.text,
          segment.voiceType
        );

        // Save to file
        const segmentPath = path.join(jobDir, `segment-${i.toString().padStart(4, '0')}.mp3`);
        await fs.writeFile(segmentPath, result.audioBuffer);
        segmentPaths.push(segmentPath);

        logger.debug(
          {
            jobId,
            segmentIndex: i,
            voiceType: segment.voiceType,
            bufferSize: result.audioBuffer.length,
          },
          'Segment audio generated'
        );
      } catch (error) {
        logger.error(
          { jobId, segmentIndex: i, error },
          'Failed to generate segment audio'
        );
        throw error;
      }
    }

    return segmentPaths;
  }

  /**
   * Add silence padding between segments
   */
  private async addSegmentPadding(
    jobDir: string,
    segmentPaths: string[],
    options: Partial<AudioExportOptions>
  ): Promise<string[]> {
    const pauseMs = options.pauseBetweenSegments || 500;

    if (pauseMs === 0) {
      return segmentPaths;
    }

    const paddedPaths: string[] = [];

    for (let i = 0; i < segmentPaths.length; i++) {
      const segmentPath = segmentPaths[i];
      if (segmentPath) {
        paddedPaths.push(segmentPath);
      }

      // Add silence between segments (except after last)
      if (i < segmentPaths.length - 1) {
        const silencePath = path.join(jobDir, `silence-${i}.mp3`);
        await this.audioProcessor.generateSilence(pauseMs, silencePath);
        paddedPaths.push(silencePath);
      }
    }

    return paddedPaths;
  }

  /**
   * Update job status
   */
  private async updateJob(jobId: string, updates: Partial<AudioExportJob>): Promise<void> {
    await exportJobRepository.update(jobId, {
      status: updates.status,
      progress: updates.progress,
      stage: updates.stage,
      outputPath: updates.outputPath,
      outputUrl: updates.outputUrl,
      fileSizeBytes: updates.fileSizeBytes,
      durationSeconds: updates.durationSeconds,
      error: updates.error,
      startedAt: updates.status === 'processing' ? new Date() : undefined,
      completedAt: updates.status === 'completed' || updates.status === 'failed' ? new Date() : undefined,
    });

    logger.debug(
      { jobId, stage: updates.stage, progress: updates.progress },
      'Job updated'
    );
  }

  /**
   * Get output file path for a job
   */
  async getOutputPath(jobId: string): Promise<string | null> {
    const job = await exportJobRepository.findById(jobId);
    return job?.outputPath || null;
  }

  /**
   * Delete a job and its output file
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const job = await exportJobRepository.findById(jobId);

    if (!job) {
      return false;
    }

    // Delete output file if exists
    if (job.outputPath) {
      await fs.unlink(job.outputPath).catch(() => {});
    }

    // Remove from database
    await exportJobRepository.deleteById(jobId);

    logger.info({ jobId }, 'Job deleted');
    return true;
  }

  /**
   * List all jobs
   */
  async listJobs(): Promise<AudioExportJob[]> {
    const jobs = await exportJobRepository.list({ jobType: 'audio', orderBy: 'created_at', orderDir: 'desc' });
    return jobs.map(job => ({
      id: job.id,
      debateId: job.debateId,
      status: job.status as AudioExportJob['status'],
      progress: job.progress,
      stage: job.stage || undefined,
      options: job.options as Partial<AudioExportOptions>,
      outputPath: job.outputPath || undefined,
      outputUrl: job.outputUrl || undefined,
      fileSizeBytes: job.fileSizeBytes || undefined,
      durationSeconds: job.durationSeconds || undefined,
      error: job.error || undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    }));
  }

  /**
   * Clean up old completed/failed jobs
   *
   * @param maxAgeMs - Maximum age in milliseconds
   */
  async cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const maxAgeHours = Math.floor(maxAgeMs / (60 * 60 * 1000));
    const cleaned = await exportJobRepository.deleteOldCompleted(maxAgeHours);

    logger.info({ cleaned, maxAgeMs }, 'Cleaned up old jobs');
    return cleaned;
  }
}

/**
 * Create a new AudioExportOrchestrator instance
 */
export function createAudioExportOrchestrator(
  config?: AudioExportOrchestratorConfig
): AudioExportOrchestrator {
  return new AudioExportOrchestrator(config);
}

/**
 * Synchronous audio export (for simple use cases)
 *
 * Waits for the export to complete before returning
 */
export async function exportAudioSync(
  transcript: DebateTranscript,
  options: Partial<AudioExportOptions> = {}
): Promise<AudioExportResult> {
  const orchestrator = createAudioExportOrchestrator();
  const jobId = await orchestrator.startExport(transcript, options);

  // Poll for completion
  const maxWait = 10 * 60 * 1000; // 10 minutes
  const pollInterval = 1000; // 1 second
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const job = await orchestrator.getJobStatus(jobId);

    if (!job) {
      return {
        success: false,
        jobId,
        error: 'Job not found',
      };
    }

    if (job.status === 'completed') {
      return {
        success: true,
        jobId,
        filePath: job.outputPath,
        fileUrl: job.outputUrl,
        metadata: {
          debateId: job.debateId,
          format: job.options.format || 'mp3',
          fileSizeBytes: job.fileSizeBytes || 0,
          durationSeconds: job.durationSeconds || 0,
          generatedAt: job.completedAt || new Date().toISOString(),
          exporterVersion: EXPORTER_VERSION,
        },
      };
    }

    if (job.status === 'failed') {
      return {
        success: false,
        jobId,
        error: job.error || 'Export failed',
      };
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    jobId,
    error: 'Export timed out',
  };
}
