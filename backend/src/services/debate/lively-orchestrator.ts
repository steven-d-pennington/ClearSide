/**
 * Lively Debate Orchestrator
 *
 * Specialized orchestrator for "Lively Debate" mode with interruptions.
 * Coordinates between LivelyScheduler, InterruptionEngine, agents, and SSE.
 *
 * Key differences from standard DebateOrchestrator:
 * - Streams tokens in real-time (not waiting for full response)
 * - Evaluates for interrupts during generation
 * - Fires interjections at safe boundaries
 * - Manages concurrent speaker states
 */

import pino from 'pino';
import { DebatePhase, Speaker } from '../../types/debate.js';
import type { DebateStateMachine } from './state-machine.js';
import type { TurnManager } from './turn-manager.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type {
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
  AgentContext,
} from '../agents/types.js';
import type { Turn } from '../../types/orchestrator.js';
import type { LivelySettings } from '../../types/lively.js';
import { LivelyScheduler, createLivelyScheduler } from './lively-scheduler.js';
import {
  InterruptionEngine,
  createInterruptionEngine,
  type EvaluationContext,
} from './interruption-engine.js';
import * as livelyRepo from '../../db/repositories/lively-repository.js';
import * as debateRepo from '../../db/repositories/debate-repository.js';
import * as utteranceRepo from '../../db/repositories/utterance-repository.js';
import * as interventionRepo from '../../db/repositories/intervention-repository.js';
import { LLMClient } from '../llm/client.js';
import type { CreateUtteranceInput } from '../../types/database.js';
import type { DebatePhase as DbDebatePhase, Speaker as DbSpeaker } from '../../types/database.js';
import { PRO_ADVOCATE_PROMPTS, PRO_PROMPT_BUILDERS } from '../agents/prompts/pro-advocate-prompts.js';
import { CON_ADVOCATE_PROMPTS, CON_PROMPT_BUILDERS } from '../agents/prompts/con-advocate-prompts.js';
import { MODERATOR_PROMPTS, MODERATOR_PROMPT_BUILDERS } from '../agents/prompts/moderator-prompts.js';
import type { PromptBuilderContext } from '../agents/prompts/types.js';

