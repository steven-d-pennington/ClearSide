/**
 * Embedding Service
 * Generates text embeddings using OpenAI or OpenRouter embedding models
 */

import OpenAI from 'openai';
import pino from 'pino';
import { EmbeddingConfig, DEFAULT_EMBEDDING_CONFIG, EmbeddingProvider } from '../../types/vector-db.js';

const logger = pino({
  name: 'embedding-service',
  level: process.env.LOG_LEVEL || 'info',
});

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class EmbeddingService {
  private client: OpenAI;
  private config: EmbeddingConfig;
  private provider: EmbeddingProvider;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
    this.provider = this.config.provider;

    // Get the appropriate API key and configure the client
    const { apiKey, baseURL } = this.getClientConfig();

    if (!apiKey) {
      throw new Error(
        this.provider === 'openrouter'
          ? 'OpenRouter API key required for embedding service (set OPENROUTER_API_KEY)'
          : 'OpenAI API key required for embedding service (set OPENAI_API_KEY)'
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: this.provider === 'openrouter' ? {
        'HTTP-Referer': process.env.APP_URL || 'https://clearside.app',
        'X-Title': 'ClearSide Debate Platform',
      } : undefined,
    });

    logger.info({ provider: this.provider, model: this.getModelId() }, 'Embedding service initialized');
  }

  /**
   * Get client configuration based on provider
   */
  private getClientConfig(): { apiKey: string | undefined; baseURL: string | undefined } {
    if (this.provider === 'openrouter') {
      return {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
      };
    }
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: undefined, // Use OpenAI's default
    };
  }

  /**
   * Get the full model ID (with provider prefix for OpenRouter)
   */
  private getModelId(): string {
    if (this.provider === 'openrouter') {
      // OpenRouter requires provider prefix (e.g., openai/text-embedding-3-small)
      if (!this.config.model.includes('/')) {
        return `openai/${this.config.model}`;
      }
    }
    return this.config.model;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.getModelId(),
        input: text,
        dimensions: this.config.dimensions,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error(`No embedding returned from ${this.provider}`);
      }
      return embedding;
    } catch (error) {
      logger.error({ error, provider: this.provider }, 'Failed to generate embedding');
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
    const modelId = this.getModelId();

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);

      try {
        const response = await this.client.embeddings.create({
          model: modelId,
          input: batch,
          dimensions: this.config.dimensions,
        });

        for (const data of response.data) {
          embeddings.push(data.embedding);
        }

        logger.debug(
          { batchNum: Math.floor(i / this.config.batchSize) + 1, provider: this.provider },
          'Processed embedding batch'
        );

        // Small delay between batches to avoid rate limiting
        if (i + this.config.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error({ error, batchIndex: i, provider: this.provider }, 'Failed to generate batch embeddings');
        throw error;
      }
    }

    logger.info({ count: embeddings.length, provider: this.provider }, 'Generated embeddings');
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
    return this.getModelId();
  }

  /**
   * Get the provider being used
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }
}

// Factory function for creating embedding service with environment config
export function createEmbeddingService(config?: Partial<EmbeddingConfig>): EmbeddingService {
  return new EmbeddingService(config);
}
