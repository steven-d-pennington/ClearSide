/**
 * Debate Orchestrator
 *
 * Core orchestration engine that manages the complete lifecycle of a debate.
 * Coordinates between state machine, agents, SSE broadcasting, and persistence.
 *
 * Responsibilities:
 * - Execute debates through all 6 phases
 * - Coordinate agent calls for each turn
 * - Manage pause/resume functionality
 * - Handle user interventions
 * - Validate and persist utterances
 * - Broadcast events via SSE
 * - Generate final transcripts
 * - Handle errors and retry logic
 */

import pino from 'pino';
import { DebatePhase, Speaker } from '../../types/debate.js';
import type { DebateStateMachine } from './state-machine.js';
import type { TurnManager } from './turn-manager.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type { SchemaValidator } from '../validation/schema-validator.js';
import type { DebateConfiguration, BrevityLevel } from '../../types/configuration.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';
import type {
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
  AgentContext,
  NormalizedProposition,
  RAGCitationContext,
} from '../agents/types.js';
import { createVectorDBClient } from '../research/vector-db-factory.js';
import { createEmbeddingService } from '../research/embedding-service.js';
import { RAGRetrievalService } from '../research/rag-retrieval-service.js';
import type {
  OrchestratorUtterance,
  OrchestratorIntervention,
  DebateTranscript,
  PropositionContext,
  OrchestratorConfig,
  Turn,
} from '../../types/orchestrator.js';
import type { Utterance, CreateUtteranceInput } from '../../types/database.js';
import type { DebatePhase as DbDebatePhase, Speaker as DbSpeaker } from '../../types/database.js';
import * as debateRepo from '../../db/repositories/debate-repository.js';
import * as utteranceRepo from '../../db/repositories/utterance-repository.js';
import * as interventionRepo from '../../db/repositories/intervention-repository.js';
import * as personaRepo from '../../db/repositories/persona-repository.js';
import { getNextPhase } from '../../config/debate-protocol.js';
import type { Persona } from '../../types/configuration.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'debate-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Default orchestrator configuration
 */
const DEFAULT_CONFIG: OrchestratorConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  agentTimeoutMs: 30000,
  validateUtterances: true,
  broadcastEvents: true,
  autoSaveTranscript: true,
  autoSaveIntervalMs: 60000,
  flowMode: 'auto',
};

/**
 * Map state machine speaker to database speaker
 */
