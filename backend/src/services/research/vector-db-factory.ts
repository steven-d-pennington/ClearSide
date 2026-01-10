/**
 * Vector Database Factory
 * Creates the appropriate vector database client based on environment configuration
 */

import pino from 'pino';
import { VectorDBClient } from '../../types/vector-db.js';
import { createPineconeClient } from './pinecone-client.js';
import { createChromaClient } from './chroma-client.js';
import { createPgVectorClient } from './pgvector-client.js';

const logger = pino({
  name: 'vector-db-factory',
  level: process.env.LOG_LEVEL || 'info',
});

export type VectorDBProvider = 'pinecone' | 'chroma' | 'pgvector' | 'none';

/**
 * Get the configured vector database provider
 */
export function getVectorDBProvider(): VectorDBProvider {
  const provider = process.env.VECTOR_DB_PROVIDER?.toLowerCase();

  if (provider === 'pinecone') {
    return 'pinecone';
  }

  if (provider === 'chroma') {
    return 'chroma';
  }

  if (provider === 'pgvector') {
    return 'pgvector';
  }

  // Auto-detect based on available credentials
  if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME) {
    return 'pinecone';
  }

  if (process.env.CHROMA_HOST) {
    return 'chroma';
  }

  // pgvector uses the existing DATABASE_URL, so check if explicitly enabled
  // or if we have a DATABASE_URL and no other vector DB configured
  if (process.env.PGVECTOR_ENABLED === 'true') {
    return 'pgvector';
  }

  return 'none';
}

/**
 * Create a vector database client based on environment configuration
 * Returns null if no vector database is configured
 */
export function createVectorDBClient(): VectorDBClient | null {
  const provider = getVectorDBProvider();

  switch (provider) {
    case 'pinecone': {
      const client = createPineconeClient();
      if (client) {
        logger.info('Using Pinecone vector database');
        return client;
      }
      logger.warn('Pinecone configured but failed to create client');
      return null;
    }

    case 'chroma': {
      logger.info('Using ChromaDB vector database');
      return createChromaClient();
    }

    case 'pgvector': {
      logger.info('Using pgvector (PostgreSQL) vector database');
      return createPgVectorClient();
    }

    case 'none':
    default:
      logger.info('No vector database configured - RAG features disabled');
      return null;
  }
}

/**
 * Check if vector database is available
 */
export async function isVectorDBAvailable(): Promise<boolean> {
  const client = createVectorDBClient();
  if (!client) {
    return false;
  }

  try {
    return await client.ping();
  } catch (error) {
    logger.error({ error }, 'Vector database health check failed');
    return false;
  }
}

/**
 * Get vector database configuration status
 */
export function getVectorDBStatus(): {
  provider: VectorDBProvider;
  configured: boolean;
  config: Record<string, string | undefined>;
} {
  const provider = getVectorDBProvider();

  return {
    provider,
    configured: provider !== 'none',
    config: {
      VECTOR_DB_PROVIDER: process.env.VECTOR_DB_PROVIDER,
      PINECONE_API_KEY: process.env.PINECONE_API_KEY ? '***' : undefined,
      PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
      CHROMA_HOST: process.env.CHROMA_HOST,
      CHROMA_PORT: process.env.CHROMA_PORT,
      PGVECTOR_ENABLED: process.env.PGVECTOR_ENABLED,
      PGVECTOR_TABLE_NAME: process.env.PGVECTOR_TABLE_NAME,
    },
  };
}
