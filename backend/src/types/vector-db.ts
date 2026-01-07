/**
 * Vector Database Types
 * Types for vector database operations supporting RAG (Retrieval-Augmented Generation)
 */

export interface VectorEntry {
  id: string;
  episodeId: string;
  researchResultId: string;
  content: string;              // Text chunk to embed
  embedding?: number[];         // Populated by embedding service
  metadata: VectorMetadata;
}

export interface VectorMetadata {
  sourceUrl: string;
  sourceTitle: string;
  sourceDomain: string;
  publishedAt?: Date;
  category: string;
  excerpt: string;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: VectorMetadata;
  score: number;                // Similarity score
}

export interface RAGCitation {
  content: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceDomain: string;
  publishedAt?: Date;
  relevanceScore: number;
}

export interface VectorDBClient {
  /**
   * Upsert vectors into the database
   */
  upsert(entries: VectorEntry[]): Promise<void>;

  /**
   * Query for similar vectors
   */
  query(
    episodeId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<SearchResult[]>;

  /**
   * Delete all vectors for an episode
   */
  deleteByEpisode(episodeId: string): Promise<void>;

  /**
   * Check if episode has indexed research
   */
  hasIndexedResearch(episodeId: string): Promise<boolean>;

  /**
   * Health check
   */
  ping(): Promise<boolean>;
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  batchSize: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  batchSize: 100, // OpenAI limit is 2048
};
