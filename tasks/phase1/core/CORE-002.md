# CORE-002: Implement Debate Orchestrator

**Priority:** P0
**Estimate:** XL
**Labels:** `core`, `backend`, `orchestration`
**Status:** 🟢 TO DO

---

## Context

The Debate Orchestrator is the "brain" of ClearSide. It coordinates the entire debate lifecycle: initializing debates, calling agents in sequence, managing user interventions, streaming utterances, and compiling final transcripts. This is the most complex component in the system and depends on all other core components.

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Section 2 "System Architecture"
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Complete protocol specification
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-200 series (Live Debate Engine)

---

## Requirements

### Acceptance Criteria

- [ ] Initialize debate from user proposition
- [ ] Call Orchestrator agent to normalize proposition
- [ ] Loop through all 6 debate phases
- [ ] Manage turn-taking within each phase
- [ ] Call appropriate agent for each turn
- [ ] Record all utterances with timestamps
- [ ] Stream utterances via SSE
- [ ] Handle user interventions (pause, question, evidence)
- [ ] Resume debate after interventions
- [ ] Compile final transcript on completion
- [ ] Handle errors gracefully with retry logic
- [ ] Update debate status in database throughout

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-201**: Initialize debate state machine with 6 phases
- **FR-202**: Manage turn-based dialogue between agents
- **FR-203**: Stream debate utterances in real-time via SSE
- **FR-207**: Record all utterances with precise timestamps
- **FR-208**: Maintain debate state persistence
- **FR-209**: Handle agent failures gracefully with retry
- **FR-210**: Support pause/resume functionality

---

## Implementation Guide

### Debate Orchestrator Class

