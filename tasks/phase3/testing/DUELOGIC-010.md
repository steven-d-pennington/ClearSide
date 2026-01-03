# DUELOGIC-010: Testing & Tuning

**Priority:** P1
**Estimate:** M (2 days)
**Labels:** `testing`, `backend`, `frontend`, `duelogic`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001 through DUELOGIC-009

---

## Context

Comprehensive testing of the Duelogic system to ensure debate quality, prompt effectiveness, and system reliability. Includes prompt tuning based on sample debates.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Success Metrics section
- [Testing Patterns](../../../backend/src/__tests__/) - Test patterns

---

## Requirements

### Acceptance Criteria

- [ ] Unit tests for all backend services (>80% coverage)
- [ ] Integration tests for orchestrator flow
- [ ] E2E tests for complete debate cycle
- [ ] Prompt quality tests with real LLM calls
- [ ] Sample debate runs with different configurations
- [ ] Performance benchmarks for response times
- [ ] Error handling tests
- [ ] Load testing for concurrent debates
- [ ] Document tuning recommendations

---

## Implementation Guide

### Unit Tests

#### File: `backend/src/__tests__/services/debate/response-evaluator.test.ts`

```typescript
import { ResponseEvaluator } from '../../../services/debate/response-evaluator';
import { mockLLMClient } from '../../mocks/llm-client';
import { DUELOGIC_DEFAULTS, PHILOSOPHICAL_CHAIR_INFO } from '../../../types/duelogic';

describe('ResponseEvaluator', () => {
  let evaluator: ResponseEvaluator;

  beforeEach(() => {
    evaluator = new ResponseEvaluator(mockLLMClient, DUELOGIC_DEFAULTS);
  });

  describe('steel-manning detection', () => {
    const testCases = [
      {
        name: 'strong steel-man',
        content: `I appreciate the force of the Utilitarian argument here.
          What they're really saying is that aggregate welfare matters, and we
          should be willing to make individual sacrifices for the greater good.
          That's a compelling position that I take seriously. However...`,
        expectedQuality: 'strong',
      },
      {
        name: 'adequate steel-man',
        content: `The Utilitarian perspective has some merit. They believe in
          maximizing overall good. But I would argue...`,
        expectedQuality: 'adequate',
      },
      {
        name: 'weak steel-man',
        content: `They might say something about consequences, but really...`,
        expectedQuality: 'weak',
      },
      {
        name: 'absent steel-man',
        content: `Utilitarianism is fundamentally flawed because it treats
          people like numbers. We should reject this approach entirely.`,
        expectedQuality: 'absent',
      },
    ];

    test.each(testCases)('detects $name', async ({ content, expectedQuality }) => {
      mockLLMClient.generate.mockResolvedValueOnce({
        content: JSON.stringify({
          adherenceScore: expectedQuality === 'strong' ? 85 : expectedQuality === 'absent' ? 30 : 60,
          steelManning: { attempted: expectedQuality !== 'absent', quality: expectedQuality },
          selfCritique: { attempted: false, quality: 'absent' },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'medium' },
          requiresInterjection: expectedQuality === 'absent',
        }),
      });

      const result = await evaluator.evaluate({
        chair: { position: 'chair_1', framework: 'virtue_ethics', modelId: 'test' },
        responseContent: content,
        debateHistory: '',
        previousSpeaker: { position: 'chair_2', framework: 'utilitarian', modelId: 'test' },
        previousContent: 'Previous argument...',
      });

      expect(result.steelManning.quality).toBe(expectedQuality);
    });
  });

  describe('self-critique detection', () => {
    const testCases = [
      {
        name: 'genuine self-critique',
        content: `I'll admit, this is where Virtue Ethics faces a genuine
          challenge. When dealing with novel technological dilemmas, we lack
          the historical wisdom to guide us. This is a real limitation.`,
        expectedAttempted: true,
        expectedQuality: 'strong',
      },
      {
        name: 'hedged self-critique',
        content: `Some might say my framework has issues, but I don't
          really agree. Moving on...`,
        expectedAttempted: true,
        expectedQuality: 'weak',
      },
      {
        name: 'no self-critique',
        content: `My framework is clearly superior because it considers
          human flourishing above all else.`,
        expectedAttempted: false,
        expectedQuality: 'absent',
      },
    ];

    test.each(testCases)('detects $name', async ({ content, expectedAttempted, expectedQuality }) => {
      mockLLMClient.generate.mockResolvedValueOnce({
        content: JSON.stringify({
          adherenceScore: 60,
          steelManning: { attempted: false, quality: 'absent' },
          selfCritique: { attempted: expectedAttempted, quality: expectedQuality },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'medium' },
          requiresInterjection: false,
        }),
      });

      const result = await evaluator.evaluate({
        chair: { position: 'chair_1', framework: 'virtue_ethics', modelId: 'test' },
        responseContent: content,
        debateHistory: '',
      });

      expect(result.selfCritique.attempted).toBe(expectedAttempted);
      expect(result.selfCritique.quality).toBe(expectedQuality);
    });
  });

  describe('quick heuristics', () => {
    it('identifies steel-manning patterns efficiently', () => {
      const positives = [
        'I appreciate the point made by',
        'The utilitarian argument has merit',
        'From their perspective, this makes sense',
        'I understand their concern about',
      ];

      const negatives = [
        'They are completely wrong',
        'This is a terrible argument',
        'No serious person would believe',
      ];

      positives.forEach(text => {
        expect(evaluator.quickSteelManCheck(text)).toBe(true);
      });

      negatives.forEach(text => {
        expect(evaluator.quickSteelManCheck(text)).toBe(false);
      });
    });

    it('identifies self-critique patterns efficiently', () => {
      const positives = [
        'I must admit my framework struggles here',
        'This is a limitation of my approach',
        'Critics would rightly point out',
      ];

      const negatives = [
        'My framework is the best',
        'There are no weaknesses',
        'This is clearly correct',
      ];

      positives.forEach(text => {
        expect(evaluator.quickSelfCritiqueCheck(text)).toBe(true);
      });

      negatives.forEach(text => {
        expect(evaluator.quickSelfCritiqueCheck(text)).toBe(false);
      });
    });
  });

  describe('caching', () => {
    it('returns cached results for identical inputs', async () => {
      const context = {
        chair: { position: 'chair_1', framework: 'virtue_ethics' as const, modelId: 'test' },
        responseContent: 'Test content',
        debateHistory: '',
      };

      mockLLMClient.generate.mockResolvedValue({
        content: JSON.stringify({
          adherenceScore: 70,
          steelManning: { attempted: false, quality: 'absent' },
          selfCritique: { attempted: false, quality: 'absent' },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'medium' },
          requiresInterjection: false,
        }),
      });

      await evaluator.evaluate(context);
      await evaluator.evaluate(context);

      expect(mockLLMClient.generate).toHaveBeenCalledTimes(1);
    });
  });
});
```

### Integration Tests

#### File: `backend/src/__tests__/integration/duelogic-orchestrator.test.ts`

```typescript
import { DuelogicOrchestrator } from '../../services/debate/duelogic-orchestrator';
import { createTestPool, cleanupTestDb } from '../helpers/db';
import { mockLLMClient, createMockSSEManager } from '../mocks';
import { DUELOGIC_DEFAULTS } from '../../types/duelogic';

