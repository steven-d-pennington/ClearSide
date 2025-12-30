-- Migration: 006_add_export_jobs
-- Description: Add export_jobs table for tracking audio/video export job status
-- Date: 2025-12-29

-- Create export_jobs table
CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  -- Job type and status
  job_type VARCHAR(20) NOT NULL DEFAULT 'audio' CHECK (job_type IN ('audio', 'video', 'markdown', 'pdf')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

  -- Progress tracking
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage VARCHAR(100),

  -- Configuration
  options JSONB NOT NULL DEFAULT '{}',

  -- Output information
  output_path TEXT,
  output_url TEXT,
  file_size_bytes BIGINT,
  duration_seconds DECIMAL(10,2),

  -- Error tracking
  error TEXT,

  -- Provider used (e.g., 'elevenlabs', 'playht', 'openai')
  provider VARCHAR(30),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_export_jobs_debate_id ON export_jobs(debate_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_job_type ON export_jobs(job_type);

-- Add comments for documentation
COMMENT ON TABLE export_jobs IS 'Tracks export job status for audio, video, and document exports';
COMMENT ON COLUMN export_jobs.job_type IS 'Type of export: audio, video, markdown, pdf';
COMMENT ON COLUMN export_jobs.status IS 'Job status: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN export_jobs.progress IS 'Progress percentage 0-100';
COMMENT ON COLUMN export_jobs.stage IS 'Current processing stage description';
COMMENT ON COLUMN export_jobs.options IS 'JSON options passed to the export (voice, format, etc.)';
COMMENT ON COLUMN export_jobs.provider IS 'TTS/export provider used (elevenlabs, playht, openai)';
