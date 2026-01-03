# DUELOGIC-005: Response Evaluator

**Priority:** P0
**Estimate:** M (2 days)
**Labels:** `orchestrator`, `backend`, `duelogic`, `ai`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001, DUELOGIC-003

---

## Context

The Response Evaluator analyzes chair responses for adherence to Duelogic principles: steel-manning, self-critique, framework consistency, and intellectual honesty. It provides evaluation scores used by the Arbiter for interjections.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Response Evaluation Types section
- [Arbiter Agent](./DUELOGIC-003.md) - Uses evaluations for interjections

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/services/debate/response-evaluator.ts`
- [ ] Detect steel-manning attempts and quality
- [ ] Detect self-critique attempts and quality
- [ ] Assess framework consistency
- [ ] Score intellectual honesty
- [ ] Calculate overall adherence score
- [ ] Determine if arbiter interjection is needed
- [ ] Cache evaluations to avoid redundant LLM calls
- [ ] Support batch evaluation for performance
- [ ] Write comprehensive unit tests

---

## Implementation Guide

### File: `backend/src/services/debate/response-evaluator.ts`

```typescript
import { LLMClient } from '../../llm/openrouter-adapter';
import {
  DuelogicChair,
  DuelogicConfig,
  ResponseEvaluation,
  PHILOSOPHICAL_CHAIR_INFO
} from '../../types/duelogic';

interface EvaluationContext {
  chair: DuelogicChair;
  responseContent: string;
  debateHistory: string;
  previousSpeaker?: DuelogicChair;
  previousContent?: string;
}

export class ResponseEvaluator {
  private llmClient: LLMClient;
  private config: DuelogicConfig;
  private evaluationCache: Map<string, ResponseEvaluation>;

  constructor(llmClient: LLMClient, config: DuelogicConfig) {
    this.llmClient = llmClient;
    this.config = config;
    this.evaluationCache = new Map();
  }

  async evaluate(context: EvaluationContext): Promise<ResponseEvaluation> {
    // Check cache
    const cacheKey = this.getCacheKey(context);
    if (this.evaluationCache.has(cacheKey)) {
      return this.evaluationCache.get(cacheKey)!;
    }

    const evaluation = await this.performEvaluation(context);

    // Cache result
    this.evaluationCache.set(cacheKey, evaluation);

    return evaluation;
  }

  private async performEvaluation(context: EvaluationContext): Promise<ResponseEvaluation> {
    const { chair, responseContent, debateHistory, previousSpeaker, previousContent } = context;
    const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];

    const prompt = this.buildEvaluationPrompt(
      chair,
      info,
      responseContent,
      debateHistory,
      previousSpeaker,
      previousContent
    );

    const response = await this.llmClient.generate({
      model: this.config.arbiter.modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2, // Low temperature for consistent evaluation
      maxTokens: 600,
    });

