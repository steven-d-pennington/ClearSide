/**
 * Audio Processor Service
 *
 * Uses FFmpeg to process audio files: concatenation, normalization,
 * mixing background music, and encoding to MP3.
 *
 * @see tasks/phase2/audio-export/AUDIO-003.md
 */

import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import pino from 'pino';
import type { AudioFormat, AudioProcessingResult } from './types.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'audio-processor',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Audio encoding settings by format
 */
const ENCODING_SETTINGS: Record<AudioFormat, { codec: string; options: string[] }> = {
  mp3: {
    codec: 'libmp3lame',
    options: ['-b:a', '192k', '-ar', '44100'],
  },
  wav: {
    codec: 'pcm_s16le',
    options: ['-ar', '44100'],
  },
  ogg: {
    codec: 'libvorbis',
    options: ['-q:a', '6', '-ar', '44100'],
  },
};

/**
 * Audio Processor Configuration
 */
export interface AudioProcessorConfig {
  /** Path to ffmpeg binary (optional, uses PATH by default) */
  ffmpegPath?: string;
  /** Path to ffprobe binary (optional, uses PATH by default) */
  ffprobePath?: string;
  /** Temporary directory for processing */
  tempDir?: string;
}

/**
 * Audio Processor Class
 *
 * Provides audio processing functionality using FFmpeg
 */
export class AudioProcessor {
  private readonly tempDir: string;

  constructor(config: AudioProcessorConfig = {}) {
    if (config.ffmpegPath) {
      ffmpeg.setFfmpegPath(config.ffmpegPath);
    }
    if (config.ffprobePath) {
      ffmpeg.setFfprobePath(config.ffprobePath);
    }

    this.tempDir = config.tempDir || '/tmp/clearside-audio';

    logger.info({ tempDir: this.tempDir }, 'Audio processor initialized');
  }

