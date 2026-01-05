-- Add segment-level status tracking for podcast generation recovery
-- This enables resume capability when TTS generation fails mid-way

-- Segment-level tracking table
CREATE TABLE IF NOT EXISTS podcast_segment_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES podcast_export_jobs(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  character_count INTEGER,
  cost_cents INTEGER,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  CONSTRAINT valid_segment_status CHECK (status IN ('pending', 'generating', 'complete', 'error')),
  UNIQUE (job_id, segment_index)
);

-- Add phase tracking columns to podcast_export_jobs
ALTER TABLE podcast_export_jobs
  ADD COLUMN IF NOT EXISTS generation_phase VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS partial_cost_cents INTEGER DEFAULT 0;

-- Add constraint for generation phases (drop first for idempotency)
ALTER TABLE podcast_export_jobs
  DROP CONSTRAINT IF EXISTS valid_generation_phase;
ALTER TABLE podcast_export_jobs
  ADD CONSTRAINT valid_generation_phase
  CHECK (generation_phase IN ('pending', 'tts', 'concat', 'normalize', 'tag', 'complete', 'error'));

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_segment_status_job ON podcast_segment_status(job_id);
CREATE INDEX IF NOT EXISTS idx_segment_status_pending ON podcast_segment_status(job_id, status) WHERE status IN ('pending', 'error');
CREATE INDEX IF NOT EXISTS idx_podcast_jobs_phase ON podcast_export_jobs(generation_phase) WHERE generation_phase NOT IN ('complete', 'pending');

-- Record this migration as applied
INSERT INTO schema_migrations (version) VALUES ('014_add_podcast_segment_tracking')
  ON CONFLICT (version) DO NOTHING;
