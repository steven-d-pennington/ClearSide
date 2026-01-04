/**
 * Podcast Export Repository
 * Handles all database operations for the podcast_export_jobs table
 */

import { pool } from '../connection.js';
import {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastJobStatus
} from '../../types/podcast-export.js';

/**
 * Map database row to PodcastExportJob object
 */
function mapRow(row: any): PodcastExportJob {
  return {
    id: row.id,
    debateId: row.debate_id,
    status: row.status,
    config: row.config,
    refinedScript: row.refined_script,
    currentSegment: row.current_segment,
    totalSegments: row.total_segments,
    progressPercent: row.progress_percent,
    audioUrl: row.audio_url,
    durationSeconds: row.duration_seconds,
    characterCount: row.character_count,
    estimatedCostCents: row.estimated_cost_cents,
    actualCostCents: row.actual_cost_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  };
}

/**
 * Create a new podcast export job
 */
export async function create(debateId: string, config: PodcastExportConfig): Promise<PodcastExportJob> {
  const result = await pool.query(`
      INSERT INTO podcast_export_jobs (debate_id, config)
      VALUES ($1, $2)
      RETURNING *
    `, [debateId, JSON.stringify(config)]);

  return mapRow(result.rows[0]);
}

/**
 * Find a podcast export job by ID
 */
export async function findById(id: string): Promise<PodcastExportJob | null> {
  const result = await pool.query(`
      SELECT * FROM podcast_export_jobs WHERE id = $1
    `, [id]);

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Find all podcast export jobs for a debate
 */
export async function findByDebateId(debateId: string): Promise<PodcastExportJob[]> {
  const result = await pool.query(`
      SELECT * FROM podcast_export_jobs
      WHERE debate_id = $1
      ORDER BY created_at DESC
    `, [debateId]);

  return result.rows.map(row => mapRow(row));
}

/**
 * Update the status of a podcast export job
 */
export async function updateStatus(
  id: string,
  status: PodcastJobStatus,
  errorMessage?: string
): Promise<void> {
  const completedAt = status === 'complete' || status === 'error'
    ? new Date()
    : null;

  await pool.query(`
      UPDATE podcast_export_jobs
      SET status = $1, error_message = $2, completed_at = $3, updated_at = NOW()
      WHERE id = $4
    `, [status, errorMessage ?? null, completedAt, id]);
}

/**
 * Update the progress of a podcast export job
 */
export async function updateProgress(
  id: string,
  currentSegment: number,
  totalSegments: number
): Promise<void> {
  const progressPercent = Math.round((currentSegment / totalSegments) * 100);

  await pool.query(`
      UPDATE podcast_export_jobs
      SET current_segment = $1, total_segments = $2, progress_percent = $3, updated_at = NOW()
      WHERE id = $4
    `, [currentSegment, totalSegments, progressPercent, id]);
}

/**
 * Save the refined script for a podcast export job
 */
export async function saveRefinedScript(id: string, script: RefinedPodcastScript): Promise<void> {
  const totalSegments = script.segments.length +
    (script.intro ? 1 : 0) +
    (script.outro ? 1 : 0);

  await pool.query(`
      UPDATE podcast_export_jobs
      SET refined_script = $1, total_segments = $2, updated_at = NOW()
      WHERE id = $3
    `, [JSON.stringify(script), totalSegments, id]);
}

/**
 * Mark a podcast export job as complete
 */
export async function completeJob(
  id: string,
  audioUrl: string,
  durationSeconds: number,
  characterCount: number,
  actualCostCents: number
): Promise<void> {
  await pool.query(`
      UPDATE podcast_export_jobs
      SET
        status = 'complete',
        audio_url = $1,
        duration_seconds = $2,
        character_count = $3,
        actual_cost_cents = $4,
        progress_percent = 100,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $5
    `, [audioUrl, durationSeconds, characterCount, actualCostCents, id]);
}

// Export all functions as default object for convenience
export default {
  create,
  findById,
  findByDebateId,
  updateStatus,
  updateProgress,
  saveRefinedScript,
  completeJob,
};
