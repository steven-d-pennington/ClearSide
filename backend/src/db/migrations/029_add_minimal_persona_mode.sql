-- Migration: Add minimal persona mode support
-- Description: Adds minimal_persona_mode flag to conversation_sessions
-- This enables "Model Debate" mode where models speak without character personas

-- Add minimal_persona_mode column to conversation_sessions (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversation_sessions'
    AND column_name = 'minimal_persona_mode'
  ) THEN
    ALTER TABLE conversation_sessions
    ADD COLUMN minimal_persona_mode BOOLEAN DEFAULT FALSE;

    -- Add comment for documentation
    COMMENT ON COLUMN conversation_sessions.minimal_persona_mode IS
    'When true, models speak without persona constraints (Model Debate mode). When false, uses full persona backstories/worldviews (Persona Debate mode).';
  END IF;
END $$;