  /**
   * Concatenate multiple audio segments into a single file
   *
   * @param segmentPaths - Array of paths to audio segments
   * @param outputPath - Path for the output file
   * @param format - Output audio format
   * @returns Processing result
   */
  async concatenateSegments(
    segmentPaths: string[],
    outputPath: string,
    format: AudioFormat = 'mp3'
  ): Promise<AudioProcessingResult> {
    logger.info(
      { segmentCount: segmentPaths.length, outputPath },
      'Concatenating audio segments'
    );

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Create concat list file
    // FFmpeg expects paths in the list file to be either absolute or relative to the list file
    const listFile = path.join(path.dirname(outputPath), 'concat-list.txt');
    const listDir = path.dirname(listFile);
    const listContent = segmentPaths.map((p) => {
      // Convert to absolute path, then make relative to list file directory
      const absPath = path.resolve(p);
      const relPath = path.relative(listDir, absPath);
      return `file '${relPath}'`;
    }).join('\n');
    await fs.writeFile(listFile, listContent, 'utf-8');

    const encoding = ENCODING_SETTINGS[format];

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec(encoding.codec)
        .outputOptions(encoding.options)
        .output(outputPath)
        .on('start', (cmd) => {
          logger.debug({ cmd }, 'FFmpeg concat started');
        })
        .on('progress', (progress) => {
          logger.debug({ percent: progress.percent }, 'Concat progress');
        })
        .on('end', async () => {
          // Clean up list file
          await fs.unlink(listFile).catch(() => {});

          // Get file info
          const stats = await fs.stat(outputPath);
          const info = await this.getAudioInfo(outputPath);

          logger.info(
            { outputPath, sizeBytes: stats.size, duration: info.duration },
            'Audio concatenation complete'
          );

          resolve({
            outputPath,
            fileSizeBytes: stats.size,
            durationSeconds: info.duration,
            metadata: {
              format,
              bitrate: '192k',
              sampleRate: 44100,
              channels: info.channels,
            },
          });
        })
        .on('error', (err) => {
          logger.error({ error: err.message }, 'FFmpeg concat failed');
          reject(new Error(`Audio concatenation failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Normalize audio levels using loudnorm filter
   *
   * @param inputPath - Path to input audio file
   * @param outputPath - Path for the output file
   * @returns Processing result
   */
  async normalizeAudio(
    inputPath: string,
    outputPath: string
  ): Promise<AudioProcessingResult> {
    logger.info({ inputPath, outputPath }, 'Normalizing audio levels');

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters([
          'loudnorm=I=-16:LRA=11:TP=-1.5',
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          logger.debug({ cmd }, 'FFmpeg normalize started');
        })
        .on('end', async () => {
          const stats = await fs.stat(outputPath);
          const info = await this.getAudioInfo(outputPath);

          logger.info({ outputPath }, 'Audio normalization complete');

          resolve({
            outputPath,
            fileSizeBytes: stats.size,
            durationSeconds: info.duration,
            metadata: {
              format: this.getFormatFromPath(outputPath),
              bitrate: '192k',
              sampleRate: 44100,
              channels: info.channels,
            },
          });
        })
        .on('error', (err) => {
          logger.error({ error: err.message }, 'FFmpeg normalize failed');
          reject(new Error(`Audio normalization failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Add background music to audio
   *
   * @param voicePath - Path to voice audio
   * @param musicPath - Path to background music
   * @param outputPath - Path for the output file
   * @param musicVolume - Volume level for music (0-1)
   * @returns Processing result
   */
  async addBackgroundMusic(
    voicePath: string,
    musicPath: string,
    outputPath: string,
    musicVolume: number = 0.1
  ): Promise<AudioProcessingResult> {
    logger.info(
      { voicePath, musicPath, outputPath, musicVolume },
      'Adding background music'
    );

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(voicePath)
        .input(musicPath)
        .complexFilter([
          `[1:a]volume=${musicVolume},aloop=loop=-1:size=2e+09[music]`,
          `[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[out]`,
        ])
        .outputOptions(['-map', '[out]'])
        .output(outputPath)
        .on('start', (cmd) => {
          logger.debug({ cmd }, 'FFmpeg mix started');
        })
        .on('end', async () => {
          const stats = await fs.stat(outputPath);
          const info = await this.getAudioInfo(outputPath);

          logger.info({ outputPath }, 'Background music added');

          resolve({
            outputPath,
            fileSizeBytes: stats.size,
            durationSeconds: info.duration,
            metadata: {
              format: this.getFormatFromPath(outputPath),
              bitrate: '192k',
              sampleRate: 44100,
              channels: info.channels,
            },
          });
        })
        .on('error', (err) => {
          logger.error({ error: err.message }, 'FFmpeg mix failed');
          reject(new Error(`Background music mixing failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Add silence/padding between audio files
   *
   * @param inputPath - Path to input audio
   * @param outputPath - Path for output
   * @param startPadMs - Silence to add at start (ms)
   * @param endPadMs - Silence to add at end (ms)
   * @returns Processing result
   */
  async addSilencePadding(
    inputPath: string,
    outputPath: string,
    startPadMs: number = 0,
    endPadMs: number = 0
  ): Promise<AudioProcessingResult> {
    logger.info(
      { inputPath, startPadMs, endPadMs },
      'Adding silence padding'
    );

    const filters: string[] = [];

    if (startPadMs > 0) {
      filters.push(`adelay=${startPadMs}|${startPadMs}`);
    }

    if (endPadMs > 0) {
      filters.push(`apad=pad_dur=${endPadMs / 1000}`);
    }

    if (filters.length === 0) {
      // No padding needed, just copy
      await fs.copyFile(inputPath, outputPath);
      const stats = await fs.stat(outputPath);
      const info = await this.getAudioInfo(outputPath);

      return {
        outputPath,
        fileSizeBytes: stats.size,
        durationSeconds: info.duration,
        metadata: {
          format: this.getFormatFromPath(outputPath),
          bitrate: '192k',
          sampleRate: 44100,
          channels: info.channels,
        },
      };
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters(filters)
        .output(outputPath)
        .on('end', async () => {
          const stats = await fs.stat(outputPath);
          const info = await this.getAudioInfo(outputPath);

          resolve({
            outputPath,
            fileSizeBytes: stats.size,
            durationSeconds: info.duration,
            metadata: {
              format: this.getFormatFromPath(outputPath),
              bitrate: '192k',
              sampleRate: 44100,
              channels: info.channels,
            },
          });
        })
        .on('error', (err) => {
          reject(new Error(`Silence padding failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Generate a silence audio file
   *
   * Uses raw PCM generation instead of lavfi filter for Alpine Linux compatibility.
   *
   * @param durationMs - Duration of silence in milliseconds
   * @param outputPath - Path for the output file
   * @returns Path to the silence file
   */
  async generateSilence(durationMs: number, outputPath: string): Promise<string> {
    const sampleRate = 44100;
    const channels = 2;
    const bytesPerSample = 2; // 16-bit
    const totalSamples = Math.ceil((durationMs / 1000) * sampleRate);
    const totalBytes = totalSamples * channels * bytesPerSample;

    logger.debug({ durationMs, outputPath, totalBytes }, 'Generating silence');

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Generate raw PCM silence data (all zeros = silence)
    // For large files, generate in chunks to avoid memory issues
    const rawPath = outputPath + '.raw';
    const chunkSize = 1024 * 1024; // 1MB chunks
    let remaining = totalBytes;

    // Create/truncate the file
    await fs.writeFile(rawPath, Buffer.alloc(0));

    // Write silence in chunks
    while (remaining > 0) {
      const size = Math.min(remaining, chunkSize);
      const chunk = Buffer.alloc(size, 0); // All zeros = silence
      await fs.appendFile(rawPath, chunk);
      remaining -= size;
    }

    // Convert raw PCM to MP3 using FFmpeg
    return new Promise((resolve, reject) => {
      ffmpeg(rawPath)
        .inputOptions([
          '-f', 's16le',           // 16-bit signed little-endian PCM
          '-ar', String(sampleRate),
          '-ac', String(channels),
        ])
        .audioCodec('libmp3lame')
        .outputOptions(['-b:a', '192k'])
        .output(outputPath)
        .on('end', async () => {
          // Clean up raw file
          await fs.unlink(rawPath).catch(() => {});
          resolve(outputPath);
        })
        .on('error', async (err) => {
          // Clean up raw file on error too
          await fs.unlink(rawPath).catch(() => {});
          reject(new Error(`Silence generation failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Convert audio to a different format
   *
   * @param inputPath - Path to input audio
   * @param outputPath - Path for output
   * @param format - Target audio format
   * @returns Processing result
   */
  async convertFormat(
    inputPath: string,
    outputPath: string,
    format: AudioFormat
  ): Promise<AudioProcessingResult> {
    const encoding = ENCODING_SETTINGS[format];

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec(encoding.codec)
        .outputOptions(encoding.options)
        .output(outputPath)
        .on('end', async () => {
          const stats = await fs.stat(outputPath);
          const info = await this.getAudioInfo(outputPath);

          resolve({
            outputPath,
            fileSizeBytes: stats.size,
            durationSeconds: info.duration,
            metadata: {
              format,
              bitrate: '192k',
              sampleRate: 44100,
              channels: info.channels,
            },
          });
        })
        .on('error', (err) => {
          reject(new Error(`Format conversion failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Get audio file information
   *
   * @param filePath - Path to audio file
   * @returns Audio metadata
   */
  async getAudioInfo(filePath: string): Promise<{
    duration: number;
    channels: number;
    sampleRate: number;
    bitrate: number;
  }> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          // Return defaults if probe fails
          resolve({
            duration: 0,
            channels: 2,
            sampleRate: 44100,
            bitrate: 192000,
          });
          return;
        }

        const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration || 0,
          channels: audioStream?.channels || 2,
          sampleRate: audioStream?.sample_rate
            ? parseInt(audioStream.sample_rate.toString(), 10)
            : 44100,
          bitrate: metadata.format.bit_rate || 192000,
        });
      });
    });
  }

  /**
   * Create temporary working directory
   */
  async createTempDir(jobId: string): Promise<string> {
    const dir = path.join(this.tempDir, jobId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Clean up temporary files
   *
   * @param dir - Directory to clean
   * @param keepFiles - Files to keep (by name)
   */
  async cleanup(dir: string, keepFiles: string[] = []): Promise<void> {
    logger.debug({ dir, keepFiles }, 'Cleaning up temporary files');

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        if (!keepFiles.includes(file)) {
          await fs.unlink(path.join(dir, file)).catch(() => {});
        }
      }

      // Remove directory if empty or only keeping one file
      const remaining = await fs.readdir(dir);
      if (remaining.length === 0) {
        await fs.rmdir(dir).catch(() => {});
      }
    } catch (error) {
      logger.warn({ dir, error }, 'Cleanup failed');
    }
  }

  /**
   * Get format from file path extension
   */
  private getFormatFromPath(filePath: string): AudioFormat {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return (ext as AudioFormat) || 'mp3';
  }
}

/**
 * Create a new AudioProcessor instance
 */
export function createAudioProcessor(
  config?: AudioProcessorConfig
): AudioProcessor {
  return new AudioProcessor(config);
}
