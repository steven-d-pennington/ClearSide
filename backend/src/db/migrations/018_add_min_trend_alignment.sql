-- Migration: Add minTrendAlignment column to research_configs
-- This allows filtering out topics that don't align with current trends BEFORE
-- spending LLM tokens on full proposal generation

-- Check if column exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_configs' AND column_name = 'min_trend_alignment'
  ) THEN
    ALTER TABLE research_configs ADD COLUMN min_trend_alignment REAL DEFAULT 0.1;
  END IF;
END $$;

-- Add comment explaining the column
COMMENT ON COLUMN research_configs.min_trend_alignment IS
  'Minimum trend alignment score (0-1) required to generate a proposal. Topics below this threshold are skipped. Set to 0 to disable filtering.';
