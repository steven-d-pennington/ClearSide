-- Migration: 003_add_debate_configuration
-- Description: Add configuration columns to debates table and create presets table
-- Created: 2025-12-26

-- ============================================================================
-- ADD CONFIGURATION COLUMNS TO DEBATES
-- ============================================================================

-- Preset mode selection
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS preset_mode VARCHAR(20) NOT NULL DEFAULT 'balanced'
  CHECK (preset_mode IN ('quick', 'balanced', 'deep_dive', 'research', 'custom'));

-- Brevity level (1 = very detailed, 5 = very concise)
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS brevity_level INTEGER NOT NULL DEFAULT 3
  CHECK (brevity_level >= 1 AND brevity_level <= 5);

-- LLM temperature setting (0.0 = deterministic, 1.0 = creative)
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS llm_temperature DECIMAL(3,2) NOT NULL DEFAULT 0.70
  CHECK (llm_temperature >= 0.00 AND llm_temperature <= 1.00);

-- Maximum tokens per agent response
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS max_tokens_per_response INTEGER NOT NULL DEFAULT 1024
  CHECK (max_tokens_per_response >= 100 AND max_tokens_per_response <= 8000);

-- Whether citations/evidence is required for claims
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS require_citations BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- CREATE DEBATE_PRESETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_presets (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  brevity_level INTEGER NOT NULL CHECK (brevity_level >= 1 AND brevity_level <= 5),
  llm_temperature DECIMAL(3,2) NOT NULL CHECK (llm_temperature >= 0.00 AND llm_temperature <= 1.00),
  max_tokens_per_response INTEGER NOT NULL CHECK (max_tokens_per_response >= 100 AND max_tokens_per_response <= 8000),
  require_citations BOOLEAN NOT NULL DEFAULT false,
  is_system_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_debate_presets_system ON debate_presets(is_system_preset);

-- ============================================================================
-- INSERT SYSTEM PRESETS
-- ============================================================================

INSERT INTO debate_presets (id, name, description, brevity_level, llm_temperature, max_tokens_per_response, require_citations, is_system_preset)
VALUES
  ('quick', 'Quick Mode', 'Fast, concise responses for rapid analysis. Best for simple propositions or time-limited exploration.', 5, 0.50, 512, false, true),
  ('balanced', 'Balanced', 'Default balanced settings. Good mix of depth and brevity for most debates.', 3, 0.70, 1024, false, true),
  ('deep_dive', 'Deep Dive', 'Thorough, comprehensive analysis with detailed arguments. Best for complex topics requiring nuanced exploration.', 1, 0.70, 2048, false, true),
  ('research', 'Research Mode', 'Academic rigor with required citations. All claims must include evidence classification.', 2, 0.60, 2048, true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN debates.preset_mode IS 'Selected preset mode or custom for user-configured settings';
COMMENT ON COLUMN debates.brevity_level IS 'Response brevity: 1=very detailed, 3=balanced, 5=very concise';
COMMENT ON COLUMN debates.llm_temperature IS 'LLM temperature: 0.0=deterministic, 1.0=creative';
COMMENT ON COLUMN debates.max_tokens_per_response IS 'Maximum tokens per agent response (100-8000)';
COMMENT ON COLUMN debates.require_citations IS 'Whether agents must provide citations for claims';

COMMENT ON TABLE debate_presets IS 'Predefined debate configuration presets';
COMMENT ON COLUMN debate_presets.is_system_preset IS 'System presets cannot be modified or deleted by users';

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

INSERT INTO schema_migrations (version) VALUES ('003_add_debate_configuration')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'preset_mode') = 1,
         'preset_mode column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'brevity_level') = 1,
         'brevity_level column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'llm_temperature') = 1,
         'llm_temperature column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'max_tokens_per_response') = 1,
         'max_tokens_per_response column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'require_citations') = 1,
         'require_citations column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name = 'debate_presets') = 1,
         'debate_presets table was not created';

  ASSERT (SELECT COUNT(*) FROM debate_presets WHERE is_system_preset = true) = 4,
         'System presets were not inserted';

  RAISE NOTICE 'Migration 003_add_debate_configuration completed successfully';
END $$;
