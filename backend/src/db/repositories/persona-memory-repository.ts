/**
 * Persona Memory Repository
 *
 * Handles database operations for the persona memory system:
 * - Core values (immutable personality anchors)
 * - Opinions (malleable stances with evolution tracking)
 * - Relationships (inter-persona dynamics)
 * - Configuration (admin settings)
 */

import type { Pool } from 'pg';
import {
  PersonaCoreValue,
  PersonaCoreValueRow,
  CreateCoreValueInput,
  UpdateCoreValueInput,
  PersonaOpinion,
  PersonaOpinionRow,
  CreateOpinionInput,
  UpdateOpinionInput,
  EvolveOpinionInput,
  OpinionEvolutionEntry,
  PersonaRelationship,
  PersonaRelationshipRow,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  PersonaMemoryConfig,
  PersonaMemoryConfigRow,
  UpdateMemoryConfigInput,
  PersonaMemoryContext,
  PersonaRelationshipWithNames,
  mapCoreValueRow,
  mapOpinionRow,
  mapRelationshipRow,
  mapMemoryConfigRow,
  OpinionStance,
} from '../../types/persona-memory.js';

/**
 * Repository for managing persona memory data
 */
export class PersonaMemoryRepository {
  constructor(private pool: Pool) {}

  // ============================================================================
  // Core Values Operations
  // ============================================================================

  /**
   * Get all core values for a persona
   */
  async getCoreValues(personaId: string): Promise<PersonaCoreValue[]> {
    const result = await this.pool.query<PersonaCoreValueRow>(`
      SELECT * FROM persona_core_values
      WHERE persona_id = $1
      ORDER BY priority ASC
    `, [personaId]);

    return result.rows.map(mapCoreValueRow);
  }

  /**
   * Get a single core value by ID
   */
  async getCoreValueById(id: string): Promise<PersonaCoreValue | null> {
    const result = await this.pool.query<PersonaCoreValueRow>(`
      SELECT * FROM persona_core_values WHERE id = $1
    `, [id]);

    return result.rows[0] ? mapCoreValueRow(result.rows[0]) : null;
  }

  /**
   * Create a new core value
   */
  async createCoreValue(input: CreateCoreValueInput): Promise<PersonaCoreValue> {
    const result = await this.pool.query<PersonaCoreValueRow>(`
      INSERT INTO persona_core_values (persona_id, value_type, description, priority)
      VALUES ($1, $2, $3, COALESCE($4, (
        SELECT COALESCE(MAX(priority), 0) + 1
        FROM persona_core_values
        WHERE persona_id = $1
      )))
      RETURNING *
    `, [input.personaId, input.valueType, input.description, input.priority]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create core value: no row returned');
    }
    return mapCoreValueRow(row);
  }

