/**
 * LLM Client Implementation
 *
 * Unified client for interacting with multiple LLM providers (OpenAI, Anthropic)
 * with automatic retry logic, timeout handling, and token usage tracking.
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import pino from 'pino';
import type {
  LLMRequest,
  LLMResponse,
  RetryConfig,
  TokenUsage,
  FinishReason,
} from '../../types/llm.js';
import { LLMError } from '../../types/llm.js';
import { llmConfig } from '../../config/llm.js';

/**
 * Logger instance for LLM operations
 */
const logger = pino({
  name: 'llm-client',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * LLM Client for unified provider access
 */
export class LLMClient {
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private retryConfig: RetryConfig;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: retryConfig?.maxRetries ?? llmConfig.retry.maxRetries,
      baseDelay: retryConfig?.baseDelay ?? llmConfig.retry.baseDelay,
      maxDelay: retryConfig?.maxDelay ?? llmConfig.retry.maxDelay,
    };

    // Initialize OpenAI client if API key is available
    if (llmConfig.openai.apiKey) {
      this.openaiClient = new OpenAI({
        apiKey: llmConfig.openai.apiKey,
        baseURL: llmConfig.openai.baseURL,
      });
      logger.info('OpenAI client initialized');
    }

    // Initialize Anthropic client if API key is available
    if (llmConfig.anthropic.apiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: llmConfig.anthropic.apiKey,
        baseURL: llmConfig.anthropic.baseURL,
      });
      logger.info('Anthropic client initialized');
    }

    if (!this.openaiClient && !this.anthropicClient) {
      logger.warn('No LLM providers configured - at least one API key required');
    }
  }

  /**
   * Get the OpenAI client for direct streaming access
   * This is used by adapters like OpenRouterLLMClient
   */
  getOpenAIClient(): OpenAI | null {
    return this.openaiClient;
  }

  /**
   * Stream chat completion with token-by-token streaming
   * Base implementation throws error - override in provider-specific adapters
   */
  async *streamChat(
    _messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    _options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    throw new Error('streamChat not implemented for this LLM provider. Use OpenRouterLLMClient for streaming.');
  }

  /**
   * Simple chat method for non-streaming requests
   * Convenience wrapper around complete()
   */
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const request: LLMRequest = {
      provider: llmConfig.defaultProvider,
      model: llmConfig.defaultModels[llmConfig.defaultProvider],
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };

    const response = await this.complete(request);
    return response.content;
  }

  /**
   * Complete a chat request with automatic retry logic
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    logger.info({
      provider: request.provider,
      model: request.model,
      messageCount: request.messages.length,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    }, 'Starting LLM completion request');

    try {
      const response = await this.executeWithRetry(request);

      const duration = Date.now() - startTime;
      logger.info({
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        duration,
        finishReason: response.finishReason,
      }, 'LLM completion successful');

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const llmError = LLMError.fromError(error);

      logger.error({
        provider: request.provider,
        model: request.model,
        duration,
        error: {
          code: llmError.code,
          message: llmError.message,
          retryable: llmError.retryable,
          statusCode: llmError.statusCode,
        },
      }, 'LLM completion failed');

      throw llmError;
    }
  }

  /**
   * Execute request with exponential backoff retry logic
   */
  private async executeWithRetry(request: LLMRequest, attempt: number = 0): Promise<LLMResponse> {
    try {
      return await this.executeRequest(request);
    } catch (error) {
      const llmError = LLMError.fromError(error);

      if (this.shouldRetry(llmError, attempt)) {
        const delay = this.calculateBackoff(attempt);

        logger.warn({
          provider: request.provider,
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          delay,
          errorCode: llmError.code,
        }, 'Retrying LLM request after error');

        await this.sleep(delay);
        return this.executeWithRetry(request, attempt + 1);
      }

      throw llmError;
    }
  }

  /**
   * Determine if error should be retried
   */
  private shouldRetry(error: LLMError, attempt: number): boolean {
    return error.retryable && attempt < this.retryConfig.maxRetries;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
    const delay = exponentialDelay + jitter;
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute request with appropriate provider
   */
  private async executeRequest(request: LLMRequest): Promise<LLMResponse> {
    const timeout = request.timeout ?? llmConfig.timeoutMs;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new LLMError(
          `Request timeout after ${timeout}ms`,
          'timeout',
          true,
          undefined
        ));
      }, timeout);
    });

    // Race between actual request and timeout
    const requestPromise = request.provider === 'openai'
      ? this.executeOpenAIRequest(request)
      : this.executeAnthropicRequest(request);

    return Promise.race([requestPromise, timeoutPromise]);
  }

  /**
   * Execute OpenAI API request
   */
  private async executeOpenAIRequest(request: LLMRequest): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new LLMError(
        'OpenAI client not initialized - missing API key',
        'authentication',
        false
      );
    }

    try {
      const completion = await this.openaiClient.chat.completions.create({
        model: request.model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: false, // Streaming not implemented in phase 1
      });

      const choice = completion.choices[0];
      if (!choice) {
        throw new LLMError(
          'No completion choices returned from OpenAI',
          'server_error',
          true
        );
      }

      const content = choice.message.content ?? '';
      const usage: TokenUsage = {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      };

      const finishReason = this.mapOpenAIFinishReason(choice.finish_reason);

      return {
        content,
        model: completion.model,
        usage,
        finishReason,
        provider: 'openai',
      };
    } catch (error: unknown) {
      throw this.handleOpenAIError(error);
    }
  }

  /**
   * Execute Anthropic API request
   */
  private async executeAnthropicRequest(request: LLMRequest): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new LLMError(
        'Anthropic client not initialized - missing API key',
        'authentication',
        false
      );
    }

    try {
      // Anthropic requires system messages to be separate
      const systemMessage = request.messages.find(m => m.role === 'system');
      const conversationMessages = request.messages
        .filter(m => m.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      const response = await this.anthropicClient.messages.create({
        model: request.model,
        system: systemMessage?.content,
        messages: conversationMessages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
      });

      // Extract text content from response
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => ('text' in block ? block.text : ''))
        .join('\n');

      const usage: TokenUsage = {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };

      const finishReason = this.mapAnthropicStopReason(response.stop_reason);

      return {
        content: textContent,
        model: response.model,
        usage,
        finishReason,
        provider: 'anthropic',
      };
    } catch (error: unknown) {
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Map OpenAI finish reason to our standard format
   */
  private mapOpenAIFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  /**
   * Map Anthropic stop reason to our standard format
   */
  private mapAnthropicStopReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }

  /**
   * Handle OpenAI-specific errors
   */
  private handleOpenAIError(error: unknown): LLMError {
    if (error instanceof OpenAI.APIError) {
      // Rate limit error
      if (error.status === 429) {
        return new LLMError(
          error.message,
          'rate_limit',
          true,
          error.status,
          error
        );
      }

      // Authentication error
      if (error.status === 401) {
        return new LLMError(
          error.message,
          'authentication',
          false,
          error.status,
          error
        );
      }

      // Invalid request
      if (error.status === 400) {
        return new LLMError(
          error.message,
          'invalid_request',
          false,
          error.status,
          error
        );
      }

      // Server error
      if (error.status && error.status >= 500) {
        return new LLMError(
          error.message,
          'server_error',
          true,
          error.status,
          error
        );
      }
    }

    return LLMError.fromError(error);
  }

  /**
   * Handle Anthropic-specific errors
   */
  private handleAnthropicError(error: unknown): LLMError {
    if (error instanceof Anthropic.APIError) {
      // Rate limit error
      if (error.status === 429) {
        return new LLMError(
          error.message,
          'rate_limit',
          true,
          error.status,
          error
        );
      }

      // Authentication error
      if (error.status === 401) {
        return new LLMError(
          error.message,
          'authentication',
          false,
          error.status,
          error
        );
      }

      // Invalid request
      if (error.status === 400) {
        return new LLMError(
          error.message,
          'invalid_request',
          false,
          error.status,
          error
        );
      }

      // Server error
      if (error.status && error.status >= 500) {
        return new LLMError(
          error.message,
          'server_error',
          true,
          error.status,
          error
        );
      }
    }

    return LLMError.fromError(error);
  }
}

/**
 * Default LLM client instance
 */
export const defaultLLMClient = new LLMClient();
