-- Migration: 037_add_session_max_turns.sql
-- Adds configurable turn limit to conversation sessions

ALTER TABLE conversation_sessions
ADD COLUMN IF NOT EXISTS max_turns INTEGER DEFAULT 30;

-- Add constraint for valid range (drop first if exists for idempotency)
ALTER TABLE conversation_sessions
DROP CONSTRAINT IF EXISTS valid_max_turns;

ALTER TABLE conversation_sessions
ADD CONSTRAINT valid_max_turns CHECK (max_turns IS NULL OR (max_turns >= 5 AND max_turns <= 100));

COMMENT ON COLUMN conversation_sessions.max_turns IS
  'Maximum number of turns before closing sequence begins (5-100, default 30)';
