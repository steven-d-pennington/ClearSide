# CONV-008: ConversationalOrchestrator

**Task ID:** CONV-008
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** L (8-16 hours)
**Dependencies:** CONV-005 (PersonaAgent), CONV-006 (ContextBoard), CONV-007 (HostAgent)
**Status:** Ready

---

## Context

This task creates the ConversationalOrchestrator - the main engine that coordinates podcast conversations. It manages the flow between host and guests, handles different flow modes (manual, auto-stream, natural pace), and emits SSE events for real-time updates.

**References:**
- [CONV-005](./CONV-005.md) - PersonaAgent
- [CONV-006](./CONV-006.md) - ContextBoardService
- [CONV-007](./CONV-007.md) - PodcastHostAgent
- Existing: `backend/src/services/debate/duelogic-orchestrator.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `ConversationalOrchestrator` in `backend/src/services/conversation/conversational-orchestrator.ts`
- [ ] Implement opening phase (host introduces guests)
- [ ] Implement main conversation loop with hybrid flow control
- [ ] Implement closing phase (host summarizes)
- [ ] Support manual mode (advance on user request)
- [ ] Support auto-stream mode (continuous with configurable pace)
- [ ] Emit SSE events for all state changes
- [ ] Handle pause/resume
- [ ] Persist utterances to database

---

## Implementation Guide

### ConversationalOrchestrator Implementation

Create file: `backend/src/services/conversation/conversational-orchestrator.ts`

```typescript
import pino from 'pino';
import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import type { SSEManager } from '../sse/sse-manager.js';
import { PersonaAgent, createPersonaAgents } from './persona-agent.js';
import { ContextBoardService, createContextBoardService } from './context-board-service.js';
import { PodcastHostAgent, createPodcastHostAgent, SpeakerDecision } from '../agents/podcast-host-agent.js';
import { ConversationSessionRepository } from '../../db/repositories/conversation-session-repository.js';
import { ConversationParticipantRepository } from '../../db/repositories/conversation-participant-repository.js';
import { ConversationUtteranceRepository } from '../../db/repositories/conversation-utterance-repository.js';
import { PersonaRepository } from '../../db/repositories/persona-repository.js';
import type {
  ConversationSession,
  ConversationParticipant,
  ConversationUtterance,
  FlowMode,
  SessionStatus,
  PodcastPersona,
} from '../../types/conversation.js';

