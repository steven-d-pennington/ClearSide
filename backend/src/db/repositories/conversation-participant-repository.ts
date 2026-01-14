/**
 * Conversation Participant Repository
 *
 * Handles database operations for conversation participants,
 * including persona and model assignments.
 */

import type { Pool } from 'pg';
import {
  ConversationParticipant,
  ConversationParticipantRow,
  ParticipantConfig,
  PodcastPersona,
  VoiceCharacteristics,
  mapParticipantRow,
} from '../../types/conversation.js';

/**
 * Extended row type with persona data
 */
interface ParticipantWithPersonaRow extends ConversationParticipantRow {
  persona_slug: string;
  persona_name: string;
  avatar_emoji: string;
  backstory: string;
  speaking_style: string;
  worldview: string;
  quirks: string[];
  voice_characteristics: VoiceCharacteristics;
  example_phrases: string[];
  preferred_topics: string[];
  default_voice_provider: string | null;
  default_voice_id: string | null;
  default_voice_settings: Record<string, unknown> | null;
  persona_created_at: Date;
  persona_updated_at: Date;
}

/**
 * Input for creating a single participant with persona ID
 */
export interface CreateParticipantInput {
  sessionId: string;
  personaId: string;
  modelId: string;
  modelDisplayName?: string;
  providerName?: string;
  displayNameOverride?: string;
  participantOrder: number;
}

/**
 * Repository for managing conversation participants
 */
