# DUELOGIC-007: Duelogic Orchestrator

**Priority:** P0
**Estimate:** L (3 days)
**Labels:** `orchestrator`, `backend`, `duelogic`, `core`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001 through DUELOGIC-006

---

## Context

The Duelogic Orchestrator is the main coordination engine that manages the entire debate flow: introduction, opening statements, exchanges with potential interruptions, and synthesis. It integrates all components into a cohesive debate experience.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Orchestrator Flow section
- [Existing Orchestrators](../../../backend/src/services/debate/) - Pattern reference

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/services/debate/duelogic-orchestrator.ts`
- [ ] Implement 4-segment debate flow (intro, openings, exchange, synthesis)
- [ ] Integrate arbiter agent for intro/outro/interjections
- [ ] Integrate all chair agents
- [ ] Integrate response evaluator
- [ ] Integrate interruption engine
- [ ] Support pause/resume/stop controls
- [ ] Broadcast SSE events for real-time UI
- [ ] Save all utterances to database
- [ ] Track evaluation scores per chair
- [ ] Handle errors gracefully without crashing debate
- [ ] Write comprehensive integration tests

---

## Implementation Guide

### File: `backend/src/services/debate/duelogic-orchestrator.ts`

```typescript
import { LLMClient } from '../../llm/openrouter-adapter';
import { SSEManager } from '../../sse/sse-manager';
import { Pool } from 'pg';
import {
  DuelogicConfig,
  DuelogicChair,
  DuelogicSegment,
  ResponseEvaluation,
  DUELOGIC_DEFAULTS
} from '../../types/duelogic';
import { ArbiterAgent } from '../agents/arbiter-agent';
import { ChairAgent, createChairAgents } from '../agents/chair-agent';
import { ResponseEvaluator } from './response-evaluator';
import { ChairInterruptionEngine } from './chair-interruption-engine';
import { DuelogicRepository } from '../../db/repositories/duelogic-repository';

interface DuelogicOrchestratorOptions {
  llmClient: LLMClient;
  sseManager: SSEManager;
  pool: Pool;
  debateId: string;
  proposition: string;
  propositionContext?: string;
  config: Partial<DuelogicConfig>;
}

interface DebateUtterance {
  speaker: string;
  segment: DuelogicSegment;
  content: string;
  timestamp: number;
  evaluation?: ResponseEvaluation;
  wasInterrupted?: boolean;
  interruptedBy?: string;
}

export class DuelogicOrchestrator {
  private llmClient: LLMClient;
  private sseManager: SSEManager;
  private repository: DuelogicRepository;
  private debateId: string;
  private proposition: string;
  private propositionContext?: string;
  private config: DuelogicConfig;

  private arbiter: ArbiterAgent;
  private chairs: Map<string, ChairAgent>;
  private evaluator: ResponseEvaluator;
  private interruptEngine: ChairInterruptionEngine;

  private transcript: DebateUtterance[] = [];
  private evaluations: Map<string, ResponseEvaluation[]> = new Map();
  private currentSegment: DuelogicSegment = 'introduction';

  private isRunning = false;
  private isPaused = false;
  private startTime: number = 0;

  constructor(options: DuelogicOrchestratorOptions) {
    this.llmClient = options.llmClient;
    this.sseManager = options.sseManager;
    this.repository = new DuelogicRepository(options.pool);
    this.debateId = options.debateId;
    this.proposition = options.proposition;
    this.propositionContext = options.propositionContext;
    this.config = { ...DUELOGIC_DEFAULTS, ...options.config } as DuelogicConfig;

    // Initialize components
    this.arbiter = new ArbiterAgent(
      this.llmClient,
      this.sseManager,
      this.config,
      this.debateId
    );

    this.chairs = createChairAgents(
      this.llmClient,
      this.sseManager,
      this.config,
      this.debateId
    );

    this.evaluator = new ResponseEvaluator(this.llmClient, this.config);

    this.interruptEngine = new ChairInterruptionEngine(
      this.llmClient,
      this.config,
      this.debateId,
      this.repository
    );

    // Initialize evaluation tracking per chair
    for (const chair of this.config.chairs) {
      this.evaluations.set(chair.position, []);
    }
  }

