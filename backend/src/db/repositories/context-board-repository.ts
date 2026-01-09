/**
 * Context Board Repository
 *
 * Handles database operations for the shared conversation context board,
 * including topics, claims, agreements, disagreements, and speaker queue.
 */

import type { Pool } from 'pg';
import {
  ContextBoardState,
  ContextBoardRow,
  TopicEntry,
  ClaimEntry,
  AgreementEntry,
  DisagreementEntry,
  SpeakerSignal,
  mapContextBoardRow,
} from '../../types/conversation.js';

/**
 * Repository for managing conversation context boards
 */
export class ContextBoardRepository {
  constructor(private pool: Pool) {}

  /**
   * Create context board for a session
   */
  async create(sessionId: string): Promise<ContextBoardState> {
    const result = await this.pool.query<ContextBoardRow>(`
      INSERT INTO conversation_context_boards (session_id)
      VALUES ($1)
      RETURNING *
    `, [sessionId]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create context board');
    }
    return mapContextBoardRow(row);
  }

  /**
   * Get context board for a session
   */
  async findBySessionId(sessionId: string): Promise<ContextBoardState | null> {
    const result = await this.pool.query<ContextBoardRow>(`
      SELECT * FROM conversation_context_boards WHERE session_id = $1
    `, [sessionId]);

    return result.rows[0] ? mapContextBoardRow(result.rows[0]) : null;
  }

  /**
   * Ensure context board exists for session (create if not)
   */
  async ensureExists(sessionId: string): Promise<ContextBoardState> {
    const existing = await this.findBySessionId(sessionId);
    if (existing) return existing;
    return this.create(sessionId);
  }