```typescript
// src/services/debate/debate-orchestrator.ts
import { DebateStateMachine, DebatePhase, Speaker } from './state-machine';
import { TurnManager } from './turn-manager';
import { SSEManager } from '../sse/sse-manager';
import { DebateRepository, UtteranceRepository, InterventionRepository } from '../../db/repositories';
import { ProAdvocateAgent, ConAdvocateAgent, ModeratorAgent, OrchestratorAgent } from '../agents';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';

export class DebateOrchestrator {
  private stateMachine: DebateStateMachine;
  private turnManager: TurnManager;
  private sseManager: SSEManager;
  private debateRepo: DebateRepository;
  private utteranceRepo: UtteranceRepository;
  private interventionRepo: InterventionRepository;
  private agents: {
    orchestrator: OrchestratorAgent;
    pro: ProAdvocateAgent;
    con: ConAdvocateAgent;
    moderator: ModeratorAgent;
  };
  private debateId: string;
  private startTime: number = 0;
  private interventionQueue: UserIntervention[] = [];

  constructor(
    debateId: string,
    stateMachine: DebateStateMachine,
    turnManager: TurnManager,
    sseManager: SSEManager,
    repositories: {
      debate: DebateRepository;
      utterance: UtteranceRepository;
      intervention: InterventionRepository;
    },
    agents: {
      orchestrator: OrchestratorAgent;
      pro: ProAdvocateAgent;
      con: ConAdvocateAgent;
      moderator: ModeratorAgent;
    }
  ) {
    this.debateId = debateId;
    this.stateMachine = stateMachine;
    this.turnManager = turnManager;
    this.sseManager = sseManager;
    this.debateRepo = repositories.debate;
    this.utteranceRepo = repositories.utterance;
    this.interventionRepo = repositories.intervention;
    this.agents = agents;
  }

  async startDebate(proposition: string, context?: PropositionContext): Promise<string> {
    this.startTime = Date.now();

    try {
      loggers.info(`Starting debate: ${this.debateId}`, { proposition });

      // Step 1: Create debate record
      await this.debateRepo.create(proposition, context);

      // Step 2: Normalize proposition with Orchestrator agent
      const normalizedProp = await this.normalizeProposition(proposition, context);

      // Step 3: Initialize state machine
      await this.stateMachine.initialize();

      // Step 4: Execute all phases
      await this.executeAllPhases(normalizedProp);

      // Step 5: Mark complete
      await this.completeDebate();

      loggers.info(`Debate completed: ${this.debateId}`, {
        duration_ms: Date.now() - this.startTime
      });

      return this.debateId;
    } catch (error) {
      await this.handleDebateError(error as Error);
      throw error;
    }
  }

  private async normalizeProposition(
    rawInput: string,
    context?: PropositionContext
  ): Promise<NormalizedProposition> {
    loggers.info('Normalizing proposition', { debateId: this.debateId, rawInput });

    const normalized = await this.agents.orchestrator.normalize(rawInput, context);

    // Update debate record with normalized proposition
    await this.debateRepo.updateProposition(this.debateId, normalized);

    // Broadcast to SSE clients
    this.sseManager.broadcastToDebate(this.debateId, 'proposition_normalized', normalized);

    return normalized;
  }

  private async executeAllPhases(proposition: NormalizedProposition): Promise<void> {
    const phases: DebatePhase[] = [
      DebatePhase.PHASE_1_OPENING,
      DebatePhase.PHASE_2_CONSTRUCTIVE,
      DebatePhase.PHASE_3_CROSSEXAM,
      DebatePhase.PHASE_4_REBUTTAL,
      DebatePhase.PHASE_5_CLOSING,
      DebatePhase.PHASE_6_SYNTHESIS
    ];

    for (const phase of phases) {
      // Transition to phase
      await this.stateMachine.transition(phase);

      // Broadcast phase transition
      this.sseManager.broadcastToDebate(this.debateId, 'phase_transition', {
        phase,
        timestamp: Date.now() - this.startTime
      });

      // Execute phase
      await this.executePhase(phase, proposition);

      // Process any queued interventions
      await this.processInterventionQueue();
    }
  }

  private async executePhase(phase: DebatePhase, proposition: NormalizedProposition): Promise<void> {
    loggers.stateTransition(this.debateId, 'executing_phase', phase);

    // Get turn configuration for this phase
    const turns = this.turnManager.getTurnsForPhase(phase);

    for (const turn of turns) {
      // Check for pause
      if (this.stateMachine.isPaused()) {
        await this.waitForResume();
      }

      // Execute turn
      await this.executeTurn(turn, proposition);
    }
  }

  private async executeTurn(turn: Turn, proposition: NormalizedProposition): Promise<void> {
    const { speaker, promptType, metadata } = turn;

    loggers.info('Executing turn', {
      debateId: this.debateId,
      speaker,
      promptType,
      phase: this.stateMachine.getCurrentPhase()
    });

    try {
      // Get debate context for agent
      const context = await this.buildAgentContext(speaker);

      // Call agent
      const utterance = await this.callAgent(speaker, promptType, proposition, context);

      // Record utterance
      await this.recordUtterance({
        debateId: this.debateId,
        timestamp: Date.now() - this.startTime,
        phase: this.stateMachine.getCurrentPhase(),
        speaker,
        content: utterance,
        metadata
      });
    } catch (error) {
      loggers.error('Turn execution failed', error as Error, {
        debateId: this.debateId,
        speaker,
        phase: this.stateMachine.getCurrentPhase()
      });

      // Retry once
      loggers.info('Retrying turn', { debateId: this.debateId, speaker });
      const context = await this.buildAgentContext(speaker);
      const utterance = await this.callAgent(speaker, promptType, proposition, context);
      await this.recordUtterance({
        debateId: this.debateId,
        timestamp: Date.now() - this.startTime,
        phase: this.stateMachine.getCurrentPhase(),
        speaker,
        content: utterance,
        metadata
      });
    }
  }

  private async callAgent(
    speaker: Speaker,
    promptType: string,
    proposition: NormalizedProposition,
    context: AgentContext
  ): Promise<string> {
    const startTime = Date.now();

    let result: string;

    switch (speaker) {
      case Speaker.PRO:
        result = await this.agents.pro.generateUtterance(promptType, proposition, context);
        break;
      case Speaker.CON:
        result = await this.agents.con.generateUtterance(promptType, proposition, context);
        break;
      case Speaker.MODERATOR:
        result = await this.agents.moderator.generateSynthesis(proposition, context);
        break;
      default:
        throw new Error(`Unknown speaker: ${speaker}`);
    }

    loggers.agentCall({
      debateId: this.debateId,
      agent: speaker,
      phase: this.stateMachine.getCurrentPhase(),
      model: 'claude-sonnet-4-5', // TODO: Get from agent
      latency_ms: Date.now() - startTime,
      success: true
    });

    return result;
  }

  private async buildAgentContext(speaker: Speaker): Promise<AgentContext> {
    // Get all previous utterances
    const utterances = await this.utteranceRepo.findByDebateId(this.debateId);

    // Get interventions
    const interventions = await this.interventionRepo.findByDebateId(this.debateId);

    // Build context object
    return {
      debateId: this.debateId,
      currentPhase: this.stateMachine.getCurrentPhase(),
      previousUtterances: utterances,
      interventions,
      speaker
    };
  }

  private async recordUtterance(utterance: Utterance): Promise<void> {
    // Validate utterance structure
    const validation = schemaValidator.validateUtterance(utterance);
    if (!validation.valid) {
      loggers.schemaValidation(this.debateId, 'utterance', false, validation.errors);
      throw new Error(`Invalid utterance: ${validation.errors.join(', ')}`);
    }

    // Persist to database
    await this.utteranceRepo.create(
      utterance.debateId,
      utterance.timestamp,
      utterance.phase,
      utterance.speaker,
      utterance.content,
      utterance.metadata
    );

    // Stream to SSE clients
    this.sseManager.broadcastToDebate(this.debateId, 'utterance', utterance);

    loggers.sseEvent(this.debateId, 'utterance', this.sseManager.getClientCount(this.debateId));
  }

  async pause(): Promise<void> {
    loggers.info('Pausing debate', { debateId: this.debateId });

    await this.stateMachine.pause();

    this.sseManager.broadcastToDebate(this.debateId, 'paused', {
      timestamp: Date.now() - this.startTime
    });
  }

  async resume(): Promise<void> {
    loggers.info('Resuming debate', { debateId: this.debateId });

    await this.stateMachine.resume();

    this.sseManager.broadcastToDebate(this.debateId, 'resumed', {
      timestamp: Date.now() - this.startTime
    });
  }

  async handleIntervention(intervention: UserIntervention): Promise<void> {
    loggers.userIntervention(
      this.debateId,
      intervention.type,
      intervention.directedTo
    );

    // Validate intervention
    const validation = schemaValidator.validateIntervention(intervention);
    if (!validation.valid) {
      throw new Error(`Invalid intervention: ${validation.errors.join(', ')}`);
    }

    // Pause debate
    await this.pause();

    // Store intervention
    await this.interventionRepo.create(
      this.debateId,
      Date.now() - this.startTime,
      intervention.type,
      intervention.content,
      intervention.directedTo
    );

    // Generate response
    const response = await this.generateInterventionResponse(intervention);

    // Record response
    await this.interventionRepo.updateResponse(
      intervention.id,
      response,
      Date.now() - this.startTime
    );

    // Stream response
    this.sseManager.broadcastToDebate(this.debateId, 'intervention_response', {
      interventionId: intervention.id,
      response
    });
  }

  private async generateInterventionResponse(intervention: UserIntervention): Promise<string> {
    const context = await this.buildAgentContext(intervention.directedTo);

    switch (intervention.directedTo) {
      case 'pro':
        return await this.agents.pro.respondToQuestion(intervention.content, context);
      case 'con':
        return await this.agents.con.respondToQuestion(intervention.content, context);
      case 'moderator':
        return await this.agents.moderator.respondToQuestion(intervention.content, context);
      default:
        throw new Error(`Unknown intervention target: ${intervention.directedTo}`);
    }
  }

  private async waitForResume(): Promise<void> {
    // Poll state machine until resumed
    while (this.stateMachine.isPaused()) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  private async processInterventionQueue(): Promise<void> {
    // Process clarification requests at phase breaks
    const queuedInterventions = this.interventionQueue.filter(
      i => i.type === 'clarification_request'
    );

    for (const intervention of queuedInterventions) {
      await this.handleIntervention(intervention);
    }

    this.interventionQueue = [];
  }

  private async completeDebate(): Promise<void> {
    // Transition to completed state
    await this.stateMachine.complete();

    // Build final transcript
    const transcript = await this.buildFinalTranscript();

    // Validate transcript
    const validation = schemaValidator.validateTranscript(transcript);
    if (!validation.valid) {
      loggers.schemaValidation(this.debateId, 'transcript', false, validation.errors);
      throw new Error(`Invalid transcript: ${validation.errors.join(', ')}`);
    }

    // Save transcript
    await this.debateRepo.saveTranscript(this.debateId, transcript);

    // Update status
    await this.debateRepo.updateStatus(this.debateId, 'completed');

    // Broadcast completion
    this.sseManager.broadcastToDebate(this.debateId, 'complete', {
      debateId: this.debateId,
      totalDuration: Date.now() - this.startTime
    });

    loggers.info('Debate finalized', {
      debateId: this.debateId,
      totalDuration: Date.now() - this.startTime
    });
  }

  private async buildFinalTranscript(): Promise<DebateTranscript> {
    const debate = await this.debateRepo.findById(this.debateId);
    const utterances = await this.utteranceRepo.findByDebateId(this.debateId);
    const interventions = await this.interventionRepo.findByDebateId(this.debateId);

    return {
      meta: {
        schema_version: '2.0.0',
        debate_id: this.debateId,
        generated_at: new Date().toISOString(),
        debate_format: 'live_theater',
        total_duration_seconds: Math.floor((Date.now() - this.startTime) / 1000),
        status: 'completed'
      },
      proposition: {
        raw_input: debate.propositionText,
        normalized_question: debate.propositionNormalized,
        context: debate.propositionContext
      },
      transcript: utterances,
      structured_analysis: await this.buildStructuredAnalysis(utterances),
      user_interventions: interventions
    };
  }

  private async buildStructuredAnalysis(utterances: Utterance[]): Promise<StructuredAnalysis> {
    // Compile pro arguments
    const proUtterances = utterances.filter(u => u.speaker === 'pro');
    const conUtterances = utterances.filter(u => u.speaker === 'con');
    const modUtterances = utterances.filter(u => u.speaker === 'moderator');

    return {
      pro: {
        executive_summary: this.extractSummary(proUtterances),
        arguments: this.extractArguments(proUtterances),
        assumptions: this.extractAssumptions(proUtterances),
        uncertainties: this.extractUncertainties(proUtterances)
      },
      con: {
        executive_summary: this.extractSummary(conUtterances),
        arguments: this.extractArguments(conUtterances),
        assumptions: this.extractAssumptions(conUtterances),
        uncertainties: this.extractUncertainties(conUtterances)
      },
      moderator: modUtterances.length > 0 ? JSON.parse(modUtterances[0].content) : {}
    };
  }

  private extractSummary(utterances: Utterance[]): string {
    // Extract from opening/closing statements
    const opening = utterances.find(u => u.phase === 'phase_1_opening');
    return opening?.content.substring(0, 500) || '';
  }

  private extractArguments(utterances: Utterance[]): any[] {
    // Extract structured arguments from constructive phase
    return utterances
      .filter(u => u.phase === 'phase_2_constructive')
      .map(u => ({
        content: u.content,
        category: u.metadata?.argument_category,
        evidence_type: u.metadata?.evidence_type,
        confidence: u.metadata?.confidence_level
      }));
  }

  private extractAssumptions(utterances: Utterance[]): string[] {
    // TODO: Parse assumptions from utterance content
    // This would use regex or NLP to extract explicit assumptions
    return [];
  }

  private extractUncertainties(utterances: Utterance[]): string[] {
    // TODO: Parse uncertainty statements
    return [];
  }

  private async handleDebateError(error: Error): Promise<void> {
    loggers.error('Debate error', error, { debateId: this.debateId });

    await this.stateMachine.error(error.message);
    await this.debateRepo.updateStatus(this.debateId, 'error');

    this.sseManager.broadcastToDebate(this.debateId, 'error', {
      message: error.message,
      timestamp: Date.now() - this.startTime
    });
  }
}

// Types
interface Turn {
  speaker: Speaker;
  promptType: string;
  metadata?: any;
}

interface Utterance {
  debateId: string;
  timestamp: number;
  phase: string;
  speaker: string;
  content: string;
  metadata?: any;
}

interface UserIntervention {
  id: string;
  type: 'pause_question' | 'evidence_injection' | 'clarification_request';
  content: string;
  directedTo: 'pro' | 'con' | 'moderator';
}

interface AgentContext {
  debateId: string;
  currentPhase: string;
  previousUtterances: Utterance[];
  interventions: UserIntervention[];
  speaker: Speaker;
}

interface NormalizedProposition {
  normalized_question: string;
  context?: {
    geography?: string;
    timeframe?: string;
    domain?: string;
  };
}

interface DebateTranscript {
  meta: any;
  proposition: any;
  transcript: Utterance[];
  structured_analysis: StructuredAnalysis;
  user_interventions: UserIntervention[];
}

interface StructuredAnalysis {
  pro: any;
  con: any;
  moderator: any;
}

interface PropositionContext {
  geography?: string;
  timeframe?: string;
  domain?: string;
}
```

