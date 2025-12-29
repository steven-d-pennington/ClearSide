/**
 * Moderator Agent Implementation
 *
 * Neutral facilitator for debates. Introduces debates, announces phase transitions,
 * synthesizes discussions, and handles interventions WITHOUT picking winners.
 *
 * CRITICAL: This agent must maintain ABSOLUTE neutrality at all times.
 */

import type { LLMClient } from '../llm/client.js';
import type { LLMRequest } from '../../types/llm.js';
import type {
  BaseAgent,
  ModeratorAgent as IModeratorAgent,
  AgentContext,
} from './types.js';
import type { DebatePhase } from '../../types/debate.js';
import type { Utterance } from '../../types/database.js';
import { llmConfig } from '../../config/llm.js';
import pino from 'pino';
import {
  MODERATOR_PROMPTS,
  MODERATOR_PROMPT_BUILDERS,
} from './prompts/moderator-prompts.js';

/**
 * Logger for moderator operations
 */
const logger = pino({
  name: 'moderator-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Neutrality validation result
 */
interface NeutralityValidation {
  isNeutral: boolean;
  violations: string[];
}

/**
 * Optional configuration for ModeratorAgent
 */
interface ModeratorAgentOptions {
  /** Override the model ID (for OpenRouter model selection) */
  model?: string;
}

/**
 * Moderator Agent - Neutral facilitator and synthesizer
 *
 * Responsibilities:
 * - Introduce debates neutrally
 * - Announce phase transitions
 * - Synthesize debates into decision frameworks (Phase 6)
 * - Handle user interventions
 *
 * Critical Constraints:
 * - ABSOLUTE neutrality - NEVER pick a winner
 * - NEVER recommend action
 * - NEVER introduce new arguments
 * - Preserve disagreement and uncertainty
 */
export class ModeratorAgent implements BaseAgent, IModeratorAgent {
  private llmClient: LLMClient;
  private modelName: string;
  private provider: 'openai' | 'anthropic';

  constructor(llmClient: LLMClient, options?: ModeratorAgentOptions) {
    this.llmClient = llmClient;
    this.provider = llmConfig.defaultProvider;
    // Use provided model override or fall back to default
    this.modelName = options?.model || llmConfig.defaultModels[this.provider];

    logger.info(
      {
        provider: this.provider,
        model: this.modelName,
        hasModelOverride: !!options?.model,
      },
      'ModeratorAgent initialized'
    );
  }

  /**
   * Get the LLM client for direct streaming access
   */
  getLLMClient(): LLMClient {
    return this.llmClient;
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'ModeratorAgent',
      version: '1.0.0',
      model: this.modelName,
      capabilities: [
        'debate-introduction',
        'phase-transitions',
        'neutral-synthesis',
        'intervention-handling',
        'neutrality-validation',
      ],
    };
  }

  /**
   * Generic response generation (required by BaseAgent)
   * Note: Moderator should use specific methods (generateIntroduction, etc.)
   */
  async generateResponse(prompt: string, context: AgentContext): Promise<string> {
    logger.warn(
      {
        debateId: context.debateId,
        phase: context.currentPhase,
      },
      'generateResponse called directly - consider using specific methods'
    );

    try {
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: MODERATOR_PROMPTS.introduction.template,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
        maxTokens: 1000,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info(
        {
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        },
        'Generic response generated'
      );

      // Validate neutrality
      const validation = this.validateNeutrality(response.content);
      if (!validation.isNeutral) {
        logger.warn(
          {
            violations: validation.violations,
          },
          'Neutrality violations detected in generic response'
        );
      }

      return response.content;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          debateId: context.debateId,
        },
        'Failed to generate generic response'
      );
      throw error;
    }
  }

  /**
   * Generate debate introduction
   */
  async generateIntroduction(proposition: string, context: AgentContext): Promise<string> {
    logger.info(
      {
        debateId: context.debateId,
        proposition,
      },
      'Generating debate introduction'
    );

    if (!proposition || proposition.trim().length === 0) {
      throw new Error('Proposition cannot be empty');
    }

    try {
      const systemPrompt = MODERATOR_PROMPTS.introduction.template;
      const userPrompt = MODERATOR_PROMPT_BUILDERS.introduction({
        proposition,
        propositionContext: context.propositionContext as any,
      });

      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.4,
        maxTokens: 800,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info(
        {
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        },
        'Introduction generated successfully'
      );

      // Validate neutrality
      const validation = this.validateNeutrality(response.content);
      if (!validation.isNeutral) {
        logger.warn(
          {
            violations: validation.violations,
          },
          'Neutrality violations detected in introduction'
        );
      }

      return response.content;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          debateId: context.debateId,
          proposition,
        },
        'Failed to generate introduction'
      );
      throw error;
    }
  }

  /**
   * Announce phase transition
   */
  async announcePhaseTransition(
    fromPhase: DebatePhase,
    toPhase: DebatePhase,
    context: AgentContext
  ): Promise<string> {
    logger.info(
      {
        debateId: context.debateId,
        fromPhase,
        toPhase,
      },
      'Generating phase transition announcement'
    );

    try {
      const systemPrompt = MODERATOR_PROMPTS.transition.template;

      // Format recent utterances for context
      const recentUtterances = this.formatRecentUtterances(context.previousUtterances, 3);

      const userPrompt = MODERATOR_PROMPT_BUILDERS.transition({
        proposition: context.proposition,
        phase: toPhase,
        previousUtterances: recentUtterances,
      });

      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.3, // Low temperature for consistency
        maxTokens: 400,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info(
        {
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        },
        'Phase transition announcement generated successfully'
      );

      // Validate neutrality
      const validation = this.validateNeutrality(response.content);
      if (!validation.isNeutral) {
        logger.warn(
          {
            violations: validation.violations,
          },
          'Neutrality violations detected in phase transition'
        );
      }

      return response.content;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          debateId: context.debateId,
          fromPhase,
          toPhase,
        },
        'Failed to generate phase transition'
      );
      throw error;
    }
  }

  /**
   * Generate final synthesis (Phase 6)
   * CRITICAL: Must be completely neutral, no winner declared
   */
  async generateSynthesis(context: AgentContext): Promise<string> {
    logger.info(
      {
        debateId: context.debateId,
        utteranceCount: context.previousUtterances.length,
      },
      'Generating Phase 6 synthesis - CRITICAL: neutrality required'
    );

    try {
      const systemPrompt = MODERATOR_PROMPTS.synthesis.template;

      // Build full transcript for synthesis
      const fullTranscript = this.formatFullTranscript(context.previousUtterances);

      const userPrompt = MODERATOR_PROMPT_BUILDERS.synthesis({
        proposition: context.proposition,
        fullTranscript,
      });

      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.5, // Moderate temperature for thoughtful synthesis
        maxTokens: 2000, // Longer output for comprehensive synthesis
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info(
        {
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        },
        'Synthesis generated'
      );

      // CRITICAL: Validate neutrality - synthesis MUST be neutral
      const validation = this.validateNeutrality(response.content);
      if (!validation.isNeutral) {
        logger.error(
          {
            violations: validation.violations,
            synthesisPreview: response.content.substring(0, 200),
          },
          'CRITICAL: Neutrality violations in Phase 6 synthesis!'
        );

        // Throw error - synthesis MUST be neutral
        throw new Error(
          `Synthesis failed neutrality validation: ${validation.violations.join(', ')}`
        );
      }

      logger.info('Phase 6 synthesis passed neutrality validation');
      return response.content;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          debateId: context.debateId,
        },
        'Failed to generate synthesis'
      );
      throw error;
    }
  }

  /**
   * Handle user intervention
   */
  async handleIntervention(
    interventionContent: string,
    context: AgentContext
  ): Promise<string> {
    logger.info(
      {
        debateId: context.debateId,
        phase: context.currentPhase,
        interventionLength: interventionContent.length,
      },
      'Handling user intervention'
    );

    if (!interventionContent || interventionContent.trim().length === 0) {
      throw new Error('Intervention content cannot be empty');
    }

    try {
      const systemPrompt = MODERATOR_PROMPTS.intervention.template;

      // Format recent utterances for context
      const recentUtterances = this.formatRecentUtterances(context.previousUtterances, 5);

      const userPrompt = MODERATOR_PROMPT_BUILDERS.intervention({
        proposition: context.proposition,
        interventionContent,
        phase: context.currentPhase,
        previousUtterances: recentUtterances,
      });

      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.4,
        maxTokens: 600,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info(
        {
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        },
        'Intervention response generated successfully'
      );

      // Validate neutrality
      const validation = this.validateNeutrality(response.content);
      if (!validation.isNeutral) {
        logger.warn(
          {
            violations: validation.violations,
          },
          'Neutrality violations detected in intervention response'
        );
      }

      return response.content;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          debateId: context.debateId,
        },
        'Failed to handle intervention'
      );
      throw error;
    }
  }

  /**
   * Validate neutrality of moderator output
   * CRITICAL: Detects winner-picking, recommendations, bias, new arguments
   *
   * @param output - The moderator's output text to validate
   * @returns Validation result with list of violations
   */
  private validateNeutrality(output: string): NeutralityValidation {
    const violations: string[] = [];
    const lowercaseOutput = output.toLowerCase();

    // Check for winner-picking language
    const winnerPhrases = [
      'the winner is',
      'pro won',
      'con won',
      'pro wins',
      'con wins',
      'the better argument',
      'the stronger case',
      'clearly won',
      'decisively argued',
      'emerged victorious',
      'came out ahead',
      'pro is correct',
      'con is correct',
      'pro is right',
      'con is right',
      'pro prevails',
      'con prevails',
      'superior argument',
      'inferior argument',
      'more convincing',
      'less convincing',
    ];

    for (const phrase of winnerPhrases) {
      if (lowercaseOutput.includes(phrase)) {
        violations.push(`Winner-picking language: "${phrase}"`);
      }
    }

    // Check for recommendation language
    const recommendationPhrases = [
      'you should',
      'we should',
      'must do',
      'must implement',
      'the right choice is',
      'the correct answer is',
      'i recommend',
      'my recommendation',
      'the best option',
      'you ought to',
      'it is necessary to',
      'the answer is clear',
      'the solution is',
      'we must',
      'you must',
      'should adopt',
      'should reject',
      'should accept',
    ];

    for (const phrase of recommendationPhrases) {
      if (lowercaseOutput.includes(phrase)) {
        violations.push(`Recommendation language: "${phrase}"`);
      }
    }

    // Check for bias indicators
    const biasIndicators = [
      'obviously pro',
      'obviously con',
      'clearly superior',
      'undeniably better',
      'without question',
      'it is clear that pro',
      'it is clear that con',
      'there is no doubt',
      'one side is clearly',
      'objectively better',
      'objectively worse',
      'indisputably',
      'unquestionably',
    ];

    for (const indicator of biasIndicators) {
      if (lowercaseOutput.includes(indicator)) {
        violations.push(`Biased language: "${indicator}"`);
      }
    }

    // Check for new argument introduction (moderator should only synthesize)
    const newArgumentPhrases = [
      'another point to consider',
      'what both advocates missed',
      'a key factor not mentioned',
      'i would add',
      "let me add",
      'we should also consider',
      'an important factor they ignored',
    ];

    for (const phrase of newArgumentPhrases) {
      if (lowercaseOutput.includes(phrase)) {
        violations.push(`Potentially introducing new argument: "${phrase}"`);
      }
    }

    // Check for direct statements of correctness/incorrectness
    const correctnessPatterns = [
      /pro (is|was) (correct|right|wrong|incorrect)/i,
      /con (is|was) (correct|right|wrong|incorrect)/i,
      /the (correct|right|wrong) (side|position|view) is/i,
    ];

    for (const pattern of correctnessPatterns) {
      if (pattern.test(output)) {
        violations.push(`Direct correctness judgment: "${pattern.source}"`);
      }
    }

    return {
      isNeutral: violations.length === 0,
      violations,
    };
  }

  /**
   * Format recent utterances for context
   * Provides abbreviated recent history to the LLM
   *
   * @param utterances - All utterances
   * @param limit - Number of recent utterances to include
   * @returns Formatted string
   */
  private formatRecentUtterances(utterances: Utterance[], limit: number): string {
    if (!utterances || utterances.length === 0) {
      return '(No previous utterances)';
    }

    const recent = utterances.slice(-limit);
    return recent
      .map((u) => {
        // Truncate long content to keep context manageable
        const content = u.content.length > 200 ? u.content.substring(0, 200) + '...' : u.content;
        return `[${u.speaker}]: ${content}`;
      })
      .join('\n\n');
  }

  /**
   * Format full transcript for synthesis
   * Provides complete debate history for Phase 6 synthesis
   *
   * @param utterances - All debate utterances
   * @returns Formatted full transcript
   */
  private formatFullTranscript(utterances: Utterance[]): string {
    if (!utterances || utterances.length === 0) {
      return '(No debate transcript available)';
    }

    return utterances
      .map((u, index) => {
        const phaseLabel = u.phase || 'Unknown Phase';
        return `[${index + 1}] ${phaseLabel} - ${u.speaker}:\n${u.content}`;
      })
      .join('\n\n---\n\n');
  }
}
