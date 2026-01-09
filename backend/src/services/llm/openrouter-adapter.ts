/**
 * OpenRouter LLM Client Adapter
 *
 * Creates LLM clients configured to use OpenRouter with specific models.
 * Uses OpenAI SDK with baseURL override for compatibility since OpenRouter
 * is OpenAI-compatible.
 *
 * Includes proactive rate limiting and smart retry logic.
 */

import OpenAI from 'openai';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import pino from 'pino';
import { LLMClient } from './client.js';
import type { DebateModelConfig, ReasoningConfig } from '../../types/openrouter.js';
import { getRateLimiter, parseRateLimitHeaders, type RateLimitHeaders } from './rate-limiter.js';

const logger = pino({
  name: 'openrouter-adapter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

/**
 * OpenRouter-specific configuration
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Model-specific LLM client for OpenRouter
 *
 * Wraps the standard LLMClient but routes requests through OpenRouter
 * with a specific model.
 */
export class OpenRouterLLMClient extends LLMClient {
  private openRouterClient: OpenAI;
  private modelId: string;
  private reasoningConfig?: ReasoningConfig;

  constructor(modelId: string, apiKey?: string, reasoningConfig?: ReasoningConfig) {
    super(); // Initialize base LLM client

    this.modelId = modelId;
    this.reasoningConfig = reasoningConfig;
    const key = apiKey || process.env.OPENROUTER_API_KEY;

    if (!key) {
      throw new Error('OpenRouter API key not configured');
    }

    this.openRouterClient = new OpenAI({
      apiKey: key,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
        'X-Title': 'ClearSide Debate',
      },
    });

    logger.info({ modelId, reasoning: reasoningConfig?.effort || 'default' }, 'OpenRouter LLM client created');
  }

  /**
   * Set or update reasoning configuration
   */
  setReasoningConfig(config: ReasoningConfig): void {
    this.reasoningConfig = config;
    logger.debug({ modelId: this.modelId, reasoning: config }, 'Reasoning config updated');
  }

  /**
   * Build reasoning parameter for OpenRouter API
   * @see https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
   */
  private buildReasoningParam(): Record<string, unknown> | undefined {
    if (!this.reasoningConfig) {
      return undefined;
    }

    const { enabled, effort, maxTokens, exclude } = this.reasoningConfig;

    // If explicitly disabled, don't include reasoning
    if (enabled === false) {
      return undefined;
    }

    // Check if effort is 'none' (disabled)
    if (effort === 'none') {
      return undefined;
    }

    const reasoning: Record<string, unknown> = {};

    if (enabled !== undefined) {
      reasoning.enabled = enabled;
    }

    // Use effort OR maxTokens, not both
    if (maxTokens !== undefined) {
      reasoning.max_tokens = maxTokens;
    } else if (effort !== undefined) {
      reasoning.effort = effort;
    }

    if (exclude !== undefined) {
      reasoning.exclude = exclude;
    }

    return Object.keys(reasoning).length > 0 ? reasoning : undefined;
  }

  /**
   * Get the OpenAI-compatible client for OpenRouter
   */
  getOpenAIClient(): OpenAI {
    return this.openRouterClient;
  }

  /**
   * Get the model ID this client is configured for
   */
  getModelId(): string {
    return this.modelId;
  }

  /**
   * Override complete method to use OpenRouter
   * This is the main method used by agents
   * Includes rate limiting and smart retry logic
   *
   * Accepts both full LLMRequest and simplified SimpleLLMRequest since
   * provider and model are managed internally by this client.
   */
  async complete(request: import('../../types/llm.js').LLMRequest | import('../../types/llm.js').SimpleLLMRequest): Promise<import('../../types/llm.js').LLMResponse> {
    const rateLimiter = getRateLimiter();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        // Wait if rate limited
        await rateLimiter.waitIfNeeded(this.modelId);

        // Record the request
        rateLimiter.recordRequest(this.modelId);

        const reasoning = this.buildReasoningParam();

        logger.info({
          provider: 'openrouter',
          model: this.modelId,
          messageCount: request.messages.length,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          reasoning: reasoning ? 'enabled' : 'disabled',
          attempt: attempt > 0 ? attempt + 1 : undefined,
        }, 'Starting OpenRouter completion request');

        // Build base request parameters
        const baseRequest = {
          model: this.modelId,
          messages: request.messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4096,
          stream: false as const,
        };

        // Add reasoning if configured (OpenRouter extended thinking)
        // This is passed as an extra body param for OpenRouter's non-standard extension
        const completion = await this.openRouterClient.chat.completions.create({
          ...baseRequest,
          ...(reasoning && { reasoning }),
        }) as ChatCompletion;

        const choice = completion.choices[0];
        const content = choice?.message?.content ?? '';

        const duration = Date.now() - startTime;
        const usage = {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
          totalTokens: completion.usage?.total_tokens ?? 0,
        };

        logger.info({
          provider: 'openrouter',
          model: this.modelId,
          duration,
          usage,
        }, 'OpenRouter completion successful');

        return {
          content,
          model: completion.model || this.modelId,
          usage,
          finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
          provider: 'openrouter',
          citations: (completion as any).citations,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a rate limit error
        const isRateLimitError = this.isRateLimitError(error);
        const rateLimitHeaders = this.extractRateLimitHeaders(error);

        // Update rate limiter with headers from error response
        if (rateLimitHeaders) {
          rateLimiter.updateFromHeaders(this.modelId, rateLimitHeaders);
        }

        logger.warn({
          error: lastError.message,
          modelId: this.modelId,
          duration,
          attempt: attempt + 1,
          maxRetries: RETRY_CONFIG.maxRetries,
          isRateLimitError,
        }, 'OpenRouter completion failed');

        // If we've exhausted retries, throw
        if (attempt >= RETRY_CONFIG.maxRetries) {
          logger.error({
            error: lastError.message,
            modelId: this.modelId,
            totalAttempts: attempt + 1,
          }, 'OpenRouter completion failed after all retries');
          throw lastError;
        }

        // Calculate wait time before retry
        let waitTime: number;
        if (isRateLimitError) {
          // Use rate limiter's smart backoff for rate limit errors
          waitTime = rateLimiter.getRetryAfter(this.modelId, rateLimitHeaders);
        } else {
          // Exponential backoff for other errors
          waitTime = Math.min(
            RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
            RETRY_CONFIG.maxDelayMs
          );
        }

        logger.info({
          modelId: this.modelId,
          waitTimeMs: waitTime,
          nextAttempt: attempt + 2,
        }, 'Waiting before retry');

        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Unknown error in OpenRouter completion');
  }

  /**
   * Generate with extended OpenRouter options (e.g. for Perplexity)
   */
  async generate(options: {
    model: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    max_tokens?: number;
    extra_body?: Record<string, any>;
  }): Promise<import('../../types/llm.js').LLMResponse> {
    const rateLimiter = getRateLimiter();
    // Use the model from options, or fall back to client's configured model
    const startModelId = options.model || this.modelId;
    let lastError: Error | null = null;
    let currentModelId = startModelId;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        await rateLimiter.waitIfNeeded(currentModelId);
        rateLimiter.recordRequest(currentModelId);

        logger.info({
          provider: 'openrouter',
          model: currentModelId,
          messageCount: options.messages.length,
          hasExtraBody: !!options.extra_body,
        }, 'Starting OpenRouter generate request');

        const requestBody: any = {
          model: currentModelId,
          messages: options.messages.map(msg => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 4096,
          stream: false,
        };

        if (options.extra_body) {
          Object.assign(requestBody, options.extra_body);
        }

        // Add reasoning if configured (and not overridden by extra_body)
        const reasoning = this.buildReasoningParam();
        if (reasoning && !requestBody.reasoning) {
          requestBody.reasoning = reasoning;
        }

        const completion = await this.openRouterClient.chat.completions.create(requestBody) as ChatCompletion;

        const choice = completion.choices[0];
        const content = choice?.message?.content ?? '';

        const usage = {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
          totalTokens: completion.usage?.total_tokens ?? 0,
        };

        return {
          content,
          model: completion.model || currentModelId,
          usage,
          finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
          provider: 'openrouter',
          citations: (completion as any).citations,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRateLimitError = this.isRateLimitError(error);
        const rateLimitHeaders = this.extractRateLimitHeaders(error);

        if (rateLimitHeaders) {
          rateLimiter.updateFromHeaders(currentModelId, rateLimitHeaders);
        }

        if (attempt >= RETRY_CONFIG.maxRetries) throw lastError;

        const waitTime = isRateLimitError
          ? rateLimiter.getRetryAfter(currentModelId, rateLimitHeaders)
          : Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt), RETRY_CONFIG.maxDelayMs);

        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError || new Error('Unknown error in OpenRouter generate');
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('429') || message.includes('rate limit')) {
        return true;
      }
    }
    // Check for OpenAI SDK error structure
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.status === 429 || e.code === 429) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract rate limit headers from error response
   */
  private extractRateLimitHeaders(error: unknown): RateLimitHeaders | undefined {
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;

      // Check for headers in error object
      if (e.headers && typeof e.headers === 'object') {
        return parseRateLimitHeaders(e.headers as Record<string, string>);
      }

      // Check for nested error with metadata
      if (e.error && typeof e.error === 'object') {
        const innerError = e.error as Record<string, unknown>;
        if (innerError.metadata && typeof innerError.metadata === 'object') {
          const metadata = innerError.metadata as Record<string, unknown>;
          if (metadata.headers && typeof metadata.headers === 'object') {
            return parseRateLimitHeaders(metadata.headers as Record<string, string>);
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Override chat method to use OpenRouter
   * Includes rate limiting and retry logic
   */
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const rateLimiter = getRateLimiter();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        // Wait if rate limited
        await rateLimiter.waitIfNeeded(this.modelId);

        // Record the request
        rateLimiter.recordRequest(this.modelId);

        const reasoning = this.buildReasoningParam();
        const baseRequest = {
          model: this.modelId,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
          stream: false as const,
        };

        const response = await this.openRouterClient.chat.completions.create({
          ...baseRequest,
          ...(reasoning && { reasoning }),
        }) as ChatCompletion;

        return response.choices[0]?.message?.content || '';
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRateLimitError = this.isRateLimitError(error);
        const rateLimitHeaders = this.extractRateLimitHeaders(error);

        if (rateLimitHeaders) {
          rateLimiter.updateFromHeaders(this.modelId, rateLimitHeaders);
        }

        logger.warn({
          error: lastError.message,
          modelId: this.modelId,
          attempt: attempt + 1,
          isRateLimitError,
        }, 'OpenRouter chat failed');

        if (attempt >= RETRY_CONFIG.maxRetries) {
          logger.error({ error: lastError.message, modelId: this.modelId }, 'OpenRouter chat failed after all retries');
          throw lastError;
        }

        const waitTime = isRateLimitError
          ? rateLimiter.getRetryAfter(this.modelId, rateLimitHeaders)
          : Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt), RETRY_CONFIG.maxDelayMs);

        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError || new Error('Unknown error in OpenRouter chat');
  }

  /**
   * Override streamChat method to use OpenRouter
   * Includes rate limiting (retry is harder with streaming)
   */
  async *streamChat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    const rateLimiter = getRateLimiter();

    // Wait if rate limited before starting stream
    await rateLimiter.waitIfNeeded(this.modelId);

    // Record the request
    rateLimiter.recordRequest(this.modelId);

    try {
      const reasoning = this.buildReasoningParam();
      const baseRequest = {
        model: this.modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true as const,
      };

      const stream = await this.openRouterClient.chat.completions.create({
        ...baseRequest,
        ...(reasoning && { reasoning }),
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      // Update rate limiter from error if rate limit
      const rateLimitHeaders = this.extractRateLimitHeaders(error);
      if (rateLimitHeaders) {
        rateLimiter.updateFromHeaders(this.modelId, rateLimitHeaders);
      }

      logger.error({ error, modelId: this.modelId }, 'OpenRouter stream error');
      throw error;
    }
  }

  /**
   * Stream chat with metadata - returns content and finish_reason
   * Used for truncation detection
   */
  async streamChatWithMetadata(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
    onToken?: (token: string) => void
  ): Promise<{ content: string; finishReason: 'stop' | 'length' | 'unknown' }> {
    const rateLimiter = getRateLimiter();

    // Wait if rate limited before starting stream
    await rateLimiter.waitIfNeeded(this.modelId);

    // Record the request
    rateLimiter.recordRequest(this.modelId);

    const chunks: string[] = [];
    let finishReason: 'stop' | 'length' | 'unknown' = 'unknown';

    try {
      const reasoning = this.buildReasoningParam();
      const baseRequest = {
        model: this.modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true as const,
      };

      const stream = await this.openRouterClient.chat.completions.create({
        ...baseRequest,
        ...(reasoning && { reasoning }),
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          chunks.push(content);
          if (onToken) {
            onToken(content);
          }
        }

        // Capture finish_reason from the final chunk
        const chunkFinishReason = chunk.choices[0]?.finish_reason;
        if (chunkFinishReason) {
          finishReason = chunkFinishReason === 'length' ? 'length' : 'stop';
        }
      }

      return {
        content: chunks.join(''),
        finishReason,
      };
    } catch (error) {
      // Update rate limiter from error if rate limit
      const rateLimitHeaders = this.extractRateLimitHeaders(error);
      if (rateLimitHeaders) {
        rateLimiter.updateFromHeaders(this.modelId, rateLimitHeaders);
      }

      logger.error({ error, modelId: this.modelId }, 'OpenRouter stream error');
      throw error;
    }
  }
}

/**
 * Create an OpenRouter LLM client for a specific model
 */
export function createOpenRouterClient(modelId: string, reasoningConfig?: ReasoningConfig): OpenRouterLLMClient {
  return new OpenRouterLLMClient(modelId, undefined, reasoningConfig);
}

/**
 * Create LLM clients for Pro, Con, and Moderator roles
 *
 * If model config specifies OpenRouter models, creates OpenRouter clients.
 * Otherwise falls back to default LLM client.
 */
export async function createDebateClients(config?: DebateModelConfig): Promise<{
  proClient: LLMClient;
  conClient: LLMClient;
  moderatorClient: LLMClient;
  proModelId?: string;
  conModelId?: string;
  moderatorModelId?: string;
}> {
  // Import default client lazily to avoid circular dependencies
  const { defaultLLMClient } = await import('./index.js');

  // If no config or auto mode without models set, use defaults
  if (!config || (config.selectionMode === 'auto' && !config.proModelId)) {
    logger.debug('Using default LLM clients for all roles');
    return {
      proClient: defaultLLMClient,
      conClient: defaultLLMClient,
      moderatorClient: defaultLLMClient,
    };
  }

  // Check if OpenRouter is configured
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!hasOpenRouter) {
    logger.warn('OpenRouter not configured, falling back to default clients');
    return {
      proClient: defaultLLMClient,
      conClient: defaultLLMClient,
      moderatorClient: defaultLLMClient,
    };
  }

  // Create model-specific clients with optional reasoning config
  const proClient = config.proModelId
    ? createOpenRouterClient(config.proModelId, config.reasoning)
    : defaultLLMClient;

  const conClient = config.conModelId
    ? createOpenRouterClient(config.conModelId, config.reasoning)
    : defaultLLMClient;

  // Moderator uses specified model or default
  const moderatorClient = config.moderatorModelId
    ? createOpenRouterClient(config.moderatorModelId, config.reasoning)
    : defaultLLMClient;

  logger.info(
    {
      proModel: config.proModelId || 'default',
      conModel: config.conModelId || 'default',
      moderatorModel: config.moderatorModelId || 'default',
      reasoning: config.reasoning?.effort || 'disabled',
    },
    'Created debate clients with model config'
  );

  return {
    proClient,
    conClient,
    moderatorClient,
    proModelId: config.proModelId,
    conModelId: config.conModelId,
    moderatorModelId: config.moderatorModelId,
  };
}

/**
 * Check if OpenRouter is available
 */
export function isOpenRouterAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}
