# AUTH-004: API Routes for Authentication

**Task ID:** AUTH-004
**Phase:** Phase 8
**Category:** Authentication System
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** AUTH-001 (types), AUTH-002 (utilities), AUTH-003 (repositories & middleware)
**Status:** Completed
**Completed Date:** 2026-01-13

---

## Context

Implement Express API routes for authentication, user management, and organization management. These routes handle login/logout, user CRUD operations, and organization CRUD operations with proper authorization checks.

**References:**
- AUTH-001 (Database Schema & Types)
- AUTH-002 (Password & JWT Utilities)
- AUTH-003 (Repositories & Auth Middleware)
- Existing route patterns in `backend/src/routes/`

---

## Requirements

### Acceptance Criteria

- [ ] Create authentication routes (login, logout, me, change-password)
- [ ] Create user management routes (list, create, update, delete)
- [ ] Create organization management routes (list, create, update, delete)
- [ ] Implement rate limiting for login endpoint (5 attempts per 15 min)
- [ ] Implement account lockout logic (5 failed attempts → 15 min lockout)
- [ ] Apply proper middleware to each route (requireAuth, requireAdmin, etc.)
- [ ] Validate request bodies with Zod schemas
- [ ] Return proper HTTP status codes and error messages
- [ ] Handle temp password flow (requiresPasswordChange flag)
- [ ] Write integration tests for all routes

### Functional Requirements

**Authentication Routes:**
- POST /api/auth/login - Authenticate user, set JWT cookie
- POST /api/auth/logout - Clear JWT cookie
- GET /api/auth/me - Get current user info
- POST /api/auth/change-password - Change password (temp or regular)

**User Routes:**
- GET /api/users - List users (org-scoped for org_admin, all for super_admin)
- POST /api/users - Create user with temp password
- GET /api/users/:id - Get user by ID
- PUT /api/users/:id - Update user
- DELETE /api/users/:id - Soft delete user

**Organization Routes:**
- GET /api/organizations - List organizations (super_admin only)
- POST /api/organizations - Create organization (super_admin only)
- GET /api/organizations/:id - Get organization
- PUT /api/organizations/:id - Update organization
- DELETE /api/organizations/:id - Soft delete organization

---

## Implementation

### 1. Authentication Routes

