-- 038_add_viral_mode.sql
-- Add viral_mode flag to research_configs for aggressive engagement optimization

ALTER TABLE research_configs
ADD COLUMN IF NOT EXISTS viral_mode BOOLEAN DEFAULT false;

COMMENT ON COLUMN research_configs.viral_mode IS 'Enable aggressive clickbait/engagement optimization in topic discovery';
