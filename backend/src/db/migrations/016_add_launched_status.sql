-- Migration: Add 'launched' status to episode proposals
-- This allows proposals to be marked as launched when a debate is created from them

-- Drop the old constraint
ALTER TABLE episode_proposals DROP CONSTRAINT IF EXISTS valid_proposal_status;

-- Add the new constraint with 'launched' status
ALTER TABLE episode_proposals
  ADD CONSTRAINT valid_proposal_status
  CHECK (status IN ('pending', 'approved', 'rejected', 'scheduled', 'launched'));
