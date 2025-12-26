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
  created_at: Date;
  updated_at: Date;
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

// Export all functions as named exports
export const presetRepository = {
  listSystemPresets,
  listAll,
  findById,
  exists,
  getPresetConfiguration,
};

export default presetRepository;
