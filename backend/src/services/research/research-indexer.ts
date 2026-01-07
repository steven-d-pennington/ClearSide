/**
 * Research Indexer
 * Indexes research results into the vector database for RAG retrieval
 * Supports both excerpt-only and full-article indexing modes
 */

import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import { VectorDBClient, VectorEntry } from '../../types/vector-db.js';
import { EmbeddingService } from './embedding-service.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { EpisodeProposal, ResearchResult, ResearchSource } from '../../types/duelogic-research.js';
import { ArticleFetcher, createArticleFetcher, FetchedArticle } from './article-fetcher.js';

const logger = pino({
  name: 'research-indexer',
  level: process.env.LOG_LEVEL || 'info',
});

export interface IndexerConfig {
  /** Fetch full articles from source URLs (slower but more comprehensive) */
  fetchFullArticles: boolean;
  /** Maximum chunk size for article content */
  maxChunkSize: number;
  /** Concurrency for article fetching */
  fetchConcurrency: number;
}

export const DEFAULT_INDEXER_CONFIG: IndexerConfig = {
  fetchFullArticles: process.env.FETCH_FULL_ARTICLES === 'true',
  maxChunkSize: 1000,
  fetchConcurrency: 3,
};

export class ResearchIndexer {
  private config: IndexerConfig;
  private articleFetcher: ArticleFetcher;

  constructor(
    private vectorDB: VectorDBClient,
    private embeddingService: EmbeddingService,
    private researchRepo: ResearchRepository,
    config?: Partial<IndexerConfig>
  ) {
    this.config = { ...DEFAULT_INDEXER_CONFIG, ...config };
    this.articleFetcher = createArticleFetcher();
  }

  /**
   * Index all research for an approved episode
   */
  async indexEpisodeResearch(proposal: EpisodeProposal): Promise<number> {
    logger.info({ proposalId: proposal.id, researchResultId: proposal.researchResultId }, 'Starting research indexing');

    if (!proposal.researchResultId) {
      logger.warn(`Proposal ${proposal.id} has no research result`);
      return 0;
    }

    const episodeId = proposal.id;
    logger.info({ episodeId, researchResultId: proposal.researchResultId }, 'Looking up research result');

    const research = await this.researchRepo.findResultById(proposal.researchResultId);

    if (!research) {
      logger.warn(`Research result ${proposal.researchResultId} not found`);
      return 0;
    }

    logger.info({ researchId: research.id, sourceCount: research.sources.length }, 'Research result found');

    // Prepare text chunks from sources (excerpts)
    let chunks = this.prepareExcerptChunks(research, episodeId);

    // Optionally fetch and add full article content
    if (this.config.fetchFullArticles) {
      logger.info({ episodeId, sourceCount: research.sources.length }, 'Fetching full articles');
      const articleChunks = await this.fetchAndChunkArticles(research, episodeId);
      chunks = [...chunks, ...articleChunks];
      logger.info({ episodeId, articleChunks: articleChunks.length }, 'Full articles fetched and chunked');
    }

    if (chunks.length === 0) {
      logger.info(`No chunks to index for episode ${episodeId}`);
      return 0;
    }

    // Generate embeddings
    const texts = chunks.map(c => c.content);
    logger.info(`Generating embeddings for ${texts.length} chunks`);
    const embeddings = await this.embeddingService.embedBatch(texts);

    // Add embeddings to entries
    const entries: VectorEntry[] = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    // Upsert to vector database
    await this.vectorDB.upsert(entries);

    logger.info(`Indexed ${entries.length} chunks for episode ${episodeId}`);
    return entries.length;
  }

  /**
   * Fetch full articles and create chunks
   */
  private async fetchAndChunkArticles(
    research: ResearchResult,
    episodeId: string
  ): Promise<Omit<VectorEntry, 'embedding'>[]> {
    const chunks: Omit<VectorEntry, 'embedding'>[] = [];

    // Get unique URLs
    const urls = research.sources
      .map(s => s.url)
      .filter(url => url && url.startsWith('http'));

    if (urls.length === 0) {
      return chunks;
    }

    // Fetch articles
    const articles = await this.articleFetcher.fetchArticles(urls, {
      concurrency: this.config.fetchConcurrency,
    });

    // Process each successfully fetched article
    for (const article of articles) {
      if (!article.success || !article.content) {
        continue;
      }

      // Find matching source for metadata
      const source = research.sources.find(s => s.url === article.url);

      // Split article into chunks
      const articleChunks = this.articleFetcher.chunkArticle(article, this.config.maxChunkSize);

      for (let i = 0; i < articleChunks.length; i++) {
        const chunkContent = articleChunks[i];
        if (!chunkContent || chunkContent.length < 50) continue;

        chunks.push({
          id: uuidv4(),
          episodeId,
          researchResultId: research.id,
          content: this.formatArticleChunk(article, chunkContent, i + 1, articleChunks.length),
          metadata: {
            sourceUrl: article.url,
            sourceTitle: article.title || source?.title || 'Unknown',
            sourceDomain: source?.domain || this.extractDomain(article.url),
            publishedAt: article.publishedAt || source?.publishedAt,
            category: research.category,
            excerpt: chunkContent.slice(0, 200),
          },
        });
      }
    }

    return chunks;
  }

