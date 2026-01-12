-- Migration: Fix conversation_utterances.id column to support timestamp-based IDs
-- The id column was SERIAL (INTEGER) but the application uses timestamp_ms values
-- which exceed the 32-bit INTEGER limit (2,147,483,647)

-- Change id column from INTEGER to BIGINT
ALTER TABLE conversation_utterances
ALTER COLUMN id TYPE BIGINT;

-- Also change timestamp_ms from INTEGER to BIGINT
-- (supports Unix timestamps in milliseconds beyond 2038)
ALTER TABLE conversation_utterances
ALTER COLUMN timestamp_ms TYPE BIGINT;

-- Recreate the sequence with BIGINT if it exists
-- (SERIAL creates a sequence named tablename_columnname_seq)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.sequences
    WHERE sequence_name = 'conversation_utterances_id_seq'
  ) THEN
    -- Drop the old sequence
    DROP SEQUENCE IF EXISTS conversation_utterances_id_seq CASCADE;

    -- Create a new BIGINT sequence starting from current max + 1
    EXECUTE 'CREATE SEQUENCE conversation_utterances_id_seq AS BIGINT';

    -- Set the sequence ownership
    ALTER SEQUENCE conversation_utterances_id_seq OWNED BY conversation_utterances.id;

    -- Set default to use the sequence
    ALTER TABLE conversation_utterances
    ALTER COLUMN id SET DEFAULT nextval('conversation_utterances_id_seq');

    -- Reset sequence to max existing id + 1
    EXECUTE 'SELECT setval(''conversation_utterances_id_seq'', COALESCE((SELECT MAX(id) FROM conversation_utterances), 0) + 1, false)';
  END IF;
END $$;

-- Add comment for clarity
COMMENT ON COLUMN conversation_utterances.id IS 'BIGINT to support timestamp-based IDs (milliseconds since epoch)';
