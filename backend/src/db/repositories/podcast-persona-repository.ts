/**
 * Podcast Persona Repository
 *
 * Handles database operations for the 12 conversational podcast personas.
 * These are distinct from debate personas - they have backstories, worldviews,
 * speaking styles, and are designed for talk show-style conversations.
 */

import type { Pool } from 'pg';
import {
  PodcastPersona,
  PodcastPersonaRow,
  VoiceCharacteristics,
} from '../../types/conversation.js';

/**
 * Lightweight persona data for dropdowns and listings
 */
export interface PodcastPersonaSummary {
  id: string;
  slug: string;
  name: string;
  avatarEmoji: string;
}

/**
 * Repository for managing podcast personas
 */
export class PodcastPersonaRepository {
  constructor(private pool: Pool) {}

  // ========== Query Operations ==========

  /**
   * Get all 12 podcast personas
   */
  async findAll(): Promise<PodcastPersona[]> {
    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas
      ORDER BY name ASC
    `);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find persona by URL-friendly slug
   */
  async findBySlug(slug: string): Promise<PodcastPersona | null> {
    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas WHERE slug = $1
    `, [slug]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find persona by UUID
   */
  async findById(id: string): Promise<PodcastPersona | null> {
    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find personas by multiple slugs (for batch loading)
   */
  async findBySlugs(slugs: string[]): Promise<PodcastPersona[]> {
    if (slugs.length === 0) return [];

    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas
      WHERE slug = ANY($1)
      ORDER BY name ASC
    `, [slugs]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find personas by multiple IDs (for batch loading)
   */
  async findByIds(ids: string[]): Promise<PodcastPersona[]> {
    if (ids.length === 0) return [];

    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas
      WHERE id = ANY($1)
      ORDER BY name ASC
    `, [ids]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find personas whose preferred topics overlap with given topics
   * Results are ordered by number of matching topics (most relevant first)
   */
  async findByTopics(topics: string[]): Promise<PodcastPersona[]> {
    if (topics.length === 0) return [];

    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas
      WHERE preferred_topics && $1
      ORDER BY
        array_length(
          ARRAY(SELECT unnest(preferred_topics) INTERSECT SELECT unnest($1::text[])),
          1
        ) DESC NULLS LAST,
        name ASC
    `, [topics]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Search personas by name, backstory, or worldview
   */
  async search(query: string): Promise<PodcastPersona[]> {
    const searchPattern = `%${query}%`;

    const result = await this.pool.query<PodcastPersonaRow>(`
      SELECT * FROM podcast_personas
      WHERE
        name ILIKE $1
        OR backstory ILIKE $1
        OR worldview ILIKE $1
      ORDER BY name ASC
    `, [searchPattern]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get count of personas (should always be 12)
   */
  async count(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`
      SELECT COUNT(*) as count FROM podcast_personas
    `);

    return parseInt(result.rows[0]?.count ?? '0');
  }

  /**
   * Get all persona slugs (lightweight query for validation)
   */
  async getAllSlugs(): Promise<string[]> {
    const result = await this.pool.query<{ slug: string }>(`
      SELECT slug FROM podcast_personas ORDER BY name ASC
    `);

    return result.rows.map(row => row.slug);
  }

  /**
   * Get persona name and emoji only (for dropdowns)
   */
  async getSummaries(): Promise<PodcastPersonaSummary[]> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      avatar_emoji: string;
    }>(`
      SELECT id, slug, name, avatar_emoji
      FROM podcast_personas
      ORDER BY name ASC
    `);

    return result.rows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      avatarEmoji: row.avatar_emoji,
    }));
  }

  /**
   * Check if a persona slug exists
   */
  async slugExists(slug: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(`
      SELECT EXISTS(SELECT 1 FROM podcast_personas WHERE slug = $1) as exists
    `, [slug]);

    return result.rows[0]?.exists ?? false;
  }

  /**
   * Get personas grouped by preferred topic
   * Useful for topic-based persona suggestions
   */
  async getPersonasByTopic(): Promise<Map<string, PodcastPersona[]>> {
    const personas = await this.findAll();
    const topicMap = new Map<string, PodcastPersona[]>();

    for (const persona of personas) {
      for (const topic of persona.preferredTopics) {
        const existing = topicMap.get(topic) || [];
        existing.push(persona);
        topicMap.set(topic, existing);
      }
    }

    return topicMap;
  }

  // ========== Update Operations ==========

  /**
   * Update a persona's default voice settings
   */
  async updateVoiceSettings(
    personaId: string,
    voiceProvider: string | null,
    voiceId: string | null,
    voiceSettings: Record<string, unknown> | null
  ): Promise<PodcastPersona | null> {
    const result = await this.pool.query<PodcastPersonaRow>(`
      UPDATE podcast_personas
      SET
        default_voice_provider = $2,
        default_voice_id = $3,
        default_voice_settings = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [personaId, voiceProvider, voiceId, voiceSettings ? JSON.stringify(voiceSettings) : null]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Clear a persona's default voice settings
   */
  async clearVoiceSettings(personaId: string): Promise<PodcastPersona | null> {
    return this.updateVoiceSettings(personaId, null, null, null);
  }

  /**
   * Update a persona's profile fields
   */
  async updateProfile(
    personaId: string,
    updates: {
      name?: string;
      avatarEmoji?: string;
      backstory?: string;
      speakingStyle?: string;
      worldview?: string;
      quirks?: string[];
      examplePhrases?: string[];
      preferredTopics?: string[];
      voiceCharacteristics?: VoiceCharacteristics;
    }
  ): Promise<PodcastPersona | null> {
    // Build dynamic update query based on provided fields
    const setClauses: string[] = [];
    const values: unknown[] = [personaId];
    let paramIndex = 2;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.avatarEmoji !== undefined) {
      setClauses.push(`avatar_emoji = $${paramIndex++}`);
      values.push(updates.avatarEmoji);
    }
    if (updates.backstory !== undefined) {
      setClauses.push(`backstory = $${paramIndex++}`);
      values.push(updates.backstory);
    }
    if (updates.speakingStyle !== undefined) {
      setClauses.push(`speaking_style = $${paramIndex++}`);
      values.push(updates.speakingStyle);
    }
    if (updates.worldview !== undefined) {
      setClauses.push(`worldview = $${paramIndex++}`);
      values.push(updates.worldview);
    }
    if (updates.quirks !== undefined) {
      setClauses.push(`quirks = $${paramIndex++}`);
      values.push(updates.quirks);
    }
    if (updates.examplePhrases !== undefined) {
      setClauses.push(`example_phrases = $${paramIndex++}`);
      values.push(updates.examplePhrases);
    }
    if (updates.preferredTopics !== undefined) {
      setClauses.push(`preferred_topics = $${paramIndex++}`);
      values.push(updates.preferredTopics);
    }
    if (updates.voiceCharacteristics !== undefined) {
      setClauses.push(`voice_characteristics = $${paramIndex++}`);
      values.push(JSON.stringify(updates.voiceCharacteristics));
    }

    // Always update updated_at
    setClauses.push('updated_at = NOW()');

    if (setClauses.length === 1) {
      // Only updated_at, nothing to change
      return this.findById(personaId);
    }

    const query = `
      UPDATE podcast_personas
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query<PodcastPersonaRow>(query, values);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  // ========== Row Mapper ==========

  private mapRow(row: PodcastPersonaRow): PodcastPersona {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      avatarEmoji: row.avatar_emoji,
      backstory: row.backstory,
      speakingStyle: row.speaking_style,
      worldview: row.worldview,
      quirks: row.quirks || [],
      voiceCharacteristics: this.parseVoiceCharacteristics(row.voice_characteristics),
      examplePhrases: row.example_phrases || [],
      preferredTopics: row.preferred_topics || [],
      defaultVoiceProvider: row.default_voice_provider ?? undefined,
      defaultVoiceId: row.default_voice_id ?? undefined,
      defaultVoiceSettings: row.default_voice_settings ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseVoiceCharacteristics(json: VoiceCharacteristics | string | null): VoiceCharacteristics {
    if (!json) return {};

    // Handle both string and object
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;

    return {
      pitch: parsed.pitch,
      pace: parsed.pace,
      warmth: parsed.warmth,
      energy: parsed.energy,
      tone: parsed.tone,
      accent: parsed.accent,
    };
  }
}

/**
 * Factory function for creating repository instances
 */
export function createPodcastPersonaRepository(pool: Pool): PodcastPersonaRepository {
  return new PodcastPersonaRepository(pool);
}

export default PodcastPersonaRepository;
