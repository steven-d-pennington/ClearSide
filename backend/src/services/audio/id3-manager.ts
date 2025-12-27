/**
 * ID3 Tag Manager
 *
 * Manages ID3 tags for MP3 files including metadata and chapter markers.
 * Uses node-id3 for tag manipulation.
 *
 * @see tasks/phase2/audio-export/AUDIO-004.md
 */

import NodeID3 from 'node-id3';
import pino from 'pino';
import type { ID3Tags, ChapterMarker } from './types.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'id3-manager',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Extended ID3 tags with chapter support
 */
interface ExtendedID3Tags extends NodeID3.Tags {
  chapter?: NodeID3.Tags['chapter'];
  tableOfContents?: Array<{
    elementID: string;
    isOrdered?: boolean;
    elements?: string[];
    tags?: {
      title?: string;
    };
  }>;
}

/**
 * ID3 Manager Configuration
 */
export interface ID3ManagerConfig {
  /** Default artist name */
  defaultArtist?: string;
  /** Default album name */
  defaultAlbum?: string;
  /** Default genre */
  defaultGenre?: string;
}

/**
 * ID3 Tag Manager Class
 *
 * Provides ID3 tag manipulation for MP3 files
 */
export class ID3Manager {
  private readonly defaultArtist: string;
  private readonly defaultAlbum: string;
  private readonly defaultGenre: string;

  constructor(config: ID3ManagerConfig = {}) {
    this.defaultArtist = config.defaultArtist || 'ClearSide AI Debate';
    this.defaultAlbum = config.defaultAlbum || 'Debate Analysis';
    this.defaultGenre = config.defaultGenre || 'Podcast';

    logger.info('ID3 manager initialized');
  }

