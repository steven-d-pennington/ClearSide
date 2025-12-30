-- Migration: 007_add_system_events
-- Description: Creates system_events table for persistent event logging
-- Captures orchestrator events, retries, errors, and significant operations

-- ============================================================================
-- SYSTEM_EVENTS TABLE
-- ============================================================================
-- Stores significant system events for debugging, monitoring, and admin UI

CREATE TABLE IF NOT EXISTS system_events (
  -- Primary key: auto-increment
  id SERIAL PRIMARY KEY,

  -- Event categorization
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('debug', 'info', 'warn', 'error')),

  -- Optional association with debate
  debate_id UUID REFERENCES debates(id) ON DELETE SET NULL,

  -- Event context
  speaker VARCHAR(30),
  phase VARCHAR(50),
  prompt_type VARCHAR(50),

  -- Event details
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_system_events_event_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_events_debate_id ON system_events(debate_id);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_type_severity ON system_events(event_type, severity);
CREATE INDEX IF NOT EXISTS idx_system_events_debate_created ON system_events(debate_id, created_at DESC);

-- Comments for documentation
COMMENT ON TABLE system_events IS 'Persistent event log for debugging, monitoring, and admin review';
COMMENT ON COLUMN system_events.event_type IS 'Type of event (e.g., debate_started, retry, rate_limit, error)';
COMMENT ON COLUMN system_events.severity IS 'Event severity: debug, info, warn, error';
COMMENT ON COLUMN system_events.debate_id IS 'Optional reference to associated debate';
COMMENT ON COLUMN system_events.speaker IS 'Speaker involved in the event (if applicable)';
COMMENT ON COLUMN system_events.phase IS 'Debate phase during event (if applicable)';
COMMENT ON COLUMN system_events.prompt_type IS 'Prompt type being processed (if applicable)';
COMMENT ON COLUMN system_events.message IS 'Human-readable event description';
COMMENT ON COLUMN system_events.metadata IS 'Additional event data as JSON (tokens, model, duration, etc.)';

-- ============================================================================
-- EVENT TYPES REFERENCE (documented as comment)
-- ============================================================================
-- Core orchestrator events:
--   debate_started      - Debate initialized
--   debate_completed    - Debate finished successfully
--   debate_error        - Debate encountered fatal error
--   phase_transition    - Phase changed
--   turn_started        - Turn execution began
--   turn_completed      - Turn execution finished
--
-- Response quality events:
--   empty_response      - Model returned empty/short content
--   retry_attempt       - Retrying a failed request
--   retry_success       - Retry succeeded
--   retry_exhausted     - All retries failed
--   truncated_response  - Response was truncated (hit max_tokens)
--
-- Rate limiting events:
--   rate_limit_hit      - Hit rate limit, waiting
--   rate_limit_wait     - Waiting for rate limit cooldown
--
-- Interruption events:
--   interruption_fired  - Speaker interrupted
--   resumption          - Interrupted speaker resuming
--
-- Model events:
--   model_selected      - Model chosen for role
--   reasoning_enabled   - Extended thinking enabled for request

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('007_add_system_events')
ON CONFLICT (version) DO NOTHING;

-- Verify table creation
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'system_events') = 1,
         'system_events table was not created';
  RAISE NOTICE 'Migration 007_add_system_events completed successfully';
END $$;
