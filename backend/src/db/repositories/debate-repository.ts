/**
 * Debate Repository
 * Handles all database operations for the debates table
 */

import { pool } from '../connection.js';
import type {
  Debate,
  DebateRow,
  CreateDebateInput,
  UpdateDebateStatusInput,
  DebateStatus,
  DebatePhase,
  Speaker,
} from '../../types/database.js';

/**
 * Convert snake_case database row to camelCase Debate object
 */
function rowToDebate(row: DebateRow): Debate {
  return {
    id: row.id,
    propositionText: row.proposition_text,
    propositionContext: (row.proposition_context as Record<string, unknown>) || {},
    status: row.status,
    currentPhase: row.current_phase,
    currentSpeaker: row.current_speaker,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalDurationMs: row.total_duration_ms,
    transcriptJson: (row.transcript_json as Record<string, unknown>) || null,
    structuredAnalysisJson: (row.structured_analysis_json as Record<string, unknown>) || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new debate
 */
export async function create(input: CreateDebateInput): Promise<Debate> {
  const query = `
    INSERT INTO debates (proposition_text, proposition_context)
    VALUES ($1, $2)
    RETURNING *
  `;

  const values = [
    input.propositionText,
    JSON.stringify(input.propositionContext || {}),
  ];

  try {
    const result = await pool.query<DebateRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create debate: no row returned');
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error creating debate:', error);
    throw new Error(
      `Failed to create debate: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find a debate by ID
 */
export async function findById(id: string): Promise<Debate | null> {
  const query = 'SELECT * FROM debates WHERE id = $1';

  try {
    const result = await pool.query<DebateRow>(query, [id]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error finding debate:', error);
    throw new Error(
      `Failed to find debate: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update debate status and optionally phase/speaker
 */
export async function updateStatus(
  id: string,
  update: UpdateDebateStatusInput
): Promise<Debate | null> {
  const updates: string[] = ['status = $2'];
  const values: unknown[] = [id, update.status];
  let paramIndex = 3;

  if (update.currentPhase !== undefined) {
    updates.push(`current_phase = $${paramIndex}`);
    values.push(update.currentPhase);
    paramIndex++;
  }

  if (update.currentSpeaker !== undefined) {
    updates.push(`current_speaker = $${paramIndex}`);
    values.push(update.currentSpeaker);
    paramIndex++;
  }

  const query = `
    UPDATE debates
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<DebateRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error updating debate status:', error);
    throw new Error(
      `Failed to update debate status: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update debate phase and speaker
 */
export async function updatePhase(
  id: string,
  phase: DebatePhase,
  speaker: Speaker
): Promise<Debate | null> {
  const query = `
    UPDATE debates
    SET current_phase = $2, current_speaker = $3
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<DebateRow>(query, [id, phase, speaker]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error updating debate phase:', error);
    throw new Error(
      `Failed to update debate phase: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Save debate transcript (JSON)
 */
export async function saveTranscript(
  id: string,
  transcript: Record<string, unknown>
): Promise<Debate | null> {
  const query = `
    UPDATE debates
    SET transcript_json = $2
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<DebateRow>(query, [id, JSON.stringify(transcript)]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error saving debate transcript:', error);
    throw new Error(
      `Failed to save debate transcript: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Mark debate as started
 */
export async function markStarted(id: string): Promise<Debate | null> {
  const query = `
    UPDATE debates
    SET status = 'live', started_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<DebateRow>(query, [id]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error marking debate as started:', error);
    throw new Error(
      `Failed to mark debate as started: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Complete a debate with final analysis
 */
export async function complete(
  id: string,
  structuredAnalysis?: Record<string, unknown>
): Promise<Debate | null> {
  const query = `
    UPDATE debates
    SET
      status = 'completed',
      completed_at = NOW(),
      total_duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
      structured_analysis_json = $2
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<DebateRow>(query, [
      id,
      structuredAnalysis ? JSON.stringify(structuredAnalysis) : null,
    ]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToDebate(row);
  } catch (error) {
    console.error('Error completing debate:', error);
    throw new Error(
      `Failed to complete debate: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List all debates with optional filtering and pagination
 */
export async function list(options?: {
  status?: DebateStatus;
  limit?: number;
  offset?: number;
}): Promise<Debate[]> {
  let query = 'SELECT * FROM debates';
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (options?.status) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(options.status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ` LIMIT $${values.length + 1}`;
    values.push(options.limit);
  }

  if (options?.offset) {
    query += ` OFFSET $${values.length + 1}`;
    values.push(options.offset);
  }

  try {
    const result = await pool.query<DebateRow>(query, values);
    return result.rows.map(rowToDebate);
  } catch (error) {
    console.error('Error listing debates:', error);
    throw new Error(
      `Failed to list debates: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete a debate (cascade deletes utterances and interventions)
 */
export async function deleteById(id: string): Promise<boolean> {
  const query = 'DELETE FROM debates WHERE id = $1';

  try {
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting debate:', error);
    throw new Error(
      `Failed to delete debate: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Export all functions as default object for convenience
export default {
  create,
  findById,
  updateStatus,
  updatePhase,
  saveTranscript,
  markStarted,
  complete,
  list,
  deleteById,
};