const logger = pino({
  name: 'lively-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Context for interrupted utterances and interjections
 * Used by TTS to create realistic podcast audio
 */
interface InterruptionContext {
  // For interrupted utterances
  wasInterrupted: boolean;
  interruptedBy?: Speaker;
  interruptedAtToken?: number;
  completionPercentage?: number;

  // For interjections
  interruptionId?: number;
  interruptedSpeaker?: Speaker;
  triggerPhrase?: string;
  interruptionEnergy: number; // 1-5 scale
}

/**
 * Configuration for lively orchestrator
 */
export interface LivelyOrchestratorConfig {
  /** Debate ID */
  debateId: string;
  /** Proposition text */
  proposition: string;
  /** Lively mode settings */
  settings: LivelySettings;
  /** Token chunk size for streaming */
  tokenChunkSize?: number;
  /** Evaluation interval for interrupts (ms) */
  evaluationIntervalMs?: number;
  /** Whether to broadcast SSE events */
  broadcastEvents?: boolean;
}

/**
 * Map state machine speaker to database speaker
 */
function mapSpeakerToDb(speaker: Speaker): DbSpeaker {
  const speakerMap: Record<Speaker, DbSpeaker> = {
    [Speaker.PRO]: 'pro_advocate',
    [Speaker.CON]: 'con_advocate',
    [Speaker.MODERATOR]: 'moderator',
    [Speaker.SYSTEM]: 'moderator',
  };
  return speakerMap[speaker];
}

/**
 * Map state machine phase to database phase
 */
function mapPhaseToDb(phase: DebatePhase): DbDebatePhase {
  const phaseMap: Record<string, DbDebatePhase> = {
    [DebatePhase.PHASE_1_OPENING]: 'opening_statements',
    [DebatePhase.PHASE_2_CONSTRUCTIVE]: 'evidence_presentation',
    [DebatePhase.PHASE_3_CROSSEXAM]: 'clarifying_questions',
    [DebatePhase.PHASE_4_REBUTTAL]: 'rebuttals',
    [DebatePhase.PHASE_5_CLOSING]: 'closing_statements',
    [DebatePhase.PHASE_6_SYNTHESIS]: 'synthesis',
  };
  return phaseMap[phase] || 'opening_statements';
}

/**
 * Lively Debate Orchestrator Class
 */
export class LivelyDebateOrchestrator {
  private readonly debateId: string;
  private readonly proposition: string;
  private readonly settings: LivelySettings;
  private readonly scheduler: LivelyScheduler;
  private readonly interruptionEngine: InterruptionEngine;
  private readonly sseManager: SSEManager;
  private readonly stateMachine: DebateStateMachine;
  private readonly turnManager: TurnManager;
  private readonly llmClient: LLMClient;
  private readonly agents: {
    pro: ProAdvocateAgent;
    con: ConAdvocateAgent;
    moderator: ModeratorAgent;
    orchestrator: OrchestratorAgent;
  };

  private readonly broadcastEvents: boolean;
  private readonly evaluationIntervalMs: number;

  private startTimeMs: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastEvaluationMs: number = 0;

  // Track last interruption context for passing to saveUtterance
  private lastInterruptionContext: InterruptionContext | null = null;

  constructor(
    config: LivelyOrchestratorConfig,
    sseManager: SSEManager,
    stateMachine: DebateStateMachine,
    turnManager: TurnManager,
    agents: {
      pro: ProAdvocateAgent;
      con: ConAdvocateAgent;
      moderator: ModeratorAgent;
      orchestrator: OrchestratorAgent;
    },
    llmClient?: LLMClient
  ) {
    this.debateId = config.debateId;
    this.proposition = config.proposition;
    this.settings = config.settings;
    this.sseManager = sseManager;
    this.stateMachine = stateMachine;
    this.turnManager = turnManager;
    this.agents = agents;
    // Use the moderator's LLM client for interruption evaluation (neutral task)
    // This ensures we use the same provider/model the user selected for moderator
    this.llmClient = llmClient ?? agents.moderator.getLLMClient();

    this.broadcastEvents = config.broadcastEvents ?? true;
    this.evaluationIntervalMs = config.evaluationIntervalMs ?? 1000;

    // Create lively components
    this.scheduler = createLivelyScheduler(config.settings);
    this.interruptionEngine = createInterruptionEngine(
      config.debateId,
      config.settings,
      this.llmClient
    );

    // Wire up scheduler events
    this.setupSchedulerEvents();
    this.setupInterruptionEvents();

    logger.info(
      { debateId: this.debateId, settings: config.settings },
      'LivelyDebateOrchestrator created'
    );
  }

  /**
   * Start lively debate execution
   */
  async start(): Promise<void> {
    logger.info({ debateId: this.debateId }, 'Starting lively debate');

    this.startTimeMs = Date.now();
    this.isRunning = true;
    this.scheduler.start(this.startTimeMs);

    // Broadcast lively mode started
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'lively_mode_started', {
        debateId: this.debateId,
        settings: {
          aggressionLevel: this.settings.aggressionLevel,
          pacingMode: this.settings.pacingMode,
          maxInterruptsPerMinute: this.settings.maxInterruptsPerMinute,
        },
        timestampMs: this.getElapsedMs(),
      });
    }

    // Update database
    await livelyRepo.updateDebateMode(this.debateId, 'lively');

    // Execute all phases in lively mode
    await this.executeAllPhasesLively();

    this.isRunning = false;
    this.scheduler.stop();

    // Build and save transcript
    const transcript = await this.buildFinalTranscript();
    await debateRepo.saveTranscript(this.debateId, transcript as unknown as Record<string, unknown>);

    // Mark debate as completed in database
    await debateRepo.complete(this.debateId);

    // Broadcast completion event
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'debate_complete', {
        debateId: this.debateId,
        completedAt: new Date().toISOString(),
        totalDurationMs: this.getElapsedMs(),
        debateMode: 'lively',
      });
    }

    logger.info({ debateId: this.debateId }, 'Lively debate completed');
  }

  /**
   * Pause the debate
   */
  pause(): void {
    this.isPaused = true;
    logger.info({ debateId: this.debateId }, 'Lively debate paused');
  }

  /**
   * Resume the debate
   */
  resume(): void {
    this.isPaused = false;
    logger.info({ debateId: this.debateId }, 'Lively debate resumed');
  }

  /**
   * Stop the debate immediately
   * This will cause the debate to exit cleanly at the next check point
   */
  async stop(reason?: string): Promise<void> {
    logger.info({ debateId: this.debateId, reason }, 'Stopping lively debate');
    this.isRunning = false;
    this.scheduler.stop();

    // Update database status
    await debateRepo.updateStatus(this.debateId, { status: 'completed' });

    // Broadcast stop event
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'debate_stopped', {
        debateId: this.debateId,
        stoppedAt: new Date().toISOString(),
        reason: reason || 'User stopped debate',
        totalDurationMs: this.getElapsedMs(),
        debateMode: 'lively',
      });
    }
  }

  /**
   * Check if the debate has been stopped
   */
  isStopped(): boolean {
    return !this.isRunning;
  }

  // ===========================================================================
  // Phase Execution
  // ===========================================================================

  /**
   * Execute all phases with lively mode handling
   */
  private async executeAllPhasesLively(): Promise<void> {
    const phases = [
      DebatePhase.PHASE_1_OPENING,
      DebatePhase.PHASE_2_CONSTRUCTIVE,
      DebatePhase.PHASE_3_CROSSEXAM,
      DebatePhase.PHASE_4_REBUTTAL,
      DebatePhase.PHASE_5_CLOSING,
      DebatePhase.PHASE_6_SYNTHESIS,
    ];

    for (const phase of phases) {
      if (!this.isRunning) break;

      while (this.isPaused) {
        await this.sleep(100);
      }

      await this.executePhaseLively(phase);
    }
  }

  /**
   * Execute a single phase with interruption support
   */
  private async executePhaseLively(phase: DebatePhase): Promise<void> {
    logger.info({ debateId: this.debateId, phase }, 'Starting lively phase');

    const plan = this.turnManager.getPhaseExecutionPlan(phase);

    // Broadcast phase start
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'phase_start', {
        phase,
        phaseName: plan.metadata.name,
        turnCount: plan.turns.length,
        debateMode: 'lively',
      });
    }

    // Execute turns with interrupt handling
    for (const turn of plan.turns) {
      if (!this.isRunning) break;

      while (this.isPaused) {
        await this.sleep(100);
      }

      await this.executeTurnLively(turn, phase);
    }

    // Broadcast phase complete
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'phase_complete', {
        phase,
        phaseName: plan.metadata.name,
      });
    }
  }

  /**
   * Execute a turn with token streaming and interrupt evaluation
   */
  private async executeTurnLively(turn: Turn, phase: DebatePhase): Promise<void> {
    logger.debug({ turn, phase }, 'Executing lively turn');

    const speaker = turn.speaker;
    const startMs = this.getElapsedMs();

    // Reset interruption context at start of turn
    this.lastInterruptionContext = null;

    // Start speaker in scheduler
    this.scheduler.startSpeaker(speaker);

    // Broadcast speaker started
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'speaker_started', {
        debateId: this.debateId,
        speaker: mapSpeakerToDb(speaker),
        phase: mapPhaseToDb(phase),
        timestampMs: startMs,
      });
    }

    // Update active speaker in database
    await livelyRepo.updateActiveSpeaker(this.debateId, speaker, startMs);

    try {
      // Build context and generate with streaming
      const context = await this.buildAgentContext(speaker);
      const fullContent = await this.generateWithInterrupts(speaker, turn, context, phase);

      // End speaker turn
      this.scheduler.endSpeaker();

      // Capture interruption context before saving (for logging)
      // Type assertion needed because TypeScript can't track async flow through fireInterrupt()
      const interruptionContext = this.lastInterruptionContext as InterruptionContext | null;
      const wasInterrupted = interruptionContext?.wasInterrupted ?? false;

      // Save utterance to database with interruption context if this speaker was interrupted
      await this.saveUtterance(speaker, phase, fullContent, turn, interruptionContext);

      // Reset context after saving
      this.lastInterruptionContext = null;

      logger.debug({
        speaker,
        contentLength: fullContent.length,
        wasInterrupted,
      }, 'Turn complete');

    } catch (error) {
      logger.error({ speaker, error }, 'Turn execution failed');
      this.scheduler.endSpeaker();
      this.lastInterruptionContext = null;
      throw error;
    }
  }

  /**
   * Generate content with streaming and interrupt evaluation
   */
  private async generateWithInterrupts(
    speaker: Speaker,
    turn: Turn,
    context: AgentContext,
    phase: DebatePhase
  ): Promise<string> {
    // Try to use real streaming if supported by the agent's LLM client
    try {
      return await this.generateWithRealStreaming(speaker, turn, context, phase);
    } catch (error) {
      logger.warn({ speaker, error }, 'Real streaming failed, falling back to simulated streaming');
      // Fallback to simulated streaming
      return await this.generateWithSimulatedStreaming(speaker, turn, context, phase);
    }
  }

  /**
   * Generate content with real LLM token streaming
   */
  private async generateWithRealStreaming(
    speaker: Speaker,
    turn: Turn,
    context: AgentContext,
    phase: DebatePhase
  ): Promise<string> {
    let fullContent = '';
    let tokenCount = 0;

    // Get the streaming generator from the agent
    const stream = await this.callAgentStream(speaker, turn.promptType, context);

    for await (const chunk of stream) {
      if (!this.isRunning) break;

      // Process chunk through scheduler
      fullContent += chunk;
      tokenCount += chunk.length;
      const boundaryDetected = this.scheduler.processTokenChunk(chunk);

      // Broadcast token chunk
      if (this.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.debateId, 'token_chunk', {
          debateId: this.debateId,
          speaker: mapSpeakerToDb(speaker),
          chunk,
          tokenPosition: tokenCount,
          timestampMs: this.getElapsedMs(),
        });
      }

      // Evaluate for interrupts periodically
      const now = Date.now();
      if (now - this.lastEvaluationMs >= this.evaluationIntervalMs) {
        await this.evaluateForInterrupt(speaker, fullContent, phase);
        this.lastEvaluationMs = now;
      }

      // If interrupt is pending and boundary detected, fire it
      if (boundaryDetected && this.interruptionEngine.hasPendingInterrupt()) {
        const interrupted = await this.fireInterrupt(speaker, fullContent, phase, fullContent.length);
        if (interrupted) {
          // Speaker was interrupted - content is partial
          return fullContent;
        }
      }
    }

    return fullContent;
  }

  /**
   * Generate content with simulated streaming (fallback)
   */
  private async generateWithSimulatedStreaming(
    speaker: Speaker,
    turn: Turn,
    context: AgentContext,
    phase: DebatePhase
  ): Promise<string> {
    // Use the standard agent call (non-streaming)
    const content = await this.callAgent(speaker, turn.promptType, context);

    // Store total expected length for accurate completion percentage
    const totalExpectedLength = content.length;

    // Simulate streaming by chunking the response
    const chunks = this.chunkContent(content);
    let fullContent = '';

    for (const chunk of chunks) {
      if (!this.isRunning) break;

      // Process chunk through scheduler
      fullContent += chunk;
      const boundaryDetected = this.scheduler.processTokenChunk(chunk);

      // Broadcast token chunk
      if (this.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.debateId, 'token_chunk', {
          debateId: this.debateId,
          speaker: mapSpeakerToDb(speaker),
          chunk,
          tokenPosition: this.scheduler.getTokenPosition(),
          timestampMs: this.getElapsedMs(),
        });
      }

      // Evaluate for interrupts periodically
      const now = Date.now();
      if (now - this.lastEvaluationMs >= this.evaluationIntervalMs) {
        await this.evaluateForInterrupt(speaker, fullContent, phase);
        this.lastEvaluationMs = now;
      }

      // If interrupt is pending and boundary detected, fire it
      if (boundaryDetected && this.interruptionEngine.hasPendingInterrupt()) {
        const interrupted = await this.fireInterrupt(speaker, fullContent, phase, totalExpectedLength);
        if (interrupted) {
          // Speaker was interrupted - content is partial
          return fullContent;
        }
      }

      // Small delay to simulate streaming
      await this.sleep(50);
    }

    return fullContent;
  }

  /**
   * Evaluate current content for potential interrupts
   */
  private async evaluateForInterrupt(
    currentSpeaker: Speaker,
    content: string,
    _phase: DebatePhase
  ): Promise<void> {
    if (!this.scheduler.canInterrupt()) {
      return;
    }

    // Determine other participants
    const otherParticipants = this.getOtherParticipants(currentSpeaker);

    const evalContext: EvaluationContext = {
      debateId: this.debateId,
      topic: this.proposition,
      currentSpeaker,
      otherParticipants,
      recentContent: content.slice(-500), // Last 500 chars
      debateElapsedMs: this.getElapsedMs(),
    };

    const candidate = await this.interruptionEngine.evaluateForInterrupt(evalContext);

    if (candidate) {
      // Schedule interrupt for next boundary
      await this.interruptionEngine.scheduleInterrupt(
        candidate,
        this.getElapsedMs(),
        currentSpeaker
      );

      // Broadcast interrupt scheduled
      if (this.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.debateId, 'interrupt_scheduled', {
          debateId: this.debateId,
          interrupter: mapSpeakerToDb(candidate.speaker),
          currentSpeaker: mapSpeakerToDb(currentSpeaker),
          scheduledForMs: this.getElapsedMs(),
          relevanceScore: candidate.relevanceScore,
          triggerPhrase: candidate.triggerPhrase,
        });
      }
    }
  }

  /**
   * Fire a scheduled interrupt
   * Stores interruption context for the interrupted utterance and saves interjection with context
   */
  private async fireInterrupt(
    interruptedSpeaker: Speaker,
    partialContent: string,
    phase: DebatePhase,
    totalExpectedLength?: number
  ): Promise<boolean> {
    const candidate = this.interruptionEngine.getPendingCandidate();
    if (!candidate) {
      return false;
    }

    const firedAtMs = this.getElapsedMs();
    const atToken = this.scheduler.getTokenPosition();

    // Calculate completion percentage (estimate based on typical response length if not provided)
    const expectedLength = totalExpectedLength || 1000; // Default estimate
    const completionPercentage = Math.round((partialContent.length / expectedLength) * 100);

    // Calculate interruption energy based on aggression level and relevance score
    // Scale: 1=mild, 5=sharp
    const baseEnergy = Math.min(this.settings.aggressionLevel, 5);
    const relevanceBoost = (candidate.relevanceScore || 0.5) > 0.8 ? 1 : 0;
    const interruptionEnergy = Math.min(baseEnergy + relevanceBoost, 5);

    // Store context for the interrupted utterance (will be used in executeTurnLively)
    this.lastInterruptionContext = {
      wasInterrupted: true,
      interruptedBy: candidate.speaker,
      interruptedAtToken: atToken,
      completionPercentage,
      interruptedSpeaker,
      triggerPhrase: candidate.triggerPhrase,
      interruptionEnergy,
    };

    // Broadcast speaker cutoff
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'speaker_cutoff', {
        debateId: this.debateId,
        cutoffSpeaker: mapSpeakerToDb(interruptedSpeaker),
        interruptedBy: mapSpeakerToDb(candidate.speaker),
        atTokenPosition: atToken,
        partialContent: partialContent.slice(-100),
        timestampMs: firedAtMs,
        completionPercentage,
      });
    }

    // Mark speaker as interrupted
    this.scheduler.markInterrupted(interruptedSpeaker);

    // Build context for interjection
    const evalContext: EvaluationContext = {
      debateId: this.debateId,
      topic: this.proposition,
      currentSpeaker: candidate.speaker,
      otherParticipants: [interruptedSpeaker],
      recentContent: partialContent,
      debateElapsedMs: firedAtMs,
    };

    // Fire the interrupt and generate interjection
    const result = await this.interruptionEngine.fireInterrupt(
      evalContext,
      atToken,
      firedAtMs
    );

    if (!result) {
      // Reset context if interrupt failed
      this.lastInterruptionContext = null;
      return false;
    }

    // Update context with interruption ID from database
    this.lastInterruptionContext.interruptionId = result.interruption.id;

    // Broadcast interrupt fired
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'interrupt_fired', {
        debateId: this.debateId,
        interrupter: mapSpeakerToDb(candidate.speaker),
        interruptedSpeaker: mapSpeakerToDb(interruptedSpeaker),
        timestampMs: firedAtMs,
        interruptionEnergy,
      });
    }

    // Broadcast the interjection
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'interjection', {
        id: result.interruption.id,
        debateId: this.debateId,
        speaker: mapSpeakerToDb(candidate.speaker),
        content: result.interjection,
        timestampMs: firedAtMs,
        isInterjection: true,
        interruptionEnergy,
      });
    }

    // Build interjection context
    const interjectionContext: InterruptionContext = {
      wasInterrupted: false, // This is the interjection, not the interrupted utterance
      interruptionId: result.interruption.id,
      interruptedSpeaker,
      triggerPhrase: candidate.triggerPhrase,
      interruptionEnergy,
    };

    // Save interjection as utterance with context
    await this.saveInterjection(candidate.speaker, phase, result.interjection, interjectionContext);

    // Update speaker states
    this.scheduler.setSpeakerState(candidate.speaker, 'cooldown');

    // Close interrupt window
    this.scheduler.closeInterruptWindow('interrupt_fired');

    logger.info(
      {
        interrupter: candidate.speaker,
        interrupted: interruptedSpeaker,
        energy: interruptionEnergy,
        completionPct: completionPercentage,
      },
      'Interrupt fired successfully'
    );

    return true;
  }

  // ===========================================================================
  // Agent Calls
  // ===========================================================================

  /**
   * Call the appropriate agent method based on speaker and prompt type
   * Uses the specific phase methods that properly include the proposition
   */
  private async callAgent(
    speaker: Speaker,
    promptType: string,
    context: AgentContext
  ): Promise<string> {
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        // Call the appropriate phase-specific method
        switch (speaker) {
          case Speaker.PRO:
            return await this.callProAgent(promptType, context);
          case Speaker.CON:
            return await this.callConAgent(promptType, context);
          case Speaker.MODERATOR:
            return await this.callModeratorAgent(promptType, context);
          default:
            throw new Error(`Unknown speaker: ${speaker}`);
        }
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        logger.warn({ speaker, retries, error }, 'Agent call failed, retrying...');
        await this.sleep(1000 * retries);
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Call agent with streaming support
   * Returns an async generator that yields token chunks
   */
  private async callAgentStream(
    speaker: Speaker,
    promptType: string,
    context: AgentContext
  ): Promise<AsyncGenerator<string, void, unknown>> {
    // Call the appropriate phase-specific streaming method
    switch (speaker) {
      case Speaker.PRO:
        return this.callProAgentStream(promptType, context);
      case Speaker.CON:
        return this.callConAgentStream(promptType, context);
      case Speaker.MODERATOR:
        return this.callModeratorAgentStream(promptType, context);
      default:
        throw new Error(`Unknown speaker: ${speaker}`);
    }
  }

  /**
   * Call Pro advocate with streaming
   */
  private async *callProAgentStream(
    promptType: string,
    context: AgentContext
  ): AsyncGenerator<string, void, unknown> {
    // Get the LLM client from the Pro agent
    const llmClient = this.agents.pro.getLLMClient();

    // Build messages based on prompt type
    const messages = this.buildAgentMessages(Speaker.PRO, promptType, context);

    // Get configuration
    const temperature = context.configuration?.llmSettings?.temperature || 0.7;
    const maxTokens = context.configuration?.llmSettings?.maxTokensPerResponse || 2048;

    // Stream from LLM
    for await (const chunk of llmClient.streamChat(messages, {
      temperature,
      maxTokens,
    })) {
      yield chunk;
    }
  }

  /**
   * Call Con advocate with streaming
   */
  private async *callConAgentStream(
    promptType: string,
    context: AgentContext
  ): AsyncGenerator<string, void, unknown> {
    const llmClient = this.agents.con.getLLMClient();
    const messages = this.buildAgentMessages(Speaker.CON, promptType, context);

    const temperature = context.configuration?.llmSettings?.temperature || 0.7;
    const maxTokens = context.configuration?.llmSettings?.maxTokensPerResponse || 2048;

    for await (const chunk of llmClient.streamChat(messages, {
      temperature,
      maxTokens,
    })) {
      yield chunk;
    }
  }

  /**
   * Call Moderator with streaming
   */
  private async *callModeratorAgentStream(
    promptType: string,
    context: AgentContext
  ): AsyncGenerator<string, void, unknown> {
    const llmClient = this.agents.moderator.getLLMClient();
    const messages = this.buildAgentMessages(Speaker.MODERATOR, promptType, context);

    const temperature = context.configuration?.llmSettings?.temperature || 0.7;
    const maxTokens = context.configuration?.llmSettings?.maxTokensPerResponse || 2048;

    for await (const chunk of llmClient.streamChat(messages, {
      temperature,
      maxTokens,
    })) {
      yield chunk;
    }
  }

  /**
   * Build agent messages for LLM call
   * This consolidates the message building logic for both streaming and non-streaming
   */
  private buildAgentMessages(
    speaker: Speaker,
    promptType: string,
    context: AgentContext
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    // Get system prompt based on speaker and phase
    const systemPrompt = this.getSystemPrompt(speaker, promptType, context);

    // Get user message (the actual prompt for this turn)
    const userMessage = this.getUserPrompt(speaker, promptType, context);

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
  }

  /**
   * Get system prompt for speaker and phase using proper prompt templates
   */
  private getSystemPrompt(speaker: Speaker, promptType: string, _context: AgentContext): string {
    switch (speaker) {
      case Speaker.PRO:
        return this.getProSystemPrompt(promptType);
      case Speaker.CON:
        return this.getConSystemPrompt(promptType);
      case Speaker.MODERATOR:
        return this.getModeratorSystemPrompt(promptType);
      default:
        return `You are a ${speaker} in a formal debate. Provide a clear, well-reasoned response.`;
    }
  }

  /**
   * Get Pro advocate system prompt for the given phase
   */
  private getProSystemPrompt(promptType: string): string {
    switch (promptType) {
      case 'opening':
      case 'opening_statement':
        return PRO_ADVOCATE_PROMPTS.opening.template;
      case 'constructive':
      case 'constructive_argument':
        return PRO_ADVOCATE_PROMPTS.constructive.economic.template;
      case 'rebuttal':
        return PRO_ADVOCATE_PROMPTS.rebuttal.template;
      case 'closing':
      case 'closing_statement':
        return PRO_ADVOCATE_PROMPTS.closing.template;
      default:
        return PRO_ADVOCATE_PROMPTS.opening.template;
    }
  }

  /**
   * Get Con advocate system prompt for the given phase
   */
  private getConSystemPrompt(promptType: string): string {
    switch (promptType) {
      case 'opening':
      case 'opening_statement':
        return CON_ADVOCATE_PROMPTS.opening.template;
      case 'constructive':
      case 'constructive_argument':
        return CON_ADVOCATE_PROMPTS.constructive.economic.template;
      case 'rebuttal':
        return CON_ADVOCATE_PROMPTS.rebuttal.template;
      case 'closing':
      case 'closing_statement':
        return CON_ADVOCATE_PROMPTS.closing.template;
      default:
        return CON_ADVOCATE_PROMPTS.opening.template;
    }
  }

  /**
   * Get Moderator system prompt for the given phase
   */
  private getModeratorSystemPrompt(promptType: string): string {
    switch (promptType) {
      case 'introduction':
      case 'opening':
      case 'opening_statement':
        return MODERATOR_PROMPTS.introduction.template;
      case 'synthesis':
        return MODERATOR_PROMPTS.synthesis.template;
      case 'closing':
      case 'closing_statement':
        return MODERATOR_PROMPTS.synthesis.template;
      default:
        return MODERATOR_PROMPTS.introduction.template;
    }
  }

  /**
   * Get user prompt for speaker and phase using proper prompt builders
   */
  private getUserPrompt(speaker: Speaker, promptType: string, context: AgentContext): string {
    // Build the prompt context with proper typing
    const promptContext: PromptBuilderContext = {
      proposition: context.proposition,
      propositionContext: context.propositionContext as PromptBuilderContext['propositionContext'],
      previousUtterances: this.formatPreviousUtterances(context.previousUtterances),
      phase: context.currentPhase,
    };

    switch (speaker) {
      case Speaker.PRO:
        return this.getProUserPrompt(promptType, promptContext);
      case Speaker.CON:
        return this.getConUserPrompt(promptType, promptContext);
      case Speaker.MODERATOR:
        return this.getModeratorUserPrompt(promptType, promptContext);
      default:
        return `Provide your response to the proposition: "${context.proposition}"`;
    }
  }

  /**
   * Get Pro advocate user prompt
   */
  private getProUserPrompt(promptType: string, context: PromptBuilderContext): string {
    switch (promptType) {
      case 'opening':
      case 'opening_statement':
        return PRO_PROMPT_BUILDERS.opening(context);
      case 'constructive':
      case 'constructive_argument':
        return PRO_PROMPT_BUILDERS.constructive(context);
      case 'rebuttal':
        return PRO_PROMPT_BUILDERS.rebuttal(context);
      case 'closing':
      case 'closing_statement':
        return PRO_PROMPT_BUILDERS.closing(context);
      default:
        return PRO_PROMPT_BUILDERS.opening(context);
    }
  }

  /**
   * Get Con advocate user prompt
   */
  private getConUserPrompt(promptType: string, context: PromptBuilderContext): string {
    switch (promptType) {
      case 'opening':
      case 'opening_statement':
        return CON_PROMPT_BUILDERS.opening(context);
      case 'constructive':
      case 'constructive_argument':
        return CON_PROMPT_BUILDERS.constructive(context);
      case 'rebuttal':
        return CON_PROMPT_BUILDERS.rebuttal(context);
      case 'closing':
      case 'closing_statement':
        return CON_PROMPT_BUILDERS.closing(context);
      default:
        return CON_PROMPT_BUILDERS.opening(context);
    }
  }

  /**
   * Get Moderator user prompt
   */
  private getModeratorUserPrompt(promptType: string, context: PromptBuilderContext): string {
    switch (promptType) {
      case 'introduction':
      case 'opening':
      case 'opening_statement':
        return MODERATOR_PROMPT_BUILDERS.introduction(context);
      case 'synthesis':
        return MODERATOR_PROMPT_BUILDERS.synthesis({ ...context, fullTranscript: context.previousUtterances });
      case 'closing':
      case 'closing_statement':
        return MODERATOR_PROMPT_BUILDERS.synthesis({ ...context, fullTranscript: context.previousUtterances });
      default:
        return MODERATOR_PROMPT_BUILDERS.introduction(context);
    }
  }

  /**
   * Format previous utterances for context
   */
  private formatPreviousUtterances(utterances?: Array<{ speaker: string; content: string; phase?: string }>): string {
    if (!utterances || utterances.length === 0) {
      return '';
    }
    return utterances
      .map((u) => `[${u.speaker}]: ${u.content}`)
      .join('\n\n');
  }

  /**
   * Call Pro advocate with the appropriate phase method
   */
  private async callProAgent(promptType: string, context: AgentContext): Promise<string> {
    switch (promptType) {
      case 'opening':
      case 'opening_statement':
        return await this.agents.pro.generateOpeningStatement(context);
      case 'constructive':
      case 'constructive_argument':
        return await this.agents.pro.generateConstructiveArgument(context);
      case 'crossExamQuestion':
      case 'cross_exam_question':
        return await this.agents.pro.generateCrossExamQuestion(context);
      case 'crossExamResponse':
      case 'cross_exam_response': {
        // For cross-exam responses, we need the question from the last utterance
        const lastQuestion = this.getLastOpponentUtterance(context);
        return await this.agents.pro.respondToCrossExam(lastQuestion, context);
      }
      case 'rebuttal':
        return await this.agents.pro.generateRebuttal(context);
      case 'closing':
      case 'closing_statement':
        return await this.agents.pro.generateClosingStatement(context);
      default:
        // Fallback: use opening statement logic for unknown prompt types
        // This ensures the agent debates properly instead of using intervention prompts
        logger.warn({ promptType }, 'Unknown promptType, falling back to opening statement');
        return await this.agents.pro.generateOpeningStatement(context);
    }
  }

  /**
   * Call Con advocate with the appropriate phase method
   */
  private async callConAgent(promptType: string, context: AgentContext): Promise<string> {
    switch (promptType) {
      case 'opening':
      case 'opening_statement':
        return await this.agents.con.generateOpeningStatement(context);
      case 'constructive':
      case 'constructive_argument':
        return await this.agents.con.generateConstructiveArgument(context);
      case 'crossExamQuestion':
      case 'cross_exam_question':
        return await this.agents.con.generateCrossExamQuestion(context);
      case 'crossExamResponse':
      case 'cross_exam_response': {
        const lastQuestion = this.getLastOpponentUtterance(context);
        return await this.agents.con.respondToCrossExam(lastQuestion, context);
      }
      case 'rebuttal':
        return await this.agents.con.generateRebuttal(context);
      case 'closing':
      case 'closing_statement':
        return await this.agents.con.generateClosingStatement(context);
      default:
        // Fallback: use opening statement logic for unknown prompt types
        // This ensures the agent debates properly instead of using intervention prompts
        logger.warn({ promptType }, 'Unknown promptType, falling back to opening statement');
        return await this.agents.con.generateOpeningStatement(context);
    }
  }

  /**
   * Call Moderator with the appropriate phase method
   */
  private async callModeratorAgent(promptType: string, context: AgentContext): Promise<string> {
    switch (promptType) {
      case 'introduction':
      case 'opening':
      case 'opening_statement':
        return await this.agents.moderator.generateIntroduction(context.proposition, context);
      case 'synthesis':
        return await this.agents.moderator.generateSynthesis(context);
      case 'closing':
      case 'closing_statement':
        // Moderator doesn't have a closing method, use synthesis for final remarks
        return await this.agents.moderator.generateSynthesis(context);
      default:
        // Fallback: use synthesis for general moderator commentary
        logger.warn({ promptType }, 'Unknown moderator promptType, falling back to synthesis');
        return await this.agents.moderator.generateSynthesis(context);
    }
  }

  /**
   * Get the last opponent utterance for cross-exam responses
   */
  private getLastOpponentUtterance(context: AgentContext): string {
    if (!context.previousUtterances || context.previousUtterances.length === 0) {
      return '';
    }

    // Convert current speaker (enum) to database format (string) for comparison
    const currentSpeakerDb = mapSpeakerToDb(context.speaker);

    // Find the last utterance from a different speaker
    for (let i = context.previousUtterances.length - 1; i >= 0; i--) {
      const utterance = context.previousUtterances[i];
      if (utterance && utterance.speaker !== currentSpeakerDb) {
        return utterance.content;
      }
    }

    return '';
  }

  /**
   * Build agent context
   */
  private async buildAgentContext(speaker: Speaker): Promise<AgentContext> {
    // Get debate data
    const debate = await debateRepo.findById(this.debateId);
    const utterances = await utteranceRepo.findByDebateId(this.debateId);

    // Build context matching AgentContext interface
    const context: AgentContext = {
      debateId: this.debateId,
      proposition: this.proposition,
      currentPhase: this.stateMachine.getCurrentPhase(),
      previousUtterances: utterances, // Already Utterance[] type
      speaker,
      propositionContext: debate?.propositionContext,
    };

    return context;
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  /**
   * Save utterance to database
   * @param interruptionContext - Optional context if this utterance was interrupted
   */
  private async saveUtterance(
    speaker: Speaker,
    phase: DebatePhase,
    content: string,
    turn: Turn,
    interruptionContext?: InterruptionContext | null
  ): Promise<void> {
    const input: CreateUtteranceInput = {
      debateId: this.debateId,
      phase: mapPhaseToDb(phase),
      speaker: mapSpeakerToDb(speaker),
      content,
      timestampMs: this.getElapsedMs(),
      metadata: {
        promptType: turn.promptType,
        turnNumber: turn.turnNumber,
        debateMode: 'lively',
        // TTS-friendly interruption metadata
        ...(interruptionContext?.wasInterrupted && {
          wasInterrupted: true,
          interruptedBy: interruptionContext.interruptedBy
            ? mapSpeakerToDb(interruptionContext.interruptedBy)
            : undefined,
          interruptedAtToken: interruptionContext.interruptedAtToken,
          completionPercentage: interruptionContext.completionPercentage,
        }),
      },
    };

    await utteranceRepo.create(input);

    // Broadcast utterance
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'utterance', {
        debateId: this.debateId,
        phase: mapPhaseToDb(phase),
        speaker: mapSpeakerToDb(speaker),
        content,
        timestampMs: this.getElapsedMs(),
        wasInterrupted: interruptionContext?.wasInterrupted ?? false,
      });
    }
  }

  /**
   * Save interjection as a special utterance
   * @param interruptionContext - Context linking interjection to the interrupted speaker
   */
  private async saveInterjection(
    speaker: Speaker,
    phase: DebatePhase,
    content: string,
    interruptionContext: InterruptionContext
  ): Promise<void> {
    const input: CreateUtteranceInput = {
      debateId: this.debateId,
      phase: mapPhaseToDb(phase),
      speaker: mapSpeakerToDb(speaker),
      content,
      timestampMs: this.getElapsedMs(),
      metadata: {
        isInterjection: true,
        debateMode: 'lively',
        // TTS-friendly interjection metadata
        interruptionId: interruptionContext.interruptionId,
        interruptedSpeaker: interruptionContext.interruptedSpeaker
          ? mapSpeakerToDb(interruptionContext.interruptedSpeaker)
          : undefined,
        triggerPhrase: interruptionContext.triggerPhrase,
        interruptionEnergy: interruptionContext.interruptionEnergy,
      },
    };

    await utteranceRepo.create(input);
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  /**
   * Set up scheduler event handlers
   */
  private setupSchedulerEvents(): void {
    this.scheduler.on('speaker:started', (speaker, timestampMs) => {
      logger.debug({ speaker, timestampMs }, 'Scheduler: speaker started');
    });

    this.scheduler.on('speaker:ended', (speaker, timestampMs) => {
      logger.debug({ speaker, timestampMs }, 'Scheduler: speaker ended');
    });

    this.scheduler.on('boundary:safe', (speaker, position, _content) => {
      logger.debug({ speaker, position }, 'Scheduler: safe boundary detected');
    });

    this.scheduler.on('window:opened', (speaker, sinceMs) => {
      logger.debug({ speaker, sinceMs }, 'Scheduler: interrupt window opened');
    });
  }

  /**
   * Set up interruption engine event handlers
   */
  private setupInterruptionEvents(): void {
    this.interruptionEngine.on('candidate:detected', (candidate) => {
      logger.debug({ candidate }, 'Engine: interrupt candidate detected');
    });

    this.interruptionEngine.on('interrupt:fired', (candidate, interjection) => {
      logger.info(
        { speaker: candidate.speaker, interjectionLength: interjection.length },
        'Engine: interrupt fired'
      );
    });

    this.interruptionEngine.on('interrupt:cancelled', (candidate, reason) => {
      logger.debug({ speaker: candidate.speaker, reason }, 'Engine: interrupt cancelled');
    });
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get elapsed time since debate start
   */
  private getElapsedMs(): number {
    return Date.now() - this.startTimeMs;
  }

  /**
   * Get other participants (for interrupt evaluation)
   */
  private getOtherParticipants(currentSpeaker: Speaker): Speaker[] {
    const all = [Speaker.PRO, Speaker.CON, Speaker.MODERATOR];
    return all.filter(s => s !== currentSpeaker);
  }

  /**
   * Chunk content for simulated streaming
   */
  private chunkContent(content: string): string[] {
    const chunkSize = 50; // characters per chunk
    const chunks: string[] = [];

    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    return chunks;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // Transcript Building
  // ===========================================================================

  /**
   * Build final debate transcript for export
   * Uses the format expected by the markdown exporter (transcript-recorder schema)
   */
  private async buildFinalTranscript(): Promise<Record<string, unknown>> {
    logger.info({ debateId: this.debateId }, 'Building final transcript');

    // Fetch all data
    const debate = await debateRepo.findById(this.debateId);
    const utterances = await utteranceRepo.findByDebateId(this.debateId);
    const interventions = await interventionRepo.findByDebateId(this.debateId);

    if (!debate) {
      throw new Error('Debate not found');
    }

    // Convert speaker from database format to schema format
    const mapSpeakerToSchema = (s: string) => {
      const map: Record<string, string> = {
        'pro_advocate': 'pro',
        'con_advocate': 'con',
        'moderator': 'moderator',
      };
      return map[s] || s;
    };

    // Convert phase from database format to schema format
    const mapPhaseToSchema = (p: string) => {
      const map: Record<string, string> = {
        'opening_statements': 'phase_1_opening',
        'evidence_presentation': 'phase_2_constructive',
        'clarifying_questions': 'phase_3_crossexam',
        'rebuttals': 'phase_4_rebuttal',
        'closing_statements': 'phase_5_closing',
        'synthesis': 'phase_6_synthesis',
      };
      return map[p] || p;
    };

    // Calculate duration in seconds
    const durationMs = this.getElapsedMs();
    const durationSeconds = Math.round(durationMs / 1000);

    // Build transcript in the format expected by markdown exporter
    const transcript = {
      meta: {
        schema_version: '2.0.0',
        debate_id: this.debateId,
        generated_at: new Date().toISOString(),
        debate_format: 'lively',
        total_duration_seconds: durationSeconds,
        status: 'completed',
      },
      proposition: {
        raw_input: debate.propositionText,
        normalized_question: debate.propositionText,
        context: debate.propositionContext ? JSON.stringify(debate.propositionContext) : undefined,
      },
      transcript: utterances.map((u) => ({
        id: u.id,
        timestamp_ms: u.timestampMs,
        phase: mapPhaseToSchema(u.phase),
        speaker: mapSpeakerToSchema(u.speaker),
        content: u.content,
        metadata: u.metadata || {},
      })),
      structured_analysis: {
        pro: null,
        con: null,
        moderator: null,
      },
      user_interventions: interventions.map((i) => ({
        id: i.id,
        timestamp_ms: i.timestampMs,
        type: i.interventionType,
        content: i.content,
        metadata: {
          directed_to: i.directedTo,
          response: i.response,
          response_timestamp_ms: i.responseTimestampMs,
        },
      })),
    };

    return transcript;
  }
}

/**
 * Create a lively debate orchestrator
 */
export async function createLivelyOrchestrator(
  debateId: string,
  proposition: string,
  sseManager: SSEManager,
  stateMachine: DebateStateMachine,
  turnManager: TurnManager,
  agents: {
    pro: ProAdvocateAgent;
    con: ConAdvocateAgent;
    moderator: ModeratorAgent;
    orchestrator: OrchestratorAgent;
  },
  settingsOverrides?: Partial<LivelySettings>
): Promise<LivelyDebateOrchestrator> {
  // Get or create lively settings
  let settings = await livelyRepo.findLivelySettingsByDebateId(debateId);

  if (!settings) {
    settings = await livelyRepo.createLivelySettings({
      debateId,
      ...settingsOverrides,
    });
  } else if (settingsOverrides) {
    settings = await livelyRepo.updateLivelySettings(debateId, settingsOverrides) || settings;
  }

  const config: LivelyOrchestratorConfig = {
    debateId,
    proposition,
    settings,
  };

  return new LivelyDebateOrchestrator(
    config,
    sseManager,
    stateMachine,
    turnManager,
    agents
  );
}
