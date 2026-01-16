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
import {
  PersonaMemoryRepository,
  createPersonaMemoryRepository,
} from '../../db/repositories/persona-memory-repository.js';
import {
  PersonaMemoryService,
  createPersonaMemoryService,
  type SessionExtractions,
  type PostSessionInput,
} from '../persona-memory-service.js';
import type {
  ConversationSession,
  ConversationParticipant,
  ConversationUtterance,
  FlowMode,
  PodcastPersona,
  SegmentType,
} from '../../types/conversation.js';
import { HOST_PERSONA_SLUG } from '../../types/conversation.js';
import type { PersonaMemoryContext } from '../../types/persona-memory.js';

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
  private memoryRepo: PersonaMemoryRepository;

  // Memory service
  private memoryService: PersonaMemoryService;
  private sessionExtractions: Map<string, SessionExtractions> = new Map();

  // Session state
  private session: ConversationSession | null = null;
  private participants: ConversationParticipant[] = [];
  private personas: Map<string, PodcastPersona> = new Map();

  // Agents
  private hostAgent: PodcastHostAgent | null = null;
  private hostPersona: PodcastPersona | undefined;
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
    this.memoryRepo = createPersonaMemoryRepository(this.pool);
    this.memoryService = createPersonaMemoryService(this.pool);

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

    // Use session's maxTurns if available, otherwise use constructor value
    if (this.session.maxTurns) {
      this.maxTurns = this.session.maxTurns;
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

    // Create guest info list
    const guestInfos = this.participants.map(p => ({
      participant: p,
      persona: this.personas.get(p.personaId)!,
    })).filter(g => g.persona); // Filter out any with missing personas

    // Load host persona (Quinn) from database
    try {
      const loadedHostPersona = await this.personaRepo.findBySlug(HOST_PERSONA_SLUG);
      this.hostPersona = loadedHostPersona || undefined;
      if (this.hostPersona) {
        logger.info({
          sessionId: this.sessionId,
          hostPersonaId: this.hostPersona.id,
          hostName: this.hostPersona.name,
        }, 'Loaded host persona');
        // Update participant names map with Quinn's name
        participantNames.set('host', this.hostPersona.name);
      }
    } catch (error) {
      logger.warn({
        sessionId: this.sessionId,
        hostSlug: HOST_PERSONA_SLUG,
        error,
      }, 'Failed to load host persona, continuing with default');
    }

    // Fetch memory contexts for all personas AND host (if memory system is enabled)
    const memoryContexts = new Map<string, PersonaMemoryContext>();
    const topicKeys = this.extractTopicKeys(this.session.topic);
    const participantPersonaIds = guestInfos.map(g => g.persona.id);

    // Include host persona ID in the list for relationship lookups
    const allPersonaIds = this.hostPersona
      ? [...participantPersonaIds, this.hostPersona.id]
      : participantPersonaIds;

    // Load host memory context first
    let hostMemoryContext: PersonaMemoryContext | undefined;
    if (this.hostPersona) {
      try {
        hostMemoryContext = await this.memoryRepo.buildMemoryContext(
          this.hostPersona.id,
          topicKeys,
          participantPersonaIds // Host's relationships are with guests
        );
        logger.info({
          sessionId: this.sessionId,
          hostName: this.hostPersona.name,
          coreValuesCount: hostMemoryContext.coreValues.length,
          opinionsCount: hostMemoryContext.relevantOpinions.length,
        }, 'Loaded host memory context');
      } catch (error) {
        logger.warn({
          sessionId: this.sessionId,
          hostPersonaId: this.hostPersona.id,
          error,
        }, 'Failed to load host memory context, continuing without memory');
      }
    }

    // Load guest memory contexts
    for (const { persona } of guestInfos) {
      try {
        const memoryContext = await this.memoryRepo.buildMemoryContext(
          persona.id,
          topicKeys,
          allPersonaIds.filter(id => id !== persona.id) // Other participants including host
        );
        memoryContexts.set(persona.id, memoryContext);
      } catch (error) {
        // Memory context is optional - log warning and continue without it
        logger.warn({
          sessionId: this.sessionId,
          personaId: persona.id,
          personaSlug: persona.slug,
          error,
        }, 'Failed to load memory context for persona, continuing without memory');
      }
    }

    logger.info({
      sessionId: this.sessionId,
      memoryContextsLoaded: memoryContexts.size,
      hostHasMemory: !!hostMemoryContext,
      topicKeys,
    }, 'Loaded memory contexts for personas');

    // Create host agent with persona and memory
    this.hostAgent = createPodcastHostAgent(
      this.sessionId,
      this.session.topic,
      guestInfos,
      this.session.topicContext || undefined,
      this.sseManager,
      this.session.rapidFire,
      this.hostPersona,
      hostMemoryContext
    );

    // Create persona agents with memory contexts
    this.personaAgents = createPersonaAgents(
      this.sessionId,
      this.session.topic,
      guestInfos,
      this.sseManager,
      this.session.rapidFire,
      this.session.minimalPersonaMode,
      memoryContexts
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

      // Phase 4: Post-session memory processing
      // Process accumulated memory extractions to update persona opinions/relationships
      await this.processPostSessionMemory();

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

    const hostName = this.hostAgent!.name;
    const hostSlug = this.hostPersona?.slug || 'host';
    this.broadcastUtterance(hostName, hostSlug, opening, true, 'introduction');

    // Process for context board
    await this.contextBoard!.processUtterance(utterance);

    // Update speaker history for flow tracking
    this.contextBoard!.addToSpeakerHistory('host');

    // Extract memory from host utterance
    await this.extractMemoryFromHostUtterance(opening);

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

      // Prevent host from speaking more than 2 consecutive turns
      if (decision.participantId === 'host') {
        const consecutiveHostTurns = this.contextBoard!.getConsecutiveHostTurns();
        if (consecutiveHostTurns >= 2) {
          logger.info({
            sessionId: this.sessionId,
            consecutiveHostTurns,
          }, 'Host has spoken 2+ consecutive turns, forcing guest selection');

          // Force guest selection - pick least spoken guest
          const guests = this.hostAgent!.getGuests()
            .sort((a, b) => a.turnCount - b.turnCount);

          if (guests.length > 0) {
            decision = {
              participantId: guests[0]!.participantId,
              reason: 'Host yielding after 2 consecutive turns',
              addressDirectly: true,
            };
          }
        }
      }

      // Broadcast speaker change
      const speakerName = decision.participantId === 'host'
        ? (this.hostAgent?.name || 'Host')
        : this.getParticipantName(decision.participantId);

      const personaSlug = decision.participantId === 'host'
        ? (this.hostPersona?.slug || 'host')
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
   * Closing phase - graceful closing sequence
   *
   * 1. Host announces wrap-up creatively
   * 2. Each participant gets a final statement
   * 3. Host provides synthesis/summary
   */
  private async runClosingPhase(): Promise<void> {
    logger.info({ sessionId: this.sessionId }, 'Running closing sequence');

    const hostName = this.hostAgent!.name;
    const hostSlug = this.hostPersona?.slug || 'host';

    // Step 1: Host announces we're wrapping up
    const wrapUpTimestampMs = Date.now() - this.startTime;
    const wrapUpAnnouncement = await this.hostAgent!.generateWrapUpAnnouncement();

    const wrapUpUtterance = await this.saveUtteranceWithTimestamp(
      undefined,
      wrapUpAnnouncement,
      true,
      'closing',
      wrapUpTimestampMs
    );

    this.broadcastUtterance(hostName, hostSlug, wrapUpAnnouncement, true, 'closing');
    await this.contextBoard!.processUtterance(wrapUpUtterance);
    await this.extractMemoryFromHostUtterance(wrapUpAnnouncement);

    // Brief delay before final statements
    await this.delay(this.session?.rapidFire ? 300 : 500);

    // Step 2: Each participant gets a final statement
    const recentTranscript = await this.getRecentTranscript(5);
    const guests = this.hostAgent!.getGuests();

    for (const guest of guests) {
      const agent = this.personaAgents.get(guest.participantId);
      if (!agent) {
        logger.warn({ participantId: guest.participantId }, 'Agent not found for final statement');
        continue;
      }

      // Host prompts this guest for final thoughts
      const promptTimestampMs = Date.now() - this.startTime;
      const closingPrompt = await this.hostAgent!.generateClosingThoughtPrompt(guest);

      const promptUtterance = await this.saveUtteranceWithTimestamp(
        undefined,
        closingPrompt,
        true,
        'closing',
        promptTimestampMs
      );

      this.broadcastUtterance(hostName, hostSlug, closingPrompt, true, 'closing');
      await this.contextBoard!.processUtterance(promptUtterance);

      // Brief delay for natural pacing
      await this.delay(this.session?.rapidFire ? 200 : 400);

      // Guest gives final thought
      const finalThoughtTimestampMs = Date.now() - this.startTime;
      const finalThought = await agent.generateFinalThought(recentTranscript);

      const finalThoughtUtterance = await this.saveUtteranceWithTimestamp(
        guest.participantId,
        finalThought,
        false,
        'closing',
        finalThoughtTimestampMs
      );

      this.broadcastUtterance(
        agent.name,
        agent.personaSlug,
        finalThought,
        false,
        'closing',
        guest.participantId
      );

      await this.contextBoard!.processUtterance(finalThoughtUtterance);

      // Extract memory from the final thought
      this.extractMemoryFromUtterance(guest.participantId, finalThought).catch(err => {
        logger.warn({ err, sessionId: this.sessionId }, 'Memory extraction failed for final thought');
      });

      // Add to host's context
      this.hostAgent!.addParticipantMessage(agent.name, finalThought);

      // Brief delay before next participant
      await this.delay(this.session?.rapidFire ? 200 : 400);
    }

    // Step 3: Host synthesis/summary
    const synthesisTimestampMs = Date.now() - this.startTime;
    const synthesis = await this.hostAgent!.generateClosing(this.contextBoard!);

    const synthesisUtterance = await this.saveUtteranceWithTimestamp(
      undefined,
      synthesis,
      true,
      'closing',
      synthesisTimestampMs
    );

    this.broadcastUtterance(hostName, hostSlug, synthesis, true, 'closing');
    await this.contextBoard!.processUtterance(synthesisUtterance);
    await this.extractMemoryFromHostUtterance(synthesis);

    logger.info({
      sessionId: this.sessionId,
      participantsWithFinalStatements: guests.length,
    }, 'Closing sequence completed');
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

    const hostName = this.hostAgent!.name;
    const hostSlug = this.hostPersona?.slug || 'host';
    this.broadcastUtterance(hostName, hostSlug, content, true, 'host_question');

    await this.contextBoard!.processUtterance(utterance);
    this.lastSpeakerId = 'host';

    // Update speaker history for flow tracking
    this.contextBoard!.addToSpeakerHistory('host');

    // Add to host's context
    this.hostAgent!.addContext(content);

    // Extract memory from host utterance
    await this.extractMemoryFromHostUtterance(content);
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

    // Set emotional context for the agent before generating
    const emotionalBeat = this.contextBoard!.getEmotionalBeat();
    if (emotionalBeat) {
      agent.setEmotionalContext(emotionalBeat);
    }

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

    // Update speaker history for flow tracking
    this.contextBoard!.addToSpeakerHistory(decision.participantId);

    // Extract memory data from this utterance (async, non-blocking)
    // Fire and forget - don't await to avoid slowing conversation
    this.extractMemoryFromUtterance(decision.participantId, content).catch(err => {
      logger.warn({ err, sessionId: this.sessionId }, 'Memory extraction failed (async)');
    });

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

  /**
   * Extract topic keys from session topic for memory opinion filtering
   * Converts topic text into normalized keys for database lookup
   */
  private extractTopicKeys(topic: string): string[] {
    const keys: string[] = [];

    // Normalize the topic text
    const normalized = topic
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')      // Collapse whitespace
      .trim();

    // Add the full topic as a key (snake_case)
    const fullKey = normalized.replace(/\s/g, '_').substring(0, 100);
    if (fullKey) {
      keys.push(fullKey);
    }

    // Extract individual significant words (4+ chars, not common stop words)
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'would',
      'could', 'should', 'their', 'will', 'with', 'this', 'that', 'from',
      'they', 'what', 'which', 'about', 'into', 'when', 'where', 'there',
    ]);

    const words = normalized.split(' ');
    for (const word of words) {
      if (word.length >= 4 && !stopWords.has(word)) {
        keys.push(word);
      }
    }

    // Return unique keys
    return [...new Set(keys)];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =========================================================================
  // PERSONA MEMORY INTEGRATION
  // =========================================================================

  /**
   * Extract memory data from a participant utterance
   * Called after each non-host utterance during conversation
   */
  private async extractMemoryFromUtterance(
    participantId: string,
    content: string
  ): Promise<void> {
    const participant = this.participants.find(p => p.id === participantId);
    if (!participant) return;

    const persona = this.personas.get(participant.personaId);
    if (!persona) return;

    try {
      // Check if extraction is enabled
      const isEnabled = await this.memoryService.isExtractionEnabled();
      if (!isEnabled) return;

      // Extract memory data from the utterance
      const extraction = await this.memoryService.extractFromUtterance({
        personaId: persona.id,
        personaName: persona.name,
        content,
        sessionTopic: this.session?.topic || '',
        sessionId: this.sessionId,
      });

      // If substantive, accumulate in session extractions
      if (extraction.isSubstantive && extraction.topics.length > 0) {
        let sessionData = this.sessionExtractions.get(persona.id);
        if (!sessionData) {
          sessionData = {
            personaId: persona.id,
            personaName: persona.name,
            extractions: [],
            sessionId: this.sessionId,
          };
          this.sessionExtractions.set(persona.id, sessionData);
        }

        sessionData.extractions.push(...extraction.topics);

        logger.debug({
          sessionId: this.sessionId,
          personaId: persona.id,
          personaSlug: persona.slug,
          topicCount: extraction.topics.length,
          totalExtractions: sessionData.extractions.length,
        }, 'Accumulated memory extraction from utterance');
      }
    } catch (error) {
      // Memory extraction is non-blocking - log and continue
      logger.warn({
        error,
        sessionId: this.sessionId,
        participantId,
        personaSlug: persona.slug,
      }, 'Failed to extract memory from utterance, continuing without');
    }
  }

  /**
   * Extract memory data from a host utterance
   * Called after each host utterance during conversation
   */
  private async extractMemoryFromHostUtterance(content: string): Promise<void> {
    // Skip if no host persona is loaded
    if (!this.hostPersona) return;

    try {
      // Check if extraction is enabled
      const isEnabled = await this.memoryService.isExtractionEnabled();
      if (!isEnabled) return;

      // Extract memory data from the host utterance
      const extraction = await this.memoryService.extractFromUtterance({
        personaId: this.hostPersona.id,
        personaName: this.hostPersona.name,
        content,
        sessionTopic: this.session?.topic || '',
        sessionId: this.sessionId,
      });

      // If substantive, accumulate in session extractions
      if (extraction.isSubstantive && extraction.topics.length > 0) {
        let sessionData = this.sessionExtractions.get(this.hostPersona.id);
        if (!sessionData) {
          sessionData = {
            personaId: this.hostPersona.id,
            personaName: this.hostPersona.name,
            extractions: [],
            sessionId: this.sessionId,
          };
          this.sessionExtractions.set(this.hostPersona.id, sessionData);
        }

        sessionData.extractions.push(...extraction.topics);

        logger.debug({
          sessionId: this.sessionId,
          personaId: this.hostPersona.id,
          personaSlug: this.hostPersona.slug,
          topicCount: extraction.topics.length,
          totalExtractions: sessionData.extractions.length,
        }, 'Accumulated memory extraction from host utterance');
      }
    } catch (error) {
      // Memory extraction is non-blocking - log and continue
      logger.warn({
        error,
        sessionId: this.sessionId,
        personaSlug: this.hostPersona.slug,
      }, 'Failed to extract memory from host utterance, continuing without');
    }
  }

  /**
   * Process accumulated memory data after session completes
   * Updates persona opinions and relationship scores
   */
  private async processPostSessionMemory(): Promise<void> {
    if (this.sessionExtractions.size === 0) {
      logger.info({ sessionId: this.sessionId }, 'No memory extractions to process');
      return;
    }

    try {
      // Build agreement/disagreement pairs from context board
      const agreementPairs: Array<{ personaId1: string; personaId2: string }> = [];
      const disagreementPairs: Array<{ personaId1: string; personaId2: string }> = [];

      // Get agreement data from context board if available
      const contextState = this.contextBoard?.getState();
      if (contextState) {
        // Extract persona IDs from participants
        const participantToPersona = new Map<string, string>();
        for (const p of this.participants) {
          participantToPersona.set(p.id, p.personaId);
        }

        // Track agreements and disagreements from claims
        // Claims have participantId and supportedBy/challengedBy arrays
        for (const claim of contextState.claims) {
          const sourcePersonaId = participantToPersona.get(claim.participantId);
          if (!sourcePersonaId) continue;

          // Track agreements (supportedBy)
          for (const supporterId of claim.supportedBy) {
            const supporterPersonaId = participantToPersona.get(supporterId);
            if (supporterPersonaId && supporterPersonaId !== sourcePersonaId) {
              agreementPairs.push({ personaId1: sourcePersonaId, personaId2: supporterPersonaId });
            }
          }

          // Track disagreements (challengedBy)
          for (const challengerId of claim.challengedBy) {
            const challengerPersonaId = participantToPersona.get(challengerId);
            if (challengerPersonaId && challengerPersonaId !== sourcePersonaId) {
              disagreementPairs.push({ personaId1: sourcePersonaId, personaId2: challengerPersonaId });
            }
          }
        }
      }

      // Create post-session input
      const postSessionInput: PostSessionInput = {
        sessionId: this.sessionId,
        sessionTopic: this.session?.topic || '',
        participantExtractions: this.sessionExtractions,
        agreementPairs,
        disagreementPairs,
      };

      // Process the accumulated extractions
      await this.memoryService.processSessionMemory(postSessionInput);

      logger.info({
        sessionId: this.sessionId,
        participantCount: this.sessionExtractions.size,
        totalExtractions: Array.from(this.sessionExtractions.values())
          .reduce((sum, s) => sum + s.extractions.length, 0),
      }, 'Completed post-session memory processing');

    } catch (error) {
      // Memory processing is non-blocking - log and continue
      logger.error({
        error,
        sessionId: this.sessionId,
      }, 'Failed to process post-session memory, continuing without');
    }
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
