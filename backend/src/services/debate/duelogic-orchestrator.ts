/**
 * Duelogic Orchestrator
 *
 * Main coordination engine for Duelogic debate mode. Manages the complete
 * debate lifecycle through 4 segments:
 * 1. Introduction - Arbiter podcast-style intro
 * 2. Openings - Each chair presents initial position
 * 3. Exchange - Main debate with evaluations and interruptions
 * 4. Synthesis - Arbiter closing summary
 *
 * Integrates:
 * - Arbiter Agent for intro/outro/interjections
 * - Chair Agents for all philosophical frameworks
 * - Response Evaluator for principle adherence
 * - Interruption Engine for chair-to-chair interrupts
 */

import pino from 'pino';
import type { SSEManager } from '../sse/sse-manager.js';
import {
  type DuelogicConfig,
  type DuelogicChair,
  type DuelogicSegment,
  type ResponseEvaluation,
  type ChairInterruptCandidate,
  mergeWithDuelogicDefaults,
} from '../../types/duelogic.js';
import {
  ArbiterAgent,
  createArbiterAgent,
} from '../agents/arbiter-agent.js';
import {
  ChairAgent,
  createChairAgents,
} from '../agents/chair-agent.js';
import {
  ResponseEvaluator,
  createResponseEvaluator,
} from './response-evaluator.js';
import {
  ChairInterruptionEngine,
  createChairInterruptionEngine,
} from './chair-interruption-engine.js';
import {
  saveAllChairAssignments,
  saveDuelogicConfig,
} from '../../db/repositories/duelogic-repository.js';
import type { DebatePhase } from '../../types/database.js';
import * as utteranceRepo from '../../db/repositories/utterance-repository.js';

