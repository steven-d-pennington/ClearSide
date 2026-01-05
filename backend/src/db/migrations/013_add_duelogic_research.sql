-- 013_add_duelogic_research.sql

-- Research configuration table
CREATE TABLE IF NOT EXISTS research_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,  -- Cron expression
  enabled BOOLEAN DEFAULT true,
  categories TEXT[] NOT NULL,
  perplexity_model TEXT NOT NULL,
  max_topics_per_run INTEGER DEFAULT 20,
  min_controversy_score REAL DEFAULT 0.6,
  search_queries TEXT[],
  exclude_topics TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Research job executions table
CREATE TABLE IF NOT EXISTS research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES research_configs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  topics_discovered INTEGER DEFAULT 0,
  episodes_generated INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_job_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Raw research results table
CREATE TABLE IF NOT EXISTS research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  category TEXT NOT NULL,
  sources JSONB NOT NULL,
  summary TEXT NOT NULL,
  controversy_score REAL NOT NULL,
  timeliness REAL NOT NULL,
  depth REAL NOT NULL,
  raw_perplexity_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_category CHECK (category IN (
    'technology_ethics', 'climate_environment', 'politics_governance',
    'bioethics_medicine', 'economics_inequality', 'ai_automation',
    'social_justice', 'international_relations', 'privacy_surveillance',
    'education_culture'
  )),
  CONSTRAINT valid_controversy CHECK (controversy_score >= 0 AND controversy_score <= 1),
  CONSTRAINT valid_timeliness CHECK (timeliness >= 0 AND timeliness <= 1),
  CONSTRAINT valid_depth CHECK (depth >= 0 AND depth <= 1)
);

-- Episode proposals table
CREATE TABLE IF NOT EXISTS episode_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_result_id UUID REFERENCES research_results(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  episode_number INTEGER,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  description TEXT NOT NULL,
  proposition TEXT NOT NULL,
  context_for_panel TEXT NOT NULL,
  chairs JSONB NOT NULL,
  key_tensions TEXT[] NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  scheduled_for DATE,
  admin_notes TEXT,
  was_edited BOOLEAN DEFAULT false,
  edit_history JSONB,

  CONSTRAINT valid_proposal_status CHECK (status IN ('pending', 'approved', 'rejected', 'scheduled'))
);

-- Indexes for efficient lookups (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_research_jobs_config ON research_jobs(config_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_research_results_job ON research_results(job_id);
CREATE INDEX IF NOT EXISTS idx_research_results_category ON research_results(category);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON episode_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_scheduled ON episode_proposals(scheduled_for)
  WHERE status = 'approved' OR status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_proposals_research ON episode_proposals(research_result_id);

-- Trigger for updated_at on research_configs (drop first if exists)
DROP TRIGGER IF EXISTS update_research_configs_updated_at ON research_configs;
CREATE TRIGGER update_research_configs_updated_at
  BEFORE UPDATE ON research_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
