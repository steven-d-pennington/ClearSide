/**
 * RAG Retrieval Service
 * Retrieves relevant citations from the vector database for debate agents
 */

import pino from 'pino';
import { VectorDBClient, RAGCitation } from '../../types/vector-db.js';
import { EmbeddingService } from './embedding-service.js';

const logger = pino({
  name: 'rag-retrieval-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface RAGConfig {
  topK: number;
  minRelevanceScore: number;
  includeSourceLinks: boolean;
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  topK: 5,
  minRelevanceScore: 0.4, // Lowered to include more citations
  includeSourceLinks: true,
};

export class RAGRetrievalService {
  private config: RAGConfig;

  constructor(
    private vectorDB: VectorDBClient,
    private embeddingService: EmbeddingService,
    config?: Partial<RAGConfig>
  ) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
  }

  /**
   * Retrieve relevant citations for a debate turn
   */
  async retrieveCitations(
    episodeId: string,
    query: string
  ): Promise<RAGCitation[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embed(query);

      // Query vector database
      const results = await this.vectorDB.query(
        episodeId,
        queryEmbedding,
        this.config.topK
      );

      // Filter by relevance score and map to citations
      const citations = results
        .filter(r => r.score >= this.config.minRelevanceScore)
        .map(r => ({
          content: r.content,
          sourceUrl: r.metadata.sourceUrl,
          sourceTitle: r.metadata.sourceTitle,
          sourceDomain: r.metadata.sourceDomain,
          publishedAt: r.metadata.publishedAt,
          relevanceScore: r.score,
        }));

      logger.debug(`Retrieved ${citations.length} citations for query (${results.length} raw results)`);
      return citations;
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve citations');
      return [];
    }
  }

  /**
   * Build context prompt with citations for debate agents
   */
  async buildCitationContext(
    episodeId: string,
    currentTurnContent: string
  ): Promise<string> {
    const citations = await this.retrieveCitations(episodeId, currentTurnContent);

    if (citations.length === 0) {
      return '';
    }

    const citationBlocks = citations.map((c, index) => {
      let dateStr = 'recent';
      if (c.publishedAt) {
        const pubDate = c.publishedAt instanceof Date ? c.publishedAt : new Date(c.publishedAt);
        if (!isNaN(pubDate.getTime())) {
          dateStr = pubDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      }

      return `
**Source ${index + 1}: ${c.sourceTitle}** (${c.sourceDomain}, ${dateStr})
"${c.content}"
${this.config.includeSourceLinks ? `URL: ${c.sourceUrl}` : ''}
Relevance: ${(c.relevanceScore * 100).toFixed(0)}%`;
    }).join('\n\n');

    const firstCitation = citations[0];

    return `
## REQUIRED RESEARCH SOURCES - YOU MUST USE THESE

CRITICAL INSTRUCTION: You MUST cite the following verified research sources in your response. DO NOT make up or invent citations. Only use the sources provided below.

${citationBlocks}

### MANDATORY Citation Format
You MUST reference these sources using their exact names. Examples:
- "According to ${firstCitation?.sourceTitle || 'the research'} (${firstCitation?.sourceDomain || ''})..."
- "As reported by ${firstCitation?.sourceDomain || ''}..."
- "Research from ${firstCitation?.sourceTitle || ''} indicates..."

IMPORTANT:
- DO NOT cite sources that are not listed above (no OECD, McKinsey, etc. unless listed)
- DO NOT invent statistics or studies
- If you need to make a claim without a source, clearly state it as your position, not a fact
`;
  }

  /**
   * Format a single citation for use in debate text
   */
  formatCitationForSpeech(citation: RAGCitation): string {
    let dateStr = 'recently';
    if (citation.publishedAt) {
      const pubDate = citation.publishedAt instanceof Date
        ? citation.publishedAt
        : new Date(citation.publishedAt);
      if (!isNaN(pubDate.getTime())) {
        dateStr = pubDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }

    return `According to ${citation.sourceDomain} (${dateStr}), "${citation.content.slice(0, 150)}..."`;
  }

  /**
   * Get citations with a minimum relevance threshold
   */
  async getRelevantCitations(
    episodeId: string,
    query: string,
    minScore?: number
  ): Promise<RAGCitation[]> {
    const citations = await this.retrieveCitations(episodeId, query);
    const threshold = minScore ?? this.config.minRelevanceScore;
    return citations.filter(c => c.relevanceScore >= threshold);
  }

  /**
   * Check if episode has any indexed research for RAG
   */
  async hasResearchAvailable(episodeId: string): Promise<boolean> {
    return this.vectorDB.hasIndexedResearch(episodeId);
  }
}

// Factory function for creating RAG retrieval service
export function createRAGRetrievalService(
  vectorDB: VectorDBClient,
  embeddingService: EmbeddingService,
  config?: Partial<RAGConfig>
): RAGRetrievalService {
  return new RAGRetrievalService(vectorDB, embeddingService, config);
}