  /**
   * Add a topic to the context board
   */
  async addTopic(sessionId: string, topic: TopicEntry): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET topics_discussed = topics_discussed || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([topic]), sessionId]);
  }

  /**
   * Update topic status
   */
  async updateTopicStatus(
    sessionId: string,
    topicName: string,
    status: 'active' | 'resolved' | 'tabled'
  ): Promise<void> {
    // Find and update the topic
    const board = await this.findBySessionId(sessionId);
    if (!board) return;

    const updated = board.topicsDiscussed.map(t =>
      t.topic === topicName ? { ...t, status } : t
    );

    await this.pool.query(`
      UPDATE conversation_context_boards
      SET topics_discussed = $1
      WHERE session_id = $2
    `, [JSON.stringify(updated), sessionId]);
  }

  /**
   * Add a claim to the context board
   */
  async addClaim(sessionId: string, claim: ClaimEntry): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET claims = claims || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([claim]), sessionId]);
  }

  /**
   * Add support to an existing claim
   */
  async addClaimSupport(sessionId: string, claimIndex: number, participantId: string): Promise<void> {
    const board = await this.findBySessionId(sessionId);
    if (!board || !board.claims[claimIndex]) return;

    const claim = board.claims[claimIndex];
    if (!claim.supportedBy.includes(participantId)) {
      claim.supportedBy.push(participantId);
    }

    await this.pool.query(`
      UPDATE conversation_context_boards
      SET claims = $1
      WHERE session_id = $2
    `, [JSON.stringify(board.claims), sessionId]);
  }

  /**
   * Add challenge to an existing claim
   */
  async addClaimChallenge(sessionId: string, claimIndex: number, participantId: string): Promise<void> {
    const board = await this.findBySessionId(sessionId);
    if (!board || !board.claims[claimIndex]) return;

    const claim = board.claims[claimIndex];
    if (!claim.challengedBy.includes(participantId)) {
      claim.challengedBy.push(participantId);
    }

    await this.pool.query(`
      UPDATE conversation_context_boards
      SET claims = $1
      WHERE session_id = $2
    `, [JSON.stringify(board.claims), sessionId]);
  }

  /**
   * Add an agreement
   */
  async addAgreement(sessionId: string, agreement: AgreementEntry): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET agreements = agreements || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([agreement]), sessionId]);
  }

  /**
   * Add a disagreement
   */
  async addDisagreement(sessionId: string, disagreement: DisagreementEntry): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET disagreements = disagreements || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([disagreement]), sessionId]);
  }

  /**
   * Add key point for participant
   */
  async addKeyPoint(sessionId: string, participantId: string, point: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET key_points_by_participant = jsonb_set(
        COALESCE(key_points_by_participant, '{}'::jsonb),
        ARRAY[$1],
        COALESCE(key_points_by_participant->$1, '[]'::jsonb) || to_jsonb($2::text)
      )
      WHERE session_id = $3
    `, [participantId, point, sessionId]);
  }

  /**
   * Update current thread
   */
  async updateCurrentThread(sessionId: string, thread: string | null): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET current_thread = $1
      WHERE session_id = $2
    `, [thread, sessionId]);
  }

  /**
   * Set speaker queue (replaces existing)
   */
  async setSpeakerQueue(sessionId: string, queue: SpeakerSignal[]): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET speaker_queue = $1
      WHERE session_id = $2
    `, [JSON.stringify(queue), sessionId]);
  }

  /**
   * Add signal to speaker queue
   */
  async addToSpeakerQueue(sessionId: string, signal: SpeakerSignal): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET speaker_queue = speaker_queue || $1::jsonb
      WHERE session_id = $2
    `, [JSON.stringify([signal]), sessionId]);
  }

  /**
   * Remove participant from speaker queue
   */
  async removeFromSpeakerQueue(sessionId: string, participantId: string): Promise<void> {
    const board = await this.findBySessionId(sessionId);
    if (!board) return;

    const filtered = board.speakerQueue.filter(s => s.participantId !== participantId);

    await this.pool.query(`
      UPDATE conversation_context_boards
      SET speaker_queue = $1
      WHERE session_id = $2
    `, [JSON.stringify(filtered), sessionId]);
  }

  /**
   * Clear speaker queue
   */
  async clearSpeakerQueue(sessionId: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET speaker_queue = '[]'::jsonb
      WHERE session_id = $1
    `, [sessionId]);
  }

  /**
   * Full update of context board state
   */
  async update(sessionId: string, state: Partial<ContextBoardState>): Promise<void> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (state.topicsDiscussed !== undefined) {
      updates.push(`topics_discussed = $${paramIndex++}`);
      values.push(JSON.stringify(state.topicsDiscussed));
    }
    if (state.claims !== undefined) {
      updates.push(`claims = $${paramIndex++}`);
      values.push(JSON.stringify(state.claims));
    }
    if (state.agreements !== undefined) {
      updates.push(`agreements = $${paramIndex++}`);
      values.push(JSON.stringify(state.agreements));
    }
    if (state.disagreements !== undefined) {
      updates.push(`disagreements = $${paramIndex++}`);
      values.push(JSON.stringify(state.disagreements));
    }
    if (state.keyPointsByParticipant !== undefined) {
      updates.push(`key_points_by_participant = $${paramIndex++}`);
      values.push(JSON.stringify(state.keyPointsByParticipant));
    }
    if (state.currentThread !== undefined) {
      updates.push(`current_thread = $${paramIndex++}`);
      values.push(state.currentThread);
    }
    if (state.speakerQueue !== undefined) {
      updates.push(`speaker_queue = $${paramIndex++}`);
      values.push(JSON.stringify(state.speakerQueue));
    }

    if (updates.length === 0) return;

    values.push(sessionId);
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET ${updates.join(', ')}
      WHERE session_id = $${paramIndex}
    `, values);
  }

  /**
   * Reset context board to initial empty state
   */
  async reset(sessionId: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET topics_discussed = '[]'::jsonb,
          claims = '[]'::jsonb,
          agreements = '[]'::jsonb,
          disagreements = '[]'::jsonb,
          key_points_by_participant = '{}'::jsonb,
          current_thread = NULL,
          speaker_queue = '[]'::jsonb
      WHERE session_id = $1
    `, [sessionId]);
  }

  /**
   * Get summary stats for context board
   */
  async getSummary(sessionId: string): Promise<{
    topicCount: number;
    claimCount: number;
    agreementCount: number;
    disagreementCount: number;
    queueLength: number;
  } | null> {
    const board = await this.findBySessionId(sessionId);
    if (!board) return null;

    return {
      topicCount: board.topicsDiscussed.length,
      claimCount: board.claims.length,
      agreementCount: board.agreements.length,
      disagreementCount: board.disagreements.length,
      queueLength: board.speakerQueue.length,
    };
  }
}

/**
 * Factory function
 */
export function createContextBoardRepository(pool: Pool): ContextBoardRepository {
  return new ContextBoardRepository(pool);
}

export default ContextBoardRepository;
