-- Migration 030: Add Persona Memory System
-- Enables persistent personality memory for podcast personas with:
-- - Core values (immutable personality anchors)
-- - Opinions (malleable stances on topics with evolution tracking)
-- - Relationships (inter-persona dynamics)
-- - Config (admin settings)

-- ============================================================================
-- Table 1: persona_core_values - Immutable personality anchors
-- ============================================================================
CREATE TABLE IF NOT EXISTS persona_core_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES podcast_personas(id) ON DELETE CASCADE,

  -- Value definition
  value_type VARCHAR(50) NOT NULL CHECK (value_type IN ('belief', 'principle', 'red_line', 'passion')),
  description TEXT NOT NULL,
  priority INTEGER DEFAULT 1,  -- Admin can reorder (lower = higher priority)

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Prevent duplicate values per persona
  UNIQUE(persona_id, description)
);

-- Indexes for core values
CREATE INDEX IF NOT EXISTS idx_persona_core_values_persona ON persona_core_values(persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_core_values_priority ON persona_core_values(persona_id, priority);

COMMENT ON TABLE persona_core_values IS 'Immutable personality anchors that define what a persona will never compromise on';
COMMENT ON COLUMN persona_core_values.value_type IS 'belief=fundamental truth, principle=guiding rule, red_line=absolute limit, passion=driving motivation';

-- ============================================================================
-- Table 2: persona_opinions - Malleable stances on topics
-- ============================================================================
CREATE TABLE IF NOT EXISTS persona_opinions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES podcast_personas(id) ON DELETE CASCADE,

  -- Topic identification
  topic_key VARCHAR(100) NOT NULL,  -- normalized slug: 'ai_regulation', 'climate_policy'
  topic_display VARCHAR(200),        -- Display name: "AI Regulation"

  -- Current stance
  stance VARCHAR(20) NOT NULL CHECK (stance IN ('supports', 'opposes', 'neutral', 'mixed', 'evolving')),
  stance_strength REAL DEFAULT 0.5 CHECK (stance_strength >= 0 AND stance_strength <= 1),
  summary TEXT NOT NULL,  -- Brief summary of position
  key_arguments TEXT[],   -- Main points they make on this topic

  -- Evolution tracking
  can_evolve BOOLEAN DEFAULT true,  -- Admin can lock certain opinions
  evolution_history JSONB DEFAULT '[]'::jsonb,  -- [{date, old_stance, new_stance, reason}]

  -- Metadata
  first_discussed_at TIMESTAMP WITH TIME ZONE,
  last_discussed_at TIMESTAMP WITH TIME ZONE,
  discussion_count INTEGER DEFAULT 1,
  source_session_ids UUID[],  -- Which conversation sessions contributed
  admin_curated BOOLEAN DEFAULT false,  -- Was this seeded/edited by admin?

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One opinion per persona per topic
  UNIQUE(persona_id, topic_key)
);

-- Indexes for opinions
CREATE INDEX IF NOT EXISTS idx_persona_opinions_persona ON persona_opinions(persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_opinions_topic ON persona_opinions(topic_key);
CREATE INDEX IF NOT EXISTS idx_persona_opinions_lookup ON persona_opinions(persona_id, topic_key);
CREATE INDEX IF NOT EXISTS idx_persona_opinions_stance ON persona_opinions(stance);
CREATE INDEX IF NOT EXISTS idx_persona_opinions_last_discussed ON persona_opinions(last_discussed_at DESC);

-- Trigger for updated_at (drop first for idempotency)
DROP TRIGGER IF EXISTS update_persona_opinions_updated_at ON persona_opinions;
CREATE TRIGGER update_persona_opinions_updated_at
  BEFORE UPDATE ON persona_opinions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE persona_opinions IS 'Malleable stances on topics that can evolve over time based on conversations';
COMMENT ON COLUMN persona_opinions.topic_key IS 'Normalized topic slug for consistent lookups (e.g., ai_regulation, climate_policy)';
COMMENT ON COLUMN persona_opinions.evolution_history IS 'JSON array tracking stance changes: [{date, old_stance, new_stance, reason}]';

-- ============================================================================
-- Table 3: persona_relationships - Inter-persona dynamics
-- ============================================================================
CREATE TABLE IF NOT EXISTS persona_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES podcast_personas(id) ON DELETE CASCADE,
  other_persona_id UUID NOT NULL REFERENCES podcast_personas(id) ON DELETE CASCADE,

  -- Relationship dynamics
  rapport_score REAL DEFAULT 0.5 CHECK (rapport_score >= 0 AND rapport_score <= 1),
  dynamic_type VARCHAR(50),  -- 'allies', 'rivals', 'respectful_opponents', 'mentors', 'foils'
  common_ground TEXT[],      -- Topics they agree on
  friction_points TEXT[],    -- Topics they clash on
  notable_exchanges TEXT[],  -- Memorable past interactions

  -- Metadata
  interaction_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One relationship record per persona pair
  UNIQUE(persona_id, other_persona_id),
  -- Prevent self-relationships
  CHECK (persona_id != other_persona_id)
);