  /**
   * Update a core value
   */
  async updateCoreValue(id: string, input: UpdateCoreValueInput): Promise<PersonaCoreValue | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.valueType !== undefined) {
      updates.push(`value_type = $${paramIndex++}`);
      values.push(input.valueType);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(input.priority);
    }

    if (updates.length === 0) return this.getCoreValueById(id);

    values.push(id);
    const result = await this.pool.query<PersonaCoreValueRow>(`
      UPDATE persona_core_values
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0] ? mapCoreValueRow(result.rows[0]) : null;
  }

  /**
   * Delete a core value
   */
  async deleteCoreValue(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM persona_core_values WHERE id = $1
    `, [id]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Reorder core values for a persona
   */
  async reorderCoreValues(personaId: string, orderedIds: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(`
          UPDATE persona_core_values
          SET priority = $1
          WHERE id = $2 AND persona_id = $3
        `, [i + 1, orderedIds[i], personaId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Opinions Operations
  // ============================================================================

  /**
   * Get all opinions for a persona
   */
  async getOpinions(personaId: string): Promise<PersonaOpinion[]> {
    const result = await this.pool.query<PersonaOpinionRow>(`
      SELECT * FROM persona_opinions
      WHERE persona_id = $1
      ORDER BY last_discussed_at DESC NULLS LAST, created_at DESC
    `, [personaId]);

    return result.rows.map(mapOpinionRow);
  }

  /**
   * Get a single opinion by ID
   */
  async getOpinionById(id: string): Promise<PersonaOpinion | null> {
    const result = await this.pool.query<PersonaOpinionRow>(`
      SELECT * FROM persona_opinions WHERE id = $1
    `, [id]);

    return result.rows[0] ? mapOpinionRow(result.rows[0]) : null;
  }

  /**
   * Get an opinion by persona and topic key
   */
  async getOpinionByTopic(personaId: string, topicKey: string): Promise<PersonaOpinion | null> {
    const result = await this.pool.query<PersonaOpinionRow>(`
      SELECT * FROM persona_opinions
      WHERE persona_id = $1 AND topic_key = $2
    `, [personaId, topicKey]);

    return result.rows[0] ? mapOpinionRow(result.rows[0]) : null;
  }

  /**
   * Get opinions relevant to a topic (fuzzy match on topic key)
   */
  async getRelevantOpinions(personaId: string, topicKeys: string[], limit: number = 5): Promise<PersonaOpinion[]> {
    if (topicKeys.length === 0) return [];

    const result = await this.pool.query<PersonaOpinionRow>(`
      SELECT * FROM persona_opinions
      WHERE persona_id = $1
        AND topic_key = ANY($2)
      ORDER BY stance_strength DESC, discussion_count DESC
      LIMIT $3
    `, [personaId, topicKeys, limit]);

    return result.rows.map(mapOpinionRow);
  }

  /**
   * Search opinions by topic display or summary text
   */
  async searchOpinions(personaId: string, query: string): Promise<PersonaOpinion[]> {
    const searchPattern = `%${query}%`;

    const result = await this.pool.query<PersonaOpinionRow>(`
      SELECT * FROM persona_opinions
      WHERE persona_id = $1
        AND (topic_display ILIKE $2 OR summary ILIKE $2 OR topic_key ILIKE $2)
      ORDER BY last_discussed_at DESC NULLS LAST
    `, [personaId, searchPattern]);

    return result.rows.map(mapOpinionRow);
  }

  /**
   * Create a new opinion
   */
  async createOpinion(input: CreateOpinionInput): Promise<PersonaOpinion> {
    const result = await this.pool.query<PersonaOpinionRow>(`
      INSERT INTO persona_opinions (
        persona_id, topic_key, topic_display, stance, stance_strength,
        summary, key_arguments, can_evolve, admin_curated,
        first_discussed_at, last_discussed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `, [
      input.personaId,
      input.topicKey,
      input.topicDisplay,
      input.stance,
      input.stanceStrength ?? 0.5,
      input.summary,
      input.keyArguments ?? [],
      input.canEvolve ?? true,
      input.adminCurated ?? false,
    ]);

    const opinionRow = result.rows[0];
    if (!opinionRow) {
      throw new Error('Failed to create opinion: no row returned');
    }
    return mapOpinionRow(opinionRow);
  }

  /**
   * Update an opinion (admin edit)
   */
  async updateOpinion(id: string, input: UpdateOpinionInput): Promise<PersonaOpinion | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.topicDisplay !== undefined) {
      updates.push(`topic_display = $${paramIndex++}`);
      values.push(input.topicDisplay);
    }
    if (input.stance !== undefined) {
      updates.push(`stance = $${paramIndex++}`);
      values.push(input.stance);
    }
    if (input.stanceStrength !== undefined) {
      updates.push(`stance_strength = $${paramIndex++}`);
      values.push(input.stanceStrength);
    }
    if (input.summary !== undefined) {
      updates.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }
    if (input.keyArguments !== undefined) {
      updates.push(`key_arguments = $${paramIndex++}`);
      values.push(input.keyArguments);
    }
    if (input.canEvolve !== undefined) {
      updates.push(`can_evolve = $${paramIndex++}`);
      values.push(input.canEvolve);
    }
    if (input.adminCurated !== undefined) {
      updates.push(`admin_curated = $${paramIndex++}`);
      values.push(input.adminCurated);
    }

    values.push(id);
    const result = await this.pool.query<PersonaOpinionRow>(`
      UPDATE persona_opinions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0] ? mapOpinionRow(result.rows[0]) : null;
  }

  /**
   * Evolve an opinion (automatic evolution from conversation)
   * Records the change in evolution_history
   */
  async evolveOpinion(id: string, input: EvolveOpinionInput): Promise<PersonaOpinion | null> {
    // First get the current opinion
    const current = await this.getOpinionById(id);
    if (!current) return null;
    if (!current.canEvolve) return current; // Locked by admin

    // Create evolution entry
    const evolutionEntry: OpinionEvolutionEntry = {
      date: new Date().toISOString(),
      oldStance: current.stance,
      newStance: input.newStance,
      oldStrength: current.stanceStrength,
      newStrength: input.newStrength,
      reason: input.reason,
      sessionId: input.sessionId,
    };

    const result = await this.pool.query<PersonaOpinionRow>(`
      UPDATE persona_opinions
      SET
        stance = $1,
        stance_strength = $2,
        evolution_history = evolution_history || $3::jsonb,
        last_discussed_at = NOW(),
        discussion_count = discussion_count + 1,
        source_session_ids = CASE
          WHEN $4::uuid IS NOT NULL THEN array_append(source_session_ids, $4::uuid)
          ELSE source_session_ids
        END,
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [input.newStance, input.newStrength, JSON.stringify(evolutionEntry), input.sessionId, id]);

    return result.rows[0] ? mapOpinionRow(result.rows[0]) : null;
  }

  /**
   * Upsert an opinion (create or update based on topic key)
   * Used by the memory extraction service
   */
  async upsertOpinion(
    personaId: string,
    topicKey: string,
    stance: OpinionStance,
    stanceStrength: number,
    summary: string,
    keyArgument: string | undefined,
    sessionId: string | undefined
  ): Promise<PersonaOpinion> {
    // Check for existing opinion
    const existing = await this.getOpinionByTopic(personaId, topicKey);

    if (existing) {
      // Update existing opinion
      if (existing.canEvolve && stanceStrength >= (await this.getConfig()).evolutionThreshold) {
        return (await this.evolveOpinion(existing.id, {
          newStance: stance,
          newStrength: stanceStrength,
          reason: `Auto-evolved from conversation`,
          sessionId,
        }))!;
      }

      // Just update discussion tracking
      const result = await this.pool.query<PersonaOpinionRow>(`
        UPDATE persona_opinions
        SET
          last_discussed_at = NOW(),
          discussion_count = discussion_count + 1,
          source_session_ids = CASE
            WHEN $1::uuid IS NOT NULL THEN array_append(source_session_ids, $1::uuid)
            ELSE source_session_ids
          END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [sessionId, existing.id]);

      const updatedRow = result.rows[0];
      if (!updatedRow) {
        throw new Error(`Failed to update opinion tracking: opinion ${existing.id} not found`);
      }
      return mapOpinionRow(updatedRow);
    }

    // Create new opinion
    return this.createOpinion({
      personaId,
      topicKey,
      topicDisplay: this.formatTopicDisplay(topicKey),
      stance,
      stanceStrength,
      summary,
      keyArguments: keyArgument ? [keyArgument] : [],
      canEvolve: true,
      adminCurated: false,
    });
  }

  /**
   * Delete an opinion
   */
  async deleteOpinion(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM persona_opinions WHERE id = $1
    `, [id]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get opinion count for a persona
   */
  async getOpinionCount(personaId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`
      SELECT COUNT(*) as count FROM persona_opinions WHERE persona_id = $1
    `, [personaId]);

    return parseInt(result.rows[0]?.count ?? '0');
  }

  // ============================================================================
  // Relationships Operations
  // ============================================================================

  /**
   * Get all relationships for a persona
   */
  async getRelationships(personaId: string): Promise<PersonaRelationship[]> {
    const result = await this.pool.query<PersonaRelationshipRow>(`
      SELECT * FROM persona_relationships
      WHERE persona_id = $1
      ORDER BY rapport_score DESC
    `, [personaId]);

    return result.rows.map(mapRelationshipRow);
  }

  /**
   * Get relationship between two personas
   */
  async getRelationship(personaId: string, otherPersonaId: string): Promise<PersonaRelationship | null> {
    const result = await this.pool.query<PersonaRelationshipRow>(`
      SELECT * FROM persona_relationships
      WHERE persona_id = $1 AND other_persona_id = $2
    `, [personaId, otherPersonaId]);

    return result.rows[0] ? mapRelationshipRow(result.rows[0]) : null;
  }

  /**
   * Get a relationship by ID
   */
  async getRelationshipById(id: string): Promise<PersonaRelationship | null> {
    const result = await this.pool.query<PersonaRelationshipRow>(`
      SELECT * FROM persona_relationships WHERE id = $1
    `, [id]);

    return result.rows[0] ? mapRelationshipRow(result.rows[0]) : null;
  }

  /**
   * Get relationships with persona names included
   * Used for prompt injection
   */
  async getRelationshipsWithNames(personaId: string, otherPersonaIds: string[]): Promise<PersonaRelationshipWithNames[]> {
    if (otherPersonaIds.length === 0) return [];

    const result = await this.pool.query<PersonaRelationshipRow & { persona_name: string; other_persona_name: string }>(`
      SELECT
        r.*,
        p1.name as persona_name,
        p2.name as other_persona_name
      FROM persona_relationships r
      JOIN podcast_personas p1 ON r.persona_id = p1.id
      JOIN podcast_personas p2 ON r.other_persona_id = p2.id
      WHERE r.persona_id = $1 AND r.other_persona_id = ANY($2)
      ORDER BY r.rapport_score DESC
    `, [personaId, otherPersonaIds]);

    return result.rows.map(row => ({
      ...mapRelationshipRow(row),
      personaName: row.persona_name,
      otherPersonaName: row.other_persona_name,
    }));
  }

  /**
   * Create a new relationship
   */
  async createRelationship(input: CreateRelationshipInput): Promise<PersonaRelationship> {
    const result = await this.pool.query<PersonaRelationshipRow>(`
      INSERT INTO persona_relationships (
        persona_id, other_persona_id, rapport_score, dynamic_type,
        common_ground, friction_points, notable_exchanges
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      input.personaId,
      input.otherPersonaId,
      input.rapportScore ?? 0.5,
      input.dynamicType,
      input.commonGround ?? [],
      input.frictionPoints ?? [],
      input.notableExchanges ?? [],
    ]);

    const relRow = result.rows[0];
    if (!relRow) {
      throw new Error('Failed to create relationship: no row returned');
    }
    return mapRelationshipRow(relRow);
  }

  /**
   * Update a relationship
   */
  async updateRelationship(id: string, input: UpdateRelationshipInput): Promise<PersonaRelationship | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.rapportScore !== undefined) {
      updates.push(`rapport_score = $${paramIndex++}`);
      values.push(input.rapportScore);
    }
    if (input.dynamicType !== undefined) {
      updates.push(`dynamic_type = $${paramIndex++}`);
      values.push(input.dynamicType);
    }
    if (input.commonGround !== undefined) {
      updates.push(`common_ground = $${paramIndex++}`);
      values.push(input.commonGround);
    }
    if (input.frictionPoints !== undefined) {
      updates.push(`friction_points = $${paramIndex++}`);
      values.push(input.frictionPoints);
    }
    if (input.notableExchanges !== undefined) {
      updates.push(`notable_exchanges = $${paramIndex++}`);
      values.push(input.notableExchanges);
    }

    values.push(id);
    const result = await this.pool.query<PersonaRelationshipRow>(`
      UPDATE persona_relationships
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0] ? mapRelationshipRow(result.rows[0]) : null;
  }

  /**
   * Record an interaction between personas (increments counter)
   */
  async recordInteraction(personaId: string, otherPersonaId: string): Promise<void> {
    await this.pool.query(`
      UPDATE persona_relationships
      SET
        interaction_count = interaction_count + 1,
        last_interaction_at = NOW(),
        updated_at = NOW()
      WHERE persona_id = $1 AND other_persona_id = $2
    `, [personaId, otherPersonaId]);
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM persona_relationships WHERE id = $1
    `, [id]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Create bidirectional relationship (both directions)
   */
  async createBidirectionalRelationship(
    personaId: string,
    otherPersonaId: string,
    input: Omit<CreateRelationshipInput, 'personaId' | 'otherPersonaId'>
  ): Promise<[PersonaRelationship, PersonaRelationship]> {
    const r1 = await this.createRelationship({ ...input, personaId, otherPersonaId });
    const r2 = await this.createRelationship({ ...input, personaId: otherPersonaId, otherPersonaId: personaId });
    return [r1, r2];
  }

  // ============================================================================
  // Configuration Operations
  // ============================================================================

  /**
   * Get the memory configuration (single row)
   */
  async getConfig(): Promise<PersonaMemoryConfig> {
    const result = await this.pool.query<PersonaMemoryConfigRow>(`
      SELECT * FROM persona_memory_config LIMIT 1
    `);

    if (!result.rows[0]) {
      // Create default config if none exists
      const insertResult = await this.pool.query<PersonaMemoryConfigRow>(`
        INSERT INTO persona_memory_config DEFAULT VALUES
        RETURNING *
      `);
      const insertedRow = insertResult.rows[0];
      if (!insertedRow) {
        throw new Error('Failed to create default memory config');
      }
      return mapMemoryConfigRow(insertedRow);
    }

    return mapMemoryConfigRow(result.rows[0]);
  }

  /**
   * Update the memory configuration
   */
  async updateConfig(input: UpdateMemoryConfigInput): Promise<PersonaMemoryConfig> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.extractionModel !== undefined) {
      updates.push(`extraction_model = $${paramIndex++}`);
      values.push(input.extractionModel);
    }
    if (input.extractionEnabled !== undefined) {
      updates.push(`extraction_enabled = $${paramIndex++}`);
      values.push(input.extractionEnabled);
    }
    if (input.autoEvolutionEnabled !== undefined) {
      updates.push(`auto_evolution_enabled = $${paramIndex++}`);
      values.push(input.autoEvolutionEnabled);
    }
    if (input.evolutionThreshold !== undefined) {
      updates.push(`evolution_threshold = $${paramIndex++}`);
      values.push(input.evolutionThreshold);
    }
    if (input.maxOpinionsInPrompt !== undefined) {
      updates.push(`max_opinions_in_prompt = $${paramIndex++}`);
      values.push(input.maxOpinionsInPrompt);
    }
    if (input.maxContextTokens !== undefined) {
      updates.push(`max_context_tokens = $${paramIndex++}`);
      values.push(input.maxContextTokens);
    }

    const result = await this.pool.query<PersonaMemoryConfigRow>(`
      UPDATE persona_memory_config
      SET ${updates.join(', ')}
      WHERE id = (SELECT id FROM persona_memory_config LIMIT 1)
      RETURNING *
    `, values);

    const configRow = result.rows[0];
    if (!configRow) {
      throw new Error('Failed to update memory config: no config row found');
    }
    return mapMemoryConfigRow(configRow);
  }

  // ============================================================================
  // Memory Context Builder
  // ============================================================================

  /**
   * Build the full memory context for a persona in a conversation
   * Used for prompt injection
   */
  async buildMemoryContext(
    personaId: string,
    topicKeys: string[],
    otherPersonaIds: string[]
  ): Promise<PersonaMemoryContext> {
    const config = await this.getConfig();

    const [coreValues, relevantOpinions, relationships] = await Promise.all([
      this.getCoreValues(personaId),
      this.getRelevantOpinions(personaId, topicKeys, config.maxOpinionsInPrompt),
      this.getRelationshipsWithNames(personaId, otherPersonaIds),
    ]);

    return {
      coreValues,
      relevantOpinions,
      relationships,
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Format a topic key into a display name
   * e.g., 'ai_regulation' -> 'AI Regulation'
   */
  private formatTopicDisplay(topicKey: string): string {
    return topicKey
      .split('_')
      .map(word => {
        // Special case for common acronyms
        const acronyms = ['ai', 'ml', 'iot', 'api', 'ui', 'ux', 'gdpr'];
        if (acronyms.includes(word.toLowerCase())) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  /**
   * Normalize a topic string into a key
   * e.g., 'AI Regulation' -> 'ai_regulation'
   */
  normalizeTopicKey(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
}

/**
 * Factory function for creating repository instances
 */
export function createPersonaMemoryRepository(pool: Pool): PersonaMemoryRepository {
  return new PersonaMemoryRepository(pool);
}

export default PersonaMemoryRepository;
