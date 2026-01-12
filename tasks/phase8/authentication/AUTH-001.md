# AUTH-001: Database Schema & Types for Authentication

**Task ID:** AUTH-001
**Phase:** Phase 8
**Category:** Authentication System
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** None
**Status:** Ready

---

## Context

ClearSide needs a homegrown authentication system with username/password authentication, JWT-based sessions, role-based access control, and multi-tenant organization support. This task establishes the database foundation and TypeScript types for the authentication system.

**References:**
- Authentication plan in conversation summary
- Existing database patterns in `backend/src/db/`
- Migration naming convention: 3-digit zero-padded (NNN_description.sql)

---

## Requirements

### Acceptance Criteria

- [ ] Create database migration for `organizations` table
- [ ] Create database migration for `users` table with role-based access
- [ ] Create database migration for super user seed script
- [ ] Create TypeScript interfaces for authentication types
- [ ] Add user role enum (super_admin, org_admin, user)
- [ ] Include password management fields (is_temp_password, failed_login_attempts, locked_until)
- [ ] Auto-create default organization with known UUID
- [ ] Create indexes for performance (username, email, organization_id, role)
- [ ] Add updated_at trigger for users table

### Functional Requirements

**Organizations:**
- Support multi-tenant architecture from day 1
- Default organization for initial deployment
- Settings stored as JSONB for flexibility
- Active/inactive status flag

**Users:**
- Username-based authentication (no OAuth)
- Three roles: super_admin, org_admin, user
- Belong to one organization
- Password management: temp passwords, failed attempts, lockout
- Track last login and password change timestamps

**Super User:**
- Username: `steven@spennington.dev`
- Password: `StarDust` (hashed with bcrypt)
- Auto-created on system boot if not exists
- Role: super_admin

---

## Implementation

### 1. Migration 025: Organizations Table

**File:** `backend/src/db/migrations/025_add_organizations.sql`

```sql
-- Migration 025: Add Organizations Table
-- Multi-tenant organization support

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create updated_at trigger
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_organizations_name ON organizations(name);
CREATE INDEX idx_organizations_is_active ON organizations(is_active);

-- Insert default organization with known UUID
INSERT INTO organizations (id, name, description, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Default Organization',
  'Default organization for initial deployment',
  true
)
ON CONFLICT (id) DO NOTHING;
```

### 2. Migration 026: Users Table

**File:** `backend/src/db/migrations/026_add_users.sql`

```sql
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

-- Create updated_at trigger
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_locked_until ON users(locked_until);
```

### 3. Migration 027: Super User Seed

**File:** `backend/src/db/migrations/027_seed_super_user.sql`

```sql
-- Migration 027: Seed Super User
-- Creates super admin user if not exists (idempotent)

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
  '$2a$12$placeholder_hash_replaced_by_seed_script',
  'super_admin',
  'Steven Pennington',
  false,
  true
)
ON CONFLICT (username) DO NOTHING;
```

**Note:** The password hash is a placeholder. The actual hash for "StarDust" will be set by the seed script in `backend/src/db/seedSuperUser.ts`.

### 4. TypeScript Types

**File:** `backend/src/types/auth.ts`

```typescript
/**
 * Authentication and Authorization Types
 */

export type UserRole = 'super_admin' | 'org_admin' | 'user';

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  settings: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  organizationId: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: UserRole;
  fullName: string | null;
  isTempPassword: boolean;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User data safe to send to client (no password hash)
 */
export interface UserPublic {
  id: string;
  organizationId: string;
  username: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  isTempPassword: boolean;
  lastLoginAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
  organizationId: string;
  iat: number;
  exp: number;
}

/**
 * Login request/response
 */
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: UserPublic;
  requiresPasswordChange?: boolean;
  error?: string;
}

/**
 * Password change request
 */
export interface ChangePasswordRequest {
  currentPassword?: string; // Optional for temp password
  newPassword: string;
  confirmPassword: string;
}

/**
 * User creation/update
 */
export interface CreateUserInput {
  organizationId: string;
  username: string;
  email?: string;
  role: UserRole;
  fullName?: string;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

/**
 * Express request with authenticated user
 */
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}
```

---

## Testing & Verification

### Database Migration Tests

```bash
# Run migrations
cd backend
npm run migrate

# Verify tables exist
psql $DATABASE_URL -c "\d organizations"
psql $DATABASE_URL -c "\d users"

# Verify default organization exists
psql $DATABASE_URL -c "SELECT * FROM organizations WHERE id = '00000000-0000-0000-0000-000000000000';"

# Verify super user placeholder exists (hash will be updated by seed script)
psql $DATABASE_URL -c "SELECT username, role FROM users WHERE username = 'steven@spennington.dev';"
```

### TypeScript Type Tests

```typescript
// backend/src/types/auth.test.ts
import { UserRole, User, UserPublic, JwtPayload } from './auth';

describe('Auth Types', () => {
  it('should enforce UserRole enum', () => {
    const validRoles: UserRole[] = ['super_admin', 'org_admin', 'user'];
    expect(validRoles).toHaveLength(3);
  });

  it('should not expose password in UserPublic', () => {
    const userPublic: UserPublic = {
      id: '123',
      organizationId: '456',
      username: 'test',
      email: 'test@example.com',
      role: 'user',
      fullName: 'Test User',
      isTempPassword: false,
      lastLoginAt: new Date(),
      isActive: true,
      createdAt: new Date(),
    };

    // TypeScript should not allow passwordHash on UserPublic
    // @ts-expect-error - passwordHash should not exist on UserPublic
    expect(userPublic.passwordHash).toBeUndefined();
  });
});
```

---

## Critical Files

- `backend/src/db/migrations/025_add_organizations.sql` (new)
- `backend/src/db/migrations/026_add_users.sql` (new)
- `backend/src/db/migrations/027_seed_super_user.sql` (new)
- `backend/src/types/auth.ts` (new)

---

## Dependencies

None - this is the foundation task for Phase 8.

---

## Future Enhancements

1. Email verification workflow
2. Password reset via email
3. OAuth integration (Google, GitHub)
4. Two-factor authentication (2FA)
5. Session management dashboard
6. Audit log for authentication events

---

## Notes

**Design Decisions:**
- Username-based auth (not email) for simplicity
- JWT in httpOnly cookies (prevents XSS)
- Multi-tenant from day 1 (easier than retrofitting)
- Three-role system (super_admin, org_admin, user)
- Temp passwords force first-time password change

**Security Considerations:**
- Bcrypt with 12 salt rounds (slow, secure)
- Account lockout after 5 failed attempts
- 7-day JWT expiration
- HttpOnly cookies (no client-side JS access)
- Rate limiting on login endpoint (5 attempts per 15 min)

**Migration Order:**
1. 025_add_organizations.sql (creates organizations)
2. 026_add_users.sql (references organizations via FK)
3. 027_seed_super_user.sql (creates super user record)

Note: The super user password will be properly hashed by `seedSuperUser.ts` on server startup.

---

**Status:** Ready to implement
**Next Task:** AUTH-002 (Password & JWT Utilities)
