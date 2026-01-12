# SOURCE-001: Research Source Management UI

**Task ID:** SOURCE-001
**Phase:** Phase 7
**Category:** Source Management
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** Phase 5 (Duelogic Research complete)
**Status:** Done

---

## Context

The Duelogic Research system uses Perplexity to discover sources for episode proposals, but these sources are stored in the database without any user visibility or control. This task adds a comprehensive UI for viewing, managing, and controlling which sources get indexed for RAG-enhanced debates.

**References:**
- Phase 5 Duelogic Research implementation
- `backend/src/services/research/research-indexer.ts` - RAG indexing logic
- `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx` - Proposal detail UI

**Plan File:** [effervescent-imagining-pascal.md](../../../.claude/plans/effervescent-imagining-pascal.md)

---

## Requirements

### Acceptance Criteria

- [x] Add database columns for indexing metadata (indexed_at, indexed_chunk_count, indexing_error)
- [x] Update ResearchSource type with management fields (enabled, customAdded, addedBy, addedAt)
- [x] Create repository methods (findResultWithSources, updateSources, updateIndexingMetadata)
- [x] Implement 3 API endpoints (GET research, PUT sources, POST reindex)
- [x] Update indexer to filter enabled sources only
- [x] Create frontend UI section with checkboxes and source cards
- [x] Implement source toggle, add custom source, save, and reindex handlers
- [x] Add CSS styling with hover effects, badges, and loading states
- [x] Display indexing stats (chunk count, indexed timestamp)
- [x] Show "Custom" badge for manually added sources

### Functional Requirements

**Problem Statement:**
- Research sources are stored in `research_results.sources` (JSONB) but completely hidden from UI
- Users cannot see which sources Perplexity found
- Users cannot remove low-quality or irrelevant sources
- Users cannot add custom sources from their own research
- Users cannot control what gets indexed to Pinecone for RAG

**Solution:**
- Add "Research Sources" section to proposal detail page
- Display all sources with checkboxes for enable/disable
- Allow adding custom sources with URL, title, and excerpt
- Provide "Re-index Sources" button to update vector database
- Track indexing metadata (when indexed, chunk count, errors)
- Filter out disabled sources during indexing

---

## Implementation

### 1. Database Migration

**File:** `backend/src/db/migrations/023_add_source_management.sql`

```sql
-- Add indexing metadata columns to research_results
ALTER TABLE research_results
ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS indexed_chunk_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS indexing_error TEXT;

-- Create index for faster queries on indexed research
CREATE INDEX IF NOT EXISTS idx_research_results_indexed
ON research_results(indexed_at)
WHERE indexed_at IS NOT NULL;

-- Note: No schema changes needed for source fields
-- The 'sources' JSONB column is flexible and can store:
-- - enabled: boolean (default true)
-- - customAdded: boolean
-- - addedBy: string
-- - addedAt: timestamp
-- These fields are handled at the application layer
```

### 2. Backend Types

**File:** `backend/src/types/duelogic-research.ts`

```typescript
export interface ResearchSource {
  url: string;
  title: string;
  domain: string;
  publishedAt?: Date;
  excerpt: string;
  credibilityScore?: number;

  // Source management fields
  enabled?: boolean;        // Default true; false = exclude from indexing
  customAdded?: boolean;    // True if manually added by user
  addedBy?: string;         // User who added custom source
  addedAt?: Date;           // When custom source was added
}

export interface ResearchResult {
  // ... existing fields ...

  // Indexing metadata
  indexedAt?: Date;         // When sources were last indexed
  indexedChunkCount?: number; // Number of chunks indexed
  indexingError?: string;   // Error message if indexing failed
}
```

### 3. Repository Methods

**File:** `backend/src/db/repositories/research-repository.ts`

```typescript
/**
 * Find research result with sources (alias for findResultById with clearer intent)
 */
async findResultWithSources(id: string): Promise<ResearchResult | null> {
  const result = await this.pool.query(
    `SELECT * FROM research_results WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? this.mapResultRow(result.rows[0]) : null;
}

/**
 * Update sources for a research result
 */
async updateSources(
  resultId: string,
  sources: any[],
  updatedBy: string
): Promise<void> {
  await this.pool.query(
    `UPDATE research_results SET sources = $1 WHERE id = $2`,
    [JSON.stringify(sources), resultId]
  );
}

/**
 * Update indexing metadata after indexing sources
 */
async updateIndexingMetadata(
  resultId: string,
  indexedAt: Date,
  chunkCount: number,
  error?: string
): Promise<void> {
  await this.pool.query(
    `UPDATE research_results
     SET indexed_at = $1, indexed_chunk_count = $2, indexing_error = $3
     WHERE id = $4`,
    [indexedAt, chunkCount, error || null, resultId]
  );
}
```

### 4. API Routes

**File:** `backend/src/routes/duelogic-research-routes.ts`

Added 3 new endpoints:

1. **GET /duelogic/proposals/:id/research** - Get research result with sources for a proposal
2. **PUT /duelogic/proposals/:id/research/sources** - Update research sources (with Zod validation)
3. **POST /duelogic/proposals/:id/research/reindex** - Re-index research sources into vector database

### 5. Indexer Updates

**File:** `backend/src/services/research/research-indexer.ts`

Updated two methods to filter for enabled sources:

```typescript
// In prepareExcerptChunks()
const enabledSources = research.sources.filter(s => s.enabled !== false);

