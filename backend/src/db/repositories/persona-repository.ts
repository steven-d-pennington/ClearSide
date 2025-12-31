/**
 * Persona Repository
 *
 * Handles database operations for debate personas.
 */

import { pool } from '../connection.js';
import type { Persona, PersonaSummary, PersonaArchetype } from '../../types/configuration.js';

/**
 * Raw database row for personas table
 */
interface PersonaRow {
  id: string;
  name: string;
  archetype: string;
  description: string | null;
  argumentation_style: string;
  vocabulary_hints: string | null;
  focus_areas: string[];
  rhetorical_preferences: string | null;
  system_prompt_addition: string;
  avatar_emoji: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  is_system_persona: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map database row to Persona
 */
function mapRowToPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype as PersonaArchetype,
    description: row.description,
    argumentationStyle: row.argumentation_style,
    vocabularyHints: row.vocabulary_hints,
    focusAreas: row.focus_areas ?? [],
    rhetoricalPreferences: row.rhetorical_preferences,
    systemPromptAddition: row.system_prompt_addition,
    avatarEmoji: row.avatar_emoji,
    colorPrimary: row.color_primary,
    colorSecondary: row.color_secondary,
    isSystemPersona: row.is_system_persona,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map row to PersonaSummary (for listings)
 */
function mapRowToSummary(row: PersonaRow): PersonaSummary {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype as PersonaArchetype,
    description: row.description,
    avatarEmoji: row.avatar_emoji,
    colorPrimary: row.color_primary,
  };
}

/**
 * Input for creating a new persona
 */
export interface CreatePersonaInput {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  description?: string | null;
  argumentationStyle: string;
  vocabularyHints?: string | null;
  focusAreas?: string[];
  rhetoricalPreferences?: string | null;
  systemPromptAddition: string;
  avatarEmoji?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  isSystemPersona?: boolean;
}

/**
 * Input for updating a persona
 */
export interface UpdatePersonaInput {
  name?: string;
  archetype?: PersonaArchetype;
  description?: string | null;
  argumentationStyle?: string;
  vocabularyHints?: string | null;
  focusAreas?: string[];
  rhetoricalPreferences?: string | null;
  systemPromptAddition?: string;
  avatarEmoji?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
}

/**
 * Get all system personas
 */
export async function listSystemPersonas(): Promise<Persona[]> {
  const query = `
    SELECT * FROM personas
    WHERE is_system_persona = true
    ORDER BY
      CASE archetype
        WHEN 'academic' THEN 1
        WHEN 'pragmatic' THEN 2
        WHEN 'empirical' THEN 3
        WHEN 'legal' THEN 4
        WHEN 'economic' THEN 5
        WHEN 'moral' THEN 6
        ELSE 7
      END
  `;

  const result = await pool.query<PersonaRow>(query);
  return result.rows.map(mapRowToPersona);
}

/**
 * Get persona summaries for selection UI
 */
export async function listPersonaSummaries(): Promise<PersonaSummary[]> {
  const query = `
    SELECT id, name, archetype, description, avatar_emoji, color_primary
    FROM personas
    WHERE is_system_persona = true
    ORDER BY name
  `;

  const result = await pool.query<PersonaRow>(query);
  return result.rows.map(mapRowToSummary);
}

/**
 * Get all personas
 */
export async function listAll(): Promise<Persona[]> {
  const query = `
    SELECT * FROM personas
    ORDER BY is_system_persona DESC, name ASC
  `;

  const result = await pool.query<PersonaRow>(query);
  return result.rows.map(mapRowToPersona);
}

/**
 * Get a persona by ID
 */
export async function findById(id: string): Promise<Persona | null> {
  const query = `SELECT * FROM personas WHERE id = $1`;
  const result = await pool.query<PersonaRow>(query, [id]);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRowToPersona(row);
}

/**
 * Get personas by archetype
 */
export async function findByArchetype(archetype: PersonaArchetype): Promise<Persona[]> {
  const query = `
    SELECT * FROM personas
    WHERE archetype = $1
    ORDER BY name
  `;

  const result = await pool.query<PersonaRow>(query, [archetype]);
  return result.rows.map(mapRowToPersona);
}

/**
 * Check if a persona exists
 */