describe('DuelogicOrchestrator Integration', () => {
  let pool: any;
  let orchestrator: DuelogicOrchestrator;
  let sseEvents: any[];

  beforeAll(async () => {
    pool = await createTestPool();
  });

  afterAll(async () => {
    await cleanupTestDb(pool);
    await pool.end();
  });

  beforeEach(() => {
    sseEvents = [];
    const sseManager = createMockSSEManager((event) => {
      sseEvents.push(event);
    });

    orchestrator = new DuelogicOrchestrator({
      llmClient: mockLLMClient,
      sseManager,
      pool,
      debateId: `test_${Date.now()}`,
      proposition: 'Should AI development be paused?',
      config: { ...DUELOGIC_DEFAULTS, flow: { ...DUELOGIC_DEFAULTS.flow, maxExchanges: 2 } },
    });
  });

  describe('debate flow', () => {
    it('executes all segments in order', async () => {
      mockLLMClient.generateWithStreaming.mockResolvedValue({ content: 'Mock response' });
      mockLLMClient.generate.mockResolvedValue({
        content: JSON.stringify({
          adherenceScore: 80,
          steelManning: { attempted: true, quality: 'adequate' },
          selfCritique: { attempted: true, quality: 'adequate' },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'high' },
          requiresInterjection: false,
        }),
      });

      await orchestrator.start();

      const segmentEvents = sseEvents.filter(e => e.type === 'segment_start');
      expect(segmentEvents.map(e => e.data.segment)).toEqual([
        'introduction',
        'opening',
        'exchange',
        'synthesis',
      ]);
    });

    it('broadcasts utterances for each turn', async () => {
      mockLLMClient.generateWithStreaming.mockResolvedValue({ content: 'Mock response' });
      mockLLMClient.generate.mockResolvedValue({
        content: JSON.stringify({
          adherenceScore: 80,
          steelManning: { attempted: true, quality: 'adequate' },
          selfCritique: { attempted: true, quality: 'adequate' },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'high' },
          requiresInterjection: false,
        }),
      });

      await orchestrator.start();

      const utteranceEvents = sseEvents.filter(e => e.type === 'utterance');

      // Intro + 2 openings + (2 chairs * 2 exchanges) + closing = 1 + 2 + 4 + 1 = 8 minimum
      expect(utteranceEvents.length).toBeGreaterThanOrEqual(8);
    });

    it('includes evaluation data for exchange responses', async () => {
      mockLLMClient.generateWithStreaming.mockResolvedValue({ content: 'Mock response' });
      mockLLMClient.generate.mockResolvedValue({
        content: JSON.stringify({
          adherenceScore: 75,
          steelManning: { attempted: true, quality: 'adequate' },
          selfCritique: { attempted: true, quality: 'weak' },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'high' },
          requiresInterjection: false,
        }),
      });

      await orchestrator.start();

      const exchangeUtterances = sseEvents.filter(
        e => e.type === 'utterance' && e.data.segment === 'exchange'
      );

      // At least some should have evaluations (all except first in each exchange)
      const withEvaluations = exchangeUtterances.filter(u => u.data.evaluation);
      expect(withEvaluations.length).toBeGreaterThan(0);
    });
  });

  describe('pause/resume', () => {
    it('pauses and resumes correctly', async () => {
      let resumeResolver: () => void;
      const resumePromise = new Promise<void>(resolve => { resumeResolver = resolve; });

      mockLLMClient.generateWithStreaming.mockImplementation(async () => {
        if (sseEvents.some(e => e.type === 'segment_start' && e.data.segment === 'opening')) {
          orchestrator.pause();
          await resumePromise;
        }
        return { content: 'Mock response' };
      });

      mockLLMClient.generate.mockResolvedValue({
        content: JSON.stringify({
          adherenceScore: 80,
          steelManning: { attempted: true, quality: 'adequate' },
          selfCritique: { attempted: true, quality: 'adequate' },
          frameworkConsistency: { consistent: true },
          intellectualHonesty: { score: 'high' },
          requiresInterjection: false,
        }),
      });

      const startPromise = orchestrator.start();

      // Wait for pause
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(orchestrator.getStatus().isPaused).toBe(true);

      orchestrator.resume();
      resumeResolver!();

      await startPromise;
      expect(orchestrator.getStatus().isRunning).toBe(false);
    });
  });
});
```

### E2E Tests

#### File: `backend/src/__tests__/e2e/duelogic-debate.test.ts`

```typescript
import request from 'supertest';
import { app } from '../../app';
import { createTestPool, cleanupTestDb } from '../helpers/db';

