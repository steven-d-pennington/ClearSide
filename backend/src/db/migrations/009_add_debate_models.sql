-- Migration 009: Add Model Columns to Debates Table
-- Stores which models were actually used for each role in a debate
-- This allows model attribution in UI, exports, and debate history

-- Add model ID columns to debates table
ALTER TABLE debates
  ADD COLUMN IF NOT EXISTS pro_model_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS con_model_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS moderator_model_id VARCHAR(200);

-- Add comments for documentation
COMMENT ON COLUMN debates.pro_model_id IS 'OpenRouter model ID used for Pro advocate (e.g., anthropic/claude-3.5-sonnet)';
COMMENT ON COLUMN debates.con_model_id IS 'OpenRouter model ID used for Con advocate (e.g., openai/gpt-4o)';
COMMENT ON COLUMN debates.moderator_model_id IS 'OpenRouter model ID used for Moderator (e.g., anthropic/claude-3.5-sonnet)';

-- Create index for model-based queries (e.g., "show all debates using GPT-4")
CREATE INDEX IF NOT EXISTS idx_debates_pro_model ON debates(pro_model_id) WHERE pro_model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debates_con_model ON debates(con_model_id) WHERE con_model_id IS NOT NULL;

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('009_add_debate_models')
ON CONFLICT (version) DO NOTHING;

-- Verification
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'pro_model_id') = 1,
         'pro_model_id column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'con_model_id') = 1,
         'con_model_id column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'moderator_model_id') = 1,
         'moderator_model_id column was not created';

  RAISE NOTICE 'Migration 009_add_debate_models completed successfully';
END $$;
