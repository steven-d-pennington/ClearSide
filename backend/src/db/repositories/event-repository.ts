/**
 * System Event Repository
 * Handles all database operations for the system_events table
 * Provides persistent event logging for debugging and monitoring
 */

import { pool } from '../connection.js';
import type {
  SystemEvent,
  SystemEventRow,
  CreateSystemEventInput,
  SystemEventFilters,
  SystemEventType,
  EventSeverity,
} from '../../types/database.js';

/**
 * Convert snake_case database row to camelCase SystemEvent object
 */
function rowToEvent(row: SystemEventRow): SystemEvent {
  return {
    id: row.id,
    eventType: row.event_type as SystemEventType,
    severity: row.severity,
    debateId: row.debate_id,
    speaker: row.speaker,
    phase: row.phase,
    promptType: row.prompt_type,
    message: row.message,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: row.created_at,
  };
}

/**
 * Create a new system event
 */
export async function create(input: CreateSystemEventInput): Promise<SystemEvent> {
  const query = `
    INSERT INTO system_events (event_type, severity, debate_id, speaker, phase, prompt_type, message, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    input.eventType,
    input.severity || 'info',
    input.debateId || null,
    input.speaker || null,
    input.phase || null,
    input.promptType || null,
    input.message,
    JSON.stringify(input.metadata || {}),
  ];

  try {
    const result = await pool.query<SystemEventRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create event: no row returned');
    }
    return rowToEvent(row);
  } catch (error) {
    // Don't throw on event logging failures - just log to console
    console.error('Error creating system event:', error);
    // Return a placeholder event to avoid breaking callers
    return {
      id: -1,
      eventType: input.eventType,
      severity: input.severity || 'info',
      debateId: input.debateId || null,
      speaker: input.speaker || null,
      phase: input.phase || null,
      promptType: input.promptType || null,
      message: input.message,
      metadata: input.metadata || {},
      createdAt: new Date(),
    };
  }
}

/**
 * Convenience method to log an event (fire-and-forget)
 * Does not wait for database write to complete
 */
export function log(input: CreateSystemEventInput): void {
  // Fire and forget - don't await
  create(input).catch((err) => {
    console.error('Failed to log system event:', err);
  });
}

/**
 * Log an info event
 */
export function logInfo(
  eventType: SystemEventType,
  message: string,
  options?: Partial<Omit<CreateSystemEventInput, 'eventType' | 'severity' | 'message'>>
): void {
  log({ eventType, severity: 'info', message, ...options });
}

/**
 * Log a warning event
 */
export function logWarn(
  eventType: SystemEventType,
  message: string,
  options?: Partial<Omit<CreateSystemEventInput, 'eventType' | 'severity' | 'message'>>
): void {
  log({ eventType, severity: 'warn', message, ...options });
}

/**
 * Log an error event
 */
export function logError(
  eventType: SystemEventType,
  message: string,
  options?: Partial<Omit<CreateSystemEventInput, 'eventType' | 'severity' | 'message'>>
): void {
  log({ eventType, severity: 'error', message, ...options });
}

/**
 * Find events with filters
 */
export async function findWithFilters(filters: SystemEventFilters): Promise<SystemEvent[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.debateId) {
    conditions.push(`debate_id = $${paramIndex++}`);
    values.push(filters.debateId);
  }

  if (filters.eventType) {
    if (Array.isArray(filters.eventType)) {
      conditions.push(`event_type = ANY($${paramIndex++})`);
      values.push(filters.eventType);
    } else {
      conditions.push(`event_type = $${paramIndex++}`);
      values.push(filters.eventType);
    }
  }

  if (filters.severity) {
    if (Array.isArray(filters.severity)) {
      conditions.push(`severity = ANY($${paramIndex++})`);
      values.push(filters.severity);
    } else {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(filters.severity);
    }
  }

  if (filters.speaker) {
    conditions.push(`speaker = $${paramIndex++}`);
    values.push(filters.speaker);
  }

  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    values.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const query = `
    SELECT * FROM system_events
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  try {
    const result = await pool.query<SystemEventRow>(query, values);
    return result.rows.map(rowToEvent);
  } catch (error) {
    console.error('Error finding events:', error);
    throw new Error(
      `Failed to find events: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find events by debate ID
 */
export async function findByDebateId(debateId: string, limit = 100): Promise<SystemEvent[]> {
  return findWithFilters({ debateId, limit });
}

/**
 * Find recent events (across all debates)
 */
export async function findRecent(limit = 100): Promise<SystemEvent[]> {
  return findWithFilters({ limit });
}

/**
 * Find events by severity
 */
export async function findBySeverity(
  severity: EventSeverity | EventSeverity[],
  limit = 100
): Promise<SystemEvent[]> {
  return findWithFilters({ severity, limit });
}

/**
 * Find error and warning events
 */
export async function findIssues(limit = 100): Promise<SystemEvent[]> {
  return findWithFilters({ severity: ['warn', 'error'], limit });
}

/**
 * Count events by type for a debate
 */
export async function countByType(debateId: string): Promise<Record<string, number>> {
  const query = `
    SELECT event_type, COUNT(*) as count
    FROM system_events
    WHERE debate_id = $1
    GROUP BY event_type
    ORDER BY count DESC
  `;

  try {
    const result = await pool.query<{ event_type: string; count: string }>(query, [debateId]);
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.event_type] = parseInt(row.count, 10);
    }
    return counts;
  } catch (error) {
    console.error('Error counting events by type:', error);
    throw new Error(
      `Failed to count events: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get event statistics for a debate
 */
export async function getDebateStats(debateId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  retryCount: number;
  errorCount: number;
}> {
  const [totalResult, typeResult, severityResult] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) as count FROM system_events WHERE debate_id = $1', [
      debateId,
    ]),
    pool.query<{ event_type: string; count: string }>(
      'SELECT event_type, COUNT(*) as count FROM system_events WHERE debate_id = $1 GROUP BY event_type',
      [debateId]
    ),
    pool.query<{ severity: string; count: string }>(
      'SELECT severity, COUNT(*) as count FROM system_events WHERE debate_id = $1 GROUP BY severity',
      [debateId]
    ),
  ]);

  const byType: Record<string, number> = {};
  for (const row of typeResult.rows) {
    byType[row.event_type] = parseInt(row.count, 10);
  }

  const bySeverity: Record<string, number> = {};
  for (const row of severityResult.rows) {
    bySeverity[row.severity] = parseInt(row.count, 10);
  }

  return {
    total: parseInt(totalResult.rows[0]?.count || '0', 10),
    byType,
    bySeverity,
    retryCount: (byType['retry_attempt'] || 0) + (byType['retry_success'] || 0),
    errorCount: bySeverity['error'] || 0,
  };
}

/**
 * Delete old events (cleanup)
 * Keeps events from the last N days
 */
export async function deleteOlderThan(daysToKeep: number): Promise<number> {
  const query = `
    DELETE FROM system_events
    WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
  `;

  try {
    const result = await pool.query(query);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Error deleting old events:', error);
    throw new Error(
      `Failed to delete old events: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete events for a specific debate
 */
export async function deleteByDebateId(debateId: string): Promise<number> {
  const query = 'DELETE FROM system_events WHERE debate_id = $1';

  try {
    const result = await pool.query(query, [debateId]);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Error deleting events by debate ID:', error);
    throw new Error(
      `Failed to delete events: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Export all functions as default object for convenience
export default {
  create,
  log,
  logInfo,
  logWarn,
  logError,
  findWithFilters,
  findByDebateId,
  findRecent,
  findBySeverity,
  findIssues,
  countByType,
  getDebateStats,
  deleteOlderThan,
  deleteByDebateId,
};
