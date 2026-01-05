/**
 * Podcast Export Repository
 * Handles all database operations for the podcast_export_jobs table
 */

import { pool } from '../connection.js';
import {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastJobStatus,
  GenerationPhase,
  PodcastSegmentStatus
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
    // Generation phase tracking for recovery
    generationPhase: row.generation_phase,
    phaseStartedAt: row.phase_started_at,
    partialCostCents: row.partial_cost_cents,
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
 * Map database row to PodcastSegmentStatus object
 */
function mapSegmentRow(row: any): PodcastSegmentStatus {
  return {
    id: row.id,
    jobId: row.job_id,
    segmentIndex: row.segment_index,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    characterCount: row.character_count,
    costCents: row.cost_cents,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
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

// ============================================================================
// Generation Phase Tracking (for recovery)
// ============================================================================

/**
 * Update the generation phase for a job
 * Tracks which phase we're in so we can resume from the right point
 */
export async function updateGenerationPhase(
  id: string,
  phase: GenerationPhase
): Promise<void> {
  await pool.query(`
      UPDATE podcast_export_jobs
      SET generation_phase = $1, phase_started_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [phase, id]);
}

/**
 * Update partial cost (accumulated even on failure)
 * This helps track how much we've spent even when generation fails
 */
export async function updatePartialCost(
  id: string,
  additionalCents: number
): Promise<void> {
  await pool.query(`
      UPDATE podcast_export_jobs
      SET partial_cost_cents = COALESCE(partial_cost_cents, 0) + $1, updated_at = NOW()
      WHERE id = $2
    `, [additionalCents, id]);
}

// ============================================================================
// Segment Status Tracking (for granular recovery)
// ============================================================================

/**
 * Initialize segment status records for a job
 * Creates pending records for each segment to track individually
 */
export async function createSegmentStatuses(
  jobId: string,
  segmentCount: number
): Promise<void> {
  // First delete any existing segment statuses for this job (for retry scenarios)
  await pool.query(`
      DELETE FROM podcast_segment_status WHERE job_id = $1
    `, [jobId]);

  // Create pending status for each segment
  const values: string[] = [];
  const params: any[] = [jobId];

  for (let i = 0; i < segmentCount; i++) {
    values.push(`($1, $${i + 2})`);
    params.push(i);
  }

  if (values.length > 0) {
    await pool.query(`
        INSERT INTO podcast_segment_status (job_id, segment_index)
        VALUES ${values.join(', ')}
      `, params);
  }
}

/**
 * Update the status of a specific segment
 */
export async function updateSegmentStatus(
  jobId: string,
  segmentIndex: number,
  status: 'pending' | 'generating' | 'complete' | 'error',
  options?: {
    characterCount?: number;
    costCents?: number;
    errorMessage?: string;
  }
): Promise<void> {
  const now = new Date();
  const startedAt = status === 'generating' ? now : null;
  const completedAt = status === 'complete' || status === 'error' ? now : null;

  // Calculate retry increment in JS to avoid PostgreSQL type inference issues
  const shouldIncrementRetry = status === 'generating';

  await pool.query(`
      UPDATE podcast_segment_status
      SET
        status = $1,
        started_at = COALESCE($2, started_at),
        completed_at = COALESCE($3, completed_at),
        character_count = COALESCE($4, character_count),
        cost_cents = COALESCE($5, cost_cents),
        error_message = COALESCE($6, error_message),
        retry_count = CASE WHEN $9 THEN retry_count + 1 ELSE retry_count END
      WHERE job_id = $7 AND segment_index = $8
    `, [
      status,
      startedAt,
      completedAt,
      options?.characterCount,
      options?.costCents,
      options?.errorMessage,
      jobId,
      segmentIndex,
      shouldIncrementRetry
    ]);
}

/**
 * Get all segment statuses for a job
 */
export async function getSegmentStatuses(jobId: string): Promise<PodcastSegmentStatus[]> {
  const result = await pool.query(`
      SELECT * FROM podcast_segment_status
      WHERE job_id = $1
      ORDER BY segment_index
    `, [jobId]);

  return result.rows.map(row => mapSegmentRow(row));
}

/**
 * Get pending or error segments for retry
 * Returns segment indexes that need to be (re)generated
 */
export async function getPendingSegments(jobId: string): Promise<number[]> {
  const result = await pool.query(`
      SELECT segment_index FROM podcast_segment_status
      WHERE job_id = $1 AND status IN ('pending', 'error')
      ORDER BY segment_index
    `, [jobId]);

  return result.rows.map(row => row.segment_index);
}

/**
 * Get count of completed segments (for progress calculation)
 */
export async function getCompletedSegmentCount(jobId: string): Promise<number> {
  const result = await pool.query(`
      SELECT COUNT(*) as count FROM podcast_segment_status
      WHERE job_id = $1 AND status = 'complete'
    `, [jobId]);

  return parseInt(result.rows[0].count, 10);
}

/**
 * Calculate total cost from completed segments
 */
export async function getSegmentsTotalCost(jobId: string): Promise<number> {
  const result = await pool.query(`
      SELECT COALESCE(SUM(cost_cents), 0) as total_cost FROM podcast_segment_status
      WHERE job_id = $1 AND status = 'complete'
    `, [jobId]);

  return parseInt(result.rows[0].total_cost, 10);
}

/**
 * Update job configuration
 * Useful for changing settings (like ElevenLabs model) before regenerating
 */
export async function updateConfig(id: string, config: PodcastExportConfig): Promise<void> {
  await pool.query(`
      UPDATE podcast_export_jobs
      SET config = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(config), id]);
}

/**
 * Reset generation state for a fresh start
 * Clears segment statuses and resets job to pending
 * Preserves the refined script
 */
export async function resetGenerationState(id: string): Promise<void> {
  // Clear segment statuses
  await pool.query(`
      DELETE FROM podcast_segment_status WHERE job_id = $1
    `, [id]);

  // Reset job state
  await pool.query(`
      UPDATE podcast_export_jobs
      SET
        status = 'pending',
        generation_phase = NULL,
        phase_started_at = NULL,
        current_segment = 0,
        progress_percent = 0,
        error_message = NULL,
        partial_cost_cents = 0,
        updated_at = NOW()
      WHERE id = $1
    `, [id]);
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
  // Phase tracking
  updateGenerationPhase,
  updatePartialCost,
  // Config management
  updateConfig,
  resetGenerationState,
  // Segment tracking
  createSegmentStatuses,
  updateSegmentStatus,
  getSegmentStatuses,
  getPendingSegments,
  getCompletedSegmentCount,
  getSegmentsTotalCost,
};
