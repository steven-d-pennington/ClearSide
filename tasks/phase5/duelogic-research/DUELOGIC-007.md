# DUELOGIC-007: Debate Orchestrator RAG Integration

**Task ID:** DUELOGIC-007
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P1
**Estimated Effort:** M (4-8 hours)
**Dependencies:** DUELOGIC-005 (Vector Database Integration)
**Status:** Ready

---

## Context

The final piece of the Duelogic Research pipeline is integrating RAG (Retrieval-Augmented Generation) into the debate orchestrators. When a Duelogic episode runs, the debate agents should be able to cite real sources gathered during the research phase.

This task modifies the existing orchestrators to:
1. Check if the debate has indexed research
2. Query relevant citations before each agent turn
3. Inject citation context into agent prompts
4. Format citations naturally in the debate output

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Debate Orchestrator Integration
- Existing orchestrators at `backend/src/services/debate/`
- RAG service from DUELOGIC-005

---

## Requirements

### Acceptance Criteria

- [ ] Modify `LivelyOrchestrator` to support RAG citations
- [ ] Modify `DuelogicOrchestrator` (if exists) for episodic debates
- [ ] Create `RAGContextBuilder` to format citation prompts
- [ ] Add episode linkage to debates (which episode is this debate for?)
- [ ] Inject citation context before each advocate turn
- [ ] Track which citations were actually used in responses
- [ ] Add citation metadata to utterance records
- [ ] Write integration tests for RAG-enhanced debates

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- Agents instructed to use RAG as primary citation source
- Citation format: natural language ("According to a January 2026 Reuters report...")
- Sources linked in transcript for listener reference
- Citations should feel natural, not forced

---

## Implementation Guide

### Database Updates

```sql
-- backend/src/db/migrations/XXX_add_episode_linkage.sql

-- Add episode_id to debates for Duelogic episodes
ALTER TABLE debates ADD COLUMN episode_id UUID REFERENCES episode_proposals(id);

-- Add citation metadata to utterances
ALTER TABLE utterances ADD COLUMN citation_metadata JSONB;

-- Index for episode lookups
CREATE INDEX idx_debates_episode ON debates(episode_id) WHERE episode_id IS NOT NULL;
```

### Types

```typescript
// backend/src/types/rag.ts

export interface CitationMetadata {
  citationsProvided: number;       // How many citations were available
  citationsUsed: string[];         // Source URLs that appear in response
  relevanceScores: number[];       // Scores of provided citations
  queryUsed: string;               // What query was used to retrieve citations
}

export interface RAGEnabledDebateConfig {
  enableRAG: boolean;
  episodeId?: string;
  minCitationRelevance: number;    // 0-1, minimum score to include citation
  maxCitationsPerTurn: number;     // Limit citations per turn
  citationStyle: 'natural' | 'academic' | 'minimal';
}

export const DEFAULT_RAG_CONFIG: RAGEnabledDebateConfig = {
  enableRAG: true,
  minCitationRelevance: 0.6,
  maxCitationsPerTurn: 5,
  citationStyle: 'natural',
};
```

### RAG Context Builder

```typescript
// backend/src/services/research/rag-context-builder.ts

import { RAGRetrievalService } from './rag-retrieval-service.js';
import { RAGCitation } from '../../types/vector-db.js';
import { RAGEnabledDebateConfig, CitationMetadata } from '../../types/rag.js';
import { logger } from '../../utils/logger.js';

export interface CitationContext {
  prompt: string;                  // Formatted context to inject into prompt
  citations: RAGCitation[];        // The citations provided
  metadata: CitationMetadata;      // Tracking metadata
}

export class RAGContextBuilder {
  constructor(
    private ragService: RAGRetrievalService,
    private config: RAGEnabledDebateConfig
  ) {}

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

    return `
## Research Citations Available

You have access to the following research sources. Use them to strengthen your arguments with real evidence.

${citationBlocks}

### How to Cite
Incorporate these sources naturally into your argument:
- "According to ${citations[0]?.sourceDomain || 'recent research'}..."
- "A ${citations[0]?.publishedAt?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) || 'recent'} report found that..."
- "Research from ${citations[0]?.sourceTitle || '...'} suggests..."

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

    for (const citation of providedCitations) {
      // Check if domain or title appears in response
      const domainMentioned = response.toLowerCase().includes(
        citation.sourceDomain.toLowerCase().replace('www.', '')
      );

      // Check if key phrases from the citation appear
      const contentWords = citation.content.toLowerCase().split(/\s+/).slice(0, 5);
      const phraseMatches = contentWords.filter(word =>
        word.length > 4 && response.toLowerCase().includes(word)
      ).length;

      if (domainMentioned || phraseMatches >= 3) {
        usedUrls.push(citation.sourceUrl);
      }
    }

    return usedUrls;
  }
}
```

### Orchestrator Integration

```typescript
// backend/src/services/debate/rag-enhanced-orchestrator.ts