**File:** `backend/src/routes/auth-routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UserRepository } from '../db/repositories/user-repository.js';
import { verifyPassword, validatePassword } from '../utils/password.js';
import { generateToken, getCookieOptions } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from 'express-rate-limit';
import { Pool } from 'pg';
import {
  LoginRequest,
  ChangePasswordRequest,
  AuthenticatedRequest,
} from '../types/auth.js';

export function createAuthRoutes(pool: Pool): Router {
  const router = Router();
  const userRepo = new UserRepository(pool);

  // Rate limiter: 5 attempts per 15 minutes
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many login attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
  });

  /**
   * POST /api/auth/login
   * Authenticate user with username and password
   */
  router.post('/login', loginLimiter, async (req: Request, res: Response) => {
    const schema = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        errors: parseResult.error.errors,
      });
      return;
    }

    const { username, password } = parseResult.data;

    try {
      // Find user
      const user = await userRepo.findByUsername(username);

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
        return;
      }

      // Check if account is locked
      if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
        res.status(403).json({
          success: false,
          error: 'Account locked due to too many failed attempts. Try again later.',
        });
        return;
      }

      // Check if user is active
      if (!user.isActive) {
        res.status(403).json({
          success: false,
          error: 'Account is inactive',
        });
        return;
      }

      // Verify password
      const isValid = await verifyPassword(password, user.passwordHash);

      if (!isValid) {
        // Increment failed login attempts
        await userRepo.incrementFailedLogins(user.id);

        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
        return;
      }

      // Successful login - reset failed attempts
      await userRepo.resetFailedLogins(user.id);
      await userRepo.updateLastLogin(user.id);

      // Generate JWT token
      const token = generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        organizationId: user.organizationId,
      });

      // Set httpOnly cookie
      res.cookie('jwt', token, getCookieOptions());

      // Return user info (without password hash)
      const userPublic = userRepo.userToPublic(user);

      res.json({
        success: true,
        user: userPublic,
        requiresPasswordChange: user.isTempPassword,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Clear authentication cookie
   */
  router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.json({ success: true });
  });

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await userRepo.findById(req.user!.userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      const userPublic = userRepo.userToPublic(user);
      res.json({
        success: true,
        user: userPublic,
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/change-password
   * Change user password (for temp password or regular password change)
   */
  router.post(
    '/change-password',
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      const schema = z.object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8),
        confirmPassword: z.string().min(8),
      });

      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request',
          errors: parseResult.error.errors,
        });
        return;
      }

      const { currentPassword, newPassword, confirmPassword } = parseResult.data;

      // Check passwords match
      if (newPassword !== confirmPassword) {
        res.status(400).json({
          success: false,
          error: 'Passwords do not match',
        });
        return;
      }

      // Validate new password
      const validation = validatePassword(newPassword);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Password does not meet requirements',
          errors: validation.errors,
        });
        return;
      }

      try {
        const user = await userRepo.findById(req.user!.userId);

        if (!user) {
          res.status(404).json({
            success: false,
            error: 'User not found',
          });
          return;
        }

        // If not temp password, verify current password
        if (!user.isTempPassword) {
          if (!currentPassword) {
            res.status(400).json({
              success: false,
              error: 'Current password is required',
            });
            return;
          }

          const isValid = await verifyPassword(currentPassword, user.passwordHash);
          if (!isValid) {
            res.status(401).json({
              success: false,
              error: 'Current password is incorrect',
            });
            return;
          }
        }

        // Update password
        await userRepo.updatePassword(user.id, newPassword);

        res.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  return router;
}
```

### 2. User Management Routes

**File:** `backend/src/routes/user-routes.ts`

