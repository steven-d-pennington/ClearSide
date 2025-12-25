/**
 * Programmatic migration runner for use during server startup
 * This allows migrations to run automatically when the server starts
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './connection.js';

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if a migration has already been applied
 */
async function isMigrationApplied(version: string): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    // If schema_migrations table doesn't exist yet, no migrations have been applied
    if (error instanceof Error && error.message.includes('does not exist')) {
      return false;
    }
    throw error;
  }
}

/**
 * Get list of migration files in order
 */
function getMigrationFiles(): string[] {
  const migrationsDir = join(__dirname, 'migrations');
  try {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    return files;
  } catch {
    console.warn('⚠️  No migrations directory found');
    return [];
  }
}

/**
 * Execute a single migration file
 */
async function executeMigration(filename: string): Promise<boolean> {
  const version = filename.replace('.sql', '');

  // Check if already applied
  const applied = await isMigrationApplied(version);
  if (applied) {
    console.log(`⏭️  Migration ${version} already applied, skipping`);
    return false;
  }

  console.log(`▶️  Running migration: ${version}`);

  // Read the SQL file
  const migrationPath = join(__dirname, 'migrations', filename);
  const sql = readFileSync(migrationPath, 'utf-8');

  // Execute the migration
  await pool.query(sql);
  console.log(`✅ Migration ${version} completed successfully`);
  return true;
}

/**
 * Run all pending migrations
 * Safe to call multiple times - only runs pending migrations
 *
 * @returns Object with migration results
 */
export async function runMigrationsOnStartup(): Promise<{
  success: boolean;
  applied: string[];
  skipped: string[];
  error?: string;
}> {
  const applied: string[] = [];
  const skipped: string[] = [];

  console.log('\n🚀 Checking database migrations...');

  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not set - skipping migrations');
    console.log('ℹ️  Set DATABASE_URL environment variable to enable database features');
    return { success: true, applied, skipped };
  }

  try {
    // Test database connection first
    console.log('📡 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();

    // Get and run migrations
    const migrations = getMigrationFiles();
    console.log(`📂 Found ${migrations.length} migration file(s)`);

    if (migrations.length === 0) {
      console.log('ℹ️  No migration files found');
      return { success: true, applied, skipped };
    }

    for (const migration of migrations) {
      const wasApplied = await executeMigration(migration);
      const version = migration.replace('.sql', '');
      if (wasApplied) {
        applied.push(version);
      } else {
        skipped.push(version);
      }
    }

    if (applied.length > 0) {
      console.log(`\n🎉 Applied ${applied.length} migration(s)`);
    } else {
      console.log('\n✅ Database schema is up to date');
    }

    return { success: true, applied, skipped };
  } catch (error) {
    // Capture full error details
    let errorMessage = 'Unknown error';
    let errorDetails = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
      // Check for common PostgreSQL errors
      const pgError = error as Error & { code?: string; detail?: string };
      if (pgError.code) {
        errorDetails += `\nPostgreSQL Error Code: ${pgError.code}`;
      }
      if (pgError.detail) {
        errorDetails += `\nDetails: ${pgError.detail}`;
      }
    } else {
      errorMessage = String(error);
    }

    console.error('\n💥 Migration failed:', errorMessage);
    if (errorDetails) {
      console.error('Error details:', errorDetails);
    }

    return { success: false, applied, skipped, error: errorMessage };
  }
}

/**
 * Optional: Check if database is ready (useful for health checks)
 */
export async function isDatabaseReady(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}
