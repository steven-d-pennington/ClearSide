# INFRA-001: Set Up LLM API Integration Layer

**Priority:** P0
**Estimate:** M
**Labels:** `infrastructure`, `backend`
**Status:** 🟢 TO DO

---

## Context

ClearSide requires a robust abstraction layer for LLM API calls to support multiple providers (OpenAI, Anthropic, etc.) and handle retries, rate limiting, and error scenarios gracefully. This foundation is critical for all agent operations.

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Section 2.1 "Component Responsibilities"
- [Product Vision](../../../docs/01_product-vision.md) - Design Principle #1: Single-responsibility agents

---

## Requirements

### Acceptance Criteria

- [ ] Create LLM client abstraction that supports multiple providers
- [ ] Implement retry logic with exponential backoff (max 3 retries)
- [ ] Add rate limiting to respect provider limits
- [ ] Implement timeout handling (default 30s, configurable)
- [ ] Add structured error handling with error types
- [ ] Support streaming responses (for future use)
- [ ] Add request/response logging for debugging
- [ ] Include token usage tracking
- [ ] Create configuration for API keys and provider selection
- [ ] Write unit tests for retry and error scenarios

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **AGT-101 to AGT-411**: All agents require reliable LLM API access
- **NFR-201**: 99.9% uptime requires robust error handling
- **NFR-202**: <1% error rate requires retry logic

---

## Implementation Guide

### Recommended Approach

```typescript
// src/services/llm/types.ts
export interface LLMProvider {
  name: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  baseURL?: string;
}

export interface LLMRequest {
  provider: LLMProvider;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'error';
}

export class LLMError extends Error {
  constructor(
    message: string,
    public code: 'rate_limit' | 'timeout' | 'invalid_request' | 'server_error',
    public retryable: boolean
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// src/services/llm/client.ts
export class LLMClient {
  private retryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
  };

  async complete(request: LLMRequest): Promise<LLMResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.callProvider(request);
      this.logUsage(response);
      return response;
    });
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (this.shouldRetry(error, attempt)) {
        const delay = this.calculateBackoff(attempt);
        await this.sleep(delay);
        return this.executeWithRetry(fn, attempt + 1);
      }
      throw error;
    }
  }

  private shouldRetry(error: any, attempt: number): boolean {
    if (attempt >= this.retryConfig.maxRetries) return false;
    if (error instanceof LLMError) return error.retryable;
    return false;
  }

  private calculateBackoff(attempt: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  private async callProvider(request: LLMRequest): Promise<LLMResponse> {
    // Provider-specific implementation
    // OpenAI: use openai SDK
    // Anthropic: use @anthropic-ai/sdk
    // Add timeout wrapper
    throw new Error('Not implemented');
  }

  private logUsage(response: LLMResponse): void {
    console.log(`[LLM] Model: ${response.model}, Tokens: ${response.usage.totalTokens}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Configuration Example

```typescript
// .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=openai
LLM_DEFAULT_MODEL=gpt-4
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=3
```

### Test Cases

```typescript
// tests/llm-client.test.ts
describe('LLMClient', () => {
  it('should retry on rate limit errors', async () => {
    // Mock API to fail twice then succeed
    // Assert 3 total attempts
  });

  it('should not retry on invalid request errors', async () => {
    // Mock API to return 400 error
    // Assert only 1 attempt
  });

  it('should timeout after configured duration', async () => {
    // Mock API with long delay
    // Assert throws timeout error
  });

  it('should track token usage', async () => {
    // Mock successful response
    // Assert usage is logged
  });
});
```

---

## Dependencies

**None** - This is a foundational task

---

## Validation

### How to Test

1. Create a test script that calls the LLM client with various scenarios:
   - Normal successful request
   - Rate limit error (mock)
   - Timeout scenario (mock)
   - Invalid API key
2. Verify retry logic with logs
3. Check token usage is tracked correctly
4. Run unit tests with 100% coverage on error paths

### Definition of Done

- [ ] LLM client supports OpenAI and Anthropic providers
- [ ] Retry logic works with exponential backoff
- [ ] Rate limiting prevents excessive calls
- [ ] Timeout handling prevents hanging requests
- [ ] Errors are properly typed and logged
- [ ] Unit tests pass with >90% coverage
- [ ] Documentation includes usage examples
- [ ] Configuration is externalized to environment variables

---

## Notes

- Consider using a rate limiter library like `bottleneck` or `p-limit`
- OpenAI SDK already has retry logic built-in, may not need custom retry for that provider
- Anthropic SDK is simpler, will likely need custom retry wrapper
- Add structured logging (e.g., Winston, Pino) for production debugging
- Consider adding circuit breaker pattern for provider failures

---

**Estimated Time:** 6-8 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
