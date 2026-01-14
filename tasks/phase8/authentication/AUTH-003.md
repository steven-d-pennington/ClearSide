# AUTH-003: Repositories & Auth Middleware

**Task ID:** AUTH-003
**Phase:** Phase 8
**Category:** Authentication System
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** AUTH-001 (types), AUTH-002 (utilities)
**Status:** Completed
**Completed Date:** 2026-01-13

---

## Context

Implement database repositories for users and organizations, plus Express middleware for authentication and authorization. These components handle all database operations and request authentication/authorization.

**References:**
- AUTH-001 (Database Schema & Types)
- AUTH-002 (Password & JWT Utilities)
- Existing repository pattern in `backend/src/db/repositories/`

---

## Requirements

### Acceptance Criteria

- [ ] Create UserRepository with CRUD operations
- [ ] Create OrganizationRepository with CRUD operations
- [ ] Implement user authentication methods (find, create, update password)
- [ ] Implement account lockout logic (5 failed attempts → 15 min lockout)
- [ ] Create requireAuth middleware (validates JWT)
- [ ] Create requireRole middleware (checks user role)
- [ ] Create requireAdmin and requireSuperAdmin convenience middleware
- [ ] Create optionalAuth middleware (sets user if present)
- [ ] Create requireSameOrganization middleware (org-scoped access)
- [ ] Write unit tests for repositories
- [ ] Write unit tests for middleware

### Functional Requirements

**UserRepository:**
- Find by username, ID, or organization
- Create user with temp password generation
- Update user fields
- Update password (clears temp flag, sets changed_at)
- Track failed login attempts
- Account lockout after 5 failures (15 minutes)
- Reset failed attempts on successful login
- Convert User to UserPublic (strip password hash)

**OrganizationRepository:**
- Find by ID or name
- Create, update, delete organizations
- List all organizations

**Auth Middleware:**
- Validate JWT from httpOnly cookie
- Attach user to request object
- Check user roles (super_admin, org_admin, user)
- Enforce organization boundaries
- Return 401/403 with proper error messages

---

## Implementation

### 1. User Repository

**File:** `backend/src/db/repositories/user-repository.ts`

```typescript
import { Pool } from 'pg';
import {
  User,
  UserPublic,
  CreateUserInput,
  UpdateUserInput,
} from '../../types/auth.js';
import { hashPassword, generateTempPassword } from '../../utils/password.js';

export class UserRepository {
  constructor(private pool: Pool) {}

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List users by organization
   */
  async listByOrganization(organizationId: string): Promise<User[]> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId]
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * List all users (super admin only)
   */
  async listAll(): Promise<User[]> {
    const result = await this.pool.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Create a new user with temp password
   * Returns the user and the temp password (for admin to share)
   */
  async create(input: CreateUserInput): Promise<{ user: User; tempPassword: string }> {
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const result = await this.pool.query(
      `INSERT INTO users (
        organization_id, username, email, password_hash,
        role, full_name, is_temp_password, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, true)
      RETURNING *`,
      [
        input.organizationId,
        input.username,
        input.email || null,
        passwordHash,
        input.role,
        input.fullName || null,
      ]
    );

    return {
      user: this.mapRow(result.rows[0]),
      tempPassword,
    };
  }

  /**
   * Update user fields
   */
  async update(id: string, input: UpdateUserInput): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(input.email);
    }
    if (input.fullName !== undefined) {
      fields.push(`full_name = $${paramIndex++}`);
      values.push(input.fullName);
    }
    if (input.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(input.role);
    }
    if (input.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Update user password
   */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);

    await this.pool.query(
      `UPDATE users
       SET password_hash = $1,
           is_temp_password = false,
           password_changed_at = NOW()
       WHERE id = $2`,
      [passwordHash, id]
    );
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /**
   * Increment failed login attempts
   * Locks account for 15 minutes after 5 failures
   */
  async incrementFailedLogins(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= 5
             THEN NOW() + INTERVAL '15 minutes'
             ELSE locked_until
           END
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Reset failed login attempts (on successful login)
   */
  async resetFailedLogins(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Delete user (soft delete by setting is_active = false)
   */
  async delete(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET is_active = false WHERE id = $1',
      [id]
    );
  }

  /**
   * Convert User to UserPublic (strips password hash)
   */
  userToPublic(user: User): UserPublic {
    return {
      id: user.id,
      organizationId: user.organizationId,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      isTempPassword: user.isTempPassword,
      lastLoginAt: user.lastLoginAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
    };
  }

  /**
   * Map database row to User
   */
  private mapRow(row: any): User {
    return {
      id: row.id,
      organizationId: row.organization_id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
      fullName: row.full_name,
      isTempPassword: row.is_temp_password,
      passwordChangedAt: row.password_changed_at,
      lastLoginAt: row.last_login_at,
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export function createUserRepository(pool: Pool): UserRepository {
  return new UserRepository(pool);
}
```

