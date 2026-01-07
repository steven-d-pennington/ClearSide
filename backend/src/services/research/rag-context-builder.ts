/**
 * RAG Context Builder
 * Builds formatted citation prompts for debate agents
 */

import pino from 'pino';
import { RAGRetrievalService } from './rag-retrieval-service.js';
import { RAGCitation } from '../../types/vector-db.js';
import { RAGEnabledDebateConfig, CitationMetadata, DEFAULT_RAG_CONFIG } from '../../types/rag.js';

const logger = pino({
  name: 'rag-context-builder',
  level: process.env.LOG_LEVEL || 'info',
});

export interface CitationContext {
  prompt: string;                  // Formatted context to inject into prompt
  citations: RAGCitation[];        // The citations provided
  metadata: CitationMetadata;      // Tracking metadata
}

export class RAGContextBuilder {
  private config: RAGEnabledDebateConfig;

  constructor(
    private ragService: RAGRetrievalService,
    config?: Partial<RAGEnabledDebateConfig>
  ) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
  }

  /**
   * Build citation context for an advocate turn
   */
  async buildContext(
    episodeId: string,
    currentArgument: string,
    previousContext?: string
  ): Promise<CitationContext> {
    // Combine current argument with previous context for better retrieval
    const query = previousContext
      ? `${previousContext}\n\n${currentArgument}`
      : currentArgument;

    try {
      // Retrieve relevant citations
      const citations = await this.ragService.retrieveCitations(
        episodeId,
        query
      );

      // Filter by relevance threshold and limit
      const filteredCitations = citations
        .filter(c => c.relevanceScore >= this.config.minCitationRelevance)
        .slice(0, this.config.maxCitationsPerTurn);

      if (filteredCitations.length === 0) {
        return {
          prompt: '',
          citations: [],
          metadata: {
            citationsProvided: 0,
            citationsUsed: [],
            relevanceScores: [],
            queryUsed: query.slice(0, 200),
          },
        };
      }

      // Build the prompt based on citation style
      const prompt = this.formatCitationPrompt(filteredCitations);

      logger.debug(`Built RAG context with ${filteredCitations.length} citations`);

      return {
        prompt,
        citations: filteredCitations,
        metadata: {
          citationsProvided: filteredCitations.length,
          citationsUsed: [], // Populated after response analysis
          relevanceScores: filteredCitations.map(c => c.relevanceScore),
          queryUsed: query.slice(0, 200),
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to build RAG context');
      return {
        prompt: '',
        citations: [],
        metadata: {
          citationsProvided: 0,
          citationsUsed: [],
          relevanceScores: [],
          queryUsed: query.slice(0, 200),
        },
      };
    }
  }

  /**
   * Format citation prompt based on style
   */
  private formatCitationPrompt(citations: RAGCitation[]): string {
    switch (this.config.citationStyle) {
      case 'natural':
        return this.formatNaturalStyle(citations);
      case 'academic':
        return this.formatAcademicStyle(citations);
      case 'minimal':
        return this.formatMinimalStyle(citations);
      default:
        return this.formatNaturalStyle(citations);
    }
  }

  /**
   * Natural citation style - conversational references
   */
  private formatNaturalStyle(citations: RAGCitation[]): string {
    const citationBlocks = citations.map((c, i) => {
      const dateStr = c.publishedAt
        ? c.publishedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'recently';

      return `
**[Source ${i + 1}] ${c.sourceTitle}**
From ${c.sourceDomain}, ${dateStr}
"${c.content}"
Relevance: ${(c.relevanceScore * 100).toFixed(0)}%`;
    }).join('\n\n');

    const firstCitation = citations[0];
    const sampleDate = firstCitation?.publishedAt
      ? firstCitation.publishedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'recent';

    return `
## Research Citations Available

You have access to the following research sources. Use them to strengthen your arguments with real evidence.

${citationBlocks}

### How to Cite
Incorporate these sources naturally into your argument:
- "According to ${firstCitation?.sourceDomain || 'recent research'}..."
- "A ${sampleDate} report found that..."
- "Research from ${firstCitation?.sourceTitle || '...'} suggests..."

Important:
- Only cite sources when they genuinely support your point
- Don't force citations if they're not relevant
- Speak naturally as if you know this information
- The source URLs will be added to the transcript automatically
`;
  }

  /**
   * Academic citation style - more formal references
   */
  private formatAcademicStyle(citations: RAGCitation[]): string {
    const citationBlocks = citations.map((c, i) => {
      const year = c.publishedAt?.getFullYear() || 'n.d.';
      return `
[${i + 1}] ${c.sourceTitle} (${c.sourceDomain}, ${year})
"${c.content}"`;
    }).join('\n\n');

    return `
## Available Sources

${citationBlocks}

Cite using: "According to [Source N]..." or "(Source ${citations.length > 0 ? '1' : 'N'})"
`;
  }

  /**
   * Minimal citation style - brief references
   */
  private formatMinimalStyle(citations: RAGCitation[]): string {
    const sources = citations.map(c =>
      `- ${c.sourceDomain}: "${c.content.slice(0, 100)}..."`
    ).join('\n');

    return `
## Sources
${sources}

Use naturally if relevant.
`;
  }

  /**
   * Analyze response to detect which citations were used
   */
  analyzeUsedCitations(
    response: string,
    providedCitations: RAGCitation[]
  ): string[] {
    const usedUrls: string[] = [];
    const responseLower = response.toLowerCase();

    for (const citation of providedCitations) {
      // Check if domain or title appears in response
      const domainMentioned = responseLower.includes(
        citation.sourceDomain.toLowerCase().replace('www.', '')
      );

      // Check if key phrases from the citation appear
      const contentWords = citation.content.toLowerCase().split(/\s+/);
      const significantWords = contentWords.filter(word => word.length > 5).slice(0, 5);
      const phraseMatches = significantWords.filter(word =>
        responseLower.includes(word)
      ).length;

      if (domainMentioned || phraseMatches >= 3) {
        usedUrls.push(citation.sourceUrl);
      }
    }

    return usedUrls;
  }

  /**
   * Update citation metadata with used citations after response
   */
  updateMetadataWithUsedCitations(
    metadata: CitationMetadata,
    response: string,
    providedCitations: RAGCitation[]
  ): CitationMetadata {
    return {
      ...metadata,
      citationsUsed: this.analyzeUsedCitations(response, providedCitations),
    };
  }
}