```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { UserRepository } from '../db/repositories/user-repository.js';
import { requireAuth, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { Pool } from 'pg';
import { AuthenticatedRequest, CreateUserInput, UpdateUserInput } from '../types/auth.js';

export function createUserRoutes(pool: Pool): Router {
  const router = Router();
  const userRepo = new UserRepository(pool);

  /**
   * GET /api/users
   * List users (org-scoped for org_admin, all users for super_admin)
   */
  router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      let users;

      if (req.user!.role === 'super_admin') {
        users = await userRepo.listAll();
      } else {
        // org_admin - only see users in their organization
        users = await userRepo.listByOrganization(req.user!.organizationId);
      }

      const usersPublic = users.map(user => userRepo.userToPublic(user));

      res.json({
        success: true,
        users: usersPublic,
      });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/users
   * Create a new user (admin only)
   */
  router.post('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      organizationId: z.string().uuid(),
      username: z.string().min(3),
      email: z.string().email().optional(),
      role: z.enum(['super_admin', 'org_admin', 'user']),
      fullName: z.string().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        errors: parseResult.error.errors,
      });
      return;
    }

    const input = parseResult.data as CreateUserInput;

    try {
      // Only super_admin can create users in other organizations
      if (
        req.user!.role !== 'super_admin' &&
        input.organizationId !== req.user!.organizationId
      ) {
        res.status(403).json({
          success: false,
          error: 'Cannot create users in other organizations',
        });
        return;
      }

      // Only super_admin can create super_admin users
      if (input.role === 'super_admin' && req.user!.role !== 'super_admin') {
        res.status(403).json({
          success: false,
          error: 'Only super admins can create super admin users',
        });
        return;
      }

      // Create user
      const { user, tempPassword } = await userRepo.create(input);
      const userPublic = userRepo.userToPublic(user);

      res.status(201).json({
        success: true,
        user: userPublic,
        tempPassword, // Return temp password so admin can share it
      });
    } catch (error: any) {
      console.error('Create user error:', error);

      // Check for unique constraint violation
      if (error.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'Username already exists',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/users/:id
   * Get user by ID
   */
  router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await userRepo.findById(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Check permissions
      if (
        req.user!.role !== 'super_admin' &&
        user.organizationId !== req.user!.organizationId
      ) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      const userPublic = userRepo.userToPublic(user);
      res.json({
        success: true,
        user: userPublic,
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/users/:id
   * Update user
   */
  router.put('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      email: z.string().email().optional(),
      fullName: z.string().optional(),
      role: z.enum(['super_admin', 'org_admin', 'user']).optional(),
      isActive: z.boolean().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        errors: parseResult.error.errors,
      });
      return;
    }

    const input = parseResult.data as UpdateUserInput;

    try {
      const user = await userRepo.findById(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Check permissions
      if (
        req.user!.role !== 'super_admin' &&
        user.organizationId !== req.user!.organizationId
      ) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      // Only super_admin can change roles to super_admin
      if (input.role === 'super_admin' && req.user!.role !== 'super_admin') {
        res.status(403).json({
          success: false,
          error: 'Only super admins can assign super admin role',
        });
        return;
      }

      await userRepo.update(req.params.id, input);

      res.json({
        success: true,
        message: 'User updated successfully',
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/users/:id
   * Soft delete user (set is_active = false)
   */
  router.delete('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await userRepo.findById(req.params.id);

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Check permissions
      if (
        req.user!.role !== 'super_admin' &&
        user.organizationId !== req.user!.organizationId
      ) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      // Prevent self-deletion
      if (user.id === req.user!.userId) {
        res.status(400).json({
          success: false,
          error: 'Cannot delete your own account',
        });
        return;
      }

      await userRepo.delete(req.params.id);

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}
```

### 3. Organization Routes

**File:** `backend/src/routes/organization-routes.ts`

```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { OrganizationRepository } from '../db/repositories/organization-repository.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../types/auth.js';

export function createOrganizationRoutes(pool: Pool): Router {
  const router = Router();
  const orgRepo = new OrganizationRepository(pool);

  /**
   * GET /api/organizations
   * List all organizations (super_admin only)
   */
  router.get('/', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizations = await orgRepo.listAll();

      res.json({
        success: true,
        organizations,
      });
    } catch (error) {
      console.error('List organizations error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/organizations
   * Create a new organization (super_admin only)
   */
  router.post('/', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      settings: z.record(z.any()).optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        errors: parseResult.error.errors,
      });
      return;
    }

    try {
      const organization = await orgRepo.create(parseResult.data);

      res.status(201).json({
        success: true,
        organization,
      });
    } catch (error: any) {
      console.error('Create organization error:', error);

      // Check for unique constraint violation
      if (error.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'Organization name already exists',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/organizations/:id
   * Get organization by ID
   */
  router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organization = await orgRepo.findById(req.params.id);

      if (!organization) {
        res.status(404).json({
          success: false,
          error: 'Organization not found',
        });
        return;
      }

      // Check permissions - users can only view their own organization
      if (
        req.user!.role !== 'super_admin' &&
        organization.id !== req.user!.organizationId
      ) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      res.json({
        success: true,
        organization,
      });
    } catch (error) {
      console.error('Get organization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/organizations/:id
   * Update organization (super_admin only)
   */
  router.put('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      settings: z.record(z.any()).optional(),
      isActive: z.boolean().optional(),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        errors: parseResult.error.errors,
      });
      return;
    }

    try {
      const organization = await orgRepo.findById(req.params.id);

      if (!organization) {
        res.status(404).json({
          success: false,
          error: 'Organization not found',
        });
        return;
      }

      await orgRepo.update(req.params.id, parseResult.data);

      res.json({
        success: true,
        message: 'Organization updated successfully',
      });
    } catch (error) {
      console.error('Update organization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/organizations/:id
   * Soft delete organization (super_admin only)
   */
  router.delete('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organization = await orgRepo.findById(req.params.id);

      if (!organization) {
        res.status(404).json({
          success: false,
          error: 'Organization not found',
        });
        return;
      }

      // Prevent deletion of default organization
      if (organization.id === '00000000-0000-0000-0000-000000000000') {
        res.status(400).json({
          success: false,
          error: 'Cannot delete default organization',
        });
        return;
      }

      await orgRepo.delete(req.params.id);

      res.json({
        success: true,
        message: 'Organization deleted successfully',
      });
    } catch (error) {
      console.error('Delete organization error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}
```