function mapSpeakerToDb(speaker: Speaker): DbSpeaker {
  const speakerMap: Record<Speaker, DbSpeaker> = {
    [Speaker.PRO]: 'pro_advocate',
    [Speaker.CON]: 'con_advocate',
    [Speaker.MODERATOR]: 'moderator',
    [Speaker.SYSTEM]: 'moderator', // Map SYSTEM to moderator for database
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
 * Debate Orchestrator Class
 */
export class DebateOrchestrator {
  private debateId: string;
  private stateMachine: DebateStateMachine;
  private turnManager: TurnManager;
  private sseManager: SSEManager;
  private schemaValidator: SchemaValidator;
  private agents: {
    pro: ProAdvocateAgent;
    con: ConAdvocateAgent;
    moderator: ModeratorAgent;
    orchestrator: OrchestratorAgent;
  };
  private config: OrchestratorConfig;
  private startTime: Date | null = null;
  private isPausedFlag: boolean = false;
  private isStoppedFlag: boolean = false;

  constructor(
    debateId: string,
    stateMachine: DebateStateMachine,
    turnManager: TurnManager,
    sseManager: SSEManager,
    schemaValidator: SchemaValidator,
    agents: {
      pro: ProAdvocateAgent;
      con: ConAdvocateAgent;
      moderator: ModeratorAgent;
      orchestrator: OrchestratorAgent;
    },
    config?: Partial<OrchestratorConfig>
  ) {
    this.debateId = debateId;
    this.stateMachine = stateMachine;
    this.turnManager = turnManager;
    this.sseManager = sseManager;
    this.schemaValidator = schemaValidator;
    this.agents = agents;
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.info({ debateId }, 'Debate orchestrator created');
  }

  /**
   * Start a debate
   * Main entry point for debate execution
   */
  async startDebate(
    rawProposition: string,
    propositionContext?: PropositionContext
  ): Promise<DebateTranscript> {
    logger.info({ debateId: this.debateId, rawProposition }, 'Starting debate');

    try {
      this.startTime = new Date();

      // Step 1: Normalize proposition using orchestrator agent
      const normalized = await this.normalizeProposition(rawProposition, propositionContext);
      logger.info({ normalized }, 'Proposition normalized');

      // Step 2: Initialize state machine (transition to PHASE_1_OPENING)
      await this.stateMachine.initialize();

      // Step 3: Mark debate as started in database
      await debateRepo.markStarted(this.debateId);

      // Step 4: Execute all debate phases
      await this.executeAllPhases(normalized.normalized_question);

      // Step 5: Complete debate
      const transcript = await this.completeDebate();

      logger.info({ debateId: this.debateId }, 'Debate completed successfully');
      return transcript;
    } catch (error) {
      logger.error({ debateId: this.debateId, error }, 'Debate execution failed');
      await this.stateMachine.error(
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Normalize a raw proposition using orchestrator agent
   */
  async normalizeProposition(
    rawInput: string,
    context?: PropositionContext
  ): Promise<NormalizedProposition> {
    logger.debug({ rawInput, context }, 'Normalizing proposition');

    try {
      const normalized = await this.agents.orchestrator.normalizeProposition(
        rawInput,
        context
      );

      // Validate the proposition is debatable
      const validation = await this.agents.orchestrator.validateProposition(
        normalized.normalized_question
      );

      if (!validation.valid) {
        throw new Error(`Invalid proposition: ${validation.reason || 'Unknown reason'}`);
      }

      return normalized;
    } catch (error) {
      logger.error({ error }, 'Proposition normalization failed');
      throw new Error(
        `Failed to normalize proposition: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute all 6 debate phases sequentially
   */
  async executeAllPhases(proposition: string): Promise<void> {
    const phases = [
      DebatePhase.PHASE_1_OPENING,
      DebatePhase.PHASE_2_CONSTRUCTIVE,
      DebatePhase.PHASE_3_CROSSEXAM,
      DebatePhase.PHASE_4_REBUTTAL,
      DebatePhase.PHASE_5_CLOSING,
      DebatePhase.PHASE_6_SYNTHESIS,
    ];

    for (const phase of phases) {
      // Check if stopped before each phase
      if (this.isStoppedFlag) {
        logger.info({ debateId: this.debateId, phase }, 'Debate stopped, exiting');
        return;
      }

      // Check if paused before each phase
      if (this.isPausedFlag) {
        logger.info({ debateId: this.debateId, phase }, 'Debate paused, waiting...');
        await this.waitForResume();
        // Check again after resume in case we were stopped while paused
        if (this.isStoppedFlag) {
          logger.info({ debateId: this.debateId, phase }, 'Debate stopped after pause, exiting');
          return;
        }
      }

      logger.info({ debateId: this.debateId, phase }, 'Executing phase');
      await this.executePhase(phase, proposition);

      // Check if stopped after phase execution
      if (this.isStoppedFlag) {
        logger.info({ debateId: this.debateId, phase }, 'Debate stopped after phase, exiting');
        return;
      }

      // Transition to next phase (except after last phase)
      if (phase !== DebatePhase.PHASE_6_SYNTHESIS) {
        const nextPhase = getNextPhase(phase);
        if (nextPhase) {
          await this.stateMachine.transition(nextPhase);
        }
      }
    }
  }

  /**
   * Execute a single debate phase
   */
  async executePhase(phase: DebatePhase, proposition: string): Promise<void> {
    logger.info({ debateId: this.debateId, phase }, 'Starting phase execution');

    // Get turn plan for this phase
    const plan = this.turnManager.getPhaseExecutionPlan(phase);

    // Broadcast phase start event
    if (this.config.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'phase_start', {
        phase,
        phaseName: plan.metadata.name,
        turnCount: plan.turns.length,
        expectedDurationMs: plan.metadata.expectedDurationMs,
      });
    }

    // Execute each turn in sequence
    let turnsExecuted = 0;
    for (const turn of plan.turns) {
      // Check if stopped
      if (this.isStoppedFlag) {
        logger.info({ debateId: this.debateId, turn }, 'Debate stopped during phase');
        return;
      }

      // Check if paused
      if (this.isPausedFlag) {
        logger.info({ debateId: this.debateId, turn }, 'Debate paused during turn');
        await this.waitForResume();
        // Check again after resume
        if (this.isStoppedFlag) {
          logger.info({ debateId: this.debateId, turn }, 'Debate stopped after pause');
          return;
        }
      }

      await this.executeTurn(turn, proposition);
      turnsExecuted++;
    }

    // Only broadcast phase complete if we weren't stopped
    if (!this.isStoppedFlag && this.config.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'phase_complete', {
        phase,
        phaseName: plan.metadata.name,
        turnsExecuted,
      });
    }

    logger.info({ debateId: this.debateId, phase }, 'Phase execution complete');
  }

  /**
   * Execute a single turn
   */
  async executeTurn(turn: Turn, proposition: string): Promise<void> {
    logger.debug({ debateId: this.debateId, turn }, 'Executing turn');

    const startTime = Date.now();

    try {
      // Build agent context
      const context = await this.buildAgentContext(turn.speaker, proposition);

      // Call appropriate agent
      const content = await this.callAgent(
        turn.speaker,
        turn.promptType,
        proposition,
        context
      );

      // Get model attribution from the agent
      const agentKey = turn.speaker === Speaker.PRO ? 'pro' :
                       turn.speaker === Speaker.CON ? 'con' : 'moderator';
      const agent = this.agents[agentKey];
      const agentMetadata = agent.getMetadata();
      const modelName = agentMetadata.model || 'unknown';

      // Create utterance
      const utterance: OrchestratorUtterance = {
        debateId: this.debateId,
        timestampMs: this.getElapsedMs(),
        phase: this.stateMachine.getCurrentPhase(),
        speaker: turn.speaker,
        content,
        metadata: {
          promptType: turn.promptType,
          turnNumber: turn.turnNumber,
          generationTimeMs: Date.now() - startTime,
          model: modelName,
        },
      };

      // Record utterance (validate, persist, broadcast)
      await this.recordUtterance(utterance);

      logger.debug({ debateId: this.debateId, turn }, 'Turn execution complete');
    } catch (error) {
      logger.error({ debateId: this.debateId, turn, error }, 'Turn execution failed');
      throw error;
    }
  }

  /**
   * Call the appropriate agent based on speaker and prompt type
   */
  async callAgent(
    speaker: Speaker,
    promptType: string,
    _proposition: string,
    context: AgentContext
  ): Promise<string> {
    logger.debug({ speaker, promptType }, 'Calling agent');

    let response: string = '';

    try {
      // Retry logic
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          response = await this.callAgentInternal(speaker, promptType, context);
          break; // Success, exit retry loop
        } catch (error) {
          if (attempt === this.config.maxRetries) {
            throw error; // Final attempt failed
          }
          logger.warn(
            { speaker, promptType, attempt, maxRetries: this.config.maxRetries },
            'Agent call failed, retrying...'
          );
          await this.sleep(this.config.retryDelayMs);
        }
      }

      return response;
    } catch (error) {
      logger.error({ speaker, promptType, error }, 'Agent call failed after all retries');
      throw new Error(
        `Agent call failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Internal agent call routing
   */
  private async callAgentInternal(
    speaker: Speaker,
    promptType: string,
    context: AgentContext
  ): Promise<string> {
    switch (speaker) {
      case Speaker.PRO:
        return this.callProAdvocate(promptType, context);

      case Speaker.CON:
        return this.callConAdvocate(promptType, context);

      case Speaker.MODERATOR:
        return this.callModerator(promptType, context);

      case Speaker.SYSTEM:
        return '[SYSTEM MESSAGE]';

      default:
        throw new Error(`Unknown speaker: ${speaker}`);
    }
  }

  /**
   * Call Pro Advocate agent
   */
  private async callProAdvocate(promptType: string, context: AgentContext): Promise<string> {
    switch (promptType) {
      case 'opening_statement':
        return this.agents.pro.generateOpeningStatement(context);
      case 'constructive_argument':
        return this.agents.pro.generateConstructiveArgument(context);
      case 'cross_exam_question':
        return this.agents.pro.generateCrossExamQuestion(context);
      case 'cross_exam_response':
        // Get last question from context
        const lastQuestion = context.previousUtterances[context.previousUtterances.length - 1];
        return this.agents.pro.respondToCrossExam(lastQuestion?.content || '', context);
      case 'rebuttal':
        return this.agents.pro.generateRebuttal(context);
      case 'closing_statement':
        return this.agents.pro.generateClosingStatement(context);
      default:
        return this.agents.pro.generateResponse(`Execute: ${promptType}`, context);
    }
  }

  /**
   * Call Con Advocate agent
   */
  private async callConAdvocate(promptType: string, context: AgentContext): Promise<string> {
    switch (promptType) {
      case 'opening_statement':
        return this.agents.con.generateOpeningStatement(context);
      case 'constructive_argument':
        return this.agents.con.generateConstructiveArgument(context);
      case 'cross_exam_question':
        return this.agents.con.generateCrossExamQuestion(context);
      case 'cross_exam_response':
        // Get last question from context
        const lastQuestion = context.previousUtterances[context.previousUtterances.length - 1];
        return this.agents.con.respondToCrossExam(lastQuestion?.content || '', context);
      case 'rebuttal':
        return this.agents.con.generateRebuttal(context);
      case 'closing_statement':
        return this.agents.con.generateClosingStatement(context);
      default:
        return this.agents.con.generateResponse(`Execute: ${promptType}`, context);
    }
  }

  /**
   * Call Moderator agent
   */
  private async callModerator(promptType: string, context: AgentContext): Promise<string> {
    switch (promptType) {
      case 'introduction':
        return this.agents.moderator.generateIntroduction(context.proposition, context);
      case 'synthesis':
        return this.agents.moderator.generateSynthesis(context);
      default:
        return this.agents.moderator.generateResponse(`Execute: ${promptType}`, context);
    }
  }

  /**
   * Build agent context from current debate state
   */
  async buildAgentContext(speaker: Speaker, proposition: string): Promise<AgentContext> {
    // Fetch all previous utterances
    const utterances = await utteranceRepo.findByDebateId(this.debateId);

    // Fetch debate for context and configuration
    const debate = await debateRepo.findById(this.debateId);

    // Build configuration from debate record
    const configuration: DebateConfiguration = debate ? {
      presetMode: debate.presetMode,
      brevityLevel: debate.brevityLevel as BrevityLevel,
      llmSettings: {
        temperature: debate.llmTemperature,
        maxTokensPerResponse: debate.maxTokensPerResponse,
      },
      requireCitations: debate.requireCitations,
    } : DEFAULT_CONFIGURATION;

    // Load persona for this speaker (if applicable)
    let persona: Persona | null = null;
    if (debate) {
      if (speaker === Speaker.PRO && debate.proPersonaId) {
        persona = await personaRepo.findById(debate.proPersonaId);
      } else if (speaker === Speaker.CON && debate.conPersonaId) {
        persona = await personaRepo.findById(debate.conPersonaId);
      }
    }

    // Fetch RAG citations if this is a Duelogic debate (has proposalId in context)
    let ragCitations: RAGCitationContext | undefined;
    const propositionContext = debate?.propositionContext as Record<string, unknown> | undefined;
    const proposalId = propositionContext?.proposalId as string | undefined;

    if (proposalId && (speaker === Speaker.PRO || speaker === Speaker.CON)) {
      ragCitations = await this.fetchRAGCitations(proposalId, proposition, utterances);
    }

    return {
      debateId: this.debateId,
      currentPhase: this.stateMachine.getCurrentPhase(),
      previousUtterances: utterances,
      speaker,
      proposition,
      propositionContext: debate?.propositionContext,
      configuration,
      persona,
      ragCitations,
    };
  }

  /**
   * Fetch RAG citations from Pinecone for Duelogic debates
   */
  private async fetchRAGCitations(
    proposalId: string,
    proposition: string,
    previousUtterances: Utterance[]
  ): Promise<RAGCitationContext> {
    try {
      const vectorDB = createVectorDBClient();
      if (!vectorDB) {
        return { available: false };
      }

      const embeddingService = createEmbeddingService();
      const ragService = new RAGRetrievalService(vectorDB, embeddingService);

      // Build query from proposition and recent utterances
      const recentContent = previousUtterances
        .slice(-3)
        .map(u => u.content)
        .join(' ');
      const query = `${proposition} ${recentContent}`.trim();

      // Get formatted citation context
      const citationPrompt = await ragService.buildCitationContext(proposalId, query);
      const citations = await ragService.retrieveCitations(proposalId, query);

      if (citations.length === 0) {
        logger.debug({ proposalId }, 'No RAG citations found');
        return { available: false };
      }

      logger.info({ proposalId, citationCount: citations.length }, 'RAG citations retrieved');

      return {
        available: true,
        citationPrompt,
        citations: citations.map(c => ({
          content: c.content,
          sourceTitle: c.sourceTitle,
          sourceDomain: c.sourceDomain,
          sourceUrl: c.sourceUrl,
          publishedAt: c.publishedAt,
          relevanceScore: c.relevanceScore,
        })),
      };
    } catch (error) {
      logger.error({ error, proposalId }, 'Failed to fetch RAG citations');
      return { available: false };
    }
  }

  /**
   * Record an utterance (validate, persist, broadcast)
   */
  async recordUtterance(utterance: OrchestratorUtterance): Promise<void> {
    logger.debug({ utterance }, 'Recording utterance');

    try {
      // Validate utterance if configured
      if (this.config.validateUtterances) {
        const validation = this.schemaValidator.validateUtterance({
          timestamp_ms: utterance.timestampMs,
          phase: mapPhaseToDb(utterance.phase),
          speaker: mapSpeakerToDb(utterance.speaker),
          content: utterance.content,
          metadata: utterance.metadata,
        });

        if (!validation.valid) {
          logger.warn({ validation }, 'Utterance validation failed');
          utterance.metadata.warnings = validation.errors?.map((e) => e.message);
        }
      }

      // Persist to database
      const createInput: CreateUtteranceInput = {
        debateId: utterance.debateId,
        timestampMs: utterance.timestampMs,
        phase: mapPhaseToDb(utterance.phase),
        speaker: mapSpeakerToDb(utterance.speaker),
        content: utterance.content,
        metadata: utterance.metadata,
      };

      const persisted = await utteranceRepo.create(createInput);
      logger.info({ id: persisted.id }, 'Utterance persisted');

      // Broadcast via SSE - use original enum values for frontend compatibility
      if (this.config.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.debateId, 'utterance', {
          id: persisted.id,
          timestamp_ms: persisted.timestampMs,
          phase: utterance.phase, // Use original enum (PHASE_1_OPENING) not DB format (phase_1_opening)
          speaker: utterance.speaker, // Use original enum (PRO/CON) not DB format (pro_advocate)
          content: persisted.content,
          metadata: persisted.metadata,
        });
      }

      // Step mode: Wait for user to continue before next turn
      if (this.config.flowMode === 'step') {
        await this.waitForContinue(utterance.phase, utterance.speaker);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to record utterance');
      throw error;
    }
  }

  /**
   * Wait for user to click Continue (step mode only)
   * Sets awaiting flag in DB, broadcasts event, and polls until flag is cleared
   */
  private async waitForContinue(currentPhase: DebatePhase, currentSpeaker: Speaker): Promise<void> {
    logger.info({ debateId: this.debateId }, 'Step mode: Waiting for continue signal');

    // Set awaiting flag in database
    await debateRepo.setAwaitingContinue(this.debateId, true);

    // Broadcast awaiting_continue event - use original enum values for frontend
    if (this.config.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'awaiting_continue', {
        debateId: this.debateId,
        currentPhase: currentPhase, // Use original enum for frontend
        currentSpeaker: currentSpeaker, // Use original enum for frontend
        timestamp: new Date().toISOString(),
      });
    }

    // Poll until continue signal received (flag cleared by /continue endpoint)
    while (true) {
      // Check if stopped locally
      if (this.isStoppedFlag) {
        logger.info({ debateId: this.debateId }, 'Step mode: Debate stopped, exiting wait');
        break;
      }

      // Check if debate is still awaiting continue
      const debate = await debateRepo.findById(this.debateId);

      if (!debate || debate.status === 'completed' || debate.status === 'failed' || debate.status === 'error') {
        // Debate ended, stop waiting
        break;
      }

      if (!debate.isAwaitingContinue) {
        // Continue signal received
        logger.info({ debateId: this.debateId }, 'Step mode: Continue signal received');
        break;
      }

      // Wait before polling again
      await this.sleep(500);
    }
  }

  /**
   * Pause the debate
   */
  async pause(): Promise<void> {
    logger.info({ debateId: this.debateId }, 'Pausing debate');
    this.isPausedFlag = true;
    await this.stateMachine.pause();

    if (this.config.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'debate_paused', {
        debateId: this.debateId,
        pausedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Resume the debate
   */
  async resume(): Promise<void> {
    logger.info({ debateId: this.debateId }, 'Resuming debate');
    await this.stateMachine.resume();
    this.isPausedFlag = false;

    if (this.config.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'debate_resumed', {
        debateId: this.debateId,
        resumedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Stop the debate immediately
   * This will cause the debate to exit cleanly at the next check point
   */
  async stop(reason?: string): Promise<void> {
    logger.info({ debateId: this.debateId, reason }, 'Stopping debate');
    this.isStoppedFlag = true;

    // Update database status
    await debateRepo.updateStatus(this.debateId, { status: 'completed' });

    // Broadcast stop event
    if (this.config.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.debateId, 'debate_stopped', {
        debateId: this.debateId,
        stoppedAt: new Date().toISOString(),
        reason: reason || 'User stopped debate',
        totalDurationMs: this.getElapsedMs(),
      });
    }
  }

  /**
   * Check if the debate has been stopped
   */
  isStopped(): boolean {
    return this.isStoppedFlag;
  }

  /**
   * Wait for resume (used when paused during execution)
   * Also exits early if debate is stopped
   */
  private async waitForResume(): Promise<void> {
    while (this.isPausedFlag && !this.isStoppedFlag) {
      await this.sleep(1000);
    }
  }

  /**
   * Handle user intervention
   */
  async handleIntervention(intervention: OrchestratorIntervention): Promise<void> {
    logger.info({ intervention }, 'Handling user intervention');

    try {
      // Pause debate if needed
      const shouldPause = intervention.interventionType === 'pause_request';
      if (shouldPause && !this.isPausedFlag) {
        await this.pause();
      }

      // Get agent context
      const context = await this.buildAgentContext(
        intervention.directedTo || Speaker.MODERATOR,
        '' // Proposition will be in context
      );

      // Generate response using moderator
      const response = await this.agents.moderator.handleIntervention(
        intervention.content,
        context
      );

      // Persist intervention with response
      const created = await interventionRepo.create({
        debateId: intervention.debateId,
        timestampMs: intervention.timestampMs,
        interventionType: intervention.interventionType,
        content: intervention.content,
        directedTo: intervention.directedTo
          ? mapSpeakerToDb(intervention.directedTo)
          : null,
      });

      // Add response
      await interventionRepo.addResponse(
        created.id,
        response,
        this.getElapsedMs()
      );

      // Broadcast intervention and response
      if (this.config.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.debateId, 'intervention_response', {
          interventionId: created.id,
          response,
          timestamp_ms: this.getElapsedMs(),
        });
      }

      logger.info({ interventionId: created.id }, 'Intervention handled');
    } catch (error) {
      logger.error({ error }, 'Failed to handle intervention');
      throw error;
    }
  }

  /**
   * Complete the debate and generate final transcript
   */
  async completeDebate(): Promise<DebateTranscript> {
    logger.info({ debateId: this.debateId }, 'Completing debate');

    try {
      // Transition to completed state
      await this.stateMachine.complete();

      // Build final transcript
      const transcript = await this.buildFinalTranscript();

      // Save transcript to database
      await debateRepo.saveTranscript(this.debateId, transcript as unknown as Record<string, unknown>);

      // Complete debate in database
      await debateRepo.complete(this.debateId);

      // Broadcast completion
      if (this.config.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.debateId, 'debate_complete', {
          debateId: this.debateId,
          completedAt: new Date().toISOString(),
          totalDurationMs: this.getElapsedMs(),
        });
      }

      return transcript;
    } catch (error) {
      logger.error({ error }, 'Failed to complete debate');
      throw error;
    }
  }

  /**
   * Build final debate transcript
   */
  async buildFinalTranscript(): Promise<DebateTranscript> {
    logger.info({ debateId: this.debateId }, 'Building final transcript');

    // Fetch all data
    const debate = await debateRepo.findById(this.debateId);
    const utterances = await utteranceRepo.findByDebateId(this.debateId);
    const interventions = await interventionRepo.findByDebateId(this.debateId);

    if (!debate) {
      throw new Error('Debate not found');
    }

    // Build phase summary
    const phases = this.buildPhaseSummary(utterances);

    // Build transcript
    const transcript: DebateTranscript = {
      meta: {
        schema_version: '2.0.0',
        debate_id: this.debateId,
        proposition: debate.propositionText,
        proposition_context: debate.propositionContext,
        started_at: debate.startedAt?.toISOString() || new Date().toISOString(),
        completed_at: new Date().toISOString(),
        total_duration_ms: this.getElapsedMs(),
        utterance_count: utterances.length,
        intervention_count: interventions.length,
        agents: {
          pro_advocate: this.agents.pro.getMetadata(),
          con_advocate: this.agents.con.getMetadata(),
          moderator: this.agents.moderator.getMetadata(),
        },
      },
      utterances: utterances.map((u) => ({
        id: u.id,
        timestamp_ms: u.timestampMs,
        phase: u.phase,
        speaker: u.speaker,
        content: u.content,
        metadata: u.metadata,
      })),
      interventions: interventions.map((i) => ({
        id: i.id,
        timestamp_ms: i.timestampMs,
        intervention_type: i.interventionType,
        content: i.content,
        directed_to: i.directedTo,
        response: i.response,
        response_timestamp_ms: i.responseTimestampMs,
      })),
      phases,
    };

    return transcript;
  }

  /**
   * Build phase summary from utterances
   */
  private buildPhaseSummary(utterances: Utterance[]): DebateTranscript['phases'] {
    const phaseMap = new Map<string, {
      started_at_ms: number;
      ended_at_ms: number;
      utterances: Utterance[];
    }>();

    // Group utterances by phase
    for (const utterance of utterances) {
      const phase = utterance.phase;
      if (!phaseMap.has(phase)) {
        phaseMap.set(phase, {
          started_at_ms: utterance.timestampMs,
          ended_at_ms: utterance.timestampMs,
          utterances: [],
        });
      }

      const phaseData = phaseMap.get(phase)!;
      phaseData.started_at_ms = Math.min(phaseData.started_at_ms, utterance.timestampMs);
      phaseData.ended_at_ms = Math.max(phaseData.ended_at_ms, utterance.timestampMs);
      phaseData.utterances.push(utterance);
    }

    // Build phase summaries
    return Array.from(phaseMap.entries()).map(([phase, data]) => ({
      phase,
      started_at_ms: data.started_at_ms,
      ended_at_ms: data.ended_at_ms,
      duration_ms: data.ended_at_ms - data.started_at_ms,
      utterance_count: data.utterances.length,
      speakers: [...new Set(data.utterances.map((u) => u.speaker))],
    }));
  }

  /**
   * Get elapsed time since debate start in milliseconds
   */
  private getElapsedMs(): number {
    if (!this.startTime) {
      return 0;
    }
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
