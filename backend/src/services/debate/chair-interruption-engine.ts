/**
 * Chair Interruption Engine for Duelogic Debate Mode
 *
 * Enables dynamic chair-to-chair interruptions during debates for:
 * - Factual corrections when a framework is misrepresented
 * - Straw-man detection when arguments are weakened
 * - Direct challenges on key points
 * - Clarification requests
 * - Strong agreement and amplification
 * - Pivotal point identification
 *
 * Features:
 * - LLM-based evaluation for interrupt opportunities
 * - Quick heuristic pre-checks for efficiency
 * - Cooldown management per chair
 * - Aggressiveness-based urgency thresholds
 * - Database persistence for analytics
 */

import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import { createOpenRouterClient, type OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import {
  type DuelogicChair,
  type DuelogicConfig,
  type ChairInterruptCandidate,
  type ChairInterruptReason,
  type AggressivenessLevel,
  PHILOSOPHICAL_CHAIR_INFO,
  INTERRUPT_OPENERS,
  getRandomInterruptOpener,
  getUrgencyThreshold,
} from '../../types/duelogic.js';
import {
  saveChairInterruption,
  getInterruptionsByDebate,
  getInterruptionCountsByReason,
  getInterruptionCountsByChair,
} from '../../db/repositories/duelogic-repository.js';
import { quickSteelManCheck } from './response-evaluator.js';

const logger = pino({
  name: 'chair-interruption-engine',
  level: process.env.LOG_LEVEL || 'info',
});

// ============================================================================
// Types
// ============================================================================

/**
 * Context for evaluating whether an interrupt should occur
 */
export interface InterruptEvaluationContext {
  /** Chair currently speaking */
  currentSpeaker: DuelogicChair;

  /** Other chairs who could potentially interrupt */
  otherChairs: DuelogicChair[];

  /** Content being spoken (what might trigger interrupt) */
  recentContent: string;

  /** Debate transcript so far for context */
  debateSoFar: string;

  /** Debate topic/proposition */
  topic: string;
}

/**
 * Quick heuristic check result
 */
export interface QuickInterruptCheck {
  potentialTrigger: boolean;
  likelyReason?: ChairInterruptReason;
  confidence?: number;
}

/**
 * Interrupt statistics for a debate
 */
export interface InterruptStats {
  totalInterrupts: number;
  byChair: Map<string, number>;
  byReason: Map<ChairInterruptReason, number>;
}

/**
 * Options for ChairInterruptionEngine constructor
 */
export interface ChairInterruptionEngineOptions {
  llmClient?: LLMClient;
  modelId?: string;
  config: DuelogicConfig;
  debateId: string;
  enablePersistence?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default model for interrupt evaluation */
const DEFAULT_EVALUATION_MODEL = 'anthropic/claude-3-haiku';

// ============================================================================
// Quick Heuristic Patterns
// ============================================================================

/**
 * Pattern definitions for quick interrupt detection
 */
const INTERRUPT_PATTERNS: Array<{ pattern: RegExp; reason: ChairInterruptReason; confidence: number }> = [
  // Straw-man indicators (high confidence)
  { pattern: /they (just|only|simply) want/i, reason: 'straw_man_detected', confidence: 0.8 },
  { pattern: /that's (ridiculous|absurd|naive|foolish)/i, reason: 'straw_man_detected', confidence: 0.7 },
  { pattern: /their position is (just|merely|simply)/i, reason: 'straw_man_detected', confidence: 0.75 },
  { pattern: /all they care about is/i, reason: 'straw_man_detected', confidence: 0.8 },

  // Factual errors about frameworks
  { pattern: /utilitarians? (don't|never|can't) care about/i, reason: 'factual_correction', confidence: 0.85 },
  { pattern: /virtue ethics (ignores?|has no|doesn't)/i, reason: 'factual_correction', confidence: 0.85 },
  { pattern: /deontolog(ists?|ical) (never|always) say/i, reason: 'factual_correction', confidence: 0.8 },
  { pattern: /libertarians? believe everyone should/i, reason: 'factual_correction', confidence: 0.7 },

  // Pivotal claims
  { pattern: /the (real|fundamental|core|central) (issue|question|problem|disagreement) is/i, reason: 'pivotal_point', confidence: 0.75 },
  { pattern: /this is (exactly|precisely) (where|why|what)/i, reason: 'pivotal_point', confidence: 0.7 },
  { pattern: /here('s| is) (the crux|where we differ|our fundamental)/i, reason: 'pivotal_point', confidence: 0.8 },

  // Strong claims warranting challenge
  { pattern: /(obviously|clearly|undeniably|certainly|unquestionably) (wrong|false|mistaken|incorrect)/i, reason: 'direct_challenge', confidence: 0.85 },
  { pattern: /no reasonable person (would|could)/i, reason: 'direct_challenge', confidence: 0.9 },
  { pattern: /anyone who (thinks|believes|claims)/i, reason: 'direct_challenge', confidence: 0.6 },

  // Clarification signals
  { pattern: /what (I mean|we're saying) is that/i, reason: 'clarification_needed', confidence: 0.5 },
  { pattern: /to put it (simply|another way|differently)/i, reason: 'clarification_needed', confidence: 0.4 },

  // Strong agreement indicators
  { pattern: /this is (exactly|precisely) (right|correct|the point)/i, reason: 'strong_agreement', confidence: 0.7 },
  { pattern: /you('ve| have) (hit|touched|identified) (on )?something/i, reason: 'strong_agreement', confidence: 0.75 },
];

// ============================================================================
// ChairInterruptionEngine Class
// ============================================================================

/**
 * Chair Interruption Engine
 *
 * Evaluates when chairs should interrupt each other during Duelogic debates.
 */
export class ChairInterruptionEngine {
  private llmClient: LLMClient;
  private modelId: string;
  private config: DuelogicConfig;
  private debateId: string;
  private enablePersistence: boolean;

  /** Tracks last interrupt time per chair for cooldown enforcement */
  private lastInterruptTime: Map<string, number>;

  /** Tracks total interrupts per chair (for rate limiting within debate) */
  private interruptCounts: Map<string, number>;

  constructor(options: ChairInterruptionEngineOptions) {
    this.modelId = options.modelId || options.config.arbiter.modelId || DEFAULT_EVALUATION_MODEL;
    this.llmClient = options.llmClient || createOpenRouterClient(this.modelId);
    this.config = options.config;
    this.debateId = options.debateId;
    this.enablePersistence = options.enablePersistence ?? true;
    this.lastInterruptTime = new Map();
    this.interruptCounts = new Map();

    logger.info(
      {
        debateId: this.debateId,
        interruptionsEnabled: this.config.interruptions.enabled,
        aggressiveness: this.config.interruptions.aggressiveness,
        cooldownSeconds: this.config.interruptions.cooldownSeconds,
      },
      'ChairInterruptionEngine initialized'
    );
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Evaluate whether any chair should interrupt the current speaker
   *
   * Returns a ChairInterruptCandidate if an interrupt should occur, or null otherwise.
   */
  async evaluateInterrupt(
    context: InterruptEvaluationContext
  ): Promise<ChairInterruptCandidate | null> {
    // Check if interruptions are enabled
    if (!this.config.interruptions.enabled) {
      logger.debug('Interruptions disabled');
      return null;
    }

    if (!this.config.interruptions.allowChairInterruptions) {
      logger.debug('Chair interruptions disabled');
      return null;
    }

    // Filter out chairs on cooldown
    const eligibleChairs = context.otherChairs.filter((chair) =>
      this.canInterrupt(chair.position)
    );

    if (eligibleChairs.length === 0) {
      logger.debug('No eligible chairs (all on cooldown)');
      return null;
    }

    // Quick heuristic check first for efficiency
    const quickCheck = this.quickInterruptCheck(context.recentContent);
    if (!quickCheck.potentialTrigger) {
      // No heuristic match, only do full evaluation for higher aggressiveness
      if (this.config.interruptions.aggressiveness < 3) {
        return null;
      }
    }

    // Get urgency threshold based on aggressiveness
    const urgencyThreshold = this.getUrgencyThreshold();

    // Full LLM evaluation
    try {
      const prompt = this.buildEvaluationPrompt(context, eligibleChairs);

      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.3, maxTokens: 400 }
      );

      const parsed = this.parseEvaluationResponse(response);

      if (!parsed || !parsed.shouldInterrupt) {
        return null;
      }

      if (parsed.urgency < urgencyThreshold) {
        logger.debug(
          { urgency: parsed.urgency, threshold: urgencyThreshold },
          'Urgency below threshold'
        );
        return null;
      }

      // Find the interrupting chair
      const interruptingChair = eligibleChairs.find(
        (c) => c.position === parsed.interruptingChairPosition
      );

      if (!interruptingChair) {
        logger.warn({ position: parsed.interruptingChairPosition }, 'Invalid interrupting chair position');
        return null;
      }

      // Build the interrupt candidate
      const candidate: ChairInterruptCandidate = {
        interruptingChair,
        interruptedChair: context.currentSpeaker,
        triggerReason: parsed.reason,
        triggerContent: parsed.triggerContent,
        urgency: parsed.urgency,
        suggestedOpener: parsed.suggestedOpener || getRandomInterruptOpener(parsed.reason),
      };

      // Record the interrupt
      await this.recordInterrupt(candidate);

      logger.info(
        {
          interrupter: candidate.interruptingChair.position,
          interrupted: candidate.interruptedChair.position,
          reason: candidate.triggerReason,
          urgency: candidate.urgency,
        },
        'Interrupt triggered'
      );

      return candidate;
    } catch (error) {
      logger.error({ error }, 'Failed to evaluate interrupt');
      return null;
    }
  }

  /**
   * Quick heuristic check for potential interrupt triggers
   *
   * Use before full LLM evaluation for efficiency. This is a fast
   * pattern-matching check that identifies obvious interrupt triggers.
   */
  quickInterruptCheck(content: string): QuickInterruptCheck {
    for (const { pattern, reason, confidence } of INTERRUPT_PATTERNS) {
      if (pattern.test(content)) {
        return {
          potentialTrigger: true,
          likelyReason: reason,
          confidence,
        };
      }
    }

    // Also check for lack of steel-manning (potential straw-man)
    // Only flag if content is critique-like without steel-man patterns
    const isCritique = /but|however|wrong|disagree|problem/i.test(content);
    const hasSteelMan = quickSteelManCheck(content);

    if (isCritique && !hasSteelMan && content.length > 100) {
      return {
        potentialTrigger: true,
        likelyReason: 'straw_man_detected',
        confidence: 0.5,
      };
    }

    return { potentialTrigger: false };
  }

  /**
   * Check if a chair can interrupt (not on cooldown)
   */
  canInterrupt(chairPosition: string): boolean {
    const lastTime = this.lastInterruptTime.get(chairPosition);
    if (!lastTime) {
      return true;
    }

    const cooldownMs = this.config.interruptions.cooldownSeconds * 1000;
    return Date.now() - lastTime >= cooldownMs;
  }

  /**
   * Get remaining cooldown time for a chair (in seconds)
   */
  getCooldownRemaining(chairPosition: string): number {
    const lastTime = this.lastInterruptTime.get(chairPosition);
    if (!lastTime) {
      return 0;
    }

    const cooldownMs = this.config.interruptions.cooldownSeconds * 1000;
    const elapsed = Date.now() - lastTime;
    const remaining = Math.max(0, cooldownMs - elapsed);

    return Math.ceil(remaining / 1000);
  }

  /**
   * Get the urgency threshold for the current aggressiveness level
   */
  getUrgencyThreshold(): number {
    return getUrgencyThreshold(this.config.interruptions.aggressiveness);
  }

  /**
   * Reset all cooldowns (useful for testing or new debate segments)
   */
  resetCooldowns(): void {
    this.lastInterruptTime.clear();
    logger.debug('Cooldowns reset');
  }

  /**
   * Reset interrupt counts (useful for new debate segments)
   */
  resetCounts(): void {
    this.interruptCounts.clear();
    logger.debug('Interrupt counts reset');
  }

  /**
   * Get interrupt statistics for the debate from database
   */
  async getInterruptStats(): Promise<InterruptStats> {
    const interrupts = await getInterruptionsByDebate(this.debateId);

    const byChair = new Map<string, number>();
    const byReason = new Map<ChairInterruptReason, number>();

    for (const interrupt of interrupts) {
      byChair.set(
        interrupt.interruptingChair,
        (byChair.get(interrupt.interruptingChair) || 0) + 1
      );
      byReason.set(
        interrupt.triggerReason,
        (byReason.get(interrupt.triggerReason) || 0) + 1
      );
    }

    return {
      totalInterrupts: interrupts.length,
      byChair,
      byReason,
    };
  }

  /**
   * Get detailed interrupt counts from database
   */
  async getDetailedInterruptCounts(): Promise<{
    byReason: Map<ChairInterruptReason, number>;
    byChair: { made: Map<string, number>; received: Map<string, number> };
  }> {
    const [byReason, byChair] = await Promise.all([
      getInterruptionCountsByReason(this.debateId),
      getInterruptionCountsByChair(this.debateId),
    ]);

    return { byReason, byChair };
  }

  /**
   * Manually trigger an interrupt (for testing or UI controls)
   */
  async triggerManualInterrupt(
    interruptingChair: DuelogicChair,
    interruptedChair: DuelogicChair,
    reason: ChairInterruptReason,
    triggerContent: string
  ): Promise<ChairInterruptCandidate> {
    const candidate: ChairInterruptCandidate = {
      interruptingChair,
      interruptedChair,
      triggerReason: reason,
      triggerContent,
      urgency: 1.0, // Manual = high urgency
      suggestedOpener: getRandomInterruptOpener(reason),
    };

    await this.recordInterrupt(candidate);

    return candidate;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Record an interrupt (update cooldowns and persist to database)
   */
  private async recordInterrupt(candidate: ChairInterruptCandidate): Promise<void> {
    // Update cooldown tracking
    this.lastInterruptTime.set(candidate.interruptingChair.position, Date.now());

    // Update count tracking
    const currentCount = this.interruptCounts.get(candidate.interruptingChair.position) || 0;
    this.interruptCounts.set(candidate.interruptingChair.position, currentCount + 1);

    // Persist to database if enabled
    if (this.enablePersistence) {
      try {
        await saveChairInterruption(this.debateId, candidate, Date.now());
      } catch (error) {
        logger.error({ error }, 'Failed to persist interrupt');
      }
    }
  }

  /**
   * Build the LLM prompt for interrupt evaluation
   */
  private buildEvaluationPrompt(
    context: InterruptEvaluationContext,
    eligibleChairs: DuelogicChair[]
  ): string {
    const speakerInfo = PHILOSOPHICAL_CHAIR_INFO[context.currentSpeaker.framework];

    const aggressivenessDesc = this.getAggressivenessDescription();

    return `You are evaluating whether any chair should interrupt the current speaker in a philosophical debate.

**CURRENT SPEAKER:**
${context.currentSpeaker.modelDisplayName || context.currentSpeaker.modelId}
Framework: ${speakerInfo.name}
Position: ${context.currentSpeaker.position}

**WHAT THEY JUST SAID:**
"${context.recentContent}"

**CHAIRS WHO COULD INTERRUPT:**
${eligibleChairs.map((c) => {
  const info = PHILOSOPHICAL_CHAIR_INFO[c.framework];
  return `- ${c.position}: ${c.modelDisplayName || c.modelId} (${info.name})`;
}).join('\n')}

**DEBATE TOPIC:** ${context.topic}

**RECENT DEBATE CONTEXT:**
${context.debateSoFar.slice(-800)}

---

**VALID INTERRUPT REASONS (choose ONE if interrupting):**

1. **factual_correction** - Speaker made a factual error about a philosophical framework
   - "That's not what utilitarianism actually claims..."
   - Use when a framework is being mischaracterized

2. **straw_man_detected** - Speaker is attacking a weakened version of a position
   - "Hold on, you're misrepresenting my position..."
   - Use when the speaker creates a weak version to attack

3. **direct_challenge** - A specific point demands immediate pushback
   - "I have to push back on that..."
   - Use for bold claims that need challenging

4. **clarification_needed** - Something crucial is unclear or ambiguous
   - "Wait, what do you mean by..."
   - Use sparingly, only for genuinely confusing statements

5. **strong_agreement** - A point is so good it deserves amplification
   - "Yes! This is exactly right..."
   - Use rarely, only for exceptional insights

6. **pivotal_point** - The core disagreement is being crystallized
   - "This is exactly the crux of our disagreement..."
   - Use when the fundamental tension is revealed

---

**EVALUATION GUIDANCE:**

Aggressiveness Level: ${this.config.interruptions.aggressiveness}/5
${aggressivenessDesc}

**KEY CONSIDERATIONS:**
- Only interrupt for GENUINELY SIGNIFICANT moments
- Consider which chair has the strongest reason to interrupt
- The interrupt should advance the debate, not just score points
- Straw-manning is a serious violation worth interrupting
- Factual errors about frameworks should be corrected
- Don't interrupt just because someone is wrong

---

**OUTPUT FORMAT (strict JSON):**
{
  "shouldInterrupt": boolean,
  "interruptingChairPosition": "chair_1" | "chair_2" | ... | null,
  "reason": "factual_correction" | "straw_man_detected" | "direct_challenge" | "clarification_needed" | "strong_agreement" | "pivotal_point",
  "triggerContent": "the specific phrase or claim that triggered this",
  "urgency": 0.0-1.0,
  "suggestedOpener": "how the interruption should start (2-8 words)"
}

If no interrupt is warranted, return:
{ "shouldInterrupt": false, "interruptingChairPosition": null, "urgency": 0 }

Evaluate now:`;
  }

  /**
   * Parse the LLM evaluation response
   */
  private parseEvaluationResponse(content: string): {
    shouldInterrupt: boolean;
    interruptingChairPosition: string | null;
    reason: ChairInterruptReason;
    triggerContent: string;
    urgency: number;
    suggestedOpener?: string;
  } | null {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in evaluation response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (typeof parsed.shouldInterrupt !== 'boolean') {
        return null;
      }

      if (!parsed.shouldInterrupt) {
        return {
          shouldInterrupt: false,
          interruptingChairPosition: null,
          reason: 'direct_challenge',
          triggerContent: '',
          urgency: 0,
        };
      }

      // Validate interrupt reason
      const validReasons: ChairInterruptReason[] = [
        'factual_correction',
        'straw_man_detected',
        'direct_challenge',
        'clarification_needed',
        'strong_agreement',
        'pivotal_point',
      ];

      if (!validReasons.includes(parsed.reason)) {
        parsed.reason = 'direct_challenge'; // Fallback
      }

      // Clamp urgency
      parsed.urgency = Math.max(0, Math.min(1, parsed.urgency || 0));

      return {
        shouldInterrupt: true,
        interruptingChairPosition: parsed.interruptingChairPosition,
        reason: parsed.reason,
        triggerContent: parsed.triggerContent || '',
        urgency: parsed.urgency,
        suggestedOpener: parsed.suggestedOpener,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to parse evaluation response');
      return null;
    }
  }

  /**
   * Get human-readable description of aggressiveness level
   */
  private getAggressivenessDescription(): string {
    const level = this.config.interruptions.aggressiveness;

    if (level <= 1) {
      return '(Very Conservative - only interrupt for major issues like blatant straw-manning or serious factual errors)';
    } else if (level === 2) {
      return '(Conservative - interrupt for significant issues that meaningfully affect the debate)';
    } else if (level === 3) {
      return '(Moderate - interrupt for meaningful moments that advance the discussion)';
    } else if (level === 4) {
      return '(Aggressive - interrupt frequently when there are opportunities to engage)';
    } else {
      return '(Very Aggressive - interrupt liberally for any interesting point of contention)';
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a ChairInterruptionEngine with Duelogic config
 */
export function createChairInterruptionEngine(
  config: DuelogicConfig,
  debateId: string,
  llmClient?: LLMClient
): ChairInterruptionEngine {
  return new ChairInterruptionEngine({
    config,
    debateId,
    llmClient,
    enablePersistence: true,
  });
}

/**
 * Create a lightweight ChairInterruptionEngine for testing
 */
export function createTestInterruptionEngine(
  config: DuelogicConfig,
  debateId: string
): ChairInterruptionEngine {
  return new ChairInterruptionEngine({
    config,
    debateId,
    enablePersistence: false,
  });
}
