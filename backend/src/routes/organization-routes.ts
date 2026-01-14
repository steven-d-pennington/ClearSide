/**
 * Organization Management Routes
 * 
 * Express API routes for organization CRUD operations:
 * - List organizations (super_admin only)
 * - Create organization (super_admin only)
 * - Get organization by ID
 * - Update organization (super_admin only)
 * - Delete organization (super_admin only)
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { OrganizationRepository } from '../db/repositories/organization-repository.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/auth.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ module: 'organization-routes' });

/**
 * Create organization management routes
 */
export function createOrganizationRoutes(pool: Pool): Router {
    const router = Router();
    const orgRepo = new OrganizationRepository(pool);

    /**
     * GET /api/organizations
     * List all organizations (super_admin only)
     */
    router.get('/', requireAuth, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
        try {
            const organizations = await orgRepo.listAll();

            // Get user counts for each organization
            const orgsWithCounts = await Promise.all(
                organizations.map(async (org) => ({
                    ...org,
                    userCount: await orgRepo.countUsers(org.id),
                }))
            );

            res.json({
                success: true,
                organizations: orgsWithCounts,
                count: orgsWithCounts.length,
            });
        } catch (error) {
            logger.error({ error }, 'List organizations error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * POST /api/organizations
     * Create a new organization (super_admin only)
     */
    router.post('/', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
        const schema = z.object({
            name: z.string().min(1, 'Organization name is required'),
            description: z.string().optional().nullable(),
            settings: z.record(z.unknown()).optional(),
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

        try {
            // Check if name is available
            const isAvailable = await orgRepo.isNameAvailable(parseResult.data.name);
            if (!isAvailable) {
                res.status(409).json({
                    success: false,
                    error: 'Organization name already exists',
                    code: 'NAME_EXISTS',
                });
                return;
            }

            const createInput = {
                ...parseResult.data,
                description: parseResult.data.description ?? undefined,
            };
            const organization = await orgRepo.create(createInput);

            logger.info(
                { createdBy: req.user!.userId, orgId: organization.id, name: organization.name },
                'Organization created successfully'
            );

            res.status(201).json({
                success: true,
                organization,
            });
        } catch (error: unknown) {
            const err = error as { code?: string };
            logger.error({ error }, 'Create organization error');

            if (err.code === '23505') {
                res.status(409).json({
                    success: false,
                    error: 'Organization name already exists',
                    code: 'NAME_EXISTS',
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
     * GET /api/organizations/:id
     * Get organization by ID
     * Super admin can view any org; others can only view their own
     */
    router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.params.id;
        if (!orgId) {
            res.status(400).json({
                success: false,
                error: 'Organization ID is required',
                code: 'INVALID_REQUEST',
            });
            return;
        }

        try {
            const organization = await orgRepo.findById(orgId);

            if (!organization) {
                res.status(404).json({
                    success: false,
                    error: 'Organization not found',
                    code: 'ORG_NOT_FOUND',
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
                    code: 'FORBIDDEN',
                });
                return;
            }

            // Include user count for admins
            const userCount =
                req.user!.role === 'super_admin' || req.user!.role === 'org_admin'
                    ? await orgRepo.countUsers(organization.id)
                    : undefined;

            res.json({
                success: true,
                organization: {
                    ...organization,
                    ...(userCount !== undefined && { userCount }),
                },
            });
        } catch (error) {
            logger.error({ error, orgId }, 'Get organization error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * PUT /api/organizations/:id
     * Update organization (super_admin only)
     */
    router.put('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.params.id;
        if (!orgId) {
            res.status(400).json({
                success: false,
                error: 'Organization ID is required',
                code: 'INVALID_REQUEST',
            });
            return;
        }

        const schema = z.object({
            name: z.string().min(1).optional(),
            description: z.string().optional().nullable(),
            settings: z.record(z.unknown()).optional(),
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

        try {
            const organization = await orgRepo.findById(orgId);

            if (!organization) {
                res.status(404).json({
                    success: false,
                    error: 'Organization not found',
                    code: 'ORG_NOT_FOUND',
                });
                return;
            }

            // Check if name is available (if changing name)
            if (parseResult.data.name && parseResult.data.name !== organization.name) {
                const isAvailable = await orgRepo.isNameAvailable(parseResult.data.name, organization.id);
                if (!isAvailable) {
                    res.status(409).json({
                        success: false,
                        error: 'Organization name already exists',
                        code: 'NAME_EXISTS',
                    });
                    return;
                }
            }

            const updateInput = {
                ...parseResult.data,
                description: parseResult.data.description ?? undefined,
            };
            const updatedOrg = await orgRepo.update(orgId, updateInput);

            logger.info(
                { updatedBy: req.user!.userId, orgId },
                'Organization updated successfully'
            );

            res.json({
                success: true,
                organization: updatedOrg,
                message: 'Organization updated successfully',
            });
        } catch (error) {
            logger.error({ error, orgId }, 'Update organization error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    /**
     * DELETE /api/organizations/:id
     * Soft delete organization (super_admin only)
     * Will fail if organization has active users
     */
    router.delete('/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
        const orgId = req.params.id;
        if (!orgId) {
            res.status(400).json({
                success: false,
                error: 'Organization ID is required',
                code: 'INVALID_REQUEST',
            });
            return;
        }

        try {
            const organization = await orgRepo.findById(orgId);

            if (!organization) {
                res.status(404).json({
                    success: false,
                    error: 'Organization not found',
                    code: 'ORG_NOT_FOUND',
                });
                return;
            }

            // Prevent deleting the default organization
            if (organization.id === '00000000-0000-0000-0000-000000000000') {
                res.status(400).json({
                    success: false,
                    error: 'Cannot delete the default organization',
                    code: 'CANNOT_DELETE_DEFAULT',
                });
                return;
            }

            // Attempt deletion (will fail if org has active users)
            const result = await orgRepo.delete(orgId);

            if (!result.success) {
                res.status(400).json({
                    success: false,
                    error: result.error,
                    code: 'DELETE_FAILED',
                });
                return;
            }

            logger.info(
                { deletedBy: req.user!.userId, orgId },
                'Organization deleted successfully'
            );

            res.json({
                success: true,
                message: 'Organization deleted successfully',
            });
        } catch (error) {
            logger.error({ error, orgId }, 'Delete organization error');
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                code: 'INTERNAL_ERROR',
            });
        }
    });

    return router;
}

export default createOrganizationRoutes;
