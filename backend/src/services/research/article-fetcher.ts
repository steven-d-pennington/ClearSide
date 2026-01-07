/**
 * Article Fetcher
 * Fetches and extracts full article content from URLs for enhanced RAG indexing
 */

import { extract } from '@extractus/article-extractor';
import pino from 'pino';

const logger = pino({
  name: 'article-fetcher',
  level: process.env.LOG_LEVEL || 'info',
});

export interface FetchedArticle {
  url: string;
  title: string;
  content: string;
  description?: string;
  author?: string;
  publishedAt?: Date;
  source?: string;
  wordCount: number;
  fetchedAt: Date;
  success: boolean;
  error?: string;
}

export interface ArticleFetcherConfig {
  /** Maximum time to wait for article fetch (ms) */
  timeoutMs: number;
  /** Maximum content length to extract (characters) */
  maxContentLength: number;
  /** Domains to skip (paywalled, problematic, etc.) */
  blockedDomains: string[];
  /** Whether to retry failed fetches */
  retryOnFailure: boolean;
  /** Delay between retries (ms) */
  retryDelayMs: number;
}

export const DEFAULT_FETCHER_CONFIG: ArticleFetcherConfig = {
  timeoutMs: 15000,
  maxContentLength: 50000, // ~10,000 words
  blockedDomains: [
    'twitter.com',
    'x.com',
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'youtube.com',
    'reddit.com',
  ],
  retryOnFailure: true,
  retryDelayMs: 1000,
};

export class ArticleFetcher {
  private config: ArticleFetcherConfig;

  constructor(config?: Partial<ArticleFetcherConfig>) {
    this.config = { ...DEFAULT_FETCHER_CONFIG, ...config };
  }

  /**
   * Fetch a single article from URL
   */
  async fetchArticle(url: string): Promise<FetchedArticle> {
    const startTime = Date.now();

    // Check blocked domains
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      if (this.config.blockedDomains.some(blocked => domain.includes(blocked))) {
        return {
          url,
          title: '',
          content: '',
          wordCount: 0,
          fetchedAt: new Date(),
          success: false,
          error: `Domain ${domain} is blocked`,
        };
      }
    } catch {
      return {
        url,
        title: '',
        content: '',
        wordCount: 0,
        fetchedAt: new Date(),
        success: false,
        error: 'Invalid URL',
      };
    }

    try {
      logger.debug({ url }, 'Fetching article');

      const article = await extract(url, {
        // @ts-expect-error - timeout option exists but not in types
        timeout: this.config.timeoutMs,
      });

      if (!article || !article.content) {
        return {
          url,
          title: article?.title || '',
          content: '',
          wordCount: 0,
          fetchedAt: new Date(),
          success: false,
          error: 'No content extracted',
        };
      }

      // Truncate if too long
      let content = article.content;
      if (content.length > this.config.maxContentLength) {
        content = content.slice(0, this.config.maxContentLength) + '...';
      }

      // Clean up content - remove excessive whitespace
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

      const wordCount = content.split(/\s+/).length;

      logger.info({
        url,
        title: article.title,
        wordCount,
        durationMs: Date.now() - startTime,
      }, 'Article fetched successfully');

      return {
        url,
        title: article.title || '',
        content,
        description: article.description || undefined,
        author: article.author || undefined,
        publishedAt: article.published ? new Date(article.published) : undefined,
        source: article.source || undefined,
        wordCount,
        fetchedAt: new Date(),
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn({ url, error: errorMessage }, 'Failed to fetch article');

      return {
        url,
        title: '',
        content: '',
        wordCount: 0,
        fetchedAt: new Date(),
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Fetch multiple articles in parallel with rate limiting
   */
  async fetchArticles(
    urls: string[],
    options?: { concurrency?: number; delayMs?: number }
  ): Promise<FetchedArticle[]> {
    const concurrency = options?.concurrency || 3;
    const delayMs = options?.delayMs || 500;
    const results: FetchedArticle[] = [];

    // Process in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(url => this.fetchArticle(url))
      );

      results.push(...batchResults);

      // Delay between batches (except for last batch)
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info({
      total: urls.length,
      success: successCount,
      failed: urls.length - successCount,
    }, 'Batch article fetch complete');

    return results;
  }

  /**
   * Split article content into chunks for embedding
   */
  chunkArticle(
    article: FetchedArticle,
    maxChunkSize: number = 1000
  ): string[] {
    if (!article.content || article.content.length === 0) {
      return [];
    }

    const chunks: string[] = [];
    const paragraphs = article.content.split(/\n\n+/);
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed max size, save current chunk
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If a single paragraph exceeds max size, split by sentences
      if (paragraph.length > maxChunkSize) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          currentChunk += sentence + ' ';
        }
      } else {
        currentChunk += paragraph + '\n\n';
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

// Factory function
export function createArticleFetcher(
  config?: Partial<ArticleFetcherConfig>
): ArticleFetcher {
  return new ArticleFetcher(config);
}
