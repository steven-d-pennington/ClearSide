/**
 * RAG-Enhanced Orchestrator
 *
 * Provides RAG (Retrieval-Augmented Generation) capabilities for Duelogic debates.
 * This module can be used to enhance existing orchestrators with citation support.
 */

import pino from 'pino';
import { RAGContextBuilder, CitationContext } from '../research/rag-context-builder.js';
import { RAGRetrievalService } from '../research/rag-retrieval-service.js';
import { EmbeddingService, createEmbeddingService } from '../research/embedding-service.js';
import { createVectorDBClient } from '../research/vector-db-factory.js';
import { RAGEnabledDebateConfig, CitationMetadata, DEFAULT_RAG_CONFIG } from '../../types/rag.js';
import { VectorDBClient } from '../../types/vector-db.js';

const logger = pino({
  name: 'rag-enhanced-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

export interface RAGOrchestratorOptions {
  episodeId: string;
  config?: Partial<RAGEnabledDebateConfig>;
}

/**
 * RAG Enhancement for Debate Orchestrators
 *
 * This class provides RAG capabilities that can be used to enhance
 * any debate orchestrator. It manages:
 * - Citation retrieval for each turn
 * - Context building for agent prompts
 * - Citation usage tracking
 */
export class RAGEnhancement {
  private vectorDB: VectorDBClient | null;
  private embeddingService: EmbeddingService | null;
  private ragService: RAGRetrievalService | null;
  private contextBuilder: RAGContextBuilder | null;
  private config: RAGEnabledDebateConfig;
  private episodeId: string;
  private isEnabled: boolean = false;

  constructor(options: RAGOrchestratorOptions) {
    this.episodeId = options.episodeId;
    this.config = { ...DEFAULT_RAG_CONFIG, ...options.config };

    // Initialize services if available
    this.vectorDB = createVectorDBClient();

    if (this.vectorDB) {
      try {
        this.embeddingService = createEmbeddingService();
        this.ragService = new RAGRetrievalService(
          this.vectorDB,
          this.embeddingService,
          { topK: this.config.maxCitationsPerTurn }
        );
        this.contextBuilder = new RAGContextBuilder(this.ragService, this.config);
        this.isEnabled = true;
        logger.info({ episodeId: this.episodeId }, 'RAG enhancement enabled');
      } catch (error) {
        logger.warn({ error }, 'RAG enhancement disabled - failed to initialize services');
        this.embeddingService = null;
        this.ragService = null;
        this.contextBuilder = null;
      }
    } else {
      logger.info('RAG enhancement disabled - no vector database configured');
      this.embeddingService = null;
      this.ragService = null;
      this.contextBuilder = null;
    }
  }

  /**
   * Check if RAG is enabled and available
   */
  isRAGEnabled(): boolean {
    return this.isEnabled && this.config.enableRAG;
  }

  /**
   * Check if the episode has indexed research available
   */
  async hasResearch(): Promise<boolean> {
    if (!this.ragService) return false;
    return this.ragService.hasResearchAvailable(this.episodeId);
  }

  /**
   * Get citation context for a debate turn
   *
   * @param currentArgument - The current turn's argument or topic
   * @param previousContext - Optional previous context for better retrieval
   * @returns Citation context with formatted prompt and metadata
   */
  async getCitationContext(
    currentArgument: string,
    previousContext?: string
  ): Promise<CitationContext | null> {
    if (!this.contextBuilder || !this.isEnabled) {
      return null;
    }

    try {
      const context = await this.contextBuilder.buildContext(
        this.episodeId,
        currentArgument,
        previousContext
      );

      logger.debug({
        episodeId: this.episodeId,
        citationsProvided: context.metadata.citationsProvided,
      }, 'Generated citation context');

      return context;
    } catch (error) {
      logger.error({ error }, 'Failed to get citation context');
      return null;
    }
  }

  /**
   * Analyze a response to determine which citations were used
   *
   * @param response - The generated response text
   * @param context - The citation context that was provided
   * @returns Updated citation metadata with usage information
   */
  analyzeCitationUsage(
    response: string,
    context: CitationContext
  ): CitationMetadata {
    if (!this.contextBuilder) {
      return context.metadata;
    }

    return this.contextBuilder.updateMetadataWithUsedCitations(
      context.metadata,
      response,
      context.citations
    );
  }

  /**
   * Build an enhanced system prompt with citation context
   *
   * @param basePrompt - The original system prompt
   * @param citationContext - The citation context to inject
   * @returns Enhanced prompt with citations
   */
  enhancePrompt(basePrompt: string, citationContext: CitationContext | null): string {
    if (!citationContext || !citationContext.prompt) {
      return basePrompt;
    }

    return `${basePrompt}\n\n${citationContext.prompt}`;
  }

  /**
   * Get configuration
   */
  getConfig(): RAGEnabledDebateConfig {
    return this.config;
  }

  /**
   * Get episode ID
   */
  getEpisodeId(): string {
    return this.episodeId;
  }
}

/**
 * Create a RAG enhancement instance
 */
export function createRAGEnhancement(options: RAGOrchestratorOptions): RAGEnhancement {
  return new RAGEnhancement(options);
}

/**
 * Helper to check if RAG should be enabled for a debate
 */
export async function shouldEnableRAG(episodeId: string | undefined): Promise<boolean> {
  if (!episodeId) return false;

  const vectorDB = createVectorDBClient();
  if (!vectorDB) return false;

  try {
    return await vectorDB.hasIndexedResearch(episodeId);
  } catch {
    return false;
  }
}
