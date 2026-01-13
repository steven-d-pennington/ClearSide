-- Migration 031: Add Podcast Feed Metadata Table
-- Global podcast show configuration (single row)

CREATE TABLE IF NOT EXISTS podcast_feed_metadata (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'ClearSide Debates',
  description TEXT NOT NULL DEFAULT 'AI-powered structured reasoning and live debates',
  author VARCHAR(255) NOT NULL DEFAULT 'ClearSide',
  email VARCHAR(255),
  language VARCHAR(10) NOT NULL DEFAULT 'en-us',
  categories TEXT[] DEFAULT ARRAY['Technology', 'Education', 'News'],
  image_url TEXT NOT NULL, -- 1400x1400 minimum for Apple Podcasts
  website_url TEXT,
  feed_url TEXT NOT NULL,
  copyright VARCHAR(255),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Single row constraint (only one podcast feed config allowed)
CREATE UNIQUE INDEX idx_single_feed_metadata ON podcast_feed_metadata((true));

-- Create updated_at trigger
CREATE TRIGGER update_podcast_feed_metadata_updated_at
  BEFORE UPDATE ON podcast_feed_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration
INSERT INTO podcast_feed_metadata (
  title,
  description,
  feed_url,
  image_url,
  email,
  copyright
) VALUES (
  'ClearSide Debates',
  'AI-powered structured reasoning and live debates exploring complex topics through conversational podcasts',
  'https://clearside.app/rss/podcast.xml',
  'https://clearside.app/artwork.jpg', -- USER MUST CREATE: 1400x1400 JPEG/PNG
  'steve.d.pennington@gmail.com',
  'Copyright © 2026 ClearSide'
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE podcast_feed_metadata IS 'Global podcast show configuration for RSS feed (single row only)';
