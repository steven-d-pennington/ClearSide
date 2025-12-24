/**
 * Utterance Repository
 * Handles all database operations for the utterances table
 */

import { pool } from '../connection.js';
import type {
  Utterance,
  UtteranceRow,
  CreateUtteranceInput,
  DebatePhase,
  Speaker,
} from '../../types/database.js';

/**
 * Convert snake_case database row to camelCase Utterance object
 */
function rowToUtterance(row: UtteranceRow): Utterance {
  return {
    id: row.id,
    debateId: row.debate_id,
    timestampMs: row.timestamp_ms,
    phase: row.phase,
    speaker: row.speaker,
    content: row.content,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: row.created_at,
  };
}

/**
 * Create a new utterance
 */
export async function create(input: CreateUtteranceInput): Promise<Utterance> {
  const query = `
    INSERT INTO utterances (debate_id, timestamp_ms, phase, speaker, content, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const values = [
    input.debateId,
    input.timestampMs,
    input.phase,
    input.speaker,
    input.content,
    JSON.stringify(input.metadata || {}),
  ];

  try {
    const result = await pool.query<UtteranceRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create utterance: no row returned');
    }
    return rowToUtterance(row);
  } catch (error) {
    console.error('Error creating utterance:', error);
    throw new Error(
      `Failed to create utterance: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find utterance by ID
 */
export async function findById(id: number): Promise<Utterance | null> {
  const query = 'SELECT * FROM utterances WHERE id = $1';

  try {
    const result = await pool.query<UtteranceRow>(query, [id]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToUtterance(row);
  } catch (error) {
    console.error('Error finding utterance:', error);
    throw new Error(
      `Failed to find utterance: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find all utterances for a debate, ordered by timestamp
 */
export async function findByDebateId(debateId: string): Promise<Utterance[]> {
  const query = `
    SELECT * FROM utterances
    WHERE debate_id = $1
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UtteranceRow>(query, [debateId]);
    return result.rows.map(rowToUtterance);
  } catch (error) {
    console.error('Error finding utterances by debate ID:', error);
    throw new Error(
      `Failed to find utterances: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find utterances within a specific time range
 */
export async function findByDebateIdAndTimeRange(
  debateId: string,
  startMs: number,
  endMs: number
): Promise<Utterance[]> {
  const query = `
    SELECT * FROM utterances
    WHERE debate_id = $1
      AND timestamp_ms >= $2
      AND timestamp_ms <= $3
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UtteranceRow>(query, [debateId, startMs, endMs]);
    return result.rows.map(rowToUtterance);
  } catch (error) {
    console.error('Error finding utterances by time range:', error);
    throw new Error(
      `Failed to find utterances by time range: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Find utterances by phase
 */
export async function findByPhase(
  debateId: string,
  phase: DebatePhase
): Promise<Utterance[]> {
  const query = `
    SELECT * FROM utterances
    WHERE debate_id = $1 AND phase = $2
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UtteranceRow>(query, [debateId, phase]);
    return result.rows.map(rowToUtterance);
  } catch (error) {
    console.error('Error finding utterances by phase:', error);
    throw new Error(
      `Failed to find utterances by phase: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Find utterances by speaker
 */
export async function findBySpeaker(
  debateId: string,
  speaker: Speaker
): Promise<Utterance[]> {
  const query = `
    SELECT * FROM utterances
    WHERE debate_id = $1 AND speaker = $2
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UtteranceRow>(query, [debateId, speaker]);
    return result.rows.map(rowToUtterance);
  } catch (error) {
    console.error('Error finding utterances by speaker:', error);
    throw new Error(
      `Failed to find utterances by speaker: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get the latest utterance for a debate
 */
export async function findLatest(debateId: string): Promise<Utterance | null> {
  const query = `
    SELECT * FROM utterances
    WHERE debate_id = $1
    ORDER BY timestamp_ms DESC
    LIMIT 1
  `;

  try {
    const result = await pool.query<UtteranceRow>(query, [debateId]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToUtterance(row);
  } catch (error) {
    console.error('Error finding latest utterance:', error);
    throw new Error(
      `Failed to find latest utterance: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Count utterances for a debate
 */
export async function count(debateId: string): Promise<number> {
  const query = 'SELECT COUNT(*) as count FROM utterances WHERE debate_id = $1';

  try {
    const result = await pool.query<{ count: string }>(query, [debateId]);
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting utterances:', error);
    throw new Error(
      `Failed to count utterances: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete all utterances for a debate
 * (Usually handled by CASCADE, but provided for explicit control)
 */
export async function deleteByDebateId(debateId: string): Promise<number> {
  const query = 'DELETE FROM utterances WHERE debate_id = $1';

  try {
    const result = await pool.query(query, [debateId]);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Error deleting utterances:', error);
    throw new Error(
      `Failed to delete utterances: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Batch create multiple utterances (for efficient insertion)
 */
export async function batchCreate(inputs: CreateUtteranceInput[]): Promise<Utterance[]> {
  if (inputs.length === 0) {
    return [];
  }

  // Build multi-row insert
  const valuesPlaceholders = inputs
    .map((_, i) => {
      const base = i * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    })
    .join(', ');

  const query = `
    INSERT INTO utterances (debate_id, timestamp_ms, phase, speaker, content, metadata)
    VALUES ${valuesPlaceholders}
    RETURNING *
  `;

  const values = inputs.flatMap((input) => [
    input.debateId,
    input.timestampMs,
    input.phase,
    input.speaker,
    input.content,
    JSON.stringify(input.metadata || {}),
  ]);

  try {
    const result = await pool.query<UtteranceRow>(query, values);
    return result.rows.map(rowToUtterance);
  } catch (error) {
    console.error('Error batch creating utterances:', error);
    throw new Error(
      `Failed to batch create utterances: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Export all functions as default object for convenience
export default {
  create,
  findById,
  findByDebateId,
  findByDebateIdAndTimeRange,
  findByPhase,
  findBySpeaker,
  findLatest,
  count,
  deleteByDebateId,
  batchCreate,
};
