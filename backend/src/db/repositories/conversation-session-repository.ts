/**
 * Conversation Session Repository
 *
 * Handles database operations for conversation sessions including
 * creation, status transitions, and flow mode management.
 */

import type { Pool } from 'pg';
import {
  ConversationSession,
  ConversationSessionRow,
  ConversationSessionConfig,
  SessionStatus,
  FlowMode,
  mapSessionRow,
} from '../../types/conversation.js';
import type { RefinedSegment, TTSProvider } from '../../services/podcast/conversation-script-refiner.js';

/**
 * Stored refined script with metadata
 */
export interface StoredRefinedScript {
  sessionId: string;
  segments: RefinedSegment[];
  provider: TTSProvider | null;
  title: string | null;
  topic: string | null;
  totalWords: number | null;
  estimatedDurationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Repository for managing conversation sessions
 */
export class ConversationSessionRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new conversation session
   */
  async create(config: ConversationSessionConfig): Promise<ConversationSession> {
    const result = await this.pool.query<ConversationSessionRow>(`
      INSERT INTO conversation_sessions (
        topic, topic_context, episode_proposal_id,
        participant_count, flow_mode, pace_delay_ms, rapid_fire, minimal_persona_mode,
        max_turns, host_model_id, host_display_name, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'configuring')
      RETURNING *
    `, [
      config.topic,
      config.topicContext || null,
      config.episodeProposalId || null,
      config.participants.length,
      config.flowMode,
      config.paceDelayMs || 3000,
      config.rapidFire || false,
      config.minimalPersonaMode || false,
      config.maxTurns || 30,
      config.hostModelId || null,
      config.hostDisplayName || 'Host',
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create conversation session');
    }
    return mapSessionRow(row);
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<ConversationSession | null> {
    const result = await this.pool.query<ConversationSessionRow>(`
      SELECT * FROM conversation_sessions WHERE id = $1
    `, [id]);

    return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
  }

  /**
   * Find sessions by status
   */
  async findByStatus(status: SessionStatus): Promise<ConversationSession[]> {
    const result = await this.pool.query<ConversationSessionRow>(`
      SELECT * FROM conversation_sessions
      WHERE status = $1
      ORDER BY created_at DESC
    `, [status]);

    return result.rows.map(row => mapSessionRow(row));
  }

  /**
   * Find recent sessions
   */
  async findRecent(limit: number = 10): Promise<ConversationSession[]> {
    const result = await this.pool.query<ConversationSessionRow>(`
      SELECT * FROM conversation_sessions
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => mapSessionRow(row));
  }

  /**
   * Find sessions linked to a proposal
   */
  async findByProposalId(proposalId: string): Promise<ConversationSession[]> {
    const result = await this.pool.query<ConversationSessionRow>(`
      SELECT * FROM conversation_sessions
      WHERE episode_proposal_id = $1
      ORDER BY created_at DESC
    `, [proposalId]);

    return result.rows.map(row => mapSessionRow(row));
  }

  /**
   * Find active (live or paused) sessions
   */
  async findActive(): Promise<ConversationSession[]> {
    const result = await this.pool.query<ConversationSessionRow>(`
      SELECT * FROM conversation_sessions
      WHERE status IN ('live', 'paused')
      ORDER BY started_at DESC
    `);

    return result.rows.map(row => mapSessionRow(row));
  }

  /**
   * Find all sessions with optional filtering and pagination
   */
  async findAll(options: {
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<ConversationSession[]> {
    const { status, limit = 20, offset = 0 } = options;

    if (status) {
      const result = await this.pool.query<ConversationSessionRow>(`
        SELECT * FROM conversation_sessions
        WHERE status = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [status, limit, offset]);
      return result.rows.map(row => mapSessionRow(row));
    } else {
      const result = await this.pool.query<ConversationSessionRow>(`
        SELECT * FROM conversation_sessions
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      return result.rows.map(row => mapSessionRow(row));
    }
  }

  /**
   * Start a session (transition to 'live')
   */
  async start(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'live', started_at = NOW()
      WHERE id = $1 AND status = 'configuring'
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Pause a session
   */
  async pause(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'paused'
      WHERE id = $1 AND status = 'live'
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Resume a paused session
   */
  async resume(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'live'
      WHERE id = $1 AND status = 'paused'
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Complete a session
   */
  async complete(id: string, totalDurationMs: number): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'completed', completed_at = NOW(), total_duration_ms = $1
      WHERE id = $2 AND status IN ('live', 'paused')
    `, [totalDurationMs, id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Mark session as error
   */
  async fail(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'error', completed_at = NOW()
      WHERE id = $1
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update session status (used for restart)
   * Resets timestamps if returning to 'configuring'
   */
  async updateStatus(id: string, status: SessionStatus): Promise<boolean> {
    if (status === 'configuring') {
      // Reset timestamps when going back to configuring
      const result = await this.pool.query(`
        UPDATE conversation_sessions
        SET status = $1, started_at = NULL, completed_at = NULL, total_duration_ms = NULL
        WHERE id = $2
      `, [status, id]);
      return (result.rowCount ?? 0) > 0;
    } else {
      const result = await this.pool.query(`
        UPDATE conversation_sessions
        SET status = $1
        WHERE id = $2
      `, [status, id]);
      return (result.rowCount ?? 0) > 0;
    }
  }

  /**
   * Update flow mode
   */
  async updateFlowMode(id: string, flowMode: FlowMode, paceDelayMs?: number): Promise<boolean> {
    if (paceDelayMs !== undefined) {
      const result = await this.pool.query(`
        UPDATE conversation_sessions
        SET flow_mode = $1, pace_delay_ms = $2
        WHERE id = $3
      `, [flowMode, paceDelayMs, id]);
      return (result.rowCount ?? 0) > 0;
    } else {
      const result = await this.pool.query(`
        UPDATE conversation_sessions
        SET flow_mode = $1
        WHERE id = $2
      `, [flowMode, id]);
      return (result.rowCount ?? 0) > 0;
    }
  }

  /**
   * Update current speaker index
   */
  async updateCurrentSpeaker(id: string, index: number): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE conversation_sessions
      SET current_speaker_index = $1
      WHERE id = $2
    `, [index, id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete a session (cascades to participants, utterances, context board)
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM conversation_sessions WHERE id = $1
    `, [id]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get total session count
   */
  async count(status?: SessionStatus): Promise<number> {
    if (status) {
      const result = await this.pool.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM conversation_sessions WHERE status = $1
      `, [status]);
      return parseInt(result.rows[0]?.count ?? '0');
    } else {
      const result = await this.pool.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM conversation_sessions
      `);
      return parseInt(result.rows[0]?.count ?? '0');
    }
  }

  // ============================================================================
  // Refined Script Storage
  // ============================================================================

  /**
   * Save or update a refined script for a session (upsert)
   */
  async saveRefinedScript(
    sessionId: string,
    segments: RefinedSegment[],
    options?: {
      provider?: TTSProvider;
      title?: string;
      topic?: string;
    }
  ): Promise<StoredRefinedScript> {
    const totalWords = segments.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    const estimatedDurationMinutes = Math.ceil(totalWords / 150);

    const result = await this.pool.query<{
      session_id: string;
      segments: RefinedSegment[];
      provider: string | null;
      title: string | null;
      topic: string | null;
      total_words: number | null;
      estimated_duration_minutes: number | null;
      created_at: Date;
      updated_at: Date;
    }>(`
      INSERT INTO conversation_refined_scripts (
        session_id, segments, provider, title, topic,
        total_words, estimated_duration_minutes, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        segments = EXCLUDED.segments,
        provider = COALESCE(EXCLUDED.provider, conversation_refined_scripts.provider),
        title = COALESCE(EXCLUDED.title, conversation_refined_scripts.title),
        topic = COALESCE(EXCLUDED.topic, conversation_refined_scripts.topic),
        total_words = EXCLUDED.total_words,
        estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
        updated_at = NOW()
      RETURNING *
    `, [
      sessionId,
      JSON.stringify(segments),
      options?.provider || null,
      options?.title || null,
      options?.topic || null,
      totalWords,
      estimatedDurationMinutes,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to save refined script');
    }

    return {
      sessionId: row.session_id,
      segments: row.segments,
      provider: row.provider as TTSProvider | null,
      title: row.title,
      topic: row.topic,
      totalWords: row.total_words,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get refined script for a session
   */
  async getRefinedScript(sessionId: string): Promise<StoredRefinedScript | null> {
    const result = await this.pool.query<{
      session_id: string;
      segments: RefinedSegment[];
      provider: string | null;
      title: string | null;
      topic: string | null;
      total_words: number | null;
      estimated_duration_minutes: number | null;
      created_at: Date;
      updated_at: Date;
    }>(`
      SELECT * FROM conversation_refined_scripts WHERE session_id = $1
    `, [sessionId]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      segments: row.segments,
      provider: row.provider as TTSProvider | null,
      title: row.title,
      topic: row.topic,
      totalWords: row.total_words,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete refined script for a session (used for reset)
   */
  async deleteRefinedScript(sessionId: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM conversation_refined_scripts WHERE session_id = $1
    `, [sessionId]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check if a session has a refined script
   */
  async hasRefinedScript(sessionId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM conversation_refined_scripts WHERE session_id = $1
      ) as exists
    `, [sessionId]);

    return result.rows[0]?.exists ?? false;
  }

  // ============================================================================
  // Segment Preview Storage
  // ============================================================================

  /**
   * Segment preview data
   */
  static readonly SegmentPreviewFields = `
    id, session_id, segment_index, voice_id, provider,
    audio_path, audio_url, duration_ms, character_count,
    content_hash, created_at, updated_at
  `;

  /**
   * Save or update a segment preview (upsert)
   */
  async saveSegmentPreview(
    sessionId: string,
    segmentIndex: number,
    preview: {
      voiceId: string;
      provider: string;
      audioPath?: string;
      audioUrl?: string;
      durationMs?: number;
      characterCount?: number;
      contentHash?: string;
    }
  ): Promise<SegmentPreview> {
    const result = await this.pool.query<SegmentPreviewRow>(`
      INSERT INTO conversation_segment_previews (
        session_id, segment_index, voice_id, provider,
        audio_path, audio_url, duration_ms, character_count,
        content_hash, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (session_id, segment_index) DO UPDATE SET
        voice_id = EXCLUDED.voice_id,
        provider = EXCLUDED.provider,
        audio_path = EXCLUDED.audio_path,
        audio_url = EXCLUDED.audio_url,
        duration_ms = EXCLUDED.duration_ms,
        character_count = EXCLUDED.character_count,
        content_hash = EXCLUDED.content_hash,
        updated_at = NOW()
      RETURNING *
    `, [
      sessionId,
      segmentIndex,
      preview.voiceId,
      preview.provider,
      preview.audioPath || null,
      preview.audioUrl || null,
      preview.durationMs || null,
      preview.characterCount || null,
      preview.contentHash || null,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to save segment preview');
    }

    return mapSegmentPreviewRow(row);
  }

  /**
   * Get a segment preview by session and index
   */
  async getSegmentPreview(sessionId: string, segmentIndex: number): Promise<SegmentPreview | null> {
    const result = await this.pool.query<SegmentPreviewRow>(`
      SELECT * FROM conversation_segment_previews
      WHERE session_id = $1 AND segment_index = $2
    `, [sessionId, segmentIndex]);

    return result.rows[0] ? mapSegmentPreviewRow(result.rows[0]) : null;
  }

  /**
   * Get all segment previews for a session
   */
  async getSegmentPreviews(sessionId: string): Promise<SegmentPreview[]> {
    const result = await this.pool.query<SegmentPreviewRow>(`
      SELECT * FROM conversation_segment_previews
      WHERE session_id = $1
      ORDER BY segment_index ASC
    `, [sessionId]);

    return result.rows.map(mapSegmentPreviewRow);
  }

  /**
   * Delete a segment preview
   */
  async deleteSegmentPreview(sessionId: string, segmentIndex: number): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM conversation_segment_previews
      WHERE session_id = $1 AND segment_index = $2
    `, [sessionId, segmentIndex]);

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete all segment previews for a session
   */
  async deleteAllSegmentPreviews(sessionId: string): Promise<number> {
    const result = await this.pool.query(`
      DELETE FROM conversation_segment_previews
      WHERE session_id = $1
    `, [sessionId]);

    return result.rowCount ?? 0;
  }

  /**
   * Check if a segment has a preview
   */
  async hasSegmentPreview(sessionId: string, segmentIndex: number): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM conversation_segment_previews
        WHERE session_id = $1 AND segment_index = $2
      ) as exists
    `, [sessionId, segmentIndex]);

    return result.rows[0]?.exists ?? false;
  }
}

/**
 * Segment preview row from database
 */
interface SegmentPreviewRow {
  id: string;
  session_id: string;
  segment_index: number;
  voice_id: string;
  provider: string;
  audio_path: string | null;
  audio_url: string | null;
  duration_ms: number | null;
  character_count: number | null;
  content_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Segment preview data
 */
export interface SegmentPreview {
  id: string;
  sessionId: string;
  segmentIndex: number;
  voiceId: string;
  provider: string;
  audioPath: string | null;
  audioUrl: string | null;
  durationMs: number | null;
  characterCount: number | null;
  contentHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Map database row to SegmentPreview
 */
function mapSegmentPreviewRow(row: SegmentPreviewRow): SegmentPreview {
  return {
    id: row.id,
    sessionId: row.session_id,
    segmentIndex: row.segment_index,
    voiceId: row.voice_id,
    provider: row.provider,
    audioPath: row.audio_path,
    audioUrl: row.audio_url,
    durationMs: row.duration_ms,
    characterCount: row.character_count,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Factory function
 */
export function createConversationSessionRepository(pool: Pool): ConversationSessionRepository {
  return new ConversationSessionRepository(pool);
}

export default ConversationSessionRepository;
