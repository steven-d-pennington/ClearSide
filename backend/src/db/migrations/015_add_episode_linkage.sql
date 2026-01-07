-- 015_add_episode_linkage.sql
-- Adds episode linkage to debates and citation metadata to utterances for RAG support

-- Add episode_id to debates for Duelogic episodes
ALTER TABLE debates ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES episode_proposals(id);

-- Add citation metadata to utterances
ALTER TABLE utterances ADD COLUMN IF NOT EXISTS citation_metadata JSONB;

-- Index for episode lookups
CREATE INDEX IF NOT EXISTS idx_debates_episode ON debates(episode_id) WHERE episode_id IS NOT NULL;

-- Index for finding utterances with citations
CREATE INDEX IF NOT EXISTS idx_utterances_has_citations ON utterances((citation_metadata IS NOT NULL))
  WHERE citation_metadata IS NOT NULL;