---

## Dependencies

- **CORE-001**: Debate State Machine
- **CORE-003**: Turn Management System
- **INFRA-003**: SSE Streaming Layer
- **CORE-005**: Transcript Recorder (logic included here)
- **AGENT-001**: Orchestrator Agent
- **AGENT-002**: Pro Advocate Agent
- **AGENT-003**: Con Advocate Agent
- **AGENT-004**: Moderator Agent

---

## Validation

### Integration Tests

```typescript
// tests/debate-orchestrator.integration.test.ts
describe('DebateOrchestrator', () => {
  let orchestrator: DebateOrchestrator;
  let mockStateMachine: jest.Mocked<DebateStateMachine>;
  let mockAgents: any;

  beforeEach(() => {
    // Set up mocks
    mockStateMachine = createMockStateMachine();
    mockAgents = createMockAgents();

    orchestrator = new DebateOrchestrator(
      'test-debate-id',
      mockStateMachine,
      mockTurnManager,
      mockSSEManager,
      mockRepositories,
      mockAgents
    );
  });

  it('should execute complete debate flow', async () => {
    const proposition = 'Should AI data centers have a moratorium?';

    await orchestrator.startDebate(proposition);

    // Verify all phases executed
    expect(mockStateMachine.transition).toHaveBeenCalledWith(DebatePhase.PHASE_1_OPENING);
    expect(mockStateMachine.transition).toHaveBeenCalledWith(DebatePhase.PHASE_6_SYNTHESIS);
    expect(mockStateMachine.complete).toHaveBeenCalled();
  });

  it('should handle user intervention', async () => {
    const intervention: UserIntervention = {
      id: 'test-id',
      type: 'pause_question',
      content: 'Can you clarify?',
      directedTo: 'pro'
    };

    await orchestrator.handleIntervention(intervention);

    expect(mockStateMachine.pause).toHaveBeenCalled();
    expect(mockAgents.pro.respondToQuestion).toHaveBeenCalled();
  });

  it('should retry on agent failure', async () => {
    mockAgents.pro.generateUtterance
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce('Success');

    // Should not throw
    await expect(orchestrator.startDebate('Test')).resolves.not.toThrow();
  });
});
```

### Definition of Done

- [ ] Debate orchestrator initializes debates from proposition
- [ ] All 6 phases execute in correct order
- [ ] Agents called with correct prompts and context
- [ ] Utterances recorded and streamed
- [ ] User interventions handled (pause, question, resume)
- [ ] Final transcript generated and validated
- [ ] Error handling with retry logic works
- [ ] Integration tests pass
- [ ] Can run flagship demo end-to-end
- [ ] Performance meets targets (<30 min total debate)

---

## Notes

- This is the most complex component - allocate sufficient time
- Test extensively with mocks before integrating real agents
- Monitor LLM latency - it dominates total debate time
- Consider parallel agent calls for opening statements (Pro/Con don't depend on each other)
- Add circuit breaker for repeated agent failures
- Cache agent responses for replay mode
- Consider adding progress callbacks for UI updates

---

**Estimated Time:** 16-20 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
