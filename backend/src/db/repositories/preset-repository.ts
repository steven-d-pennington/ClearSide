/**
 * Preset Repository
 *
 * Handles database operations for debate presets.
 */

import { pool } from '../connection.js';
import type { DebatePreset, PresetMode, BrevityLevel } from '../../types/configuration.js';

/**
 * Raw database row for debate_presets table
 */
interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  brevity_level: number;
  llm_temperature: string; // DECIMAL comes as string
  max_tokens_per_response: number;
  require_citations: boolean;
  is_system_preset: boolean;
  pro_model_id: string | null;
  con_model_id: string | null;
  moderator_model_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new preset
 */
export interface CreatePresetInput {
  id: string;
  name: string;
  description?: string | null;
  brevityLevel: number;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
  isSystemPreset?: boolean;
  proModelId?: string | null;
  conModelId?: string | null;
  moderatorModelId?: string | null;
}

/**
 * Input for updating a preset
 */
export interface UpdatePresetInput {
  name?: string;
  description?: string | null;
  brevityLevel?: number;
  llmTemperature?: number;
  maxTokensPerResponse?: number;
  requireCitations?: boolean;
  proModelId?: string | null;
  conModelId?: string | null;
  moderatorModelId?: string | null;
}

/**
 * Map database row to DebatePreset
 */
function mapRowToPreset(row: PresetRow): DebatePreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    brevityLevel: row.brevity_level as BrevityLevel,
    llmTemperature: parseFloat(row.llm_temperature),
    maxTokensPerResponse: row.max_tokens_per_response,
    requireCitations: row.require_citations,
    isSystemPreset: row.is_system_preset,
    proModelId: row.pro_model_id,
    conModelId: row.con_model_id,
    moderatorModelId: row.moderator_model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all system presets
 */
export async function listSystemPresets(): Promise<DebatePreset[]> {
  const query = `
    SELECT * FROM debate_presets
    WHERE is_system_preset = true
    ORDER BY
      CASE id
        WHEN 'quick' THEN 1
        WHEN 'balanced' THEN 2
        WHEN 'deep_dive' THEN 3
        WHEN 'research' THEN 4
        ELSE 5
      END
  `;

  const result = await pool.query<PresetRow>(query);
  return result.rows.map(mapRowToPreset);
}

/**
 * Get all presets (system and user-created)
 */
export async function listAll(): Promise<DebatePreset[]> {
  const query = `
    SELECT * FROM debate_presets
    ORDER BY is_system_preset DESC, name ASC
  `;

  const result = await pool.query<PresetRow>(query);
  return result.rows.map(mapRowToPreset);
}

/**
 * Get a preset by ID
 */
export async function findById(id: string): Promise<DebatePreset | null> {
  const query = `SELECT * FROM debate_presets WHERE id = $1`;
  const result = await pool.query<PresetRow>(query, [id]);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRowToPreset(row);
}

/**
 * Check if a preset exists
 */
export async function exists(id: string): Promise<boolean> {
  const query = `SELECT 1 FROM debate_presets WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows.length > 0;
}

/**
 * Get configuration values for a preset (for applying to debates)
 */
export async function getPresetConfiguration(presetId: PresetMode): Promise<{
  brevityLevel: number;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
} | null> {
  const preset = await findById(presetId);
  if (!preset) return null;

  return {
    brevityLevel: preset.brevityLevel,
    llmTemperature: preset.llmTemperature,
    maxTokensPerResponse: preset.maxTokensPerResponse,
    requireCitations: preset.requireCitations,
  };
}

/**
 * Create a new preset
 */
export async function create(input: CreatePresetInput): Promise<DebatePreset> {
  const query = `
    INSERT INTO debate_presets (
      id, name, description, brevity_level, llm_temperature,
      max_tokens_per_response, require_citations, is_system_preset,
      pro_model_id, con_model_id, moderator_model_id,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    RETURNING *
  `;

  const result = await pool.query<PresetRow>(query, [
    input.id,
    input.name,
    input.description ?? null,
    input.brevityLevel,
    input.llmTemperature,
    input.maxTokensPerResponse,
    input.requireCitations,
    input.isSystemPreset ?? false,
    input.proModelId ?? null,
    input.conModelId ?? null,
    input.moderatorModelId ?? null,
  ]);

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create preset');
  }
  return mapRowToPreset(row);
}

/**
 * Update an existing preset
 */
export async function update(id: string, input: UpdatePresetInput): Promise<DebatePreset | null> {
  // Build dynamic update query based on provided fields
  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.brevityLevel !== undefined) {
    updates.push(`brevity_level = $${paramIndex++}`);
    values.push(input.brevityLevel);
  }
  if (input.llmTemperature !== undefined) {
    updates.push(`llm_temperature = $${paramIndex++}`);
    values.push(input.llmTemperature);
  }
  if (input.maxTokensPerResponse !== undefined) {
    updates.push(`max_tokens_per_response = $${paramIndex++}`);
    values.push(input.maxTokensPerResponse);
  }
  if (input.requireCitations !== undefined) {
    updates.push(`require_citations = $${paramIndex++}`);
    values.push(input.requireCitations);
  }
  if (input.proModelId !== undefined) {
    updates.push(`pro_model_id = $${paramIndex++}`);
    values.push(input.proModelId);
  }
  if (input.conModelId !== undefined) {
    updates.push(`con_model_id = $${paramIndex++}`);
    values.push(input.conModelId);
  }
  if (input.moderatorModelId !== undefined) {
    updates.push(`moderator_model_id = $${paramIndex++}`);
    values.push(input.moderatorModelId);
  }

  if (updates.length === 0) {
    // No updates provided, return existing preset
    return findById(id);
  }

  // Add updated_at
  updates.push(`updated_at = NOW()`);

  // Add id as last parameter
  values.push(id);

  const query = `
    UPDATE debate_presets
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query<PresetRow>(query, values);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRowToPreset(row);
}

/**
 * Delete a preset by ID
 */
export async function deleteById(id: string): Promise<boolean> {
  const query = `DELETE FROM debate_presets WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}

// Export all functions as named exports
export const presetRepository = {
  listSystemPresets,
  listAll,
  findById,
  exists,
  getPresetConfiguration,
  create,
  update,
  deleteById,
};

export default presetRepository;