describe('Duelogic E2E Tests', () => {
  let pool: any;

  beforeAll(async () => {
    pool = await createTestPool();
    // Run migrations
    await pool.query(/* migration SQL */);
  });

  afterAll(async () => {
    await cleanupTestDb(pool);
    await pool.end();
  });

  describe('complete debate flow', () => {
    it('creates and runs a full debate', async () => {
      // 1. Create debate
      const createResponse = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should artificial intelligence development be paused?',
          config: {
            flow: { maxExchanges: 2 },
          },
        });

      expect(createResponse.status).toBe(201);
      const { debateId } = createResponse.body;

      // 2. Connect to SSE and collect events
      const events: any[] = [];
      const eventSource = new EventSource(`/api/debates/${debateId}/stream`);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 60000);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          events.push(data);

          if (data.type === 'debate_complete') {
            clearTimeout(timeout);
            eventSource.close();
            resolve();
          }
        };

        eventSource.onerror = () => {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error('SSE error'));
        };
      });

      // 3. Verify debate completed successfully
      expect(events.some(e => e.type === 'segment_start' && e.data.segment === 'introduction')).toBe(true);
      expect(events.some(e => e.type === 'segment_complete' && e.data.segment === 'synthesis')).toBe(true);

      // 4. Verify data persisted
      const statusResponse = await request(app)
        .get(`/api/debates/${debateId}/duelogic/status`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.debate.status).toBe('completed');
    }, 90000);
  });
});
```

### Prompt Quality Tests

#### File: `backend/src/__tests__/prompts/chair-prompt-quality.test.ts`

```typescript
/**
 * These tests use real LLM calls to verify prompt quality.
 * Run with: npm run test:prompts
 * Requires: OPENROUTER_API_KEY environment variable
 */

