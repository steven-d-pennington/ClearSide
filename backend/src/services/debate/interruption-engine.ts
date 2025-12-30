/**
 * Interruption Engine
 * Evaluates and schedules interrupts for lively debate mode.
 * Uses LLM to detect contradictions and generate short interjections.
 */

import { EventEmitter } from 'events';
import { Speaker } from '../../types/debate.js';
import type {
  LivelySettings,
  InterruptCandidate,
  Interruption,
  CreateInterruptionInput,
} from '../../types/lively.js';
import type { SimpleLLMRequest, LLMResponse } from '../../types/llm.js';
import * as livelyRepository from '../../db/repositories/lively-repository.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Interface for LLM client used by InterruptionEngine
 * Accepts SimpleLLMRequest since provider/model are managed by the client
 */
interface InterruptionLLMClient {
  complete(request: SimpleLLMRequest): Promise<LLMResponse>;
}

const logger = createLogger({ module: 'InterruptionEngine' });

/**
 * Events emitted by the InterruptionEngine
 */
export interface InterruptionEngineEvents {
  'candidate:detected': (candidate: InterruptCandidate) => void;
  'interrupt:scheduled': (candidate: InterruptCandidate, scheduledMs: number) => void;
  'interrupt:fired': (candidate: InterruptCandidate, interjection: string) => void;
  'interrupt:cancelled': (candidate: InterruptCandidate, reason: string) => void;
  'interrupt:suppressed': (candidate: InterruptCandidate, reason: string) => void;
}

/**
 * Prompt for detecting interrupt opportunities
 */
const INTERRUPT_DETECTION_PROMPT = `You are analyzing a live debate for potential interruption opportunities.

Current speaker: {currentSpeaker}
Current content being said:
"""
{content}
"""

Other participants who could interrupt: {otherParticipants}

Analyze if there's a strong opportunity for one of the other participants to interject.
Look for:
1. Factual errors or misrepresentations that could be challenged
2. Logical fallacies that could be pointed out
3. Strong claims that invite immediate rebuttal
4. Dismissive statements that warrant defense
5. Key points that directly contradict known arguments

Respond in JSON format:
{
  "shouldInterrupt": true/false,
  "interrupter": "pro_advocate" | "con_advocate" | "moderator" | null,
  "relevanceScore": 0.0-1.0,
  "contradictionScore": 0.0-1.0,
  "triggerPhrase": "the specific phrase that triggered this",
  "reason": "brief explanation of why interrupt is warranted"
}

Only recommend interrupt if relevanceScore >= 0.6 and there's genuine substance to challenge.`;

/**
 * Prompt for generating short interjections
 */
const INTERJECTION_PROMPT = `You are {speaker} in a lively debate. You need to make a brief interjection (1-2 sentences only).

The debate topic: {topic}
Your position: {position}

You are interrupting because: {reason}
Trigger phrase you're responding to: "{triggerPhrase}"

Generate a punchy, direct interjection that:
- Is 1-2 sentences maximum (under 40 words)
- Directly challenges the specific point
- Sounds natural as an interruption
- Maintains your persona and position

Your interjection (remember: 1-2 sentences only):`;

/**
 * Context provided for interrupt evaluation
 */
export interface EvaluationContext {
  debateId: string;
  topic: string;
  currentSpeaker: Speaker;
  otherParticipants: Speaker[];
  recentContent: string;
  debateElapsedMs: number;
  proPosition?: string;
  conPosition?: string;
}

/**
 * InterruptionEngine Class
 * Manages interrupt detection, scheduling, and interjection generation
 */
export class InterruptionEngine extends EventEmitter {
  private readonly settings: LivelySettings;
  private readonly llmClient: InterruptionLLMClient;
  private readonly debateId: string;

  /** Pending interrupt candidate (not yet fired) */
  private pendingCandidate: InterruptCandidate | null = null;
  private pendingInterruptionId: number | null = null;

  /** Last interrupt time per speaker (for cooldowns) */
  private lastInterruptTime: Map<Speaker, number> = new Map();

