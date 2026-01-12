-- Migration 026: Add Users Table
-- User authentication with role-based access control

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user'
    CHECK (role IN ('super_admin', 'org_admin', 'user')),
  full_name VARCHAR(255),

  -- Password management
  is_temp_password BOOLEAN NOT NULL DEFAULT false,
  password_changed_at TIMESTAMP WITH TIME ZONE,

  -- Security tracking
  last_login_at TIMESTAMP WITH TIME ZONE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create updated_at trigger (uses existing function from migration 001)
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts with role-based access control and password management';
COMMENT ON COLUMN users.id IS 'Unique user identifier (UUID v4)';
COMMENT ON COLUMN users.organization_id IS 'Organization this user belongs to';
COMMENT ON COLUMN users.username IS 'Unique username for authentication';
COMMENT ON COLUMN users.email IS 'Optional email address';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.role IS 'User role: super_admin, org_admin, or user';
COMMENT ON COLUMN users.full_name IS 'User display name';
COMMENT ON COLUMN users.is_temp_password IS 'True if user has temporary password requiring change';
COMMENT ON COLUMN users.password_changed_at IS 'Timestamp of last password change';
COMMENT ON COLUMN users.last_login_at IS 'Timestamp of last successful login';
COMMENT ON COLUMN users.failed_login_attempts IS 'Count of consecutive failed login attempts';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp (null = not locked)';
COMMENT ON COLUMN users.is_active IS 'Whether the user account is active';

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('026_add_users')
ON CONFLICT (version) DO NOTHING;

-- Verification
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'users') = 1,
         'users table was not created';
  RAISE NOTICE 'Migration 026_add_users completed successfully';
END $$;