  /**
   * Start the debate
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Debate already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();

    try {
      // Save chair assignments to database
      for (const chair of this.config.chairs) {
        await this.repository.saveChairAssignment(this.debateId, chair);
      }

      // SEGMENT 1: Podcast Introduction
      await this.executeIntroduction();

      // SEGMENT 2: Opening Statements
      await this.executeOpenings();

      // SEGMENT 3: Main Exchange
      await this.executeExchange();

      // SEGMENT 4: Podcast Closing
      await this.executeSynthesis();

      this.broadcastComplete();
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
      this.sseManager.broadcast(this.debateId, {
        type: 'debate_paused',
        data: { timestamp: Date.now() }
      });
    }
  }

  /**
   * Resume the debate
   */
  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.sseManager.broadcast(this.debateId, {
        type: 'debate_resumed',
        data: { timestamp: Date.now() }
      });
    }
  }

  /**
   * Stop the debate
   */
  stop(): void {
    this.isRunning = false;
    this.sseManager.broadcast(this.debateId, {
      type: 'debate_stopped',
      data: { timestamp: Date.now() }
    });
  }

  private async executeIntroduction(): Promise<void> {
    this.currentSegment = 'introduction';
    this.broadcastSegmentStart('introduction');

    const content = await this.arbiter.generateIntroduction(
      this.proposition,
      this.propositionContext
    );

    await this.saveUtterance({
      speaker: 'arbiter',
      segment: 'introduction',
      content,
      timestamp: Date.now(),
    });

    this.broadcastSegmentComplete('introduction');
  }

  private async executeOpenings(): Promise<void> {
    this.currentSegment = 'opening';
    this.broadcastSegmentStart('opening');

    for (const chair of this.config.chairs) {
      if (!this.isRunning) break;
      await this.waitIfPaused();

      const agent = this.chairs.get(chair.position)!;
      const content = await agent.generateOpening(
        this.proposition,
        this.propositionContext
      );

      // Opening statements are not evaluated (no prior context to steel-man)
      await this.saveUtterance({
        speaker: chair.position,
        segment: 'opening',
        content,
        timestamp: Date.now(),
      });
    }

    this.broadcastSegmentComplete('opening');
  }

  private async executeExchange(): Promise<void> {
    this.currentSegment = 'exchange';
    this.broadcastSegmentStart('exchange');

    let exchangeCount = 0;
    let previousSpeaker: DuelogicChair | null = null;
    let previousContent: string = '';

    while (exchangeCount < this.config.flow.maxExchanges && this.isRunning) {
      for (const chair of this.config.chairs) {
        if (!this.isRunning) break;
        await this.waitIfPaused();

        const agent = this.chairs.get(chair.position)!;

        // Generate response
        const content = await agent.generateExchangeResponse(
          previousSpeaker || this.config.chairs[0],
          previousContent || this.transcript[this.transcript.length - 1]?.content || '',
          this.getTranscriptText()
        );

        // Check for interruption opportunity
        let wasInterrupted = false;
        let interruptedBy: string | undefined;

        if (this.config.interruptions.enabled) {
          const interruptCandidate = await this.interruptEngine.evaluateInterrupt({
            currentSpeaker: chair,
            otherChairs: this.config.chairs.filter(c => c.position !== chair.position),
            recentContent: content.slice(0, 500), // Evaluate first portion
            debateSoFar: this.getTranscriptText(),
            topic: this.proposition,
          });

          if (interruptCandidate) {
            wasInterrupted = true;
            interruptedBy = interruptCandidate.interruptingChair.position;

            // Execute interruption
            await this.executeInterruption(interruptCandidate, chair, content);
          }
        }

        // Evaluate response if arbiter is monitoring
        let evaluation: ResponseEvaluation | undefined;
        if (this.arbiter.shouldEvaluate() && previousSpeaker) {
          evaluation = await this.evaluator.evaluate({
            chair,
            responseContent: content,
            debateHistory: this.getTranscriptText(),
            previousSpeaker,
            previousContent,
          });

          // Track evaluation
          this.evaluations.get(chair.position)!.push(evaluation);

          // Arbiter interjection on violations
          if (this.arbiter.shouldInterjectionOnViolation(evaluation)) {
            await this.executeArbiterInterjection(evaluation, chair);
          }
        }

        // Save utterance
        await this.saveUtterance({
          speaker: chair.position,
          segment: 'exchange',
          content,
          timestamp: Date.now(),
          evaluation,
          wasInterrupted,
          interruptedBy,
        });

        previousSpeaker = chair;
        previousContent = content;
      }

      exchangeCount++;

      // Broadcast exchange progress
      this.sseManager.broadcast(this.debateId, {
        type: 'exchange_complete',
        data: {
          exchangeNumber: exchangeCount,
          maxExchanges: this.config.flow.maxExchanges
        }
      });
    }

    this.broadcastSegmentComplete('exchange');
  }

  private async executeInterruption(
    candidate: any,
    interruptedChair: DuelogicChair,
    interruptedContent: string
  ): Promise<void> {
    const interrupter = this.chairs.get(candidate.interruptingChair.position)!;

    // Broadcast interruption start
    this.sseManager.broadcast(this.debateId, {
      type: 'interruption_start',
      data: {
        interrupter: candidate.interruptingChair.position,
        interrupted: interruptedChair.position,
        reason: candidate.triggerReason,
        opener: candidate.suggestedOpener,
      }
    });

    // Generate interruption content
    const interruptContent = await interrupter.respondToChallenge(
      interruptedChair,
      candidate.triggerContent
    );

    await this.saveUtterance({
      speaker: candidate.interruptingChair.position,
      segment: 'exchange',
      content: `[INTERRUPTION: ${candidate.suggestedOpener}] ${interruptContent}`,
      timestamp: Date.now(),
    });

    // Let interrupted chair respond to interruption
    const interruptedAgent = this.chairs.get(interruptedChair.position)!;
    const response = await interruptedAgent.respondToInterruption(
      candidate.interruptingChair,
      interruptContent
    );

    await this.saveUtterance({
      speaker: interruptedChair.position,
      segment: 'exchange',
      content: `[RESPONDING TO INTERRUPTION] ${response}`,
      timestamp: Date.now(),
    });
  }

  private async executeArbiterInterjection(
    evaluation: ResponseEvaluation,
    violatingChair: DuelogicChair
  ): Promise<void> {
    const violationType = this.determineViolationType(evaluation);

    const interjection = await this.arbiter.generateInterjection(
      violationType,
      violatingChair,
      this.transcript[this.transcript.length - 1]?.content || ''
    );

    await this.saveUtterance({
      speaker: 'arbiter',
      segment: 'exchange',
      content: `[ARBITER INTERJECTION] ${interjection}`,
      timestamp: Date.now(),
    });
  }

  private determineViolationType(
    evaluation: ResponseEvaluation
  ): 'straw_manning' | 'missing_self_critique' | 'framework_inconsistency' | 'rhetorical_evasion' {
    if (evaluation.steelManning.quality === 'absent' || evaluation.steelManning.quality === 'weak') {
      return 'straw_manning';
    }
    if (evaluation.selfCritique.quality === 'absent') {
      return 'missing_self_critique';
    }
    if (!evaluation.frameworkConsistency.consistent) {
      return 'framework_inconsistency';
    }
    return 'rhetorical_evasion';
  }

  private async executeSynthesis(): Promise<void> {
    this.currentSegment = 'synthesis';
    this.broadcastSegmentStart('synthesis');

    const content = await this.arbiter.generateClosing(
      this.proposition,
      this.getTranscriptText(),
      this.evaluations
    );

    await this.saveUtterance({
      speaker: 'arbiter',
      segment: 'synthesis',
      content,
      timestamp: Date.now(),
    });

    this.broadcastSegmentComplete('synthesis');
  }

  private async saveUtterance(utterance: DebateUtterance): Promise<void> {
    this.transcript.push(utterance);

    // Save to database (implement in repository)
    // await this.repository.saveUtterance(this.debateId, utterance);

    // Broadcast
    this.sseManager.broadcast(this.debateId, {
      type: 'utterance',
      data: {
        speaker: utterance.speaker,
        segment: utterance.segment,
        content: utterance.content,
        timestamp: utterance.timestamp,
        evaluation: utterance.evaluation,
      }
    });
  }

  private getTranscriptText(): string {
    return this.transcript
      .map(u => `[${u.speaker}]: ${u.content}`)
      .join('\n\n');
  }

  private async waitIfPaused(): Promise<void> {
    while (this.isPaused && this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private broadcastSegmentStart(segment: DuelogicSegment): void {
    this.sseManager.broadcast(this.debateId, {
      type: 'segment_start',
      data: { segment, timestamp: Date.now() }
    });
  }

  private broadcastSegmentComplete(segment: DuelogicSegment): void {
    this.sseManager.broadcast(this.debateId, {
      type: 'segment_complete',
      data: { segment, timestamp: Date.now() }
    });
  }

  private broadcastComplete(): void {
    const duration = Date.now() - this.startTime;
    const stats = this.calculateStats();

    this.sseManager.broadcast(this.debateId, {
      type: 'debate_complete',
      data: {
        duration,
        stats,
        transcript: this.transcript.length,
      }
    });
  }

  private calculateStats(): any {
    const chairStats: Record<string, any> = {};

    for (const chair of this.config.chairs) {
      const evals = this.evaluations.get(chair.position) || [];
      if (evals.length > 0) {
        chairStats[chair.position] = {
          averageAdherence: Math.round(
            evals.reduce((sum, e) => sum + e.adherenceScore, 0) / evals.length
          ),
          steelManningRate: Math.round(
            (evals.filter(e => e.steelManning.attempted).length / evals.length) * 100
          ),
          selfCritiqueRate: Math.round(
            (evals.filter(e => e.selfCritique.attempted).length / evals.length) * 100
          ),
        };
      }
    }

    return { chairStats };
  }

  private handleError(error: Error): void {
    console.error('Duelogic orchestrator error:', error);
    this.sseManager.broadcast(this.debateId, {
      type: 'error',
      data: { message: error.message }
    });
  }

  /**
   * Get current debate status
   */
  getStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    currentSegment: DuelogicSegment;
    utteranceCount: number;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentSegment: this.currentSegment,
      utteranceCount: this.transcript.length,
    };
  }
}
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration
- DUELOGIC-002: Database Schema
- DUELOGIC-003: Arbiter Agent
- DUELOGIC-004: Chair Agent
- DUELOGIC-005: Response Evaluator
- DUELOGIC-006: Chair Interruption Engine

