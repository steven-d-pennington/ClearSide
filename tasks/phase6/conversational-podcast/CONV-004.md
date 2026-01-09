# CONV-004: Session and Utterance Repositories

**Task ID:** CONV-004
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-001 (Database Schema), CONV-002 (Types), CONV-003 (Persona Repository)
**Status:** Ready

---

## Context

This task creates repositories for managing conversation sessions, participants, utterances, and context boards. These repositories handle the core data operations for running conversations.

**References:**
- [CONV-001](./CONV-001.md) - Database schema
- [CONV-002](./CONV-002.md) - TypeScript types
- [CONV-003](./CONV-003.md) - PersonaRepository pattern
- Existing patterns: `backend/src/db/repositories/duelogic-repository.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `ConversationSessionRepository` in `backend/src/db/repositories/conversation-session-repository.ts`
- [ ] Create `ConversationParticipantRepository` in `backend/src/db/repositories/conversation-participant-repository.ts`
- [ ] Create `ConversationUtteranceRepository` in `backend/src/db/repositories/conversation-utterance-repository.ts`
- [ ] Create `ContextBoardRepository` in `backend/src/db/repositories/context-board-repository.ts`
- [ ] Implement CRUD operations for sessions
- [ ] Implement status transitions for sessions
- [ ] Implement utterance recording with direct addressing
- [ ] Implement context board JSONB updates
- [ ] Add unit tests for all repositories
- [ ] Export all repositories from index

---

## Implementation Guide

### Session Repository

Create file: `backend/src/db/repositories/conversation-session-repository.ts`

```typescript
import { Pool } from 'pg';
import {
  ConversationSession,
  ConversationSessionConfig,
  SessionStatus,
  FlowMode,
} from '../../types/conversation.js';