export class ConversationParticipantRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a single participant with persona ID
   */
  async create(input: CreateParticipantInput): Promise<ConversationParticipant> {
    const result = await this.pool.query<ConversationParticipantRow>(`
      INSERT INTO conversation_participants (
        session_id, persona_id, model_id, model_display_name,
        provider_name, display_name_override, participant_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      input.sessionId,
      input.personaId,
      input.modelId,
      input.modelDisplayName || null,
      input.providerName || null,
      input.displayNameOverride || null,
      input.participantOrder,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create participant');
    }
    return mapParticipantRow(row);
  }

  /**
   * Create participants for a session (batch insert with slug lookup)
   */
  async createForSession(
    sessionId: string,
    configs: ParticipantConfig[]
  ): Promise<ConversationParticipant[]> {
    const participants: ConversationParticipant[] = [];

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      if (!config) continue;

      // Lookup persona ID by slug
      const personaResult = await this.pool.query<{ id: string }>(`
        SELECT id FROM podcast_personas WHERE slug = $1
      `, [config.personaSlug]);

      const personaRow = personaResult.rows[0];
      if (!personaRow) {
        throw new Error(`Persona not found: ${config.personaSlug}`);
      }

      const result = await this.pool.query<ConversationParticipantRow>(`
        INSERT INTO conversation_participants (
          session_id, persona_id, model_id, model_display_name,
          provider_name, display_name_override, participant_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        sessionId,
        personaRow.id,
        config.modelId,
        config.modelDisplayName || null,
        config.providerName || null,
        config.displayNameOverride || null,
        i,
      ]);

      const participantRow = result.rows[0];
      if (!participantRow) {
        throw new Error('Failed to create participant');
      }
      participants.push(mapParticipantRow(participantRow));
    }

    return participants;
  }

  /**
   * Find all participants for a session with persona data
   */
  async findBySessionId(sessionId: string): Promise<ConversationParticipant[]> {
    const result = await this.pool.query<ParticipantWithPersonaRow>(`
      SELECT cp.*,
             pp.slug as persona_slug,
             pp.name as persona_name,
             pp.avatar_emoji,
             pp.backstory,
             pp.speaking_style,
             pp.worldview,
             pp.quirks,
             pp.voice_characteristics,
             pp.example_phrases,
             pp.preferred_topics,
             pp.default_voice_provider,
             pp.default_voice_id,
             pp.default_voice_settings,
             pp.created_at as persona_created_at,
             pp.updated_at as persona_updated_at
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.session_id = $1
      ORDER BY cp.participant_order ASC
    `, [sessionId]);

    return result.rows.map(row => this.mapRowWithPersona(row));
  }

  /**
   * Find a participant by ID with persona data
   */
  async findById(id: string): Promise<ConversationParticipant | null> {
    const result = await this.pool.query<ParticipantWithPersonaRow>(`
      SELECT cp.*,
             pp.slug as persona_slug,
             pp.name as persona_name,
             pp.avatar_emoji,
             pp.backstory,
             pp.speaking_style,
             pp.worldview,
             pp.quirks,
             pp.voice_characteristics,
             pp.example_phrases,
             pp.preferred_topics,
             pp.default_voice_provider,
             pp.default_voice_id,
             pp.default_voice_settings,
             pp.created_at as persona_created_at,
             pp.updated_at as persona_updated_at
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.id = $1
    `, [id]);

    return result.rows[0] ? this.mapRowWithPersona(result.rows[0]) : null;
  }

  /**
   * Find a participant by session and order
   */
  async findByOrder(sessionId: string, order: number): Promise<ConversationParticipant | null> {
    const result = await this.pool.query<ParticipantWithPersonaRow>(`
      SELECT cp.*,
             pp.slug as persona_slug,
             pp.name as persona_name,
             pp.avatar_emoji,
             pp.backstory,
             pp.speaking_style,
             pp.worldview,
             pp.quirks,
             pp.voice_characteristics,
             pp.example_phrases,
             pp.preferred_topics,
             pp.default_voice_provider,
             pp.default_voice_id,
             pp.default_voice_settings,
             pp.created_at as persona_created_at,
             pp.updated_at as persona_updated_at
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.session_id = $1 AND cp.participant_order = $2
    `, [sessionId, order]);

    return result.rows[0] ? this.mapRowWithPersona(result.rows[0]) : null;
  }

  /**
   * Get participant count for a session
   */
  async getCount(sessionId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`
      SELECT COUNT(*) as count FROM conversation_participants WHERE session_id = $1
    `, [sessionId]);

    return parseInt(result.rows[0]?.count ?? '0');
  }

  /**
   * Get participant IDs for a session (lightweight)
   */
  async getIds(sessionId: string): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(`
      SELECT id FROM conversation_participants
      WHERE session_id = $1
      ORDER BY participant_order ASC
    `, [sessionId]);

    return result.rows.map(row => row.id);
  }

  /**
   * Update the model for a participant
   * Used when user selects a different model during conversation (e.g., after truncation)
   */
  async updateModel(
    participantId: string,
    modelId: string,
    modelDisplayName?: string,
    providerName?: string
  ): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_participants
      SET model_id = $1,
          model_display_name = $2,
          provider_name = $3
      WHERE id = $4
    `, [modelId, modelDisplayName || null, providerName || null, participantId]);
  }

  /**
   * Find participants by IDs
   */
  async findByIds(ids: string[]): Promise<ConversationParticipant[]> {
    if (ids.length === 0) return [];

    const result = await this.pool.query<ParticipantWithPersonaRow>(`
      SELECT cp.*,
             pp.slug as persona_slug,
             pp.name as persona_name,
             pp.avatar_emoji,
             pp.backstory,
             pp.speaking_style,
             pp.worldview,
             pp.quirks,
             pp.voice_characteristics,
             pp.example_phrases,
             pp.preferred_topics,
             pp.default_voice_provider,
             pp.default_voice_id,
             pp.default_voice_settings,
             pp.created_at as persona_created_at,
             pp.updated_at as persona_updated_at
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.id = ANY($1)
    `, [ids]);

    return result.rows.map(row => this.mapRowWithPersona(row));
  }

  /**
   * Map row with persona data
   */
  private mapRowWithPersona(row: ParticipantWithPersonaRow): ConversationParticipant {
    const participant = mapParticipantRow(row);

    const persona: PodcastPersona = {
      id: row.persona_id,
      slug: row.persona_slug,
      name: row.persona_name,
      avatarEmoji: row.avatar_emoji,
      backstory: row.backstory,
      speakingStyle: row.speaking_style,
      worldview: row.worldview,
      quirks: row.quirks || [],
      voiceCharacteristics: row.voice_characteristics || {},
      examplePhrases: row.example_phrases || [],
      preferredTopics: row.preferred_topics || [],
      defaultVoiceProvider: row.default_voice_provider ?? undefined,
      defaultVoiceId: row.default_voice_id ?? undefined,
      defaultVoiceSettings: row.default_voice_settings ?? undefined,
      createdAt: row.persona_created_at,
      updatedAt: row.persona_updated_at,
    };

    return {
      ...participant,
      persona,
    };
  }
}

/**
 * Factory function
 */
export function createConversationParticipantRepository(pool: Pool): ConversationParticipantRepository {
  return new ConversationParticipantRepository(pool);
}

export default ConversationParticipantRepository;
