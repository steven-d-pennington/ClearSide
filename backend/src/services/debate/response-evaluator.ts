/**
 * Response Evaluator Service for Duelogic Debate Mode
 *
 * Evaluates chair responses for adherence to Duelogic principles:
 * - Steel-manning (articulating opponent's strongest position)
 * - Self-critique (acknowledging own framework's blind spots)
 * - Framework consistency (staying within assigned philosophical framework)
 * - Intellectual honesty (engaging in good faith)
 *
 * Provides:
 * - Full LLM-based evaluation
 * - Quick heuristic checks (no LLM call)
 * - Batch evaluation with concurrency control
 * - Database persistence
 * - Caching to avoid redundant LLM calls
 */

import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import { createOpenRouterClient, type OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import {
  type DuelogicChair,
  type DuelogicConfig,
  type ResponseEvaluation,
  type AccountabilityLevel,
  type QualityLevel,
  type HonestyScore,
  PHILOSOPHICAL_CHAIR_INFO,
} from '../../types/duelogic.js';
import {
  saveResponseEvaluation,
  getEvaluationByUtteranceId,
  getEvaluationsForDebate,
  getEvaluationsByChair,
} from '../../db/repositories/duelogic-repository.js';

const logger = pino({
  name: 'response-evaluator',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

/**
 * Context for evaluating a chair's response
 */
export interface EvaluationContext {
  chair: DuelogicChair;
  responseContent: string;
  debateHistory: string;
  previousSpeaker?: DuelogicChair;
  previousContent?: string;
}

/**
 * Extended evaluation result with metadata
 */
export interface EvaluationResult {
  evaluation: ResponseEvaluation;
  cached: boolean;
  method: 'full' | 'quick' | 'cached';
  durationMs?: number;
}

/**
 * Options for ResponseEvaluator constructor
 */
export interface ResponseEvaluatorOptions {
  llmClient?: LLMClient;
  modelId?: string;
  accountabilityLevel?: AccountabilityLevel;
  debateId?: string;
  enablePersistence?: boolean;
}

/**
 * Options for batch evaluation
 */
export interface BatchEvaluationOptions {
  concurrency?: number;
  useQuickMode?: boolean;
  persist?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default concurrency for batch evaluation */
const DEFAULT_BATCH_CONCURRENCY = 3;

/** Default model for evaluation */
const DEFAULT_EVALUATION_MODEL = 'anthropic/claude-3-haiku';

// ============================================================================
// Heuristic Pattern Matching
// ============================================================================

/**
 * Quick heuristic check for steel-manning patterns
 * Used before full LLM evaluation for efficiency
 */
export function quickSteelManCheck(content: string): boolean {
  const patterns = [
    /I (appreciate|understand|see|acknowledge|recognize)/i,
    /the .+ (makes? a (good|valid|fair|strong|compelling) point|argument)/i,
    /from (their|the .+) perspective/i,
    /they'?re? right (that|to|about)/i,
    /I (agree|concede|grant) (that|with)/i,
    /there's (truth|merit|value) (in|to)/i,
    /(strongest|best) (case|argument|point) for/i,
    /charitably (interpret|understood|read)/i,
    /giving (them|this view) credit/i,
    /at (its|their) (best|strongest)/i,
  ];
  return patterns.some((p) => p.test(content));
}

/**
 * Quick heuristic check for self-critique patterns
 */
export function quickSelfCritiqueCheck(content: string): boolean {
  const patterns = [
    /my (framework|approach|position) (struggles?|fails?|has difficulty)/i,
    /I('ll| must)? (admit|acknowledge|concede)/i,
    /this is (where|a point where) .+ (struggles?|is weak|falls short)/i,
    /(limitation|weakness|blind spot) of (my|this)/i,
    /critics (of|would say|might argue)/i,
    /(I|we) (cannot|can't) fully (account|explain|address)/i,
    /where (my|this) (framework|view|approach) (is|may be) (limited|insufficient)/i,
    /honest(ly)? (admit|acknowledge|recognize)/i,
    /fair (criticism|objection|point) (of|against)/i,
  ];
  return patterns.some((p) => p.test(content));
}

// ============================================================================
// Default Evaluation
// ============================================================================

/**
 * Get a default evaluation (used when evaluation fails)
 */
export function getDefaultEvaluation(): ResponseEvaluation {
  return {
    adherenceScore: 50,
    steelManning: { attempted: false, quality: 'absent' },
    selfCritique: { attempted: false, quality: 'absent' },
    frameworkConsistency: { consistent: true },
    intellectualHonesty: { score: 'medium' },
    requiresInterjection: false,
  };
}

// ============================================================================
// ResponseEvaluator Class
// ============================================================================

/**
 * Response Evaluator Service
 *
 * Provides evaluation of chair responses for Duelogic adherence.
 * Can be used standalone or with an ArbiterAgent.
 */
export class ResponseEvaluator {
  private llmClient: LLMClient;
  private modelId: string;
  private accountabilityLevel: AccountabilityLevel;
  private debateId?: string;
  private enablePersistence: boolean;
  private evaluationCache: Map<string, ResponseEvaluation>;

  constructor(options: ResponseEvaluatorOptions = {}) {
    this.modelId = options.modelId || DEFAULT_EVALUATION_MODEL;
    this.llmClient = options.llmClient || createOpenRouterClient(this.modelId);
    this.accountabilityLevel = options.accountabilityLevel || 'moderate';
    this.debateId = options.debateId;
    this.enablePersistence = options.enablePersistence ?? true;
    this.evaluationCache = new Map();

    logger.info(
      {
        modelId: this.modelId,
        accountabilityLevel: this.accountabilityLevel,
        debateId: this.debateId,
        persistence: this.enablePersistence,
      },
      'ResponseEvaluator initialized'
    );
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Evaluate a chair's response for Duelogic adherence
   */
  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.getCacheKey(context);
    if (this.evaluationCache.has(cacheKey)) {
      logger.debug({ cacheKey }, 'Returning cached evaluation');
      return {
        evaluation: this.evaluationCache.get(cacheKey)!,
        cached: true,
        method: 'cached',
      };
    }

    // Use quick evaluation for relaxed mode
    if (this.accountabilityLevel === 'relaxed') {
      const quickEval = this.performQuickEvaluation(context);
      this.evaluationCache.set(cacheKey, quickEval);
      return {
        evaluation: quickEval,
        cached: false,
        method: 'quick',
        durationMs: Date.now() - startTime,
      };
    }

    // Perform full LLM evaluation
    try {
      const evaluation = await this.performFullEvaluation(context);
      const adjustedEvaluation = this.adjustForAccountability(evaluation);

      // Cache result
      this.evaluationCache.set(cacheKey, adjustedEvaluation);

      logger.info(
        {
          chair: context.chair.position,
          adherenceScore: adjustedEvaluation.adherenceScore,
          requiresInterjection: adjustedEvaluation.requiresInterjection,
          durationMs: Date.now() - startTime,
        },
        'Response evaluated'
      );

      return {
        evaluation: adjustedEvaluation,
        cached: false,
        method: 'full',
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error, chair: context.chair.position }, 'Failed to evaluate response');

      // Fall back to quick evaluation on error
      const fallbackEval = this.performQuickEvaluation(context);
      return {
        evaluation: fallbackEval,
        cached: false,
        method: 'quick',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Evaluate and persist result to database
   */
  async evaluateAndPersist(
    context: EvaluationContext,
    utteranceId: number
  ): Promise<{ evaluation: ResponseEvaluation; evaluationId: number }> {
    const result = await this.evaluate(context);

    // Persist if enabled and not already cached (avoid duplicate inserts)
    if (this.enablePersistence && !result.cached) {
      const evaluationId = await saveResponseEvaluation(utteranceId, result.evaluation);
      logger.debug({ utteranceId, evaluationId }, 'Persisted evaluation to database');
      return { evaluation: result.evaluation, evaluationId };
    }

    return { evaluation: result.evaluation, evaluationId: 0 };
  }

  /**
   * Perform quick heuristic evaluation without LLM call
   */
  performQuickEvaluation(context: EvaluationContext): ResponseEvaluation {
    const hasSteelMan = quickSteelManCheck(context.responseContent);
    const hasSelfCritique = quickSelfCritiqueCheck(context.responseContent);

    // Simple scoring based on heuristics
    let score = 50;
    if (hasSteelMan) score += 20;
    if (hasSelfCritique) score += 20;

    // Check for basic framework consistency
    const hasFrameworkLanguage = this.checkFrameworkLanguage(context);
    if (hasFrameworkLanguage) score += 10;

    return {
      adherenceScore: Math.min(score, 100),
      steelManning: {
        attempted: hasSteelMan,
        quality: hasSteelMan ? 'adequate' : 'absent',
      },
      selfCritique: {
        attempted: hasSelfCritique,
        quality: hasSelfCritique ? 'adequate' : 'absent',
      },
      frameworkConsistency: { consistent: true },
      intellectualHonesty: { score: 'medium' },
      requiresInterjection: false, // Quick mode doesn't trigger interjections
    };
  }

  /**
   * Batch evaluate multiple responses efficiently
   */
  async batchEvaluate(
    contexts: EvaluationContext[],
    options: BatchEvaluationOptions = {}
  ): Promise<Map<string, EvaluationResult>> {
    const concurrency = options.concurrency || DEFAULT_BATCH_CONCURRENCY;
    const results = new Map<string, EvaluationResult>();

    logger.info(
      {
        count: contexts.length,
        concurrency,
        useQuickMode: options.useQuickMode,
      },
      'Starting batch evaluation'
    );

    // Process in parallel with concurrency limit
    for (let i = 0; i < contexts.length; i += concurrency) {
      const batch = contexts.slice(i, i + concurrency);

      const evaluations = await Promise.all(
        batch.map(async (ctx) => {
          if (options.useQuickMode) {
            return {
              evaluation: this.performQuickEvaluation(ctx),
              cached: false,
              method: 'quick' as const,
            };
          }
          return this.evaluate(ctx);
        })
      );

      batch.forEach((ctx, idx) => {
        results.set(ctx.chair.position, evaluations[idx]);
      });
    }

    logger.info(
      { count: results.size },
      'Batch evaluation complete'
    );

    return results;
  }

  /**
   * Get evaluations for a debate from database
   */
  async getEvaluationsForDebate(debateId: string): Promise<Array<{
    utteranceId: number;
    speaker: string;
    evaluation: ResponseEvaluation;
  }>> {
    return getEvaluationsForDebate(debateId);
  }

  /**
   * Get evaluations grouped by chair position from database
   */
  async getEvaluationsByChair(debateId: string): Promise<Map<string, ResponseEvaluation[]>> {
    return getEvaluationsByChair(debateId);
  }

  /**
   * Check if interjection should be issued based on evaluation
   */
  shouldInterject(
    evaluation: ResponseEvaluation,
    mandateArbiterCanInterject: boolean = true
  ): boolean {
    // Never interject if arbiter interjections are disabled
    if (!mandateArbiterCanInterject) {
      return false;
    }

    // Never interject in relaxed mode
    if (this.accountabilityLevel === 'relaxed') {
      return false;
    }

    // Strict mode: interject for any significant violation
    if (this.accountabilityLevel === 'strict') {
      return evaluation.requiresInterjection || evaluation.adherenceScore < 60;
    }

    // Moderate mode: only interject for major violations
    return evaluation.requiresInterjection && evaluation.adherenceScore < 40;
  }

  /**
   * Determine the type of violation from an evaluation
   */
  determineViolationType(
    evaluation: ResponseEvaluation
  ): 'straw_manning' | 'missing_self_critique' | 'framework_inconsistency' | 'rhetorical_evasion' | null {
    // Check for straw-manning (absent or weak steel-manning)
    if (
      !evaluation.steelManning.attempted ||
      evaluation.steelManning.quality === 'absent' ||
      evaluation.steelManning.quality === 'weak'
    ) {
      return 'straw_manning';
    }

    // Check for missing self-critique
    if (!evaluation.selfCritique.attempted || evaluation.selfCritique.quality === 'absent') {
      return 'missing_self_critique';
    }

    // Check for framework inconsistency
    if (!evaluation.frameworkConsistency.consistent) {
      return 'framework_inconsistency';
    }

    // Check for intellectual honesty issues
    if (evaluation.intellectualHonesty.score === 'low') {
      return 'rhetorical_evasion';
    }

    return null;
  }

  /**
   * Clear the evaluation cache
   */
  clearCache(): void {
    this.evaluationCache.clear();
    logger.debug('Evaluation cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.evaluationCache.size,
      entries: Array.from(this.evaluationCache.keys()),
    };
  }

  /**
   * Update accountability level
   */
  setAccountabilityLevel(level: AccountabilityLevel): void {
    this.accountabilityLevel = level;
    logger.debug({ level }, 'Accountability level updated');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Perform full LLM-based evaluation
   */
  private async performFullEvaluation(context: EvaluationContext): Promise<ResponseEvaluation> {
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

    const response = await this.llmClient.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 600 }
    );

    return this.parseEvaluationResponse(response);
  }

  /**
   * Build the evaluation prompt for LLM
   */
  private buildEvaluationPrompt(
    chair: DuelogicChair,
    info: typeof PHILOSOPHICAL_CHAIR_INFO[keyof typeof PHILOSOPHICAL_CHAIR_INFO],
    responseContent: string,
    debateHistory: string,
    previousSpeaker?: DuelogicChair,
    previousContent?: string
  ): string {
    const prevInfo = previousSpeaker ? PHILOSOPHICAL_CHAIR_INFO[previousSpeaker.framework] : null;

    return `You are a strict evaluator of debate responses for adherence to Duelogic principles.

**CHAIR BEING EVALUATED:**
${chair.modelDisplayName || chair.modelId}
Framework: ${info.name} - ${info.description}
Core Question: ${info.coreQuestion}

**THEIR RESPONSE TO EVALUATE:**
"${responseContent}"

${
  previousSpeaker && previousContent
    ? `
**WHAT THEY WERE RESPONDING TO:**
${previousSpeaker.modelDisplayName || previousSpeaker.modelId} (${prevInfo!.name}) said:
"${previousContent}"
`
    : ''
}

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
${info.blindSpotsToAdmit.map((b) => `   - ${b}`).join('\n')}

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

  /**
   * Parse LLM evaluation response into structured format
   */
  private parseEvaluationResponse(content: string): ResponseEvaluation {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in evaluation response');
        return getDefaultEvaluation();
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      logger.error({ error }, 'Failed to parse evaluation response');
      return getDefaultEvaluation();
    }
  }

  /**
   * Validate and normalize parsed evaluation data
   */
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

  /**
   * Validate quality level string
   */
  private validateQuality(quality: any): QualityLevel {
    const valid: QualityLevel[] = ['strong', 'adequate', 'weak', 'absent'];
    return valid.includes(quality) ? quality : 'absent';
  }

  /**
   * Validate honesty score string
   */
  private validateHonestyScore(score: any): HonestyScore {
    const valid: HonestyScore[] = ['high', 'medium', 'low'];
    return valid.includes(score) ? score : 'medium';
  }

  /**
   * Clamp a number between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Generate cache key for evaluation context
   */
  private getCacheKey(context: EvaluationContext): string {
    return `${context.chair.position}:${context.responseContent.slice(0, 100)}`;
  }

  /**
   * Check if response contains framework-specific language
   */
  private checkFrameworkLanguage(context: EvaluationContext): boolean {
    const info = PHILOSOPHICAL_CHAIR_INFO[context.chair.framework];
    const content = context.responseContent.toLowerCase();

    // Check for framework name
    if (content.includes(info.name.toLowerCase())) {
      return true;
    }

    // Check for core question themes
    const coreWords = info.coreQuestion.toLowerCase().split(' ').filter((w) => w.length > 4);
    return coreWords.some((word) => content.includes(word));
  }

  /**
   * Adjust evaluation based on accountability level
   */
  private adjustForAccountability(evaluation: ResponseEvaluation): ResponseEvaluation {
    if (this.accountabilityLevel === 'relaxed') {
      // Lower thresholds for interjection
      return {
        ...evaluation,
        requiresInterjection: false, // Never in relaxed
      };
    }

    if (this.accountabilityLevel === 'strict') {
      // Lower the bar for interjection
      const strictInterjection =
        evaluation.requiresInterjection ||
        evaluation.adherenceScore < 60 ||
        !evaluation.steelManning.attempted ||
        !evaluation.selfCritique.attempted;

      return {
        ...evaluation,
        requiresInterjection: strictInterjection,
      };
    }

    // Moderate: use evaluation as-is
    return evaluation;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a ResponseEvaluator with Duelogic config
 */
export function createResponseEvaluator(config: DuelogicConfig, debateId?: string): ResponseEvaluator {
  return new ResponseEvaluator({
    modelId: config.arbiter.modelId,
    accountabilityLevel: config.arbiter.accountabilityLevel,
    debateId,
    enablePersistence: true,
  });
}

/**
 * Create a lightweight ResponseEvaluator for quick evaluations only
 */
export function createQuickEvaluator(): ResponseEvaluator {
  return new ResponseEvaluator({
    accountabilityLevel: 'relaxed',
    enablePersistence: false,
  });
}
