/**
 * Embedding Service
 * Generates text embeddings using OpenAI's embedding models
 */

import OpenAI from 'openai';
import pino from 'pino';
import { EmbeddingConfig, DEFAULT_EMBEDDING_CONFIG } from '../../types/vector-db.js';

const logger = pino({
  name: 'embedding-service',
  level: process.env.LOG_LEVEL || 'info',
});

export class EmbeddingService {
  private openai: OpenAI;
  private config: EmbeddingConfig;

  constructor(apiKey?: string, config?: Partial<EmbeddingConfig>) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key required for embedding service');
    }

    this.openai = new OpenAI({ apiKey: key });
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned from OpenAI');
      }
      return embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);

      try {
        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: batch,
          dimensions: this.config.dimensions,
        });

        for (const data of response.data) {
          embeddings.push(data.embedding);
        }

        logger.debug(`Processed embedding batch ${Math.floor(i / this.config.batchSize) + 1}`);

        // Small delay between batches to avoid rate limiting
        if (i + this.config.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error({ error, batchIndex: i }, 'Failed to generate batch embeddings');
        throw error;
      }
    }

    logger.info(`Generated ${embeddings.length} embeddings`);
    return embeddings;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.config.dimensions;
  }

  /**
   * Get the model being used
   */
  getModel(): string {
    return this.config.model;
  }
}

// Factory function for creating embedding service with environment config
export function createEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  return new EmbeddingService(process.env.OPENAI_API_KEY, config);
}
