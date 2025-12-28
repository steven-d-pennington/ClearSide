-- Rollback for 004_add_personas.sql

BEGIN;

ALTER TABLE debates DROP COLUMN IF EXISTS pro_persona_id;
ALTER TABLE debates DROP COLUMN IF EXISTS con_persona_id;

DROP TABLE IF EXISTS personas;

COMMIT;