export async function exists(id: string): Promise<boolean> {
  const query = `SELECT 1 FROM personas WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows.length > 0;
}

/**
 * Get the system prompt addition for a persona
 * Returns null if persona doesn't exist
 */
export async function getSystemPromptAddition(id: string): Promise<string | null> {
  const query = `SELECT system_prompt_addition FROM personas WHERE id = $1`;
  const result = await pool.query<{ system_prompt_addition: string }>(query, [id]);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return row.system_prompt_addition;
}

/**
 * Get personas for both sides of a debate (handles null)
 */
export async function getDebatePersonas(
  proPersonaId: string | null,
  conPersonaId: string | null
): Promise<{ pro: Persona | null; con: Persona | null }> {
  const pro = proPersonaId ? await findById(proPersonaId) : null;
  const con = conPersonaId ? await findById(conPersonaId) : null;
  return { pro, con };
}

/**
 * Create a new persona
 */
export async function create(input: CreatePersonaInput): Promise<Persona> {
  const query = `
    INSERT INTO personas (
      id, name, archetype, description, argumentation_style,
      vocabulary_hints, focus_areas, rhetorical_preferences,
      system_prompt_addition, avatar_emoji, color_primary,
      color_secondary, is_system_persona, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    RETURNING *
  `;

  const result = await pool.query<PersonaRow>(query, [
    input.id,
    input.name,
    input.archetype,
    input.description ?? null,
    input.argumentationStyle,
    input.vocabularyHints ?? null,
    input.focusAreas ?? [],
    input.rhetoricalPreferences ?? null,
    input.systemPromptAddition,
    input.avatarEmoji ?? null,
    input.colorPrimary ?? null,
    input.colorSecondary ?? null,
    input.isSystemPersona ?? false,
  ]);

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create persona');
  }
  return mapRowToPersona(row);
}

/**
 * Update an existing persona
 */
export async function update(id: string, input: UpdatePersonaInput): Promise<Persona | null> {
  // Build dynamic update query based on provided fields
  const updates: string[] = [];
  const values: (string | string[] | null)[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.archetype !== undefined) {
    updates.push(`archetype = $${paramIndex++}`);
    values.push(input.archetype);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.argumentationStyle !== undefined) {
    updates.push(`argumentation_style = $${paramIndex++}`);
    values.push(input.argumentationStyle);
  }
  if (input.vocabularyHints !== undefined) {
    updates.push(`vocabulary_hints = $${paramIndex++}`);
    values.push(input.vocabularyHints);
  }
  if (input.focusAreas !== undefined) {
    updates.push(`focus_areas = $${paramIndex++}`);
    values.push(input.focusAreas);
  }
  if (input.rhetoricalPreferences !== undefined) {
    updates.push(`rhetorical_preferences = $${paramIndex++}`);
    values.push(input.rhetoricalPreferences);
  }
  if (input.systemPromptAddition !== undefined) {
    updates.push(`system_prompt_addition = $${paramIndex++}`);
    values.push(input.systemPromptAddition);
  }
  if (input.avatarEmoji !== undefined) {
    updates.push(`avatar_emoji = $${paramIndex++}`);
    values.push(input.avatarEmoji);
  }
  if (input.colorPrimary !== undefined) {
    updates.push(`color_primary = $${paramIndex++}`);
    values.push(input.colorPrimary);
  }
  if (input.colorSecondary !== undefined) {
    updates.push(`color_secondary = $${paramIndex++}`);
    values.push(input.colorSecondary);
  }

  if (updates.length === 0) {
    // No updates provided, return existing persona
    return findById(id);
  }

  // Add updated_at
  updates.push(`updated_at = NOW()`);

  // Add id as last parameter
  values.push(id);

  const query = `
    UPDATE personas
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query<PersonaRow>(query, values);

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRowToPersona(row);
}

/**
 * Delete a persona by ID
 */
export async function deleteById(id: string): Promise<boolean> {
  const query = `DELETE FROM personas WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}

// Export as object for easier mocking
export const personaRepository = {
  listSystemPersonas,
  listPersonaSummaries,
  listAll,
  findById,
  findByArchetype,
  exists,
  getSystemPromptAddition,
  getDebatePersonas,
  create,
  update,
  deleteById,
};

export default personaRepository;
