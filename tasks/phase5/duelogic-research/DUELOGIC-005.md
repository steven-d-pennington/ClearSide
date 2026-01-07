# DUELOGIC-005: Vector Database Integration for RAG

**Task ID:** DUELOGIC-005
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P1
**Estimated Effort:** L (1-3 days)
**Dependencies:** DUELOGIC-001 (Database Schema)
**Status:** Ready

---

## Context

To enable Duelogic debate agents to cite real sources during episodes, research data must be indexed in a vector database for Retrieval-Augmented Generation (RAG). When a debate is running, the agents can query relevant research and cite it naturally in their arguments.

This task implements the vector database integration layer that:
1. Indexes research results when episodes are approved
2. Provides semantic search over indexed research
3. Returns formatted citations for debate agents to use

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Vector Database & RAG
- [Pinecone Documentation](https://docs.pinecone.io/)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)

---

## Requirements

### Acceptance Criteria

- [ ] Create `VectorDBClient` interface for vector database operations
- [ ] Implement Pinecone adapter (primary)
- [ ] Implement ChromaDB adapter (alternative/local)
- [ ] Create embedding service using OpenAI text-embedding-3-small
- [ ] Implement research indexing on episode approval
- [ ] Create RAG retrieval service for debates
- [ ] Format citations for natural use in debate prompts
- [ ] Handle index cleanup on episode deletion
- [ ] Write unit tests for all components

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- Store all gathered research in a vector database
- Index research by episode ID for targeted retrieval
- Track source metadata (URLs, publication dates, credibility)
- Agents instructed to use RAG as primary citation source
- Citation format: natural language (e.g., "According to a January 2026 Reuters report...")

---

## Implementation Guide

### Vector Database Interface

```typescript
// backend/src/types/vector-db.ts

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
```

### Embedding Service

```typescript
// backend/src/services/research/embedding-service.ts

import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  batchSize: number;
}

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  batchSize: 100, // OpenAI limit is 2048
};

export class EmbeddingService {
  private openai: OpenAI;
  private config: EmbeddingConfig;

  constructor(apiKey: string, config?: Partial<EmbeddingConfig>) {
    this.openai = new OpenAI({ apiKey });
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.config.model,
      input: text,
      dimensions: this.config.dimensions,
    });

    return response.data[0].embedding;
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);

      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: batch,
        dimensions: this.config.dimensions,
      });

      for (const data of response.data) {
        embeddings.push(data.embedding);
      }

      // Small delay between batches to avoid rate limiting
      if (i + this.config.batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.config.dimensions;
  }
}
```

### Pinecone Adapter

```typescript
// backend/src/services/research/pinecone-client.ts

import { Pinecone, Index } from '@pinecone-database/pinecone';
import {
  VectorDBClient,
  VectorEntry,
  SearchResult,
  VectorMetadata
} from '../../types/vector-db.js';
import { logger } from '../../utils/logger.js';

export interface PineconeConfig {
  apiKey: string;
  indexName: string;
  namespace?: string;
}

export class PineconeClient implements VectorDBClient {
  private client: Pinecone;
  private index: Index;
  private namespace: string;

  constructor(config: PineconeConfig) {
    this.client = new Pinecone({ apiKey: config.apiKey });
    this.index = this.client.index(config.indexName);
    this.namespace = config.namespace || 'duelogic-research';
  }

  async upsert(entries: VectorEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const vectors = entries.map(entry => ({
      id: entry.id,
      values: entry.embedding!,
      metadata: {
        episodeId: entry.episodeId,
        researchResultId: entry.researchResultId,
        content: entry.content.slice(0, 1000), // Pinecone metadata limit
        sourceUrl: entry.metadata.sourceUrl,
        sourceTitle: entry.metadata.sourceTitle,
        sourceDomain: entry.metadata.sourceDomain,
        publishedAt: entry.metadata.publishedAt?.toISOString(),
        category: entry.metadata.category,
        excerpt: entry.metadata.excerpt.slice(0, 500),
      },
    }));

    // Upsert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await this.index.namespace(this.namespace).upsert(batch);
    }

    logger.info(`Upserted ${entries.length} vectors to Pinecone`);
  }

  async query(
    episodeId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<SearchResult[]> {
    const response = await this.index.namespace(this.namespace).query({
      vector: queryEmbedding,
      topK,
      filter: { episodeId: { $eq: episodeId } },
      includeMetadata: true,
    });

    return response.matches?.map(match => ({
      id: match.id,
      content: (match.metadata?.content as string) || '',
      score: match.score || 0,
      metadata: {
        sourceUrl: match.metadata?.sourceUrl as string,
        sourceTitle: match.metadata?.sourceTitle as string,
        sourceDomain: match.metadata?.sourceDomain as string,
        publishedAt: match.metadata?.publishedAt
          ? new Date(match.metadata.publishedAt as string)
          : undefined,
        category: match.metadata?.category as string,
        excerpt: match.metadata?.excerpt as string,
      },
    })) || [];
  }

  async deleteByEpisode(episodeId: string): Promise<void> {
    await this.index.namespace(this.namespace).deleteMany({
      filter: { episodeId: { $eq: episodeId } },
    });

    logger.info(`Deleted vectors for episode ${episodeId}`);
  }

  async hasIndexedResearch(episodeId: string): Promise<boolean> {
    const response = await this.index.namespace(this.namespace).query({
      vector: new Array(1536).fill(0), // Dummy vector
      topK: 1,
      filter: { episodeId: { $eq: episodeId } },
    });

    return (response.matches?.length || 0) > 0;
  }

  async ping(): Promise<boolean> {
    try {
      await this.index.describeIndexStats();
      return true;
    } catch {
      return false;
    }
  }
}
```

### ChromaDB Adapter (Alternative)

```typescript
// backend/src/services/research/chroma-client.ts

import { ChromaClient, Collection } from 'chromadb';
import {
  VectorDBClient,
  VectorEntry,
  SearchResult
} from '../../types/vector-db.js';
import { logger } from '../../utils/logger.js';

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
    } catch {
      return false;
    }
  }
}
```

### Research Indexing Service

```typescript
// backend/src/services/research/research-indexer.ts

import { v4 as uuidv4 } from 'uuid';
import { VectorDBClient, VectorEntry } from '../../types/vector-db.js';
import { EmbeddingService } from './embedding-service.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { EpisodeProposal, ResearchResult, ResearchSource } from '../../types/duelogic-research.js';
import { logger } from '../../utils/logger.js';

export class ResearchIndexer {
  constructor(
    private vectorDB: VectorDBClient,
    private embeddingService: EmbeddingService,
    private researchRepo: ResearchRepository
  ) {}

  /**
   * Index all research for an approved episode
   */
  async indexEpisodeResearch(proposal: EpisodeProposal): Promise<number> {
    if (!proposal.researchResultId) {
      logger.warn(`Proposal ${proposal.id} has no research result`);
      return 0;
    }

    const episodeId = proposal.id;
    const research = await this.researchRepo.findResultById(proposal.researchResultId);

    if (!research) {
      logger.warn(`Research result ${proposal.researchResultId} not found`);
      return 0;
    }

    // Prepare text chunks from sources
    const chunks = this.prepareChunks(research, episodeId);

    if (chunks.length === 0) {
      logger.info(`No chunks to index for episode ${episodeId}`);
      return 0;
    }

    // Generate embeddings
    const texts = chunks.map(c => c.content);
    const embeddings = await this.embeddingService.embedBatch(texts);

    // Add embeddings to entries
    const entries: VectorEntry[] = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));

    // Upsert to vector database
    await this.vectorDB.upsert(entries);

    logger.info(`Indexed ${entries.length} chunks for episode ${episodeId}`);
    return entries.length;
  }

  /**
   * Prepare text chunks from research sources
   */
  private prepareChunks(
    research: ResearchResult,
    episodeId: string
  ): Omit<VectorEntry, 'embedding'>[] {
    const chunks: Omit<VectorEntry, 'embedding'>[] = [];

    // Add summary as a chunk
    chunks.push({
      id: uuidv4(),
      episodeId,
      researchResultId: research.id,
      content: `Topic Summary: ${research.summary}`,
      metadata: {
        sourceUrl: '',
        sourceTitle: 'Research Summary',
        sourceDomain: 'internal',
        category: research.category,
        excerpt: research.summary.slice(0, 200),
      },
    });

    // Add each source as chunks
    for (const source of research.sources) {
      // Main excerpt chunk
      if (source.excerpt && source.excerpt.length > 20) {
        chunks.push({
          id: uuidv4(),
          episodeId,
          researchResultId: research.id,
          content: this.formatSourceContent(source),
          metadata: {
            sourceUrl: source.url,
            sourceTitle: source.title,
            sourceDomain: source.domain,
            publishedAt: source.publishedAt,
            category: research.category,
            excerpt: source.excerpt,
          },
        });
      }

      // If excerpt is long, create additional chunks
      if (source.excerpt && source.excerpt.length > 500) {
        const additionalChunks = this.splitIntoChunks(source.excerpt, 500);
        for (let i = 1; i < additionalChunks.length; i++) {
          chunks.push({
            id: uuidv4(),
            episodeId,
            researchResultId: research.id,
            content: `From ${source.title}: ${additionalChunks[i]}`,
            metadata: {
              sourceUrl: source.url,
              sourceTitle: source.title,
              sourceDomain: source.domain,
              publishedAt: source.publishedAt,
              category: research.category,
              excerpt: additionalChunks[i],
            },
          });
        }
      }
    }

    return chunks;
  }

  /**
   * Format source content for embedding
   */
  private formatSourceContent(source: ResearchSource): string {
    const parts = [
      `Source: ${source.title}`,
      `Domain: ${source.domain}`,
    ];

    if (source.publishedAt) {
      parts.push(`Published: ${source.publishedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`);
    }

    parts.push(`Content: ${source.excerpt}`);

    return parts.join('\n');
  }

  /**
   * Split text into chunks of approximately maxSize characters
   */
  private splitIntoChunks(text: string, maxSize: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += sentence;
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Remove indexed research for an episode
   */
  async removeEpisodeResearch(episodeId: string): Promise<void> {
    await this.vectorDB.deleteByEpisode(episodeId);
    logger.info(`Removed indexed research for episode ${episodeId}`);
  }

  /**
   * Check if episode has indexed research
   */
  async hasIndexedResearch(episodeId: string): Promise<boolean> {
    return this.vectorDB.hasIndexedResearch(episodeId);
  }
}
```

### RAG Retrieval Service

```typescript
// backend/src/services/research/rag-retrieval-service.ts

import { VectorDBClient, RAGCitation } from '../../types/vector-db.js';
import { EmbeddingService } from './embedding-service.js';
import { logger } from '../../utils/logger.js';

export interface RAGConfig {
  topK: number;
  minRelevanceScore: number;
  includeSourceLinks: boolean;
}

const DEFAULT_RAG_CONFIG: RAGConfig = {
  topK: 5,
  minRelevanceScore: 0.6,
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
    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.embed(query);

    // Query vector database
    const results = await this.vectorDB.query(
      episodeId,
      queryEmbedding,
      this.config.topK
    );

    // Filter by relevance score and map to citations
    return results
      .filter(r => r.score >= this.config.minRelevanceScore)
      .map(r => ({
        content: r.content,
        sourceUrl: r.metadata.sourceUrl,
        sourceTitle: r.metadata.sourceTitle,
        sourceDomain: r.metadata.sourceDomain,
        publishedAt: r.metadata.publishedAt,
        relevanceScore: r.score,
      }));
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
      const dateStr = c.publishedAt
        ? c.publishedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'recent';

      return `
**Source ${index + 1}: ${c.sourceTitle}** (${c.sourceDomain}, ${dateStr})
"${c.content}"
${this.config.includeSourceLinks ? `URL: ${c.sourceUrl}` : ''}
Relevance: ${(c.relevanceScore * 100).toFixed(0)}%`;
    }).join('\n\n');

    return `
## Available Research & Citations

Use these sources to support your arguments. Cite them naturally in your response.

${citationBlocks}

### Citation Guidelines
When citing, use natural language like:
- "According to a ${citations[0]?.publishedAt?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) || 'recent'} ${citations[0]?.sourceDomain || ''} report..."
- "A study published in ${citations[0]?.sourceTitle || '...'} found that..."
- "As ${citations[0]?.sourceDomain || '...'} reported..."

Do not include URLs in your spoken response - they will be added to the transcript automatically.
`;
  }

  /**
   * Format a single citation for use in debate text
   */
  formatCitationForSpeech(citation: RAGCitation): string {
    const dateStr = citation.publishedAt
      ? citation.publishedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'recently';

    return `According to ${citation.sourceDomain} (${dateStr}), "${citation.content.slice(0, 150)}..."`;
  }
}
```

---

## Validation

### How to Test

1. **Unit Tests:**
   - Test embedding generation
   - Test vector upsert and query
   - Test chunk preparation
   - Test citation formatting
   - Test relevance filtering

2. **Integration Tests:**
   - Test full indexing flow
   - Test retrieval with real embeddings
   - Test ChromaDB locally
   - Mock Pinecone for CI

3. **Manual Testing:**
   - Index sample research
   - Query with debate-like questions
   - Verify citation relevance

### Test Examples

```typescript
describe('RAGRetrievalService', () => {
  describe('retrieveCitations', () => {
    it('should return relevant citations above threshold', async () => {
      mockVectorDB.query.mockResolvedValue([
        { id: '1', content: 'Relevant content', score: 0.85, metadata: createMetadata() },
        { id: '2', content: 'Less relevant', score: 0.55, metadata: createMetadata() },
      ]);

      const citations = await service.retrieveCitations('episode-1', 'test query');

      expect(citations).toHaveLength(1);
      expect(citations[0].relevanceScore).toBe(0.85);
    });
  });

  describe('buildCitationContext', () => {
    it('should format citations with natural language guidelines', async () => {
      mockVectorDB.query.mockResolvedValue([
        {
          id: '1',
          content: 'AI hiring bias study results',
          score: 0.9,
          metadata: {
            sourceTitle: 'MIT Tech Review',
            sourceDomain: 'technologyreview.com',
            publishedAt: new Date('2026-01-15'),
          },
        },
      ]);

      const context = await service.buildCitationContext('episode-1', 'AI in hiring');

      expect(context).toContain('MIT Tech Review');
      expect(context).toContain('January 2026');
      expect(context).toContain('According to');
    });
  });
});
```

### Definition of Done

- [ ] VectorDBClient interface defined
- [ ] Pinecone adapter implemented
- [ ] ChromaDB adapter implemented (for local dev)
- [ ] EmbeddingService generates embeddings correctly
- [ ] ResearchIndexer indexes research on episode approval
- [ ] RAGRetrievalService returns relevant citations
- [ ] Citation context formatted for debate agents
- [ ] Index cleanup on episode deletion works
- [ ] Unit tests pass with >90% coverage

---

## Notes

- Pinecone requires a paid plan for production; ChromaDB is free/local
- text-embedding-3-small has 1536 dimensions, good balance of cost/quality
- Consider caching embeddings for frequently-queried content
- Index cleanup important to avoid stale data
- May want to add metadata filtering by category

### Environment Variables

```bash
# Pinecone
PINECONE_API_KEY=your-api-key
PINECONE_INDEX_NAME=duelogic-research

# ChromaDB (local alternative)
CHROMA_HOST=localhost
CHROMA_PORT=8000

# OpenAI (for embeddings)
OPENAI_API_KEY=your-api-key
```

---

## Implementation Notes (2026-01-07)

**Status: COMPLETED**

### Files Created

1. **Types:**
   - `backend/src/types/vector-db.ts` - VectorDBClient interface, VectorEntry, SearchResult, RAGCitation types

2. **Services:**
   - `backend/src/services/research/embedding-service.ts` - OpenAI embedding generation
   - `backend/src/services/research/pinecone-client.ts` - Pinecone vector DB adapter
   - `backend/src/services/research/chroma-client.ts` - ChromaDB local adapter
   - `backend/src/services/research/research-indexer.ts` - Indexes research into vector DB
   - `backend/src/services/research/rag-retrieval-service.ts` - Retrieves citations for debates
   - `backend/src/services/research/vector-db-factory.ts` - Factory for creating vector DB clients

3. **Dependencies Added:**
   - `@pinecone-database/pinecone` - Pinecone client
   - `chromadb` - ChromaDB client

### Key Implementation Details

- Uses `text-embedding-3-small` model with 1536 dimensions
- Supports both Pinecone (cloud) and ChromaDB (local) via environment config
- Auto-detects provider from environment variables
- Chunks research sources into semantic units for better retrieval
- RAG retrieval filters by minimum relevance score (default 0.6)

### Environment Variables Required

```bash
VECTOR_DB_PROVIDER=pinecone  # or 'chroma'
PINECONE_API_KEY=your-key
PINECONE_INDEX_NAME=duelogic-research
OPENAI_API_KEY=your-key
```

---

**Estimated Time:** 1-3 days
**Assigned To:** _Completed_
**Created:** 2026-01-03
**Updated:** 2026-01-07