import { LivelyOrchestrator, LivelyOrchestratorConfig } from './lively-orchestrator.js';
import { RAGContextBuilder } from '../research/rag-context-builder.js';
import { RAGRetrievalService } from '../research/rag-retrieval-service.js';
import { RAGEnabledDebateConfig, CitationMetadata, DEFAULT_RAG_CONFIG } from '../../types/rag.js';
import { VectorDBClient } from '../../types/vector-db.js';
import { EmbeddingService } from '../research/embedding-service.js';
import { logger } from '../../utils/logger.js';

export interface RAGEnhancedConfig extends LivelyOrchestratorConfig {
  rag?: RAGEnabledDebateConfig;
  episodeId?: string;
}

export class RAGEnhancedOrchestrator extends LivelyOrchestrator {
  private ragContextBuilder: RAGContextBuilder | null = null;
  private episodeId: string | null = null;
  private ragConfig: RAGEnabledDebateConfig;

  constructor(
    config: RAGEnhancedConfig,
    vectorDB?: VectorDBClient,
    embeddingService?: EmbeddingService
  ) {
    super(config);

    this.ragConfig = { ...DEFAULT_RAG_CONFIG, ...config.rag };
    this.episodeId = config.episodeId || null;

    if (vectorDB && embeddingService && this.ragConfig.enableRAG && this.episodeId) {
      const ragService = new RAGRetrievalService(vectorDB, embeddingService);
      this.ragContextBuilder = new RAGContextBuilder(ragService, this.ragConfig);
      logger.info(`RAG enabled for episode ${this.episodeId}`);
    }
  }

  /**
   * Override the advocate turn generation to inject RAG context
   */
  protected async generateAdvocateTurn(
    side: 'pro' | 'con',
    previousContext: string
  ): Promise<{ content: string; citationMetadata?: CitationMetadata }> {
    let citationContext: string = '';
    let citationMetadata: CitationMetadata | undefined;

    // Retrieve citations if RAG is enabled
    if (this.ragContextBuilder && this.episodeId) {
      try {
        const context = await this.ragContextBuilder.buildContext(
          this.episodeId,
          previousContext
        );

        if (context.prompt) {
          citationContext = context.prompt;
          citationMetadata = context.metadata;
          logger.debug(`Provided ${context.citations.length} citations for ${side} advocate`);
        }
      } catch (error) {
        logger.error('Failed to retrieve RAG citations:', error);
        // Continue without citations
      }
    }

    // Build the enhanced prompt
    const enhancedPrompt = citationContext
      ? `${this.getBasePrompt(side)}\n\n${citationContext}`
      : this.getBasePrompt(side);

    // Generate the response (call parent's LLM generation)
    const response = await this.callLLM(side, enhancedPrompt, previousContext);

    // Analyze which citations were actually used
    if (citationMetadata && this.ragContextBuilder) {
      const usedCitations = this.ragContextBuilder.analyzeUsedCitations(
        response,
        [] // Would need to pass citations here
      );
      citationMetadata.citationsUsed = usedCitations;
    }

    return { content: response, citationMetadata };
  }

  /**
   * Get base prompt for advocate (to be overridden or extended)
   */
  protected getBasePrompt(side: 'pro' | 'con'): string {
    // This would be the existing prompt logic
    return side === 'pro'
      ? 'You are the Pro Advocate...'
      : 'You are the Con Advocate...';
  }

  /**
   * Call LLM for generation (abstract - implemented in parent)
   */
  protected async callLLM(
    side: 'pro' | 'con',
    prompt: string,
    context: string
  ): Promise<string> {
    // This calls the parent's LLM generation logic
    // Implementation depends on existing orchestrator structure
    throw new Error('Must be implemented by extending actual orchestrator');
  }
}
```

### Integration with Existing Orchestrator

```typescript
// Modifications to backend/src/services/debate/lively-orchestrator.ts

import { RAGContextBuilder, CitationContext } from '../research/rag-context-builder.js';
import { RAGRetrievalService } from '../research/rag-retrieval-service.js';
import { CitationMetadata } from '../../types/rag.js';

export class LivelyOrchestrator {
  // Add RAG-related properties
  private ragContextBuilder: RAGContextBuilder | null = null;
  private episodeId: string | null = null;

