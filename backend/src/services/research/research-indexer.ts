/**
 * Research Indexer
 * Indexes research results into the vector database for RAG retrieval
 */

import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import { VectorDBClient, VectorEntry } from '../../types/vector-db.js';
import { EmbeddingService } from './embedding-service.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { EpisodeProposal, ResearchResult, ResearchSource } from '../../types/duelogic-research.js';

const logger = pino({
  name: 'research-indexer',
  level: process.env.LOG_LEVEL || 'info',
});

export class ResearchIndexer {
  constructor(
    private vectorDB: VectorDBClient,
    private embeddingService: EmbeddingService,
    private researchRepo: ResearchRepository
  ) {}

  /**
   * Index all research for an approved episode
   */
  async indexEpisodeResearch(proposal: EpisodeProposal): Promise<number> {
    if (!proposal.researchResultId) {
      logger.warn(`Proposal ${proposal.id} has no research result`);
      return 0;
    }

    const episodeId = proposal.id;
    const research = await this.researchRepo.findResultById(proposal.researchResultId);

    if (!research) {
      logger.warn(`Research result ${proposal.researchResultId} not found`);
      return 0;
    }

    // Prepare text chunks from sources
    const chunks = this.prepareChunks(research, episodeId);

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
   * Prepare text chunks from research sources
   */
  private prepareChunks(
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
          chunks.push({
            id: uuidv4(),
            episodeId,
            researchResultId: research.id,
            content: `From ${source.title}: ${additionalChunks[i]}`,
            metadata: {
              sourceUrl: source.url,
              sourceTitle: source.title,
              sourceDomain: source.domain,
              publishedAt: source.publishedAt,
              category: research.category,
              excerpt: additionalChunks[i],
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
      parts.push(`Published: ${source.publishedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`);
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
