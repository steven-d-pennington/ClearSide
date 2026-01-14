/**
 * User Management Routes
 * 
 * Express API routes for user CRUD operations:
 * - List users (org-scoped for org_admin, all for super_admin)
 * - Create user with temp password
 * - Get user by ID
 * - Update user
 * - Delete user (soft delete)
 * - Reset user password
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { UserRepository } from '../db/repositories/user-repository.js';
import { requireAuth, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import type { AuthenticatedRequest, CreateUserInput, UpdateUserInput } from '../types/auth.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ module: 'user-routes' });

/**
 * Create user management routes
 */
export function createUserRoutes(pool: Pool): Router {
    const router = Router();
    const userRepo = new UserRepository(pool);

    /**
     * GET /api/users
     * List users (org-scoped for org_admin, all for super_admin)
     */
    router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
        try {
            let users;

            if (req.user!.role === 'super_admin') {
                // Super admin sees all users
                users = await userRepo.listAll();
            } else {
                // Org admin sees only users in their organization
                users = await userRepo.listByOrganization(req.user!.organizationId);
            }

            const usersPublic = users.map(user => userRepo.userToPublic(user));

            res.json({
                success: true,
                users: usersPublic,
                count: usersPublic.length,
            });
        } catch (error) {
            logger.error({ error }, 'List users error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * POST /api/users
     * Create a new user (admin only)
     * Returns the user and the temp password for admin to share
     */
    router.post('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
        const schema = z.object({
            organizationId: z.string().uuid('Invalid organization ID'),
            username: z.string().min(3, 'Username must be at least 3 characters'),
            email: z.string().email('Invalid email').optional().nullable(),
            role: z.enum(['super_admin', 'org_admin', 'user'], {
                errorMap: () => ({ message: 'Role must be super_admin, org_admin, or user' }),
            }),
            fullName: z.string().optional().nullable(),
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
                    code: 'ORG_MISMATCH',
                });
                return;
            }

            // Only super_admin can create super_admin users
            if (input.role === 'super_admin' && req.user!.role !== 'super_admin') {
                res.status(403).json({
                    success: false,
                    error: 'Only super admins can create super admin users',
                    code: 'FORBIDDEN',
                });
                return;
            }

            // Check if username already exists
            const existingUser = await userRepo.findByUsername(input.username);
            if (existingUser) {
                res.status(409).json({
                    success: false,
                    error: 'Username already exists',
                    code: 'USERNAME_EXISTS',
                });
                return;
            }

            // Create user with temp password
            const { user, tempPassword } = await userRepo.create(input);
            const userPublic = userRepo.userToPublic(user);

            logger.info(
                { createdBy: req.user!.userId, newUserId: user.id, username: user.username },
                'User created successfully'
            );

            res.status(201).json({
                success: true,
                user: userPublic,
                tempPassword, // Admin shares this with the new user
                message: `User created. Share this temporary password with them: ${tempPassword}`,
            });
        } catch (error: unknown) {
            const err = error as { code?: string };
            logger.error({ error }, 'Create user error');

            // PostgreSQL unique constraint violation
            if (err.code === '23505') {
                res.status(409).json({
                    success: false,
                    error: 'Username already exists',
                    code: 'USERNAME_EXISTS',
                });
                return;
            }

            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
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
                    code: 'USER_NOT_FOUND',
                });
                return;
            }

            // Check permissions - users can view themselves, admins can view org members
            const canView =
                req.user!.userId === user.id ||
                req.user!.role === 'super_admin' ||
                (req.user!.role === 'org_admin' && user.organizationId === req.user!.organizationId);

            if (!canView) {
                res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    code: 'FORBIDDEN',
                });
                return;
            }

            const userPublic = userRepo.userToPublic(user);
            res.json({
                success: true,
                user: userPublic,
            });
        } catch (error) {
            logger.error({ error, userId: req.params.id }, 'Get user error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * PUT /api/users/:id
     * Update user fields
     */
    router.put('/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
        const schema = z.object({
            email: z.string().email().optional().nullable(),
            fullName: z.string().optional().nullable(),
            role: z.enum(['super_admin', 'org_admin', 'user']).optional(),
            isActive: z.boolean().optional(),
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

        const input = parseResult.data as UpdateUserInput;

        try {
            const user = await userRepo.findById(req.params.id);

            if (!user) {
                res.status(404).json({
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND',
                });
                return;
            }

            // Check org permissions
            if (
                req.user!.role !== 'super_admin' &&
                user.organizationId !== req.user!.organizationId
            ) {
                res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    code: 'FORBIDDEN',
                });
                return;
            }

            // Only super_admin can change roles to super_admin
            if (input.role === 'super_admin' && req.user!.role !== 'super_admin') {
                res.status(403).json({
                    success: false,
                    error: 'Only super admins can assign super admin role',
                    code: 'FORBIDDEN',
                });
                return;
            }

            // Can't demote yourself
            if (user.id === req.user!.userId && input.role && input.role !== user.role) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot change your own role',
                    code: 'SELF_ROLE_CHANGE',
                });
                return;
            }

            // Can't deactivate yourself
            if (user.id === req.user!.userId && input.isActive === false) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot deactivate your own account',
                    code: 'SELF_DEACTIVATE',
                });
                return;
            }

            const updatedUser = await userRepo.update(req.params.id, input);

            logger.info(
                { updatedBy: req.user!.userId, userId: req.params.id },
                'User updated successfully'
            );

            res.json({
                success: true,
                user: updatedUser ? userRepo.userToPublic(updatedUser) : undefined,
                message: 'User updated successfully',
            });
        } catch (error) {
            logger.error({ error, userId: req.params.id }, 'Update user error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
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
                    code: 'USER_NOT_FOUND',
                });
                return;
            }

            // Check org permissions
            if (
                req.user!.role !== 'super_admin' &&
                user.organizationId !== req.user!.organizationId
            ) {
                res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    code: 'FORBIDDEN',
                });
                return;
            }

            // Prevent self-deletion
            if (user.id === req.user!.userId) {
                res.status(400).json({
                    success: false,
                    error: 'Cannot delete your own account',
                    code: 'SELF_DELETE',
                });
                return;
            }

            await userRepo.delete(req.params.id);

            logger.info(
                { deletedBy: req.user!.userId, userId: req.params.id },
                'User deleted successfully'
            );

            res.json({
                success: true,
                message: 'User deleted successfully',
            });
        } catch (error) {
            logger.error({ error, userId: req.params.id }, 'Delete user error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * POST /api/users/:id/reset-password
     * Reset user password to a new temp password (admin only)
     */
    router.post('/:id/reset-password', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const user = await userRepo.findById(req.params.id);

            if (!user) {
                res.status(404).json({
                    success: false,
                    error: 'User not found',
                    code: 'USER_NOT_FOUND',
                });
                return;
            }

            // Check org permissions
            if (
                req.user!.role !== 'super_admin' &&
                user.organizationId !== req.user!.organizationId
            ) {
                res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    code: 'FORBIDDEN',
                });
                return;
            }

            const tempPassword = await userRepo.resetPassword(req.params.id);

            logger.info(
                { resetBy: req.user!.userId, userId: req.params.id },
                'User password reset successfully'
            );

            res.json({
                success: true,
                tempPassword,
                message: `Password reset. Share this temporary password with the user: ${tempPassword}`,
            });
        } catch (error) {
            logger.error({ error, userId: req.params.id }, 'Reset password error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    return router;
}

export default createUserRoutes;
