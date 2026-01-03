/**
 * Arbiter Agent for Duelogic Debate Mode
 *
 * The Arbiter is the host and referee of Duelogic debates:
 * - Provides engaging podcast-style introductions
 * - Monitors responses for principle violations
 * - Issues interjections when chairs fail their obligations
 * - Delivers synthesizing closings
 * - Tracks evaluation metrics
 */

import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import type { SSEManager } from '../sse/sse-manager.js';
import {
  type DuelogicConfig,
  type DuelogicChair,
  type ResponseEvaluation,
  type AccountabilityLevel,
  PHILOSOPHICAL_CHAIR_INFO,
} from '../../types/duelogic.js';
import {
  buildPodcastIntroPrompt,
  buildPodcastClosingPrompt,
  buildInterjectionPrompt,
  buildEvaluationPrompt,
  quickSteelManCheck,
  quickSelfCritiqueCheck,
  parseEvaluationResponse,
  getDefaultEvaluation,
  type PodcastIntroContext,
  type PodcastClosingContext,
  type EvaluationContext,
  type ViolationType,
} from './prompts/arbiter-prompts.js';
import { createOpenRouterClient, type OpenRouterLLMClient } from '../llm/openrouter-adapter.js';

const logger = pino({
  name: 'arbiter-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Options for ArbiterAgent constructor
 */
export interface ArbiterAgentOptions {
  llmClient?: LLMClient;
  sseManager?: SSEManager;
  config: DuelogicConfig;
  debateId: string;
}

/**
 * Arbiter Agent Class
 *
 * Responsibilities:
 * - Generate podcast introductions
 * - Evaluate responses for steel-manning/self-critique
 * - Issue interjections for violations
 * - Generate podcast closings
 */
export class ArbiterAgent {
  private llmClient: LLMClient;
  private sseManager?: SSEManager;
  private config: DuelogicConfig;
  private debateId: string;
  private evaluationCache: Map<string, ResponseEvaluation>;

  constructor(options: ArbiterAgentOptions) {
    // Create OpenRouter client for arbiter model or use provided client
    this.llmClient = options.llmClient || createOpenRouterClient(options.config.arbiter.modelId);
    this.sseManager = options.sseManager;
    this.config = options.config;
    this.debateId = options.debateId;
    this.evaluationCache = new Map();

    logger.info(
      {
        debateId: options.debateId,
        modelId: options.config.arbiter.modelId,
        accountabilityLevel: options.config.arbiter.accountabilityLevel,
      },
      'ArbiterAgent initialized'
    );
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'ArbiterAgent',
      version: '1.0.0',
      model: this.config.arbiter.modelId,
      capabilities: [
        'podcast-introduction',
        'podcast-closing',
        'response-evaluation',
        'violation-interjection',
        'accountability-enforcement',
      ],
    };
  }

  /**
   * Generate podcast-style introduction
   */
  async generateIntroduction(
    proposition: string,
    propositionContext?: string
  ): Promise<string> {
    logger.info({ debateId: this.debateId, proposition }, 'Generating podcast introduction');

    const context: PodcastIntroContext = {
      proposition,
      propositionContext,
      chairs: this.config.chairs,
      showName: this.config.podcastMode.showName,
      episodeNumber: this.config.podcastMode.episodeNumber,
    };

    const prompt = buildPodcastIntroPrompt(context);

    try {
      // Use streaming if SSE manager is available
      if (this.sseManager && this.llmClient instanceof OpenRouterLLMClient) {
        return await this.generateWithStreaming(prompt, 'introduction', 0.8, 800);
      }

      // Fall back to non-streaming
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.8, maxTokens: 800 }
      );

      logger.info(
        { debateId: this.debateId, length: response.length },
        'Podcast introduction generated'
      );

      return response;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId },
        'Failed to generate podcast introduction'
      );
      throw error;
    }
  }

  /**
   * Generate podcast-style closing
   */
  async generateClosing(
    proposition: string,
    transcript: string,
    evaluations: Map<string, ResponseEvaluation[]>
  ): Promise<string> {
    logger.info(
      { debateId: this.debateId, transcriptLength: transcript.length },
      'Generating podcast closing'
    );

    const context: PodcastClosingContext = {
      proposition,
      chairs: this.config.chairs,
      transcript,
      evaluations,
      showName: this.config.podcastMode.showName,
      includeCallToAction: this.config.podcastMode.includeCallToAction,
    };

    const prompt = buildPodcastClosingPrompt(context);

    try {
      // Use streaming if SSE manager is available
      if (this.sseManager && this.llmClient instanceof OpenRouterLLMClient) {
        return await this.generateWithStreaming(prompt, 'synthesis', 0.7, 1200);
      }

      // Fall back to non-streaming
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 1200 }
      );

      logger.info(
        { debateId: this.debateId, length: response.length },
        'Podcast closing generated'
      );

      return response;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId },
        'Failed to generate podcast closing'
      );
      throw error;
    }
  }

  /**
   * Generate an interjection for a violation
   */
  async generateInterjection(
    violation: ViolationType,
    violatingChair: DuelogicChair,
    violatingContent: string
  ): Promise<string> {
    logger.info(
      {
        debateId: this.debateId,
        violation,
        chair: violatingChair.position,
      },
      'Generating interjection'
    );

    const prompt = buildInterjectionPrompt(violation, violatingChair, violatingContent);

    try {
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.5, maxTokens: 150 }
      );

      logger.info(
        { debateId: this.debateId, violation, length: response.length },
        'Interjection generated'
      );

      return response;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, violation },
        'Failed to generate interjection'
      );
      throw error;
    }
  }

  /**
   * Evaluate a chair's response for adherence to Duelogic principles
   */
  async evaluateResponse(context: EvaluationContext): Promise<ResponseEvaluation> {
    // Check cache first
    const cacheKey = this.getCacheKey(context);
    if (this.evaluationCache.has(cacheKey)) {
      logger.debug({ cacheKey }, 'Returning cached evaluation');
      return this.evaluationCache.get(cacheKey)!;
    }

    // Skip detailed evaluation for relaxed accountability
    if (this.config.arbiter.accountabilityLevel === 'relaxed') {
      const quickEval = this.performQuickEvaluation(context);
      this.evaluationCache.set(cacheKey, quickEval);
      return quickEval;
    }

    logger.info(
      {
        debateId: this.debateId,
        chair: context.chair.position,
        framework: context.chair.framework,
      },
      'Evaluating response'
    );

    const prompt = buildEvaluationPrompt(context);

    try {
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.3, maxTokens: 600 }
      );

      const evaluation = parseEvaluationResponse(response) || getDefaultEvaluation();

      // Apply accountability level adjustments
      const adjustedEvaluation = this.adjustForAccountability(evaluation);

      // Cache result
      this.evaluationCache.set(cacheKey, adjustedEvaluation);

      logger.info(
        {
          debateId: this.debateId,
          chair: context.chair.position,
          adherenceScore: adjustedEvaluation.adherenceScore,
          requiresInterjection: adjustedEvaluation.requiresInterjection,
        },
        'Response evaluated'
      );

      return adjustedEvaluation;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, chair: context.chair.position },
        'Failed to evaluate response'
      );

      // Return default on error
      return getDefaultEvaluation();
    }
  }

  /**
   * Perform quick heuristic evaluation without LLM call
   * Used for relaxed accountability mode or initial screening
   */
  performQuickEvaluation(context: EvaluationContext): ResponseEvaluation {
    const hasSteelMan = quickSteelManCheck(context.responseContent);
    const hasSelfCritique = quickSelfCritiqueCheck(context.responseContent);

    // Simple scoring based on heuristics
    let score = 50;
    if (hasSteelMan) score += 20;
    if (hasSelfCritique) score += 20;

    return {
      adherenceScore: score,
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
      requiresInterjection: false, // Relaxed mode doesn't trigger interjections
    };
  }

  /**
   * Check if evaluation should be performed based on config
   */
  shouldEvaluate(): boolean {
    return this.config.arbiter.accountabilityLevel !== 'relaxed';
  }

  /**
   * Determine if an interjection should be issued based on evaluation
   */
  shouldInterject(evaluation: ResponseEvaluation): boolean {
    // Never interject if arbiter interjections are disabled
    if (!this.config.mandates.arbiterCanInterject) {
      return false;
    }

    // Never interject in relaxed mode
    if (this.config.arbiter.accountabilityLevel === 'relaxed') {
      return false;
    }

    // Strict mode: interject for any significant violation
    if (this.config.arbiter.accountabilityLevel === 'strict') {
      return evaluation.requiresInterjection || evaluation.adherenceScore < 60;
    }

    // Moderate mode: only interject for major violations
    return evaluation.requiresInterjection && evaluation.adherenceScore < 40;
  }

  /**
   * Determine the type of violation from an evaluation
   */
  determineViolationType(evaluation: ResponseEvaluation): ViolationType | null {
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
    logger.debug({ debateId: this.debateId }, 'Evaluation cache cleared');
  }

  /**
   * Get evaluation statistics for the session
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.evaluationCache.size,
      entries: Array.from(this.evaluationCache.keys()),
    };
  }

  // =========================================================================
  // PRIVATE HELPER METHODS
  // =========================================================================

  /**
   * Generate with streaming, broadcasting tokens via SSE
   */
  private async generateWithStreaming(
    prompt: string,
    segment: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const chunks: string[] = [];

    try {
      const stream = (this.llmClient as OpenRouterLLMClient).streamChat(
        [{ role: 'user', content: prompt }],
        { temperature, maxTokens }
      );

      for await (const chunk of stream) {
        chunks.push(chunk);

        // Broadcast token via SSE
        if (this.sseManager) {
          this.sseManager.broadcast(this.debateId, {
            type: 'token',
            data: { speaker: 'arbiter', segment, token: chunk },
          });
        }
      }

      const fullContent = chunks.join('');
      return fullContent;
    } catch (error) {
      logger.error({ error, segment }, 'Streaming generation failed');
      throw error;
    }
  }

  /**
   * Generate cache key for evaluation
   */
  private getCacheKey(context: EvaluationContext): string {
    return `${context.chair.position}:${context.responseContent.slice(0, 100)}`;
  }

  /**
   * Adjust evaluation based on accountability level
   */
  private adjustForAccountability(evaluation: ResponseEvaluation): ResponseEvaluation {
    const level = this.config.arbiter.accountabilityLevel;

    if (level === 'relaxed') {
      // Lower thresholds for interjection
      return {
        ...evaluation,
        requiresInterjection: false, // Never in relaxed
      };
    }

    if (level === 'strict') {
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

/**
 * Factory function to create ArbiterAgent
 */
export function createArbiterAgent(options: ArbiterAgentOptions): ArbiterAgent {
  return new ArbiterAgent(options);
}
