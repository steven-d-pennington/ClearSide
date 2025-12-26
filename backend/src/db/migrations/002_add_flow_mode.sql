-- Migration: 002_add_flow_mode
-- Description: Adds flow mode columns for step-through debate control
-- Also updates status constraint to include 'failed' status

-- ============================================================================
-- ADD FLOW MODE COLUMNS TO DEBATES
-- ============================================================================

-- Add flow_mode column (auto = continuous, step = pause after each turn)
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS flow_mode VARCHAR(10) NOT NULL DEFAULT 'auto'
  CHECK (flow_mode IN ('auto', 'step'));

-- Add is_awaiting_continue column (true when waiting for user to continue in step mode)
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS is_awaiting_continue BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- UPDATE STATUS CONSTRAINT TO INCLUDE 'failed'
-- ============================================================================

-- Drop old constraint and add new one with 'failed' status
ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_status_check;
ALTER TABLE debates ADD CONSTRAINT debates_status_check
  CHECK (status IN ('initializing', 'live', 'paused', 'completed', 'error', 'failed'));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN debates.flow_mode IS 'Flow mode: auto = continuous execution, step = pause after each turn for user review';
COMMENT ON COLUMN debates.is_awaiting_continue IS 'True when in step mode and waiting for user to click Continue';

-- ============================================================================
-- MIGRATION TRACKING
-- ============================================================================

INSERT INTO schema_migrations (version) VALUES ('002_add_flow_mode')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'flow_mode') = 1,
         'flow_mode column was not created';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name = 'is_awaiting_continue') = 1,
         'is_awaiting_continue column was not created';

  RAISE NOTICE 'Migration 002_add_flow_mode completed successfully';
END $$;
