/**
 * Database migration runner
 * Executes SQL migration files in order and tracks applied migrations
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool, closePool } from './connection.js';

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * List of migration files in order
 * Add new migrations to the end of this array
 */
const MIGRATIONS = [
  '001_create_debates_schema.sql',
  '002_add_flow_mode.sql',
  '003_add_debate_configuration.sql',
  '004_add_personas.sql',
  '005_add_lively_mode.sql',
  '006_add_export_jobs.sql',
  '007_add_system_events.sql',
  '008_add_model_defaults.sql',
  '009_add_informal_discussion.sql',
  '009_add_debate_models.sql',
  '010_add_discussion_style.sql',
  '011_add_duelogic_mode.sql',
  '012_add_podcast_export.sql',
  '013_add_duelogic_research.sql',
  '014_add_podcast_segment_tracking.sql',
  '015_add_episode_linkage.sql',
  '016_add_launched_status.sql',
  '017_add_viral_metrics.sql',
  '018_add_min_trend_alignment.sql',
  '019_add_conversational_podcast.sql',
  '020_add_conversation_podcast_support.sql',
  '021_add_refined_script_storage.sql',
];

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
 * Execute a single migration file
 */
async function executeMigration(filename: string): Promise<void> {
  const version = filename.replace('.sql', '');

  // Check if already applied
  const applied = await isMigrationApplied(version);
  if (applied) {
    console.log(`⏭️  Migration ${version} already applied, skipping`);
    return;
  }

  console.log(`▶️  Running migration: ${version}`);

  // Read the SQL file
  const migrationPath = join(__dirname, 'migrations', filename);
  const sql = readFileSync(migrationPath, 'utf-8');

  // Execute the migration
  try {
    await pool.query(sql);
    console.log(`✅ Migration ${version} completed successfully`);
  } catch (error) {
    console.error(`❌ Migration ${version} failed:`, error);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations(): Promise<void> {
  console.log('🚀 Starting database migrations...\n');

  try {
    // Test database connection
    const client = await pool.connect();
    console.log('✅ Database connection successful\n');
    client.release();

    // Run each migration in order
    for (const migration of MIGRATIONS) {
      await executeMigration(migration);
    }

    console.log('\n🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

/**
 * Rollback a specific migration (advanced usage)
 * Note: This requires creating corresponding rollback SQL files
 */
async function rollbackMigration(version: string): Promise<void> {
  console.log(`⚠️  Rolling back migration: ${version}`);

  try {
    // Check if rollback file exists
    const rollbackPath = join(__dirname, 'migrations', `${version}_rollback.sql`);
    const sql = readFileSync(rollbackPath, 'utf-8');

    // Execute rollback
    await pool.query(sql);

    // Remove from schema_migrations
    await pool.query('DELETE FROM schema_migrations WHERE version = $1', [version]);

    console.log(`✅ Rollback of ${version} completed successfully`);
  } catch (error) {
    console.error(`❌ Rollback of ${version} failed:`, error);
    throw error;
  }
}

/**
 * Display current migration status
 */
async function showMigrationStatus(): Promise<void> {
  console.log('📊 Migration Status:\n');

  try {
    const result = await pool.query(
      'SELECT version, applied_at FROM schema_migrations ORDER BY applied_at ASC'
    );

    if (result.rowCount === 0) {
      console.log('No migrations have been applied yet.');
    } else {
      console.log('Applied migrations:');
      result.rows.forEach((row) => {
        console.log(`  ✅ ${row.version} (applied: ${row.applied_at})`);
      });
    }

    console.log('\nAvailable migrations:');
    for (const migration of MIGRATIONS) {
      const version = migration.replace('.sql', '');
      const applied = await isMigrationApplied(version);
      const status = applied ? '✅' : '⏳';
      console.log(`  ${status} ${version}`);
    }
  } catch (error) {
    console.error('Error fetching migration status:', error);
  } finally {
    await closePool();
  }
}

// CLI Interface
const command = process.argv[2];

switch (command) {
  case 'status':
    await showMigrationStatus();
    break;
  case 'rollback':
    const version = process.argv[3];
    if (!version) {
      console.error('Error: Please specify a version to rollback');
      console.log('Usage: npm run db:migrate rollback <version>');
      process.exit(1);
    }
    await rollbackMigration(version);
    await closePool();
    break;
  case 'run':
  default:
    await runMigrations();
    break;
}
