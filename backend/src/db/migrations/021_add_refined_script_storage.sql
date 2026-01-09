-- Migration: Add refined script storage for conversation podcast export
-- Stores edited/refined scripts that users have modified before audio generation

-- Create table for storing refined script overrides
CREATE TABLE IF NOT EXISTS conversation_refined_scripts (
  session_id UUID PRIMARY KEY REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  segments JSONB NOT NULL,
  provider VARCHAR(50),
  title TEXT,
  topic TEXT,
  total_words INTEGER,
  estimated_duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for clarity
COMMENT ON TABLE conversation_refined_scripts IS 'Stores user-edited refined scripts for podcast export. One per conversation session.';
COMMENT ON COLUMN conversation_refined_scripts.segments IS 'JSONB array of RefinedSegment objects with speakerName, content, order, isKeyPoint, etc.';

-- Index for quick lookups by session
CREATE INDEX IF NOT EXISTS idx_conversation_refined_scripts_updated
ON conversation_refined_scripts(updated_at DESC);
