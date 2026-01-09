/**
 * Microsoft Edge TTS Service (Free)
 *
 * Uses Microsoft Edge's Text-to-Speech API which is completely free
 * and doesn't require any API key. This is the same TTS engine used
 * by Microsoft Edge browser's read-aloud feature.
 *
 * Uses the edge-tts npm package which handles the WebSocket communication.
 *
 * @see https://github.com/rany2/edge-tts
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import pino from 'pino';
import Bottleneck from 'bottleneck';
import type {
  VoiceConfig,
  VoiceType,
  VoiceProfiles,
  TTSResult,
  ITTSService,
  TTSProvider,
} from './types.js';

const exec = promisify(execCallback);

const logger = pino({
  name: 'edge-tts-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Edge TTS voice profiles for debate speakers
 *
 * These are the same voices available in Microsoft Edge's
 * Read Aloud feature - high quality neural voices.
 */
export const EDGE_VOICE_PROFILES: VoiceProfiles = {
  pro: {
    voiceId: 'en-US-JennyNeural', // Clear, professional female
    name: 'Pro Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  con: {
    voiceId: 'en-US-GuyNeural', // Clear, professional male
    name: 'Con Advocate',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.3,
    useSpeakerBoost: true,
  },
  moderator: {
    voiceId: 'en-US-AriaNeural', // Neutral, authoritative
    name: 'Moderator',
    stability: 0.7,
    similarityBoost: 0.8,
    style: 0.2,
    useSpeakerBoost: true,
  },
  narrator: {
    voiceId: 'en-US-ChristopherNeural', // Warm narrator voice
    name: 'Narrator',
    stability: 0.8,
    similarityBoost: 0.75,
    style: 0.1,
    useSpeakerBoost: true,
  },
};

/**
 * Popular Edge TTS voices
 */
export const EDGE_AVAILABLE_VOICES = [
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'en-US-AriaNeural',
  'en-US-DavisNeural',
  'en-US-ChristopherNeural',
  'en-US-EricNeural',
  'en-US-MichelleNeural',
  'en-US-RogerNeural',
  'en-GB-SoniaNeural',
  'en-GB-RyanNeural',
  'en-AU-NatashaNeural',
  'en-AU-WilliamNeural',
];

export interface EdgeTTSConfig {
  /** Rate limit: requests per minute */
  requestsPerMinute?: number;
  /** Retry attempts on failure */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom voice profiles */
  voiceProfiles?: Partial<VoiceProfiles>;
}

/**
 * Edge TTS Service
 *
 * Implements ITTSService using Microsoft Edge's free TTS API.
 * This service uses a Python edge-tts package via subprocess.
 */
export class EdgeTTSService implements ITTSService {
  readonly provider: TTSProvider = 'edge';

  private readonly limiter: Bottleneck;
  private readonly voiceProfiles: VoiceProfiles;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private pythonAvailable: boolean | null = null;

  constructor(config: EdgeTTSConfig = {}) {
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 60000;

    this.voiceProfiles = {
      ...EDGE_VOICE_PROFILES,
      ...config.voiceProfiles,
    };

    // Rate limiter (be gentle to the free API)
    this.limiter = new Bottleneck({
      minTime: Math.ceil(60000 / (config.requestsPerMinute || 30)),
      maxConcurrent: 2,
    });

    logger.info('Edge TTS service initialized');
  }

  /**
   * Check if edge-tts Python package is available
   */
  private async checkPythonAvailable(): Promise<boolean> {
    if (this.pythonAvailable !== null) {
      return this.pythonAvailable;
    }

    try {
      await exec('python3 -c "import edge_tts"');
      this.pythonAvailable = true;
      logger.info('edge-tts Python package is available');
    } catch {
      try {
        await exec('python -c "import edge_tts"');
        this.pythonAvailable = true;
        logger.info('edge-tts Python package is available (python command)');
      } catch {
        this.pythonAvailable = false;
        logger.warn('edge-tts Python package is not installed. Run: pip install edge-tts');
      }
    }

    return this.pythonAvailable;
  }

