/**
 * Orchestrator Agent Implementation
 *
 * Normalizes user propositions into structured, debatable formats.
 * This is the first agent in the debate pipeline and outputs ONLY the
 * proposition section of the transcript schema.
 */

import type { LLMClient } from '../llm/client.js';
import type { LLMRequest } from '../../types/llm.js';
import type {
  BaseAgent,
  OrchestratorAgent as IOrchestratorAgent,
  NormalizedProposition,
  AgentContext,
} from './types.js';
import { llmConfig } from '../../config/llm.js';
import pino from 'pino';

/**
 * Logger for orchestrator operations
 */
const logger = pino({
  name: 'orchestrator-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Proposition context for additional user-provided context
 */
export interface PropositionContext {
  geography?: string;
  timeframe?: string;
  domain?: string;
}

/**
 * Orchestrator Agent - Normalizes propositions
 *
 * Responsibilities:
 * - Normalize user input into clear, debatable proposition
 * - Extract structured context (geography, timeframe, domain)
 * - Identify stakeholders
 * - Assess complexity level
 * - Frame the debate appropriately
 *
 * Constraints:
 * - NEVER add arguments or opinions
 * - NEVER pick a side
 * - Output ONLY proposition metadata
 */
export class OrchestratorAgent implements BaseAgent, IOrchestratorAgent {
  private llmClient: LLMClient;
  private modelName: string;
  private provider: 'openai' | 'anthropic';

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
    this.provider = llmConfig.defaultProvider;
    this.modelName = llmConfig.defaultModels[this.provider];

    logger.info({
      provider: this.provider,
      model: this.modelName,
    }, 'OrchestratorAgent initialized');
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'OrchestratorAgent',
      version: '1.0.0',
      model: this.modelName,
      capabilities: ['proposition-normalization', 'context-extraction', 'neutrality-validation'],
    };
  }

  /**
   * Generic response generation (required by BaseAgent)
   */
  async generateResponse(prompt: string, _context: AgentContext): Promise<string> {
    logger.warn('generateResponse called directly on OrchestratorAgent - use normalizeProposition instead');
    return `Orchestrator agent should use normalizeProposition() method. Prompt: ${prompt}`;
  }

  /**
   * Get the LLM client for direct streaming access
   */
  getLLMClient(): LLMClient {
    return this.llmClient;
  }

  /**
   * Normalize a raw user proposition into structured format
   *
   * @param rawInput - Raw user input (question or statement)
   * @param additionalContext - Optional user-provided context
   * @returns Normalized proposition with structured context
   */
  async normalizeProposition(
    rawInput: string,
    additionalContext?: Record<string, unknown>
  ): Promise<NormalizedProposition> {
    logger.info({ rawInput }, 'Starting proposition normalization');

    // Validate input
    if (!rawInput || rawInput.trim().length === 0) {
      throw new Error('Raw input cannot be empty');
    }

    if (rawInput.trim().length < 5) {
      throw new Error('Raw input is too short - please provide a meaningful proposition');
    }

    try {
      // Build prompt
      const prompt = this.buildNormalizationPrompt(rawInput, additionalContext);

      // Call LLM
      const llmRequest: LLMRequest = {
        provider: this.provider,
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for consistency
        maxTokens: 1000,
      };

      const response = await this.llmClient.complete(llmRequest);

      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
      }, 'LLM response received');

      // Parse response
      const normalized = this.parseNormalizationResponse(response.content);

      // Validate neutrality
      const isNeutral = this.validateNeutrality(normalized.normalized_question);
      if (!isNeutral) {
        logger.warn({
          question: normalized.normalized_question,
        }, 'Normalized question may contain biased language');
      }

      logger.info({
        normalized_question: normalized.normalized_question,
        category: normalized.context.category,
        confidence: normalized.confidence,
      }, 'Normalization complete');

      return normalized;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        rawInput,
      }, 'Normalization failed');
      throw error;
    }
  }

  /**
   * Validate if a proposition is debatable
   *
   * @param proposition - Proposition to validate
   * @returns Validation result with reason if invalid
   */
  async validateProposition(proposition: string): Promise<{ valid: boolean; reason?: string }> {
    const trimmed = proposition.trim();

    // Check for empty or too short
    if (!trimmed || trimmed.length < 10) {
      return {
        valid: false,
        reason: 'Proposition is too short or empty. Please provide a meaningful proposition.',
      };
    }

    // Check for common question words indicating it's a question
    const hasQuestionStructure =
      trimmed.includes('?') ||
      /^(should|would|could|is|are|do|does|will|can)\s/i.test(trimmed);

    if (!hasQuestionStructure) {
      // Statements can be normalized to questions, so this is just a warning
      logger.info({ proposition }, 'Input appears to be a statement rather than a question');
    }

    // Check for yes/no simplicity (not ideal for debate)
    const isSimpleYesNo = /^(is|are|do|does)\s/i.test(trimmed);
    if (isSimpleYesNo) {
      logger.warn({ proposition }, 'Proposition may be too simple for meaningful debate');
    }

    return { valid: true };
  }

  /**
   * Get system prompt for orchestrator
   */
  private getSystemPrompt(): string {
    return `You are the Orchestrator Agent for ClearSide, a structured reasoning platform.

Your SOLE responsibility is to normalize user input into a clear, debatable proposition.

HARD RULES:
1. Output ONLY the proposition section - NO arguments, opinions, or analysis
2. Convert statements into neutral questions suitable for debate
3. Extract context (geography, timeframe, domain) if mentioned or inferrable
4. Identify key stakeholders affected by the proposition
5. Frame the debate appropriately

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "normalized_question": "Clear, neutral, debatable question",
  "context": {
    "category": "Subject area (e.g., 'technology policy', 'healthcare', 'education')",
    "time_context": "Time scope if relevant (e.g., '2025-2030', 'Next decade')",
    "geographic_scope": "Location if relevant (e.g., 'United States', 'Global')",
    "stakeholders": ["Group 1", "Group 2", "Group 3"],
    "key_assumptions": ["Assumption 1", "Assumption 2"],
    "background": "Brief background context if needed"
  },
  "confidence": 0.9
}

QUALITY STANDARDS:
- Normalized question must be neutral (no leading language)
- Must be answerable with FOR/AGAINST positions
- Must be specific enough to debate meaningfully
- Prefer "Should X do Y?" format over yes/no questions
- Stakeholders should be concrete groups, not abstractions
- Confidence score (0-1) reflects how clear the normalization is

EXAMPLES:

Input: "AI is dangerous and should be banned"
Output:
{
  "normalized_question": "Should artificial intelligence development be subject to a moratorium or ban?",
  "context": {
    "category": "technology regulation",
    "time_context": "Near-term policy consideration",
    "geographic_scope": "Global",
    "stakeholders": ["AI researchers", "Technology companies", "Regulators", "General public"],
    "key_assumptions": ["AI poses potential risks", "Government regulation is feasible"],
    "background": "Debate over AI safety and regulation"
  },
  "confidence": 0.95
}

Input: "Should we have universal healthcare?"
Output:
{
  "normalized_question": "Should the United States implement a universal healthcare system?",
  "context": {
    "category": "healthcare policy",
    "time_context": "Current policy debate",
    "geographic_scope": "United States",
    "stakeholders": ["Patients", "Healthcare providers", "Insurance companies", "Government", "Taxpayers"],
    "key_assumptions": ["Healthcare access is important", "Government can administer healthcare"],
    "background": "Ongoing debate about healthcare reform in the US"
  },
  "confidence": 0.9
}`;
  }

  /**
   * Build normalization prompt from user input
   */
  private buildNormalizationPrompt(
    rawInput: string,
    additionalContext?: Record<string, unknown>
  ): string {
    let prompt = `Normalize this user input into a debatable proposition:\n\n"${rawInput}"`;

    if (additionalContext) {
      prompt += '\n\nUser-provided context:';
      if (additionalContext.geography) {
        prompt += `\n- Geography: ${additionalContext.geography}`;
      }
      if (additionalContext.timeframe) {
        prompt += `\n- Timeframe: ${additionalContext.timeframe}`;
      }
      if (additionalContext.domain) {
        prompt += `\n- Domain: ${additionalContext.domain}`;
      }
      if (additionalContext.background) {
        prompt += `\n- Background: ${additionalContext.background}`;
      }
    }

    prompt += '\n\nReturn the normalized proposition as valid JSON following the schema.';

    return prompt;
  }

  /**
   * Parse LLM response into NormalizedProposition
   */
  private parseNormalizationResponse(llmOutput: string): NormalizedProposition {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = llmOutput.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/\n?```$/g, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```\n?/g, '').replace(/\n?```$/g, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Ensure required fields exist
      if (!parsed.normalized_question) {
        throw new Error('Missing required field: normalized_question');
      }

      return {
        normalized_question: parsed.normalized_question,
        context: {
          category: parsed.context?.category,
          time_context: parsed.context?.time_context,
          geographic_scope: parsed.context?.geographic_scope,
          stakeholders: parsed.context?.stakeholders || [],
          key_assumptions: parsed.context?.key_assumptions || [],
          background: parsed.context?.background,
        },
        confidence: parsed.confidence ?? 0.8,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        llmOutput: llmOutput.substring(0, 500),
      }, 'Failed to parse LLM response as JSON');
      throw new Error(`Failed to parse LLM response as JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate that normalized question is neutral
   *
   * @param normalizedQuestion - Question to validate
   * @returns True if neutral, false if biased language detected
   */
  private validateNeutrality(normalizedQuestion: string): boolean {
    const biasedPhrases = [
      'obviously',
      'clearly',
      'of course',
      'everyone knows',
      "it's obvious that",
      'undeniably',
      'without question',
      'foolish',
      'stupid',
      'ridiculous',
      'absurd',
    ];

    const lowercaseQuestion = normalizedQuestion.toLowerCase();

    for (const phrase of biasedPhrases) {
      if (lowercaseQuestion.includes(phrase)) {
        logger.warn({
          phrase,
          question: normalizedQuestion,
        }, 'Biased language detected in normalized question');
        return false;
      }
    }

    return true;
  }
}
