/**
 * Informal Discussion Repository
 *
 * Database operations for informal discussion settings and state.
 */

import { pool } from '../connection.js';
import type { EndDetectionConfig } from '../../types/informal.js';
import { INFORMAL_DEFAULTS } from '../../types/informal.js';

/**
 * Informal settings row from database
 */
interface InformalSettingsRow {
  id: number;
  debate_id: string;
  max_exchanges: number;
  min_exchanges: number;
  end_detection_enabled: boolean;
  end_detection_interval: number;
  end_confidence_threshold: number;
  participant_names: string | null;
  max_tokens_per_turn: number | null;
  temperature: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Informal settings entity
 */
export interface InformalSettings {
  id: number;
  debateId: string;
  maxExchanges: number;
  minExchanges: number;
  endDetection: EndDetectionConfig;
  participantNames: string[] | null;
  maxTokensPerTurn: number | null;
  temperature: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating informal settings
 */
export interface CreateInformalSettingsInput {
  debateId: string;
  maxExchanges?: number;
  minExchanges?: number;
  endDetectionEnabled?: boolean;
  endDetectionInterval?: number;
  endConfidenceThreshold?: number;
  participantNames?: string[];
  maxTokensPerTurn?: number;
  temperature?: number;
}

/**
 * Convert database row to entity
 */
function rowToSettings(row: InformalSettingsRow): InformalSettings {
  return {
    id: row.id,
    debateId: row.debate_id,
    maxExchanges: row.max_exchanges,
    minExchanges: row.min_exchanges,
    endDetection: {
      enabled: row.end_detection_enabled,
      checkInterval: row.end_detection_interval,
      confidenceThreshold: Number(row.end_confidence_threshold),
    },
    participantNames: row.participant_names ? JSON.parse(row.participant_names) : null,
    maxTokensPerTurn: row.max_tokens_per_turn,
    temperature: row.temperature ? Number(row.temperature) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create informal settings for a discussion
 */
export async function createInformalSettings(
  input: CreateInformalSettingsInput
): Promise<InformalSettings> {
  const query = `
    INSERT INTO informal_settings (
      debate_id,
      max_exchanges,
      min_exchanges,
      end_detection_enabled,
      end_detection_interval,
      end_confidence_threshold,
      participant_names,
      max_tokens_per_turn,
      temperature
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const values = [
    input.debateId,
    input.maxExchanges ?? INFORMAL_DEFAULTS.maxExchanges,
    input.minExchanges ?? INFORMAL_DEFAULTS.minExchanges,
    input.endDetectionEnabled ?? INFORMAL_DEFAULTS.endDetection.enabled,
    input.endDetectionInterval ?? INFORMAL_DEFAULTS.endDetection.checkInterval,
    input.endConfidenceThreshold ?? INFORMAL_DEFAULTS.endDetection.confidenceThreshold,
    input.participantNames ? JSON.stringify(input.participantNames) : null,
    input.maxTokensPerTurn ?? null,
    input.temperature ?? null,
  ];

  const result = await pool.query<InformalSettingsRow>(query, values);
  return rowToSettings(result.rows[0]!);  // Safe: INSERT always returns the created row
}

/**
 * Find informal settings by debate ID
 */
export async function findByDebateId(debateId: string): Promise<InformalSettings | null> {
  const query = 'SELECT * FROM informal_settings WHERE debate_id = $1';
  const result = await pool.query<InformalSettingsRow>(query, [debateId]);

  if (result.rows.length === 0) {
    return null;
  }

  return rowToSettings(result.rows[0]!);  // Safe: length check above
}

/**
 * Update informal settings
 */
export async function updateInformalSettings(
  debateId: string,
  updates: Partial<CreateInformalSettingsInput>
): Promise<InformalSettings | null> {
  const existing = await findByDebateId(debateId);
  if (!existing) {
    return null;
  }

  const query = `
    UPDATE informal_settings
    SET
      max_exchanges = COALESCE($2, max_exchanges),
      min_exchanges = COALESCE($3, min_exchanges),
      end_detection_enabled = COALESCE($4, end_detection_enabled),
      end_detection_interval = COALESCE($5, end_detection_interval),
      end_confidence_threshold = COALESCE($6, end_confidence_threshold),
      participant_names = COALESCE($7, participant_names),
      max_tokens_per_turn = COALESCE($8, max_tokens_per_turn),
      temperature = COALESCE($9, temperature),
      updated_at = NOW()
    WHERE debate_id = $1
    RETURNING *
  `;

  const values = [
    debateId,
    updates.maxExchanges ?? null,
    updates.minExchanges ?? null,
    updates.endDetectionEnabled ?? null,
    updates.endDetectionInterval ?? null,
    updates.endConfidenceThreshold ?? null,
    updates.participantNames ? JSON.stringify(updates.participantNames) : null,
    updates.maxTokensPerTurn ?? null,
    updates.temperature ?? null,
  ];

  const result = await pool.query<InformalSettingsRow>(query, values);
  if (result.rows.length === 0) {
    return null;
  }

  return rowToSettings(result.rows[0]!);  // Safe: length check above
}

/**
 * Delete informal settings for a debate
 */
export async function deleteByDebateId(debateId: string): Promise<boolean> {
  const query = 'DELETE FROM informal_settings WHERE debate_id = $1';
  const result = await pool.query(query, [debateId]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Update exchange count for a discussion
 */
export async function updateExchangeCount(
  debateId: string,
  exchangeCount: number
): Promise<void> {
  const query = `
    UPDATE debates
    SET exchange_count = $2
    WHERE id = $1
  `;
  await pool.query(query, [debateId, exchangeCount]);
}

/**
 * Set end trigger for a discussion
 */
export async function setEndTrigger(
  debateId: string,
  endTrigger: 'max_exchanges' | 'user_wrapup' | 'ai_detected'
): Promise<void> {
  const query = `
    UPDATE debates
    SET end_trigger = $2
    WHERE id = $1
  `;
  await pool.query(query, [debateId, endTrigger]);
}

export default {
  createInformalSettings,
  findByDebateId,
  updateInformalSettings,
  deleteByDebateId,
  updateExchangeCount,
  setEndTrigger,
};