  /** Interrupts fired this minute (for rate limiting) */
  private interruptsThisMinute: number = 0;
  private minuteStartMs: number = 0;

  /** Lock to prevent concurrent evaluations */
  private isEvaluating: boolean = false;

  constructor(debateId: string, settings: LivelySettings, llmClient: InterruptionLLMClient) {
    super();
    this.debateId = debateId;
    this.settings = settings;
    this.llmClient = llmClient;
    this.minuteStartMs = Date.now();

    logger.info(
      { debateId, aggressionLevel: settings.aggressionLevel },
      'InterruptionEngine initialized'
    );
  }

  /**
   * Evaluate current content for interrupt opportunities
   * Returns a candidate if interruption is warranted
   */
  async evaluateForInterrupt(
    context: EvaluationContext
  ): Promise<InterruptCandidate | null> {
    // Prevent concurrent evaluations
    if (this.isEvaluating) {
      return null;
    }

    this.isEvaluating = true;

    try {
      // Reset minute counter if needed
      this.checkMinuteReset();

      // Check if we've hit rate limit
      if (this.interruptsThisMinute >= this.settings.maxInterruptsPerMinute) {
        logger.debug('Rate limit reached for interrupts this minute');
        return null;
      }

      // Build prompt
      const prompt = INTERRUPT_DETECTION_PROMPT
        .replace('{currentSpeaker}', this.formatSpeaker(context.currentSpeaker))
        .replace('{content}', context.recentContent)
        .replace('{otherParticipants}', context.otherParticipants.map(this.formatSpeaker).join(', '));

      // Call LLM for evaluation (model is determined by the client passed to constructor)
      const response = await this.llmClient.complete({
        messages: [
          { role: 'system', content: 'You are analyzing debate content for interruption opportunities. Respond only in JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3, // Low temp for consistent analysis
        maxTokens: 200,
      });

      // Parse response
      const result = this.parseEvaluationResponse(response.content);

      if (!result || !result.shouldInterrupt) {
        return null;
      }

      // Apply aggression multiplier
      const adjustedRelevance = this.applyAggressionMultiplier(result.relevanceScore);

      // Check threshold
      if (adjustedRelevance < this.settings.relevanceThreshold) {
        logger.debug(
          { adjustedRelevance, threshold: this.settings.relevanceThreshold },
          'Relevance below threshold'
        );
        return null;
      }

      // Check cooldown for the interrupter
      if (!this.canSpeakerInterrupt(result.interrupter)) {
        logger.debug({ speaker: result.interrupter }, 'Speaker on cooldown');
        return null;
      }

      // Create candidate
      const candidate: InterruptCandidate = {
        speaker: result.interrupter,
        relevanceScore: result.relevanceScore,
        contradictionScore: result.contradictionScore,
        combinedScore: adjustedRelevance + (result.contradictionScore * this.settings.contradictionBoost),
        triggerPhrase: result.triggerPhrase,
      };

      logger.info(
        { candidate, currentSpeaker: context.currentSpeaker },
        'Interrupt candidate detected'
      );

      this.emit('candidate:detected', candidate);
      return candidate;

    } catch (error) {
      logger.error({ error }, 'Error evaluating for interrupt');
      return null;
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Schedule an interrupt for the next safe boundary
   */
  async scheduleInterrupt(
    candidate: InterruptCandidate,
    scheduledAtMs: number,
    interruptedSpeaker: Speaker
  ): Promise<number> {
    // Create database record
    const input: CreateInterruptionInput = {
      debateId: this.debateId,
      scheduledAtMs,
      interrupter: candidate.speaker,
      interruptedSpeaker,
      triggerPhrase: candidate.triggerPhrase,
      relevanceScore: candidate.relevanceScore,
      contradictionScore: candidate.contradictionScore,
    };

    const interruption = await livelyRepository.createInterruption(input);

    this.pendingCandidate = candidate;
    this.pendingInterruptionId = interruption.id;

    logger.info(
      { interruptionId: interruption.id, speaker: candidate.speaker, scheduledAtMs },
      'Interrupt scheduled'
    );

    this.emit('interrupt:scheduled', candidate, scheduledAtMs);

    return interruption.id;
  }

  /**
   * Fire a scheduled interrupt and generate interjection
   */
  async fireInterrupt(
    context: EvaluationContext,
    atToken: number,
    firedAtMs: number
  ): Promise<{ interjection: string; interruption: Interruption } | null> {
    if (!this.pendingCandidate || !this.pendingInterruptionId) {
      logger.warn('No pending interrupt to fire');
      return null;
    }

    const candidate = this.pendingCandidate;
    const interruptionId = this.pendingInterruptionId;

    try {
      // Generate interjection content
      const interjection = await this.generateInterjection(candidate, context);

      // Update database record
      const interruption = await livelyRepository.fireInterruption(
        interruptionId,
        interjection,
        atToken,
        firedAtMs
      );

      if (!interruption) {
        throw new Error('Failed to update interruption record');
      }

      // Update tracking
      this.lastInterruptTime.set(candidate.speaker, firedAtMs);
      this.interruptsThisMinute++;

      // Clear pending
      this.pendingCandidate = null;
      this.pendingInterruptionId = null;

      logger.info(
        { interruptionId, speaker: candidate.speaker, interjectionLength: interjection.length },
        'Interrupt fired'
      );

      this.emit('interrupt:fired', candidate, interjection);

      return { interjection, interruption };

    } catch (error) {
      logger.error({ error, interruptionId }, 'Error firing interrupt');

      // Cancel on error
      await this.cancelPendingInterrupt('Generation failed');
      return null;
    }
  }

  /**
   * Cancel a pending interrupt
   */
  async cancelPendingInterrupt(reason: string): Promise<void> {
    if (!this.pendingCandidate || !this.pendingInterruptionId) {
      return;
    }

    const candidate = this.pendingCandidate;

    await livelyRepository.cancelInterruption(this.pendingInterruptionId, reason);

    logger.info(
      { interruptionId: this.pendingInterruptionId, reason },
      'Interrupt cancelled'
    );

    this.emit('interrupt:cancelled', candidate, reason);

    this.pendingCandidate = null;
    this.pendingInterruptionId = null;
  }

  /**
   * Check if there's a pending interrupt
   */
  hasPendingInterrupt(): boolean {
    return this.pendingCandidate !== null;
  }

  /**
   * Get pending candidate
   */
  getPendingCandidate(): InterruptCandidate | null {
    return this.pendingCandidate;
  }

  /**
   * Check if a speaker can interrupt (not on cooldown)
   */
  canSpeakerInterrupt(speaker: Speaker): boolean {
    const lastTime = this.lastInterruptTime.get(speaker);
    if (!lastTime) {
      return true;
    }

    const elapsed = Date.now() - lastTime;
    return elapsed >= this.settings.interruptCooldownMs;
  }

  /**
   * Get cooldown remaining for a speaker (ms)
   */
  getCooldownRemaining(speaker: Speaker): number {
    const lastTime = this.lastInterruptTime.get(speaker);
    if (!lastTime) {
      return 0;
    }

    const elapsed = Date.now() - lastTime;
    const remaining = this.settings.interruptCooldownMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Get interrupts count for current minute
   */
  getInterruptsThisMinute(): number {
    this.checkMinuteReset();
    return this.interruptsThisMinute;
  }

  /**
   * Reset state (for new debate)
   */
  reset(): void {
    this.pendingCandidate = null;
    this.pendingInterruptionId = null;
    this.lastInterruptTime.clear();
    this.interruptsThisMinute = 0;
    this.minuteStartMs = Date.now();
    this.isEvaluating = false;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate a short interjection for the interrupt
   */
  private async generateInterjection(
    candidate: InterruptCandidate,
    context: EvaluationContext
  ): Promise<string> {
    const speakerName = this.formatSpeaker(candidate.speaker);
    const position = candidate.speaker === Speaker.PRO
      ? (context.proPosition ?? 'in favor of the proposition')
      : candidate.speaker === Speaker.CON
        ? (context.conPosition ?? 'against the proposition')
        : 'neutral moderator';

    const prompt = INTERJECTION_PROMPT
      .replace('{speaker}', speakerName)
      .replace('{topic}', context.topic)
      .replace('{position}', position)
      .replace('{reason}', candidate.triggerPhrase)
      .replace('{triggerPhrase}', candidate.triggerPhrase);

    const response = await this.llmClient.complete({
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      maxTokens: this.settings.interjectionMaxTokens,
    });

    // Clean up response
    let interjection = response.content.trim();

    // Remove quotes if present
    if ((interjection.startsWith('"') && interjection.endsWith('"')) ||
        (interjection.startsWith("'") && interjection.endsWith("'"))) {
      interjection = interjection.slice(1, -1);
    }

    return interjection;
  }

  /**
   * Parse the evaluation response from LLM
   */
  private parseEvaluationResponse(content: string): {
    shouldInterrupt: boolean;
    interrupter: Speaker;
    relevanceScore: number;
    contradictionScore: number;
    triggerPhrase: string;
    reason: string;
  } | null {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.shouldInterrupt) {
        return null;
      }

      // Convert LLM response format to Speaker enum
      const interrupter = this.parseSpeakerFromLLM(parsed.interrupter);
      if (!interrupter) {
        logger.warn({ rawInterrupter: parsed.interrupter }, 'Invalid interrupter in LLM response');
        return null;
      }

      return {
        shouldInterrupt: true,
        interrupter,
        relevanceScore: Number(parsed.relevanceScore) || 0,
        contradictionScore: Number(parsed.contradictionScore) || 0,
        triggerPhrase: parsed.triggerPhrase || '',
        reason: parsed.reason || '',
      };
    } catch (error) {
      logger.warn({ content, error }, 'Failed to parse evaluation response');
      return null;
    }
  }

  /**
   * Parse speaker from LLM response format to Speaker enum
   * LLM returns: "pro_advocate" | "con_advocate" | "moderator"
   * We need: Speaker.PRO | Speaker.CON | Speaker.MODERATOR
   */
  private parseSpeakerFromLLM(value: string | null | undefined): Speaker | null {
    if (!value) return null;

    const normalized = value.toLowerCase().trim();

    switch (normalized) {
      case 'pro_advocate':
      case 'pro':
        return Speaker.PRO;
      case 'con_advocate':
      case 'con':
        return Speaker.CON;
      case 'moderator':
        return Speaker.MODERATOR;
      default:
        return null;
    }
  }

  /**
   * Apply aggression multiplier to relevance score
   */
  private applyAggressionMultiplier(baseScore: number): number {
    // Aggression level 1-5 maps to multiplier 0.6-1.4
    const multiplier = 0.6 + (this.settings.aggressionLevel - 1) * 0.2;
    return Math.min(1.0, baseScore * multiplier);
  }

  /**
   * Check and reset minute counter if needed
   */
  private checkMinuteReset(): void {
    const now = Date.now();
    if (now - this.minuteStartMs >= 60000) {
      this.interruptsThisMinute = 0;
      this.minuteStartMs = now;
    }
  }

  /**
   * Format speaker name for prompts
   */
  private formatSpeaker(speaker: Speaker): string {
    switch (speaker) {
      case Speaker.PRO:
        return 'Pro Advocate';
      case Speaker.CON:
        return 'Con Advocate';
      case Speaker.MODERATOR:
        return 'Moderator';
      default:
        return String(speaker);
    }
  }
}

/**
 * Create a new InterruptionEngine instance
 * @param debateId - The debate ID
 * @param settings - Lively debate settings
 * @param llmClient - LLM client for interrupt evaluation (required)
 */
export function createInterruptionEngine(
  debateId: string,
  settings: LivelySettings,
  llmClient: InterruptionLLMClient
): InterruptionEngine {
  return new InterruptionEngine(debateId, settings, llmClient);
}
