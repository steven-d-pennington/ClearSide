-- Migration: 011_add_duelogic_mode
-- Description: Add Duelogic debate mode with philosophical chairs,
--              response evaluations, and chair interruptions
-- Date: 2026-01-03

-- ============================================================================
-- DEBATES TABLE CHANGES
-- ============================================================================

-- Add debate_mode column if not exists
-- Values: 'formal' (default), 'lively', 'informal', 'duelogic'
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS debate_mode VARCHAR(30) DEFAULT 'formal';

-- Add duelogic_config JSONB column for storing full Duelogic configuration
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS duelogic_config JSONB;

-- ============================================================================
-- DEBATE_CHAIRS TABLE
-- ============================================================================
-- Tracks chair assignments for Duelogic debates

CREATE TABLE IF NOT EXISTS debate_chairs (
  id SERIAL PRIMARY KEY,

  -- Reference to the debate
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Chair position (chair_1, chair_2, ... chair_6)
  chair_position VARCHAR(20) NOT NULL,

  -- Philosophical framework assigned to this chair
  framework VARCHAR(30) NOT NULL
    CHECK (framework IN (
      'utilitarian',
      'virtue_ethics',
      'deontological',
      'pragmatic',
      'libertarian',
      'communitarian',
      'cosmopolitan',
      'precautionary',
      'autonomy_centered',
      'care_ethics'
    )),

  -- Model configuration
  model_id VARCHAR(100) NOT NULL,
  model_display_name VARCHAR(100),
  provider_name VARCHAR(50),

  -- Optional persona overlay
  persona VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Ensure unique chair position per debate
  UNIQUE(debate_id, chair_position)
);

