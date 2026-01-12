-- Migration 027: Seed Super User
-- Creates placeholder super admin user (password hash set by seedSuperUser.ts on startup)

-- Note: This inserts a placeholder password hash. The actual bcrypt hash for "StarDust"
-- will be set by the seedSuperUser.ts script during server startup.
-- This migration just ensures the user record exists for foreign key references.

INSERT INTO users (
  organization_id,
  username,
  email,
  password_hash,
  role,
  full_name,
  is_temp_password,
  is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'steven@spennington.dev',
  'steve.d.pennington@gmail.com',
  '$2a$12$placeholder_hash_will_be_replaced_by_seed_script',
  'super_admin',
  'Steven Pennington',
  false,
  true
)
ON CONFLICT (username) DO NOTHING;

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('027_seed_super_user')
ON CONFLICT (version) DO NOTHING;

-- Verification
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM users WHERE username = 'steven@spennington.dev') >= 1,
         'Super user was not created';
  RAISE NOTICE 'Migration 027_seed_super_user completed successfully';
END $$;