const logger = pino({
  name: 'duelogic-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a DuelogicOrchestrator
 */
export interface DuelogicOrchestratorOptions {
  debateId: string;
  proposition: string;
  propositionContext?: string;
  config: Partial<DuelogicConfig>;
  sseManager: SSEManager;
}

/**
 * Internal utterance representation
 */
interface DebateUtterance {
  speaker: string;
  segment: DuelogicSegment;
  content: string;
  timestampMs: number;
  evaluation?: ResponseEvaluation;
  isInterruption?: boolean;
  interruptionReason?: string;
}

/**
 * Debate statistics
 */
interface DebateStats {
  durationMs: number;
  utteranceCount: number;
  interruptionCount: number;
  chairStats: Record<string, {
    averageAdherence: number;
    steelManningRate: number;
    selfCritiqueRate: number;
    utteranceCount: number;
    interruptionsMade: number;
  }>;
}

/**
 * Orchestrator status
 */
export interface DuelogicOrchestratorStatus {
  isRunning: boolean;
  isPaused: boolean;
  currentSegment: DuelogicSegment;
  utteranceCount: number;
  exchangeNumber: number;
  elapsedMs: number;
}

// ============================================================================
// DuelogicOrchestrator Class
// ============================================================================

/**
 * Duelogic Orchestrator
 *
 * Coordinates the entire debate flow for Duelogic mode debates.
 */
export class DuelogicOrchestrator {
  // Configuration
  private debateId: string;
  private proposition: string;
  private propositionContext?: string;
  private config: DuelogicConfig;
  private sseManager: SSEManager;

  // Components
  private arbiter: ArbiterAgent;
  private chairAgents: Map<string, ChairAgent>;
  private evaluator: ResponseEvaluator;
  private interruptionEngine: ChairInterruptionEngine;

  // State
  private transcript: DebateUtterance[] = [];
  private evaluations: Map<string, ResponseEvaluation[]> = new Map();
  private interruptionCounts: Map<string, number> = new Map();
  private currentSegment: DuelogicSegment = 'introduction';
  private exchangeNumber: number = 0;

  // Control flags
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private startTime: number = 0;

  constructor(options: DuelogicOrchestratorOptions) {
    this.debateId = options.debateId;
    this.proposition = options.proposition;
    this.propositionContext = options.propositionContext;
    this.config = mergeWithDuelogicDefaults(options.config);
    this.sseManager = options.sseManager;

    // Initialize arbiter
    this.arbiter = createArbiterAgent({
      config: this.config,
      debateId: this.debateId,
      sseManager: this.sseManager,
    });

    // Initialize chair agents
    this.chairAgents = createChairAgents(
      this.config,
      this.debateId,
      this.sseManager
    );

    // Initialize evaluator
    this.evaluator = createResponseEvaluator(this.config, this.debateId);

    // Initialize interruption engine
    this.interruptionEngine = createChairInterruptionEngine(
      this.config,
      this.debateId
    );

    // Initialize tracking maps
    for (const chair of this.config.chairs) {
      this.evaluations.set(chair.position, []);
      this.interruptionCounts.set(chair.position, 0);
    }

    logger.info(
      {
        debateId: this.debateId,
        chairCount: this.config.chairs.length,
        maxExchanges: this.config.flow.maxExchanges,
      },
      'DuelogicOrchestrator created'
    );
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Start the debate
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Debate is already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();

    logger.info({ debateId: this.debateId }, 'Starting Duelogic debate');

    try {
      // Save initial configuration
      await this.saveInitialState();

      // Broadcast debate start
      this.broadcastEvent('duelogic_debate_started', {
        debateId: this.debateId,
        proposition: this.proposition,
        chairs: this.config.chairs.map((c) => ({
          position: c.position,
          framework: c.framework,
          displayName: c.modelDisplayName || c.modelId,
        })),
        config: {
          maxExchanges: this.config.flow.maxExchanges,
          tone: this.config.tone,
          podcastMode: this.config.podcastMode.enabled,
          interruptionsEnabled: this.config.interruptions.enabled,
        },
      });

      // Execute 4 segments
      await this.executeIntroduction();
      await this.executeOpenings();
      await this.executeExchange();
      await this.executeSynthesis();

      // Broadcast completion
      await this.broadcastComplete();

    } catch (error) {
      this.handleError(error as Error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Pause the debate
   */
  pause(): void {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      logger.info({ debateId: this.debateId }, 'Debate paused');

      this.broadcastEvent('debate_paused', {
        debateId: this.debateId,
        pausedAt: new Date().toISOString(),
        segment: this.currentSegment,
        exchangeNumber: this.exchangeNumber,
      });
    }
  }

  /**
   * Resume the debate
   */
  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      logger.info({ debateId: this.debateId }, 'Debate resumed');

      this.broadcastEvent('debate_resumed', {
        debateId: this.debateId,
        resumedAt: new Date().toISOString(),
        segment: this.currentSegment,
        exchangeNumber: this.exchangeNumber,
      });
    }
  }

  /**
   * Stop the debate
   */
  stop(reason?: string): void {
    if (this.isRunning) {
      this.isRunning = false;
      logger.info({ debateId: this.debateId, reason }, 'Debate stopped');

      this.broadcastEvent('debate_stopped', {
        debateId: this.debateId,
        stoppedAt: new Date().toISOString(),
        reason: reason || 'User stopped debate',
        segment: this.currentSegment,
        utteranceCount: this.transcript.length,
        durationMs: this.getElapsedMs(),
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): DuelogicOrchestratorStatus {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentSegment: this.currentSegment,
      utteranceCount: this.transcript.length,
      exchangeNumber: this.exchangeNumber,
      elapsedMs: this.getElapsedMs(),
    };
  }

  /**
   * Get transcript
   */
  getTranscript(): DebateUtterance[] {
    return [...this.transcript];
  }

  // ==========================================================================
  // Segment Execution
  // ==========================================================================

  /**
   * Execute Introduction segment
   */
  private async executeIntroduction(): Promise<void> {
    this.currentSegment = 'introduction';
    this.broadcastSegmentStart('introduction');

    logger.info({ debateId: this.debateId }, 'Executing introduction segment');

    // Generate podcast intro if enabled
    if (this.config.podcastMode.enabled) {
      const intro = await this.arbiter.generateIntroduction(
        this.proposition,
        this.propositionContext
      );

      await this.saveUtterance({
        speaker: 'arbiter',
        segment: 'introduction',
        content: intro,
        timestampMs: Date.now(),
      });
    }

    this.broadcastSegmentComplete('introduction');
  }

  /**
   * Execute Openings segment
   */
  private async executeOpenings(): Promise<void> {
    this.currentSegment = 'opening';
    this.broadcastSegmentStart('opening');

    logger.info({ debateId: this.debateId }, 'Executing opening statements');

    for (const chair of this.config.chairs) {
      if (!this.isRunning) break;
      await this.waitIfPaused();

      const agent = this.chairAgents.get(chair.position)!;

      // Broadcast speaker starting
      this.broadcastEvent('speaker_started', {
        speaker: chair.position,
        framework: chair.framework,
        segment: 'opening',
      });

      const content = await agent.generateOpening(
        this.proposition,
        this.propositionContext
      );

      // Opening statements are not evaluated (no prior context to steel-man)
      await this.saveUtterance({
        speaker: chair.position,
        segment: 'opening',
        content,
        timestampMs: Date.now(),
      });
    }

    this.broadcastSegmentComplete('opening');
  }

  /**
   * Execute Exchange segment
   */
  private async executeExchange(): Promise<void> {
    this.currentSegment = 'exchange';
    this.broadcastSegmentStart('exchange');

    logger.info({ debateId: this.debateId }, 'Executing exchange segment');

    let previousSpeaker: DuelogicChair | null = null;
    let previousContent: string = this.getLastUtteranceContent();

    while (this.exchangeNumber < this.config.flow.maxExchanges && this.isRunning) {
      this.exchangeNumber++;

      for (const chair of this.config.chairs) {
        if (!this.isRunning) break;
        await this.waitIfPaused();

        const agent = this.chairAgents.get(chair.position)!;

        // Broadcast speaker starting
        this.broadcastEvent('speaker_started', {
          speaker: chair.position,
          framework: chair.framework,
          segment: 'exchange',
          exchangeNumber: this.exchangeNumber,
        });

        // Generate response
        const fallbackChair = this.config.chairs[0];
        if (!fallbackChair && !previousSpeaker) {
          throw new Error('No previous speaker and no chairs configured');
        }
        const content = await agent.generateExchangeResponse(
          previousSpeaker || fallbackChair!,
          previousContent,
          this.getTranscriptText()
        );

        // Check for interruption opportunity
        if (this.config.interruptions.enabled && this.config.interruptions.allowChairInterruptions) {
          await this.checkAndExecuteInterruption(chair, content);
        }

        // Evaluate response
        let evaluation: ResponseEvaluation | undefined;
        if (previousSpeaker && this.shouldEvaluate()) {
          const result = await this.evaluator.evaluate({
            chair: { ...chair, position: chair.position, framework: chair.framework, modelId: chair.modelId },
            responseContent: content,
            debateHistory: this.getTranscriptText(),
            previousSpeaker: previousSpeaker,
            previousContent,
          });

          evaluation = result.evaluation;

          // Track evaluation
          this.evaluations.get(chair.position)!.push(evaluation);

          // Check for arbiter interjection
          if (this.config.mandates.arbiterCanInterject && evaluation) {
            if (this.evaluator.shouldInterject(evaluation, true)) {
              await this.executeArbiterInterjection(evaluation, chair);
            }
          }
        }

        // Save utterance
        await this.saveUtterance({
          speaker: chair.position,
          segment: 'exchange',
          content,
          timestampMs: Date.now(),
          evaluation,
        });

        previousSpeaker = chair;
        previousContent = content;
      }

      // Broadcast exchange progress
      this.broadcastEvent('exchange_complete', {
        exchangeNumber: this.exchangeNumber,
        maxExchanges: this.config.flow.maxExchanges,
      });
    }

    this.broadcastSegmentComplete('exchange');
  }

  /**
   * Execute Synthesis segment
   */
  private async executeSynthesis(): Promise<void> {
    this.currentSegment = 'synthesis';
    this.broadcastSegmentStart('synthesis');

    logger.info({ debateId: this.debateId }, 'Executing synthesis segment');

    // Generate closing
    const closing = await this.arbiter.generateClosing(
      this.proposition,
      this.getTranscriptText(),
      this.evaluations
    );

    await this.saveUtterance({
      speaker: 'arbiter',
      segment: 'synthesis',
      content: closing,
      timestampMs: Date.now(),
    });

    this.broadcastSegmentComplete('synthesis');
  }

  // ==========================================================================
  // Interruption Handling
  // ==========================================================================

  /**
   * Check for and execute chair interruption
   */
  private async checkAndExecuteInterruption(
    currentChair: DuelogicChair,
    currentContent: string
  ): Promise<void> {
    const otherChairs = this.config.chairs.filter(
      (c) => c.position !== currentChair.position
    );

    const candidate = await this.interruptionEngine.evaluateInterrupt({
      currentSpeaker: currentChair,
      otherChairs,
      recentContent: currentContent.slice(0, 500),
      debateSoFar: this.getTranscriptText(),
      topic: this.proposition,
    });

    if (candidate) {
      await this.executeChairInterrupt(candidate, currentChair);
    }
  }

  /**
   * Execute a chair interruption
   */
  private async executeChairInterrupt(
    candidate: ChairInterruptCandidate,
    interruptedChair: DuelogicChair
  ): Promise<void> {
    logger.info(
      {
        interrupter: candidate.interruptingChair.position,
        interrupted: interruptedChair.position,
        reason: candidate.triggerReason,
      },
      'Executing chair interrupt'
    );

    // Broadcast interrupt start
    this.broadcastEvent('chair_interrupt', {
      interrupter: candidate.interruptingChair.position,
      interrupted: interruptedChair.position,
      reason: candidate.triggerReason,
      opener: candidate.suggestedOpener,
      urgency: candidate.urgency,
    });

    // Get interrupting chair agent
    const interrupterAgent = this.chairAgents.get(candidate.interruptingChair.position)!;

    // Generate interruption content
    const interruptContent = await interrupterAgent.respondToChallenge(
      interruptedChair,
      candidate.triggerContent
    );

    // Save interruption utterance
    await this.saveUtterance({
      speaker: candidate.interruptingChair.position,
      segment: 'exchange',
      content: `[INTERRUPTION: ${candidate.suggestedOpener}] ${interruptContent}`,
      timestampMs: Date.now(),
      isInterruption: true,
      interruptionReason: candidate.triggerReason,
    });

    // Track interruption count
    const count = this.interruptionCounts.get(candidate.interruptingChair.position) || 0;
    this.interruptionCounts.set(candidate.interruptingChair.position, count + 1);

    // Let interrupted chair respond
    const interruptedAgent = this.chairAgents.get(interruptedChair.position)!;
    const response = await interruptedAgent.respondToInterruption(
      candidate.interruptingChair,
      interruptContent
    );

    await this.saveUtterance({
      speaker: interruptedChair.position,
      segment: 'exchange',
      content: `[RESPONDING TO INTERRUPTION] ${response}`,
      timestampMs: Date.now(),
    });
  }

  /**
   * Execute arbiter interjection for principle violation
   */
  private async executeArbiterInterjection(
    evaluation: ResponseEvaluation,
    violatingChair: DuelogicChair
  ): Promise<void> {
    const violationType = this.evaluator.determineViolationType(evaluation);

    if (!violationType) return;

    logger.info(
      {
        chair: violatingChair.position,
        violation: violationType,
        score: evaluation.adherenceScore,
      },
      'Executing arbiter interjection'
    );

    this.broadcastEvent('arbiter_interjection', {
      chair: violatingChair.position,
      violation: violationType,
      adherenceScore: evaluation.adherenceScore,
    });

    const interjection = await this.arbiter.generateInterjection(
      violationType,
      violatingChair,
      this.getLastUtteranceContent()
    );

    await this.saveUtterance({
      speaker: 'arbiter',
      segment: 'exchange',
      content: `[ARBITER INTERJECTION] ${interjection}`,
      timestampMs: Date.now(),
    });
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save initial state to database
   */
  private async saveInitialState(): Promise<void> {
    try {
      await saveAllChairAssignments(this.debateId, this.config.chairs);
      await saveDuelogicConfig(this.debateId, this.config);
    } catch (error) {
      logger.error({ error, debateId: this.debateId }, 'Failed to save initial state');
    }
  }

  /**
   * Save utterance to database and broadcast
   */
  private async saveUtterance(utterance: DebateUtterance): Promise<void> {
    // Add to transcript
    this.transcript.push(utterance);

    // Save to database
    try {
      const input = {
        debateId: this.debateId,
        speaker: utterance.speaker as any,
        phase: this.mapSegmentToPhase(utterance.segment),
        content: utterance.content,
        timestampMs: utterance.timestampMs,
      };

      const persisted = await utteranceRepo.create(input);

      // If we have evaluation, persist it
      if (utterance.evaluation && persisted.id) {
        await this.evaluator.evaluateAndPersist(
          {
            chair: this.findChairByPosition(utterance.speaker)!,
            responseContent: utterance.content,
            debateHistory: this.getTranscriptText(),
          },
          persisted.id
        );
      }
    } catch (error) {
      logger.error({ error, speaker: utterance.speaker }, 'Failed to save utterance');
    }

    // Broadcast
    this.broadcastEvent('utterance', {
      speaker: utterance.speaker,
      segment: utterance.segment,
      content: utterance.content,
      timestampMs: utterance.timestampMs,
      evaluation: utterance.evaluation ? {
        adherenceScore: utterance.evaluation.adherenceScore,
        steelManning: utterance.evaluation.steelManning,
        selfCritique: utterance.evaluation.selfCritique,
      } : undefined,
      isInterruption: utterance.isInterruption,
    });
  }

  // ==========================================================================
  // Broadcasting
  // ==========================================================================

  /**
   * Broadcast event to SSE clients
   */
  private broadcastEvent(type: string, data: any): void {
    this.sseManager.broadcastToDebate(this.debateId, type as any, data);
  }

  /**
   * Broadcast segment start
   */
  private broadcastSegmentStart(segment: DuelogicSegment): void {
    this.broadcastEvent('segment_start', {
      segment,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast segment complete
   */
  private broadcastSegmentComplete(segment: DuelogicSegment): void {
    this.broadcastEvent('segment_complete', {
      segment,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast debate completion
   */
  private async broadcastComplete(): Promise<void> {
    const stats = this.calculateStats();

    logger.info(
      {
        debateId: this.debateId,
        durationMs: stats.durationMs,
        utteranceCount: stats.utteranceCount,
      },
      'Duelogic debate complete'
    );

    this.broadcastEvent('debate_complete', {
      debateId: this.debateId,
      completedAt: new Date().toISOString(),
      stats,
    });
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Wait while paused
   */
  private async waitIfPaused(): Promise<void> {
    while (this.isPaused && this.isRunning) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Get elapsed time in milliseconds
   */
  private getElapsedMs(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  /**
   * Get transcript as text
   */
  private getTranscriptText(): string {
    return this.transcript
      .map((u) => `[${u.speaker}]: ${u.content}`)
      .join('\n\n');
  }

  /**
   * Get last utterance content
   */
  private getLastUtteranceContent(): string {
    const lastUtterance = this.transcript[this.transcript.length - 1];
    if (!lastUtterance) return '';
    return lastUtterance.content;
  }

  /**
   * Find chair by position
   */
  private findChairByPosition(position: string): DuelogicChair | undefined {
    return this.config.chairs.find((c) => c.position === position);
  }

  /**
   * Check if we should evaluate responses
   */
  private shouldEvaluate(): boolean {
    return this.config.arbiter.accountabilityLevel !== 'relaxed';
  }

  /**
   * Map segment to database phase
   */
  private mapSegmentToPhase(segment: DuelogicSegment): DebatePhase {
    const phaseMap: Record<DuelogicSegment, DebatePhase> = {
      introduction: 'opening_statements',
      opening: 'opening_statements',
      exchange: 'rebuttals',
      synthesis: 'synthesis',
    };
    return phaseMap[segment];
  }

  /**
   * Calculate debate statistics
   */
  private calculateStats(): DebateStats {
    const chairStats: DebateStats['chairStats'] = {};

    for (const chair of this.config.chairs) {
      const evals = this.evaluations.get(chair.position) || [];
      const utterances = this.transcript.filter(
        (u) => u.speaker === chair.position
      );
      const interruptions = this.interruptionCounts.get(chair.position) || 0;

      if (evals.length > 0) {
        chairStats[chair.position] = {
          averageAdherence: Math.round(
            evals.reduce((sum, e) => sum + e.adherenceScore, 0) / evals.length
          ),
          steelManningRate: Math.round(
            (evals.filter((e) => e.steelManning.attempted).length / evals.length) * 100
          ),
          selfCritiqueRate: Math.round(
            (evals.filter((e) => e.selfCritique.attempted).length / evals.length) * 100
          ),
          utteranceCount: utterances.length,
          interruptionsMade: interruptions,
        };
      } else {
        chairStats[chair.position] = {
          averageAdherence: 0,
          steelManningRate: 0,
          selfCritiqueRate: 0,
          utteranceCount: utterances.length,
          interruptionsMade: interruptions,
        };
      }
    }

    return {
      durationMs: this.getElapsedMs(),
      utteranceCount: this.transcript.length,
      interruptionCount: Array.from(this.interruptionCounts.values()).reduce((a, b) => a + b, 0),
      chairStats,
    };
  }

  /**
   * Handle error
   */
  private handleError(error: Error): void {
    logger.error({ error, debateId: this.debateId }, 'Duelogic orchestrator error');

    this.broadcastEvent('error', {
      debateId: this.debateId,
      message: error.message,
      timestamp: Date.now(),
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a DuelogicOrchestrator
 */
export function createDuelogicOrchestrator(
  options: DuelogicOrchestratorOptions
): DuelogicOrchestrator {
  return new DuelogicOrchestrator(options);
}
