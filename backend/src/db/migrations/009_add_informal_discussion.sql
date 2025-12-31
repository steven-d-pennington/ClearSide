-- Migration: 009_add_informal_discussion
-- Description: Add informal discussion mode support
-- Date: 2025-12-31

-- ============================================================================
-- DEBATES TABLE CHANGES
-- ============================================================================

-- Add discussion_mode column to debates table
-- Values: 'debate' (default, structured Pro/Con) or 'informal' (freeform discussion)
ALTER TABLE debates ADD COLUMN IF NOT EXISTS discussion_mode VARCHAR(20) DEFAULT 'debate';

-- Add max_exchanges for informal mode
ALTER TABLE debates ADD COLUMN IF NOT EXISTS max_exchanges INTEGER DEFAULT 15;

-- Add participant configuration (JSON array of participants with name, modelId)
ALTER TABLE debates ADD COLUMN IF NOT EXISTS participant_config JSONB;

-- Add informal summary (generated at end of discussion)
ALTER TABLE debates ADD COLUMN IF NOT EXISTS informal_summary JSONB;

-- Add end trigger tracking
ALTER TABLE debates ADD COLUMN IF NOT EXISTS end_trigger VARCHAR(30);

-- Add exchange count tracking
ALTER TABLE debates ADD COLUMN IF NOT EXISTS exchange_count INTEGER DEFAULT 0;

-- ============================================================================
-- INFORMAL SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS informal_settings (
  id SERIAL PRIMARY KEY,
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Exchange limits
  max_exchanges INTEGER NOT NULL DEFAULT 15,
  min_exchanges INTEGER NOT NULL DEFAULT 3,

  -- End detection configuration
  end_detection_enabled BOOLEAN NOT NULL DEFAULT true,
  end_detection_interval INTEGER NOT NULL DEFAULT 3,
  end_confidence_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.75,

  -- Participant configuration
  participant_names JSONB,  -- Custom display names for participants

  -- Response settings
  max_tokens_per_turn INTEGER DEFAULT 1000,
  temperature DECIMAL(3,2) DEFAULT 0.7,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_debate_informal_settings UNIQUE (debate_id)
);

CREATE INDEX IF NOT EXISTS idx_informal_settings_debate_id ON informal_settings(debate_id);

-- ============================================================================
-- UTTERANCES TABLE CHANGES
-- ============================================================================

-- Update phase constraint to allow 'informal' phase
-- First drop the existing constraint, then add new one
ALTER TABLE utterances DROP CONSTRAINT IF EXISTS utterances_phase_check;
ALTER TABLE utterances ADD CONSTRAINT utterances_phase_check
  CHECK (phase IN (
    'opening_statements',
    'clarifying_questions',
    'evidence_presentation',
    'rebuttals',
    'synthesis',
    'closing_statements',
    'informal',
    'wrapup'
  ));

-- Update speaker constraint to allow generic participants
-- Participants will use 'participant_1', 'participant_2', etc.
ALTER TABLE utterances DROP CONSTRAINT IF EXISTS utterances_speaker_check;
ALTER TABLE utterances ADD CONSTRAINT utterances_speaker_check
  CHECK (speaker IN (
    'moderator',
    'pro_advocate',
    'con_advocate',
    'user',
    'participant_1',
    'participant_2',
    'participant_3',
    'participant_4'
  ));

-- ============================================================================
-- UPDATE DEBATES TABLE SPEAKER CONSTRAINT
-- ============================================================================

-- Update current_speaker constraint to allow participants
ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_current_speaker_check;
ALTER TABLE debates ADD CONSTRAINT debates_current_speaker_check
  CHECK (current_speaker IN (
    'moderator',
    'pro_advocate',
    'con_advocate',
    'user',
    'participant_1',
    'participant_2',
    'participant_3',
    'participant_4'
  ));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update trigger for informal_settings.updated_at
CREATE OR REPLACE FUNCTION update_informal_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_informal_settings_updated_at ON informal_settings;
CREATE TRIGGER trigger_update_informal_settings_updated_at
  BEFORE UPDATE ON informal_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_informal_settings_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE informal_settings IS 'Per-debate configuration for informal discussion mode';
COMMENT ON COLUMN debates.discussion_mode IS 'Discussion mode: debate (structured Pro/Con) or informal (freeform)';
COMMENT ON COLUMN debates.max_exchanges IS 'Maximum exchange rounds for informal discussions';
COMMENT ON COLUMN debates.participant_config IS 'Participant configuration as JSON array';
COMMENT ON COLUMN debates.informal_summary IS 'Auto-generated summary for informal discussions';
COMMENT ON COLUMN debates.end_trigger IS 'What triggered the discussion to end: max_exchanges, user_wrapup, ai_detected';
COMMENT ON COLUMN debates.exchange_count IS 'Current exchange count for informal discussions';

-- ============================================================================
-- RECORD MIGRATION
-- ============================================================================

INSERT INTO schema_migrations (version) VALUES ('009_add_informal_discussion')
ON CONFLICT (version) DO NOTHING;
