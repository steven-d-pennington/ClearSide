/**
 * Tests for DuelogicOrchestrator
 *
 * Validates the main debate coordination engine including:
 * - 4-segment debate flow
 * - Pause/resume/stop controls
 * - Chair agent coordination
 * - Interruption handling
 * - Response evaluation integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DuelogicOrchestrator,
  createDuelogicOrchestrator,
  type DuelogicOrchestratorOptions,
} from '../src/services/debate/duelogic-orchestrator.js';
import type { DuelogicConfig, DuelogicChair } from '../src/types/duelogic.js';

// Mock all dependencies
vi.mock('../src/services/agents/arbiter-agent.js', () => ({
  createArbiterAgent: vi.fn(() => ({
    generateIntroduction: vi.fn().mockResolvedValue('Welcome to this philosophical debate...'),
    generateClosing: vi.fn().mockResolvedValue('In conclusion, we have explored...'),
    generateInterjection: vi.fn().mockResolvedValue('Let me interject here...'),
  })),
}));

vi.mock('../src/services/agents/chair-agent.js', () => ({
  createChairAgents: vi.fn(() => {
    const map = new Map();
    map.set('utilitarian', {
      generateOpening: vi.fn().mockResolvedValue('From a utilitarian perspective...'),
      generateExchangeResponse: vi.fn().mockResolvedValue('I must steel-man my opponent...'),
      respondToChallenge: vi.fn().mockResolvedValue('Responding to the challenge...'),
      respondToInterruption: vi.fn().mockResolvedValue('Addressing the interruption...'),
    });
    map.set('deontological', {
      generateOpening: vi.fn().mockResolvedValue('From a duty-based perspective...'),
      generateExchangeResponse: vi.fn().mockResolvedValue('While I acknowledge the utilitarian view...'),
      respondToChallenge: vi.fn().mockResolvedValue('Responding to the deontological challenge...'),
      respondToInterruption: vi.fn().mockResolvedValue('Addressing from duty perspective...'),
    });
    return map;
  }),
  getAllChairAgents: vi.fn(() => []),
}));

vi.mock('../src/services/debate/response-evaluator.js', () => ({
  createResponseEvaluator: vi.fn(() => ({
    evaluate: vi.fn().mockResolvedValue({
      evaluation: {
        adherenceScore: 85,
        steelManning: { attempted: true, quality: 'good', examples: ['Acknowledged opponent view'] },
        selfCritique: { attempted: true, quality: 'good', examples: ['Noted limitation'] },
        frameworkConsistency: { maintained: true },
        reasoning: 'Good adherence to principles',
      },
      cached: false,
    }),
    evaluateAndPersist: vi.fn().mockResolvedValue(undefined),
    shouldInterject: vi.fn().mockReturnValue(false),
    determineViolationType: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('../src/services/debate/chair-interruption-engine.js', () => ({
  createChairInterruptionEngine: vi.fn(() => ({
    evaluateInterrupt: vi.fn().mockResolvedValue(null), // No interrupts by default
    checkCooldown: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('../src/db/repositories/duelogic-repository.js', () => ({
  saveAllChairAssignments: vi.fn().mockResolvedValue(undefined),
  saveDuelogicConfig: vi.fn().mockResolvedValue(undefined),
  getDuelogicDebateStats: vi.fn().mockResolvedValue({
    totalUtterances: 0,
    totalInterruptions: 0,
  }),
}));

vi.mock('../src/db/repositories/utterance-repository.js', () => ({
  createUtterance: vi.fn().mockResolvedValue({ id: 'utt-123' }),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSSEManager() {
  return {
    broadcastToDebate: vi.fn(),
    broadcast: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
  };
}

function createTestChairs(): DuelogicChair[] {
  return [
    {
      position: 'utilitarian',
      framework: 'utilitarian',
      modelId: 'claude-3-sonnet',
      modelDisplayName: 'Claude',
      temperatureOverride: 0.8,
    },
    {
      position: 'deontological',
      framework: 'deontological',
      modelId: 'gpt-4',
      modelDisplayName: 'GPT-4',
    },
  ];
}

function createTestConfig(): Partial<DuelogicConfig> {
  return {
    chairs: createTestChairs(),
    flow: {
      maxExchanges: 2, // Keep short for tests
      autoAdvance: true,
    },
    podcastMode: {
      enabled: true,
      includeIntro: true,
      includeOutro: true,
    },
    interruptions: {
      enabled: false, // Disable by default for simpler tests
      allowChairInterruptions: false,
    },
    mandates: {
      steelManningRequired: true,
      selfCritiqueRequired: true,
      arbiterCanInterject: false, // Disable for simpler tests
    },
    arbiter: {
      accountabilityLevel: 'moderate',
      interventionThreshold: 60,
    },
    tone: 'academic',
  };
}

function createTestOptions(overrides?: Partial<DuelogicOrchestratorOptions>): DuelogicOrchestratorOptions {
  return {
    debateId: 'test-debate-123',
    proposition: 'Should AI systems be given legal personhood?',
    propositionContext: 'Context about AI development and legal frameworks',
    config: createTestConfig(),
    sseManager: createMockSSEManager() as any,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('DuelogicOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with valid options', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      expect(orchestrator).toBeInstanceOf(DuelogicOrchestrator);
    });

    it('should initialize with not running state', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isPaused).toBe(false);
    });

    it('should initialize with introduction segment', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      const status = orchestrator.getStatus();
      expect(status.currentSegment).toBe('introduction');
      expect(status.exchangeNumber).toBe(0);
    });
  });

  describe('start()', () => {
    it('should execute full debate flow', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false); // Should complete
      expect(status.utteranceCount).toBeGreaterThan(0);
    });

    it('should broadcast debate_started event', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      expect(sseManager.broadcastToDebate).toHaveBeenCalledWith(
        'test-debate-123',
        'duelogic_debate_started',
        expect.objectContaining({
          debateId: 'test-debate-123',
          proposition: 'Should AI systems be given legal personhood?',
        })
      );
    });

    it('should broadcast segment events', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      // Should have segment_start for each segment
      const segmentStartCalls = sseManager.broadcastToDebate.mock.calls.filter(
        (call: any[]) => call[1] === 'segment_start'
      );
      expect(segmentStartCalls.length).toBe(4); // intro, opening, exchange, synthesis

      // Should have segment_complete for each segment
      const segmentCompleteCalls = sseManager.broadcastToDebate.mock.calls.filter(
        (call: any[]) => call[1] === 'segment_complete'
      );
      expect(segmentCompleteCalls.length).toBe(4);
    });

    it('should broadcast debate_complete with stats', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      expect(sseManager.broadcastToDebate).toHaveBeenCalledWith(
        'test-debate-123',
        'debate_complete',
        expect.objectContaining({
          debateId: 'test-debate-123',
          stats: expect.objectContaining({
            utteranceCount: expect.any(Number),
            durationMs: expect.any(Number),
          }),
        })
      );
    });

    it('should throw if already running', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      // Start first debate
      const firstStart = orchestrator.start();

      // Try to start again immediately
      await expect(orchestrator.start()).rejects.toThrow('Debate is already running');

      await firstStart;
    });

    it('should generate opening statements for each chair', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const transcript = orchestrator.getTranscript();
      const openings = transcript.filter((u) => u.segment === 'opening');

      // Should have one opening per chair
      expect(openings.length).toBe(2);
      expect(openings.some((o) => o.speaker === 'utilitarian')).toBe(true);
      expect(openings.some((o) => o.speaker === 'deontological')).toBe(true);
    });

    it('should execute configured number of exchanges', async () => {
      const options = createTestOptions();
      options.config.flow = { maxExchanges: 2, autoAdvance: true };
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const status = orchestrator.getStatus();
      expect(status.exchangeNumber).toBe(2);
    });
  });

  describe('pause() and resume()', () => {
    it('should pause running debate', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      // Start debate in background
      const debatePromise = orchestrator.start();

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      orchestrator.pause();

      const status = orchestrator.getStatus();
      expect(status.isPaused).toBe(true);

      // Resume so we can complete
      orchestrator.resume();
      await debatePromise;
    });

    it('should broadcast pause event', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
      const orchestrator = createDuelogicOrchestrator(options);

      const debatePromise = orchestrator.start();
      await new Promise((resolve) => setTimeout(resolve, 10));

      orchestrator.pause();

      expect(sseManager.broadcastToDebate).toHaveBeenCalledWith(
        'test-debate-123',
        'debate_paused',
        expect.objectContaining({
          debateId: 'test-debate-123',
        })
      );

      orchestrator.resume();
      await debatePromise;
    });

    it('should broadcast resume event', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
      const orchestrator = createDuelogicOrchestrator(options);

      const debatePromise = orchestrator.start();
      await new Promise((resolve) => setTimeout(resolve, 10));

      orchestrator.pause();
      orchestrator.resume();

      expect(sseManager.broadcastToDebate).toHaveBeenCalledWith(
        'test-debate-123',
        'debate_resumed',
        expect.objectContaining({
          debateId: 'test-debate-123',
        })
      );

      await debatePromise;
    });

    it('should not pause if not running', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      orchestrator.pause();

      const status = orchestrator.getStatus();
      expect(status.isPaused).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should stop running debate', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      const debatePromise = orchestrator.start();
      await new Promise((resolve) => setTimeout(resolve, 10));

      orchestrator.stop('User requested stop');

      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false);

      await debatePromise;
    });

    it('should broadcast stop event with reason', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
      const orchestrator = createDuelogicOrchestrator(options);

      const debatePromise = orchestrator.start();
      await new Promise((resolve) => setTimeout(resolve, 10));

      orchestrator.stop('Testing stop feature');

      expect(sseManager.broadcastToDebate).toHaveBeenCalledWith(
        'test-debate-123',
        'debate_stopped',
        expect.objectContaining({
          debateId: 'test-debate-123',
          reason: 'Testing stop feature',
        })
      );

      await debatePromise;
    });
  });

  describe('getStatus()', () => {
    it('should return correct initial status', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      const status = orchestrator.getStatus();

      expect(status).toEqual({
        isRunning: false,
        isPaused: false,
        currentSegment: 'introduction',
        utteranceCount: 0,
        exchangeNumber: 0,
        elapsedMs: 0,
      });
    });

    it('should track utterance count during debate', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const status = orchestrator.getStatus();
      expect(status.utteranceCount).toBeGreaterThan(0);
    });

    it('should track elapsed time', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const status = orchestrator.getStatus();
      expect(status.elapsedMs).toBeGreaterThan(0);
    });
  });

  describe('getTranscript()', () => {
    it('should return empty array initially', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      const transcript = orchestrator.getTranscript();
      expect(transcript).toEqual([]);
    });

    it('should return all utterances after debate', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const transcript = orchestrator.getTranscript();

      // Should have intro, openings, exchanges, and synthesis
      expect(transcript.length).toBeGreaterThan(0);

      // Verify structure
      transcript.forEach((utterance) => {
        expect(utterance).toHaveProperty('speaker');
        expect(utterance).toHaveProperty('segment');
        expect(utterance).toHaveProperty('content');
        expect(utterance).toHaveProperty('timestampMs');
      });
    });

    it('should return a copy of transcript', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const transcript1 = orchestrator.getTranscript();
      const transcript2 = orchestrator.getTranscript();

      expect(transcript1).not.toBe(transcript2);
      expect(transcript1).toEqual(transcript2);
    });
  });

  describe('podcast mode', () => {
    it('should include arbiter intro when podcast mode enabled', async () => {
      const options = createTestOptions();
      options.config.podcastMode = {
        enabled: true,
        includeIntro: true,
        includeOutro: true,
      };
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const transcript = orchestrator.getTranscript();
      const introUtterances = transcript.filter(
        (u) => u.segment === 'introduction' && u.speaker === 'arbiter'
      );

      expect(introUtterances.length).toBe(1);
      expect(introUtterances[0].content).toContain('Welcome');
    });

    it('should skip intro when podcast mode disabled', async () => {
      const options = createTestOptions();
      options.config.podcastMode = {
        enabled: false,
        includeIntro: false,
        includeOutro: false,
      };
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const transcript = orchestrator.getTranscript();
      const introUtterances = transcript.filter(
        (u) => u.segment === 'introduction' && u.speaker === 'arbiter'
      );

      expect(introUtterances.length).toBe(0);
    });

    it('should include arbiter closing in synthesis', async () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const transcript = orchestrator.getTranscript();
      const synthUtterances = transcript.filter(
        (u) => u.segment === 'synthesis' && u.speaker === 'arbiter'
      );

      expect(synthUtterances.length).toBe(1);
      expect(synthUtterances[0].content).toContain('conclusion');
    });
  });

  describe('error handling', () => {
    it('should broadcast error event on failure', async () => {
      const options = createTestOptions();
      const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;

      // Mock arbiter to throw
      const { createArbiterAgent } = await import('../src/services/agents/arbiter-agent.js');
      (createArbiterAgent as any).mockReturnValueOnce({
        generateIntroduction: vi.fn().mockRejectedValue(new Error('LLM API error')),
        generateClosing: vi.fn().mockResolvedValue('Closing...'),
        generateInterjection: vi.fn().mockResolvedValue('Interjection...'),
      });

      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      expect(sseManager.broadcastToDebate).toHaveBeenCalledWith(
        'test-debate-123',
        'error',
        expect.objectContaining({
          message: 'LLM API error',
        })
      );
    });

    it('should set isRunning to false after error', async () => {
      const options = createTestOptions();

      // Mock to throw
      const { createArbiterAgent } = await import('../src/services/agents/arbiter-agent.js');
      (createArbiterAgent as any).mockReturnValueOnce({
        generateIntroduction: vi.fn().mockRejectedValue(new Error('Test error')),
        generateClosing: vi.fn().mockResolvedValue('Closing...'),
        generateInterjection: vi.fn().mockResolvedValue('Interjection...'),
      });

      const orchestrator = createDuelogicOrchestrator(options);

      await orchestrator.start();

      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('factory function', () => {
    it('should create orchestrator via factory', () => {
      const options = createTestOptions();
      const orchestrator = createDuelogicOrchestrator(options);

      expect(orchestrator).toBeInstanceOf(DuelogicOrchestrator);
    });
  });
});

describe('DuelogicOrchestrator with interruptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle chair interruptions when enabled', async () => {
    // Enable interruptions and mock an interrupt
    const { createChairInterruptionEngine } = await import(
      '../src/services/debate/chair-interruption-engine.js'
    );
    (createChairInterruptionEngine as any).mockReturnValue({
      evaluateInterrupt: vi.fn().mockResolvedValue({
        interruptingChair: {
          position: 'deontological',
          framework: 'deontological',
          modelId: 'gpt-4',
        },
        triggerReason: 'straw_man_detected',
        triggerContent: 'Some misrepresented content',
        suggestedOpener: 'I must respectfully interject...',
        urgency: 0.8,
      }),
      checkCooldown: vi.fn().mockReturnValue(false),
    });

    const options = createTestOptions();
    options.config.interruptions = {
      enabled: true,
      allowChairInterruptions: true,
      aggressiveness: 'assertive',
      cooldownSeconds: 30,
    };
    const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
    const orchestrator = createDuelogicOrchestrator(options);

    await orchestrator.start();

    // Should have broadcast chair_interrupt event
    const interruptCalls = sseManager.broadcastToDebate.mock.calls.filter(
      (call: any[]) => call[1] === 'chair_interrupt'
    );
    expect(interruptCalls.length).toBeGreaterThan(0);
  });
});

describe('DuelogicOrchestrator with arbiter interjections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should trigger arbiter interjection on principle violation', async () => {
    // Mock evaluator to return low adherence and trigger interjection
    const { createResponseEvaluator } = await import(
      '../src/services/debate/response-evaluator.js'
    );
    (createResponseEvaluator as any).mockReturnValue({
      evaluate: vi.fn().mockResolvedValue({
        evaluation: {
          adherenceScore: 40, // Low score
          steelManning: { attempted: false, quality: 'poor', examples: [] },
          selfCritique: { attempted: false, quality: 'poor', examples: [] },
          frameworkConsistency: { maintained: false },
          reasoning: 'Failed to steel-man',
        },
        cached: false,
      }),
      evaluateAndPersist: vi.fn().mockResolvedValue(undefined),
      shouldInterject: vi.fn().mockReturnValue(true), // Trigger interjection
      determineViolationType: vi.fn().mockReturnValue('steel_man_violation'),
    });

    const options = createTestOptions();
    options.config.mandates = {
      steelManningRequired: true,
      selfCritiqueRequired: true,
      arbiterCanInterject: true,
    };
    const sseManager = options.sseManager as ReturnType<typeof createMockSSEManager>;
    const orchestrator = createDuelogicOrchestrator(options);

    await orchestrator.start();

    // Should have broadcast arbiter_interjection event
    const interjectionCalls = sseManager.broadcastToDebate.mock.calls.filter(
      (call: any[]) => call[1] === 'arbiter_interjection'
    );
    expect(interjectionCalls.length).toBeGreaterThan(0);
  });
});
