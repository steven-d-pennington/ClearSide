-- Migration 030: Add Published Episodes Table
-- Tracks all published podcast episodes for RSS feed generation

CREATE TABLE IF NOT EXISTS published_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_job_id UUID NOT NULL REFERENCES podcast_export_jobs(id) ON DELETE CASCADE,
  conversation_session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL,

  -- Auto-generated metadata
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[],
  explicit BOOLEAN DEFAULT false,

  -- RSS feed fields
  guid VARCHAR(255) UNIQUE NOT NULL,
  pub_date TIMESTAMP WITH TIME ZONE NOT NULL,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  file_size_bytes BIGINT NOT NULL,

  -- Distribution tracking
  rss_published_at TIMESTAMP WITH TIME ZONE,
  spotify_indexed_at TIMESTAMP WITH TIME ZONE, -- Manual tracking

  -- Notification tracking
  notification_sent_at TIMESTAMP WITH TIME ZONE,
  notification_recipient VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_published_episodes_podcast_job ON published_episodes(podcast_job_id);
CREATE INDEX idx_published_episodes_conversation ON published_episodes(conversation_session_id);
CREATE INDEX idx_published_episodes_pub_date ON published_episodes(pub_date DESC);
CREATE INDEX idx_published_episodes_guid ON published_episodes(guid);

-- Create updated_at trigger
CREATE TRIGGER update_published_episodes_updated_at
  BEFORE UPDATE ON published_episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE published_episodes IS 'Published podcast episodes for RSS feed generation and distribution tracking';
