-- Podcast export jobs table
CREATE TABLE podcast_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Configuration (stored as JSONB)
  config JSONB NOT NULL,

  -- Refined script (stored as JSONB)
  refined_script JSONB,

  -- Progress tracking
  current_segment INTEGER,
  total_segments INTEGER,
  progress_percent INTEGER DEFAULT 0,

  -- Output
  audio_url TEXT,
  duration_seconds INTEGER,
  character_count INTEGER,
  estimated_cost_cents INTEGER,
  actual_cost_cents INTEGER,

  -- Metadata
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'refining', 'generating', 'complete', 'error')),
  CONSTRAINT valid_progress CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

-- Index for efficient lookups
CREATE INDEX idx_podcast_jobs_debate ON podcast_export_jobs(debate_id);
CREATE INDEX idx_podcast_jobs_status ON podcast_export_jobs(status);
CREATE INDEX idx_podcast_jobs_created ON podcast_export_jobs(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_podcast_jobs_updated_at
  BEFORE UPDATE ON podcast_export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
