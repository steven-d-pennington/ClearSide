/**
 * Response Evaluator Tests
 *
 * Tests for the ResponseEvaluator service that evaluates
 * chair responses for Duelogic adherence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ResponseEvaluator,
  createResponseEvaluator,
  createQuickEvaluator,
  quickSteelManCheck,
  quickSelfCritiqueCheck,
  getDefaultEvaluation,
  type EvaluationContext,
} from '../src/services/debate/response-evaluator.js';
import type { DuelogicChair, DuelogicConfig, ResponseEvaluation } from '../src/types/duelogic.js';

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
const mockSaveEvaluation = vi.fn().mockResolvedValue(1);
const mockGetEvaluationsForDebate = vi.fn().mockResolvedValue([]);
const mockGetEvaluationsByChair = vi.fn().mockResolvedValue(new Map());
vi.mock('../src/db/repositories/duelogic-repository.js', () => ({
  saveResponseEvaluation: (...args: any[]) => mockSaveEvaluation(...args),
  getEvaluationByUtteranceId: vi.fn().mockResolvedValue(null),
  getEvaluationsForDebate: (...args: any[]) => mockGetEvaluationsForDebate(...args),
  getEvaluationsByChair: (...args: any[]) => mockGetEvaluationsByChair(...args),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

const virtueChair: DuelogicChair = {
  position: 'chair_1',
  framework: 'virtue_ethics',
  modelId: 'anthropic/claude-3-sonnet',
  modelDisplayName: 'Virtue Ethics Chair',
};

const utilChair: DuelogicChair = {
  position: 'chair_2',
  framework: 'utilitarian',
  modelId: 'anthropic/claude-3-sonnet',
  modelDisplayName: 'Utilitarian Chair',
};

const deontChair: DuelogicChair = {
  position: 'chair_3',
  framework: 'deontological',
  modelId: 'anthropic/claude-3-sonnet',
  modelDisplayName: 'Deontological Chair',
};

const mockConfig: DuelogicConfig = {
  chairs: [virtueChair, utilChair],
  mandates: {
    steelManningRequired: true,
    selfCritiqueRequired: true,
    chairsCanInterrupt: true,
    arbiterCanInterject: true,
  },
  arbiter: {
    modelId: 'anthropic/claude-3-haiku',
    accountabilityLevel: 'moderate',
  },
  podcastMode: {
    enabled: false,
    showName: 'Test Show',
  },
};

// Sample response with strong steel-manning
const strongSteelManResponse = `I appreciate the force of the Utilitarian argument here.
What they're really saying is that aggregate welfare matters, and we
should be willing to make individual sacrifices for the greater good.
That's a compelling position. However, from my Virtue Ethics perspective,
I must note that this utilitarian calculation overlooks the importance of
cultivating character virtues. I'll admit that Virtue Ethics struggles when
dealing with novel situations where no established virtue applies.`;

// Sample response with weak/absent steel-manning
const noSteelManResponse = `The Utilitarian view is fundamentally wrong because it treats people
as mere numbers. They just want to add up happiness without caring
about individual rights or human dignity. This cold calculation is
morally bankrupt.`;

// Sample response with self-critique
const withSelfCritiqueResponse = `From the Virtue Ethics perspective, we need to consider character.
I must acknowledge, however, that my framework struggles with providing
clear guidance in novel technological dilemmas where traditional virtues
may not obviously apply. Critics would say we lack the ability to give
precise action guidance in edge cases.`;

// Sample response without self-critique
const noSelfCritiqueResponse = `Virtue Ethics is clearly the superior framework because it focuses
on developing moral character. There are no weaknesses in this approach
and anyone who says otherwise simply doesn't understand true ethics.`;

// ============================================================================
// Heuristic Function Tests
// ============================================================================

describe('quickSteelManCheck', () => {
  it('detects "I appreciate" patterns', () => {
    expect(quickSteelManCheck('I appreciate the point you are making')).toBe(true);
    expect(quickSteelManCheck('I appreciate your argument')).toBe(true);
  });

  it('detects "makes a good point" patterns', () => {
    expect(quickSteelManCheck('the utilitarian makes a good point about welfare')).toBe(true);
    expect(quickSteelManCheck('they make a compelling argument')).toBe(true);
  });

  it('detects "from their perspective" patterns', () => {
    expect(quickSteelManCheck('From their perspective, this makes sense')).toBe(true);
    expect(quickSteelManCheck('from the utilitarian perspective')).toBe(true);
  });

  it('detects agreement patterns', () => {
    expect(quickSteelManCheck("They're right that consequences matter")).toBe(true);
    expect(quickSteelManCheck('I concede that point')).toBe(true);
    expect(quickSteelManCheck("There's merit in their view")).toBe(true);
  });

  it('detects "strongest case" patterns', () => {
    expect(quickSteelManCheck('The strongest case for utilitarianism is')).toBe(true);
    expect(quickSteelManCheck('The best argument for their position')).toBe(true);
  });

  it('returns false for aggressive dismissals', () => {
    expect(quickSteelManCheck('They are completely wrong')).toBe(false);
    expect(quickSteelManCheck('This is a terrible argument')).toBe(false);
    expect(quickSteelManCheck('The opposition has no valid points')).toBe(false);
  });
});

describe('quickSelfCritiqueCheck', () => {
  it('detects "my framework struggles" patterns', () => {
    expect(quickSelfCritiqueCheck('My framework struggles with edge cases')).toBe(true);
    expect(quickSelfCritiqueCheck('My approach has difficulty with novel situations')).toBe(true);
  });

  it('detects "I admit/acknowledge" patterns', () => {
    expect(quickSelfCritiqueCheck("I'll admit this is a weakness")).toBe(true);
    expect(quickSelfCritiqueCheck('I must acknowledge the limitation')).toBe(true);
  });

  it('detects "limitation/weakness" patterns', () => {
    expect(quickSelfCritiqueCheck('A limitation of my framework is')).toBe(true);
    expect(quickSelfCritiqueCheck('This is a blind spot of this approach')).toBe(true);
  });

  it('detects "critics" patterns', () => {
    expect(quickSelfCritiqueCheck('Critics of virtue ethics would say')).toBe(true);
    expect(quickSelfCritiqueCheck('Critics might argue that')).toBe(true);
  });

  it('returns false for defensive responses', () => {
    expect(quickSelfCritiqueCheck('My framework is superior')).toBe(false);
    expect(quickSelfCritiqueCheck('There are no weaknesses')).toBe(false);
    expect(quickSelfCritiqueCheck('I am completely right')).toBe(false);
  });
});

describe('getDefaultEvaluation', () => {
  it('returns a valid default evaluation', () => {
    const defaultEval = getDefaultEvaluation();

    expect(defaultEval.adherenceScore).toBe(50);
    expect(defaultEval.steelManning.attempted).toBe(false);
    expect(defaultEval.steelManning.quality).toBe('absent');
    expect(defaultEval.selfCritique.attempted).toBe(false);
    expect(defaultEval.selfCritique.quality).toBe('absent');
    expect(defaultEval.frameworkConsistency.consistent).toBe(true);
    expect(defaultEval.intellectualHonesty.score).toBe('medium');
    expect(defaultEval.requiresInterjection).toBe(false);
  });
});

// ============================================================================
// ResponseEvaluator Class Tests
// ============================================================================

describe('ResponseEvaluator', () => {
  let evaluator: ResponseEvaluator;

  beforeEach(() => {
    vi.clearAllMocks();
    evaluator = new ResponseEvaluator({
      accountabilityLevel: 'moderate',
      enablePersistence: false, // Disable persistence for unit tests
    });
  });

  afterEach(() => {
    evaluator.clearCache();
  });

  describe('performQuickEvaluation', () => {
    it('detects strong steel-manning in responses', () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse,
        debateHistory: '',
        previousSpeaker: utilChair,
      };

      const result = evaluator.performQuickEvaluation(context);

      expect(result.steelManning.attempted).toBe(true);
      expect(result.steelManning.quality).toBe('adequate');
      expect(result.adherenceScore).toBeGreaterThanOrEqual(70);
    });

    it('detects absent steel-manning in responses', () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: noSteelManResponse,
        debateHistory: '',
        previousSpeaker: utilChair,
      };

      const result = evaluator.performQuickEvaluation(context);

      expect(result.steelManning.attempted).toBe(false);
      expect(result.steelManning.quality).toBe('absent');
    });

    it('detects self-critique in responses', () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: withSelfCritiqueResponse,
        debateHistory: '',
      };

      const result = evaluator.performQuickEvaluation(context);

      expect(result.selfCritique.attempted).toBe(true);
      expect(result.selfCritique.quality).toBe('adequate');
    });

    it('detects absent self-critique in responses', () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: noSelfCritiqueResponse,
        debateHistory: '',
      };

      const result = evaluator.performQuickEvaluation(context);

      expect(result.selfCritique.attempted).toBe(false);
      expect(result.selfCritique.quality).toBe('absent');
    });

    it('never triggers interjection in quick mode', () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: noSteelManResponse, // Worst possible response
        debateHistory: '',
        previousSpeaker: utilChair,
      };

      const result = evaluator.performQuickEvaluation(context);

      expect(result.requiresInterjection).toBe(false);
    });

    it('gives higher score for responses with both steel-manning and self-critique', () => {
      const goodContext: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse, // Has both
        debateHistory: '',
      };

      const badContext: EvaluationContext = {
        chair: virtueChair,
        responseContent: noSelfCritiqueResponse, // Has neither
        debateHistory: '',
      };

      const goodResult = evaluator.performQuickEvaluation(goodContext);
      const badResult = evaluator.performQuickEvaluation(badContext);

      expect(goodResult.adherenceScore).toBeGreaterThan(badResult.adherenceScore);
    });
  });

  describe('evaluate', () => {
    const mockLLMResponse = JSON.stringify({
      adherenceScore: 75,
      steelManning: { attempted: true, quality: 'strong', notes: 'Good attempt' },
      selfCritique: { attempted: true, quality: 'adequate', notes: 'Brief acknowledgment' },
      frameworkConsistency: { consistent: true, violations: [] },
      intellectualHonesty: { score: 'high', issues: [] },
      requiresInterjection: false,
      interjectionReason: null,
    });

    beforeEach(() => {
      mockChat.mockResolvedValue(mockLLMResponse);
    });

    it('returns cached result for repeated evaluations', async () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: 'Test response content for caching',
        debateHistory: '',
      };

      // First evaluation
      const result1 = await evaluator.evaluate(context);
      expect(result1.cached).toBe(false);

      // Second evaluation (should be cached)
      const result2 = await evaluator.evaluate(context);
      expect(result2.cached).toBe(true);
      expect(result2.method).toBe('cached');

      // LLM should only be called once
      expect(mockChat).toHaveBeenCalledTimes(1);
    });

    it('uses quick mode for relaxed accountability', async () => {
      const relaxedEvaluator = new ResponseEvaluator({
        accountabilityLevel: 'relaxed',
        enablePersistence: false,
      });

      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse,
        debateHistory: '',
      };

      const result = await relaxedEvaluator.evaluate(context);

      expect(result.method).toBe('quick');
      expect(mockChat).not.toHaveBeenCalled();
    });

    it('performs full LLM evaluation for moderate accountability', async () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse,
        debateHistory: '',
        previousSpeaker: utilChair,
        previousContent: 'Previous utilitarian argument',
      };

      const result = await evaluator.evaluate(context);

      expect(result.method).toBe('full');
      expect(result.evaluation.adherenceScore).toBe(75);
      expect(mockChat).toHaveBeenCalledTimes(1);
    });

    it('falls back to quick evaluation on LLM error', async () => {
      mockChat.mockRejectedValueOnce(new Error('LLM API error'));

      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse,
        debateHistory: '',
      };

      const result = await evaluator.evaluate(context);

      expect(result.method).toBe('quick');
      // Should not throw, should return a result
      expect(result.evaluation).toBeDefined();
    });

    it('parses LLM JSON response correctly', async () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: 'Test response',
        debateHistory: '',
      };

      const result = await evaluator.evaluate(context);

      expect(result.evaluation.adherenceScore).toBe(75);
      expect(result.evaluation.steelManning.quality).toBe('strong');
      expect(result.evaluation.selfCritique.quality).toBe('adequate');
      expect(result.evaluation.frameworkConsistency.consistent).toBe(true);
      expect(result.evaluation.intellectualHonesty.score).toBe('high');
    });

    it('handles malformed JSON in LLM response', async () => {
      mockChat.mockResolvedValueOnce('This is not JSON');

      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse,
        debateHistory: '',
      };

      const result = await evaluator.evaluate(context);

      // Should return default evaluation
      expect(result.evaluation.adherenceScore).toBe(50);
      expect(result.evaluation.steelManning.quality).toBe('absent');
    });
  });

  describe('batchEvaluate', () => {
    it('evaluates multiple contexts in parallel with concurrency limit', async () => {
      const contexts: EvaluationContext[] = [
        { chair: virtueChair, responseContent: 'Response 1', debateHistory: '' },
        { chair: utilChair, responseContent: 'Response 2', debateHistory: '' },
        { chair: deontChair, responseContent: 'Response 3', debateHistory: '' },
      ];

      const results = await evaluator.batchEvaluate(contexts, {
        useQuickMode: true,
        concurrency: 2,
      });

      expect(results.size).toBe(3);
      expect(results.has('chair_1')).toBe(true);
      expect(results.has('chair_2')).toBe(true);
      expect(results.has('chair_3')).toBe(true);
    });

    it('uses quick mode when specified', async () => {
      const contexts: EvaluationContext[] = [
        { chair: virtueChair, responseContent: strongSteelManResponse, debateHistory: '' },
      ];

      const results = await evaluator.batchEvaluate(contexts, { useQuickMode: true });

      const result = results.get('chair_1')!;
      expect(result.method).toBe('quick');
      expect(mockChat).not.toHaveBeenCalled();
    });
  });

  describe('shouldInterject', () => {
    it('returns false when arbiter interjections disabled', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 20,
        steelManning: { attempted: false, quality: 'absent' },
        selfCritique: { attempted: false, quality: 'absent' },
        frameworkConsistency: { consistent: false, violations: ['Major violation'] },
        intellectualHonesty: { score: 'low' },
        requiresInterjection: true,
      };

      expect(evaluator.shouldInterject(evaluation, false)).toBe(false);
    });

    it('returns false for relaxed accountability regardless of score', () => {
      const relaxedEvaluator = new ResponseEvaluator({
        accountabilityLevel: 'relaxed',
        enablePersistence: false,
      });

      const evaluation: ResponseEvaluation = {
        adherenceScore: 10,
        steelManning: { attempted: false, quality: 'absent' },
        selfCritique: { attempted: false, quality: 'absent' },
        frameworkConsistency: { consistent: false },
        intellectualHonesty: { score: 'low' },
        requiresInterjection: true,
      };

      expect(relaxedEvaluator.shouldInterject(evaluation, true)).toBe(false);
    });

    it('returns true for moderate when requiresInterjection and low score', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 30,
        steelManning: { attempted: false, quality: 'absent' },
        selfCritique: { attempted: false, quality: 'absent' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'medium' },
        requiresInterjection: true,
      };

      expect(evaluator.shouldInterject(evaluation, true)).toBe(true);
    });

    it('returns false for moderate when score is acceptable', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 60,
        steelManning: { attempted: true, quality: 'adequate' },
        selfCritique: { attempted: true, quality: 'adequate' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'medium' },
        requiresInterjection: false,
      };

      expect(evaluator.shouldInterject(evaluation, true)).toBe(false);
    });

    it('returns true for strict when score is below 60', () => {
      const strictEvaluator = new ResponseEvaluator({
        accountabilityLevel: 'strict',
        enablePersistence: false,
      });

      const evaluation: ResponseEvaluation = {
        adherenceScore: 55,
        steelManning: { attempted: true, quality: 'weak' },
        selfCritique: { attempted: true, quality: 'weak' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'medium' },
        requiresInterjection: false,
      };

      expect(strictEvaluator.shouldInterject(evaluation, true)).toBe(true);
    });
  });

  describe('determineViolationType', () => {
    it('returns straw_manning for absent steel-manning', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 40,
        steelManning: { attempted: false, quality: 'absent' },
        selfCritique: { attempted: true, quality: 'adequate' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'high' },
        requiresInterjection: true,
      };

      expect(evaluator.determineViolationType(evaluation)).toBe('straw_manning');
    });

    it('returns straw_manning for weak steel-manning', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 45,
        steelManning: { attempted: true, quality: 'weak' },
        selfCritique: { attempted: true, quality: 'adequate' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'high' },
        requiresInterjection: true,
      };

      expect(evaluator.determineViolationType(evaluation)).toBe('straw_manning');
    });

    it('returns missing_self_critique for absent self-critique', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 50,
        steelManning: { attempted: true, quality: 'strong' },
        selfCritique: { attempted: false, quality: 'absent' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'high' },
        requiresInterjection: true,
      };

      expect(evaluator.determineViolationType(evaluation)).toBe('missing_self_critique');
    });

    it('returns framework_inconsistency for violations', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 50,
        steelManning: { attempted: true, quality: 'strong' },
        selfCritique: { attempted: true, quality: 'adequate' },
        frameworkConsistency: { consistent: false, violations: ['Used utilitarian reasoning'] },
        intellectualHonesty: { score: 'high' },
        requiresInterjection: true,
      };

      expect(evaluator.determineViolationType(evaluation)).toBe('framework_inconsistency');
    });

    it('returns rhetorical_evasion for low intellectual honesty', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 50,
        steelManning: { attempted: true, quality: 'strong' },
        selfCritique: { attempted: true, quality: 'adequate' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'low', issues: ['Evaded direct question'] },
        requiresInterjection: true,
      };

      expect(evaluator.determineViolationType(evaluation)).toBe('rhetorical_evasion');
    });

    it('returns null for good evaluations', () => {
      const evaluation: ResponseEvaluation = {
        adherenceScore: 85,
        steelManning: { attempted: true, quality: 'strong' },
        selfCritique: { attempted: true, quality: 'adequate' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'high' },
        requiresInterjection: false,
      };

      expect(evaluator.determineViolationType(evaluation)).toBeNull();
    });
  });

  describe('cache management', () => {
    it('clearCache removes all cached evaluations', async () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: 'Cached response',
        debateHistory: '',
      };

      // First evaluate to populate cache
      await evaluator.evaluate(context);

      // Verify cache has entry
      expect(evaluator.getCacheStats().size).toBe(1);

      // Clear cache
      evaluator.clearCache();

      // Verify cache is empty
      expect(evaluator.getCacheStats().size).toBe(0);
    });

    it('getCacheStats returns accurate information', async () => {
      const context1: EvaluationContext = {
        chair: virtueChair,
        responseContent: 'First response',
        debateHistory: '',
      };
      const context2: EvaluationContext = {
        chair: utilChair,
        responseContent: 'Second response',
        debateHistory: '',
      };

      await evaluator.evaluate(context1);
      await evaluator.evaluate(context2);

      const stats = evaluator.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
    });
  });

  describe('setAccountabilityLevel', () => {
    it('changes accountability level for subsequent evaluations', async () => {
      const context: EvaluationContext = {
        chair: virtueChair,
        responseContent: strongSteelManResponse,
        debateHistory: '',
      };

      // Start with moderate
      const result1 = await evaluator.evaluate(context);
      expect(result1.method).toBe('full');

      evaluator.clearCache();

      // Change to relaxed
      evaluator.setAccountabilityLevel('relaxed');

      const result2 = await evaluator.evaluate(context);
      expect(result2.method).toBe('quick');
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createResponseEvaluator', () => {
  it('creates evaluator with config settings', () => {
    const evaluator = createResponseEvaluator(mockConfig, 'test-debate-123');

    // Should use config arbiter model and accountability level
    const stats = evaluator.getCacheStats();
    expect(stats.size).toBe(0); // Fresh evaluator has empty cache
  });
});

describe('createQuickEvaluator', () => {
  it('creates evaluator with relaxed accountability and no persistence', async () => {
    const evaluator = createQuickEvaluator();

    const context: EvaluationContext = {
      chair: virtueChair,
      responseContent: strongSteelManResponse,
      debateHistory: '',
    };

    const result = await evaluator.evaluate(context);

    // Should use quick mode
    expect(result.method).toBe('quick');
  });
});