  // Add to constructor or initialization
  enableRAG(
    episodeId: string,
    vectorDB: VectorDBClient,
    embeddingService: EmbeddingService,
    config?: Partial<RAGEnabledDebateConfig>
  ): void {
    this.episodeId = episodeId;
    const ragService = new RAGRetrievalService(vectorDB, embeddingService);
    this.ragContextBuilder = new RAGContextBuilder(ragService, {
      ...DEFAULT_RAG_CONFIG,
      ...config,
    });
    logger.info(`RAG enabled for orchestrator with episode ${episodeId}`);
  }

  // Modify the advocate turn generation
  private async generateAdvocateTurnWithRAG(
    side: 'pro' | 'con',
    context: string
  ): Promise<{ content: string; citationMetadata?: CitationMetadata }> {
    let citationPrompt = '';
    let citationMetadata: CitationMetadata | undefined;
    let providedCitations: RAGCitation[] = [];

    // Get RAG context if enabled
    if (this.ragContextBuilder && this.episodeId) {
      try {
        const ragContext = await this.ragContextBuilder.buildContext(
          this.episodeId,
          context
        );

        if (ragContext.prompt) {
          citationPrompt = ragContext.prompt;
          citationMetadata = ragContext.metadata;
          providedCitations = ragContext.citations;
        }
      } catch (error) {
        logger.warn('RAG retrieval failed, continuing without citations:', error);
      }
    }

    // Generate with or without citations
    const systemPrompt = this.buildAdvocatePrompt(side, citationPrompt);
    const response = await this.llmClient.generate({
      // ... existing generation config
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context },
      ],
    });

    // Track used citations
    if (citationMetadata && providedCitations.length > 0) {
      citationMetadata.citationsUsed = this.ragContextBuilder!.analyzeUsedCitations(
        response.content,
        providedCitations
      );
    }

    return {
      content: response.content,
      citationMetadata,
    };
  }

  // Store citation metadata with utterance
  private async saveUtteranceWithCitations(
    utterance: Utterance,
    citationMetadata?: CitationMetadata
  ): Promise<void> {
    // Existing save logic plus:
    if (citationMetadata) {
      await this.utteranceRepo.updateCitationMetadata(
        utterance.id,
        citationMetadata
      );
    }
  }
}
```

### Route Integration

```typescript
// Additions to backend/src/routes/debate-routes.ts

import { vectorDBClient } from '../services/research/vector-db-factory.js';
import { embeddingService } from '../services/research/embedding-service.js';
import { EpisodeProposalRepository } from '../db/repositories/episode-proposal-repository.js';