  /**
   * Format article chunk with context
   */
  private formatArticleChunk(
    article: FetchedArticle,
    content: string,
    chunkNum: number,
    totalChunks: number
  ): string {
    const parts = [
      `Source: ${article.title}`,
      `Section: ${chunkNum} of ${totalChunks}`,
    ];

    if (article.publishedAt) {
      // Handle both Date objects and ISO strings
      const pubDate = article.publishedAt instanceof Date
        ? article.publishedAt
        : new Date(article.publishedAt);

      if (!isNaN(pubDate.getTime())) {
        parts.push(`Published: ${pubDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`);
      }
    }

    if (article.author) {
      parts.push(`Author: ${article.author}`);
    }

    parts.push(`Content: ${content}`);

    return parts.join('\n');
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  /**
   * Prepare text chunks from research excerpts (original behavior)
   */
  private prepareExcerptChunks(
    research: ResearchResult,
    episodeId: string
  ): Omit<VectorEntry, 'embedding'>[] {
    const chunks: Omit<VectorEntry, 'embedding'>[] = [];

    // Add summary as a chunk
    chunks.push({
      id: uuidv4(),
      episodeId,
      researchResultId: research.id,
      content: `Topic Summary: ${research.summary}`,
      metadata: {
        sourceUrl: '',
        sourceTitle: 'Research Summary',
        sourceDomain: 'internal',
        category: research.category,
        excerpt: research.summary.slice(0, 200),
      },
    });

    // Add each source as chunks
    for (const source of research.sources) {
      // Main excerpt chunk
      if (source.excerpt && source.excerpt.length > 20) {
        chunks.push({
          id: uuidv4(),
          episodeId,
          researchResultId: research.id,
          content: this.formatSourceContent(source),
          metadata: {
            sourceUrl: source.url,
            sourceTitle: source.title,
            sourceDomain: source.domain,
            publishedAt: source.publishedAt,
            category: research.category,
            excerpt: source.excerpt,
          },
        });
      }

      // If excerpt is long, create additional chunks
      if (source.excerpt && source.excerpt.length > 500) {
        const additionalChunks = this.splitIntoChunks(source.excerpt, 500);
        for (let i = 1; i < additionalChunks.length; i++) {
          const chunkText = additionalChunks[i];
          if (!chunkText) continue;
          chunks.push({
            id: uuidv4(),
            episodeId,
            researchResultId: research.id,
            content: `From ${source.title}: ${chunkText}`,
            metadata: {
              sourceUrl: source.url,
              sourceTitle: source.title,
              sourceDomain: source.domain,
              publishedAt: source.publishedAt,
              category: research.category,
              excerpt: chunkText,
            },
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Format source content for embedding
   */
  private formatSourceContent(source: ResearchSource): string {
    const parts = [
      `Source: ${source.title}`,
      `Domain: ${source.domain}`,
    ];

    if (source.publishedAt) {
      // Handle both Date objects and ISO strings from database
      const pubDate = source.publishedAt instanceof Date
        ? source.publishedAt
        : new Date(source.publishedAt);

      if (!isNaN(pubDate.getTime())) {
        parts.push(`Published: ${pubDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`);
      }
    }

    parts.push(`Content: ${source.excerpt}`);

    return parts.join('\n');
  }

  /**
   * Split text into chunks of approximately maxSize characters
   */
  private splitIntoChunks(text: string, maxSize: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += sentence;
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Remove indexed research for an episode
   */
  async removeEpisodeResearch(episodeId: string): Promise<void> {
    await this.vectorDB.deleteByEpisode(episodeId);
    logger.info(`Removed indexed research for episode ${episodeId}`);
  }

  /**
   * Check if episode has indexed research
   */
  async hasIndexedResearch(episodeId: string): Promise<boolean> {
    return this.vectorDB.hasIndexedResearch(episodeId);
  }
}
