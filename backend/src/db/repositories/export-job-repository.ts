/**
 * Export Job Repository
 * Handles all database operations for the export_jobs table
 */

import { pool } from '../connection.js';
import type {
  ExportJob,
  ExportJobRow,
  CreateExportJobInput,
  UpdateExportJobInput,
  ListExportJobsOptions,
  ExportJobCounts,
  ExportJobStatus,
  rowToExportJob,
} from '../../types/export-job.js';
import { rowToExportJob as convertRow } from '../../types/export-job.js';

/**
 * Create a new export job
 */
export async function create(input: CreateExportJobInput): Promise<ExportJob> {
  const query = `
    INSERT INTO export_jobs (
      debate_id,
      job_type,
      options,
      provider
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const values = [
    input.debateId,
    input.jobType,
    JSON.stringify(input.options || {}),
    input.provider || null,
  ];

  try {
    const result = await pool.query<ExportJobRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create export job: no row returned');
    }
    return convertRow(row);
  } catch (error) {
    console.error('Error creating export job:', error);
    throw new Error(
      `Failed to create export job: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find an export job by ID
 */
export async function findById(id: string): Promise<ExportJob | null> {
  const query = 'SELECT * FROM export_jobs WHERE id = $1';

  try {
    const result = await pool.query<ExportJobRow>(query, [id]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return convertRow(row);
  } catch (error) {
    console.error('Error finding export job:', error);
    throw new Error(
      `Failed to find export job: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update an export job
 */
export async function update(
  id: string,
  input: UpdateExportJobInput
): Promise<ExportJob | null> {
  const updates: string[] = [];
  const values: unknown[] = [id];
  let paramIndex = 2;

  // Build dynamic update query
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.progress !== undefined) {
    updates.push(`progress = $${paramIndex++}`);
    values.push(input.progress);
  }
  if (input.stage !== undefined) {
    updates.push(`stage = $${paramIndex++}`);
    values.push(input.stage);
  }
  if (input.outputPath !== undefined) {
    updates.push(`output_path = $${paramIndex++}`);
    values.push(input.outputPath);
  }
  if (input.outputUrl !== undefined) {
    updates.push(`output_url = $${paramIndex++}`);
    values.push(input.outputUrl);
  }
  if (input.fileSizeBytes !== undefined) {
    updates.push(`file_size_bytes = $${paramIndex++}`);
    values.push(input.fileSizeBytes);
  }
  if (input.durationSeconds !== undefined) {
    updates.push(`duration_seconds = $${paramIndex++}`);
    values.push(input.durationSeconds);
  }
  if (input.error !== undefined) {
    updates.push(`error = $${paramIndex++}`);
    values.push(input.error);
  }
  if (input.startedAt !== undefined) {
    updates.push(`started_at = $${paramIndex++}`);
    values.push(input.startedAt);
  }
  if (input.completedAt !== undefined) {
    updates.push(`completed_at = $${paramIndex++}`);
    values.push(input.completedAt);
  }

  // Always update updated_at
  updates.push('updated_at = NOW()');

  if (updates.length === 1) {
    // Only updated_at, nothing to update
    return findById(id);
  }

  const query = `
    UPDATE export_jobs
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<ExportJobRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return convertRow(row);
  } catch (error) {
    console.error('Error updating export job:', error);
    throw new Error(
      `Failed to update export job: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List export jobs with filtering and pagination
 */
export async function list(options?: ListExportJobsOptions): Promise<ExportJob[]> {
  let query = 'SELECT * FROM export_jobs';
  const values: unknown[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  if (options?.debateId) {
    conditions.push(`debate_id = $${paramIndex++}`);
    values.push(options.debateId);
  }
  if (options?.jobType) {
    conditions.push(`job_type = $${paramIndex++}`);
    values.push(options.jobType);
  }
  if (options?.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(options.status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const orderBy = options?.orderBy || 'created_at';
  const orderDir = options?.orderDir || 'desc';
  query += ` ORDER BY ${orderBy} ${orderDir.toUpperCase()}`;

  if (options?.limit) {
    query += ` LIMIT $${paramIndex++}`;
    values.push(options.limit);
  }

  if (options?.offset) {
    query += ` OFFSET $${paramIndex++}`;
    values.push(options.offset);
  }

  try {
    const result = await pool.query<ExportJobRow>(query, values);
    return result.rows.map(convertRow);
  } catch (error) {
    console.error('Error listing export jobs:', error);
    throw new Error(
      `Failed to list export jobs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete an export job by ID
 */
export async function deleteById(id: string): Promise<boolean> {
  const query = 'DELETE FROM export_jobs WHERE id = $1';

  try {
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting export job:', error);
    throw new Error(
      `Failed to delete export job: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete old completed/failed jobs (for cleanup)
 */
export async function deleteOldCompleted(maxAgeHours: number = 24): Promise<number> {
  const query = `
    DELETE FROM export_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < NOW() - INTERVAL '1 hour' * $1
  `;

  try {
    const result = await pool.query(query, [maxAgeHours]);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Error deleting old export jobs:', error);
    throw new Error(
      `Failed to delete old export jobs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get counts by status for dashboard
 */
export async function countByStatus(): Promise<ExportJobCounts> {
  const query = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) as total
    FROM export_jobs
  `;

  try {
    const result = await pool.query<{
      pending: string;
      processing: string;
      completed: string;
      failed: string;
      cancelled: string;
      total: string;
    }>(query);

    const row = result.rows[0];
    return {
      pending: parseInt(row?.pending || '0', 10),
      processing: parseInt(row?.processing || '0', 10),
      completed: parseInt(row?.completed || '0', 10),
      failed: parseInt(row?.failed || '0', 10),
      cancelled: parseInt(row?.cancelled || '0', 10),
      total: parseInt(row?.total || '0', 10),
    };
  } catch (error) {
    console.error('Error counting export jobs:', error);
    throw new Error(
      `Failed to count export jobs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find jobs for a specific debate
 */
export async function findByDebateId(debateId: string): Promise<ExportJob[]> {
  return list({ debateId, orderBy: 'created_at', orderDir: 'desc' });
}

/**
 * Mark a job as started (processing)
 */
export async function markStarted(id: string): Promise<ExportJob | null> {
  return update(id, {
    status: 'processing',
    startedAt: new Date(),
  });
}

/**
 * Mark a job as completed
 */
export async function markCompleted(
  id: string,
  outputUrl: string,
  fileSizeBytes?: number,
  durationSeconds?: number
): Promise<ExportJob | null> {
  return update(id, {
    status: 'completed',
    progress: 100,
    stage: 'Complete',
    outputUrl,
    fileSizeBytes,
    durationSeconds,
    completedAt: new Date(),
  });
}

/**
 * Mark a job as failed
 */
export async function markFailed(id: string, error: string): Promise<ExportJob | null> {
  return update(id, {
    status: 'failed',
    error,
    completedAt: new Date(),
  });
}

/**
 * Cancel a job
 */
export async function cancel(id: string): Promise<ExportJob | null> {
  return update(id, {
    status: 'cancelled',
    completedAt: new Date(),
  });
}

// Export all functions as default object for convenience
export default {
  create,
  findById,
  update,
  list,
  deleteById,
  deleteOldCompleted,
  countByStatus,
  findByDebateId,
  markStarted,
  markCompleted,
  markFailed,
  cancel,
};
