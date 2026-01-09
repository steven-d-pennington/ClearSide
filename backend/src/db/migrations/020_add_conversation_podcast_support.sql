-- Migration: Add conversation session support to podcast export jobs
-- This allows podcast_export_jobs to reference either a debate OR a conversation session

-- Make debate_id nullable (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'podcast_export_jobs' AND column_name = 'debate_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE podcast_export_jobs ALTER COLUMN debate_id DROP NOT NULL;
  END IF;
END $$;

-- Add conversation_session_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'podcast_export_jobs' AND column_name = 'conversation_session_id'
  ) THEN
    ALTER TABLE podcast_export_jobs
    ADD COLUMN conversation_session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'podcast_export_jobs_source_check'
  ) THEN
    ALTER TABLE podcast_export_jobs
    ADD CONSTRAINT podcast_export_jobs_source_check
    CHECK (debate_id IS NOT NULL OR conversation_session_id IS NOT NULL);
  END IF;
END $$;

-- Add index for conversation session lookups if not exists
CREATE INDEX IF NOT EXISTS idx_podcast_export_jobs_conversation_session_id
ON podcast_export_jobs(conversation_session_id)
WHERE conversation_session_id IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN podcast_export_jobs.conversation_session_id IS 'Reference to conversation session (alternative to debate_id for conversational podcasts)';