  isAvailable(): boolean {
    // Edge TTS is always "available" - doesn't need API key
    // But we'll check Python availability on first use
    return true;
  }

  getVoiceConfig(voiceType: VoiceType): VoiceConfig {
    return this.voiceProfiles[voiceType];
  }

  async generateSpeech(text: string, voiceType: VoiceType, _customVoiceId?: string): Promise<TTSResult> {
    // Check Python availability
    const pythonOk = await this.checkPythonAvailable();
    if (!pythonOk) {
      throw new Error(
        'edge-tts requires Python with edge-tts package installed. Run: pip install edge-tts'
      );
    }

    const voice = this.voiceProfiles[voiceType];

    logger.debug(
      { voiceType, voiceId: voice.voiceId, textLength: text.length },
      'Generating speech with Edge TTS'
    );

    return this.limiter.schedule(async () => {
      return this.generateSpeechWithRetry(text, voice);
    });
  }

  private async generateSpeechWithRetry(
    text: string,
    voice: VoiceConfig,
    attempt: number = 1
  ): Promise<TTSResult> {
    // Create temp file for output
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `edge-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

    try {
      const startTime = Date.now();

      // Use edge-tts CLI via Python
      await this.runEdgeTTS(text, voice.voiceId, tempFile);

      // Read the generated audio file
      const audioBuffer = await fs.readFile(tempFile);
      const durationMs = Date.now() - startTime;

      // Estimate audio duration
      const estimatedDuration = (text.length / 5 / 150) * 60 * 1000;

      logger.info(
        {
          voiceId: voice.voiceId,
          textLength: text.length,
          bufferSize: audioBuffer.length,
          processingTime: durationMs,
        },
        'Speech generated successfully via Edge TTS'
      );

      return {
        audioBuffer,
        durationMs: estimatedDuration,
        charactersUsed: text.length,
      };
    } catch (error) {
      const err = error as Error;

      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn(
          { attempt, delay, error: err.message },
          'Edge TTS request failed, retrying'
        );

        await this.sleep(delay);
        return this.generateSpeechWithRetry(text, voice, attempt + 1);
      }

      logger.error(
        {
          voiceId: voice.voiceId,
          error: err.message,
        },
        'Edge TTS generation failed'
      );

      throw new Error(`Edge TTS failed: ${err.message}`);
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run edge-tts via Python subprocess
   */
  private runEdgeTTS(text: string, voiceId: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Python script to run edge-tts
      const pythonScript = `
import asyncio
import edge_tts
import sys

async def main():
    text = sys.argv[1]
    voice = sys.argv[2]
    output = sys.argv[3]

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output)

asyncio.run(main())
`;

      const python = spawn('python3', ['-c', pythonScript, text, voiceId, outputPath], {
        timeout: this.timeout,
      });

      let stderr = '';

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`edge-tts failed with code ${code}: ${stderr}`));
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to spawn edge-tts: ${err.message}`));
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * List available Edge TTS voices
   */
  async listVoices(): Promise<Array<{ name: string; locale: string; gender: string }>> {
    try {
      // Verify edge-tts is available
      await exec('python3 -c "import edge_tts"');
      // Return available voices
      return EDGE_AVAILABLE_VOICES.map((name) => ({
        name,
        locale: name.split('-').slice(0, 2).join('-'),
        gender: name.includes('Jenny') || name.includes('Aria') || name.includes('Sonia') || name.includes('Natasha') || name.includes('Michelle')
          ? 'Female'
          : 'Male',
      }));
    } catch {
      return EDGE_AVAILABLE_VOICES.map((name) => ({
        name,
        locale: name.split('-').slice(0, 2).join('-'),
        gender: 'Unknown',
      }));
    }
  }
}

/**
 * Create Edge TTS service (no configuration needed)
 */
export function createEdgeTTSService(config?: EdgeTTSConfig): EdgeTTSService {
  return new EdgeTTSService(config);
}
