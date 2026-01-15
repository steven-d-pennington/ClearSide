/**
 * Authentication Routes
 * 
 * Express API routes for user authentication:
 * - Login with username/password
 * - Logout (clear JWT cookie)
 * - Get current user info
 * - Change password
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { UserRepository } from '../db/repositories/user-repository.js';
import { OrganizationRepository } from '../db/repositories/organization-repository.js';
import { verifyPassword, validatePassword, getPasswordRequirementsMessage } from '../utils/password.js';
import { generateToken, getCookieOptions, getAuthCookieName } from '../utils/jwt.js';
import { requireAuth, rateLimit } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/auth.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ module: 'auth-routes' });

/**
 * Create authentication routes
 */
export function createAuthRoutes(pool: Pool): Router {
    const router = Router();
    const userRepo = new UserRepository(pool);
    const orgRepo = new OrganizationRepository(pool);

    // Rate limiter for login attempts (5 attempts per 15 minutes per IP)
    const loginRateLimiter = rateLimit(5, 15);

    /**
     * POST /api/auth/login
     * Authenticate user with username and password
     */
    router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
        const schema = z.object({
            username: z.string().min(1, 'Username is required'),
            password: z.string().min(1, 'Password is required'),
        });

        const parseResult = schema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                success: false,
                error: 'Invalid request',
                code: 'VALIDATION_ERROR',
                details: parseResult.error.errors,
            });
            return;
        }

        const { username, password } = parseResult.data;

        try {
            // Find user by username
            const user = await userRepo.findByUsername(username);

            if (!user) {
                logger.debug({ username }, 'Login failed - user not found');
                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS',
                });
                return;
            }

            // Check if account is locked
            if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
                const remainingMinutes = Math.ceil(
                    (new Date(user.lockedUntil).getTime() - Date.now()) / 60000
                );
                logger.debug({ username, remainingMinutes }, 'Login failed - account locked');
                res.status(403).json({
                    success: false,
                    error: `Account locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).`,
                    code: 'ACCOUNT_LOCKED',
                    retryAfter: remainingMinutes * 60,
                });
                return;
            }

            // Check if user is active
            if (!user.isActive) {
                logger.debug({ username }, 'Login failed - account inactive');
                res.status(403).json({
                    success: false,
                    error: 'Account is inactive. Contact your administrator.',
                    code: 'ACCOUNT_INACTIVE',
                });
                return;
            }

            // Verify password
            const isValid = await verifyPassword(password, user.passwordHash);

            if (!isValid) {
                // Record failed login attempt
                await userRepo.recordFailedLogin(user.id);

                const attemptsRemaining = 5 - (user.failedLoginAttempts + 1);
                logger.debug({ username, attemptsRemaining }, 'Login failed - invalid password');

                res.status(401).json({
                    success: false,
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS',
                    ...(attemptsRemaining <= 2 && attemptsRemaining > 0 && {
                        warning: `${attemptsRemaining} attempt(s) remaining before account lockout`,
                    }),
                });
                return;
            }

            // Successful login - record it
            await userRepo.recordSuccessfulLogin(user.id);

            // Generate JWT token
            const token = generateToken({
                userId: user.id,
                username: user.username,
                role: user.role,
                organizationId: user.organizationId,
            });

            // Set httpOnly cookie
            const cookieName = getAuthCookieName();
            res.cookie(cookieName, token, getCookieOptions());

            // Get user's organization
            const organization = await orgRepo.findById(user.organizationId);

            logger.info({ username, role: user.role }, 'User logged in successfully');

            res.json({
                success: true,
                user: userRepo.userToPublic(user),
                organization: organization || undefined,
                requiresPasswordChange: user.isTempPassword,
            });
        } catch (error) {
            logger.error({ error, username }, 'Login error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * POST /api/auth/logout
     * Clear authentication cookie
     */
    router.post('/logout', (_req: Request, res: Response) => {
        const cookieName = getAuthCookieName();

        res.clearCookie(cookieName, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
        });

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    });

    /**
     * GET /api/auth/me
     * Get current authenticated user and their organization
     */
    router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const user = await userRepo.findById(req.user!.userId);

            if (!user) {
                res.status(404).json({
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND',
                });
                return;
            }

            const organization = await orgRepo.findById(user.organizationId);

            res.json({
                success: true,
                user: userRepo.userToPublic(user),
                organization: organization || undefined,
            });
        } catch (error) {
            logger.error({ error, userId: req.user?.userId }, 'Get current user error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * POST /api/auth/change-password
     * Change password (for temp password flow or regular password change)
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
                    code: 'VALIDATION_ERROR',
                    details: parseResult.error.errors,
                });
                return;
            }

            const { currentPassword, newPassword, confirmPassword } = parseResult.data;

            // Check passwords match
            if (newPassword !== confirmPassword) {
                res.status(400).json({
                    success: false,
                    error: 'Passwords do not match',
                    code: 'PASSWORD_MISMATCH',
                });
                return;
            }

            // Validate new password complexity
            const validation = validatePassword(newPassword);
            if (!validation.valid) {
                res.status(400).json({
                    success: false,
                    error: 'Password does not meet requirements',
                    code: 'WEAK_PASSWORD',
                    details: validation.errors,
                    requirements: getPasswordRequirementsMessage(),
                });
                return;
            }

            try {
                const user = await userRepo.findById(req.user!.userId);

                if (!user) {
                    res.status(404).json({
                        success: false,
                        error: 'User not found',
                        code: 'USER_NOT_FOUND',
                    });
                    return;
                }

                // If not temp password, require current password verification
                if (!user.isTempPassword) {
                    if (!currentPassword) {
                        res.status(400).json({
                            success: false,
                            error: 'Current password is required',
                            code: 'CURRENT_PASSWORD_REQUIRED',
                        });
                        return;
                    }

                    const isValid = await verifyPassword(currentPassword, user.passwordHash);
                    if (!isValid) {
                        res.status(401).json({
                            success: false,
                            error: 'Current password is incorrect',
                            code: 'INVALID_CURRENT_PASSWORD',
                        });
                        return;
                    }
                }

                // Update password
                await userRepo.updatePassword(user.id, newPassword);

                logger.info({ userId: user.id, username: user.username }, 'Password changed successfully');

                res.json({
                    success: true,
                    message: 'Password changed successfully',
                });
            } catch (error) {
                logger.error({ error, userId: req.user?.userId }, 'Change password error');
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR',
                });
            }
        }
    );

    return router;
}

export default createAuthRoutes;
