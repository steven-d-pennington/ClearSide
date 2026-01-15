-- Migration 025: Add Organizations Table
-- Multi-tenant organization support for ClearSide authentication

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create updated_at trigger (uses existing function from migration 001)
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

-- Insert default organization with known UUID
INSERT INTO organizations (id, name, description, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Default Organization',
  'Default organization for initial deployment',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant organizations for user grouping and access control';
COMMENT ON COLUMN organizations.id IS 'Unique organization identifier (UUID v4)';
COMMENT ON COLUMN organizations.name IS 'Organization display name (unique)';
COMMENT ON COLUMN organizations.description IS 'Optional organization description';
COMMENT ON COLUMN organizations.settings IS 'Organization-specific settings as JSONB';
COMMENT ON COLUMN organizations.is_active IS 'Whether the organization is active (inactive = disabled)';

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('025_add_organizations')
ON CONFLICT (version) DO NOTHING;

-- Verification
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'organizations') = 1,
         'organizations table was not created';
  ASSERT (SELECT COUNT(*) FROM organizations WHERE id = '00000000-0000-0000-0000-000000000000') = 1,
         'Default organization was not created';
  RAISE NOTICE 'Migration 025_add_organizations completed successfully';
END $$;
