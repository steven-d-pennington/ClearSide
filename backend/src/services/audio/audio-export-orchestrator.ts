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
import { v4 as uuidv4 } from 'uuid';
import type { DebateTranscript } from '../transcript/transcript-recorder.js';
import { ElevenLabsService, createElevenLabsService } from './elevenlabs-service.js';
import { ScriptGenerator, createScriptGenerator } from './script-generator.js';
import { AudioProcessor, createAudioProcessor } from './audio-processor.js';
import { ID3Manager, createID3Manager } from './id3-manager.js';
import type {
  AudioExportJob,
  AudioExportOptions,
  AudioExportResult,
  AudioSegment,
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
 * In-memory job store (replace with Redis/database in production)
 */
const jobStore = new Map<string, AudioExportJob>();

/**
 * Orchestrator Configuration
 */
export interface AudioExportOrchestratorConfig {
  /** ElevenLabs API key */
  elevenLabsApiKey?: string;
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
  private readonly ttsService: ElevenLabsService;
  private readonly scriptGenerator: ScriptGenerator;
  private readonly audioProcessor: AudioProcessor;
  private readonly id3Manager: ID3Manager;
  private readonly workDir: string;
  private readonly outputDir: string;
  private readonly baseUrl: string;

  constructor(config: AudioExportOrchestratorConfig = {}) {
    // Initialize services
    this.ttsService = createElevenLabsService({
      apiKey: config.elevenLabsApiKey,
    });
    this.scriptGenerator = createScriptGenerator();
    this.audioProcessor = createAudioProcessor();
    this.id3Manager = createID3Manager();

    this.workDir = config.workDir || '/tmp/clearside-audio/work';
    this.outputDir = config.outputDir || '/tmp/clearside-audio/output';
    this.baseUrl = config.baseUrl || '/api/exports/audio';

    logger.info(
      { workDir: this.workDir, outputDir: this.outputDir },
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
    const jobId = uuidv4();

    // Create job record
    const job: AudioExportJob = {
      id: jobId,
      debateId: transcript.meta.debate_id,
      status: 'pending',
      progress: 0,
      stage: 'Initializing',
      options: { ...options },
      createdAt: new Date().toISOString(),
    };

    jobStore.set(jobId, job);

    logger.info(
      { jobId, debateId: transcript.meta.debate_id },
      'Starting audio export job'
    );

    // Start async export process
    this.runExport(jobId, transcript, options).catch((error) => {
      logger.error({ jobId, error }, 'Audio export failed');
      this.updateJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return jobId;
  }

  /**
   * Get job status
   *
   * @param jobId - Job ID
   * @returns Job status or null if not found
   */
  getJobStatus(jobId: string): AudioExportJob | null {
    return jobStore.get(jobId) || null;
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
      this.updateJob(jobId, {
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
      this.updateJob(jobId, {
        stage: 'Generating speech',
        progress: 10,
      });

      const segmentPaths = await this.generateSegmentAudio(
        jobId,
        jobDir,
        script.segments
      );

      // Stage 3: Add silence between segments
      this.updateJob(jobId, {
        stage: 'Processing segments',
        progress: 60,
      });

      const paddedPaths = await this.addSegmentPadding(
        jobDir,
        segmentPaths,
        options
      );

      // Stage 4: Concatenate all segments
      this.updateJob(jobId, {
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
      this.updateJob(jobId, {
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
        this.updateJob(jobId, {
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
      this.updateJob(jobId, {
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
      this.updateJob(jobId, {
        stage: 'Cleaning up',
        progress: 95,
      });

      await this.audioProcessor.cleanup(jobDir);

      // Complete job
      this.updateJob(jobId, {
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
      this.updateJob(jobId, {
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
  private updateJob(jobId: string, updates: Partial<AudioExportJob>): void {
    const job = jobStore.get(jobId);
    if (job) {
      Object.assign(job, updates);
      jobStore.set(jobId, job);

      logger.debug(
        { jobId, stage: updates.stage, progress: updates.progress },
        'Job updated'
      );
    }
  }

  /**
   * Get output file path for a job
   */
  getOutputPath(jobId: string): string | null {
    const job = jobStore.get(jobId);
    return job?.outputPath || null;
  }

  /**
   * Delete a job and its output file
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const job = jobStore.get(jobId);

    if (!job) {
      return false;
    }

    // Delete output file if exists
    if (job.outputPath) {
      await fs.unlink(job.outputPath).catch(() => {});
    }

    // Remove from store
    jobStore.delete(jobId);

    logger.info({ jobId }, 'Job deleted');
    return true;
  }

  /**
   * List all jobs
   */
  listJobs(): AudioExportJob[] {
    return Array.from(jobStore.values());
  }

  /**
   * Clean up old completed/failed jobs
   *
   * @param maxAgeMs - Maximum age in milliseconds
   */
  async cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, job] of jobStore.entries()) {
      const jobAge = now - new Date(job.createdAt).getTime();

      if (
        jobAge > maxAgeMs &&
        (job.status === 'completed' || job.status === 'failed')
      ) {
        await this.deleteJob(jobId);
        cleaned++;
      }
    }

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
    const job = orchestrator.getJobStatus(jobId);

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
