/**
 * LLM Client Simple Test
 *
 * Quick smoke test to verify basic functionality works
 */

import { describe, it, expect } from 'vitest';
import { LLMError } from '../src/types/llm.js';

describe('LLMError', () => {
  it('should create error with all properties', () => {
    const error = new LLMError('Test error', 'rate_limit', true, 429);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('rate_limit');
    expect(error.retryable).toBe(true);
    expect(error.statusCode).toBe(429);
    expect(error.name).toBe('LLMError');
  });

  it('should detect rate limit errors from message', () => {
    const error = LLMError.fromError(new Error('Rate limit exceeded'));

    expect(error.code).toBe('rate_limit');
    expect(error.retryable).toBe(true);
  });

  it('should detect authentication errors from message', () => {
    const error = LLMError.fromError(new Error('Unauthorized: Invalid API key'));

    expect(error.code).toBe('authentication');
    expect(error.retryable).toBe(false);
  });

  it('should detect timeout errors from message', () => {
    const error = LLMError.fromError(new Error('Request timed out'));

    expect(error.code).toBe('timeout');
    expect(error.retryable).toBe(true);
  });

  it('should handle non-Error objects', () => {
    const error = LLMError.fromError('String error message');

    expect(error).toBeInstanceOf(LLMError);
    expect(error.message).toBe('String error message');
  });
});
