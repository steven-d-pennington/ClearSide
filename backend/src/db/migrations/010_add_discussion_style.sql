-- Migration: 010_add_discussion_style
-- Description: Add discussion style and tone settings for informal discussions
-- Date: 2026-01-02

-- ============================================================================
-- INFORMAL_SETTINGS TABLE CHANGES
-- ============================================================================

-- Add discussion_style column
-- Values: 'collaborative' (default), 'natural_disagreement', 'devils_advocate'
ALTER TABLE informal_settings
ADD COLUMN IF NOT EXISTS discussion_style VARCHAR(30) DEFAULT 'collaborative';

-- Add tone column
-- Values: 'respectful' (default), 'spirited'
ALTER TABLE informal_settings
ADD COLUMN IF NOT EXISTS tone VARCHAR(20) DEFAULT 'respectful';

-- Add devil's advocate participant ID (only used when style is 'devils_advocate')
ALTER TABLE informal_settings
ADD COLUMN IF NOT EXISTS devils_advocate_id VARCHAR(50);

-- ============================================================================
-- DEBATES TABLE CHANGES
-- ============================================================================

-- Also add to debates table for quick access
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS discussion_style VARCHAR(30) DEFAULT 'collaborative';

ALTER TABLE debates
ADD COLUMN IF NOT EXISTS discussion_tone VARCHAR(20) DEFAULT 'respectful';

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Add constraint for discussion_style values
ALTER TABLE informal_settings DROP CONSTRAINT IF EXISTS informal_settings_discussion_style_check;
ALTER TABLE informal_settings ADD CONSTRAINT informal_settings_discussion_style_check
  CHECK (discussion_style IN ('collaborative', 'natural_disagreement', 'devils_advocate'));

-- Add constraint for tone values
ALTER TABLE informal_settings DROP CONSTRAINT IF EXISTS informal_settings_tone_check;
ALTER TABLE informal_settings ADD CONSTRAINT informal_settings_tone_check
  CHECK (tone IN ('respectful', 'spirited'));

-- Add constraint for devils_advocate_id (must be a valid participant ID format)
ALTER TABLE informal_settings DROP CONSTRAINT IF EXISTS informal_settings_devils_advocate_check;
ALTER TABLE informal_settings ADD CONSTRAINT informal_settings_devils_advocate_check
  CHECK (
    devils_advocate_id IS NULL OR
    devils_advocate_id IN ('participant_1', 'participant_2', 'participant_3', 'participant_4')
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN informal_settings.discussion_style IS 'Discussion style: collaborative (build on ideas), natural_disagreement (challenge/debate), devils_advocate (one challenges all)';
COMMENT ON COLUMN informal_settings.tone IS 'Discussion tone: respectful (professional) or spirited (passionate/emphatic)';
COMMENT ON COLUMN informal_settings.devils_advocate_id IS 'Participant ID assigned as devils advocate (only for devils_advocate style)';
COMMENT ON COLUMN debates.discussion_style IS 'Discussion style for informal mode';
COMMENT ON COLUMN debates.discussion_tone IS 'Discussion tone for informal mode';

-- ============================================================================
-- RECORD MIGRATION
-- ============================================================================

INSERT INTO schema_migrations (version) VALUES ('010_add_discussion_style')
ON CONFLICT (version) DO NOTHING;
