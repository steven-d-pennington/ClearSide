/**
 * Reaction Library Service
 *
 * Manages a library of pre-generated short audio reaction clips
 * (e.g., "Mm-hmm", "Exactly", "That's right") for each voice.
 * These clips are layered over podcast audio during assembly to
 * create the illusion of a shared room.
 */

import { promises as fs } from 'fs';
import path from 'path';
import pino from 'pino';
import type { ITTSService } from './types.js';
import { getTTSService, isProviderAvailable } from './tts-provider-factory.js';
import type {
  ReactionCategory,
  ReactionClip,
  ReactionLibraryManifest,
  ReactionClipManifest,
} from '../../types/reactions.js';
import { REACTION_PHRASES as PHRASES } from '../../types/reactions.js';

const logger = pino({
  name: 'reaction-library',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Default directory for storing reaction audio clips
 */
const DEFAULT_REACTIONS_DIR = './assets/reactions';

/**
 * Manifest filename
 */
const MANIFEST_FILENAME = 'manifest.json';

/**
 * Reaction Library Configuration
 */
export interface ReactionLibraryConfig {
  /** Directory to store reaction clips */
  reactionsDir?: string;
  /** TTS provider to use for generating clips */
  ttsProvider?: 'elevenlabs' | 'gemini' | 'vertex' | 'google-cloud-long';
}

/**
 * Reaction Library Service
 *
 * Manages pre-generated reaction audio clips for podcast cross-talk.
 */
export class ReactionLibrary {
  private readonly reactionsDir: string;
  private readonly ttsProvider: 'elevenlabs' | 'gemini' | 'vertex' | 'google-cloud-long';
  private manifest: ReactionLibraryManifest | null = null;
  private ttsService: ITTSService | null = null;

  constructor(config: ReactionLibraryConfig = {}) {
    this.reactionsDir = config.reactionsDir || DEFAULT_REACTIONS_DIR;
    // Default to vertex (best quality) if service account available, otherwise gemini
    this.ttsProvider = config.ttsProvider ||
      (process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON ? 'vertex' : 'gemini');

    logger.info({
      reactionsDir: this.reactionsDir,
      ttsProvider: this.ttsProvider,
    }, 'Reaction library initialized');
  }

  /**
   * Load the manifest from disk (or create empty if doesn't exist)
   */
  private async loadManifest(): Promise<ReactionLibraryManifest> {
    if (this.manifest) {
      return this.manifest;
    }

    const manifestPath = path.join(this.reactionsDir, MANIFEST_FILENAME);

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      this.manifest = JSON.parse(content) as ReactionLibraryManifest;
      logger.debug({ voiceCount: Object.keys(this.manifest.voices).length }, 'Manifest loaded');
      return this.manifest;
    } catch {
      // Create empty manifest
      this.manifest = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        voices: {},
      };
      return this.manifest;
    }
  }

  /**
   * Save the manifest to disk
   */
  private async saveManifest(): Promise<void> {
    if (!this.manifest) return;

    await fs.mkdir(this.reactionsDir, { recursive: true });
    const manifestPath = path.join(this.reactionsDir, MANIFEST_FILENAME);

    this.manifest.updatedAt = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');

    logger.debug({ manifestPath }, 'Manifest saved');
  }

  /**
   * Get or create TTS service
   */
  private getTTS(): ITTSService {
    if (this.ttsService) {
      return this.ttsService;
    }

    if (!isProviderAvailable(this.ttsProvider)) {
      throw new Error(
        `TTS provider '${this.ttsProvider}' is not available. ` +
        `Please configure the required API key.`
      );
    }

    this.ttsService = getTTSService(this.ttsProvider);
    return this.ttsService;
  }

  /**
   * Check if reactions have been generated for a voice
   */
  async hasReactionsForVoice(voiceId: string): Promise<boolean> {
    const manifest = await this.loadManifest();
    const voiceManifest = manifest.voices[voiceId];

    if (!voiceManifest) {
      return false;
    }

    // Verify at least some clips exist on disk
    const voiceDir = path.join(this.reactionsDir, voiceId);
    try {
      const files = await fs.readdir(voiceDir);
      return files.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generate all reaction clips for a voice
   *
   * @param voiceId - The voice ID to generate clips for
   * @param voiceName - Optional display name for the voice
   * @param characterContext - Optional character description for TTS styling
   * @returns Number of clips generated
   */
  async generateForVoice(
    voiceId: string,
    voiceName?: string,
    characterContext?: {
      speakingStyle?: string;
      backstory?: string;
      accent?: string;
    }
  ): Promise<number> {
    logger.info({ voiceId, voiceName, hasCharacterContext: !!characterContext, phraseCount: PHRASES.length }, 'Generating reaction clips');

    const tts = this.getTTS();
    const voiceDir = path.join(this.reactionsDir, voiceId);
    await fs.mkdir(voiceDir, { recursive: true });

    const clips: ReactionClipManifest[] = [];
    let generated = 0;

    for (const phrase of PHRASES) {
      const filename = this.getClipFilename(phrase.category, phrase.text);
      const filepath = path.join(voiceDir, filename);

      try {
        // Check if clip already exists
        try {
          await fs.access(filepath);
          logger.debug({ voiceId, phrase: phrase.text }, 'Clip already exists, skipping');

          // Add to manifest anyway
          clips.push({
            filename,
            text: phrase.text,
            category: phrase.category,
            durationMs: phrase.durationEstimateMs, // Use estimate if already exists
          });
          continue;
        } catch {
          // File doesn't exist, generate it
        }

        // Generate the clip with retry logic for rate limits
        logger.debug({ voiceId, phrase: phrase.text }, 'Generating reaction clip');

        // Build prompt with director's notes if character context is provided
        let promptText = phrase.text;
        if (characterContext && (characterContext.speakingStyle || characterContext.accent || characterContext.backstory)) {
          const directorsNotes: string[] = [];
          if (voiceName) {
            directorsNotes.push(`Character: ${voiceName}`);
          }
          if (characterContext.accent) {
            directorsNotes.push(`Accent: ${characterContext.accent}`);
          }
          if (characterContext.speakingStyle) {
            directorsNotes.push(`Speaking style: ${characterContext.speakingStyle}`);
          }
          if (characterContext.backstory) {
            // Extract just a brief character description from backstory
            const briefBackstory = characterContext.backstory.split('.').slice(0, 2).join('.') + '.';
            directorsNotes.push(`Background: ${briefBackstory}`);
          }
          directorsNotes.push(`Delivery: Natural, conversational reaction - short and spontaneous`);

          promptText = `#### DIRECTOR'S NOTES\n${directorsNotes.join('\n')}\n\n#### TRANSCRIPT\n${phrase.text}`;
        }

        let result;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
          try {
            // Use generateSpeech with narrator voice type, passing voiceId as custom voice
            result = await tts.generateSpeech(promptText, 'narrator', voiceId);
            break; // Success, exit retry loop
          } catch (ttsError) {
            const errorMsg = ttsError instanceof Error ? ttsError.message : 'Unknown error';

            // Check if it's a rate limit error (429 or contains rate limit text)
            if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate') || errorMsg.toLowerCase().includes('quota')) {
              retries++;
              if (retries < maxRetries) {
                // Exponential backoff: 5s, 15s, 45s
                const backoffMs = 5000 * Math.pow(3, retries - 1);
                logger.warn({
                  voiceId,
                  phrase: phrase.text,
                  retries,
                  backoffMs,
                }, 'Rate limited, backing off before retry');
                await new Promise(resolve => setTimeout(resolve, backoffMs));
              } else {
                throw ttsError; // Max retries exceeded
              }
            } else {
              throw ttsError; // Not a rate limit error, don't retry
            }
          }
        }

        if (!result) {
          throw new Error('Failed to generate after retries');
        }

        // Save the audio
        await fs.writeFile(filepath, result.audioBuffer);

        const stats = await fs.stat(filepath);

        clips.push({
          filename,
          text: phrase.text,
          category: phrase.category,
          durationMs: phrase.durationEstimateMs, // We'll use estimate; could probe with ffprobe for exact
        });

        generated++;
        logger.info({
          voiceId,
          phrase: phrase.text,
          sizeBytes: stats.size,
          progress: `${generated}/${PHRASES.length}`,
        }, 'Reaction clip generated');

        // Delay between requests to avoid rate limiting (1.5 seconds for safety with many phrases)
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        logger.warn({
          voiceId,
          phrase: phrase.text,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed to generate reaction clip');
        // Continue with other clips
      }
    }

    // Update manifest
    const manifest = await this.loadManifest();
    manifest.voices[voiceId] = {
      voiceId,
      voiceName,
      ttsProvider: this.ttsProvider,
      generatedAt: new Date().toISOString(),
      clips,
    };
    await this.saveManifest();

    logger.info({
      voiceId,
      generated,
      total: clips.length,
    }, 'Reaction clips generation complete');

    return generated;
  }

  /**
   * Get a random reaction clip for a voice and category
   *
   * @param voiceId - Voice to get reaction from
   * @param category - Optional category filter
   * @returns Reaction clip info or null if none available
   */
  async getReaction(
    voiceId: string,
    category?: ReactionCategory
  ): Promise<ReactionClip | null> {
    const manifest = await this.loadManifest();
    const voiceManifest = manifest.voices[voiceId];

    if (!voiceManifest || voiceManifest.clips.length === 0) {
      return null;
    }

    // Filter by category if specified
    const candidates = category
      ? voiceManifest.clips.filter(c => c.category === category)
      : voiceManifest.clips;

    if (candidates.length === 0) {
      return null;
    }

    // Pick a random clip
    const clip = candidates[Math.floor(Math.random() * candidates.length)];
    if (!clip) {
      return null;
    }

    const audioPath = path.join(this.reactionsDir, voiceId, clip.filename);

    // Verify file exists
    try {
      const stats = await fs.stat(audioPath);
      return {
        voiceId,
        phrase: {
          text: clip.text,
          category: clip.category,
          durationEstimateMs: clip.durationMs,
        },
        audioPath,
        durationMs: clip.durationMs,
        fileSizeBytes: stats.size,
      };
    } catch {
      logger.warn({ voiceId, clip: clip.filename }, 'Reaction clip file not found');
      return null;
    }
  }

  /**
   * Get all available voice IDs that have reaction clips
   */
  async getAvailableVoices(): Promise<string[]> {
    const manifest = await this.loadManifest();
    return Object.keys(manifest.voices);
  }

  /**
   * Get clip counts by category for a voice
   */
  async getClipCounts(voiceId: string): Promise<Record<ReactionCategory, number>> {
    const manifest = await this.loadManifest();
    const voiceManifest = manifest.voices[voiceId];

    const counts: Record<ReactionCategory, number> = {
      agreement: 0,
      disagreement: 0,
      interest: 0,
      acknowledgment: 0,
      challenge: 0,
      amusement: 0,
      surprise: 0,
      skepticism: 0,
    };

    if (!voiceManifest) {
      return counts;
    }

    for (const clip of voiceManifest.clips) {
      if (clip.category in counts) {
        counts[clip.category]++;
      }
    }

    return counts;
  }

  /**
   * Get all clips for a voice (for admin preview)
   */
  async getAllClipsForVoice(voiceId: string): Promise<Array<{
    category: ReactionCategory;
    text: string;
    filename: string;
    durationMs: number;
  }>> {
    const manifest = await this.loadManifest();
    const voiceManifest = manifest.voices[voiceId];

    if (!voiceManifest) {
      return [];
    }

    return voiceManifest.clips.map(clip => ({
      category: clip.category,
      text: clip.text,
      filename: clip.filename,
      durationMs: clip.durationMs,
    }));
  }

  /**
   * Delete all reaction clips for a voice
   */
  async deleteForVoice(voiceId: string): Promise<void> {
    const voiceDir = path.join(this.reactionsDir, voiceId);

    try {
      await fs.rm(voiceDir, { recursive: true, force: true });

      // Update manifest
      const manifest = await this.loadManifest();
      delete manifest.voices[voiceId];
      await this.saveManifest();

      logger.info({ voiceId }, 'Reaction clips deleted');
    } catch (error) {
      logger.warn({ voiceId, error }, 'Failed to delete reaction clips');
    }
  }

  /**
   * Generate a safe filename for a reaction clip
   */
  private getClipFilename(category: ReactionCategory, text: string): string {
    // Sanitize the text for filename
    const sanitized = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${category}_${sanitized}.mp3`;
  }
}

/**
 * Singleton instance
 */
let defaultLibrary: ReactionLibrary | null = null;

/**
 * Get the default reaction library instance
 */
export function getReactionLibrary(config?: ReactionLibraryConfig): ReactionLibrary {
  if (!defaultLibrary || config) {
    defaultLibrary = new ReactionLibrary(config);
  }
  return defaultLibrary;
}

/**
 * Create a new reaction library instance
 */
export function createReactionLibrary(config?: ReactionLibraryConfig): ReactionLibrary {
  return new ReactionLibrary(config);
}
