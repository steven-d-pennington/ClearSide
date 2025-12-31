-- Migration 008: Add Model Defaults
-- Adds model columns to debate_presets and creates system_settings table

-- Add model columns to debate_presets table for per-preset model defaults
ALTER TABLE debate_presets
  ADD COLUMN IF NOT EXISTS pro_model_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS con_model_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS moderator_model_id VARCHAR(100);

-- Create system_settings table for global configuration
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Seed default model settings
INSERT INTO system_settings (key, value) VALUES
  ('default_models', '{"proModelId": null, "conModelId": null, "moderatorModelId": null}')
ON CONFLICT (key) DO NOTHING;

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_system_settings_updated_at ON system_settings;
CREATE TRIGGER trigger_update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();
