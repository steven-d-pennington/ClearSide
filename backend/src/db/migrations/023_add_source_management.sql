-- Migration 023: Add Source Management Support
-- Adds metadata tracking for research source indexing

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
