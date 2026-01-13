/**
 * Conversational Orchestrator for Podcast Mode
 *
 * Coordinates podcast conversations between host and guests.
 * Handles flow control, turn management, and state persistence.
 * Supports manual, auto-stream, and natural pace flow modes.
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import type { SSEManager } from '../sse/sse-manager.js';
import { PersonaAgent, createPersonaAgents } from './persona-agent.js';
import { ContextBoardService, createContextBoardService } from './context-board-service.js';
import {
  PodcastHostAgent,
  createPodcastHostAgent,
  type SpeakerDecision,
  type GuestInfo,
} from '../agents/podcast-host-agent.js';
import {
  ConversationSessionRepository,
  createConversationSessionRepository,
} from '../../db/repositories/conversation-session-repository.js';
import {
  ConversationParticipantRepository,
  createConversationParticipantRepository,
} from '../../db/repositories/conversation-participant-repository.js';
import {
  ConversationUtteranceRepository,
  createConversationUtteranceRepository,
  type CreateUtteranceInput,
} from '../../db/repositories/conversation-utterance-repository.js';
import {
  PodcastPersonaRepository,
  createPodcastPersonaRepository,
} from '../../db/repositories/podcast-persona-repository.js';
import type {
  ConversationSession,
  ConversationParticipant,
  ConversationUtterance,
  FlowMode,
  PodcastPersona,
  SegmentType,
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
  private personaRepo: PodcastPersonaRepository;

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
  private shouldStop: boolean = false;
  private turnCount: number = 0;
  private startTime: number = 0;
  private pendingAdvance: (() => void) | null = null;
  private lastSpeakerId: string = 'host';

  constructor(options: OrchestratorOptions) {
    super();
    this.pool = options.pool;
    this.sseManager = options.sseManager;
    this.sessionId = options.sessionId;
    this.maxTurns = options.maxTurns || DEFAULT_MAX_TURNS;

    this.sessionRepo = createConversationSessionRepository(this.pool);
    this.participantRepo = createConversationParticipantRepository(this.pool);
    this.utteranceRepo = createConversationUtteranceRepository(this.pool);
    this.personaRepo = createPodcastPersonaRepository(this.pool);

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
    console.log('ORCHESTRATOR: Initializing for session', this.sessionId);

    try {
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
    participantNames.set('host', this.session.hostDisplayName || 'Host');
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
    })).filter(g => g.persona); // Filter out any with missing personas

    this.hostAgent = createPodcastHostAgent(
      this.sessionId,
      this.session.topic,
      guestInfos,
      this.session.topicContext || undefined,
      this.sseManager,
      this.session.rapidFire
    );

    // Create persona agents
    this.personaAgents = createPersonaAgents(
      this.sessionId,
      this.session.topic,
      guestInfos,
      this.sseManager,
      this.session.rapidFire,
      this.session.minimalPersonaMode
    );

    console.log('ORCHESTRATOR: Initialization complete', {
      participantCount: this.participants.length,
      personas: Array.from(this.personas.values()).map(p => p.slug),
    });

    logger.info({
      sessionId: this.sessionId,
      participantCount: this.participants.length,
      personas: Array.from(this.personas.values()).map(p => p.slug),
    }, 'Orchestrator initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('ORCHESTRATOR INIT ERROR:', errorMessage);
      console.error('Stack:', error instanceof Error ? error.stack : 'N/A');
      throw error;
    }
  }

  // =========================================================================
  // PUBLIC ACCESSORS
  // =========================================================================

  /**
   * Check if orchestrator is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Check if orchestrator is paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Get current turn count
   */
  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Get session info
   */
  getSession(): ConversationSession | null {
    return this.session;
  }

  /**
   * Get context board state
   */
  getContextBoardState() {
    return this.contextBoard?.getState() || null;
  }

  // =========================================================================
  // MAIN FLOW
  // =========================================================================

  /**
   * Start the conversation (or resume if already has utterances)
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
    this.shouldStop = false;
    this.startTime = Date.now();

    // Check for existing utterances to determine if resuming
    const existingUtterances = await this.utteranceRepo.findBySessionId(this.sessionId);
    const isResuming = existingUtterances.length > 0;

    if (isResuming) {
      // Restore turn count from existing utterances (excluding host utterances for turn count)
      this.turnCount = existingUtterances.filter(u => !u.isHostUtterance).length;

      // Find last speaker
      const lastUtterance = existingUtterances[existingUtterances.length - 1];
      if (lastUtterance) {
        this.lastSpeakerId = lastUtterance.isHostUtterance ? 'host' : (lastUtterance.participantId || 'host');
      }

      // Restore individual guest turn counts in host agent
      // Count how many times each participant has spoken
      const participantTurnCounts = new Map<string, number>();
      for (const u of existingUtterances) {
        if (!u.isHostUtterance && u.participantId) {
          const current = participantTurnCounts.get(u.participantId) || 0;
          participantTurnCounts.set(u.participantId, current + 1);
        }
      }
      // Update host agent's guest turn counts
      for (const [participantId, count] of participantTurnCounts) {
        for (let i = 0; i < count; i++) {
          this.hostAgent!.updateGuestTurnCount(participantId);
        }
      }

      // Restore host agent context from existing utterances
      for (const u of existingUtterances.slice(-10)) { // Last 10 utterances for context
        if (u.isHostUtterance) {
          this.hostAgent!.addContext(u.content);
        } else {
          const speakerName = this.getParticipantName(u.participantId || '');
          this.hostAgent!.addParticipantMessage(speakerName, u.content);
        }
      }

      // Restore persona agent contexts from existing utterances
      for (const u of existingUtterances.slice(-10)) {
        for (const [participantId, agent] of this.personaAgents) {
          if (u.participantId !== participantId) {
            // Add other speakers' messages to this agent's context
            const speakerName = u.isHostUtterance
              ? 'Host'
              : this.getParticipantName(u.participantId || '');
            agent.addOtherSpeakerMessage(speakerName, u.content);
          }
        }
      }

      // Load context board state from database
      await this.contextBoard!.load();

      logger.info({
        sessionId: this.sessionId,
        existingUtterances: existingUtterances.length,
        turnCount: this.turnCount,
        participantTurnCounts: Object.fromEntries(participantTurnCounts),
      }, 'Resuming conversation');
    }

    // Update session status
    await this.sessionRepo.start(this.sessionId);

    this.broadcastEvent('conversation_started', {
      sessionId: this.sessionId,
      topic: this.session!.topic,
      participants: this.participants.map(p => ({
        id: p.id,
        name: p.displayNameOverride || this.personas.get(p.personaId)?.name,
        personaSlug: this.personas.get(p.personaId)?.slug,
        avatarEmoji: this.personas.get(p.personaId)?.avatarEmoji,
      })),
      flowMode: this.session!.flowMode,
      isResuming,
    });

    logger.info({ sessionId: this.sessionId, isResuming }, 'Conversation started');

    try {
      // Phase 1: Opening (skip if resuming)
      if (!isResuming) {
        await this.runOpeningPhase();
      }

      // Phase 2: Main conversation loop
      await this.runMainLoop();

      // Phase 3: Closing
      if (!this.shouldStop) {
        await this.runClosingPhase();
      }

      // Mark complete
      const duration = Date.now() - this.startTime;
      await this.sessionRepo.complete(this.sessionId, duration);

      if (process.env.AUTO_PUBLISH_ENABLED === 'true') {
        try {
          const { publishQueue } = await import('../queue/queue-manager.js');
          const job = await publishQueue.add('auto-publish-conversation', {
            sessionId: this.sessionId,
            conversationMode: this.session!.rapidFire
              ? 'rapid_fire'
              : this.session!.minimalPersonaMode
                ? 'model_debate'
                : 'normal',
          });

          logger.info({
            sessionId: this.sessionId,
            jobId: job.id,
          }, 'Auto-publish job queued');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({
            sessionId: this.sessionId,
            errorMessage,
          }, 'Failed to queue auto-publish job');
        }
      }

      this.broadcastEvent('conversation_completed', {
        sessionId: this.sessionId,
        turnCount: this.turnCount,
        duration,
      });

      logger.info({
        sessionId: this.sessionId,
        turnCount: this.turnCount,
        duration,
      }, 'Conversation completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error({
        error,
        errorMessage,
        errorStack,
        sessionId: this.sessionId,
      }, 'Conversation failed');

      // Log to console for immediate visibility
      console.error('CONVERSATION ERROR:', errorMessage);
      console.error('Stack:', errorStack);

      await this.sessionRepo.fail(this.sessionId);

      this.broadcastEvent('conversation_error', {
        sessionId: this.sessionId,
        error: errorMessage,
        stack: errorStack,
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the conversation
   */
  async stop(): Promise<void> {
    this.shouldStop = true;
    this.isRunning = false;

    // If waiting for manual advance, resolve it
    if (this.pendingAdvance) {
      this.pendingAdvance();
      this.pendingAdvance = null;
    }

    await this.sessionRepo.pause(this.sessionId);

    this.broadcastEvent('conversation_stopped', {
      sessionId: this.sessionId,
      turnCount: this.turnCount,
      duration: Date.now() - this.startTime,
    });

    logger.info({ sessionId: this.sessionId }, 'Conversation stopped');
  }

  // =========================================================================
  // PHASES
  // =========================================================================

  /**
   * Opening phase - host introduces guests and topic
   */
  private async runOpeningPhase(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Running opening phase');

    // Record timestamp at START of generation
    const startTimestampMs = Date.now() - this.startTime;

    // Generate host opening
    const opening = await this.hostAgent!.generateOpening();

    // Save and broadcast (use start timestamp)
    const utterance = await this.saveUtteranceWithTimestamp(
      undefined,
      opening,
      true,
      'introduction',
      startTimestampMs
    );

    this.broadcastUtterance('Host', 'host', opening, true, 'introduction');

    // Process for context board
    await this.contextBoard!.processUtterance(utterance);

    this.lastSpeakerId = 'host';

    // Wait for flow mode
    await this.handleFlowDelay();
  }

  /**
   * Main conversation loop
   */
  private async runMainLoop(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Running main conversation loop');

    while (this.turnCount < this.maxTurns && this.isRunning && !this.shouldStop) {
      // Check for pause
      if (this.isPaused) {
        await this.waitForResume();
      }

      // Collect speaker signals from all participants
      await this.collectSpeakerSignals();

      // Host decides next speaker
      const recentTranscript = await this.getRecentTranscript(5);
      let decision = await this.hostAgent!.decideNextSpeaker(
        this.contextBoard!,
        recentTranscript
      );

      // Prevent same speaker being called consecutively (except host can follow anyone)
      if (decision.participantId !== 'host' && decision.participantId === this.lastSpeakerId) {
        logger.warn({
          sessionId: this.sessionId,
          selectedSpeaker: decision.participantId,
          lastSpeaker: this.lastSpeakerId,
        }, 'Same speaker selected consecutively, selecting different speaker');

        // Find a different speaker - prefer one with fewer turns
        const otherGuests = this.hostAgent!.getGuests()
          .filter(g => g.participantId !== this.lastSpeakerId)
          .sort((a, b) => a.turnCount - b.turnCount);

        if (otherGuests.length > 0) {
          decision = {
            participantId: otherGuests[0]!.participantId,
            reason: 'Ensuring conversation variety - previous speaker just spoke',
            addressDirectly: true,
          };
        } else {
          // Only one guest, host should interject
          decision = {
            participantId: 'host',
            reason: 'Interjecting to maintain flow',
            addressDirectly: false,
          };
        }
      }

      // Broadcast speaker change
      const speakerName = decision.participantId === 'host'
        ? 'Host'
        : this.getParticipantName(decision.participantId);

      const personaSlug = decision.participantId === 'host'
        ? 'host'
        : this.getPersonaSlug(decision.participantId);

      this.broadcastEvent('conversation_speaker_changed', {
        sessionId: this.sessionId,
        speakerId: decision.participantId,
        speakerName,
        personaSlug,
        reason: decision.reason,
      });

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
        topics: this.contextBoard!.getTopics(),
      });

      // Check if we should wrap up
      if (this.shouldClose()) {
        logger.info({ sessionId: this.sessionId, turnCount: this.turnCount }, 'Closing condition met');
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

    // Record timestamp at START of generation
    const startTimestampMs = Date.now() - this.startTime;

    const closing = await this.hostAgent!.generateClosing(
      this.contextBoard!
    );

    // Save and broadcast (use start timestamp)
    const utterance = await this.saveUtteranceWithTimestamp(
      undefined,
      closing,
      true,
      'closing',
      startTimestampMs
    );

    this.broadcastUtterance('Host', 'host', closing, true, 'closing');

    // Process for context board
    await this.contextBoard!.processUtterance(utterance);
  }

  // =========================================================================
  // TURN HANDLING
  // =========================================================================

  /**
   * Handle a host turn (follow-up, bridge, redirect)
   */
  private async handleHostTurn(decision: SpeakerDecision): Promise<void> {
    // Record timestamp at START of generation (not after)
    const startTimestampMs = Date.now() - this.startTime;

    let content: string;

    if (decision.promptingQuestion) {
      content = decision.promptingQuestion;
    } else {
      // Generate appropriate host contribution
      const recentTranscript = await this.getRecentTranscript(3);

      // Find a target guest for follow-up
      const targetParticipant = this.participants[0];
      const persona = this.personas.get(targetParticipant?.personaId || '');

      if (targetParticipant && persona) {
        const guestInfo: GuestInfo = {
          participantId: targetParticipant.id,
          persona,
          displayName: targetParticipant.displayNameOverride || persona.name,
          turnCount: 0,
        };

        content = await this.hostAgent!.generateFollowUp(
          guestInfo,
          recentTranscript,
          decision.reason
        );
      } else {
        // Fallback to interjection
        content = await this.hostAgent!.generateInterjection(
          this.getParticipantName(this.lastSpeakerId),
          recentTranscript
        );
      }
    }

    // Save with start timestamp for correct ordering
    const utterance = await this.saveUtteranceWithTimestamp(
      undefined,
      content,
      true,
      'host_question',
      startTimestampMs
    );

    this.broadcastUtterance('Host', 'host', content, true, 'host_question');

    await this.contextBoard!.processUtterance(utterance);
    this.lastSpeakerId = 'host';

    // Add to host's context
    this.hostAgent!.addContext(content);
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

    // Record timestamp at START of generation (not after)
    const startTimestampMs = Date.now() - this.startTime;

    // Consume any pending signal for this participant
    this.contextBoard!.consumeSignal(decision.participantId);

    // Get recent context
    const recentTranscript = await this.getRecentTranscript(5);

    // Add recent messages to agent context
    const recentUtterances = await this.utteranceRepo.findRecent(this.sessionId, 3);
    for (const u of recentUtterances) {
      const speakerName = u.isHostUtterance
        ? 'Host'
        : this.getParticipantName(u.participantId || '');
      if (u.participantId !== decision.participantId) {
        agent.addOtherSpeakerMessage(speakerName, u.content);
      }
    }

    // Generate response
    const previousSpeakerName = this.getParticipantName(this.lastSpeakerId);
    let content: string;

    try {
      content = await agent.generateResponse(
        recentTranscript,
        decision.addressDirectly ? agent.name : undefined,
        previousSpeakerName
      );
    } catch (error: any) {
      // Check if this is a truncation error
      if (error?.code === 'TRUNCATION_DETECTED') {
        logger.warn({
          sessionId: this.sessionId,
          participantId: decision.participantId,
          personaName: agent.name,
          partialContentLength: error.partialContent?.length,
        }, 'Truncation detected - saving partial utterance and pausing for user intervention');

        // Save the partial utterance so frontend has an utterance ID for regeneration
        const partialContent = error.partialContent || '';
        const utterance = await this.saveUtteranceWithTimestamp(
          decision.participantId,
          partialContent,
          false,
          'discussion',
          startTimestampMs
        );

        // Broadcast the partial utterance
        this.broadcastUtterance(
          agent.name,
          agent.personaSlug,
          partialContent,
          false,
          'discussion',
          decision.participantId
        );

        // Update the agent's turn context with the utterance ID
        agent.setTurnContext(this.turnCount, utterance.id);

        // Re-emit truncation event with the utterance ID so frontend can show modal
        this.broadcastEvent('conversation_truncation_detected', {
          sessionId: this.sessionId,
          participantId: decision.participantId,
          personaSlug: agent.personaSlug,
          personaName: agent.name,
          partialContent: partialContent,
          contentLength: partialContent.length,
          lastChars: partialContent.slice(-50),
          detectionType: 'heuristic',
          currentModelId: (this.participants.find(p => p.id === decision.participantId) as any)?.modelId || 'unknown',
          turnCount: this.turnCount,
          utteranceId: utterance.id,
          timestampMs: Date.now(),
        });

        // Pause the orchestrator - user must manually resume after selecting new model
        await this.pause();

        // Return early without throwing - conversation is paused, not failed
        // The main loop will wait for resume via waitForResume()
        return;
      }

      // Re-throw other errors
      throw error;
    }

    // Save and broadcast (use start timestamp for correct ordering)
    const utterance = await this.saveUtteranceWithTimestamp(
      decision.participantId,
      content,
      false,
      'discussion',
      startTimestampMs
    );

    this.broadcastUtterance(
      agent.name,
      agent.personaSlug,
      content,
      false,
      'discussion',
      decision.participantId
    );

    // Update host's turn tracking
    this.hostAgent!.updateGuestTurnCount(decision.participantId);

    // Add to host's context
    this.hostAgent!.addParticipantMessage(agent.name, content);

    // Process for context board
    await this.contextBoard!.processUtterance(utterance);

    this.lastSpeakerId = decision.participantId;
  }

  // =========================================================================
  // SIGNAL COLLECTION
  // =========================================================================

  /**
   * Collect speaking desire signals from all participants
   */
  private async collectSpeakerSignals(): Promise<void> {
    const recentContext = await this.getRecentTranscript(3);
    const currentSpeakerName = this.getParticipantName(this.lastSpeakerId);

    // Collect signals in parallel
    const signalPromises = Array.from(this.personaAgents.entries()).map(
      async ([participantId, agent]) => {
        try {
          const signal = await agent.evaluateSpeakingDesire(recentContext, currentSpeakerName);
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
      // Broadcast that we're waiting for advance
      this.broadcastEvent('conversation_awaiting_advance', {
        sessionId: this.sessionId,
        turnCount: this.turnCount,
      });
      // Wait for explicit advance
      await this.waitForAdvance();
    } else if (flowMode === 'auto_stream') {
      // Brief delay then continue
      await this.delay(500);
    } else if (flowMode === 'natural_pace') {
      // Configurable delay
      const paceDelay = this.session?.paceDelayMs || 3000;
      await this.delay(paceDelay);
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
    await this.sessionRepo.pause(this.sessionId);

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
    await this.sessionRepo.resume(this.sessionId);

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
      if (paceDelayMs !== undefined) {
        this.session.paceDelayMs = paceDelayMs;
      }
    }

    this.broadcastEvent('conversation_flow_mode_changed', {
      sessionId: this.sessionId,
      flowMode: mode,
      paceDelayMs,
    });

    // If switching from manual to auto, trigger advance
    if (mode !== 'manual' && this.pendingAdvance) {
      this.pendingAdvance();
      this.pendingAdvance = null;
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
    const allTopicsResolved = state.topicsDiscussed.length > 0 &&
      state.topicsDiscussed.every(t => t.status !== 'active');

    return allTopicsResolved && this.turnCount >= MIN_TURNS_BEFORE_CLOSING;
  }

  private async getRecentTranscript(turns: number): Promise<string> {
    const utterances = await this.utteranceRepo.findRecent(this.sessionId, turns);

    return utterances.map(u => {
      const name = u.isHostUtterance
        ? 'Host'
        : this.getParticipantName(u.participantId || '');
      return `${name}: ${u.content}`;
    }).join('\n\n');
  }

  private getParticipantName(participantId: string): string {
    if (participantId === 'host') return 'Host';

    const participant = this.participants.find(p => p.id === participantId);
    const persona = participant ? this.personas.get(participant.personaId) : null;
    return participant?.displayNameOverride || persona?.name || 'Unknown';
  }

  private getPersonaSlug(participantId: string): string {
    if (participantId === 'host') return 'host';

    const participant = this.participants.find(p => p.id === participantId);
    const persona = participant ? this.personas.get(participant.personaId) : null;
    return persona?.slug || 'unknown';
  }

  /**
   * Save utterance with explicit timestamp (use start time for correct ordering)
   */
  private async saveUtteranceWithTimestamp(
    participantId: string | undefined,
    content: string,
    isHost: boolean,
    segmentType: SegmentType,
    timestampMs: number
  ): Promise<ConversationUtterance> {
    const input: CreateUtteranceInput = {
      sessionId: this.sessionId,
      participantId: isHost ? undefined : participantId,
      content,
      isHostUtterance: isHost,
      timestampMs,
      isKeyPoint: false,
      segmentType,
    };

    return this.utteranceRepo.create(input);
  }

  private broadcastUtterance(
    speakerName: string,
    personaSlug: string,
    content: string,
    isHost: boolean,
    segmentType: SegmentType,
    participantId?: string
  ): void {
    this.broadcastEvent('conversation_utterance', {
      sessionId: this.sessionId,
      speakerName,
      personaSlug,
      participantId: isHost ? undefined : participantId,
      content,
      isHost,
      segmentType,
      turnCount: this.turnCount,
      timestamp: Date.now(),
    });
  }

  private broadcastEvent(type: string, data: Record<string, unknown>): void {
    // Use broadcastToDebate with sessionId as the "debateId"
    // This reuses the existing SSE infrastructure
    this.sseManager.broadcastToDebate(this.sessionId, type as any, data);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// FACTORY FUNCTIONS
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

/**
 * Create orchestrator without initializing (for background jobs)
 */
export function createOrchestratorInstance(
  pool: Pool,
  sseManager: SSEManager,
  sessionId: string,
  maxTurns?: number
): ConversationalOrchestrator {
  return new ConversationalOrchestrator({
    pool,
    sseManager,
    sessionId,
    maxTurns,
  });
}
