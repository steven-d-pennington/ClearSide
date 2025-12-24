/**
 * PostgreSQL database connection pool
 * Manages database connections with proper configuration and error handling
 */

import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

/**
 * Database configuration from environment variables
 */
const dbConfig = {
  // Support both individual config vars and DATABASE_URL
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'clearside',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  // Or use DATABASE_URL if provided (common in cloud environments)
  connectionString: process.env.DATABASE_URL,

  // SSL configuration for cloud databases (Supabase, Neon, etc.)
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined,

  // Connection pool configuration
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection cannot be established
};

/**
 * PostgreSQL connection pool instance
 * Shared across the application for efficient connection management
 */
export const pool = new Pool(dbConfig);

/**
 * Handle unexpected errors on idle clients
 * These are typically network errors or database restarts
 */
pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle database client', err);
  // In production, you might want to:
  // - Log to monitoring service
  // - Trigger alerts
  // - Attempt reconnection
  process.exit(-1);
});

/**
 * Test database connection
 * Useful for startup checks and health endpoints
 */
export async function testConnection(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('Database connected successfully at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Gracefully close the database pool
 * Should be called during application shutdown
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

/**
 * Execute a query with automatic client management
 * Convenience wrapper for simple queries
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    // Log slow queries (>100ms)
    if (duration > 100) {
      console.warn('Slow query detected:', {
        text,
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (error) {
    console.error('Query error:', {
      text,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Export types for convenience
export type { Pool, PoolClient, QueryResult } from 'pg';