export class ConversationSessionRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new conversation session
   */
  async create(config: ConversationSessionConfig): Promise<ConversationSession> {
    const result = await this.pool.query(`
      INSERT INTO conversation_sessions (
        topic, topic_context, episode_proposal_id,
        participant_count, flow_mode, pace_delay_ms,
        host_model_id, host_display_name, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'configuring')
      RETURNING *
    `, [
      config.topic,
      config.topicContext || null,
      config.episodeProposalId || null,
      config.participants.length,
      config.flowMode,
      config.paceDelayMs || 3000,
      config.hostModelId || null,
      config.hostDisplayName || 'Host',
    ]);

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<ConversationSession | null> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_sessions WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByStatus(status: SessionStatus): Promise<ConversationSession[]> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_sessions
      WHERE status = $1
      ORDER BY created_at DESC
    `, [status]);

    return result.rows.map(row => this.mapRow(row));
  }

  async findRecent(limit: number = 10): Promise<ConversationSession[]> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_sessions
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => this.mapRow(row));
  }

  async findByProposalId(proposalId: string): Promise<ConversationSession[]> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_sessions
      WHERE episode_proposal_id = $1
      ORDER BY created_at DESC
    `, [proposalId]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Start a session (transition to 'live')
   */
  async start(id: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'live', started_at = NOW()
      WHERE id = $1 AND status = 'configuring'
    `, [id]);
  }

  /**
   * Pause a session
   */
  async pause(id: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'paused'
      WHERE id = $1 AND status = 'live'
    `, [id]);
  }

  /**
   * Resume a paused session
   */
  async resume(id: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'live'
      WHERE id = $1 AND status = 'paused'
    `, [id]);
  }

  /**
   * Complete a session
   */
  async complete(id: string, totalDurationMs: number): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'completed', completed_at = NOW(), total_duration_ms = $1
      WHERE id = $2 AND status IN ('live', 'paused')
    `, [totalDurationMs, id]);
  }

  /**
   * Mark session as error
   */
  async fail(id: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_sessions
      SET status = 'error', completed_at = NOW()
      WHERE id = $1
    `, [id]);
  }

  /**
   * Update flow mode
   */
  async updateFlowMode(id: string, flowMode: FlowMode, paceDelayMs?: number): Promise<void> {
    if (paceDelayMs !== undefined) {
      await this.pool.query(`
        UPDATE conversation_sessions
        SET flow_mode = $1, pace_delay_ms = $2
        WHERE id = $3
      `, [flowMode, paceDelayMs, id]);
    } else {
      await this.pool.query(`
        UPDATE conversation_sessions
        SET flow_mode = $1
        WHERE id = $2
      `, [flowMode, id]);
    }
  }

  /**
   * Update current speaker index
   */
  async updateCurrentSpeaker(id: string, index: number): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_sessions
      SET current_speaker_index = $1
      WHERE id = $2
    `, [index, id]);
  }

  /**
   * Delete a session (cascades to participants, utterances, context board)
   */
  async delete(id: string): Promise<void> {
    await this.pool.query(`
      DELETE FROM conversation_sessions WHERE id = $1
    `, [id]);
  }

  private mapRow(row: any): ConversationSession {
    return {
      id: row.id,
      episodeProposalId: row.episode_proposal_id,
      topic: row.topic,
      topicContext: row.topic_context,
      participantCount: row.participant_count,
      flowMode: row.flow_mode,
      paceDelayMs: row.pace_delay_ms,
      status: row.status,
      currentSpeakerIndex: row.current_speaker_index,
      hostModelId: row.host_model_id,
      hostDisplayName: row.host_display_name,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      totalDurationMs: row.total_duration_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

### Participant Repository

Create file: `backend/src/db/repositories/conversation-participant-repository.ts`

```typescript
import { Pool } from 'pg';
import {
  ConversationParticipant,
  ParticipantConfig,
} from '../../types/conversation.js';

export class ConversationParticipantRepository {
  constructor(private pool: Pool) {}

  /**
   * Create participants for a session (batch insert)
   */
  async createForSession(
    sessionId: string,
    configs: ParticipantConfig[]
  ): Promise<ConversationParticipant[]> {
    const participants: ConversationParticipant[] = [];

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];

      // Lookup persona ID by slug
      const personaResult = await this.pool.query(`
        SELECT id FROM podcast_personas WHERE slug = $1
      `, [config.personaSlug]);

      if (!personaResult.rows[0]) {
        throw new Error(`Persona not found: ${config.personaSlug}`);
      }

      const result = await this.pool.query(`
        INSERT INTO conversation_participants (
          session_id, persona_id, model_id, model_display_name,
          provider_name, display_name_override, participant_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        sessionId,
        personaResult.rows[0].id,
        config.modelId,
        config.modelDisplayName || null,
        config.providerName || null,
        config.displayNameOverride || null,
        i,
      ]);

      participants.push(this.mapRow(result.rows[0]));
    }

    return participants;
  }

  async findBySessionId(sessionId: string): Promise<ConversationParticipant[]> {
    const result = await this.pool.query(`
      SELECT cp.*, pp.slug as persona_slug, pp.name as persona_name,
             pp.avatar_emoji, pp.backstory, pp.speaking_style, pp.worldview,
             pp.quirks, pp.voice_characteristics, pp.example_phrases
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.session_id = $1
      ORDER BY cp.participant_order ASC
    `, [sessionId]);

    return result.rows.map(row => this.mapRowWithPersona(row));
  }

  async findById(id: string): Promise<ConversationParticipant | null> {
    const result = await this.pool.query(`
      SELECT cp.*, pp.slug as persona_slug, pp.name as persona_name,
             pp.avatar_emoji, pp.backstory, pp.speaking_style, pp.worldview,
             pp.quirks, pp.voice_characteristics, pp.example_phrases
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.id = $1
    `, [id]);

    return result.rows[0] ? this.mapRowWithPersona(result.rows[0]) : null;
  }

  async findByOrder(sessionId: string, order: number): Promise<ConversationParticipant | null> {
    const result = await this.pool.query(`
      SELECT cp.*, pp.slug as persona_slug, pp.name as persona_name,
             pp.avatar_emoji, pp.backstory, pp.speaking_style, pp.worldview,
             pp.quirks, pp.voice_characteristics, pp.example_phrases
      FROM conversation_participants cp
      JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE cp.session_id = $1 AND cp.participant_order = $2
    `, [sessionId, order]);

    return result.rows[0] ? this.mapRowWithPersona(result.rows[0]) : null;
  }

  async getCount(sessionId: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count FROM conversation_participants WHERE session_id = $1
    `, [sessionId]);

    return parseInt(result.rows[0].count);
  }

  private mapRow(row: any): ConversationParticipant {
    return {
      id: row.id,
      sessionId: row.session_id,
      personaId: row.persona_id,
      modelId: row.model_id,
      modelDisplayName: row.model_display_name,
      providerName: row.provider_name,
      displayNameOverride: row.display_name_override,
      participantOrder: row.participant_order,
      createdAt: row.created_at,
    };
  }

  private mapRowWithPersona(row: any): ConversationParticipant {
    return {
      ...this.mapRow(row),
      persona: {
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
        preferredTopics: [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  }
}
```

### Utterance Repository

Create file: `backend/src/db/repositories/conversation-utterance-repository.ts`

```typescript
import { Pool } from 'pg';
import {
  ConversationUtterance,
  SegmentType,
} from '../../types/conversation.js';

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

export class ConversationUtteranceRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new utterance
   */
  async create(input: CreateUtteranceInput): Promise<ConversationUtterance> {
    const result = await this.pool.query(`
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

    return this.mapRow(result.rows[0]);
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

  async findBySessionId(sessionId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1
      ORDER BY timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map(row => this.mapRow(row));
  }

  async findById(id: number): Promise<ConversationUtterance | null> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_utterances WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
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
             pp.slug as persona_slug,
             pp.name as persona_name,
             pp.avatar_emoji
      FROM conversation_utterances u
      LEFT JOIN conversation_participants cp ON u.participant_id = cp.id
      LEFT JOIN podcast_personas pp ON cp.persona_id = pp.id
      WHERE u.session_id = $1
      ORDER BY u.timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map(row => this.mapRowWithParticipant(row));
  }

  /**
   * Get key points only
   */
  async findKeyPoints(sessionId: string): Promise<ConversationUtterance[]> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1 AND is_key_point = true
      ORDER BY timestamp_ms ASC
    `, [sessionId]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get recent utterances (for context)
   */
  async findRecent(sessionId: string, limit: number = 5): Promise<ConversationUtterance[]> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_utterances
      WHERE session_id = $1
      ORDER BY timestamp_ms DESC
      LIMIT $2
    `, [sessionId, limit]);

    return result.rows.map(row => this.mapRow(row)).reverse();
  }

  /**
   * Get utterance count for a session
   */
  async getCount(sessionId: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count FROM conversation_utterances WHERE session_id = $1
    `, [sessionId]);

    return parseInt(result.rows[0].count);
  }

  /**
   * Mark utterance as key point
   */
  async markAsKeyPoint(id: number, isKeyPoint: boolean = true): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_utterances SET is_key_point = $1 WHERE id = $2
    `, [isKeyPoint, id]);
  }

  /**
   * Update topic marker
   */
  async updateTopicMarker(id: number, topicMarker: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_utterances SET topic_marker = $1 WHERE id = $2
    `, [topicMarker, id]);
  }

  /**
   * Get last timestamp for session
   */
  async getLastTimestamp(sessionId: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT COALESCE(MAX(timestamp_ms), 0) as last_timestamp
      FROM conversation_utterances
      WHERE session_id = $1
    `, [sessionId]);

    return result.rows[0].last_timestamp;
  }

  private mapRow(row: any): ConversationUtterance {
    return {
      id: row.id,
      sessionId: row.session_id,
      participantId: row.participant_id,
      content: row.content,
      isHostUtterance: row.is_host_utterance,
      addressedToParticipantId: row.addressed_to_participant_id,
      timestampMs: row.timestamp_ms,
      isKeyPoint: row.is_key_point,
      topicMarker: row.topic_marker,
      segmentType: row.segment_type,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  }

  private mapRowWithParticipant(row: any): ConversationUtterance {
    const utterance = this.mapRow(row);

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
}
```

### Context Board Repository

Create file: `backend/src/db/repositories/context-board-repository.ts`

```typescript
import { Pool } from 'pg';
import {
  ContextBoardState,
  TopicEntry,
  ClaimEntry,
  AgreementEntry,
  DisagreementEntry,
  SpeakerSignal,
} from '../../types/conversation.js';

export class ContextBoardRepository {
  constructor(private pool: Pool) {}

  /**
   * Create context board for a session
   */
  async create(sessionId: string): Promise<ContextBoardState> {
    const result = await this.pool.query(`
      INSERT INTO conversation_context_boards (session_id)
      VALUES ($1)
      RETURNING *
    `, [sessionId]);

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get context board for a session
   */
  async findBySessionId(sessionId: string): Promise<ContextBoardState | null> {
    const result = await this.pool.query(`
      SELECT * FROM conversation_context_boards WHERE session_id = $1
    `, [sessionId]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
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
    // Use JSONB path operations to append to the participant's array
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
  async updateCurrentThread(sessionId: string, thread: string): Promise<void> {
    await this.pool.query(`
      UPDATE conversation_context_boards
      SET current_thread = $1
      WHERE session_id = $2
    `, [thread, sessionId]);
  }

  /**
   * Set speaker queue
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
    const values: any[] = [];
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

  private mapRow(row: any): ContextBoardState {
    return {
      sessionId: row.session_id,
      topicsDiscussed: row.topics_discussed || [],
      claims: row.claims || [],
      agreements: row.agreements || [],
      disagreements: row.disagreements || [],
      keyPointsByParticipant: row.key_points_by_participant || {},
      currentThread: row.current_thread,
      speakerQueue: row.speaker_queue || [],
      updatedAt: row.updated_at,
    };
  }
}
```

### Export from Index

Update `backend/src/db/repositories/index.ts`:

```typescript
export { PersonaRepository } from './persona-repository.js';
export { ConversationSessionRepository } from './conversation-session-repository.js';
export { ConversationParticipantRepository } from './conversation-participant-repository.js';
export { ConversationUtteranceRepository } from './conversation-utterance-repository.js';
export { ContextBoardRepository } from './context-board-repository.js';
```

---

## Validation

### How to Test

1. Run unit tests:
   ```bash
   cd backend
   npm test -- --grep "ConversationRepository"
   ```

2. Integration test flow:
   ```typescript
   // Create session
   const session = await sessionRepo.create({
     topic: 'Should AI be regulated?',
     participants: [
       { personaSlug: 'professor_clara', modelId: 'anthropic/claude-sonnet-4' },
       { personaSlug: 'maverick_mike', modelId: 'openai/gpt-4o' },
     ],
     flowMode: 'manual',
   });

   // Add participants
   const participants = await participantRepo.createForSession(session.id, config.participants);

   // Create context board
   await contextBoardRepo.create(session.id);

   // Start session
   await sessionRepo.start(session.id);

   // Add utterances
   await utteranceRepo.create({
     sessionId: session.id,
     participantId: participants[0].id,
     content: 'I think regulation is essential...',
     timestampMs: 1000,
   });

   // Update context board
   await contextBoardRepo.addTopic(session.id, {
     topic: 'AI Regulation',
     introducedBy: participants[0].id,
     timestampMs: 1000,
     status: 'active',
   });
   ```

### Definition of Done

- [ ] All 4 repository classes created
- [ ] CRUD operations implemented
- [ ] Status transitions work correctly
- [ ] JSONB operations work for context board
- [ ] Utterances record direct addressing
- [ ] Unit tests pass with >90% coverage
- [ ] Repositories exported from index

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-004 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
