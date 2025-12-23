/**
 * User Intervention Repository
 * Handles all database operations for the user_interventions table
 */

import { pool } from '../connection.js';
import type {
  UserIntervention,
  UserInterventionRow,
  CreateInterventionInput,
  InterventionType,
  Speaker,
} from '../../types/database.js';

/**
 * Convert snake_case database row to camelCase UserIntervention object
 */
function rowToIntervention(row: UserInterventionRow): UserIntervention {
  return {
    id: row.id,
    debateId: row.debate_id,
    timestampMs: row.timestamp_ms,
    interventionType: row.intervention_type,
    content: row.content,
    directedTo: row.directed_to,
    response: row.response,
    responseTimestampMs: row.response_timestamp_ms,
    createdAt: row.created_at,
  };
}

/**
 * Create a new user intervention
 */
export async function create(input: CreateInterventionInput): Promise<UserIntervention> {
  const query = `
    INSERT INTO user_interventions (
      debate_id,
      timestamp_ms,
      intervention_type,
      content,
      directed_to
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const values = [
    input.debateId,
    input.timestampMs,
    input.interventionType,
    input.content,
    input.directedTo || null,
  ];

  try {
    const result = await pool.query<UserInterventionRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create intervention: no row returned');
    }
    return rowToIntervention(row);
  } catch (error) {
    console.error('Error creating intervention:', error);
    throw new Error(
      `Failed to create intervention: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find intervention by ID
 */
export async function findById(id: number): Promise<UserIntervention | null> {
  const query = 'SELECT * FROM user_interventions WHERE id = $1';

  try {
    const result = await pool.query<UserInterventionRow>(query, [id]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToIntervention(row);
  } catch (error) {
    console.error('Error finding intervention:', error);
    throw new Error(
      `Failed to find intervention: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find all interventions for a debate, ordered by timestamp
 */
export async function findByDebateId(debateId: string): Promise<UserIntervention[]> {
  const query = `
    SELECT * FROM user_interventions
    WHERE debate_id = $1
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UserInterventionRow>(query, [debateId]);
    return result.rows.map(rowToIntervention);
  } catch (error) {
    console.error('Error finding interventions by debate ID:', error);
    throw new Error(
      `Failed to find interventions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Add response to an intervention
 */
export async function addResponse(
  id: number,
  response: string,
  responseTimestampMs: number
): Promise<UserIntervention | null> {
  const query = `
    UPDATE user_interventions
    SET response = $2, response_timestamp_ms = $3
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query<UserInterventionRow>(query, [
      id,
      response,
      responseTimestampMs,
    ]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToIntervention(row);
  } catch (error) {
    console.error('Error adding response to intervention:', error);
    throw new Error(
      `Failed to add response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find unanswered interventions for a debate
 */
export async function findUnanswered(debateId: string): Promise<UserIntervention[]> {
  const query = `
    SELECT * FROM user_interventions
    WHERE debate_id = $1 AND response IS NULL
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UserInterventionRow>(query, [debateId]);
    return result.rows.map(rowToIntervention);
  } catch (error) {
    console.error('Error finding unanswered interventions:', error);
    throw new Error(
      `Failed to find unanswered interventions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Find interventions by type
 */
export async function findByType(
  debateId: string,
  interventionType: InterventionType
): Promise<UserIntervention[]> {
  const query = `
    SELECT * FROM user_interventions
    WHERE debate_id = $1 AND intervention_type = $2
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UserInterventionRow>(query, [debateId, interventionType]);
    return result.rows.map(rowToIntervention);
  } catch (error) {
    console.error('Error finding interventions by type:', error);
    throw new Error(
      `Failed to find interventions by type: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Find interventions directed to a specific speaker
 */
export async function findByDirectedTo(
  debateId: string,
  directedTo: Speaker
): Promise<UserIntervention[]> {
  const query = `
    SELECT * FROM user_interventions
    WHERE debate_id = $1 AND directed_to = $2
    ORDER BY timestamp_ms ASC
  `;

  try {
    const result = await pool.query<UserInterventionRow>(query, [debateId, directedTo]);
    return result.rows.map(rowToIntervention);
  } catch (error) {
    console.error('Error finding interventions by directed_to:', error);
    throw new Error(
      `Failed to find interventions by directed_to: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Count total interventions for a debate
 */
export async function count(debateId: string): Promise<number> {
  const query = 'SELECT COUNT(*) as count FROM user_interventions WHERE debate_id = $1';

  try {
    const result = await pool.query<{ count: string }>(query, [debateId]);
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting interventions:', error);
    throw new Error(
      `Failed to count interventions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Count unanswered interventions for a debate
 */
export async function countUnanswered(debateId: string): Promise<number> {
  const query = `
    SELECT COUNT(*) as count
    FROM user_interventions
    WHERE debate_id = $1 AND response IS NULL
  `;

  try {
    const result = await pool.query<{ count: string }>(query, [debateId]);
    return parseInt(result.rows[0]?.count || '0', 10);
  } catch (error) {
    console.error('Error counting unanswered interventions:', error);
    throw new Error(
      `Failed to count unanswered interventions: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Delete all interventions for a debate
 * (Usually handled by CASCADE, but provided for explicit control)
 */
export async function deleteByDebateId(debateId: string): Promise<number> {
  const query = 'DELETE FROM user_interventions WHERE debate_id = $1';

  try {
    const result = await pool.query(query, [debateId]);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Error deleting interventions:', error);
    throw new Error(
      `Failed to delete interventions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get the most recent intervention for a debate
 */
export async function findLatest(debateId: string): Promise<UserIntervention | null> {
  const query = `
    SELECT * FROM user_interventions
    WHERE debate_id = $1
    ORDER BY timestamp_ms DESC
    LIMIT 1
  `;

  try {
    const result = await pool.query<UserInterventionRow>(query, [debateId]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return rowToIntervention(row);
  } catch (error) {
    console.error('Error finding latest intervention:', error);
    throw new Error(
      `Failed to find latest intervention: ${
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
  addResponse,
  findUnanswered,
  findByType,
  findByDirectedTo,
  count,
  countUnanswered,
  deleteByDebateId,
  findLatest,
};