### 4. Register Routes in Server

**File:** `backend/src/index.ts` (add after existing routes)

```typescript
import cookieParser from 'cookie-parser';
import { createAuthRoutes } from './routes/auth-routes.js';
import { createUserRoutes } from './routes/user-routes.js';
import { createOrganizationRoutes } from './routes/organization-routes.js';

// ... existing code ...

// Add cookie parser middleware
app.use(cookieParser());

// Register auth routes
app.use('/api/auth', createAuthRoutes(pool));
app.use('/api/users', createUserRoutes(pool));
app.use('/api/organizations', createOrganizationRoutes(pool));

// ... rest of server setup ...
```

---

## Testing & Verification

### Integration Tests

**File:** `backend/src/routes/__tests__/auth-routes.test.ts`

```typescript
import request from 'supertest';
import { app } from '../../index';
import { pool } from '../../db/index';

describe('Auth Routes', () => {
  let authCookie: string;

  beforeAll(async () => {
    // Ensure super user exists
    await pool.query(
      `INSERT INTO users (organization_id, username, password_hash, role)
       VALUES ('00000000-0000-0000-0000-000000000000', 'test@example.com', '$2a$12$...', 'super_admin')
       ON CONFLICT (username) DO NOTHING`
    );
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'steven@spennington.dev',
          password: 'StarDust',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('steven@spennington.dev');
      expect(response.headers['set-cookie']).toBeDefined();

      authCookie = response.headers['set-cookie'][0];
    });

    it('should reject invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'steven@spennington.dev',
          password: 'WrongPassword',
        })
        .expect(401);
    });

    it('should enforce rate limiting', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            username: 'steven@spennington.dev',
            password: 'WrongPassword',
          });
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'steven@spennington.dev',
          password: 'WrongPassword',
        })
        .expect(429);

      expect(response.body.message).toContain('Too many login attempts');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe('steven@spennington.dev');
    });

    it('should reject unauthenticated requests', async () => {
      await request(app)
        .get('/api/auth/me')
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear authentication cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.headers['set-cookie'][0]).toContain('jwt=;');
    });
  });
});
```

### Manual Testing

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"steven@spennington.dev","password":"StarDust"}' \
  -c cookies.txt

# 2. Get current user
curl http://localhost:3000/api/auth/me \
  -b cookies.txt

# 3. Create user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "organizationId":"00000000-0000-0000-0000-000000000000",
    "username":"newuser@example.com",
    "role":"user"
  }'

# 4. List users
curl http://localhost:3000/api/users \
  -b cookies.txt

# 5. Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt
```

---

## Critical Files

- `backend/src/routes/auth-routes.ts` (new)
- `backend/src/routes/user-routes.ts` (new)
- `backend/src/routes/organization-routes.ts` (new)
- `backend/src/index.ts` (modified - register routes)

---

## Dependencies

- AUTH-001 (Database Schema & Types)
- AUTH-002 (Password & JWT Utilities)
- AUTH-003 (Repositories & Auth Middleware)
- npm packages: express, express-rate-limit, cookie-parser, zod

---

**Status:** Ready to implement
**Next Task:** AUTH-005 (Frontend Implementation)