-- Indexes for relationships
CREATE INDEX IF NOT EXISTS idx_persona_relationships_persona ON persona_relationships(persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_relationships_other ON persona_relationships(other_persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_relationships_pair ON persona_relationships(persona_id, other_persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_relationships_rapport ON persona_relationships(rapport_score);

-- Trigger for updated_at (drop first for idempotency)
DROP TRIGGER IF EXISTS update_persona_relationships_updated_at ON persona_relationships;
CREATE TRIGGER update_persona_relationships_updated_at
  BEFORE UPDATE ON persona_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE persona_relationships IS 'Tracks inter-persona dynamics and relationship history';
COMMENT ON COLUMN persona_relationships.rapport_score IS '0-1 scale: 0=hostile, 0.5=neutral, 1=close allies';
COMMENT ON COLUMN persona_relationships.dynamic_type IS 'General relationship type: allies, rivals, respectful_opponents, mentors, foils';

-- ============================================================================
-- Table 4: persona_memory_config - Admin settings (single row)
-- ============================================================================
CREATE TABLE IF NOT EXISTS persona_memory_config (
  id SERIAL PRIMARY KEY,

  -- Extraction settings
  extraction_model VARCHAR(100) DEFAULT 'claude-3-haiku-20240307',
  extraction_enabled BOOLEAN DEFAULT true,

  -- Evolution settings
  auto_evolution_enabled BOOLEAN DEFAULT true,
  evolution_threshold REAL DEFAULT 0.7 CHECK (evolution_threshold >= 0 AND evolution_threshold <= 1),

  -- Performance settings
  max_opinions_in_prompt INTEGER DEFAULT 5,
  max_context_tokens INTEGER DEFAULT 500,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Single row constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_persona_memory_config ON persona_memory_config((true));

-- Trigger for updated_at (drop first for idempotency)
DROP TRIGGER IF EXISTS update_persona_memory_config_updated_at ON persona_memory_config;
CREATE TRIGGER update_persona_memory_config_updated_at
  BEFORE UPDATE ON persona_memory_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration
INSERT INTO persona_memory_config (
  extraction_model,
  extraction_enabled,
  auto_evolution_enabled,
  evolution_threshold,
  max_opinions_in_prompt,
  max_context_tokens
) VALUES (
  'claude-3-haiku-20240307',
  true,
  true,
  0.7,
  5,
  500
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE persona_memory_config IS 'Global configuration for persona memory system (single row)';
COMMENT ON COLUMN persona_memory_config.evolution_threshold IS 'Minimum stance_strength required to shift an existing opinion';

-- ============================================================================
-- Seed initial core values for each persona based on their worldviews
-- ============================================================================
-- Note: These are examples - admin can modify via UI

-- Get persona IDs and seed core values
DO $$
DECLARE
  clara_id UUID;
  mike_id UUID;
  viktor_id UUID;
  rosa_id UUID;
BEGIN
  -- Professor Clara Chen (if exists)
  SELECT id INTO clara_id FROM podcast_personas WHERE slug = 'professor-clara-chen' LIMIT 1;
  IF clara_id IS NOT NULL THEN
    INSERT INTO persona_core_values (persona_id, value_type, description, priority) VALUES
      (clara_id, 'belief', 'Truth emerges through rigorous dialectical inquiry, not dogma', 1),
      (clara_id, 'principle', 'Every claim must be supported by evidence and logical reasoning', 2),
      (clara_id, 'red_line', 'Intellectual dishonesty and bad-faith arguments are unacceptable', 3)
    ON CONFLICT (persona_id, description) DO NOTHING;
  END IF;

  -- Maverick Mike Torres (if exists)
  SELECT id INTO mike_id FROM podcast_personas WHERE slug = 'maverick-mike-torres' LIMIT 1;
  IF mike_id IS NOT NULL THEN
    INSERT INTO persona_core_values (persona_id, value_type, description, priority) VALUES
      (mike_id, 'belief', 'Innovation and disruption are the engines of human progress', 1),
      (mike_id, 'principle', 'Move fast and adapt - the market rewards speed over perfection', 2),
      (mike_id, 'passion', 'Empowering entrepreneurs to challenge the status quo', 3)
    ON CONFLICT (persona_id, description) DO NOTHING;
  END IF;
END $$;