// In fetchAndChunkArticles()
const enabledSources = research.sources.filter(s => s.enabled !== false);
const urls = enabledSources.map(s => s.url).filter(url => url && url.startsWith('http'));
```

### 6. Frontend UI

**File:** `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx`

Added "Research Sources" section with:
- Source count badge (X of Y enabled)
- "Manage Sources" button to enter edit mode
- Checkboxes for enable/disable when editing
- Source cards with title (clickable link), domain, excerpt, published date
- "Custom" badge for manually added sources
- "Add Custom Source" button (prompts for URL, title, excerpt)
- "Save Changes" and "Cancel" buttons
- "Re-index Sources" button (only for approved proposals)
- Indexing stats badge (chunk count, indexed timestamp)

**File:** `frontend/src/pages/AdminDuelogicProposalDetailPage.module.css`

Added comprehensive CSS styling:
- `.sourcesList`, `.sourceItem`, `.sourceHeader`, `.sourceContent`
- `.sourceCheckbox`, `.sourceTitle`, `.sourceDomain`, `.sourceExcerpt`
- `.customBadge`, `.sourcesActions`, `.reindexButton`
- `.indexingBadge`, `.indexedIcon`
- Hover effects, transitions, disabled state styling

---

## Testing & Verification

### Manual Testing Checklist

1. ✅ View proposal detail page - sources section appears
2. ✅ Click "Manage Sources" - checkboxes appear
3. ✅ Uncheck a source - becomes grayed out
4. ✅ Click "Add Custom Source" - prompts for URL, title, excerpt
5. ✅ Custom source appears with "Custom" badge
6. ✅ Click "Save Changes" - success message appears
7. ✅ Refresh page - changes persisted
8. ✅ Click "Re-index Sources" - loading spinner, then success message
9. ⬜ Launch debate - verify only enabled sources cited in RAG
10. ⬜ Verify disabled sources don't appear in debate citations

### End-to-End Test Commands

```bash
# 1. Approve a proposal (triggers initial indexing)
curl -X POST http://localhost:3000/api/duelogic/proposals/{id}/approve

# 2. Get research sources
curl http://localhost:3000/api/duelogic/proposals/{id}/research

# 3. Update sources (disable one)
curl -X PUT http://localhost:3000/api/duelogic/proposals/{id}/research/sources \
  -H "Content-Type: application/json" \
  -d '{"sources": [...]}'

# 4. Re-index
curl -X POST http://localhost:3000/api/duelogic/proposals/{id}/research/reindex

# 5. Launch debate and verify only enabled sources appear in citations
```

---

## Critical Files Modified

### Backend
- `backend/src/db/migrations/023_add_source_management.sql` (new)
- `backend/src/types/duelogic-research.ts` (modified)
- `backend/src/db/repositories/research-repository.ts` (modified)
- `backend/src/routes/duelogic-research-routes.ts` (modified)
- `backend/src/services/research/research-indexer.ts` (modified)

### Frontend
- `frontend/src/types/duelogic-research.ts` (modified)
- `frontend/src/pages/AdminDuelogicProposalDetailPage.tsx` (modified)
- `frontend/src/pages/AdminDuelogicProposalDetailPage.module.css` (modified)

---

## Dependencies

- No new npm packages required
- Uses existing vector DB clients (Pinecone/PgVector/Chroma)
- Uses existing UI components (Button, Alert)
- Requires Phase 5 (Duelogic Research) to be complete

---

## Future Enhancements

1. Bulk select/deselect all sources checkbox
2. Inline editing of titles and excerpts (without prompts)
3. Auto-fetch metadata from URLs using web scraping
4. Source quality scoring visualization (credibility indicators)
5. Preview indexed chunks before re-indexing
6. Source deduplication across proposals
7. Source recommendation based on topic similarity

---

## Notes

**Design Decisions:**
- Used JSONB flexibility - no schema changes needed for source fields
- Enabled sources default to true (backward compatible)
- Manual re-indexing gives users explicit control
- Indexing metadata tracked for debugging and transparency

**Security Considerations:**
- Zod validation on source updates prevents malformed data
- URL validation ensures custom sources have valid URLs
- Admin-only access (no public source management)

**Performance:**
- Index on `indexed_at` for faster queries
- Source filtering happens in application layer (not DB query)
- Re-indexing is async and doesn't block UI

---

**Implementation Complete:** 2026-01-11
**Implemented By:** Claude Sonnet 4.5