const logger = pino({
  name: 'conversational-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Default turn limits
 */
const DEFAULT_MAX_TURNS = 30;
const MIN_TURNS_BEFORE_CLOSING = 8;

/**
 * SSE event types for conversations
 */
type ConversationEventType =
  | 'conversation_started'
  | 'conversation_utterance'
  | 'conversation_token'
  | 'conversation_speaker_changed'
  | 'conversation_context_updated'
  | 'conversation_paused'
  | 'conversation_resumed'
  | 'conversation_completed'
  | 'conversation_error';

/**
 * Orchestrator options
 */
export interface OrchestratorOptions {
  pool: Pool;
  sseManager: SSEManager;
  sessionId: string;
  maxTurns?: number;
}

/**
 * ConversationalOrchestrator Class
 *
 * Coordinates podcast conversations between host and guests.
 * Handles flow control, turn management, and state persistence.
 */
export class ConversationalOrchestrator extends EventEmitter {
  private pool: Pool;
  private sseManager: SSEManager;
  private sessionId: string;
  private maxTurns: number;

  // Repositories
  private sessionRepo: ConversationSessionRepository;
  private participantRepo: ConversationParticipantRepository;
  private utteranceRepo: ConversationUtteranceRepository;
  private personaRepo: PersonaRepository;

  // Session state
  private session: ConversationSession | null = null;
  private participants: ConversationParticipant[] = [];
  private personas: Map<string, PodcastPersona> = new Map();

  // Agents
  private hostAgent: PodcastHostAgent | null = null;
  private personaAgents: Map<string, PersonaAgent> = new Map();
  private contextBoard: ContextBoardService | null = null;

  // Flow control
  private isPaused: boolean = false;
  private isRunning: boolean = false;
  private turnCount: number = 0;
  private startTime: number = 0;
  private pendingAdvance: (() => void) | null = null;

  constructor(options: OrchestratorOptions) {
    super();
    this.pool = options.pool;
    this.sseManager = options.sseManager;
    this.sessionId = options.sessionId;
    this.maxTurns = options.maxTurns || DEFAULT_MAX_TURNS;

    this.sessionRepo = new ConversationSessionRepository(this.pool);
    this.participantRepo = new ConversationParticipantRepository(this.pool);
    this.utteranceRepo = new ConversationUtteranceRepository(this.pool);
    this.personaRepo = new PersonaRepository(this.pool);

    logger.info({ sessionId: this.sessionId }, 'ConversationalOrchestrator created');
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Initialize the orchestrator - load session and create agents
   */
  async initialize(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Initializing orchestrator');

    // Load session
    this.session = await this.sessionRepo.findById(this.sessionId);
    if (!this.session) {
      throw new Error(`Session not found: ${this.sessionId}`);
    }

    // Load participants
    this.participants = await this.participantRepo.findBySessionId(this.sessionId);
    if (this.participants.length < 2) {
      throw new Error('At least 2 participants required');
    }

    // Load personas
    const personaIds = this.participants.map(p => p.personaId);
    const personaList = await this.personaRepo.findByIds(personaIds);
    for (const persona of personaList) {
      this.personas.set(persona.id, persona);
    }

    // Build participant name map for context board
    const participantNames = new Map<string, string>();
    for (const p of this.participants) {
      const persona = this.personas.get(p.personaId);
      participantNames.set(p.id, p.displayNameOverride || persona?.name || 'Unknown');
    }

    // Create context board
    this.contextBoard = await createContextBoardService(
      this.pool,
      this.sessionId,
      participantNames
    );

    // Create host agent
    const guestInfos = this.participants.map(p => ({
      participant: p,
      persona: this.personas.get(p.personaId)!,
    }));

    this.hostAgent = createPodcastHostAgent(
      this.sessionId,
      this.session.topic,
      guestInfos,
      this.session.topicContext || undefined,
      this.sseManager
    );

    // Create persona agents
    this.personaAgents = createPersonaAgents(
      this.sessionId,
      this.session.topic,
      guestInfos,
      this.sseManager
    );

    logger.info({
      sessionId: this.sessionId,
      participantCount: this.participants.length,
      personas: Array.from(this.personas.keys()),
    }, 'Orchestrator initialized');
  }

  // =========================================================================
  // MAIN FLOW
  // =========================================================================

  /**
   * Start the conversation
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({ sessionId: this.sessionId }, 'Conversation already running');
      return;
    }

    if (!this.session || !this.hostAgent || !this.contextBoard) {
      await this.initialize();
    }

    this.isRunning = true;
    this.startTime = Date.now();

    // Update session status
    await this.sessionRepo.updateStatus(this.sessionId, 'live');
    this.broadcastEvent('conversation_started', {
      sessionId: this.sessionId,
      topic: this.session!.topic,
      participants: this.participants.map(p => ({
        id: p.id,
        name: p.displayNameOverride || this.personas.get(p.personaId)?.name,
        persona: this.personas.get(p.personaId)?.slug,
      })),
    });

    logger.info({ sessionId: this.sessionId }, 'Conversation started');

    try {
      // Phase 1: Opening
      await this.runOpeningPhase();

      // Phase 2: Main conversation loop
      await this.runMainLoop();

      // Phase 3: Closing
      await this.runClosingPhase();

      // Mark complete
      await this.sessionRepo.updateStatus(this.sessionId, 'completed');
      this.broadcastEvent('conversation_completed', {
        sessionId: this.sessionId,
        turnCount: this.turnCount,
        duration: Date.now() - this.startTime,
      });

      logger.info({
        sessionId: this.sessionId,
        turnCount: this.turnCount,
        duration: Date.now() - this.startTime,
      }, 'Conversation completed');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Conversation failed');
      await this.sessionRepo.updateStatus(this.sessionId, 'paused');
      this.broadcastEvent('conversation_error', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // =========================================================================
  // PHASES
  // =========================================================================

  /**
   * Opening phase - host introduces guests and topic
   */
  private async runOpeningPhase(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Running opening phase');

    const opening = await this.hostAgent!.generateOpening();

    // Save and broadcast
    const utterance = await this.saveUtterance('host', opening, true);
    this.broadcastUtterance('Host', 'host', opening, true);

    // Process for context board
    await this.contextBoard!.processUtterance(utterance);

    // Wait for flow mode
    await this.handleFlowDelay();
  }

  /**
   * Main conversation loop
   */
  private async runMainLoop(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Running main conversation loop');

    while (this.turnCount < this.maxTurns && this.isRunning) {
      // Check for pause
      if (this.isPaused) {
        await this.waitForResume();
      }

      // Collect speaker signals from all participants
      await this.collectSpeakerSignals();

      // Host decides next speaker
      const recentTranscript = await this.getRecentTranscript(5);
      const decision = await this.hostAgent!.decideNextSpeaker(
        this.contextBoard!,
        recentTranscript
      );

      // Handle the turn
      if (decision.participantId === 'host') {
        await this.handleHostTurn(decision);
      } else {
        await this.handleParticipantTurn(decision);
      }

      this.turnCount++;

      // Broadcast context update
      this.broadcastEvent('conversation_context_updated', {
        sessionId: this.sessionId,
        summary: this.contextBoard!.getSummary(),
        turnCount: this.turnCount,
      });

      // Check if we should wrap up
      if (this.shouldClose()) {
        break;
      }

      // Wait for flow mode
      await this.handleFlowDelay();
    }
  }

  /**
   * Closing phase - host summarizes
   */
  private async runClosingPhase(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Running closing phase');

    const fullTranscript = await this.getRecentTranscript(this.turnCount);
    const closing = await this.hostAgent!.generateClosing(
      this.contextBoard!,
      fullTranscript
    );

    // Save and broadcast
    await this.saveUtterance('host', closing, true);
    this.broadcastUtterance('Host', 'host', closing, true);
  }

  // =========================================================================
  // TURN HANDLING
  // =========================================================================

  /**
   * Handle a host turn (follow-up, bridge, redirect)
   */
  private async handleHostTurn(decision: SpeakerDecision): Promise<void> {
    this.broadcastEvent('conversation_speaker_changed', {
      sessionId: this.sessionId,
      speakerId: 'host',
      speakerName: 'Host',
    });

    let content: string;

    if (decision.promptingQuestion) {
      content = decision.promptingQuestion;
    } else {
      // Generate appropriate host contribution
      const recentTranscript = await this.getRecentTranscript(3);
      const targetGuest = this.participants[0]; // Default to first
      const persona = this.personas.get(targetGuest.personaId)!;

      content = await this.hostAgent!.generateFollowUp(
        {
          participantId: targetGuest.id,
          persona,
          displayName: targetGuest.displayNameOverride || persona.name,
          turnCount: 0,
        },
        recentTranscript,
        decision.reason
      );
    }

    const utterance = await this.saveUtterance('host', content, true);
    this.broadcastUtterance('Host', 'host', content, true);
    await this.contextBoard!.processUtterance(utterance);
  }

  /**
   * Handle a participant turn
   */
  private async handleParticipantTurn(decision: SpeakerDecision): Promise<void> {
    const agent = this.personaAgents.get(decision.participantId);
    if (!agent) {
      logger.warn({ participantId: decision.participantId }, 'Agent not found');
      return;
    }

    const participant = this.participants.find(p => p.id === decision.participantId);
    const persona = this.personas.get(participant?.personaId || '');

    this.broadcastEvent('conversation_speaker_changed', {
      sessionId: this.sessionId,
      speakerId: decision.participantId,
      speakerName: agent.name,
      personaSlug: agent.personaSlug,
    });

    // Consume any pending signal for this participant
    this.contextBoard!.consumeSignal(decision.participantId);

    // Get recent context
    const recentTranscript = await this.getRecentTranscript(5);

    // Generate response
    const content = await agent.generateResponse(
      recentTranscript,
      decision.addressDirectly ? agent.name : undefined,
      undefined // previous speaker handled in context
    );

    // Save and broadcast
    const utterance = await this.saveUtterance(decision.participantId, content, false);
    this.broadcastUtterance(agent.name, agent.personaSlug, content, false);

    // Update host's turn tracking
    this.hostAgent!.updateGuestTurnCount(decision.participantId);

    // Process for context board
    await this.contextBoard!.processUtterance(utterance);
  }

  // =========================================================================
  // SIGNAL COLLECTION
  // =========================================================================

  /**
   * Collect speaking desire signals from all participants
   */
  private async collectSpeakerSignals(): Promise<void> {
    const recentContext = await this.getRecentTranscript(3);
    const currentSpeaker = 'Host'; // Or last speaker

    // Collect signals in parallel
    const signalPromises = Array.from(this.personaAgents.entries()).map(
      async ([participantId, agent]) => {
        try {
          const signal = await agent.evaluateSpeakingDesire(recentContext, currentSpeaker);
          if (signal) {
            this.contextBoard!.addSignal(signal);
          }
        } catch (error) {
          logger.warn({ error, participantId }, 'Failed to collect signal');
        }
      }
    );

    await Promise.all(signalPromises);
  }

  // =========================================================================
  // FLOW CONTROL
  // =========================================================================

  /**
   * Handle flow mode delays
   */
  private async handleFlowDelay(): Promise<void> {
    const flowMode = this.session?.flowMode || 'manual';

    if (flowMode === 'manual') {
      // Wait for explicit advance
      await this.waitForAdvance();
    } else if (flowMode === 'auto_stream') {
      // Brief delay then continue
      await this.delay(500);
    } else if (flowMode === 'natural_pace') {
      // Configurable delay
      const delay = this.session?.paceDelayMs || 3000;
      await this.delay(delay);
    }
  }

  /**
   * Wait for manual advance
   */
  private waitForAdvance(): Promise<void> {
    return new Promise(resolve => {
      this.pendingAdvance = resolve;
    });
  }

  /**
   * Advance to next turn (for manual mode)
   */
  advanceOnce(): void {
    if (this.pendingAdvance) {
      this.pendingAdvance();
      this.pendingAdvance = null;
    }
  }

  /**
   * Pause the conversation
   */
  async pause(): Promise<void> {
    this.isPaused = true;
    await this.sessionRepo.updateStatus(this.sessionId, 'paused');
    this.broadcastEvent('conversation_paused', {
      sessionId: this.sessionId,
      turnCount: this.turnCount,
    });
    logger.info({ sessionId: this.sessionId }, 'Conversation paused');
  }

  /**
   * Resume the conversation
   */
  async resume(): Promise<void> {
    this.isPaused = false;
    await this.sessionRepo.updateStatus(this.sessionId, 'live');
    this.broadcastEvent('conversation_resumed', {
      sessionId: this.sessionId,
    });
    this.emit('resume');
    logger.info({ sessionId: this.sessionId }, 'Conversation resumed');
  }

  /**
   * Wait for resume
   */
  private waitForResume(): Promise<void> {
    return new Promise(resolve => {
      this.once('resume', resolve);
    });
  }

  /**
   * Change flow mode
   */
  async setFlowMode(mode: FlowMode, paceDelayMs?: number): Promise<void> {
    await this.sessionRepo.updateFlowMode(this.sessionId, mode, paceDelayMs);
    if (this.session) {
      this.session.flowMode = mode;
      if (paceDelayMs) {
        this.session.paceDelayMs = paceDelayMs;
      }
    }
    logger.info({ sessionId: this.sessionId, mode, paceDelayMs }, 'Flow mode updated');
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private shouldClose(): boolean {
    // Close if max turns reached or conversation naturally winding down
    if (this.turnCount >= this.maxTurns) return true;
    if (this.turnCount < MIN_TURNS_BEFORE_CLOSING) return false;

    // Check if context board shows conversation is wrapping up
    const state = this.contextBoard!.getState();
    const allTopicsResolved = state.topicsDiscussed.every(t => t.status !== 'active');
    return allTopicsResolved && this.turnCount >= MIN_TURNS_BEFORE_CLOSING;
  }

  private async getRecentTranscript(turns: number): Promise<string> {
    const utterances = await this.utteranceRepo.getRecent(this.sessionId, turns);

    return utterances.map(u => {
      const participant = this.participants.find(p => p.id === u.participantId);
      const persona = participant ? this.personas.get(participant.personaId) : null;
      const name = u.participantId === 'host'
        ? 'Host'
        : (participant?.displayNameOverride || persona?.name || 'Unknown');
      return `${name}: ${u.content}`;
    }).join('\n\n');
  }

  private async saveUtterance(
    participantId: string,
    content: string,
    isHost: boolean
  ): Promise<ConversationUtterance> {
    const timestampMs = Date.now() - this.startTime;

    return this.utteranceRepo.create({
      sessionId: this.sessionId,
      participantId: isHost ? 'host' : participantId,
      content,
      timestampMs,
      isKeyPoint: false,
    });
  }

  private broadcastUtterance(
    speakerName: string,
    personaSlug: string,
    content: string,
    isHost: boolean
  ): void {
    this.broadcastEvent('conversation_utterance', {
      sessionId: this.sessionId,
      speakerName,
      personaSlug,
      content,
      isHost,
      turnCount: this.turnCount,
      timestamp: Date.now(),
    });
  }

  private broadcastEvent(type: ConversationEventType, data: Record<string, unknown>): void {
    this.sseManager.broadcastToConversation(this.sessionId, type, data);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and initialize an orchestrator for a session
 */
export async function createConversationalOrchestrator(
  pool: Pool,
  sseManager: SSEManager,
  sessionId: string,
  maxTurns?: number
): Promise<ConversationalOrchestrator> {
  const orchestrator = new ConversationalOrchestrator({
    pool,
    sseManager,
    sessionId,
    maxTurns,
  });

  await orchestrator.initialize();
  return orchestrator;
}
```

---

## Validation

### How to Test

1. Create a test session in database with 2 participants

2. Create and run orchestrator:
   ```typescript
   const orchestrator = await createConversationalOrchestrator(
     pool,
     sseManager,
     'session-123'
   );

   await orchestrator.start();
   ```

3. Test manual mode:
   ```typescript
   // Set to manual mode
   await orchestrator.setFlowMode('manual');

   // Start in background
   orchestrator.start();

   // Advance turns manually
   orchestrator.advanceOnce();
   ```

4. Test pause/resume:
   ```typescript
   await orchestrator.pause();
   // ... later ...
   await orchestrator.resume();
   ```

### Definition of Done

- [ ] `ConversationalOrchestrator` class implemented
- [ ] Opening phase introduces guests correctly
- [ ] Main loop uses host decisions to select speakers
- [ ] Speaker signals collected and considered
- [ ] Closing phase summarizes without picking winners
- [ ] Manual mode waits for `advanceOnce()`
- [ ] Auto-stream mode runs continuously
- [ ] Natural pace mode uses configurable delay
- [ ] Pause/resume works correctly
- [ ] All utterances persisted to database
- [ ] SSE events broadcast for all state changes
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-008 COMPLETE</promise>
```

---

**Estimated Time:** 8-16 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
