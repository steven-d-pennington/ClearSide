/**
 * LLM Configuration
 *
 * Configuration for LLM providers loaded from environment variables.
 * Supports OpenAI and Anthropic with configurable retry and timeout settings.
 */

import { config } from 'dotenv';
import type { DefaultLLMProvider, RetryConfig } from '../types/llm.js';

// Load environment variables
config();

/**
 * LLM configuration interface
 */
export interface LLMConfig {
  /** OpenAI API key */
  openai: {
    apiKey: string;
    baseURL?: string;
  };
  /** Anthropic API key */
  anthropic: {
    apiKey: string;
    baseURL?: string;
  };
  /** Default provider to use (OpenRouter is excluded as it's a router, not direct provider) */
  defaultProvider: DefaultLLMProvider;
  /** Default model for each provider */
  defaultModels: {
    openai: string;
    anthropic: string;
  };
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Retry configuration */
  retry: RetryConfig;
}

/**
 * Get environment variable or throw error if required and missing
 */
function getEnvVar(key: string, required: boolean = false, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;

  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value || '';
}

/**
 * Parse integer from environment variable
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid integer value for ${key}: ${value}, using default: ${defaultValue}`);
    return defaultValue;
  }

  return parsed;
}

/**
 * Validate provider name
 */
function validateProvider(provider: string): DefaultLLMProvider {
  if (provider !== 'openai' && provider !== 'anthropic') {
    throw new Error(`Invalid LLM provider: ${provider}. Must be 'openai' or 'anthropic'`);
  }
  return provider as DefaultLLMProvider;
}

/**
 * LLM configuration loaded from environment variables
 *
 * Environment variables:
 * - OPENAI_API_KEY: OpenAI API key (required if using OpenAI)
 * - OPENAI_BASE_URL: Custom OpenAI API base URL (optional)
 * - ANTHROPIC_API_KEY: Anthropic API key (required if using Anthropic)
 * - ANTHROPIC_BASE_URL: Custom Anthropic API base URL (optional)
 * - LLM_PROVIDER: Default provider ('openai' | 'anthropic', default: 'anthropic')
 * - LLM_DEFAULT_MODEL_OPENAI: Default OpenAI model (default: 'gpt-4o')
 * - LLM_DEFAULT_MODEL_ANTHROPIC: Default Anthropic model (default: 'claude-3-5-sonnet-20241022')
 * - LLM_TIMEOUT_MS: Request timeout in milliseconds (default: 30000)
 * - LLM_MAX_RETRIES: Maximum retry attempts (default: 3)
 * - LLM_RETRY_BASE_DELAY: Base retry delay in milliseconds (default: 1000)
 * - LLM_RETRY_MAX_DELAY: Maximum retry delay in milliseconds (default: 10000)
 */
export const llmConfig: LLMConfig = {
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY'),
    baseURL: getEnvVar('OPENAI_BASE_URL'),
  },
  anthropic: {
    apiKey: getEnvVar('ANTHROPIC_API_KEY'),
    baseURL: getEnvVar('ANTHROPIC_BASE_URL'),
  },
  defaultProvider: validateProvider(getEnvVar('LLM_PROVIDER', false, 'anthropic')),
  defaultModels: {
    openai: getEnvVar('LLM_DEFAULT_MODEL_OPENAI', false, 'gpt-4o'),
    anthropic: getEnvVar('LLM_DEFAULT_MODEL_ANTHROPIC', false, 'claude-3-5-sonnet-20241022'),
  },
  timeoutMs: getEnvInt('LLM_TIMEOUT_MS', 30000),
  retry: {
    maxRetries: getEnvInt('LLM_MAX_RETRIES', 3),
    baseDelay: getEnvInt('LLM_RETRY_BASE_DELAY', 1000),
    maxDelay: getEnvInt('LLM_RETRY_MAX_DELAY', 10000),
  },
};

/**
 * Validate configuration at startup
 */
export function validateLLMConfig(): void {
  const errors: string[] = [];

  // Check that at least one provider has an API key
  if (!llmConfig.openai.apiKey && !llmConfig.anthropic.apiKey) {
    errors.push('At least one LLM provider API key must be configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)');
  }

  // Check that the default provider has an API key
  if (llmConfig.defaultProvider === 'openai' && !llmConfig.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required when LLM_PROVIDER is set to "openai"');
  }

  if (llmConfig.defaultProvider === 'anthropic' && !llmConfig.anthropic.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required when LLM_PROVIDER is set to "anthropic"');
  }

  // Validate retry configuration
  if (llmConfig.retry.maxRetries < 0) {
    errors.push('LLM_MAX_RETRIES must be >= 0');
  }

  if (llmConfig.retry.baseDelay < 0) {
    errors.push('LLM_RETRY_BASE_DELAY must be >= 0');
  }

  if (llmConfig.retry.maxDelay < llmConfig.retry.baseDelay) {
    errors.push('LLM_RETRY_MAX_DELAY must be >= LLM_RETRY_BASE_DELAY');
  }

  if (llmConfig.timeoutMs < 1000) {
    errors.push('LLM_TIMEOUT_MS must be >= 1000 (1 second)');
  }

  if (errors.length > 0) {
    throw new Error(`LLM configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Auto-validate on import (can be disabled for testing)
if (process.env.NODE_ENV !== 'test') {
  try {
    validateLLMConfig();
  } catch (error) {
    console.error('LLM configuration validation failed:', error);
    // Don't throw in development to allow partial configuration
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}
