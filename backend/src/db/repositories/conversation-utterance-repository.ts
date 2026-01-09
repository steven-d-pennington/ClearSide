/**
 * Conversation Utterance Repository
 *
 * Handles database operations for conversation utterances including
 * creation, querying, and key point management.
 */

import type { Pool } from 'pg';
import {
  ConversationUtterance,
  ConversationUtteranceRow,
  SegmentType,
  mapUtteranceRow,
} from '../../types/conversation.js';

/**
 * Input for creating an utterance
 */
export interface CreateUtteranceInput {
  sessionId: string;
  participantId?: string;
  content: string;
  isHostUtterance?: boolean;
  addressedToParticipantId?: string;
  timestampMs: number;
  isKeyPoint?: boolean;
  topicMarker?: string;
  segmentType?: SegmentType;
  metadata?: Record<string, unknown>;
}

/**
 * Repository for managing conversation utterances
 */
export class ConversationUtteranceRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new utterance
   */
  async create(input: CreateUtteranceInput): Promise<ConversationUtterance> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      INSERT INTO conversation_utterances (
        session_id, participant_id, content, is_host_utterance,
        addressed_to_participant_id, timestamp_ms, is_key_point,
        topic_marker, segment_type, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      input.sessionId,
      input.participantId || null,
      input.content,
      input.isHostUtterance || false,
      input.addressedToParticipantId || null,
      input.timestampMs,
      input.isKeyPoint || false,
      input.topicMarker || null,
      input.segmentType || 'discussion',
      JSON.stringify(input.metadata || {}),
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create utterance');
    }
    return mapUtteranceRow(row);
  }

  /**
   * Create host utterance (convenience method)
   */
  async createHostUtterance(
    sessionId: string,
    content: string,
    timestampMs: number,
    segmentType: SegmentType = 'host_question'
  ): Promise<ConversationUtterance> {
    return this.create({
      sessionId,
      content,
      isHostUtterance: true,
      timestampMs,
      segmentType,
    });
  }

  /**
   * Find all utterances for a session
   */
  async findBySessionId(sessionId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1
      ORDER BY timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map(row => mapUtteranceRow(row));
  }

  /**
   * Find utterance by ID
   */
  async findById(id: number): Promise<ConversationUtterance | null> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      SELECT * FROM conversation_utterances WHERE id = $1
    `, [id]);

    return result.rows[0] ? mapUtteranceRow(result.rows[0]) : null;
  }

  /**
   * Get utterances with participant info populated
   */
  async findBySessionIdWithParticipants(sessionId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query(`
      SELECT u.*,
             cp.model_id as participant_model_id,
             cp.model_display_name as participant_model_display_name,
             cp.display_name_override,
             cp.persona_id,
             pp.slug as persona_slug,
             pp.name as persona_name,
             pp.avatar_emoji
      FROM conversation_utterances u
      LEFT JOIN conversation_participants cp ON u.participant_id = cp.id
      LEFT JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE u.session_id = $1
      ORDER BY u.timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map((row: any) => this.mapRowWithParticipant(row));
  }

  /**
   * Get key points only
   */
  async findKeyPoints(sessionId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1 AND is_key_point = true
      ORDER BY timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map(row => mapUtteranceRow(row));
  }

  /**
   * Get recent utterances (for context)
   */
  async findRecent(sessionId: string, limit: number = 5): Promise<ConversationUtterance[]> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1
      ORDER BY timestamp_ms DESC
      LIMIT $2
    `, [sessionId, limit]);

    return result.rows.map(row => mapUtteranceRow(row)).reverse();
  }

  /**
   * Get utterances by participant
   */
  async findByParticipant(sessionId: string, participantId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1 AND participant_id = $2
      ORDER BY timestamp_ms ASC
    `, [sessionId, participantId]);

    return result.rows.map(row => mapUtteranceRow(row));
  }

  /**
   * Get host utterances only
   */
  async findHostUtterances(sessionId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query<ConversationUtteranceRow>(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1 AND is_host_utterance = true
      ORDER BY timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map(row => mapUtteranceRow(row));
  }

  /**
   * Get utterance count for a session
   */
  async getCount(sessionId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`
      SELECT COUNT(*) as count FROM conversation_utterances WHERE session_id = $1
    `, [sessionId]);

    return parseInt(result.rows[0]?.count ?? '0');
  }

  /**
   * Mark utterance as key point
   */
  async markAsKeyPoint(id: number, isKeyPoint: boolean = true): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_utterances SET is_key_point = $1 WHERE id = $2
    `, [isKeyPoint, id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update topic marker
   */
  async updateTopicMarker(id: number, topicMarker: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_utterances SET topic_marker = $1 WHERE id = $2
    `, [topicMarker, id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update metadata
   */
  async updateMetadata(id: number, metadata: Record<string, unknown>): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_utterances SET metadata = $1 WHERE id = $2
    `, [JSON.stringify(metadata), id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update utterance content (for regeneration)
   */
  async updateContent(id: number, content: string, metadata?: Record<string, unknown>): Promise<boolean> {
    let query: string;
    let params: unknown[];

    if (metadata) {
      query = `
        UPDATE conversation_utterances
        SET content = $1, metadata = COALESCE(metadata, '{}'::jsonb) || $2
        WHERE id = $3
      `;
      params = [content, JSON.stringify(metadata), id];
    } else {
      query = `UPDATE conversation_utterances SET content = $1 WHERE id = $2`;
      params = [content, id];
    }

    const result = await this.pool.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get last timestamp for session
   */
  async getLastTimestamp(sessionId: string): Promise<number> {
    const result = await this.pool.query<{ last_timestamp: number }>(`
      SELECT COALESCE(MAX(timestamp_ms), 0) as last_timestamp
      FROM conversation_utterances
      WHERE session_id = $1
    `, [sessionId]);

    return result.rows[0]?.last_timestamp ?? 0;
  }

  /**
   * Get word count for session
   */
  async getWordCount(sessionId: string): Promise<number> {
    const result = await this.pool.query<{ word_count: string }>(`
      SELECT COALESCE(SUM(array_length(regexp_split_to_array(content, E'\\\\s+'), 1)), 0) as word_count
      FROM conversation_utterances
      WHERE session_id = $1
    `, [sessionId]);

    return parseInt(result.rows[0]?.word_count ?? '0');
  }

  /**
   * Map row with participant data
   */
  private mapRowWithParticipant(row: any): ConversationUtterance {
    const utterance = mapUtteranceRow(row);

    if (row.persona_slug) {
      utterance.participant = {
        id: row.participant_id,
        sessionId: row.session_id,
        personaId: row.persona_id,
        modelId: row.participant_model_id,
        modelDisplayName: row.participant_model_display_name,
        displayNameOverride: row.display_name_override,
        participantOrder: 0,
        createdAt: row.created_at,
        persona: {
          id: row.persona_id,
          slug: row.persona_slug,
          name: row.persona_name,
          avatarEmoji: row.avatar_emoji,
          backstory: '',
          speakingStyle: '',
          worldview: '',
          quirks: [],
          voiceCharacteristics: {},
          examplePhrases: [],
          preferredTopics: [],
          createdAt: row.created_at,
          updatedAt: row.created_at,
        },
      };
    }

    return utterance;
  }

  /**
   * Delete all utterances for a session
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    const result = await this.pool.query(`
      DELETE FROM conversation_utterances WHERE session_id = $1
    `, [sessionId]);

    return result.rowCount ?? 0;
  }
}

/**
 * Factory function
 */
export function createConversationUtteranceRepository(pool: Pool): ConversationUtteranceRepository {
  return new ConversationUtteranceRepository(pool);
}

export default ConversationUtteranceRepository;
