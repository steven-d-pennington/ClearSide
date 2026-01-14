/**
 * User Repository
 * 
 * Database operations for user management including authentication,
 * password management, and account lockout handling.
 */

import { Pool } from 'pg';
import type {
    User,
    UserPublic,
    UserRow,
    UserRole,
    CreateUserInput,
    UpdateUserInput,
} from '../../types/auth.js';
import { hashPassword, generateTempPassword } from '../../utils/password.js';
import { mapUserRow, toUserPublic } from '../../types/auth.js';
import { AUTH_CONSTANTS } from '../../types/auth.js';

export class UserRepository {
    constructor(private pool: Pool) { }

    /**
     * Find user by username (for login)
     */
    async findByUsername(username: string): Promise<User | null> {
        const result = await this.pool.query<UserRow>(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    }

    /**
     * Find user by ID
     */
    async findById(id: string): Promise<User | null> {
        const result = await this.pool.query<UserRow>(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    }

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<User | null> {
        const result = await this.pool.query<UserRow>(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    }

    /**
     * List users by organization
     */
    async listByOrganization(
        organizationId: string,
        options?: { includeInactive?: boolean }
    ): Promise<User[]> {
        const includeInactive = options?.includeInactive ?? false;
        const activeClause = includeInactive ? '' : 'AND is_active = true';

        const result = await this.pool.query<UserRow>(
            `SELECT * FROM users 
       WHERE organization_id = $1 ${activeClause}
       ORDER BY created_at DESC`,
            [organizationId]
        );
        return result.rows.map(mapUserRow);
    }

    /**
     * List all users (super admin only)
     */
    async listAll(options?: { includeInactive?: boolean }): Promise<User[]> {
        const includeInactive = options?.includeInactive ?? false;
        const whereClause = includeInactive ? '' : 'WHERE is_active = true';

        const result = await this.pool.query<UserRow>(
            `SELECT * FROM users ${whereClause} ORDER BY created_at DESC`
        );
        return result.rows.map(mapUserRow);
    }

    /**
     * Count users by role within an organization
     */
    async countByRole(organizationId: string): Promise<Record<UserRole, number>> {
        const result = await this.pool.query<{ role: UserRole; count: string }>(
            `SELECT role, COUNT(*) as count 
       FROM users 
       WHERE organization_id = $1 AND is_active = true
       GROUP BY role`,
            [organizationId]
        );

        const counts: Record<UserRole, number> = {
            super_admin: 0,
            org_admin: 0,
            user: 0,
        };

        for (const row of result.rows) {
            counts[row.role] = parseInt(row.count, 10);
        }

        return counts;
    }

    /**
     * Create a new user with temporary password
     * Returns the user and the temp password (for admin to share with user)
     */
    async create(input: CreateUserInput): Promise<{ user: User; tempPassword: string }> {
        const tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);

        const result = await this.pool.query<UserRow>(
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
            user: mapUserRow(result.rows[0]!),
            tempPassword,
        };
    }

    /**
     * Update user fields (admin operation)
     */
    async update(id: string, input: UpdateUserInput): Promise<User | null> {
        const fields: string[] = [];
        const values: unknown[] = [];
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

        if (fields.length === 0) {
            return this.findById(id);
        }

        values.push(id);
        const result = await this.pool.query<UserRow>(
            `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramIndex} 
       RETURNING *`,
            values
        );

        return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    }

    /**
     * Update user password
     * Clears temp password flag and updates password_changed_at
     */
    async updatePassword(id: string, newPassword: string): Promise<void> {
        const passwordHash = await hashPassword(newPassword);

        await this.pool.query(
            `UPDATE users
       SET password_hash = $1,
           is_temp_password = false,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
            [passwordHash, id]
        );
    }

    /**
     * Reset password to a new temp password (admin operation)
     * Returns the new temp password
     */
    async resetPassword(id: string): Promise<string> {
        const tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);

        await this.pool.query(
            `UPDATE users
       SET password_hash = $1,
           is_temp_password = true,
           password_changed_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
            [passwordHash, id]
        );

        return tempPassword;
    }

    /**
     * Record successful login
     */
    async recordSuccessfulLogin(id: string): Promise<void> {
        await this.pool.query(
            `UPDATE users 
       SET last_login_at = NOW(),
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
            [id]
        );
    }

    /**
     * Increment failed login attempts
     * Locks account for 15 minutes after 5 consecutive failures
     */
    async recordFailedLogin(id: string): Promise<void> {
        const lockoutMinutes = AUTH_CONSTANTS.LOCKOUT_DURATION_MINUTES;
        const maxAttempts = AUTH_CONSTANTS.MAX_FAILED_ATTEMPTS;

        await this.pool.query(
            `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= $2
             THEN NOW() + INTERVAL '${lockoutMinutes} minutes'
             ELSE locked_until
           END,
           updated_at = NOW()
       WHERE id = $1`,
            [id, maxAttempts]
        );
    }

    /**
     * Check if user account is currently locked
     */
    async isLocked(id: string): Promise<boolean> {
        const result = await this.pool.query<{ is_locked: boolean }>(
            `SELECT locked_until > NOW() as is_locked FROM users WHERE id = $1`,
            [id]
        );
        return result.rows[0]?.is_locked ?? false;
    }

    /**
     * Delete user (soft delete by setting is_active = false)
     */
    async delete(id: string): Promise<void> {
        await this.pool.query(
            `UPDATE users 
       SET is_active = false, updated_at = NOW() 
       WHERE id = $1`,
            [id]
        );
    }

    /**
     * Hard delete user (for testing only)
     */
    async hardDelete(id: string): Promise<void> {
        await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    }

    /**
     * Convert User to UserPublic (strips sensitive fields like password hash)
     */
    userToPublic(user: User): UserPublic {
        return toUserPublic(user);
    }
}

/**
 * Factory function to create a UserRepository instance
 */
export function createUserRepository(pool: Pool): UserRepository {
    return new UserRepository(pool);
}

export default UserRepository;
