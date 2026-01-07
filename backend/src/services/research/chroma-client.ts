/**
 * ChromaDB Vector Database Client
 * Implements VectorDBClient interface for ChromaDB (local/self-hosted alternative)
 */

import { ChromaClient, Collection } from 'chromadb';
import pino from 'pino';
import {
  VectorDBClient,
  VectorEntry,
  SearchResult
} from '../../types/vector-db.js';

const logger = pino({
  name: 'chroma-client',
  level: process.env.LOG_LEVEL || 'info',
});

export interface ChromaConfig {
  host?: string;
  port?: number;
  collectionName: string;
}

const DEFAULT_CHROMA_CONFIG: ChromaConfig = {
  host: 'localhost',
  port: 8000,
  collectionName: 'duelogic-research',
};

export class ChromaDBClient implements VectorDBClient {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private config: ChromaConfig;

  constructor(config?: Partial<ChromaConfig>) {
    this.config = { ...DEFAULT_CHROMA_CONFIG, ...config };
    this.client = new ChromaClient({
      path: `http://${this.config.host}:${this.config.port}`,
    });
  }

  private async getCollection(): Promise<Collection> {
    if (!this.collection) {
      this.collection = await this.client.getOrCreateCollection({
        name: this.config.collectionName,
        metadata: { description: 'Duelogic research citations' },
      });
    }
    return this.collection;
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const collection = await this.getCollection();

    await collection.upsert({
      ids: entries.map(e => e.id),
      embeddings: entries.map(e => e.embedding!),
      documents: entries.map(e => e.content),
      metadatas: entries.map(e => ({
        episodeId: e.episodeId,
        researchResultId: e.researchResultId,
        sourceUrl: e.metadata.sourceUrl,
        sourceTitle: e.metadata.sourceTitle,
        sourceDomain: e.metadata.sourceDomain,
        publishedAt: e.metadata.publishedAt?.toISOString() || '',
        category: e.metadata.category,
        excerpt: e.metadata.excerpt,
      })),
    });

    logger.info(`Upserted ${entries.length} vectors to ChromaDB`);
  }

  async query(
    episodeId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<SearchResult[]> {
    const collection = await this.getCollection();

    const response = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: { episodeId: episodeId },
    });

    if (!response.ids[0]) return [];

    return response.ids[0].map((id, index) => ({
      id,
      content: response.documents?.[0]?.[index] || '',
      score: response.distances?.[0]?.[index]
        ? 1 - (response.distances[0][index] / 2) // Convert distance to similarity
        : 0,
      metadata: {
        sourceUrl: response.metadatas?.[0]?.[index]?.sourceUrl as string || '',
        sourceTitle: response.metadatas?.[0]?.[index]?.sourceTitle as string || '',
        sourceDomain: response.metadatas?.[0]?.[index]?.sourceDomain as string || '',
        publishedAt: response.metadatas?.[0]?.[index]?.publishedAt
          ? new Date(response.metadatas[0][index].publishedAt as string)
          : undefined,
        category: response.metadatas?.[0]?.[index]?.category as string || '',
        excerpt: response.metadatas?.[0]?.[index]?.excerpt as string || '',
      },
    }));
  }

  async deleteByEpisode(episodeId: string): Promise<void> {
    const collection = await this.getCollection();

    await collection.delete({
      where: { episodeId: episodeId },
    });

    logger.info(`Deleted vectors for episode ${episodeId} from ChromaDB`);
  }

  async hasIndexedResearch(episodeId: string): Promise<boolean> {
    const collection = await this.getCollection();

    const response = await collection.count({
      where: { episodeId: episodeId },
    });

    return response > 0;
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.heartbeat();
      return true;
    } catch (error) {
      logger.error({ error }, 'ChromaDB ping failed');
      return false;
    }
  }
}

// Factory function for creating ChromaDB client with environment config
export function createChromaClient(): ChromaDBClient {
  return new ChromaDBClient({
    host: process.env.CHROMA_HOST || 'localhost',
    port: parseInt(process.env.CHROMA_PORT || '8000', 10),
    collectionName: process.env.CHROMA_COLLECTION || 'duelogic-research',
  });
}