import { LLMClient } from '../../llm/openrouter-adapter';
import { buildChairSystemPrompt, buildExchangeResponsePrompt } from '../../services/agents/prompts/chair-prompts';
import { PHILOSOPHICAL_CHAIR_INFO } from '../../types/duelogic';

describe.skip('Chair Prompt Quality', () => {
  const llmClient = new LLMClient({ apiKey: process.env.OPENROUTER_API_KEY! });

  const frameworks = Object.keys(PHILOSOPHICAL_CHAIR_INFO) as Array<keyof typeof PHILOSOPHICAL_CHAIR_INFO>;

  describe.each(frameworks)('%s framework', (framework) => {
    it('generates response with steel-manning', async () => {
      const chair = { position: 'chair_1', framework, modelId: 'anthropic/claude-haiku-3' };
      const opponent = { position: 'chair_2', framework: 'utilitarian' as const, modelId: 'test' };

      const systemPrompt = buildChairSystemPrompt(chair, [opponent], 'spirited');
      const userPrompt = buildExchangeResponsePrompt(
        chair,
        opponent,
        'We must maximize utility for all. Individual sacrifices are justified for the greater good.',
        ''
      );

      const response = await llmClient.generate({
        model: 'anthropic/claude-haiku-3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 400,
      });

      // Check for steel-manning patterns
      const hasSteelMan = /appreciate|understand|valid|compelling|merit/i.test(response.content);
      expect(hasSteelMan).toBe(true);

      // Check for framework consistency
      const info = PHILOSOPHICAL_CHAIR_INFO[framework];
      const mentionsFramework = new RegExp(info.name.replace(' Chair', ''), 'i').test(response.content);
      expect(mentionsFramework).toBe(true);
    }, 30000);

    it('includes self-critique', async () => {
      const chair = { position: 'chair_1', framework, modelId: 'anthropic/claude-haiku-3' };
      const opponent = { position: 'chair_2', framework: 'deontological' as const, modelId: 'test' };

      const systemPrompt = buildChairSystemPrompt(chair, [opponent], 'spirited');
      const userPrompt = buildExchangeResponsePrompt(
        chair,
        opponent,
        'Rules and duties must be followed regardless of consequences.',
        ''
      );

      const response = await llmClient.generate({
        model: 'anthropic/claude-haiku-3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 400,
      });

      // Check for self-critique patterns
      const hasSelfCritique = /admit|acknowledge|limitation|struggle|weakness|blind spot|challenge/i.test(response.content);
      expect(hasSelfCritique).toBe(true);
    }, 30000);
  });
});
```

### Performance Benchmarks

#### File: `backend/src/__tests__/performance/duelogic-benchmarks.ts`

```typescript
import { performance } from 'perf_hooks';
import { DuelogicOrchestrator } from '../../services/debate/duelogic-orchestrator';

