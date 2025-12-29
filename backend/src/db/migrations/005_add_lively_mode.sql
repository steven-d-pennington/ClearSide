-- Migration: 005_add_lively_mode
-- Description: Add lively debate mode support with interruption tracking
-- Date: 2025-12-28

-- Add debate_mode column to debates table
ALTER TABLE debates ADD COLUMN IF NOT EXISTS debate_mode VARCHAR(20) DEFAULT 'turn_based';
ALTER TABLE debates ADD COLUMN IF NOT EXISTS active_speaker VARCHAR(30);
ALTER TABLE debates ADD COLUMN IF NOT EXISTS speaking_since_ms INTEGER;

-- Create lively_settings table for per-debate lively mode configuration
CREATE TABLE IF NOT EXISTS lively_settings (
  id SERIAL PRIMARY KEY,
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Interruption parameters
  aggression_level INTEGER NOT NULL DEFAULT 3 CHECK (aggression_level BETWEEN 1 AND 5),
  max_interrupts_per_minute INTEGER NOT NULL DEFAULT 2,
  interrupt_cooldown_ms INTEGER NOT NULL DEFAULT 15000,
  min_speaking_time_ms INTEGER NOT NULL DEFAULT 5000,

  -- Relevance thresholds
  relevance_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.70,
  contradiction_boost DECIMAL(3,2) NOT NULL DEFAULT 0.30,

  -- Pacing
  pacing_mode VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (pacing_mode IN ('slow', 'medium', 'fast', 'frantic')),
  interjection_max_tokens INTEGER NOT NULL DEFAULT 60,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_debate_lively_settings UNIQUE (debate_id)
);

CREATE INDEX IF NOT EXISTS idx_lively_settings_debate_id ON lively_settings(debate_id);

-- Create debate_interruptions table for tracking interrupts
CREATE TABLE IF NOT EXISTS debate_interruptions (
  id SERIAL PRIMARY KEY,
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Timing
  scheduled_at_ms INTEGER NOT NULL,
  fired_at_ms INTEGER,

  -- Participants
  interrupter VARCHAR(30) NOT NULL,
  interrupted_speaker VARCHAR(30) NOT NULL,

  -- Content
  trigger_phrase TEXT,
  interjection_content TEXT,
  interrupted_at_token INTEGER,

  -- Scoring
  relevance_score DECIMAL(4,3),
  contradiction_score DECIMAL(4,3),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'cancelled', 'suppressed')),
  cancellation_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interruptions_debate_id ON debate_interruptions(debate_id);
CREATE INDEX IF NOT EXISTS idx_interruptions_status ON debate_interruptions(status);

-- Add comment for documentation
COMMENT ON TABLE lively_settings IS 'Per-debate configuration for lively debate mode with interruptions';
COMMENT ON TABLE debate_interruptions IS 'Tracks scheduled and fired interruptions during lively debates';
COMMENT ON COLUMN debates.debate_mode IS 'Debate mode: turn_based (default) or lively';
COMMENT ON COLUMN debates.active_speaker IS 'Current speaker in lively mode';
COMMENT ON COLUMN debates.speaking_since_ms IS 'When current speaker started (ms from debate start)';
