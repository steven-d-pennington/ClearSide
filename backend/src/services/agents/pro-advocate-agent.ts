/**
 * Pro Advocate Agent Implementation
 *
 * Argues FOR the proposition across all 6 debate phases.
 * Constructs steel-man quality arguments with explicit assumptions,
 * classified evidence, and preserved uncertainty.
 */

import type { LLMClient } from '../llm/client.js';
import type { LLMRequest } from '../../types/llm.js';
import type {
  BaseAgent,
  ProAdvocateAgent as IProAdvocateAgent,
  AgentContext,
} from './types.js';
import { llmConfig } from '../../config/llm.js';
import pino from 'pino';
import {
  PRO_ADVOCATE_PROMPTS,
  PRO_PROMPT_BUILDERS,
} from './prompts/pro-advocate-prompts.js';
import { createFullyConfiguredPrompt } from './prompts/prompt-modifiers.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';
import type { DebateConfiguration } from '../../types/configuration.js';
import type { PromptBuilderContext, ConstructiveRound } from './prompts/types.js';

/**
 * Logger for pro advocate operations
 */
const logger = pino({
  name: 'pro-advocate-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Pro Advocate Agent - Argues FOR the proposition
 *
 * Responsibilities:
 * - Construct strongest possible case FOR the proposition
 * - Present steel-man quality arguments (no straw-manning)
 * - Classify evidence types explicitly (fact, projection, analogy, value)
 * - State assumptions explicitly
 * - Preserve uncertainty honestly
 * - Maintain professional, substantive tone
 *
 * Constraints:
 * - NEVER straw-man opposing arguments
 * - NEVER claim false certainty
 * - ALWAYS state assumptions
 * - NO rhetorical tricks or emotional appeals
 * - Professional tone throughout
 */
export class ProAdvocateAgent implements BaseAgent, IProAdvocateAgent {
  private llmClient: LLMClient;
  private modelName: string;
  private provider: 'openai' | 'anthropic' | 'openrouter';

  constructor(
    llmClient: LLMClient,
    modelOverride?: { provider?: string; model?: string }
  ) {
    this.llmClient = llmClient;

    if (modelOverride?.model) {
      // Use OpenRouter model
      this.provider = 'openrouter';
      this.modelName = modelOverride.model;
    } else {
      // Use default provider (always 'openai' or 'anthropic')
      const defaultProvider = llmConfig.defaultProvider;
      this.provider = defaultProvider;
      this.modelName = llmConfig.defaultModels[defaultProvider];
    }

    logger.info({
      provider: this.provider,
      model: this.modelName,
    }, 'ProAdvocateAgent initialized');
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
      name: 'ProAdvocateAgent',
      version: '1.0.0',
      model: this.modelName,
      capabilities: [
        'opening-statement',
        'constructive-arguments',
        'cross-examination',
        'rebuttal',
        'closing-statement',
        'intervention-response',
        'steel-man-quality',
        'evidence-classification',
      ],
    };
  }

  /**
   * Generic response generation (required by BaseAgent)
   * Used for interventions and custom prompts
   */
  async generateResponse(prompt: string, context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      phase: context.currentPhase,
      speaker: context.speaker,
    }, 'Generating generic response');

    try {
      // Build LLM request with intervention prompt
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: PRO_ADVOCATE_PROMPTS.intervention.template,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7, // Slightly higher for responsive dialogue
        maxTokens: 500,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'Generic response generated');

      // Validate quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for generic response');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate generic response');
      throw error;
    }
  }

  /**
   * Generate opening statement supporting the proposition
   * Phase 1: Opening Statement (2 minutes)
   */
  async generateOpeningStatement(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      proposition: context.proposition,
    }, 'Generating opening statement');

    try {
      // Get configuration
      const config = this.getConfiguration(context);

      // Build prompt context
      const promptContext: PromptBuilderContext = {
        proposition: context.proposition,
        propositionContext: this.normalizePropositionContext(context.propositionContext),
        phase: context.currentPhase,
        speaker: context.speaker,
      };

      // Build user prompt
      const userPrompt = PRO_PROMPT_BUILDERS.opening(promptContext);

      // Apply persona and configuration to system prompt
      const modifiedSystemPrompt = createFullyConfiguredPrompt(
        PRO_ADVOCATE_PROMPTS.opening.template,
        config,
        context.persona
      );

      // Build LLM request with configuration settings
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: modifiedSystemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'Opening statement generated');

      // Validate steel-man quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for opening statement');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate opening statement');
      throw error;
    }
  }

  /**
   * Generate constructive argument with evidence
   * Phase 2: Constructive Arguments (multiple rounds)
   */
  async generateConstructiveArgument(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      proposition: context.proposition,
      phaseMetadata: context.phaseMetadata,
    }, 'Generating constructive argument');

    try {
      // Get configuration
      const config = this.getConfiguration(context);

      // Determine constructive round from phase metadata
      const constructiveRound = this.determineConstructiveRound(context);

      // Select appropriate prompt template
      let promptTemplate;
      if (constructiveRound === 'economic_technical') {
        promptTemplate = PRO_ADVOCATE_PROMPTS.constructive.economic;
      } else if (constructiveRound === 'ethical_social') {
        promptTemplate = PRO_ADVOCATE_PROMPTS.constructive.ethical;
      } else {
        promptTemplate = PRO_ADVOCATE_PROMPTS.constructive.practical;
      }

      // Build prompt context
      const promptContext: PromptBuilderContext = {
        proposition: context.proposition,
        propositionContext: this.normalizePropositionContext(context.propositionContext),
        phase: context.currentPhase,
        speaker: context.speaker,
        constructiveRound,
        previousUtterances: this.buildContextSummary(context),
      };

      // Build user prompt
      const userPrompt = PRO_PROMPT_BUILDERS.constructive(promptContext);

      // Apply persona and configuration to system prompt
      const modifiedSystemPrompt = createFullyConfiguredPrompt(
        promptTemplate.template,
        config,
        context.persona
      );

      // Build LLM request with configuration settings
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: modifiedSystemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        constructiveRound,
      }, 'Constructive argument generated');

      // Validate quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for constructive argument');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate constructive argument');
      throw error;
    }
  }

  /**
   * Generate cross-examination question for con advocate
   * Phase 3: Cross-Examination - Questioning
   */
  async generateCrossExamQuestion(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      proposition: context.proposition,
    }, 'Generating cross-examination question');

    try {
      // Extract opponent arguments from previous utterances
      const opponentArguments = this.extractOpponentArguments(context);

      // Build prompt context
      const promptContext: PromptBuilderContext = {
        proposition: context.proposition,
        propositionContext: this.normalizePropositionContext(context.propositionContext),
        phase: context.currentPhase,
        speaker: context.speaker,
        crossExamRole: 'questioner',
        opponentArguments,
        previousUtterances: this.buildContextSummary(context),
      };

      // Build user prompt
      const userPrompt = PRO_PROMPT_BUILDERS.crossExam(promptContext);

      // Build LLM request
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: PRO_ADVOCATE_PROMPTS.crossExam.questioner.template,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        maxTokens: 500,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'Cross-examination question generated');

      // Validate quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for cross-exam question');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate cross-examination question');
      throw error;
    }
  }

  /**
   * Respond to cross-examination question
   * Phase 3: Cross-Examination - Responding
   */
  async respondToCrossExam(question: string, context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      question: question.substring(0, 100),
    }, 'Responding to cross-examination question');

    try {
      // Build prompt context
      const promptContext: PromptBuilderContext = {
        proposition: context.proposition,
        propositionContext: this.normalizePropositionContext(context.propositionContext),
        phase: context.currentPhase,
        speaker: context.speaker,
        crossExamRole: 'respondent',
        interventionContent: question,
        previousUtterances: this.buildContextSummary(context),
      };

      // Build user prompt
      const userPrompt = PRO_PROMPT_BUILDERS.crossExam(promptContext);

      // Build LLM request
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: PRO_ADVOCATE_PROMPTS.crossExam.respondent.template,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        maxTokens: 600,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'Cross-examination response generated');

      // Validate quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for cross-exam response');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to respond to cross-examination');
      throw error;
    }
  }

  /**
   * Generate rebuttal to con advocate's arguments
   * Phase 4: Rebuttal
   */
  async generateRebuttal(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      proposition: context.proposition,
    }, 'Generating rebuttal');

    try {
      // Extract opponent arguments from previous utterances
      const opponentArguments = this.extractOpponentArguments(context);

      // Build prompt context
      const promptContext: PromptBuilderContext = {
        proposition: context.proposition,
        propositionContext: this.normalizePropositionContext(context.propositionContext),
        phase: context.currentPhase,
        speaker: context.speaker,
        opponentArguments,
        previousUtterances: this.buildContextSummary(context),
      };

      // Build user prompt
      const userPrompt = PRO_PROMPT_BUILDERS.rebuttal(promptContext);

      // Build LLM request
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: PRO_ADVOCATE_PROMPTS.rebuttal.template,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        maxTokens: 800,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'Rebuttal generated');

      // Validate quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for rebuttal');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate rebuttal');
      throw error;
    }
  }

  /**
   * Generate closing statement
   * Phase 5: Closing Statement
   */
  async generateClosingStatement(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      proposition: context.proposition,
    }, 'Generating closing statement');

    try {
      // Build full transcript summary
      const fullTranscript = this.buildContextSummary(context);

      // Build prompt context
      const promptContext: PromptBuilderContext = {
        proposition: context.proposition,
        propositionContext: this.normalizePropositionContext(context.propositionContext),
        phase: context.currentPhase,
        speaker: context.speaker,
        fullTranscript,
        previousUtterances: fullTranscript,
      };

      // Build user prompt
      const userPrompt = PRO_PROMPT_BUILDERS.closing(promptContext);

      // Build LLM request
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: PRO_ADVOCATE_PROMPTS.closing.template,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        maxTokens: 800,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'Closing statement generated');

      // Validate quality
      const validation = this.validateSteelManQuality(response.content);
      if (!validation.valid) {
        logger.warn({
          warnings: validation.warnings,
        }, 'Quality validation warnings for closing statement');
      }

      return response.content.trim();
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate closing statement');
      throw error;
    }
  }

  // ============================================================================
  // Internal Helper Methods
  // ============================================================================

  /**
   * Get configuration from context with fallback to defaults
   */
  private getConfiguration(context: AgentContext): DebateConfiguration {
    return context.configuration ?? DEFAULT_CONFIGURATION;
  }

  /**
   * Build context summary from previous utterances
   * Summarizes debate history for agent context
   */
  private buildContextSummary(context: AgentContext): string {
    if (!context.previousUtterances || context.previousUtterances.length === 0) {
      return 'No previous utterances.';
    }

    // Build chronological summary of debate so far
    let summary = 'Debate context:\n\n';

    for (const utterance of context.previousUtterances) {
      const speaker = utterance.speaker.toUpperCase();
      const content = utterance.content.substring(0, 200); // Limit length
      summary += `[${speaker}]: ${content}...\n\n`;
    }

    return summary.trim();
  }

  /**
   * Extract opponent (Con) arguments from previous utterances
   */
  private extractOpponentArguments(context: AgentContext): string {
    if (!context.previousUtterances || context.previousUtterances.length === 0) {
      return 'No opponent arguments yet.';
    }

    // Filter for Con utterances
    const conUtterances = context.previousUtterances.filter(
      (u) => u.speaker === 'con_advocate'
    );

    if (conUtterances.length === 0) {
      return 'No opponent arguments yet.';
    }

    // Build summary of Con's arguments
    let summary = "Con's arguments:\n\n";

    for (const utterance of conUtterances) {
      const content = utterance.content.substring(0, 300); // Limit length
      summary += `${content}...\n\n`;
    }

    return summary.trim();
  }

  /**
   * Determine constructive round from context
   */
  private determineConstructiveRound(context: AgentContext): ConstructiveRound {
    // Check phase metadata for round indicator
    if (context.phaseMetadata?.constructiveRound) {
      return context.phaseMetadata.constructiveRound as ConstructiveRound;
    }

    // Default to economic/technical if not specified
    return 'economic_technical';
  }

  /**
   * Normalize proposition context to expected format
   */
  private normalizePropositionContext(
    context?: Record<string, unknown>
  ): PromptBuilderContext['propositionContext'] {
    if (!context) {
      return undefined;
    }

    return {
      category: context.category as string | undefined,
      timeContext: context.time_context as string | undefined,
      geographicScope: context.geographic_scope as string | undefined,
      stakeholders: context.stakeholders as string[] | undefined,
      keyAssumptions: context.key_assumptions as string[] | undefined,
      background: context.background as string | undefined,
    };
  }

  /**
   * Validate steel-man quality of output
   * Checks for straw-man arguments, professional tone, and explicit assumptions
   */
  private validateSteelManQuality(output: string): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Check for straw-man indicators
    const strawmanPhrases = [
      'they claim',
      'they believe',
      'naive view',
      'simplistic',
      'foolish',
      'ridiculous',
      'absurd position',
      'silly argument',
      'misguided',
    ];

    const lowerOutput = output.toLowerCase();

    for (const phrase of strawmanPhrases) {
      if (lowerOutput.includes(phrase)) {
        warnings.push(`Potential straw-man detected: "${phrase}"`);
      }
    }

    // Check for unprofessional tone
    const unprofessionalPhrases = ['lol', 'haha', 'omg', 'btw', '!!', '???'];

    for (const phrase of unprofessionalPhrases) {
      if (lowerOutput.includes(phrase)) {
        warnings.push(`Unprofessional language detected: "${phrase}"`);
      }
    }

    // Check for assumption indicators (should be present)
    const assumptionIndicators = [
      'assum',
      'premise',
      'presuppos',
      'given that',
      'if we accept',
      'this relies on',
    ];

    const hasAssumptions = assumptionIndicators.some((indicator) =>
      lowerOutput.includes(indicator)
    );

    if (!hasAssumptions && output.length > 200) {
      warnings.push('No explicit assumptions found (consider adding)');
    }

    // Check for false certainty
    const falseCertaintyPhrases = [
      'will definitely',
      'is guaranteed',
      'will certainly',
      'there is no doubt',
      'we know for sure',
    ];

    for (const phrase of falseCertaintyPhrases) {
      if (lowerOutput.includes(phrase)) {
        warnings.push(`False certainty detected: "${phrase}"`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }
}