### 2. Organization Repository

**File:** `backend/src/db/repositories/organization-repository.ts`

```typescript
import { Pool } from 'pg';
import { Organization } from '../../types/auth.js';

export class OrganizationRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<Organization | null> {
    const result = await this.pool.query(
      'SELECT * FROM organizations WHERE id = $1',
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByName(name: string): Promise<Organization | null> {
    const result = await this.pool.query(
      'SELECT * FROM organizations WHERE name = $1',
      [name]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listAll(): Promise<Organization[]> {
    const result = await this.pool.query(
      'SELECT * FROM organizations ORDER BY created_at DESC'
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async create(data: {
    name: string;
    description?: string;
    settings?: Record<string, any>;
  }): Promise<Organization> {
    const result = await this.pool.query(
      `INSERT INTO organizations (name, description, settings, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [data.name, data.description || null, JSON.stringify(data.settings || {})]
    );
    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    data: Partial<Pick<Organization, 'name' | 'description' | 'settings' | 'isActive'>>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.settings !== undefined) {
      fields.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(data.settings));
    }
    if (data.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.pool.query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE organizations SET is_active = false WHERE id = $1',
      [id]
    );
  }

  private mapRow(row: any): Organization {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      settings: row.settings || {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export function createOrganizationRepository(pool: Pool): OrganizationRepository {
  return new OrganizationRepository(pool);
}
```

### 3. Auth Middleware

**File:** `backend/src/middleware/auth.ts`

```typescript
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types/auth.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * Require authentication - validates JWT token
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.jwt;

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Require specific role(s)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

/**
 * Require super admin role
 */
export const requireSuperAdmin = requireRole('super_admin');

/**
 * Require admin role (super_admin or org_admin)
 */
export const requireAdmin = requireRole('super_admin', 'org_admin');

/**
 * Optional authentication - sets user if token present, but doesn't require it
 */
export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies?.jwt;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

/**
 * Require user to access only their own organization's resources
 * Used for org-scoped endpoints
 */
export function requireSameOrganization(
  getOrgId: (req: AuthenticatedRequest) => string
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Super admins can access any organization
    if (req.user.role === 'super_admin') {
      next();
      return;
    }

    const resourceOrgId = getOrgId(req);

    if (resourceOrgId !== req.user.organizationId) {
      res.status(403).json({
        success: false,
        error: 'Access denied - organization mismatch',
      });
      return;
    }

    next();
  };
}
```

---

## Testing & Verification

### Repository Tests

Run with: `npm test -- repositories`

### Middleware Tests

Run with: `npm test -- middleware/auth`

### Manual Testing

```bash
# Test user creation and retrieval
node
> const { pool } = require('./dist/db/index.js');
> const { createUserRepository } = require('./dist/db/repositories/user-repository.js');
> const repo = createUserRepository(pool);
> (async () => {
    const { user, tempPassword } = await repo.create({
      organizationId: '00000000-0000-0000-0000-000000000000',
      username: 'test@example.com',
      role: 'user'
    });
    console.log('User:', user.username);
    console.log('Temp Password:', tempPassword);
  })();
```

---

## Critical Files

- `backend/src/db/repositories/user-repository.ts` (new)
- `backend/src/db/repositories/organization-repository.ts` (new)
- `backend/src/middleware/auth.ts` (new)

---

## Dependencies

- AUTH-001 (Database Schema & Types)
- AUTH-002 (Password & JWT Utilities)

---

**Status:** Ready to implement
**Next Task:** AUTH-004 (API Routes)
