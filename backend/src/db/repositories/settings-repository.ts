/**
 * Settings Repository
 *
 * Handles database operations for system-wide settings.
 */

import { pool } from '../connection.js';

/**
 * Model defaults for manual mode selection
 */
export interface ModelDefaults {
  proModelId: string | null;
  conModelId: string | null;
  moderatorModelId: string | null;
}

/**
 * Raw database row for system_settings table
 */
interface SettingsRow {
  key: string;
  value: unknown;
  updated_at: Date;
}

/**
 * Get a setting by key
 */
export async function get<T>(key: string): Promise<T | null> {
  const query = `SELECT value FROM system_settings WHERE key = $1`;
  const result = await pool.query<{ value: T }>(query, [key]);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return row.value;
}

/**
 * Set a setting by key (upsert)
 */
export async function set<T>(key: string, value: T): Promise<void> {
  const query = `
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = $2,
      updated_at = NOW()
  `;

  await pool.query(query, [key, JSON.stringify(value)]);
}

/**
 * Delete a setting by key
 */
export async function deleteByKey(key: string): Promise<boolean> {
  const query = `DELETE FROM system_settings WHERE key = $1`;
  const result = await pool.query(query, [key]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * List all settings
 */
export async function listAll(): Promise<Array<{ key: string; value: unknown; updatedAt: Date }>> {
  const query = `SELECT key, value, updated_at FROM system_settings ORDER BY key`;
  const result = await pool.query<SettingsRow>(query);

  return result.rows.map(row => ({
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get default model settings
 */
export async function getDefaultModels(): Promise<ModelDefaults> {
  const defaults = await get<ModelDefaults>('default_models');

  // Return defaults or empty values
  return defaults ?? {
    proModelId: null,
    conModelId: null,
    moderatorModelId: null,
  };
}

/**
 * Set default model settings
 */
export async function setDefaultModels(defaults: ModelDefaults): Promise<void> {
  await set('default_models', defaults);
}

// Export all functions as named exports
export const settingsRepository = {
  get,
  set,
  deleteByKey,
  listAll,
  getDefaultModels,
  setDefaultModels,
};

export default settingsRepository;
