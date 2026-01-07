/**
 * Pinecone Vector Database Client
 * Implements VectorDBClient interface for Pinecone cloud vector database
 */

import { Pinecone, Index } from '@pinecone-database/pinecone';
import pino from 'pino';
import {
  VectorDBClient,
  VectorEntry,
  SearchResult
} from '../../types/vector-db.js';

const logger = pino({
  name: 'pinecone-client',
  level: process.env.LOG_LEVEL || 'info',
});

export interface PineconeConfig {
  apiKey: string;
  indexName: string;
  namespace?: string;
}

export class PineconeClient implements VectorDBClient {
  private client: Pinecone;
  private index: Index;
  private namespace: string;

  constructor(config: PineconeConfig) {
    this.client = new Pinecone({ apiKey: config.apiKey });
    this.index = this.client.index(config.indexName);
    this.namespace = config.namespace || 'duelogic-research';
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const vectors = entries.map(entry => {
      // Handle publishedAt that could be a Date or ISO string
      let publishedAtStr = '';
      if (entry.metadata.publishedAt) {
        if (entry.metadata.publishedAt instanceof Date) {
          publishedAtStr = entry.metadata.publishedAt.toISOString();
        } else if (typeof entry.metadata.publishedAt === 'string') {
          publishedAtStr = entry.metadata.publishedAt;
        }
      }

      return {
        id: entry.id,
        values: entry.embedding!,
        metadata: {
          episodeId: entry.episodeId,
          researchResultId: entry.researchResultId,
          content: entry.content.slice(0, 1000), // Pinecone metadata limit
          sourceUrl: entry.metadata.sourceUrl,
          sourceTitle: entry.metadata.sourceTitle,
          sourceDomain: entry.metadata.sourceDomain,
          publishedAt: publishedAtStr,
          category: entry.metadata.category,
          excerpt: entry.metadata.excerpt.slice(0, 500),
        },
      };
    });

    // Upsert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await this.index.namespace(this.namespace).upsert(batch);
    }

    logger.info(`Upserted ${entries.length} vectors to Pinecone`);
  }

  async query(
    episodeId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<SearchResult[]> {
    const response = await this.index.namespace(this.namespace).query({
      vector: queryEmbedding,
      topK,
      filter: { episodeId: { $eq: episodeId } },
      includeMetadata: true,
    });

    return response.matches?.map(match => ({
      id: match.id,
      content: (match.metadata?.content as string) || '',
      score: match.score || 0,
      metadata: {
        sourceUrl: match.metadata?.sourceUrl as string || '',
        sourceTitle: match.metadata?.sourceTitle as string || '',
        sourceDomain: match.metadata?.sourceDomain as string || '',
        publishedAt: match.metadata?.publishedAt
          ? new Date(match.metadata.publishedAt as string)
          : undefined,
        category: match.metadata?.category as string || '',
        excerpt: match.metadata?.excerpt as string || '',
      },
    })) || [];
  }

  async deleteByEpisode(episodeId: string): Promise<void> {
    await this.index.namespace(this.namespace).deleteMany({
      filter: { episodeId: { $eq: episodeId } },
    });

    logger.info(`Deleted vectors for episode ${episodeId}`);
  }

  async hasIndexedResearch(episodeId: string): Promise<boolean> {
    // Use a dummy vector to check if any vectors exist for this episode
    const response = await this.index.namespace(this.namespace).query({
      vector: new Array(1536).fill(0), // Dummy vector
      topK: 1,
      filter: { episodeId: { $eq: episodeId } },
    });

    return (response.matches?.length || 0) > 0;
  }

  async ping(): Promise<boolean> {
    try {
      await this.index.describeIndexStats();
      return true;
    } catch (error) {
      logger.error({ error }, 'Pinecone ping failed');
      return false;
    }
  }
}

// Factory function for creating Pinecone client with environment config
export function createPineconeClient(): PineconeClient | null {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!apiKey || !indexName) {
    logger.warn('Pinecone not configured - missing PINECONE_API_KEY or PINECONE_INDEX_NAME');
    return null;
  }

  return new PineconeClient({
    apiKey,
    indexName,
    namespace: process.env.PINECONE_NAMESPACE || 'duelogic-research',
  });
}