    try {
      const parsed = this.parseEvaluationResponse(response.content);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      console.error('Failed to parse evaluation response:', error);
      return this.getDefaultEvaluation();
    }
  }

  private buildEvaluationPrompt(
    chair: DuelogicChair,
    info: typeof PHILOSOPHICAL_CHAIR_INFO[keyof typeof PHILOSOPHICAL_CHAIR_INFO],
    responseContent: string,
    debateHistory: string,
    previousSpeaker?: DuelogicChair,
    previousContent?: string
  ): string {
    const prevInfo = previousSpeaker
      ? PHILOSOPHICAL_CHAIR_INFO[previousSpeaker.framework]
      : null;

    return `You are a strict evaluator of debate responses for adherence to Duelogic principles.

**CHAIR BEING EVALUATED:**
${chair.modelDisplayName || chair.modelId}
Framework: ${info.name} - ${info.description}
Core Question: ${info.coreQuestion}

**THEIR RESPONSE TO EVALUATE:**
"${responseContent}"

${previousSpeaker && previousContent ? `
**WHAT THEY WERE RESPONDING TO:**
${previousSpeaker.modelDisplayName || previousSpeaker.modelId} (${prevInfo!.name}) said:
"${previousContent}"
` : ''}

**RECENT DEBATE CONTEXT:**
${debateHistory.slice(-1000)}

---

**EVALUATION CRITERIA:**

1. **STEEL-MANNING** (0-25 points)
   Did they articulate the strongest version of the opponent's argument before critiquing?

   Scoring:
   - 25: Articulated opponent's position better than opponent might themselves
   - 20: Strong, charitable interpretation of opponent's view
   - 15: Adequate acknowledgment of opponent's position
   - 10: Weak or superficial mention
   - 0-5: Absent or attacked a straw man

   Output: { "attempted": boolean, "quality": "strong|adequate|weak|absent", "notes": "brief" }

2. **SELF-CRITIQUE** (0-25 points)
   Did they acknowledge their own framework's limitations or blind spots?

   Known blind spots for ${info.name}:
${info.blindSpotsToAdmit.map(b => `   - ${b}`).join('\n')}

   Scoring:
   - 25: Genuine acknowledgment of framework weakness with nuance
   - 20: Clear admission of limitation
   - 15: Brief nod to potential issues
   - 10: Hedged or conditional acknowledgment
   - 0-5: Absent or defensive

   Output: { "attempted": boolean, "quality": "strong|adequate|weak|absent", "notes": "brief" }

3. **FRAMEWORK CONSISTENCY** (0-25 points)
   Did they argue from within their assigned ${info.name} framework?

   Scoring:
   - 25: Pure framework reasoning throughout
   - 20: Mostly consistent with minor deviations
   - 15: Some arguments from other frameworks
   - 10: Significant departures from assigned framework
   - 0-5: Abandoned framework or contradicted it

   Output: { "consistent": boolean, "violations": ["list any departures"] }

4. **INTELLECTUAL HONESTY** (0-25 points)
   Did they engage in good faith?

   Watch for:
   - Evasion of direct challenges
   - Misrepresenting opponent's position
   - Cherry-picking evidence
   - Moving goalposts
   - False equivalences

   Scoring:
   - 25: Exemplary intellectual honesty
   - 20: Generally honest engagement
   - 15: Some minor evasions or oversimplifications
   - 10: Notable honesty issues
   - 0-5: Significant bad faith patterns

   Output: { "score": "high|medium|low", "issues": ["list any"] }

---

**OUTPUT FORMAT (strict JSON):**
{
  "adherenceScore": <0-100>,
  "steelManning": { "attempted": boolean, "quality": "string", "notes": "string" },
  "selfCritique": { "attempted": boolean, "quality": "string", "notes": "string" },
  "frameworkConsistency": { "consistent": boolean, "violations": ["array"] },
  "intellectualHonesty": { "score": "string", "issues": ["array"] },
  "requiresInterjection": boolean,
  "interjectionReason": "string or null"
}

**INTERJECTION TRIGGER:**
Set requiresInterjection to TRUE if:
- Steel-manning is absent or very weak (quality: "absent" or "weak")
- Self-critique is completely absent
- Major framework violation
- Significant intellectual dishonesty

Evaluate now:`;
  }

  private parseEvaluationResponse(content: string): any {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  }

  private validateAndNormalize(parsed: any): ResponseEvaluation {
    return {
      adherenceScore: this.clamp(parsed.adherenceScore ?? 50, 0, 100),
      steelManning: {
        attempted: Boolean(parsed.steelManning?.attempted),
        quality: this.validateQuality(parsed.steelManning?.quality),
        notes: parsed.steelManning?.notes || undefined,
      },
      selfCritique: {
        attempted: Boolean(parsed.selfCritique?.attempted),
        quality: this.validateQuality(parsed.selfCritique?.quality),
        notes: parsed.selfCritique?.notes || undefined,
      },
      frameworkConsistency: {
        consistent: Boolean(parsed.frameworkConsistency?.consistent ?? true),
        violations: Array.isArray(parsed.frameworkConsistency?.violations)
          ? parsed.frameworkConsistency.violations
          : undefined,
      },
      intellectualHonesty: {
        score: this.validateHonestyScore(parsed.intellectualHonesty?.score),
        issues: Array.isArray(parsed.intellectualHonesty?.issues)
          ? parsed.intellectualHonesty.issues
          : undefined,
      },
      requiresInterjection: Boolean(parsed.requiresInterjection),
      interjectionReason: parsed.interjectionReason || undefined,
    };
  }

  private validateQuality(quality: any): 'strong' | 'adequate' | 'weak' | 'absent' {
    const valid = ['strong', 'adequate', 'weak', 'absent'];
    return valid.includes(quality) ? quality : 'absent';
  }

  private validateHonestyScore(score: any): 'high' | 'medium' | 'low' {
    const valid = ['high', 'medium', 'low'];
    return valid.includes(score) ? score : 'medium';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private getCacheKey(context: EvaluationContext): string {
    return `${context.chair.position}:${context.responseContent.slice(0, 100)}`;
  }

  private getDefaultEvaluation(): ResponseEvaluation {
    return {
      adherenceScore: 50,
      steelManning: { attempted: false, quality: 'absent' },
      selfCritique: { attempted: false, quality: 'absent' },
      frameworkConsistency: { consistent: true },
      intellectualHonesty: { score: 'medium' },
      requiresInterjection: false,
    };
  }

  /**
   * Quick heuristic check for steel-manning patterns
   * Used before full LLM evaluation for efficiency
   */
  quickSteelManCheck(content: string): boolean {
    const patterns = [
      /I (appreciate|understand|see|acknowledge|recognize)/i,
      /the .+ (makes? a (good|valid|fair|strong|compelling) point|argument)/i,
      /from (their|the .+) perspective/i,
      /they'?re? right (that|to|about)/i,
      /I (agree|concede|grant) (that|with)/i,
      /there's (truth|merit|value) (in|to)/i,
    ];
    return patterns.some(p => p.test(content));
  }

  /**
   * Quick heuristic check for self-critique patterns
   */
  quickSelfCritiqueCheck(content: string): boolean {
    const patterns = [
      /my (framework|approach|position) (struggles?|fails?|has difficulty)/i,
      /I('ll| must)? (admit|acknowledge|concede)/i,
      /this is (where|a point where) .+ (struggles?|is weak|falls short)/i,
      /(limitation|weakness|blind spot) of (my|this)/i,
      /critics (of|would say|might argue)/i,
    ];
    return patterns.some(p => p.test(content));
  }

  /**
   * Batch evaluate multiple responses efficiently
   */
  async batchEvaluate(
    contexts: EvaluationContext[]
  ): Promise<Map<string, ResponseEvaluation>> {
    const results = new Map<string, ResponseEvaluation>();

    // Process in parallel with concurrency limit
    const CONCURRENCY = 3;
    for (let i = 0; i < contexts.length; i += CONCURRENCY) {
      const batch = contexts.slice(i, i + CONCURRENCY);
      const evaluations = await Promise.all(
        batch.map(ctx => this.evaluate(ctx))
      );
      batch.forEach((ctx, idx) => {
        results.set(ctx.chair.position, evaluations[idx]);
      });
    }

    return results;
  }

  clearCache(): void {
    this.evaluationCache.clear();
  }
}
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration
- DUELOGIC-003: Arbiter Agent (shares evaluation logic)

---

## Validation

```bash
# Unit tests
npm run test -- --grep "ResponseEvaluator"

# Test with sample responses
npm run test:integration -- --grep "evaluation"
```

---

## Test Cases

```typescript
describe('ResponseEvaluator', () => {
  describe('steel-manning detection', () => {
    it('detects strong steel-manning', async () => {
      const response = `I appreciate the force of the Utilitarian argument here.
        What they're really saying is that aggregate welfare matters, and we
        should be willing to make individual sacrifices for the greater good.
        That's a compelling position. However, from my Virtue Ethics perspective...`;

      const evaluation = await evaluator.evaluate({
        chair: virtueChair,
        responseContent: response,
        debateHistory: '',
        previousSpeaker: utilChair,
      });

      expect(evaluation.steelManning.attempted).toBe(true);
      expect(evaluation.steelManning.quality).toBe('strong');
    });

    it('detects absent steel-manning', async () => {
      const response = `The Utilitarian view is wrong because it treats people
        as mere numbers. They just want to add up happiness without caring
        about individual rights.`;

      const evaluation = await evaluator.evaluate({
        chair: virtueChair,
        responseContent: response,
        debateHistory: '',
        previousSpeaker: utilChair,
      });

      expect(evaluation.steelManning.attempted).toBe(false);
      expect(evaluation.steelManning.quality).toBe('absent');
      expect(evaluation.requiresInterjection).toBe(true);
    });
  });

  describe('self-critique detection', () => {
    it('detects genuine self-critique', async () => {
      const response = `I'll admit, this is where Virtue Ethics faces a genuine
        challenge. When dealing with novel technological dilemmas, we lack
        historical wisdom to guide us.`;

      const evaluation = await evaluator.evaluate({
        chair: virtueChair,
        responseContent: response,
        debateHistory: '',
      });

      expect(evaluation.selfCritique.attempted).toBe(true);
      expect(evaluation.selfCritique.quality).toMatch(/strong|adequate/);
    });
  });

  describe('quick heuristics', () => {
    it('quickSteelManCheck identifies patterns', () => {
      expect(evaluator.quickSteelManCheck('I appreciate the point')).toBe(true);
      expect(evaluator.quickSteelManCheck('They are wrong')).toBe(false);
    });

    it('quickSelfCritiqueCheck identifies patterns', () => {
      expect(evaluator.quickSelfCritiqueCheck("I'll admit my framework struggles")).toBe(true);
      expect(evaluator.quickSelfCritiqueCheck('My framework is superior')).toBe(false);
    });
  });

  describe('caching', () => {
    it('caches repeated evaluations', async () => {
      const context = { chair: virtueChair, responseContent: 'test', debateHistory: '' };

      await evaluator.evaluate(context);
      await evaluator.evaluate(context);

      // Only one LLM call should be made
      expect(mockLLMClient.generate).toHaveBeenCalledTimes(1);
    });
  });
});
```

---

## Definition of Done

- [ ] Accurately detects steel-manning attempts
- [ ] Accurately detects self-critique attempts
- [ ] Correctly identifies framework violations
- [ ] Adherence scores are meaningful (0-100)
- [ ] Interjection triggers work correctly
- [ ] Caching reduces redundant LLM calls
- [ ] Quick heuristics improve efficiency
- [ ] Unit tests pass with >85% coverage
