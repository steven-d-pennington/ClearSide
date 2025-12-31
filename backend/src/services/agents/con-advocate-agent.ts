/**
 * Con Advocate Agent Implementation
 *
 * Argues AGAINST the proposition across all 6 debate phases with steel-man quality.
 * Constructs the strongest possible case for opposing the proposition.
 */

import type { LLMClient } from '../llm/client.js';
import type { LLMRequest } from '../../types/llm.js';
import type {
  BaseAgent,
  ConAdvocateAgent as IConAdvocateAgent,
  AgentContext,
} from './types.js';
import { DebatePhase } from '../../types/debate.js';
import { llmConfig } from '../../config/llm.js';
import pino from 'pino';
import {
  CON_ADVOCATE_PROMPTS,
  CON_PROMPT_BUILDERS,
} from './prompts/con-advocate-prompts.js';
import { createFullyConfiguredPrompt } from './prompts/prompt-modifiers.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';
import type { PromptBuilderContext, ConstructiveRound } from './prompts/types.js';
import type { Utterance } from '../../types/database.js';
import type { DebateConfiguration } from '../../types/configuration.js';

/**
 * Logger for con advocate operations
 */
const logger = pino({
  name: 'con-advocate-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Con Advocate Agent - Argues against the proposition
 *
 * Responsibilities:
 * - Build steel-man arguments AGAINST the proposition
 * - Present economic, ethical, and practical opposition
 * - Question Pro advocate's assumptions
 * - Rebut Pro's strongest arguments
 * - Preserve intellectual honesty and uncertainty
 *
 * Constraints:
 * - NO straw-manning of opposing views
 * - EXPLICIT about assumptions and uncertainty
 * - Professional, substantive tone
 * - Focus on clarity over rhetoric
 */
export class ConAdvocateAgent implements BaseAgent, IConAdvocateAgent {
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
    }, 'ConAdvocateAgent initialized');
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
      name: 'ConAdvocateAgent',
      version: '1.0.0',
      model: this.modelName,
      capabilities: [
        'opening-statements',
        'constructive-arguments',
        'cross-examination',
        'rebuttal',
        'closing-statements',
        'steel-man-quality',
        'intervention-response',
      ],
    };
  }

  /**
   * Generic response generation (required by BaseAgent)
   * Used for user interventions and flexible prompts
   */
  async generateResponse(prompt: string, context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      phase: context.currentPhase,
      promptLength: prompt.length,
    }, 'Generating generic response');

    try {
      // Get configuration
      const config = this.getConfiguration(context);

      // Apply persona and configuration to system prompt
      const modifiedSystemPrompt = createFullyConfiguredPrompt(
        CON_ADVOCATE_PROMPTS.intervention.template,
        config,
        context.persona
      );

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
      }, 'Using configuration settings for generic response');

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
            content: prompt,
          },
        ],
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        debateId: context.debateId,
        usage: response.usage,
        finishReason: response.finishReason,
      }, 'Generic response generated');

      return response.content;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate generic response');
      throw error;
    }
  }

  /**
   * Generate opening statement opposing the proposition
   */
  async generateOpeningStatement(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      proposition: context.proposition,
    }, 'Generating opening statement');

    try {
      const config = this.getConfiguration(context);
      const systemPrompt = createFullyConfiguredPrompt(
        CON_ADVOCATE_PROMPTS.opening.template,
        config,
        context.persona
      );
      const userPrompt = CON_PROMPT_BUILDERS.opening(this.buildPromptContext(context));

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
      }, 'Using configuration settings for opening statement');

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
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate quality using prompt template checks
      this.validateOutput(response.content, CON_ADVOCATE_PROMPTS.opening);

      logger.info({
        debateId: context.debateId,
        usage: response.usage,
        wordCount: response.content.split(/\s+/).length,
      }, 'Opening statement generated');

      return response.content;
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
   */
  async generateConstructiveArgument(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      phase: context.currentPhase,
      phaseMetadata: context.phaseMetadata,
    }, 'Generating constructive argument');

    try {
      // Determine which constructive round this is
      const constructiveRound: ConstructiveRound = (context.phaseMetadata?.constructiveRound as ConstructiveRound) || 'economic_technical';

      // Select appropriate prompt template
      let promptTemplate;
      if (constructiveRound === 'economic_technical') {
        promptTemplate = CON_ADVOCATE_PROMPTS.constructive.economic;
      } else if (constructiveRound === 'ethical_social') {
        promptTemplate = CON_ADVOCATE_PROMPTS.constructive.ethical;
      } else {
        promptTemplate = CON_ADVOCATE_PROMPTS.constructive.practical;
      }

      const config = this.getConfiguration(context);
      const systemPrompt = createFullyConfiguredPrompt(
        promptTemplate.template,
        config,
        context.persona
      );
      const userPrompt = CON_PROMPT_BUILDERS.constructive({
        ...this.buildPromptContext(context),
        constructiveRound,
      });

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
        constructiveRound,
      }, 'Using configuration settings for constructive argument');

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
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate quality
      this.validateOutput(response.content, promptTemplate);

      logger.info({
        debateId: context.debateId,
        constructiveRound,
        usage: response.usage,
        wordCount: response.content.split(/\s+/).length,
      }, 'Constructive argument generated');

      return response.content;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate constructive argument');
      throw error;
    }
  }

  /**
   * Generate cross-examination question for pro advocate
   */
  async generateCrossExamQuestion(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      phase: context.currentPhase,
    }, 'Generating cross-examination questions');

    try {
      const config = this.getConfiguration(context);
      const systemPrompt = createFullyConfiguredPrompt(
        CON_ADVOCATE_PROMPTS.crossExam.questioner.template,
        config,
        context.persona
      );

      // Extract Pro's arguments from previous utterances
      const proArguments = this.extractOpponentArguments(context.previousUtterances, 'pro');

      const userPrompt = CON_PROMPT_BUILDERS.crossExam({
        ...this.buildPromptContext(context),
        crossExamRole: 'questioner',
        opponentArguments: proArguments,
      });

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
      }, 'Using configuration settings for cross-exam question');

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
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate quality
      this.validateOutput(response.content, CON_ADVOCATE_PROMPTS.crossExam.questioner);

      logger.info({
        debateId: context.debateId,
        usage: response.usage,
      }, 'Cross-examination questions generated');

      return response.content;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate cross-examination questions');
      throw error;
    }
  }

  /**
   * Respond to cross-examination question from pro advocate
   */
  async respondToCrossExam(question: string, context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      questionLength: question.length,
    }, 'Responding to cross-examination');

    try {
      const config = this.getConfiguration(context);
      const systemPrompt = createFullyConfiguredPrompt(
        CON_ADVOCATE_PROMPTS.crossExam.respondent.template,
        config,
        context.persona
      );
      const userPrompt = CON_PROMPT_BUILDERS.crossExam({
        ...this.buildPromptContext(context),
        crossExamRole: 'respondent',
        interventionContent: question,
      });

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
      }, 'Using configuration settings for cross-exam response');

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
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate quality
      this.validateOutput(response.content, CON_ADVOCATE_PROMPTS.crossExam.respondent);

      logger.info({
        debateId: context.debateId,
        usage: response.usage,
      }, 'Cross-examination response generated');

      return response.content;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to respond to cross-examination');
      throw error;
    }
  }

  /**
   * Generate rebuttal to pro advocate's arguments
   */
  async generateRebuttal(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      phase: context.currentPhase,
    }, 'Generating rebuttal');

    try {
      const config = this.getConfiguration(context);
      const systemPrompt = createFullyConfiguredPrompt(
        CON_ADVOCATE_PROMPTS.rebuttal.template,
        config,
        context.persona
      );

      // Extract Pro's arguments from previous utterances
      const proArguments = this.extractOpponentArguments(context.previousUtterances, 'pro');

      const userPrompt = CON_PROMPT_BUILDERS.rebuttal({
        ...this.buildPromptContext(context),
        opponentArguments: proArguments,
      });

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
      }, 'Using configuration settings for rebuttal');

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
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate quality
      this.validateOutput(response.content, CON_ADVOCATE_PROMPTS.rebuttal);

      logger.info({
        debateId: context.debateId,
        usage: response.usage,
        wordCount: response.content.split(/\s+/).length,
      }, 'Rebuttal generated');

      return response.content;
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
   */
  async generateClosingStatement(context: AgentContext): Promise<string> {
    logger.info({
      debateId: context.debateId,
      phase: context.currentPhase,
    }, 'Generating closing statement');

    try {
      const config = this.getConfiguration(context);
      const systemPrompt = createFullyConfiguredPrompt(
        CON_ADVOCATE_PROMPTS.closing.template,
        config,
        context.persona
      );

      // Build full transcript summary for closing
      const fullTranscript = this.buildTranscriptSummary(context.previousUtterances);

      const userPrompt = CON_PROMPT_BUILDERS.closing({
        ...this.buildPromptContext(context),
        fullTranscript,
      });

      logger.info({
        temperature: config.llmSettings.temperature,
        brevityLevel: config.brevityLevel,
      }, 'Using configuration settings for closing statement');

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
        temperature: config.llmSettings.temperature,
        maxTokens: config.llmSettings.maxTokensPerResponse,
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate quality
      this.validateOutput(response.content, CON_ADVOCATE_PROMPTS.closing);

      logger.info({
        debateId: context.debateId,
        usage: response.usage,
        wordCount: response.content.split(/\s+/).length,
      }, 'Closing statement generated');

      return response.content;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        debateId: context.debateId,
      }, 'Failed to generate closing statement');
      throw error;
    }
  }

  /**
   * Get configuration from context with fallback to defaults
   */
  private getConfiguration(context: AgentContext): DebateConfiguration {
    return context.configuration ?? DEFAULT_CONFIGURATION;
  }

  /**
   * Build prompt context from agent context
   */
  private buildPromptContext(context: AgentContext): PromptBuilderContext {
    // Extract proposition context from the context object
    const propositionContext = context.propositionContext
      ? {
          category: (context.propositionContext.category as string) || undefined,
          geographicScope: (context.propositionContext.geographic_scope as string) || undefined,
          timeContext: (context.propositionContext.time_context as string) || undefined,
          stakeholders: (context.propositionContext.stakeholders as string[]) || undefined,
        }
      : undefined;

    return {
      proposition: context.proposition,
      propositionContext,
      previousUtterances: this.formatUtterances(context.previousUtterances),
    };
  }

  /**
   * Format utterances for prompt context
   */
  private formatUtterances(utterances: Utterance[]): string {
    if (!utterances || utterances.length === 0) {
      return 'No previous utterances.';
    }

    return utterances
      .map((u, idx) => {
        const speaker = u.speaker.toUpperCase();
        const content = u.content.substring(0, 500); // Limit length
        return `[${idx + 1}] ${speaker}: ${content}`;
      })
      .join('\n\n');
  }

  /**
   * Extract opponent arguments from utterances
   */
  private extractOpponentArguments(utterances: Utterance[], opponentSpeaker: string): string {
    const opponentUtterances = utterances.filter(u => u.speaker === opponentSpeaker);

    if (opponentUtterances.length === 0) {
      return 'No opponent arguments yet.';
    }

    return opponentUtterances
      .map((u, idx) => {
        const phase = u.phase || 'unknown';
        const content = u.content;
        return `[${phase.toUpperCase()}] Argument ${idx + 1}:\n${content}`;
      })
      .join('\n\n');
  }

  /**
   * Build full transcript summary for closing statement
   */
  private buildTranscriptSummary(utterances: Utterance[]): string {
    if (!utterances || utterances.length === 0) {
      return 'No debate transcript available.';
    }

    // Group by phase - use a simple object instead of Map for compatibility
    const byPhase: { [key: string]: Utterance[] } = {};

    for (const utterance of utterances) {
      const phase = utterance.phase || 'unknown';
      if (!byPhase[phase]) {
        byPhase[phase] = [];
      }
      byPhase[phase].push(utterance);
    }

    // Build summary
    let summary = '';
    const phaseOrder = [
      DebatePhase.PHASE_1_OPENING,
      DebatePhase.PHASE_2_CONSTRUCTIVE,
      DebatePhase.PHASE_3_CROSSEXAM,
      DebatePhase.PHASE_4_REBUTTAL,
    ];

    for (const phase of phaseOrder) {
      const phaseUtterances = byPhase[phase];
      if (!phaseUtterances) continue;

      summary += `\n=== ${phase.toUpperCase()} ===\n`;
      for (const u of phaseUtterances) {
        summary += `${u.speaker.toUpperCase()}: ${u.content.substring(0, 300)}...\n\n`;
      }
    }

    return summary;
  }

  /**
   * Validate output quality using prompt template checks
   */
  private validateOutput(output: string, promptTemplate: any): void {
    if (!promptTemplate.qualityChecks) {
      return; // No quality checks defined
    }

    const wordCount = output.split(/\s+/).length;

    logger.debug({
      outputLength: output.length,
      wordCount,
      checks: promptTemplate.qualityChecks.length,
    }, 'Validating output quality');

    // Run each quality check
    for (const check of promptTemplate.qualityChecks) {
      try {
        const result = check(output);
        if (!result.passed) {
          logger.warn({
            checkName: check.name,
            reason: result.reason,
          }, 'Quality check warning');
        }
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          checkName: check.name,
        }, 'Quality check failed');
      }
    }
  }
}
