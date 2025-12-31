/**
 * End Detector for Informal Discussions
 *
 * Uses LLM to evaluate whether an informal discussion has reached
 * a natural stopping point based on conversation patterns.
 */

import { EventEmitter } from 'events';
import type { SimpleLLMRequest, LLMResponse } from '../../types/llm.js';
import type { EndDetectionContext, EndDetectionResult, EndDetectionConfig } from '../../types/informal.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'EndDetector' });

/**
 * Interface for LLM client used by EndDetector
 */
interface EndDetectorLLMClient {
  complete(request: SimpleLLMRequest): Promise<LLMResponse>;
}

/**
 * Events emitted by the EndDetector
 */
export interface EndDetectorEvents {
  'evaluation:started': (context: EndDetectionContext) => void;
  'evaluation:completed': (result: EndDetectionResult) => void;
  'end:detected': (result: EndDetectionResult) => void;
}

/**
 * Prompt for evaluating if discussion should end
 */
const END_DETECTION_PROMPT = `You are analyzing an informal discussion to determine if it has reached a natural stopping point.

Topic: {topic}
Exchanges completed: {totalExchanges} of {maxExchanges}

Recent exchanges:
{recentExchanges}

Evaluate whether this discussion has reached a natural conclusion by checking for these signals:

1. **Topic Exhaustion**: Are participants repeating earlier points without adding new insights?
2. **Response Brevity**: Are responses getting noticeably shorter?
3. **Agreement Convergence**: Are participants mostly agreeing and acknowledging each other rather than introducing new perspectives?
4. **Natural Wrap-Up Language**: Are participants using concluding language ("In summary...", "To wrap up...", "Overall...")?
5. **Core Topic Explored**: Has the main question been adequately explored from multiple angles?

Respond in JSON format:
{
  "shouldEnd": true/false,
  "confidence": 0.0-1.0,
  "reasons": ["reason1", "reason2", ...]
}

Be conservative - only recommend ending if you're confident the discussion has genuinely wound down.
A confidence of 0.75+ suggests the discussion should end.`;

/**
 * Default configuration for end detection
 */
const DEFAULT_CONFIG: EndDetectionConfig = {
  enabled: true,
  checkInterval: 3,
  confidenceThreshold: 0.75,
};

/**
 * EndDetector Class
 * Evaluates informal discussions to detect natural stopping points
 */
export class EndDetector extends EventEmitter {
  private readonly discussionId: string;
  private readonly config: EndDetectionConfig;
  private readonly llmClient: EndDetectorLLMClient;

  /** Lock to prevent concurrent evaluations */
  private isEvaluating: boolean = false;

  /** Track last evaluation result */
  private lastResult: EndDetectionResult | null = null;

  /** Count of evaluations performed */
  private evaluationCount: number = 0;

  constructor(
    discussionId: string,
    llmClient: EndDetectorLLMClient,
    config: Partial<EndDetectionConfig> = {}
  ) {
    super();
    this.discussionId = discussionId;
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.info(
      {
        discussionId,
        checkInterval: this.config.checkInterval,
        confidenceThreshold: this.config.confidenceThreshold,
      },
      'EndDetector initialized'
    );
  }

  /**
   * Check if end detection is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the check interval (evaluate every N exchanges)
   */
  getCheckInterval(): number {
    return this.config.checkInterval;
  }

  /**
   * Get confidence threshold for triggering end
   */
  getConfidenceThreshold(): number {
    return this.config.confidenceThreshold;
  }

  /**
   * Evaluate whether the discussion should end
   */
  async evaluate(context: EndDetectionContext): Promise<EndDetectionResult> {
    // Prevent concurrent evaluations
    if (this.isEvaluating) {
      logger.debug('Evaluation already in progress, returning last result');
      return this.lastResult ?? {
        shouldEnd: false,
        confidence: 0,
        reasons: ['Evaluation in progress'],
      };
    }

    this.isEvaluating = true;
    this.evaluationCount++;

    logger.debug(
      {
        discussionId: this.discussionId,
        totalExchanges: context.totalExchanges,
        evaluationNumber: this.evaluationCount,
      },
      'Starting end detection evaluation'
    );

    this.emit('evaluation:started', context);

    try {
      // Build the prompt with context
      const prompt = this.buildPrompt(context);

      // Call LLM for evaluation
      const response = await this.llmClient.complete({
        messages: [
          {
            role: 'system',
            content: 'You are analyzing discussion patterns to detect natural stopping points. Respond only in JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2, // Low temp for consistent analysis
        maxTokens: 200,
      });

      // Parse response
      const result = this.parseResponse(response.content);

      this.lastResult = result;

      logger.info(
        {
          discussionId: this.discussionId,
          shouldEnd: result.shouldEnd,
          confidence: result.confidence,
          reasons: result.reasons,
        },
        'End detection evaluation completed'
      );

      this.emit('evaluation:completed', result);

      // Emit end:detected if above threshold
      if (result.shouldEnd && result.confidence >= this.config.confidenceThreshold) {
        this.emit('end:detected', result);
      }

      return result;

    } catch (error) {
      logger.error({ error, discussionId: this.discussionId }, 'Error in end detection evaluation');

      const failResult: EndDetectionResult = {
        shouldEnd: false,
        confidence: 0,
        reasons: ['Evaluation failed'],
      };

      this.lastResult = failResult;
      return failResult;

    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Check if discussion should end based on last evaluation
   */
  shouldEnd(): boolean {
    if (!this.lastResult) {
      return false;
    }
    return this.lastResult.shouldEnd && this.lastResult.confidence >= this.config.confidenceThreshold;
  }

  /**
   * Get the last evaluation result
   */
  getLastResult(): EndDetectionResult | null {
    return this.lastResult;
  }

  /**
   * Get evaluation count
   */
  getEvaluationCount(): number {
    return this.evaluationCount;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.lastResult = null;
    this.evaluationCount = 0;
    this.isEvaluating = false;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Build the evaluation prompt with context
   */
  private buildPrompt(context: EndDetectionContext): string {
    // Format recent exchanges for the prompt
    const formattedExchanges = context.recentExchanges
      .map((exchange) => {
        const utteranceLines = exchange.utterances
          .map((u) => `  [${u.participant}]: ${this.truncate(u.content, 300)}`)
          .join('\n');
        return `Exchange ${exchange.exchangeNumber}:\n${utteranceLines}`;
      })
      .join('\n\n');

    return END_DETECTION_PROMPT
      .replace('{topic}', context.topic)
      .replace('{totalExchanges}', String(context.totalExchanges))
      .replace('{maxExchanges}', String(context.maxExchanges))
      .replace('{recentExchanges}', formattedExchanges);
  }

  /**
   * Parse the LLM response
   */
  private parseResponse(content: string): EndDetectionResult {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn({ content }, 'No JSON found in end detection response');
        return {
          shouldEnd: false,
          confidence: 0,
          reasons: ['Failed to parse response'],
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        shouldEnd: Boolean(parsed.shouldEnd),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      };

    } catch (error) {
      logger.warn({ content, error }, 'Failed to parse end detection response');
      return {
        shouldEnd: false,
        confidence: 0,
        reasons: ['Failed to parse response'],
      };
    }
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Create a new EndDetector instance
 */
export function createEndDetector(
  discussionId: string,
  llmClient: EndDetectorLLMClient,
  config?: Partial<EndDetectionConfig>
): EndDetector {
  return new EndDetector(discussionId, llmClient, config);
}
