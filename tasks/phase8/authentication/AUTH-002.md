# AUTH-002: Password & JWT Utilities

**Task ID:** AUTH-002
**Phase:** Phase 8
**Category:** Authentication System
**Priority:** P0
**Estimated Effort:** S (2-3 hours)
**Dependencies:** AUTH-001 (types)
**Status:** Completed
**Completed Date:** 2026-01-13

---

## Context

Implement secure password hashing with bcrypt and JWT token generation/validation for stateless authentication. These utilities are the foundation for all authentication operations.

**References:**
- AUTH-001 (Database Schema & Types)
- bcrypt documentation: https://github.com/kelektiv/node.bcrypt.js
- jsonwebtoken documentation: https://github.com/auth0/node-jsonwebtoken

---

## Requirements

### Acceptance Criteria

- [ ] Implement bcrypt password hashing with 12 salt rounds
- [ ] Implement password verification function
- [ ] Create temp password generator (memorable format)
- [ ] Create password validation function (complexity requirements)
- [ ] Implement JWT token generation with 7-day expiration
- [ ] Implement JWT token verification with error handling
- [ ] Add JWT_SECRET environment variable requirement
- [ ] Create seed script for super user auto-creation
- [ ] Write unit tests for all utility functions
- [ ] Document password requirements for users

### Functional Requirements

**Password Security:**
- Bcrypt with 12 salt rounds (slow, secure)
- Password requirements: 8+ chars, uppercase, lowercase, numbers
- Temp password format: Word1-Word2-1234 (memorable)
- Validation before hashing

**JWT Tokens:**
- 7-day expiration (604800 seconds)
- HttpOnly cookies (prevent XSS)
- SameSite: strict (CSRF protection)
- Includes: userId, username, role, organizationId
- Validates issuer and audience

**Super User Seed:**
- Auto-create on server startup
- Idempotent (safe to run multiple times)
- Updates password hash if user exists

---

## Implementation

### 1. Install Dependencies

```bash
cd backend
npm install bcryptjs jsonwebtoken cookie-parser
npm install --save-dev @types/bcryptjs @types/jsonwebtoken @types/cookie-parser
```

### 2. Password Utilities

**File:** `backend/src/utils/password.ts`

