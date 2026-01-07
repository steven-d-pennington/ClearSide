-- 017_add_viral_metrics.sql
-- Add viral optimization metrics to episode proposals

-- Add viral_metrics JSONB column to episode_proposals
ALTER TABLE episode_proposals
ADD COLUMN IF NOT EXISTS viral_metrics JSONB;

-- Add comment explaining the structure
COMMENT ON COLUMN episode_proposals.viral_metrics IS 'Viral optimization metrics: {trendAlignment, titleHookStrength, controversyBalance, suggestedHashtags, targetAudience, matchedTrends, titlePattern}';

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_proposals_viral_metrics ON episode_proposals USING GIN (viral_metrics)
  WHERE viral_metrics IS NOT NULL;
