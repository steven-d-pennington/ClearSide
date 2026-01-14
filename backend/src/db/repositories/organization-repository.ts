/**
 * Organization Repository
 * 
 * Database operations for multi-tenant organization management.
 */

import { Pool } from 'pg';
import type {
    Organization,
    OrganizationRow,
    CreateOrganizationInput,
    UpdateOrganizationInput,
} from '../../types/auth.js';
import { mapOrganizationRow } from '../../types/auth.js';

export class OrganizationRepository {
    constructor(private pool: Pool) { }

    /**
     * Find organization by ID
     */
    async findById(id: string): Promise<Organization | null> {
        const result = await this.pool.query<OrganizationRow>(
            'SELECT * FROM organizations WHERE id = $1',
            [id]
        );
        return result.rows[0] ? mapOrganizationRow(result.rows[0]) : null;
    }

    /**
     * Find organization by name
     */
    async findByName(name: string): Promise<Organization | null> {
        const result = await this.pool.query<OrganizationRow>(
            'SELECT * FROM organizations WHERE name = $1',
            [name]
        );
        return result.rows[0] ? mapOrganizationRow(result.rows[0]) : null;
    }

    /**
     * List all organizations
     */
    async listAll(options?: { includeInactive?: boolean }): Promise<Organization[]> {
        const includeInactive = options?.includeInactive ?? false;
        const whereClause = includeInactive ? '' : 'WHERE is_active = true';

        const result = await this.pool.query<OrganizationRow>(
            `SELECT * FROM organizations ${whereClause} ORDER BY name ASC`
        );
        return result.rows.map(mapOrganizationRow);
    }

    /**
     * Create a new organization
     */
    async create(input: CreateOrganizationInput): Promise<Organization> {
        const result = await this.pool.query<OrganizationRow>(
            `INSERT INTO organizations (name, description, settings, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
            [
                input.name,
                input.description || null,
                JSON.stringify(input.settings || {}),
            ]
        );
        return mapOrganizationRow(result.rows[0]!);
    }

    /**
     * Update organization fields
     */
    async update(id: string, input: UpdateOrganizationInput): Promise<Organization | null> {
        const fields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (input.name !== undefined) {
            fields.push(`name = $${paramIndex++}`);
            values.push(input.name);
        }
        if (input.description !== undefined) {
            fields.push(`description = $${paramIndex++}`);
            values.push(input.description);
        }
        if (input.settings !== undefined) {
            fields.push(`settings = $${paramIndex++}`);
            values.push(JSON.stringify(input.settings));
        }
        if (input.isActive !== undefined) {
            fields.push(`is_active = $${paramIndex++}`);
            values.push(input.isActive);
        }

        if (fields.length === 0) {
            return this.findById(id);
        }

        values.push(id);
        const result = await this.pool.query<OrganizationRow>(
            `UPDATE organizations 
       SET ${fields.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramIndex}
       RETURNING *`,
            values
        );

        return result.rows[0] ? mapOrganizationRow(result.rows[0]) : null;
    }

    /**
     * Delete organization (soft delete by setting is_active = false)
     * Note: Cannot delete if organization has active users
     */
    async delete(id: string): Promise<{ success: boolean; error?: string }> {
        // Check for active users
        const userCount = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM users 
       WHERE organization_id = $1 AND is_active = true`,
            [id]
        );

        if (parseInt(userCount.rows[0]?.count ?? '0', 10) > 0) {
            return {
                success: false,
                error: 'Cannot delete organization with active users',
            };
        }

        await this.pool.query(
            `UPDATE organizations 
       SET is_active = false, updated_at = NOW() 
       WHERE id = $1`,
            [id]
        );

        return { success: true };
    }

    /**
     * Count users in organization
     */
    async countUsers(id: string, options?: { includeInactive?: boolean }): Promise<number> {
        const includeInactive = options?.includeInactive ?? false;
        const activeClause = includeInactive ? '' : 'AND is_active = true';

        const result = await this.pool.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM users 
       WHERE organization_id = $1 ${activeClause}`,
            [id]
        );

        return parseInt(result.rows[0]?.count ?? '0', 10);
    }

    /**
     * Check if organization name is available
     */
    async isNameAvailable(name: string, excludeId?: string): Promise<boolean> {
        const result = await this.pool.query<{ exists: boolean }>(
            `SELECT EXISTS(
        SELECT 1 FROM organizations 
        WHERE LOWER(name) = LOWER($1) 
        ${excludeId ? 'AND id != $2' : ''}
      ) as exists`,
            excludeId ? [name, excludeId] : [name]
        );

        return !(result.rows[0]?.exists ?? false);
    }
}

/**
 * Factory function to create an OrganizationRepository instance
 */
export function createOrganizationRepository(pool: Pool): OrganizationRepository {
    return new OrganizationRepository(pool);
}

export default OrganizationRepository;
