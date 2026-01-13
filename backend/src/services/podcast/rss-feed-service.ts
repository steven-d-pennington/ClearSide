/**
 * RSS Feed Service
 *
 * Generates RSS 2.0 podcast feed with iTunes and Podcast 2.0 namespaces.
 * Reads from published_episodes and podcast_feed_metadata tables.
 */

import { Podcast } from 'podcast';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/connection.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'RSSFeedService' });

interface PodcastFeedMetadata {
  title: string;
  description: string;
  author: string;
  email: string | null;
  language: string;
  categories: string[] | null;
  image_url: string;
  website_url: string | null;
  feed_url: string;
  copyright: string | null;
}

interface PublishedEpisodeRow {
  title: string;
  description: string;
  tags: string[] | null;
  explicit: boolean;
  guid: string;
  pub_date: Date;
  audio_url: string;
  duration_seconds: number;
  file_size_bytes: number;
}

export class RSSFeedService {
  private feedPath: string;

  constructor() {
    this.feedPath = path.join(process.cwd(), 'public', 'rss', 'podcast.xml');
  }

  /**
   * Generate RSS feed from database
   */
  async generateFeed(): Promise<void> {
    try {
      logger.info('Generating RSS feed');

      const metaResult = await pool.query<PodcastFeedMetadata>(
        'SELECT * FROM podcast_feed_metadata LIMIT 1'
      );

      if (metaResult.rows.length === 0) {
        throw new Error('Podcast feed metadata not found in database');
      }

      const meta = metaResult.rows[0];

      const episodesResult = await pool.query<PublishedEpisodeRow>(
        `SELECT
          title,
          description,
          tags,
          explicit,
          guid,
          pub_date,
          audio_url,
          duration_seconds,
          file_size_bytes
        FROM published_episodes
        WHERE rss_published_at IS NOT NULL
        ORDER BY pub_date DESC
        LIMIT 100`
      );

      const episodes = episodesResult.rows;

      logger.info({ episodeCount: episodes.length }, 'Loaded episodes from database');

      const feed = new Podcast({
        title: meta.title,
        description: meta.description,
        feedUrl: meta.feed_url,
        siteUrl: meta.website_url || 'https://clearside.app',
        imageUrl: meta.image_url,
        author: meta.author,
        managingEditor: meta.email || undefined,
        webMaster: meta.email || undefined,
        copyright: meta.copyright || `Copyright © ${new Date().getFullYear()} ${meta.author}`,
        language: meta.language,
        categories: meta.categories || [],
        pubDate: new Date(),
        ttl: 60,
        itunesAuthor: meta.author,
        itunesSubtitle: meta.description.slice(0, 100),
        itunesSummary: meta.description,
        itunesOwner: meta.email
          ? {
              name: meta.author,
              email: meta.email,
            }
          : undefined,
        itunesExplicit: false,
        itunesType: 'episodic',
        itunesImage: meta.image_url,
        itunesCategory: this.formatItunesCategories(meta.categories || []),
      });

      for (const episode of episodes) {
        feed.addItem({
          title: episode.title,
          description: episode.description,
          url: this.ensureAbsoluteUrl(episode.audio_url),
          guid: episode.guid,
          date: episode.pub_date,
          enclosure: {
            url: this.ensureAbsoluteUrl(episode.audio_url),
            size: episode.file_size_bytes,
            type: 'audio/mpeg',
          },
          itunesDuration: episode.duration_seconds,
          itunesKeywords: episode.tags || [],
          itunesExplicit: episode.explicit,
          itunesSubtitle: episode.description.slice(0, 100),
          itunesSummary: episode.description,
        });
      }

      const xml = feed.buildXml();

      await fs.mkdir(path.dirname(this.feedPath), { recursive: true });
      await fs.writeFile(this.feedPath, xml, 'utf-8');

      logger.info({
        episodeCount: episodes.length,
        feedPath: this.feedPath,
      }, 'RSS feed generated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Failed to generate RSS feed');
      throw error;
    }
  }

  /**
   * Read existing feed XML
   */
  async readFeed(): Promise<string> {
    try {
      return await fs.readFile(this.feedPath, 'utf-8');
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code === 'ENOENT') {
        await this.generateFeed();
        return await fs.readFile(this.feedPath, 'utf-8');
      }
      throw error;
    }
  }

  private ensureAbsoluteUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const baseUrl = process.env.PODCAST_FEED_BASE_URL || 'https://clearside.app';
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  private formatItunesCategories(categories: string[]): Array<{ text: string; subcats: unknown[] }> {
    return categories.map((category) => ({
      text: category,
      subcats: [],
    }));
  }
}

export function createRSSFeedService(): RSSFeedService {
  return new RSSFeedService();
}
