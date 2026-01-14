/**
 * Super User Seed Script
 * 
 * Ensures the super admin user exists in the database on server startup.
 * This script is idempotent - safe to run multiple times.
 */

import { pool } from './connection.js';
import { hashPassword } from '../utils/password.js';
import { createLogger } from '../utils/logger.js';
import { DEFAULT_ORGANIZATION_ID } from '../types/auth.js';

const logger = createLogger({ module: 'seedSuperUser' });

/**
 * Super user credentials
 * These are the default credentials for the system administrator.
 */
const SUPER_USER = {
    username: 'steven@spennington.dev',
    email: 'steve.d.pennington@gmail.com',
    password: 'StarDust',
    fullName: 'Steven Pennington',
} as const;

/**
 * Ensure super user exists in database
 * 
 * This function:
 * 1. Verifies the default organization exists
 * 2. Creates the super user if they don't exist
 * 3. Updates the password hash if the user already exists
 *    (ensures the password hash is correct even if migration had placeholder)
 * 
 * @throws Error if default organization doesn't exist (migrations not run)
 */
export async function ensureSuperUser(): Promise<void> {
    try {
        // Verify default organization exists (from migration 025)
        const orgResult = await pool.query(
            'SELECT id FROM organizations WHERE id = $1',
            [DEFAULT_ORGANIZATION_ID]
        );

        if (orgResult.rows.length === 0) {
            throw new Error(
                `Default organization ${DEFAULT_ORGANIZATION_ID} not found. ` +
                'Run database migrations first with: npm run db:migrate'
            );
        }

        // Check if super user already exists
        const userResult = await pool.query(
            'SELECT id, password_hash FROM users WHERE username = $1',
            [SUPER_USER.username]
        );

        // Hash the password
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
                    DEFAULT_ORGANIZATION_ID,
                    SUPER_USER.username,
                    SUPER_USER.email,
                    passwordHash,
                    'super_admin',
                    SUPER_USER.fullName,
                    false, // Not a temp password
                    true,  // Active
                ]
            );

            logger.info(
                { username: SUPER_USER.username },
                'Super user created successfully'
            );
        } else {
            // Update password hash in case:
            // 1. Migration had placeholder hash
            // 2. Password was changed in config
            // 3. Bcrypt algorithm was updated
            await pool.query(
                'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE username = $2',
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

/**
 * Check if super user exists (for status checking without modification)
 */
export async function superUserExists(): Promise<boolean> {
    try {
        const result = await pool.query(
            'SELECT id FROM users WHERE username = $1 AND is_active = true',
            [SUPER_USER.username]
        );
        return result.rows.length > 0;
    } catch (error) {
        logger.error({ error }, 'Failed to check super user existence');
        return false;
    }
}
