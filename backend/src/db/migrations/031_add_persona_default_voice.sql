-- Migration: 031_add_persona_default_voice
-- Description: Adds default voice assignment fields to podcast_personas table
-- This allows each persona to have a consistent voice across podcast generations

-- ============================================================================
-- ADD DEFAULT VOICE COLUMNS
-- ============================================================================

-- Provider column (e.g., 'elevenlabs', 'gemini', 'google-cloud-long')
ALTER TABLE podcast_personas
ADD COLUMN IF NOT EXISTS default_voice_provider VARCHAR(50);

-- Voice ID column (provider-specific voice identifier)
ALTER TABLE podcast_personas
ADD COLUMN IF NOT EXISTS default_voice_id VARCHAR(100);

-- Voice settings column (provider-specific settings like stability, similarity_boost)
ALTER TABLE podcast_personas
ADD COLUMN IF NOT EXISTS default_voice_settings JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN podcast_personas.default_voice_provider IS
  'TTS provider for default voice (elevenlabs, gemini, google-cloud-long, azure, edge)';

COMMENT ON COLUMN podcast_personas.default_voice_id IS
  'Voice ID for the default voice (provider-specific, e.g., ElevenLabs voice ID or Gemini voice name)';

COMMENT ON COLUMN podcast_personas.default_voice_settings IS
  'Provider-specific voice settings as JSON (e.g., stability, similarity_boost, speed for ElevenLabs)';

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

INSERT INTO schema_migrations (version) VALUES ('031_add_persona_default_voice')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'podcast_personas' AND column_name = 'default_voice_provider'
  ) THEN
    RAISE EXCEPTION 'Column default_voice_provider was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'podcast_personas' AND column_name = 'default_voice_id'
  ) THEN
    RAISE EXCEPTION 'Column default_voice_id was not created';
  END IF;

  RAISE NOTICE 'Migration 031_add_persona_default_voice completed successfully';
END $$;
