/**
 * Authentication and Authorization Types
 * 
 * This module defines all TypeScript interfaces for the ClearSide authentication system,
 * including users, organizations, JWT tokens, and request/response types.
 */

import { Request } from 'express';

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * User role hierarchy:
 * - super_admin: Full system access, can manage all organizations and users
 * - org_admin: Can manage users within their organization
 * - user: Standard user, can view/create content
 */
export type UserRole = 'super_admin' | 'org_admin' | 'user';

/**
 * Default organization UUID - used for initial deployment
 */
export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Security constants
 */
export const AUTH_CONSTANTS = {
  /** Number of bcrypt salt rounds */
  BCRYPT_SALT_ROUNDS: 12,
  /** JWT expiration in days */
  JWT_EXPIRY_DAYS: 7,
  /** Max failed login attempts before lockout */
  MAX_FAILED_ATTEMPTS: 5,
  /** Account lockout duration in minutes */
  LOCKOUT_DURATION_MINUTES: 15,
  /** Rate limit: attempts per window */
  RATE_LIMIT_ATTEMPTS: 5,
  /** Rate limit window in minutes */
  RATE_LIMIT_WINDOW_MINUTES: 15,
} as const;

// ============================================================================
// DATABASE ENTITIES
// ============================================================================

/**
 * Organization entity
 * Represents a tenant in the multi-tenant architecture
 */
export interface Organization {
  id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User entity (full database record)
 * Contains all fields including sensitive data like password hash
 */
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
 * User data safe to send to client (excludes sensitive fields)
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

// ============================================================================
// DATABASE ROW TYPES (snake_case from PostgreSQL)
// ============================================================================

/**
 * Raw database row for organizations table
 */
export interface OrganizationRow {
  id: string;
  name: string;
  description: string | null;
  settings: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Raw database row for users table
 */
export interface UserRow {
  id: string;
  organization_id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: UserRole;
  full_name: string | null;
  is_temp_password: boolean;
  password_changed_at: Date | null;
  last_login_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// JWT TYPES
// ============================================================================

/**
 * JWT payload structure
 * Claims stored in the authentication token
 */
export interface JwtPayload {
  /** User ID (subject claim) */
  userId: string;
  /** Username for display/identification */
  username: string;
  /** User's role for authorization */
  role: UserRole;
  /** Organization ID for multi-tenant scoping */
  organizationId: string;
  /** Issued at timestamp (seconds since epoch) */
  iat: number;
  /** Expiration timestamp (seconds since epoch) */
  exp: number;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Login request body
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  success: boolean;
  user?: UserPublic;
  requiresPasswordChange?: boolean;
  error?: string;
}

/**
 * Password change request body
 */
export interface ChangePasswordRequest {
  /** Current password (optional for temp password flow) */
  currentPassword?: string;
  /** New password */
  newPassword: string;
  /** Confirm new password (must match newPassword) */
  confirmPassword: string;
}

/**
 * Password change response
 */
export interface ChangePasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * User profile response (current user info)
 */
export interface ProfileResponse {
  user: UserPublic;
  organization: Organization;
}

// ============================================================================
// USER MANAGEMENT TYPES
// ============================================================================

/**
 * Create user input (admin creating a new user)
 */
export interface CreateUserInput {
  organizationId: string;
  username: string;
  email?: string;
  role: UserRole;
  fullName?: string;
}

/**
 * Create user response (includes temp password for admin to share)
 */
export interface CreateUserResponse {
  success: boolean;
  user?: UserPublic;
  tempPassword?: string;
  error?: string;
}

/**
 * Update user input (admin updating an existing user)
 */
export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

/**
 * Reset password response (admin resetting a user's password)
 */
export interface ResetPasswordResponse {
  success: boolean;
  tempPassword?: string;
  error?: string;
}

/**
 * User list query parameters
 */
export interface UserListParams {
  organizationId?: string;
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// ORGANIZATION MANAGEMENT TYPES
// ============================================================================

/**
 * Create organization input
 */
export interface CreateOrganizationInput {
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
}

/**
 * Update organization input
 */
export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  isActive?: boolean;
}

// ============================================================================
// EXPRESS EXTENSIONS
// ============================================================================

/**
 * Express request with authenticated user attached
 * Used after auth middleware has validated the JWT
 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Convert User to UserPublic (strip sensitive fields)
 */
export function toUserPublic(user: User): UserPublic {
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
 * Convert OrganizationRow to Organization (snake_case to camelCase)
 */
export function mapOrganizationRow(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    settings: (row.settings as Record<string, unknown>) || {},
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert UserRow to User (snake_case to camelCase)
 */
export function mapUserRow(row: UserRow): User {
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