```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Password complexity requirements
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
};

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a memorable temporary password
 * Format: Word1-Word2-1234
 */
export function generateTempPassword(): string {
  const words = [
    'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
    'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
    'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
    'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray',
    'Yankee', 'Zulu'
  ];

  const word1 = words[Math.floor(Math.random() * words.length)]!;
  const word2 = words[Math.floor(Math.random() * words.length)]!;
  const number = Math.floor(1000 + Math.random() * 9000);

  return `${word1}-${word2}-${number}`;
}

/**
 * Validate password against requirements
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### 3. JWT Utilities

**File:** `backend/src/utils/jwt.ts`

```typescript
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types/auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = '7d'; // 7 days
const JWT_ISSUER = 'clearside';
const JWT_AUDIENCE = 'clearside-api';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: {
  userId: string;
  username: string;
  role: UserRole;
  organizationId: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

/**
 * Verify and decode a JWT token
 * Returns null if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;

    return decoded;
  } catch (error) {
    // Token is invalid, expired, or tampered with
    return null;
  }
}

/**
 * Decode a token without verification (for debugging)
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Get cookie options for JWT
 */
export function getCookieOptions() {
  return {
    httpOnly: true, // Prevent XSS
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict' as const, // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  };
}
```

### 4. Super User Seed Script

**File:** `backend/src/db/seedSuperUser.ts`

```typescript
import { pool } from './index.js';
import { hashPassword } from '../utils/password.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ module: 'seedSuperUser' });

const SUPER_USER = {
  username: 'steven@spennington.dev',
  email: 'steve.d.pennington@gmail.com',
  password: 'StarDust',
  fullName: 'Steven Pennington',
};

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Ensure super user exists in database
 * Idempotent - safe to run multiple times
 * Creates user if not exists, updates password hash if exists
 */
export async function ensureSuperUser(): Promise<void> {
  try {
    // Verify default organization exists
    const orgResult = await pool.query(
      'SELECT id FROM organizations WHERE id = $1',
      [DEFAULT_ORG_ID]
    );

    if (orgResult.rows.length === 0) {
      throw new Error(
        `Default organization ${DEFAULT_ORG_ID} not found. Run migrations first.`
      );
    }

    // Check if super user already exists
    const userResult = await pool.query(
      'SELECT id, password_hash FROM users WHERE username = $1',
      [SUPER_USER.username]
    );

    const passwordHash = await hashPassword(SUPER_USER.password);

    if (userResult.rows.length === 0) {
      // Create super user
      await pool.query(
        `INSERT INTO users (
          organization_id,
          username,
          email,
          password_hash,
          role,
          full_name,
          is_temp_password,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          DEFAULT_ORG_ID,
          SUPER_USER.username,
          SUPER_USER.email,
          passwordHash,
          'super_admin',
          SUPER_USER.fullName,
          false,
          true,
        ]
      );

      logger.info(
        { username: SUPER_USER.username },
        'Super user created successfully'
      );
    } else {
      // Update password hash (in case password changed or was placeholder)
      await pool.query(
        'UPDATE users SET password_hash = $1 WHERE username = $2',
        [passwordHash, SUPER_USER.username]
      );

      logger.info(
        { username: SUPER_USER.username },
        'Super user password hash updated'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to ensure super user exists');
    throw error;
  }
}
```

### 5. Update Server Index

**File:** `backend/src/index.ts` (add after migrations)

```typescript
import { ensureSuperUser } from './db/seedSuperUser.js';

// ... existing code ...

// After running migrations
await runMigrations();

// Ensure super user exists
await ensureSuperUser();

// ... rest of server setup ...
```

### 6. Environment Variables

**File:** `backend/.env.example`

```bash
# Add to existing .env.example
JWT_SECRET=generate_with_openssl_rand_base64_32
```

**Generate JWT_SECRET:**
```bash
openssl rand -base64 32
```

---

## Testing & Verification

### Unit Tests for Password Utilities

**File:** `backend/src/utils/password.test.ts`

```typescript
import {
  hashPassword,
  verifyPassword,
  generateTempPassword,
  validatePassword,
} from './password';

describe('Password Utilities', () => {
  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash).toContain('$2a$'); // bcrypt hash prefix
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2); // Different salts
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'TestPassword123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('WrongPassword', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('generateTempPassword', () => {
    it('should generate password in Word1-Word2-1234 format', () => {
      const tempPassword = generateTempPassword();

      expect(tempPassword).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
    });

    it('should generate unique passwords', () => {
      const passwords = new Set();
      for (let i = 0; i < 100; i++) {
        passwords.add(generateTempPassword());
      }

      expect(passwords.size).toBeGreaterThan(90); // High uniqueness
    });
  });

  describe('validatePassword', () => {
    it('should accept valid password', () => {
      const result = validatePassword('TestPassword123');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('testpassword123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one uppercase letter'
      );
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('TESTPASSWORD123');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one lowercase letter'
      );
    });

    it('should reject password without numbers', () => {
      const result = validatePassword('TestPassword');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one number'
      );
    });

    it('should reject short password', () => {
      const result = validatePassword('Test1');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must be at least 8 characters'
      );
    });
  });
});
```

### Unit Tests for JWT Utilities

**File:** `backend/src/utils/jwt.test.ts`

```typescript
import { generateToken, verifyToken, decodeToken } from './jwt';

describe('JWT Utilities', () => {
  const mockPayload = {
    userId: '123',
    username: 'test@example.com',
    role: 'user' as const,
    organizationId: '456',
  };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(mockPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode valid token', () => {
      const token = generateToken(mockPayload);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(mockPayload.userId);
      expect(decoded!.username).toBe(mockPayload.username);
      expect(decoded!.role).toBe(mockPayload.role);
      expect(decoded!.organizationId).toBe(mockPayload.organizationId);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid.token.here');

      expect(decoded).toBeNull();
    });

    it('should return null for tampered token', () => {
      const token = generateToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      const decoded = verifyToken(tamperedToken);

      expect(decoded).toBeNull();
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const token = generateToken(mockPayload);
      const decoded = decodeToken(token);

      expect(decoded).toBeDefined();
      expect(decoded!.userId).toBe(mockPayload.userId);
    });
  });
});
```

### Manual Testing

```bash
# 1. Set JWT_SECRET
export JWT_SECRET=$(openssl rand -base64 32)

# 2. Run migrations
npm run migrate

# 3. Start server (will auto-create super user)
npm run dev

# 4. Verify super user in database
psql $DATABASE_URL -c "SELECT username, role, is_active FROM users WHERE username = 'steven@spennington.dev';"

# 5. Test password hashing (in Node REPL)
node
> const { hashPassword, verifyPassword } = require('./dist/utils/password.js');
> (async () => {
    const hash = await hashPassword('StarDust');
    console.log('Hash:', hash);
    const valid = await verifyPassword('StarDust', hash);
    console.log('Valid:', valid);
  })();
```

---

## Critical Files

- `backend/src/utils/password.ts` (new)
- `backend/src/utils/jwt.ts` (new)
- `backend/src/db/seedSuperUser.ts` (new)
- `backend/src/index.ts` (modified - add seedSuperUser call)
- `backend/.env.example` (modified - add JWT_SECRET)

---

## Dependencies

- AUTH-001 (Database Schema & Types)
- npm packages: bcryptjs, jsonwebtoken, cookie-parser

---

## Notes

**Design Decisions:**
- 12 salt rounds = ~250ms per hash (secure, not too slow)
- 7-day JWT expiration balances security and UX
- HttpOnly cookies prevent XSS attacks
- Temp passwords are memorable (not random gibberish)
- Password validation is lenient (no special chars required)

**Security Considerations:**
- Never log passwords or hashes
- JWT_SECRET must be strong (32+ bytes)
- Rotate JWT_SECRET if compromised (invalidates all tokens)
- Use HTTPS in production (secure cookies)
- Rate limit login attempts (AUTH-003)

---

**Status:** Ready to implement
**Next Task:** AUTH-003 (Repositories & Middleware)
