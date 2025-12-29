/**
 * Lively Mode Repository
 * Database operations for lively debate settings and interruptions
 */

import { pool } from '../connection.js';
import type {
  LivelySettings,
  LivelySettingsInput,
  Interruption,
  CreateInterruptionInput,
  InterruptStatus,
  PacingMode,
} from '../../types/lively.js';
import type { Speaker } from '../../types/debate.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'lively-repository' });

// ============================================================================
// Lively Settings
// ============================================================================

/**
 * Create lively settings for a debate
 */
export async function createLivelySettings(
  input: LivelySettingsInput
): Promise<LivelySettings> {
  const result = await pool.query(
    `INSERT INTO lively_settings (
      debate_id,
      aggression_level,
      max_interrupts_per_minute,
      interrupt_cooldown_ms,
      min_speaking_time_ms,
      relevance_threshold,
      contradiction_boost,
      pacing_mode,
      interjection_max_tokens
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      input.debateId,
      input.aggressionLevel ?? 3,
      input.maxInterruptsPerMinute ?? 2,
      input.interruptCooldownMs ?? 15000,
      input.minSpeakingTimeMs ?? 5000,
      input.relevanceThreshold ?? 0.7,
      input.contradictionBoost ?? 0.3,
      input.pacingMode ?? 'medium',
      input.interjectionMaxTokens ?? 60,
    ]
  );

  logger.info({ debateId: input.debateId }, 'Created lively settings');
  return mapRowToLivelySettings(result.rows[0]);
}

/**
 * Find lively settings by debate ID
 */
export async function findLivelySettingsByDebateId(
  debateId: string
): Promise<LivelySettings | null> {
  const result = await pool.query(
    'SELECT * FROM lively_settings WHERE debate_id = $1',
    [debateId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToLivelySettings(result.rows[0]);
}

/**
 * Update lively settings
 */
export async function updateLivelySettings(
  debateId: string,
  updates: Partial<LivelySettingsInput>
): Promise<LivelySettings | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.aggressionLevel !== undefined) {
    setClauses.push(`aggression_level = $${paramIndex++}`);
    values.push(updates.aggressionLevel);
  }
  if (updates.maxInterruptsPerMinute !== undefined) {
    setClauses.push(`max_interrupts_per_minute = $${paramIndex++}`);
    values.push(updates.maxInterruptsPerMinute);
  }
  if (updates.interruptCooldownMs !== undefined) {
    setClauses.push(`interrupt_cooldown_ms = $${paramIndex++}`);
    values.push(updates.interruptCooldownMs);
  }
  if (updates.minSpeakingTimeMs !== undefined) {
    setClauses.push(`min_speaking_time_ms = $${paramIndex++}`);
    values.push(updates.minSpeakingTimeMs);
  }
  if (updates.relevanceThreshold !== undefined) {
    setClauses.push(`relevance_threshold = $${paramIndex++}`);
    values.push(updates.relevanceThreshold);
  }
  if (updates.contradictionBoost !== undefined) {
    setClauses.push(`contradiction_boost = $${paramIndex++}`);
    values.push(updates.contradictionBoost);
  }
  if (updates.pacingMode !== undefined) {
    setClauses.push(`pacing_mode = $${paramIndex++}`);
    values.push(updates.pacingMode);
  }
  if (updates.interjectionMaxTokens !== undefined) {
    setClauses.push(`interjection_max_tokens = $${paramIndex++}`);
    values.push(updates.interjectionMaxTokens);
  }

  if (setClauses.length === 0) {
    return findLivelySettingsByDebateId(debateId);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(debateId);

  const result = await pool.query(
    `UPDATE lively_settings
     SET ${setClauses.join(', ')}
     WHERE debate_id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info({ debateId, updates }, 'Updated lively settings');
  return mapRowToLivelySettings(result.rows[0]);
}

/**
 * Delete lively settings for a debate
 */
export async function deleteLivelySettings(debateId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM lively_settings WHERE debate_id = $1',
    [debateId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Interruptions
// ============================================================================

/**
 * Create an interruption record
 */
export async function createInterruption(
  input: CreateInterruptionInput
): Promise<Interruption> {
  const result = await pool.query(
    `INSERT INTO debate_interruptions (
      debate_id,
      scheduled_at_ms,
      interrupter,
      interrupted_speaker,
      trigger_phrase,
      relevance_score,
      contradiction_score,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING *`,
    [
      input.debateId,
      input.scheduledAtMs,
      input.interrupter,
      input.interruptedSpeaker,
      input.triggerPhrase ?? null,
      input.relevanceScore ?? null,
      input.contradictionScore ?? null,
    ]
  );

  logger.debug(
    { debateId: input.debateId, interrupter: input.interrupter },
    'Created interruption record'
  );
  return mapRowToInterruption(result.rows[0]);
}

/**
 * Find all interruptions for a debate
 */
export async function findInterruptionsByDebateId(
  debateId: string
): Promise<Interruption[]> {
  const result = await pool.query(
    `SELECT * FROM debate_interruptions
     WHERE debate_id = $1
     ORDER BY scheduled_at_ms ASC`,
    [debateId]
  );

  return result.rows.map(mapRowToInterruption);
}

/**
 * Find pending interruptions for a debate
 */
export async function findPendingInterruptions(
  debateId: string
): Promise<Interruption[]> {
  const result = await pool.query(
    `SELECT * FROM debate_interruptions
     WHERE debate_id = $1 AND status = 'pending'
     ORDER BY scheduled_at_ms ASC`,
    [debateId]
  );

  return result.rows.map(mapRowToInterruption);
}

/**
 * Mark an interruption as fired
 */
export async function fireInterruption(
  interruptionId: number,
  content: string,
  atToken: number,
  firedAtMs: number
): Promise<Interruption | null> {
  const result = await pool.query(
    `UPDATE debate_interruptions
     SET status = 'fired',
         interjection_content = $2,
         interrupted_at_token = $3,
         fired_at_ms = $4
     WHERE id = $1
     RETURNING *`,
    [interruptionId, content, atToken, firedAtMs]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.debug({ interruptionId, firedAtMs }, 'Interruption fired');
  return mapRowToInterruption(result.rows[0]);
}

/**
 * Cancel an interruption
 */
export async function cancelInterruption(
  interruptionId: number,
  reason: string
): Promise<Interruption | null> {
  const result = await pool.query(
    `UPDATE debate_interruptions
     SET status = 'cancelled',
         cancellation_reason = $2
     WHERE id = $1
     RETURNING *`,
    [interruptionId, reason]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.debug({ interruptionId, reason }, 'Interruption cancelled');
  return mapRowToInterruption(result.rows[0]);
}

/**
 * Suppress an interruption (rate limited or cooldown)
 */
export async function suppressInterruption(
  interruptionId: number,
  reason: string
): Promise<Interruption | null> {
  const result = await pool.query(
    `UPDATE debate_interruptions
     SET status = 'suppressed',
         cancellation_reason = $2
     WHERE id = $1
     RETURNING *`,
    [interruptionId, reason]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.debug({ interruptionId, reason }, 'Interruption suppressed');
  return mapRowToInterruption(result.rows[0]);
}

/**
 * Count interrupts fired in the last minute
 */
export async function countRecentInterrupts(
  debateId: string,
  sinceMs: number
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM debate_interruptions
     WHERE debate_id = $1
       AND status = 'fired'
       AND fired_at_ms >= $2`,
    [debateId, sinceMs]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Get last interrupt time for a speaker
 */
export async function getLastInterruptTime(
  debateId: string,
  speaker: Speaker
): Promise<number | null> {
  const result = await pool.query(
    `SELECT MAX(fired_at_ms) as last_fired
     FROM debate_interruptions
     WHERE debate_id = $1
       AND interrupter = $2
       AND status = 'fired'`,
    [debateId, speaker]
  );

  return result.rows[0].last_fired ?? null;
}

// ============================================================================
// Debate Mode Updates
// ============================================================================

/**
 * Update debate mode in debates table
 */
export async function updateDebateMode(
  debateId: string,
  mode: 'turn_based' | 'lively'
): Promise<void> {
  await pool.query(
    'UPDATE debates SET debate_mode = $2 WHERE id = $1',
    [debateId, mode]
  );
  logger.info({ debateId, mode }, 'Updated debate mode');
}

/**
 * Update active speaker in debates table
 */
export async function updateActiveSpeaker(
  debateId: string,
  speaker: Speaker | null,
  speakingSinceMs: number | null
): Promise<void> {
  await pool.query(
    `UPDATE debates
     SET active_speaker = $2, speaking_since_ms = $3
     WHERE id = $1`,
    [debateId, speaker, speakingSinceMs]
  );
}

// ============================================================================
// Row Mappers
// ============================================================================

function mapRowToLivelySettings(row: Record<string, unknown>): LivelySettings {
  return {
    id: row.id as number,
    debateId: row.debate_id as string,
    aggressionLevel: row.aggression_level as number,
    maxInterruptsPerMinute: row.max_interrupts_per_minute as number,
    interruptCooldownMs: row.interrupt_cooldown_ms as number,
    minSpeakingTimeMs: row.min_speaking_time_ms as number,
    relevanceThreshold: parseFloat(row.relevance_threshold as string),
    contradictionBoost: parseFloat(row.contradiction_boost as string),
    pacingMode: row.pacing_mode as PacingMode,
    interjectionMaxTokens: row.interjection_max_tokens as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapRowToInterruption(row: Record<string, unknown>): Interruption {
  return {
    id: row.id as number,
    debateId: row.debate_id as string,
    scheduledAtMs: row.scheduled_at_ms as number,
    firedAtMs: row.fired_at_ms as number | null,
    interrupter: row.interrupter as Speaker,
    interruptedSpeaker: row.interrupted_speaker as Speaker,
    triggerPhrase: row.trigger_phrase as string | null,
    interjectionContent: row.interjection_content as string | null,
    interruptedAtToken: row.interrupted_at_token as number | null,
    relevanceScore: row.relevance_score
      ? parseFloat(row.relevance_score as string)
      : null,
    contradictionScore: row.contradiction_score
      ? parseFloat(row.contradiction_score as string)
      : null,
    status: row.status as InterruptStatus,
    cancellationReason: row.cancellation_reason as string | null,
    createdAt: new Date(row.created_at as string),
  };
}
