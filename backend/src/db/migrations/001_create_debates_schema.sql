-- Migration: 001_create_debates_schema
-- Description: Creates the core schema for ClearSide debates
-- This includes debates, utterances, and user_interventions tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DEBATES TABLE
-- ============================================================================
-- Stores the main debate entity with all metadata and state

CREATE TABLE IF NOT EXISTS debates (
  -- Primary key: UUID v4
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Proposition details
  proposition_text TEXT NOT NULL,
  proposition_context JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Debate state
  status VARCHAR(20) NOT NULL DEFAULT 'initializing'
    CHECK (status IN ('initializing', 'live', 'paused', 'completed', 'error')),
  current_phase VARCHAR(30) NOT NULL DEFAULT 'opening_statements'
    CHECK (current_phase IN (
      'opening_statements',
      'clarifying_questions',
      'evidence_presentation',
      'rebuttals',
      'synthesis',
      'closing_statements'
    )),
  current_speaker VARCHAR(20) NOT NULL DEFAULT 'moderator'
    CHECK (current_speaker IN ('moderator', 'pro_advocate', 'con_advocate', 'user')),

  -- Timing information
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_duration_ms INTEGER,

  -- Stored debate artifacts
  transcript_json JSONB,
  structured_analysis_json JSONB,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for debates table
CREATE INDEX IF NOT EXISTS idx_debates_status ON debates(status);
CREATE INDEX IF NOT EXISTS idx_debates_created_at ON debates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debates_started_at ON debates(started_at DESC) WHERE started_at IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE debates IS 'Main debate entity storing all metadata and state for live debate sessions';
COMMENT ON COLUMN debates.id IS 'Unique debate identifier (UUID v4)';
COMMENT ON COLUMN debates.proposition_text IS 'The proposition being debated (e.g., "AI data centers should be subject to a moratorium")';
COMMENT ON COLUMN debates.proposition_context IS 'Additional context about the proposition as JSON';
COMMENT ON COLUMN debates.status IS 'Current status: initializing, live, paused, completed, error';
COMMENT ON COLUMN debates.current_phase IS 'Current debate phase (1 of 6 protocol phases)';
COMMENT ON COLUMN debates.current_speaker IS 'Who is currently speaking';
COMMENT ON COLUMN debates.transcript_json IS 'Complete debate transcript as JSON array';
COMMENT ON COLUMN debates.structured_analysis_json IS 'Final structured analysis output';

-- ============================================================================
-- UTTERANCES TABLE
-- ============================================================================
-- Stores individual speech acts/turns within a debate

CREATE TABLE IF NOT EXISTS utterances (
  -- Primary key: auto-increment
  id SERIAL PRIMARY KEY,

  -- Foreign key to debates
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Timing and context
  timestamp_ms INTEGER NOT NULL,
  phase VARCHAR(30) NOT NULL
    CHECK (phase IN (
      'opening_statements',
      'clarifying_questions',
      'evidence_presentation',
      'rebuttals',
      'synthesis',
      'closing_statements'
    )),
  speaker VARCHAR(20) NOT NULL
    CHECK (speaker IN ('moderator', 'pro_advocate', 'con_advocate', 'user')),

  -- Content
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for utterances table
CREATE INDEX IF NOT EXISTS idx_utterances_debate_id ON utterances(debate_id);
CREATE INDEX IF NOT EXISTS idx_utterances_debate_timestamp ON utterances(debate_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_utterances_speaker ON utterances(speaker);
CREATE INDEX IF NOT EXISTS idx_utterances_phase ON utterances(phase);

-- Comments for documentation
COMMENT ON TABLE utterances IS 'Individual speech acts/turns within a debate';
COMMENT ON COLUMN utterances.debate_id IS 'Reference to the parent debate';
COMMENT ON COLUMN utterances.timestamp_ms IS 'Timestamp relative to debate start (milliseconds)';
COMMENT ON COLUMN utterances.phase IS 'Debate phase during which this utterance occurred';
COMMENT ON COLUMN utterances.speaker IS 'Who spoke this utterance';
COMMENT ON COLUMN utterances.content IS 'The actual text content of the utterance';
COMMENT ON COLUMN utterances.metadata IS 'Additional metadata (tokens used, model, confidence, etc.)';

-- ============================================================================
-- USER_INTERVENTIONS TABLE
-- ============================================================================
-- Tracks user interventions during debates (questions, evidence injection, etc.)

CREATE TABLE IF NOT EXISTS user_interventions (
  -- Primary key: auto-increment
  id SERIAL PRIMARY KEY,

  -- Foreign key to debates
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Timing
  timestamp_ms INTEGER NOT NULL,

  -- Intervention details
  intervention_type VARCHAR(30) NOT NULL
    CHECK (intervention_type IN (
      'question',
      'challenge',
      'evidence_injection',
      'pause_request',
      'clarification_request'
    )),
  content TEXT NOT NULL,
  directed_to VARCHAR(20)
    CHECK (directed_to IS NULL OR directed_to IN ('moderator', 'pro_advocate', 'con_advocate', 'user')),

  -- Response tracking
  response TEXT,
  response_timestamp_ms INTEGER,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for user_interventions table
CREATE INDEX IF NOT EXISTS idx_interventions_debate_id ON user_interventions(debate_id);
CREATE INDEX IF NOT EXISTS idx_interventions_debate_timestamp ON user_interventions(debate_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_interventions_type ON user_interventions(intervention_type);

-- Comments for documentation
COMMENT ON TABLE user_interventions IS 'User interventions during debates (questions, challenges, evidence injection)';
COMMENT ON COLUMN user_interventions.debate_id IS 'Reference to the parent debate';
COMMENT ON COLUMN user_interventions.timestamp_ms IS 'Timestamp relative to debate start (milliseconds)';
COMMENT ON COLUMN user_interventions.intervention_type IS 'Type of intervention (question, challenge, etc.)';
COMMENT ON COLUMN user_interventions.content IS 'User intervention content';
COMMENT ON COLUMN user_interventions.directed_to IS 'Which agent the intervention is directed to (null = all/moderator)';
COMMENT ON COLUMN user_interventions.response IS 'Agent response to the intervention (null until answered)';
COMMENT ON COLUMN user_interventions.response_timestamp_ms IS 'Timestamp when response was provided';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update trigger for debates.updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_debates_updated_at ON debates;
CREATE TRIGGER update_debates_updated_at
  BEFORE UPDATE ON debates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION TRACKING TABLE
-- ============================================================================
-- Tracks which migrations have been applied

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('001_create_debates_schema')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name IN ('debates', 'utterances', 'user_interventions', 'schema_migrations')) = 4,
         'Not all required tables were created';

  RAISE NOTICE 'Migration 001_create_debates_schema completed successfully';
END $$;
