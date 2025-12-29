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
import pino from 'pino';
import { LLMClient } from './client.js';
import type { DebateModelConfig } from '../../types/openrouter.js';
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

  constructor(modelId: string, apiKey?: string) {
    super(); // Initialize base LLM client

    this.modelId = modelId;
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

    logger.info({ modelId }, 'OpenRouter LLM client created');
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
   */
  async complete(request: import('../../types/llm.js').LLMRequest): Promise<import('../../types/llm.js').LLMResponse> {
    const rateLimiter = getRateLimiter();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        // Wait if rate limited
        await rateLimiter.waitIfNeeded(this.modelId);

        // Record the request
        rateLimiter.recordRequest(this.modelId);

        logger.info({
          provider: 'openrouter',
          model: this.modelId,
          messageCount: request.messages.length,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          attempt: attempt > 0 ? attempt + 1 : undefined,
        }, 'Starting OpenRouter completion request');

        const completion = await this.openRouterClient.chat.completions.create({
          model: this.modelId,
          messages: request.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4096,
          stream: false,
        });

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

        const response = await this.openRouterClient.chat.completions.create({
          model: this.modelId,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
          stream: false,
        });

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
      const stream = await this.openRouterClient.chat.completions.create({
        model: this.modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true,
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
}

/**
 * Create an OpenRouter LLM client for a specific model
 */
export function createOpenRouterClient(modelId: string): OpenRouterLLMClient {
  return new OpenRouterLLMClient(modelId);
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

  // Create model-specific clients
  const proClient = config.proModelId
    ? createOpenRouterClient(config.proModelId)
    : defaultLLMClient;

  const conClient = config.conModelId
    ? createOpenRouterClient(config.conModelId)
    : defaultLLMClient;

  // Moderator uses specified model or default
  const moderatorClient = config.moderatorModelId
    ? createOpenRouterClient(config.moderatorModelId)
    : defaultLLMClient;

  logger.info(
    {
      proModel: config.proModelId || 'default',
      conModel: config.conModelId || 'default',
      moderatorModel: config.moderatorModelId || 'default',
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
