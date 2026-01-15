# Duelogic Research Approval Workflow

> **Last Updated:** 2026-01-15
> **Document Version:** 1.0.0

This document describes the complete workflow that executes when a user clicks "Approve" on a Duelogic research proposal.

---

## Overview

When a research proposal is approved, the system:
1. Updates the proposal status in the database
2. Assigns an episode number
3. **Asynchronously** fetches and indexes research sources for RAG (Retrieval-Augmented Generation)
4. Stores vectorized content for later use during debates

The approval response returns immediately after the status update, while the indexing process continues in the background.

---

## Workflow Diagram

```
USER CLICKS APPROVE
        ↓
┌─────────────────────────────────────────────────────────────┐
│  [Frontend] POST /api/duelogic/proposals/{id}/approve       │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  [API Route] Validate proposal exists                        │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  [Database] UPDATE episode_proposals                         │
│    • status = 'approved'                                     │
│    • episode_number = assigned                               │
│    • reviewed_at = NOW()                                     │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│  [Response] { success: true, episodeNumber: N }              │
│  (returns immediately - async process starts below)          │
└─────────────────────────────────────────────────────────────┘
        ↓
  ┌─────────────────────────────────────────────────────────┐
  │           ASYNC BACKGROUND PROCESS                       │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  1. Fetch research_results by researchResultId          │
  │           ↓                                             │
  │  2. Create text chunks from:                            │
  │     • Research summary                                  │
  │     • Source excerpts                                   │
  │     • Full articles (if FETCH_FULL_ARTICLES=true)       │
  │           ↓                                             │
  │  3. Generate embeddings via OpenRouter/OpenAI           │
  │     • Model: text-embedding-3-small (1536 dims)         │
  │     • Batch size: 10 texts per API call                 │
  │           ↓                                             │
  │  4. Store vectors in database (Pinecone or pgVector)    │
  │     • Indexed by episodeId for fast retrieval           │
  │           ↓                                             │
  │  5. Update research_results metadata:                   │
  │     • indexed_at = timestamp                            │
  │     • indexed_chunk_count = total vectors               │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
        ↓
  [Later, when debate is launched]
        ↓
┌─────────────────────────────────────────────────────────────┐
│  RAG enabled if hasIndexedResearch(episodeId) = true         │
│    • During debate: embed agent content                      │
│    • Query vectors: semantic similarity search               │
│    • Return citations with sources for agents                │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step

### Step 1: Frontend Approval Button

**File:** `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx`
**Lines:** 125-144 (handler), 552 (button)

```typescript
const handleApprove = async () => {
  const response = await fetch(
    `${API_BASE_URL}/api/duelogic/proposals/${id}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (response.ok) {
    const data = await response.json();
    setEpisodeNumber(data.episodeNumber);
    fetchProposal(); // Refresh proposal data
  }
};
```

---

### Step 2: API Route Handler

**File:** `backend/src/routes/duelogic-research-routes.ts`
**Lines:** 637-665

```typescript
router.post('/proposals/:id/approve', async (req: Request, res: Response) => {
  const { id } = req.params;

  // 1. Fetch the proposal
  const proposal = await proposalRepo.findById(id);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  // 2. Get next episode number
  const nextNumber = await proposalRepo.getNextEpisodeNumber();

  // 3. Update proposal status to 'approved'
  await proposalRepo.approve(id, 'admin', nextNumber);

  // 4. Trigger async research indexing (non-blocking)
  indexResearchAsync(proposal).catch(err => {
    logger.error({ errorMessage: err.message, proposalId: id },
      'Failed to index research');
  });

  // 5. Return immediately with episode number
  return res.json({ success: true, episodeNumber: nextNumber });
});
```

---

### Step 3: Database Status Update

**File:** `backend/src/db/repositories/episode-proposal-repository.ts`
**Lines:** 66-72

```typescript
async approve(id: string, reviewedBy: string, episodeNumber?: number): Promise<void> {
  await this.pool.query(`
    UPDATE episode_proposals
    SET status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = $1,
        episode_number = $2
    WHERE id = $3
  `, [reviewedBy, episodeNumber, id]);
}
```

**Database Changes:**
| Column | Value |
|--------|-------|
| `status` | 'approved' |
| `reviewed_at` | Current timestamp |
| `reviewed_by` | 'admin' |
| `episode_number` | Next sequential number |

---

### Step 4: Async Research Indexing

**File:** `backend/src/routes/duelogic-research-routes.ts`
**Lines:** 670-717

This function runs asynchronously after the approval response is sent.

```typescript
async function indexResearchAsync(proposal: EpisodeProposal): Promise<void> {
  // 1. Create vector database client
  const vectorDB = await createVectorDBClient();

  // 2. Create embedding service
  const embeddingService = new EmbeddingService({
    provider: process.env.EMBEDDING_PROVIDER || 'openrouter',
    model: 'text-embedding-3-small',
    dimensions: 1536
  });

  // 3. Create research indexer
  const indexer = new ResearchIndexer(
    vectorDB,
    embeddingService,
    { fetchFullArticles: process.env.FETCH_FULL_ARTICLES === 'true' }
  );

  // 4. Index the research
  const result = await indexer.indexEpisodeResearch(proposal);

  // 5. Update indexing metadata
  await researchRepo.updateIndexingMetadata(
    proposal.researchResultId,
    new Date(),
    result.chunksIndexed,
    result.error
  );
}
```

---

### Step 5: Research Indexing Pipeline

**File:** `backend/src/services/research/research-indexer.ts`
**Lines:** 52-104

The `indexEpisodeResearch()` method processes the research in this order:

#### 5.1 Fetch Research Results
```typescript
const research = await this.researchRepo.findById(proposal.researchResultId);
```

#### 5.2 Prepare Excerpt Chunks
```typescript
const chunks: TextChunk[] = [];

// Add research summary as a chunk
chunks.push({
  content: research.summary,
  metadata: { type: 'summary', episodeId: proposal.id }
});

// Add each source excerpt as chunks
for (const source of research.sources.filter(s => s.enabled)) {
  if (source.excerpt.length > 500) {
    // Split long excerpts into sub-chunks
    const subChunks = this.splitIntoChunks(source.excerpt, 500);
    chunks.push(...subChunks);
  } else {
    chunks.push({
      content: source.excerpt,
      metadata: {
        sourceUrl: source.url,
        sourceTitle: source.title,
        sourceDomain: source.domain
      }
    });
  }
}
```

#### 5.3 Fetch Full Articles (Optional)

**Controlled by:** `FETCH_FULL_ARTICLES` environment variable

```typescript
if (this.options.fetchFullArticles) {
  const enabledSources = research.sources.filter(s => s.enabled);
  const articles = await this.articleFetcher.fetchArticles(
    enabledSources.map(s => s.url),
    { concurrency: 3 }  // Fetch 3 at a time
  );

  // Chunk articles into 1000-character pieces
  for (const article of articles) {
    const articleChunks = this.splitIntoChunks(article.content, 1000);
    chunks.push(...articleChunks.map(c => ({
      content: c,
      metadata: {
        sourceUrl: article.url,
        sourceTitle: article.title,
        type: 'full_article'
      }
    })));
  }
}
```

**Note:** Only sources marked as `enabled` are fetched and indexed. Sources can be toggled on/off in the frontend before approval.

---

### Step 6: Embedding Generation

**File:** `backend/src/services/research/embedding-service.ts`
**Lines:** 103-143

```typescript
async embedBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  const batchSize = 10;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await this.client.embeddings.create({
      model: this.getModelId(),  // "openai/text-embedding-3-small"
      input: batch,
      dimensions: 1536
    });

    embeddings.push(...response.data.map(d => d.embedding));

    // Rate limiting: 100ms delay between batches
    if (i + batchSize < texts.length) {
      await sleep(100);
    }
  }

  return embeddings;
}
```

**Embedding Configuration:**
| Setting | Value |
|---------|-------|
| Provider | OpenRouter or OpenAI |
| Model | `text-embedding-3-small` |
| Dimensions | 1536 |
| Batch Size | 10 texts per API call |
| Rate Limit | 100ms delay between batches |

---

### Step 7: Vector Database Storage

**Files:**
- `backend/src/services/research/pgvector-client.ts` (PostgreSQL)
- `backend/src/services/research/pinecone-client.ts` (Pinecone)

Each chunk is stored as a vector entry:

```typescript
interface VectorEntry {
  id: string;                    // UUID
  episodeId: string;             // Links to proposal
  researchResultId: string;      // Links to research
  content: string;               // The text chunk
  embedding: number[];           // 1536-dimensional vector
  metadata: {
    sourceUrl: string;
    sourceTitle: string;
    sourceDomain: string;
    publishedAt?: Date;
    category: ResearchCategory;
    excerpt: string;             // First 200 chars
    type: 'summary' | 'excerpt' | 'full_article';
  }
}
```

---

### Step 8: Metadata Persistence

**File:** `backend/src/routes/duelogic-research-routes.ts`
**Lines:** 688-693

After indexing completes, the metadata is saved:

```typescript
await researchRepo.updateIndexingMetadata(
  proposal.researchResultId,
  new Date(),        // indexed_at timestamp
  chunksIndexed,     // count of indexed chunks
  errorMessage       // null or error message
);
```

**Database Updates to `research_results`:**
| Column | Value |
|--------|-------|
| `indexed_at` | Completion timestamp |
| `indexed_chunk_count` | Number of vectors stored |
| `indexing_error` | null (or error message) |

---

## RAG Integration (During Debates)

**File:** `backend/src/routes/duelogic-research-routes.ts`
**Lines:** 1075-1096

When a debate is launched from an approved proposal:

```typescript
// Check if research has been indexed
const hasResearch = await vectorDB.hasIndexedResearch(proposalId);

if (hasResearch) {
  const ragService = createRAGRetrievalService(vectorDB, embeddingService);
  orchestrator.enableRAG(ragService, proposalId);
}
```

**File:** `backend/src/services/research/rag-retrieval-service.ts`
**Lines:** 41-74

During debate turns, the RAG service retrieves relevant citations:

```typescript
async retrieveCitations(content: string, episodeId: string): Promise<Citation[]> {
  // 1. Embed the agent's turn content
  const queryEmbedding = await this.embeddingService.embed(content);

  // 2. Query vector DB for similar chunks
  const results = await this.vectorDB.query({
    vector: queryEmbedding,
    topK: 5,
    filter: { episodeId }
  });

  // 3. Filter by relevance threshold
  const relevant = results.filter(r => r.score > 0.4);

  // 4. Return citations with source metadata
  return relevant.map(r => ({
    content: r.content,
    sourceUrl: r.metadata.sourceUrl,
    sourceTitle: r.metadata.sourceTitle,
    relevanceScore: r.score
  }));
}
```

---

## Key Files Reference

| Component | File | Key Lines |
|-----------|------|-----------|
| Frontend Approval | `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx` | 125-144, 552 |
| API Route | `backend/src/routes/duelogic-research-routes.ts` | 637-665 |
| DB Repository | `backend/src/db/repositories/episode-proposal-repository.ts` | 66-72 |
| Async Indexing | `backend/src/routes/duelogic-research-routes.ts` | 670-717 |
| Research Indexer | `backend/src/services/research/research-indexer.ts` | 52-104 |
| Article Fetching | `backend/src/services/research/research-indexer.ts` | 109-166 |
| Embedding Service | `backend/src/services/research/embedding-service.ts` | 103-143 |
| Vector DB Factory | `backend/src/services/research/vector-db-factory.ts` | - |
| RAG Retrieval | `backend/src/services/research/rag-retrieval-service.ts` | 41-74 |
| RAG Integration | `backend/src/routes/duelogic-research-routes.ts` | 1075-1096 |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FETCH_FULL_ARTICLES` | `false` | Whether to scrape full article content |
| `EMBEDDING_PROVIDER` | `openrouter` | Embedding provider (`openrouter` or `openai`) |
| `OPENROUTER_API_KEY` | - | API key for OpenRouter embeddings |
| `OPENAI_API_KEY` | - | API key for OpenAI embeddings |
| `VECTOR_DB_PROVIDER` | `pgvector` | Vector database (`pgvector` or `pinecone`) |
| `PINECONE_API_KEY` | - | API key for Pinecone (if used) |

---

## Error Handling

- If indexing fails, the error is logged and stored in `research_results.indexing_error`
- The approval still succeeds (indexing is non-blocking)
- Failed indexing can be retried manually via admin interface
- Source fetch failures are logged but don't block other sources

---

## Performance Considerations

- **Async Processing:** Approval returns immediately; indexing happens in background
- **Batch Embeddings:** 10 texts per API call to optimize throughput
- **Rate Limiting:** 100ms delay between embedding batches
- **Concurrent Fetching:** Up to 3 articles fetched simultaneously
- **Source Filtering:** Only enabled sources are indexed (reduces unnecessary work)
