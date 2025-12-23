/**
 * LLM API Integration Types
 *
 * Type definitions for the LLM client abstraction layer supporting
 * OpenAI and Anthropic providers with retry logic and error handling.
 */

/**
 * Supported LLM providers
 */
export type LLMProviderName = 'openai' | 'anthropic';

/**
 * LLM provider configuration
 */
export interface LLMProvider {
  /** Provider name */
  name: LLMProviderName;
  /** API key for authentication */
  apiKey: string;
  /** Optional custom base URL for API endpoint */
  baseURL?: string;
}

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Chat message structure
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Content of the message */
  content: string;
}

/**
 * LLM completion request
 */
export interface LLMRequest {
  /** Provider to use for this request */
  provider: LLMProviderName;
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus-20240229') */
  model: string;
  /** Conversation messages */
  messages: ChatMessage[];
  /** Temperature for response randomness (0.0 - 2.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Whether to stream the response (not implemented in phase 1) */
  stream?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Tokens used in the prompt */
  promptTokens: number;
  /** Tokens generated in the completion */
  completionTokens: number;
  /** Total tokens used (prompt + completion) */
  totalTokens: number;
}

/**
 * Reason why the completion finished
 */
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';

/**
 * LLM completion response
 */
export interface LLMResponse {
  /** Generated content */
  content: string;
  /** Model that generated the response */
  model: string;
  /** Token usage statistics */
  usage: TokenUsage;
  /** Reason the completion finished */
  finishReason: FinishReason;
  /** Provider that generated the response */
  provider: LLMProviderName;
}

/**
 * LLM error codes
 */
export type LLMErrorCode =
  | 'rate_limit'        // Rate limit exceeded
  | 'timeout'           // Request timed out
  | 'invalid_request'   // Invalid request parameters
  | 'server_error'      // Server-side error
  | 'authentication'    // Authentication failed
  | 'not_found'         // Resource not found
  | 'unknown';          // Unknown error

/**
 * Custom error class for LLM operations
 */
export class LLMError extends Error {
  /** Error code categorizing the error type */
  public readonly code: LLMErrorCode;
  /** Whether the error is retryable */
  public readonly retryable: boolean;
  /** HTTP status code if applicable */
  public readonly statusCode?: number;
  /** Original error that caused this error */
  public readonly cause?: Error;

  constructor(
    message: string,
    code: LLMErrorCode,
    retryable: boolean,
    statusCode?: number,
    cause?: Error
  ) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LLMError);
    }
  }

  /**
   * Create an LLMError from an unknown error
   */
  static fromError(error: unknown, defaultCode: LLMErrorCode = 'unknown'): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for common error patterns
      const message = error.message.toLowerCase();

      if (message.includes('rate limit') || message.includes('429')) {
        return new LLMError(error.message, 'rate_limit', true, 429, error);
      }

      if (message.includes('timeout') || message.includes('timed out')) {
        return new LLMError(error.message, 'timeout', true, undefined, error);
      }

      if (message.includes('authentication') || message.includes('unauthorized') || message.includes('401')) {
        return new LLMError(error.message, 'authentication', false, 401, error);
      }

      if (message.includes('not found') || message.includes('404')) {
        return new LLMError(error.message, 'not_found', false, 404, error);
      }

      if (message.includes('invalid') || message.includes('bad request') || message.includes('400')) {
        return new LLMError(error.message, 'invalid_request', false, 400, error);
      }

      if (message.includes('server error') || message.includes('500') || message.includes('503')) {
        return new LLMError(error.message, 'server_error', true, 500, error);
      }

      return new LLMError(error.message, defaultCode, false, undefined, error);
    }

    return new LLMError(String(error), defaultCode, false);
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
}