---

## Validation

```bash
# Integration tests
npm run test:integration -- --grep "DuelogicOrchestrator"

# Full debate test
npm run test:e2e -- --grep "duelogic debate flow"
```

---

## Test Cases

```typescript
describe('DuelogicOrchestrator', () => {
  describe('debate flow', () => {
    it('executes all 4 segments in order', async () => {
      const segments: string[] = [];
      mockSSE.on('segment_start', (data) => segments.push(data.segment));

      await orchestrator.start();

      expect(segments).toEqual(['introduction', 'opening', 'exchange', 'synthesis']);
    });

    it('generates arbiter intro and closing', async () => {
      await orchestrator.start();

      const arbiterUtterances = transcript.filter(u => u.speaker === 'arbiter');
      expect(arbiterUtterances.length).toBeGreaterThanOrEqual(2);
    });

    it('each chair gives opening statement', async () => {
      await orchestrator.start();

      const openings = transcript.filter(u => u.segment === 'opening');
      expect(openings.length).toBe(config.chairs.length);
    });
  });

  describe('interruptions', () => {
    it('handles chair interruptions', async () => {
      await orchestrator.start();

      const interruptions = transcript.filter(u =>
        u.content.includes('[INTERRUPTION')
      );
      expect(interruptions.length).toBeGreaterThan(0);
    });
  });

  describe('evaluation', () => {
    it('evaluates exchange responses', async () => {
      await orchestrator.start();

      const exchanges = transcript.filter(u =>
        u.segment === 'exchange' && u.evaluation
      );
      expect(exchanges.length).toBeGreaterThan(0);
    });

    it('tracks evaluation stats per chair', async () => {
      await orchestrator.start();

      const stats = orchestrator.calculateStats();
      for (const chair of config.chairs) {
        expect(stats.chairStats[chair.position]).toBeDefined();
      }
    });
  });

  describe('controls', () => {
    it('pauses and resumes', async () => {
      const startPromise = orchestrator.start();

      orchestrator.pause();
      expect(orchestrator.getStatus().isPaused).toBe(true);

      orchestrator.resume();
      expect(orchestrator.getStatus().isPaused).toBe(false);

      await startPromise;
    });

    it('stops debate early', async () => {
      const startPromise = orchestrator.start();

      setTimeout(() => orchestrator.stop(), 1000);

      await startPromise;
      expect(orchestrator.getStatus().isRunning).toBe(false);
    });
  });
});
```

---

## Definition of Done

- [ ] All 4 debate segments execute correctly
- [ ] Arbiter generates engaging intro and closing
- [ ] All chairs participate in openings and exchanges
- [ ] Response evaluations generated and stored
- [ ] Interruptions work when conditions are met
- [ ] Arbiter interjections fire on violations
- [ ] SSE events broadcast correctly
- [ ] Pause/resume/stop controls work
- [ ] Errors handled gracefully
- [ ] Integration tests pass