  /**
   * Write ID3 tags to an MP3 file
   *
   * @param filePath - Path to the MP3 file
   * @param tags - ID3 tags to write
   * @returns Success status
   */
  async writeTags(filePath: string, tags: ID3Tags): Promise<boolean> {
    logger.info({ filePath, title: tags.title }, 'Writing ID3 tags');

    try {
      const id3Tags: NodeID3.Tags = {
        title: tags.title,
        artist: tags.artist || this.defaultArtist,
        album: tags.album || this.defaultAlbum,
        year: tags.year || new Date().getFullYear().toString(),
        genre: tags.genre || this.defaultGenre,
        comment: {
          language: 'eng',
          text: tags.comment,
        },
        trackNumber: tags.trackNumber,
      };

      // Add cover art if provided
      if (tags.image) {
        id3Tags.image = {
          mime: 'image/png',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: tags.image,
        };
      }

      const success = NodeID3.write(id3Tags, filePath);

      if (success) {
        logger.info({ filePath }, 'ID3 tags written successfully');
      } else {
        logger.warn({ filePath }, 'Failed to write ID3 tags');
      }

      return !!success;
    } catch (error) {
      logger.error({ error, filePath }, 'Error writing ID3 tags');
      throw new Error(
        `Failed to write ID3 tags: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Write ID3 tags with chapter markers
   *
   * @param filePath - Path to the MP3 file
   * @param tags - Basic ID3 tags
   * @param chapters - Chapter markers
   * @returns Success status
   */
  async writeTagsWithChapters(
    filePath: string,
    tags: ID3Tags,
    chapters: ChapterMarker[]
  ): Promise<boolean> {
    logger.info(
      { filePath, title: tags.title, chapterCount: chapters.length },
      'Writing ID3 tags with chapters'
    );

    try {
      // Build chapter tags
      const chapterTags: ExtendedID3Tags['chapter'] = chapters.map(
        (chapter, index) => ({
          elementID: `chap${index}`,
          startTimeMs: chapter.startTimeMs,
          endTimeMs: chapter.endTimeMs,
          tags: {
            title: chapter.title,
          },
        })
      );

      // Build table of contents
      const tocElements = chapters.map((_, index) => `chap${index}`);

      const id3Tags: ExtendedID3Tags = {
        title: tags.title,
        artist: tags.artist || this.defaultArtist,
        album: tags.album || this.defaultAlbum,
        year: tags.year || new Date().getFullYear().toString(),
        genre: tags.genre || this.defaultGenre,
        comment: {
          language: 'eng',
          text: tags.comment,
        },
        trackNumber: tags.trackNumber,
        chapter: chapterTags,
        tableOfContents: [
          {
            elementID: 'toc',
            isOrdered: true,
            elements: tocElements,
            tags: {
              title: 'Table of Contents',
            },
          },
        ],
      };

      // Add cover art if provided
      if (tags.image) {
        id3Tags.image = {
          mime: 'image/png',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: tags.image,
        };
      }

      const success = NodeID3.write(id3Tags as NodeID3.Tags, filePath);

      if (success) {
        logger.info(
          { filePath, chapterCount: chapters.length },
          'ID3 tags with chapters written successfully'
        );
      } else {
        logger.warn({ filePath }, 'Failed to write ID3 tags with chapters');
      }

      return !!success;
    } catch (error) {
      logger.error({ error, filePath }, 'Error writing ID3 tags with chapters');
      throw new Error(
        `Failed to write ID3 tags: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read ID3 tags from an MP3 file
   *
   * @param filePath - Path to the MP3 file
   * @returns ID3 tags
   */
  async readTags(filePath: string): Promise<ID3Tags | null> {
    logger.debug({ filePath }, 'Reading ID3 tags');

    try {
      const tags = NodeID3.read(filePath);

      if (!tags) {
        return null;
      }

      return {
        title: tags.title || '',
        artist: tags.artist || '',
        album: tags.album || '',
        year: tags.year || '',
        genre: tags.genre || '',
        comment:
          typeof tags.comment === 'object'
            ? tags.comment.text || ''
            : tags.comment || '',
        trackNumber: tags.trackNumber,
        image:
          tags.image && typeof tags.image === 'object'
            ? (tags.image as { imageBuffer?: Buffer }).imageBuffer
            : undefined,
      };
    } catch (error) {
      logger.error({ error, filePath }, 'Error reading ID3 tags');
      return null;
    }
  }

  /**
   * Remove all ID3 tags from an MP3 file
   *
   * @param filePath - Path to the MP3 file
   * @returns Success status
   */
  async removeTags(filePath: string): Promise<boolean> {
    logger.debug({ filePath }, 'Removing ID3 tags');

    try {
      const success = NodeID3.removeTags(filePath);
      return !!success;
    } catch (error) {
      logger.error({ error, filePath }, 'Error removing ID3 tags');
      return false;
    }
  }

  /**
   * Generate default tags for a debate
   *
   * @param debateId - Debate ID
   * @param proposition - Debate proposition
   * @returns Default ID3 tags
   */
  generateDebateTags(debateId: string, proposition: string): ID3Tags {
    // Truncate proposition for title if too long
    const title =
      proposition.length > 100
        ? proposition.substring(0, 97) + '...'
        : proposition;

    return {
      title,
      artist: this.defaultArtist,
      album: this.defaultAlbum,
      year: new Date().getFullYear().toString(),
      genre: this.defaultGenre,
      comment: `Debate ID: ${debateId}. Generated by ClearSide on ${new Date().toISOString()}. Think both sides. Decide with clarity.`,
    };
  }

  /**
   * Generate cover art for a debate (placeholder)
   *
   * This is a placeholder that returns undefined.
   * In production, you would generate or fetch actual cover art.
   *
   * @param _proposition - Debate proposition (unused)
   * @returns Cover art buffer or undefined
   */
  async generateCoverArt(_proposition: string): Promise<Buffer | undefined> {
    // Placeholder - in production, generate cover art
    // Could use Canvas, Sharp, or fetch from a service
    logger.debug('Cover art generation not implemented');
    return undefined;
  }
}

/**
 * Create a new ID3Manager instance
 */
export function createID3Manager(config?: ID3ManagerConfig): ID3Manager {
  return new ID3Manager(config);
}
