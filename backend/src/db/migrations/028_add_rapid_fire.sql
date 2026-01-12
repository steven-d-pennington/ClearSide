-- Migration: Add rapid_fire column to conversation_sessions
-- Description: Adds support for rapid fire mode in conversations

ALTER TABLE conversation_sessions
ADD COLUMN IF NOT EXISTS rapid_fire BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN conversation_sessions.rapid_fire IS 'When true, agents use short punchy responses (2-3 sentences) for fast-paced debates';
