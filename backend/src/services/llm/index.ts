/**
 * LLM Service Barrel Export
 *
 * Centralized exports for LLM client and related functionality
 */

export { LLMClient, defaultLLMClient } from './client.js';
export type {
  LLMRequest,
  LLMResponse,
  LLMProvider,
  LLMProviderName,
  ChatMessage,
  MessageRole,
  TokenUsage,
  FinishReason,
  RetryConfig,
  LLMErrorCode,
} from '../../types/llm.js';
export { LLMError } from '../../types/llm.js';
export { llmConfig, validateLLMConfig } from '../../config/llm.js';
export type { LLMConfig } from '../../config/llm.js';