// When starting a Duelogic episode debate
router.post('/duelogic/episodes/:episodeId/start', async (req, res) => {
  const { episodeId } = req.params;
  const { config } = req.body;

  try {
    // Get the episode proposal
    const proposalRepo = new EpisodeProposalRepository(pool);
    const proposal = await proposalRepo.findById(episodeId);

    if (!proposal || proposal.status !== 'approved') {
      return res.status(404).json({ error: 'Episode not found or not approved' });
    }

    // Check if research is indexed
    const hasResearch = await vectorDBClient.hasIndexedResearch(episodeId);

    // Create debate linked to episode
    const debate = await debateRepo.create({
      proposition: proposal.proposition,
      episodeId: episodeId,
      config: {
        ...config,
        contextForPanel: proposal.contextForPanel,
        chairs: proposal.chairs,
      },
    });

    // Create orchestrator with RAG if research is available
    const orchestrator = new LivelyOrchestrator(config);

    if (hasResearch) {
      orchestrator.enableRAG(episodeId, vectorDBClient, embeddingService);
    }

    // Start the debate
    await orchestrator.start(debate.id);

    res.status(201).json({
      debateId: debate.id,
      episodeId,
      ragEnabled: hasResearch,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## Validation

### How to Test

1. **Unit Tests:**
   - Test RAGContextBuilder prompt generation
   - Test citation analysis
   - Test different citation styles
   - Test empty citation handling

2. **Integration Tests:**
   - Test orchestrator with mocked RAG service
   - Test debate flow with citations
   - Test citation metadata storage

3. **End-to-End Tests:**
   - Run full debate with indexed research
   - Verify citations appear in transcript
   - Check citation metadata is stored

### Test Examples

```typescript
describe('RAGContextBuilder', () => {
  describe('buildContext', () => {
    it('should return empty prompt when no citations found', async () => {
      mockRAGService.retrieveCitations.mockResolvedValue([]);

      const context = await builder.buildContext('episode-1', 'test query');

      expect(context.prompt).toBe('');
      expect(context.citations).toHaveLength(0);
    });

    it('should format natural style citations correctly', async () => {
      mockRAGService.retrieveCitations.mockResolvedValue([
        createCitation({
          sourceTitle: 'AI Ethics Study',
          sourceDomain: 'nature.com',
          publishedAt: new Date('2026-01-15'),
        }),
      ]);

      const context = await builder.buildContext('episode-1', 'AI ethics');

      expect(context.prompt).toContain('nature.com');
      expect(context.prompt).toContain('January 2026');
      expect(context.prompt).toContain('According to');
    });
  });

  describe('analyzeUsedCitations', () => {
    it('should detect domain mentions in response', () => {
      const response = 'According to nature.com, AI ethics are important.';
      const citations = [createCitation({ sourceDomain: 'nature.com' })];

      const used = builder.analyzeUsedCitations(response, citations);

      expect(used).toHaveLength(1);
    });

    it('should detect content phrase matches', () => {
      const response = 'Studies show significant improvements in healthcare outcomes.';
      const citations = [createCitation({
        content: 'Research found significant improvements in healthcare quality',
      })];

      const used = builder.analyzeUsedCitations(response, citations);

      expect(used).toHaveLength(1);
    });
  });
});

describe('RAG-Enhanced Debate', () => {
  it('should inject citations into advocate prompts', async () => {
    const orchestrator = createTestOrchestrator();
    orchestrator.enableRAG('episode-1', mockVectorDB, mockEmbedding);

    mockVectorDB.query.mockResolvedValue([
      createSearchResult({ content: 'Research finding...' }),
    ]);

    await orchestrator.generateAdvocateTurn('pro', 'Opening statement');

    expect(mockLLM.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Research Citations Available'),
          }),
        ]),
      })
    );
  });

  it('should store citation metadata with utterance', async () => {
    const orchestrator = createTestOrchestrator();
    orchestrator.enableRAG('episode-1', mockVectorDB, mockEmbedding);

    await orchestrator.runTurn();

    expect(mockUtteranceRepo.updateCitationMetadata).toHaveBeenCalled();
  });
});
```

### Definition of Done

- [ ] RAGContextBuilder creates well-formatted prompts
- [ ] Citation analysis detects used sources
- [ ] LivelyOrchestrator integrates RAG context
- [ ] Citation metadata stored with utterances
- [ ] Episode linkage working in debates
- [ ] API endpoint for Duelogic episode debates
- [ ] Unit tests pass with >90% coverage
- [ ] Integration test with full debate flow works

---

## Notes

- RAG is optional - debates work fine without it
- Citation analysis is heuristic-based; could be improved with LLM analysis
- Consider caching RAG context if same turn is regenerated
- May want to add citation source links to final transcript export
- Future: Add citation quality scoring to identify weak sources

### Environment Variables

```bash
# RAG Configuration
RAG_MIN_RELEVANCE=0.6
RAG_MAX_CITATIONS_PER_TURN=5
RAG_CITATION_STYLE=natural   # natural, academic, minimal
```

---

## Implementation Notes (2026-01-07)

**Status: COMPLETED**

### Files Created

1. **Types:**
   - `backend/src/types/rag.ts` - RAG configuration and citation metadata types

2. **Services:**
   - `backend/src/services/research/rag-context-builder.ts` - Builds formatted citation prompts
   - `backend/src/services/debate/rag-enhanced-orchestrator.ts` - RAG enhancement wrapper

3. **Database Migration:**
   - `backend/src/db/migrations/015_add_episode_linkage.sql` - Adds episode_id to debates and citation_metadata to utterances

### Key Implementation Details

- RAGContextBuilder supports 3 citation styles: natural, academic, minimal
- RAGEnhancement class can wrap any orchestrator to add citation support
- Uses factory pattern to detect if vector DB is configured
- Automatically falls back gracefully if RAG is not available
- Tracks which citations were actually used in responses

### Architecture

The RAG integration uses a modular design:

```
RAGEnhancement (wrapper)
├── RAGContextBuilder
│   └── RAGRetrievalService
│       ├── EmbeddingService
│       └── VectorDBClient (Pinecone/ChromaDB)
```

### Usage Example

```typescript
import { createRAGEnhancement } from './rag-enhanced-orchestrator';

// Create RAG enhancement for an episode
const rag = createRAGEnhancement({
  episodeId: proposal.id,
  config: { citationStyle: 'natural' }
});

// Check if RAG is available
if (rag.isRAGEnabled()) {
  // Get citations for a turn
  const context = await rag.getCitationContext(currentArgument);

  // Enhance the agent prompt
  const enhancedPrompt = rag.enhancePrompt(basePrompt, context);
}
```

### Future Improvements

- Integrate directly into DuelogicOrchestrator chair agent calls
- Add LLM-based citation usage detection (more accurate than heuristic)
- Cache RAG context for regenerated turns
- Add citation quality scoring

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Completed_
**Created:** 2026-01-03
**Updated:** 2026-01-07
