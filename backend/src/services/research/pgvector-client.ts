/**
 * pgvector Vector Database Client
 * Implements VectorDBClient interface for PostgreSQL with pgvector extension
 *
 * This allows using the same PostgreSQL database for both relational data
 * and vector similarity search, eliminating the need for a separate vector DB.
 */

import pino from 'pino';
import { pool } from '../../db/connection.js';
import {
  VectorDBClient,
  VectorEntry,
  SearchResult
} from '../../types/vector-db.js';

const logger = pino({
  name: 'pgvector-client',
  level: process.env.LOG_LEVEL || 'info',
});

export interface PgVectorConfig {
  tableName?: string;
  dimensions?: number;
}

const DEFAULT_CONFIG: Required<PgVectorConfig> = {
  tableName: 'vector_embeddings',
  dimensions: 1536, // OpenAI text-embedding-3-small dimensions
};

export class PgVectorClient implements VectorDBClient {
  private config: Required<PgVectorConfig>;
  private initialized = false;

  constructor(config?: PgVectorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ensure pgvector extension and table exist
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create pgvector extension if not exists
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create embeddings table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          id TEXT PRIMARY KEY,
          episode_id TEXT NOT NULL,
          research_result_id TEXT NOT NULL,
          content TEXT NOT NULL,
          embedding vector(${this.config.dimensions}),
          source_url TEXT,
          source_title TEXT,
          source_domain TEXT,
          published_at TIMESTAMPTZ,
          category TEXT,
          excerpt TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create index for similarity search if not exists
      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_embedding_idx
        ON ${this.config.tableName}
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);

      // Create index for episode filtering
      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${this.config.tableName}_episode_idx
        ON ${this.config.tableName} (episode_id)
      `);

      this.initialized = true;
      logger.info('pgvector initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize pgvector');
      throw error;
    }
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.ensureInitialized();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        // Format embedding as pgvector expects: [0.1, 0.2, ...]
        const embeddingStr = `[${entry.embedding!.join(',')}]`;

        await client.query(
          `
          INSERT INTO ${this.config.tableName} (
            id, episode_id, research_result_id, content, embedding,
            source_url, source_title, source_domain, published_at,
            category, excerpt, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            source_url = EXCLUDED.source_url,
            source_title = EXCLUDED.source_title,
            source_domain = EXCLUDED.source_domain,
            published_at = EXCLUDED.published_at,
            category = EXCLUDED.category,
            excerpt = EXCLUDED.excerpt,
            updated_at = NOW()
          `,
          [
            entry.id,
            entry.episodeId,
            entry.researchResultId,
            entry.content,
            embeddingStr,
            entry.metadata.sourceUrl,
            entry.metadata.sourceTitle,
            entry.metadata.sourceDomain,
            entry.metadata.publishedAt || null,
            entry.metadata.category,
            entry.metadata.excerpt,
          ]
        );
      }

      await client.query('COMMIT');
      logger.info(`Upserted ${entries.length} vectors to pgvector`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Failed to upsert vectors');
      throw error;
    } finally {
      client.release();
    }
  }

  async query(
    episodeId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const result = await pool.query(
      `
      SELECT
        id,
        content,
        source_url,
        source_title,
        source_domain,
        published_at,
        category,
        excerpt,
        1 - (embedding <=> $1::vector) as score
      FROM ${this.config.tableName}
      WHERE episode_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      [embeddingStr, episodeId, topK]
    );

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      score: parseFloat(row.score),
      metadata: {
        sourceUrl: row.source_url || '',
        sourceTitle: row.source_title || '',
        sourceDomain: row.source_domain || '',
        publishedAt: row.published_at ? new Date(row.published_at) : undefined,
        category: row.category || '',
        excerpt: row.excerpt || '',
      },
    }));
  }

  async deleteByEpisode(episodeId: string): Promise<void> {
    await this.ensureInitialized();

    await pool.query(
      `DELETE FROM ${this.config.tableName} WHERE episode_id = $1`,
      [episodeId]
    );

    logger.info(`Deleted vectors for episode ${episodeId} from pgvector`);
  }

  async hasIndexedResearch(episodeId: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM ${this.config.tableName} WHERE episode_id = $1) as exists`,
      [episodeId]
    );

    return result.rows[0]?.exists || false;
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const result = await pool.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      logger.error({ error }, 'pgvector ping failed');
      return false;
    }
  }
}

/**
 * Factory function for creating pgvector client
 * Uses the existing DATABASE_URL connection - no additional config needed!
 */
export function createPgVectorClient(): PgVectorClient {
  return new PgVectorClient({
    tableName: process.env.PGVECTOR_TABLE_NAME || 'vector_embeddings',
    dimensions: parseInt(process.env.PGVECTOR_DIMENSIONS || '1536', 10),
  });
}