describe('Duelogic Performance Benchmarks', () => {
  it('completes intro generation in under 10 seconds', async () => {
    const start = performance.now();

    await orchestrator.executeIntroduction();

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(10000);
    console.log(`Intro generation: ${duration.toFixed(0)}ms`);
  });

  it('evaluates response in under 3 seconds', async () => {
    const start = performance.now();

    await evaluator.evaluate({
      chair: mockChair,
      responseContent: 'Test response content...',
      debateHistory: '',
    });

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(3000);
    console.log(`Response evaluation: ${duration.toFixed(0)}ms`);
  });

  it('handles concurrent debates without degradation', async () => {
    const concurrentDebates = 3;
    const orchestrators = Array.from({ length: concurrentDebates }, (_, i) =>
      new DuelogicOrchestrator({
        debateId: `concurrent_${i}`,
        proposition: 'Test proposition',
        config: { ...DUELOGIC_DEFAULTS, flow: { ...DUELOGIC_DEFAULTS.flow, maxExchanges: 1 } },
        // ... other config
      })
    );

    const start = performance.now();

    await Promise.all(orchestrators.map(o => o.start()));

    const duration = performance.now() - start;
    console.log(`${concurrentDebates} concurrent debates: ${duration.toFixed(0)}ms`);

    // Should not be linearly slower
    expect(duration).toBeLessThan(30000 * concurrentDebates * 0.7);
  });
});
```

---

## Sample Debate Configurations

### Test Configuration 1: Classic Clash (2 chairs)

```typescript
const classicClashTest = {
  proposition: 'Should major AI labs voluntarily pause development of frontier models for two years?',
  config: {
    chairs: [
      { position: 'chair_1', framework: 'utilitarian', modelId: 'anthropic/claude-sonnet-4' },
      { position: 'chair_2', framework: 'virtue_ethics', modelId: 'anthropic/claude-sonnet-4' },
    ],
    flow: { maxExchanges: 4 },
    tone: 'spirited',
  },
};
```

### Test Configuration 2: Three-Way (3 chairs)

```typescript
const threeWayTest = {
  proposition: 'Should social media platforms be legally responsible for harmful content?',
  config: {
    chairs: [
      { position: 'chair_1', framework: 'utilitarian', modelId: 'anthropic/claude-sonnet-4' },
      { position: 'chair_2', framework: 'libertarian', modelId: 'openai/gpt-4o' },
      { position: 'chair_3', framework: 'communitarian', modelId: 'anthropic/claude-sonnet-4' },
    ],
    flow: { maxExchanges: 3 },
    tone: 'heated',
  },
};
```

### Test Configuration 3: Full Battle Royale (4 chairs)

```typescript
const battleRoyaleTest = {
  proposition: 'Should there be a universal basic income?',
  config: {
    chairs: [
      { position: 'chair_1', framework: 'utilitarian', modelId: 'anthropic/claude-sonnet-4' },
      { position: 'chair_2', framework: 'virtue_ethics', modelId: 'anthropic/claude-sonnet-4' },
      { position: 'chair_3', framework: 'libertarian', modelId: 'openai/gpt-4o' },
      { position: 'chair_4', framework: 'pragmatic', modelId: 'google/gemini-pro' },
    ],
    flow: { maxExchanges: 2 },
    interruptions: { enabled: true, aggressiveness: 4 },
    tone: 'heated',
  },
};
```

---

## Success Metrics to Validate

Based on the master spec:

1. **Uncertainty Preservation**: Listeners should leave uncertain which side "won"
   - Manual review of sample debates
   - User survey after demos

2. **Steel-Manning Rate**: >80% of critique responses include steel-manning
   - Automated via ResponseEvaluator metrics

3. **Self-Critique Rate**: >70% of substantive responses include self-critique
   - Automated via ResponseEvaluator metrics

4. **Framework Consistency**: Chairs maintain assigned framework
   - Automated via evaluation violations count

5. **Natural Interruptions**: Interruptions enhance rather than derail
   - Manual review of interrupt placement and relevance

---

## Tuning Recommendations

Document findings in `docs/DUELOGIC_TUNING.md`:

- Prompt adjustments that improved quality
- Optimal temperature settings per agent type
- Aggressiveness levels that work best
- Framework combinations that create best debates
- Token limits and their effects

---

## Dependencies

- All DUELOGIC-001 through DUELOGIC-009 tasks

---

## Definition of Done

- [ ] Unit test coverage >80% for all services
- [ ] Integration tests pass for orchestrator
- [ ] E2E tests pass for full debate flow
- [ ] Prompt quality verified with real LLM calls
- [ ] 3+ sample debates run and reviewed
- [ ] Performance benchmarks documented
- [ ] Tuning recommendations documented
- [ ] No critical bugs remaining
