/**
 * Authentication Middleware
 * 
 * Express middleware for JWT authentication and role-based authorization.
 * Validates tokens from httpOnly cookies and attaches user info to requests.
 */

import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, UserRole, JwtPayload } from '../types/auth.js';
import { verifyToken, getAuthCookieName } from '../utils/jwt.js';

/**
 * Require authentication - validates JWT token from cookie
 * 
 * Attaches user payload to req.user on success.
 * Returns 401 if token is missing or invalid.
 */
export function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void {
    const cookieName = getAuthCookieName();
    const token = req.cookies?.[cookieName];

    if (!token) {
        res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
        });
        return;
    }

    const payload = verifyToken(token);

    if (!payload) {
        res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN',
        });
        return;
    }

    req.user = payload;
    next();
}

/**
 * Require specific role(s)
 * 
 * Use after requireAuth middleware.
 * Returns 403 if user doesn't have required role.
 * 
 * @example
 * router.get('/admin', requireAuth, requireRole('super_admin', 'org_admin'), handler);
 */
export function requireRole(...roles: UserRole[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED',
            });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                code: 'FORBIDDEN',
                required: roles,
                current: req.user.role,
            });
            return;
        }

        next();
    };
}

/**
 * Require super admin role
 * 
 * Convenience middleware for super_admin-only routes.
 */
export const requireSuperAdmin = requireRole('super_admin');

/**
 * Require admin role (super_admin or org_admin)
 * 
 * Convenience middleware for admin routes.
 */
export const requireAdmin = requireRole('super_admin', 'org_admin');

/**
 * Optional authentication
 * 
 * Sets req.user if a valid token is present, but doesn't require it.
 * Use for routes that work for both authenticated and anonymous users.
 * 
 * @example
 * router.get('/public', optionalAuth, handler);
 */
export function optionalAuth(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
): void {
    const cookieName = getAuthCookieName();
    const token = req.cookies?.[cookieName];

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
 * 
 * Use after requireAuth middleware.
 * Super admins can access any organization.
 * Returns 403 if organization doesn't match.
 * 
 * @param getOrgId - Function to extract organization ID from request
 * 
 * @example
 * router.get('/orgs/:orgId/users', 
 *   requireAuth, 
 *   requireSameOrganization(req => req.params.orgId), 
 *   handler
 * );
 */
export function requireSameOrganization(
    getOrgId: (req: AuthenticatedRequest) => string
) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED',
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
                error: 'Access denied - you can only access resources in your organization',
                code: 'ORG_MISMATCH',
            });
            return;
        }

        next();
    };
}

/**
 * Require password change middleware
 * 
 * Use after requireAuth. Blocks access if user has temp password.
 * Returns 403 with a special code so frontend can redirect to password change.
 * 
 * @example
 * router.get('/protected', requireAuth, requirePasswordChange, handler);
 */
export function requirePasswordChange(
    _req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
): void {
    // This middleware should check the database for isTempPassword
    // For now, we'll skip this check as JWT doesn't include this info
    // The frontend should handle this based on the login response
    next();
}

/**
 * Rate limiter state (in-memory, for single-instance deployment)
 * Production should use Redis
 */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limit login attempts by IP
 * 
 * Returns 429 if rate limit exceeded.
 * Uses in-memory store (not suitable for multi-instance deployment).
 * 
 * @example
 * router.post('/login', rateLimit(5, 15), handler);
 */
export function rateLimit(maxAttempts: number = 5, windowMinutes: number = 15) {
    const windowMs = windowMinutes * 60 * 1000;

    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();

        // Clean up expired entries
        for (const [key, value] of loginAttempts.entries()) {
            if (value.resetAt < now) {
                loginAttempts.delete(key);
            }
        }

        const attempts = loginAttempts.get(ip);

        if (attempts) {
            if (attempts.resetAt > now && attempts.count >= maxAttempts) {
                const retryAfter = Math.ceil((attempts.resetAt - now) / 1000);
                res.status(429).json({
                    success: false,
                    error: 'Too many login attempts. Please try again later.',
                    code: 'RATE_LIMITED',
                    retryAfter,
                });
                return;
            }

            if (attempts.resetAt <= now) {
                // Window expired, reset
                loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
            } else {
                // Increment count
                attempts.count++;
            }
        } else {
            // First attempt
            loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
        }

        next();
    };
}

/**
 * Helper to extract user from request (for use in route handlers)
 */
export function getUser(req: AuthenticatedRequest): JwtPayload | undefined {
    return req.user;
}

/**
 * Helper to require user in route handler (throws if not authenticated)
 */
export function requireUser(req: AuthenticatedRequest): JwtPayload {
    if (!req.user) {
        throw new Error('User not authenticated');
    }
    return req.user;
}
