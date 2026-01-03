/**
 * Chair Interruption Engine Tests
 *
 * Tests for the ChairInterruptionEngine that manages chair-to-chair
 * interruptions during Duelogic debates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChairInterruptionEngine,
  createChairInterruptionEngine,
  createTestInterruptionEngine,
  type InterruptEvaluationContext,
} from '../src/services/debate/chair-interruption-engine.js';
import type {
  DuelogicChair,
  DuelogicConfig,
  ChairInterruptCandidate,
  ChairInterruptReason,
} from '../src/types/duelogic.js';
import { DUELOGIC_DEFAULTS } from '../src/types/duelogic.js';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the LLM client
const mockChat = vi.fn();
vi.mock('../src/services/llm/openrouter-adapter.js', () => ({
  createOpenRouterClient: () => ({
    chat: mockChat,
  }),
}));

// Mock the database repository
const mockSaveInterruption = vi.fn().mockResolvedValue(1);
const mockGetInterruptions = vi.fn().mockResolvedValue([]);
const mockGetCountsByReason = vi.fn().mockResolvedValue(new Map());
const mockGetCountsByChair = vi.fn().mockResolvedValue({ made: new Map(), received: new Map() });
vi.mock('../src/db/repositories/duelogic-repository.js', () => ({
  saveChairInterruption: (...args: any[]) => mockSaveInterruption(...args),
  getInterruptionsByDebate: (...args: any[]) => mockGetInterruptions(...args),
  getInterruptionCountsByReason: (...args: any[]) => mockGetCountsByReason(...args),
  getInterruptionCountsByChair: (...args: any[]) => mockGetCountsByChair(...args),
}));

// Mock the response evaluator
vi.mock('../src/services/debate/response-evaluator.js', () => ({
  quickSteelManCheck: (content: string) => {
    return /appreciate|understand|valid|merit|point/i.test(content);
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

const utilChair: DuelogicChair = {
  position: 'chair_1',
  framework: 'utilitarian',
  modelId: 'anthropic/claude-3-sonnet',
  modelDisplayName: 'Utilitarian Chair',
};

const virtueChair: DuelogicChair = {
  position: 'chair_2',
  framework: 'virtue_ethics',
  modelId: 'anthropic/claude-3-sonnet',
  modelDisplayName: 'Virtue Ethics Chair',
};

const deontChair: DuelogicChair = {
  position: 'chair_3',
  framework: 'deontological',
  modelId: 'anthropic/claude-3-sonnet',
  modelDisplayName: 'Deontological Chair',
};

const baseConfig: DuelogicConfig = {
  ...DUELOGIC_DEFAULTS,
  chairs: [utilChair, virtueChair],
  interruptions: {
    enabled: true,
    allowChairInterruptions: true,
    allowArbiterInterruptions: true,
    aggressiveness: 3,
    cooldownSeconds: 60,
  },
};

// Sample content that should trigger interrupts
const strawManContent = `
Virtue ethics people just want to feel good about themselves.
They don't care about actual outcomes or consequences.
`;

const factualErrorContent = `
Utilitarians don't care about individual rights at all.
They would sacrifice anyone for the greater good without hesitation.
`;

const pivotalPointContent = `
The fundamental issue is whether we should prioritize outcomes
over character. This is exactly the crux of our disagreement.
`;

const normalContent = `
I think we should consider multiple perspectives here.
From my utilitarian framework, the key question is about
maximizing overall welfare while being mindful of distribution.
`;

// ============================================================================
// Quick Heuristic Tests
// ============================================================================

describe('ChairInterruptionEngine', () => {
  let engine: ChairInterruptionEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = createTestInterruptionEngine(baseConfig, 'test-debate-123');
  });

  afterEach(() => {
    engine.resetCooldowns();
    engine.resetCounts();
  });

  describe('quickInterruptCheck', () => {
    it('detects straw-man patterns', () => {
      const result = engine.quickInterruptCheck('They just want to ignore consequences!');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('straw_man_detected');
    });

    it('detects "only want" straw-man pattern', () => {
      const result = engine.quickInterruptCheck('They only want to feel good about themselves');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('straw_man_detected');
    });

    it('detects factual error patterns about utilitarianism', () => {
      const result = engine.quickInterruptCheck("Utilitarians never care about justice");
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('factual_correction');
    });

    it('detects factual error patterns about virtue ethics', () => {
      const result = engine.quickInterruptCheck('Virtue ethics ignores consequences entirely');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('factual_correction');
    });

    it('detects pivotal point patterns', () => {
      const result = engine.quickInterruptCheck('The fundamental issue is whether rights are absolute.');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('pivotal_point');
    });

    it('detects "core disagreement" pattern', () => {
      const result = engine.quickInterruptCheck('The core problem is that we disagree on values');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('pivotal_point');
    });

    it('detects direct challenge patterns', () => {
      const result = engine.quickInterruptCheck('This is obviously wrong and no reasonable person would believe it');
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('direct_challenge');
    });

    it('detects strong agreement patterns', () => {
      const result = engine.quickInterruptCheck("You've hit on something crucial here");
      expect(result.potentialTrigger).toBe(true);
      expect(result.likelyReason).toBe('strong_agreement');
    });

    it('returns false for neutral content', () => {
      const result = engine.quickInterruptCheck('I think we should consider multiple perspectives here.');
      expect(result.potentialTrigger).toBe(false);
    });

    it('returns false for content with good steel-manning', () => {
      const result = engine.quickInterruptCheck('I appreciate the utilitarian point about welfare maximization, but I disagree');
      expect(result.potentialTrigger).toBe(false);
    });

    it('includes confidence score for matches', () => {
      const result = engine.quickInterruptCheck('They just want to win the argument!');
      expect(result.potentialTrigger).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('cooldown management', () => {
    it('allows first interrupt for a chair', () => {
      expect(engine.canInterrupt('chair_1')).toBe(true);
    });

    it('blocks interrupt during cooldown period', async () => {
      // Manually trigger an interrupt to start cooldown
      await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'direct_challenge',
        'Test trigger'
      );

      // Chair should now be on cooldown
      expect(engine.canInterrupt('chair_1')).toBe(false);
    });

    it('allows other chairs to interrupt when one is on cooldown', async () => {
      await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'direct_challenge',
        'Test trigger'
      );

      expect(engine.canInterrupt('chair_1')).toBe(false);
      expect(engine.canInterrupt('chair_2')).toBe(true);
    });

    it('resets cooldowns correctly', async () => {
      await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'direct_challenge',
        'Test trigger'
      );

      expect(engine.canInterrupt('chair_1')).toBe(false);

      engine.resetCooldowns();

      expect(engine.canInterrupt('chair_1')).toBe(true);
    });

    it('reports remaining cooldown time', async () => {
      // Initially no cooldown
      expect(engine.getCooldownRemaining('chair_1')).toBe(0);

      await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'direct_challenge',
        'Test trigger'
      );

      // Should have cooldown remaining (close to config value)
      const remaining = engine.getCooldownRemaining('chair_1');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(baseConfig.interruptions.cooldownSeconds);
    });
  });

  describe('urgency threshold', () => {
    it('returns correct threshold for aggressiveness level 1', () => {
      const conservativeEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          interruptions: { ...baseConfig.interruptions, aggressiveness: 1 },
        },
        'test-debate'
      );

      expect(conservativeEngine.getUrgencyThreshold()).toBe(0.9);
    });

    it('returns correct threshold for aggressiveness level 3', () => {
      expect(engine.getUrgencyThreshold()).toBe(0.7);
    });

    it('returns correct threshold for aggressiveness level 5', () => {
      const aggressiveEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          interruptions: { ...baseConfig.interruptions, aggressiveness: 5 },
        },
        'test-debate'
      );

      expect(aggressiveEngine.getUrgencyThreshold()).toBe(0.5);
    });
  });

  describe('evaluateInterrupt', () => {
    const baseContext: InterruptEvaluationContext = {
      currentSpeaker: utilChair,
      otherChairs: [virtueChair],
      recentContent: strawManContent,
      debateSoFar: 'Previous debate context...',
      topic: 'AI Ethics',
    };

    beforeEach(() => {
      // Default mock response for interrupt evaluation
      mockChat.mockResolvedValue(
        JSON.stringify({
          shouldInterrupt: true,
          interruptingChairPosition: 'chair_2',
          reason: 'straw_man_detected',
          triggerContent: "just want to feel good about themselves",
          urgency: 0.85,
          suggestedOpener: "Hold on, that's not my position—",
        })
      );
    });

    it('returns null when interruptions are disabled', async () => {
      const disabledEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          interruptions: { ...baseConfig.interruptions, enabled: false },
        },
        'test-debate'
      );

      const result = await disabledEngine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('returns null when chair interruptions are disabled', async () => {
      const disabledEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          interruptions: { ...baseConfig.interruptions, allowChairInterruptions: false },
        },
        'test-debate'
      );

      const result = await disabledEngine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('returns null when all chairs are on cooldown', async () => {
      // Put the only other chair on cooldown
      await engine.triggerManualInterrupt(
        virtueChair,
        utilChair,
        'direct_challenge',
        'Test'
      );

      const result = await engine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('returns interrupt candidate for straw-man content', async () => {
      const result = await engine.evaluateInterrupt(baseContext);

      expect(result).not.toBeNull();
      expect(result!.triggerReason).toBe('straw_man_detected');
      expect(result!.interruptingChair.position).toBe('chair_2');
      expect(result!.interruptedChair.position).toBe('chair_1');
    });

    it('returns null when urgency is below threshold', async () => {
      mockChat.mockResolvedValue(
        JSON.stringify({
          shouldInterrupt: true,
          interruptingChairPosition: 'chair_2',
          reason: 'clarification_needed',
          triggerContent: 'some phrase',
          urgency: 0.3, // Below threshold of 0.7 for aggressiveness 3
          suggestedOpener: 'What do you mean?',
        })
      );

      const result = await engine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('returns null when LLM says no interrupt', async () => {
      mockChat.mockResolvedValue(
        JSON.stringify({
          shouldInterrupt: false,
          interruptingChairPosition: null,
          urgency: 0,
        })
      );

      const result = await engine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('handles LLM errors gracefully', async () => {
      mockChat.mockRejectedValue(new Error('LLM API error'));

      const result = await engine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('handles malformed LLM response gracefully', async () => {
      mockChat.mockResolvedValue('not valid json');

      const result = await engine.evaluateInterrupt(baseContext);
      expect(result).toBeNull();
    });

    it('includes suggested opener in result', async () => {
      const result = await engine.evaluateInterrupt(baseContext);

      expect(result).not.toBeNull();
      expect(result!.suggestedOpener).toBeDefined();
      expect(result!.suggestedOpener!.length).toBeGreaterThan(0);
    });

    it('records interrupt after successful evaluation', async () => {
      const enabledEngine = createChairInterruptionEngine(baseConfig, 'test-debate');

      await enabledEngine.evaluateInterrupt(baseContext);

      // Chair should now be on cooldown
      expect(enabledEngine.canInterrupt('chair_2')).toBe(false);
    });

    it('skips LLM call for normal content with low aggressiveness', async () => {
      const conservativeEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          interruptions: { ...baseConfig.interruptions, aggressiveness: 2 },
        },
        'test-debate'
      );

      const normalContext = {
        ...baseContext,
        recentContent: normalContent,
      };

      await conservativeEngine.evaluateInterrupt(normalContext);

      // Should not call LLM for content that doesn't match heuristics
      // with low aggressiveness
      expect(mockChat).not.toHaveBeenCalled();
    });
  });

  describe('triggerManualInterrupt', () => {
    it('creates interrupt candidate with high urgency', async () => {
      const result = await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'direct_challenge',
        'Test trigger content'
      );

      expect(result.urgency).toBe(1.0);
      expect(result.interruptingChair).toBe(utilChair);
      expect(result.interruptedChair).toBe(virtueChair);
      expect(result.triggerReason).toBe('direct_challenge');
      expect(result.triggerContent).toBe('Test trigger content');
    });

    it('includes random opener for the reason', async () => {
      const result = await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'straw_man_detected',
        'Test'
      );

      expect(result.suggestedOpener).toBeDefined();
      expect(result.suggestedOpener!.length).toBeGreaterThan(0);
    });

    it('starts cooldown for interrupting chair', async () => {
      await engine.triggerManualInterrupt(
        utilChair,
        virtueChair,
        'direct_challenge',
        'Test'
      );

      expect(engine.canInterrupt('chair_1')).toBe(false);
    });
  });

  describe('getInterruptStats', () => {
    it('returns empty stats for new debate', async () => {
      const stats = await engine.getInterruptStats();

      expect(stats.totalInterrupts).toBe(0);
      expect(stats.byChair.size).toBe(0);
      expect(stats.byReason.size).toBe(0);
    });

    it('aggregates stats from database', async () => {
      mockGetInterruptions.mockResolvedValue([
        { interruptingChair: 'chair_1', triggerReason: 'straw_man_detected' },
        { interruptingChair: 'chair_1', triggerReason: 'direct_challenge' },
        { interruptingChair: 'chair_2', triggerReason: 'straw_man_detected' },
      ]);

      const stats = await engine.getInterruptStats();

      expect(stats.totalInterrupts).toBe(3);
      expect(stats.byChair.get('chair_1')).toBe(2);
      expect(stats.byChair.get('chair_2')).toBe(1);
      expect(stats.byReason.get('straw_man_detected')).toBe(2);
      expect(stats.byReason.get('direct_challenge')).toBe(1);
    });
  });

  describe('different interrupt reasons', () => {
    const testCases: Array<{ reason: ChairInterruptReason; content: string }> = [
      { reason: 'factual_correction', content: factualErrorContent },
      { reason: 'straw_man_detected', content: strawManContent },
      { reason: 'pivotal_point', content: pivotalPointContent },
    ];

    it.each(testCases)('evaluates $reason correctly', async ({ reason, content }) => {
      mockChat.mockResolvedValue(
        JSON.stringify({
          shouldInterrupt: true,
          interruptingChairPosition: 'chair_2',
          reason,
          triggerContent: 'relevant phrase',
          urgency: 0.85,
        })
      );

      const context: InterruptEvaluationContext = {
        currentSpeaker: utilChair,
        otherChairs: [virtueChair],
        recentContent: content,
        debateSoFar: '',
        topic: 'Test topic',
      };

      const result = await engine.evaluateInterrupt(context);

      expect(result).not.toBeNull();
      expect(result!.triggerReason).toBe(reason);
    });
  });

  describe('multi-chair scenarios', () => {
    it('evaluates with multiple potential interrupters', async () => {
      const multiChairEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          chairs: [utilChair, virtueChair, deontChair],
        },
        'test-debate'
      );

      mockChat.mockResolvedValue(
        JSON.stringify({
          shouldInterrupt: true,
          interruptingChairPosition: 'chair_3', // Deontological chair
          reason: 'factual_correction',
          triggerContent: 'test',
          urgency: 0.9,
        })
      );

      const context: InterruptEvaluationContext = {
        currentSpeaker: utilChair,
        otherChairs: [virtueChair, deontChair],
        recentContent: 'Test content',
        debateSoFar: '',
        topic: 'Test',
      };

      const result = await multiChairEngine.evaluateInterrupt(context);

      expect(result).not.toBeNull();
      expect(result!.interruptingChair.position).toBe('chair_3');
      expect(result!.interruptingChair.framework).toBe('deontological');
    });

    it('excludes chairs on cooldown from evaluation', async () => {
      const multiChairEngine = createTestInterruptionEngine(
        {
          ...baseConfig,
          chairs: [utilChair, virtueChair, deontChair],
        },
        'test-debate'
      );

      // Put virtue chair on cooldown
      await multiChairEngine.triggerManualInterrupt(
        virtueChair,
        utilChair,
        'direct_challenge',
        'Test'
      );

      mockChat.mockResolvedValue(
        JSON.stringify({
          shouldInterrupt: true,
          interruptingChairPosition: 'chair_2', // Virtue chair (on cooldown!)
          reason: 'direct_challenge',
          triggerContent: 'test',
          urgency: 0.9,
        })
      );

      const context: InterruptEvaluationContext = {
        currentSpeaker: utilChair,
        otherChairs: [virtueChair, deontChair],
        recentContent: 'Test content',
        debateSoFar: '',
        topic: 'Test',
      };

      const result = await multiChairEngine.evaluateInterrupt(context);

      // Should be null because LLM suggested chair on cooldown
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createChairInterruptionEngine', () => {
  it('creates engine with persistence enabled', () => {
    const engine = createChairInterruptionEngine(baseConfig, 'test-debate-123');
    expect(engine).toBeDefined();
  });
});

describe('createTestInterruptionEngine', () => {
  it('creates engine with persistence disabled', () => {
    const engine = createTestInterruptionEngine(baseConfig, 'test-debate-123');
    expect(engine).toBeDefined();
  });
});