-- Indexes for debate_chairs
CREATE INDEX IF NOT EXISTS idx_debate_chairs_debate_id ON debate_chairs(debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_chairs_framework ON debate_chairs(framework);

-- Comments
COMMENT ON TABLE debate_chairs IS 'Chair assignments for Duelogic debate mode';
COMMENT ON COLUMN debate_chairs.chair_position IS 'Position identifier (chair_1, chair_2, etc.)';
COMMENT ON COLUMN debate_chairs.framework IS 'Philosophical framework (utilitarian, virtue_ethics, etc.)';
COMMENT ON COLUMN debate_chairs.model_id IS 'LLM model ID via OpenRouter';
COMMENT ON COLUMN debate_chairs.model_display_name IS 'Human-readable model name';
COMMENT ON COLUMN debate_chairs.provider_name IS 'AI provider (Anthropic, OpenAI, xAI, etc.)';

-- ============================================================================
-- RESPONSE_EVALUATIONS TABLE
-- ============================================================================
-- Tracks evaluation of chair responses for adherence to debate principles

CREATE TABLE IF NOT EXISTS response_evaluations (
  id SERIAL PRIMARY KEY,

  -- Reference to the utterance being evaluated
  utterance_id INTEGER NOT NULL REFERENCES utterances(id) ON DELETE CASCADE,

  -- Overall adherence score (0-100)
  adherence_score INTEGER CHECK (adherence_score BETWEEN 0 AND 100),

  -- Steel-manning evaluation
  steel_manning_attempted BOOLEAN DEFAULT FALSE,
  steel_manning_quality VARCHAR(20)
    CHECK (steel_manning_quality IN ('strong', 'adequate', 'weak', 'absent')),
  steel_manning_notes TEXT,

  -- Self-critique evaluation
  self_critique_attempted BOOLEAN DEFAULT FALSE,
  self_critique_quality VARCHAR(20)
    CHECK (self_critique_quality IN ('strong', 'adequate', 'weak', 'absent')),
  self_critique_notes TEXT,

  -- Framework consistency
  framework_consistent BOOLEAN DEFAULT TRUE,
  framework_violations TEXT[], -- Array of violation descriptions

  -- Intellectual honesty
  intellectual_honesty_score VARCHAR(10)
    CHECK (intellectual_honesty_score IN ('high', 'medium', 'low')),
  intellectual_honesty_issues TEXT[],

  -- Arbiter interjection trigger
  requires_interjection BOOLEAN DEFAULT FALSE,
  interjection_reason TEXT,

  -- Full evaluation data as JSON for flexibility
  evaluation_data JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for response_evaluations
CREATE INDEX IF NOT EXISTS idx_response_evaluations_utterance_id ON response_evaluations(utterance_id);
CREATE INDEX IF NOT EXISTS idx_response_evaluations_adherence ON response_evaluations(adherence_score);
CREATE INDEX IF NOT EXISTS idx_response_evaluations_interjection ON response_evaluations(requires_interjection) WHERE requires_interjection = TRUE;

-- Comments
COMMENT ON TABLE response_evaluations IS 'Evaluation of adherence to debate principles (steel-manning, self-critique)';
COMMENT ON COLUMN response_evaluations.adherence_score IS 'Overall adherence score 0-100';
COMMENT ON COLUMN response_evaluations.steel_manning_attempted IS 'Did they articulate opponent position before critiquing?';
COMMENT ON COLUMN response_evaluations.steel_manning_quality IS 'Quality of steel-manning attempt';
COMMENT ON COLUMN response_evaluations.self_critique_attempted IS 'Did they acknowledge their framework weaknesses?';
COMMENT ON COLUMN response_evaluations.self_critique_quality IS 'Quality of self-critique';
COMMENT ON COLUMN response_evaluations.framework_consistent IS 'Did they stay true to their assigned framework?';
COMMENT ON COLUMN response_evaluations.requires_interjection IS 'Should the arbiter step in?';

-- ============================================================================
-- CHAIR_INTERRUPTIONS TABLE
-- ============================================================================
-- Logs chair-to-chair interruptions during Duelogic debates

CREATE TABLE IF NOT EXISTS chair_interruptions (
  id SERIAL PRIMARY KEY,

  -- Reference to the debate
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Who interrupted whom
  interrupting_chair VARCHAR(20) NOT NULL,
  interrupted_chair VARCHAR(20) NOT NULL,

  -- Interruption details
  trigger_reason VARCHAR(30) NOT NULL
    CHECK (trigger_reason IN (
      'factual_correction',
      'straw_man_detected',
      'direct_challenge',
      'clarification_needed',
      'strong_agreement',
      'pivotal_point'
    )),
  trigger_content TEXT,

  -- Urgency score (0.00 to 1.00)
  urgency DECIMAL(3,2) CHECK (urgency BETWEEN 0 AND 1),

  -- When the interruption occurred (ms from debate start)
  timestamp_ms INTEGER NOT NULL,

  -- The actual interruption content
  interruption_content TEXT,

  -- Whether the interrupted chair responded
  response_given BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for chair_interruptions
CREATE INDEX IF NOT EXISTS idx_chair_interruptions_debate_id ON chair_interruptions(debate_id);
CREATE INDEX IF NOT EXISTS idx_chair_interruptions_timestamp ON chair_interruptions(debate_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_chair_interruptions_reason ON chair_interruptions(trigger_reason);

-- Comments
COMMENT ON TABLE chair_interruptions IS 'Log of chair-to-chair interruptions during Duelogic debates';
COMMENT ON COLUMN chair_interruptions.interrupting_chair IS 'The chair position that interrupted';
COMMENT ON COLUMN chair_interruptions.interrupted_chair IS 'The chair position that was interrupted';
COMMENT ON COLUMN chair_interruptions.trigger_reason IS 'Why the interruption occurred';
COMMENT ON COLUMN chair_interruptions.urgency IS 'Urgency score 0-1 that triggered the interrupt';
COMMENT ON COLUMN chair_interruptions.timestamp_ms IS 'Milliseconds from debate start';

-- ============================================================================
-- DEBATE_MODE CONSTRAINT
-- ============================================================================

-- Update the debate_mode constraint to include duelogic
ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_debate_mode_check;
ALTER TABLE debates ADD CONSTRAINT debates_debate_mode_check
  CHECK (debate_mode IN ('formal', 'lively', 'informal', 'duelogic'));

-- ============================================================================
-- SPEAKER CONSTRAINT UPDATE
-- ============================================================================

-- Update speaker constraint to include chair positions for duelogic mode
-- We need to allow chair_1 through chair_6 as valid speakers
ALTER TABLE utterances DROP CONSTRAINT IF EXISTS utterances_speaker_check;
ALTER TABLE utterances ADD CONSTRAINT utterances_speaker_check
  CHECK (speaker IN (
    'moderator', 'pro_advocate', 'con_advocate', 'user', 'arbiter',
    'chair_1', 'chair_2', 'chair_3', 'chair_4', 'chair_5', 'chair_6'
  ));

-- ============================================================================
-- PHASE CONSTRAINT UPDATE
-- ============================================================================

-- Update phase constraint to include duelogic segments
ALTER TABLE utterances DROP CONSTRAINT IF EXISTS utterances_phase_check;
ALTER TABLE utterances ADD CONSTRAINT utterances_phase_check
  CHECK (phase IN (
    -- Original phases
    'opening_statements',
    'clarifying_questions',
    'evidence_presentation',
    'rebuttals',
    'synthesis',
    'closing_statements',
    -- Duelogic segments
    'introduction',
    'opening',
    'exchange'
  ));

-- ============================================================================
-- CURRENT PHASE CONSTRAINT UPDATE
-- ============================================================================

-- Update debates.current_phase to include duelogic segments
ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_current_phase_check;
ALTER TABLE debates ADD CONSTRAINT debates_current_phase_check
  CHECK (current_phase IN (
    -- Original phases
    'opening_statements',
    'clarifying_questions',
    'evidence_presentation',
    'rebuttals',
    'synthesis',
    'closing_statements',
    -- Duelogic segments
    'introduction',
    'opening',
    'exchange'
  ));

-- ============================================================================
-- CURRENT SPEAKER CONSTRAINT UPDATE
-- ============================================================================

-- Update debates.current_speaker to include arbiter and chair positions
ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_current_speaker_check;
ALTER TABLE debates ADD CONSTRAINT debates_current_speaker_check
  CHECK (current_speaker IN (
    'moderator', 'pro_advocate', 'con_advocate', 'user', 'arbiter',
    'chair_1', 'chair_2', 'chair_3', 'chair_4', 'chair_5', 'chair_6'
  ));

-- ============================================================================
-- HELPER VIEW: DUELOGIC DEBATE SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW duelogic_debate_summary AS
SELECT
  d.id AS debate_id,
  d.proposition_text,
  d.status,
  d.debate_mode,
  d.duelogic_config->>'tone' AS tone,
  d.duelogic_config->'flow'->>'maxExchanges' AS max_exchanges,
  d.duelogic_config->'arbiter'->>'accountabilityLevel' AS accountability_level,
  (SELECT COUNT(*) FROM debate_chairs dc WHERE dc.debate_id = d.id) AS chair_count,
  (SELECT COUNT(*) FROM utterances u WHERE u.debate_id = d.id) AS utterance_count,
  (SELECT COUNT(*) FROM chair_interruptions ci WHERE ci.debate_id = d.id) AS interruption_count,
  (
    SELECT AVG(re.adherence_score)::INTEGER
    FROM response_evaluations re
    JOIN utterances u ON re.utterance_id = u.id
    WHERE u.debate_id = d.id
  ) AS avg_adherence_score,
  d.created_at,
  d.started_at,
  d.completed_at
FROM debates d
WHERE d.debate_mode = 'duelogic';

COMMENT ON VIEW duelogic_debate_summary IS 'Summary view for Duelogic debates with aggregated metrics';

-- ============================================================================
-- HELPER VIEW: CHAIR PERFORMANCE
-- ============================================================================

CREATE OR REPLACE VIEW chair_performance AS
SELECT
  dc.debate_id,
  dc.chair_position,
  dc.framework,
  dc.model_display_name,
  dc.provider_name,
  COUNT(u.id) AS utterance_count,
  AVG(re.adherence_score)::INTEGER AS avg_adherence,
  COUNT(CASE WHEN re.steel_manning_attempted THEN 1 END)::FLOAT / NULLIF(COUNT(re.id), 0) * 100 AS steel_manning_rate,
  COUNT(CASE WHEN re.self_critique_attempted THEN 1 END)::FLOAT / NULLIF(COUNT(re.id), 0) * 100 AS self_critique_rate,
  COUNT(CASE WHEN NOT re.framework_consistent THEN 1 END) AS framework_violations,
  (SELECT COUNT(*) FROM chair_interruptions ci WHERE ci.interrupting_chair = dc.chair_position AND ci.debate_id = dc.debate_id) AS interruptions_made,
  (SELECT COUNT(*) FROM chair_interruptions ci WHERE ci.interrupted_chair = dc.chair_position AND ci.debate_id = dc.debate_id) AS times_interrupted
FROM debate_chairs dc
LEFT JOIN utterances u ON u.debate_id = dc.debate_id AND u.speaker = dc.chair_position
LEFT JOIN response_evaluations re ON re.utterance_id = u.id
GROUP BY dc.debate_id, dc.chair_position, dc.framework, dc.model_display_name, dc.provider_name;

COMMENT ON VIEW chair_performance IS 'Performance metrics for each chair in Duelogic debates';

-- ============================================================================
-- RECORD MIGRATION
-- ============================================================================

INSERT INTO schema_migrations (version) VALUES ('011_add_duelogic_mode')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify tables exist
  ASSERT (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_name IN ('debate_chairs', 'response_evaluations', 'chair_interruptions')) = 3,
         'Not all Duelogic tables were created';

  -- Verify columns added to debates
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_name = 'debates' AND column_name IN ('debate_mode', 'duelogic_config')) = 2,
         'Duelogic columns not added to debates table';

  RAISE NOTICE 'Migration 011_add_duelogic_mode completed successfully';
END $$;
