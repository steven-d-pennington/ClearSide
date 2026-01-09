-- Migration 022: Add segment preview storage
-- Stores TTS audio previews for individual conversation segments

-- Segment previews table
-- Allows users to preview and regenerate individual segment audio before full export
CREATE TABLE IF NOT EXISTS conversation_segment_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  segment_index INT NOT NULL,
  voice_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'google_cloud',
  audio_path VARCHAR(512),
  audio_url VARCHAR(512),
  duration_ms INT,
  character_count INT,
  content_hash VARCHAR(64),  -- MD5 hash of segment content to detect changes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, segment_index)
);

-- Index for fast lookups by session
CREATE INDEX IF NOT EXISTS idx_segment_previews_session_id ON conversation_segment_previews(session_id);

-- Index for cleanup of old previews
CREATE INDEX IF NOT EXISTS idx_segment_previews_created_at ON conversation_segment_previews(created_at);

COMMENT ON TABLE conversation_segment_previews IS 'Stores TTS audio previews for individual conversation segments';
COMMENT ON COLUMN conversation_segment_previews.content_hash IS 'MD5 hash of segment content to detect if content changed since preview was generated';
