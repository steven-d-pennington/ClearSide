/**
 * Rate Limiter Service
 *
 * Proactive rate limiting for LLM API calls with model-specific limits.
 * Tracks requests in sliding windows and respects rate limit headers from providers.
 */

import pino from 'pino';

const logger = pino({
  name: 'rate-limiter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Rate limit configuration per model tier
 */
interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerSecond: number;
  // Buffer to stay under limits (e.g., 0.8 = use 80% of limit)
  safetyBuffer: number;
}

/**
 * Default rate limits by model tier
 * These are conservative defaults - actual limits come from API headers
 */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // Free models have very low limits
  free: {
    requestsPerMinute: 10,  // Conservative for free tier
    requestsPerSecond: 1,
    safetyBuffer: 0.7,
  },
  // Budget models
  budget: {
    requestsPerMinute: 30,
    requestsPerSecond: 3,
    safetyBuffer: 0.8,
  },
  // Mid-tier models
  mid_tier: {
    requestsPerMinute: 60,
    requestsPerSecond: 5,
    safetyBuffer: 0.85,
  },
  // Frontier models - usually higher limits
  frontier: {
    requestsPerMinute: 100,
    requestsPerSecond: 10,
    safetyBuffer: 0.9,
  },
  // Default fallback
  default: {
    requestsPerMinute: 20,
    requestsPerSecond: 2,
    safetyBuffer: 0.8,
  },
};

/**
 * Request record for tracking
 */
interface RequestRecord {
  timestamp: number;
  modelId: string;
}

/**
 * Rate limit state for a model
 */
interface ModelRateLimitState {
  // Requests in the current minute window
  requests: RequestRecord[];
  // Known limit from API headers
  knownLimit?: number;
  // Known remaining from API headers
  knownRemaining?: number;
  // Reset timestamp from API headers
  resetTimestamp?: number;
  // Last update time
  lastUpdated: number;
}

/**
 * Rate limit headers from provider response
 */
export interface RateLimitHeaders {
  limit?: number;
  remaining?: number;
  reset?: number;  // Unix timestamp in ms
}

/**
 * Rate Limiter Class
 *
 * Provides proactive rate limiting with adaptive limits based on API responses.
 */
export class RateLimiter {
  private modelStates: Map<string, ModelRateLimitState> = new Map();
  private globalRequests: RequestRecord[] = [];

  // Global limits (across all models)
  private globalRequestsPerMinute: number = 200;
  private globalRequestsPerSecond: number = 20;

  constructor(options?: {
    globalRequestsPerMinute?: number;
    globalRequestsPerSecond?: number;
  }) {
    if (options?.globalRequestsPerMinute) {
      this.globalRequestsPerMinute = options.globalRequestsPerMinute;
    }
    if (options?.globalRequestsPerSecond) {
      this.globalRequestsPerSecond = options.globalRequestsPerSecond;
    }

    // Clean up old records periodically
    setInterval(() => this.cleanup(), 60000);

    logger.info({
      globalRPM: this.globalRequestsPerMinute,
      globalRPS: this.globalRequestsPerSecond,
    }, 'Rate limiter initialized');
  }

  /**
   * Get the tier for a model based on its ID
   */
  private getModelTier(modelId: string): string {
    const lowerId = modelId.toLowerCase();

    // Free models
    if (lowerId.includes(':free') || lowerId.includes('/free')) {
      return 'free';
    }

    // Frontier models (expensive, high-capability)
    const frontierPatterns = [
      'claude-3-opus', 'claude-3.5-sonnet', 'claude-opus',
      'gpt-4-turbo', 'gpt-4o', 'gpt-4-32k',
      'gemini-1.5-pro', 'gemini-ultra',
    ];
    if (frontierPatterns.some(p => lowerId.includes(p))) {
      return 'frontier';
    }

    // Mid-tier models
    const midTierPatterns = [
      'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-haiku', 'claude-haiku',
      'gpt-3.5-turbo', 'gpt-4o-mini', 'gpt-5-mini',
      'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-flash',
      'mistral-large', 'mistral-medium',
      'llama-3.1-70b', 'llama-3.1-405b', 'llama-3.3',
    ];
    if (midTierPatterns.some(p => lowerId.includes(p))) {
      return 'mid_tier';
    }

    // Budget models
    const budgetPatterns = [
      'mistral-7b', 'mixtral', 'llama-3.1-8b',
      'phi-3', 'gemma',
    ];
    if (budgetPatterns.some(p => lowerId.includes(p))) {
      return 'budget';
    }

    return 'default';
  }

  /**
   * Get rate limit config for a model
   */
  private getConfig(modelId: string): RateLimitConfig {
    const tier = this.getModelTier(modelId);
    const config = DEFAULT_LIMITS[tier];
    if (config) return config;
    // Fallback to default - this will always exist
    return {
      requestsPerMinute: 20,
      requestsPerSecond: 2,
      safetyBuffer: 0.8,
    };
  }

  /**
   * Get or create state for a model
   */
  private getState(modelId: string): ModelRateLimitState {
    let state = this.modelStates.get(modelId);
    if (!state) {
      state = {
        requests: [],
        lastUpdated: Date.now(),
      };
      this.modelStates.set(modelId, state);
    }
    return state;
  }

  /**
   * Update rate limit state from API response headers
   */
  updateFromHeaders(modelId: string, headers: RateLimitHeaders): void {
    const state = this.getState(modelId);

    if (headers.limit !== undefined) {
      state.knownLimit = headers.limit;
    }
    if (headers.remaining !== undefined) {
      state.knownRemaining = headers.remaining;
    }
    if (headers.reset !== undefined) {
      state.resetTimestamp = headers.reset;
    }
    state.lastUpdated = Date.now();

    logger.debug({
      modelId,
      limit: state.knownLimit,
      remaining: state.knownRemaining,
      resetIn: state.resetTimestamp ? state.resetTimestamp - Date.now() : undefined,
    }, 'Updated rate limit state from headers');
  }

  /**
   * Check if we can make a request to this model
   * Returns wait time in ms if we should wait, 0 if ok to proceed
   */
  checkLimit(modelId: string): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneSecondAgo = now - 1000;

    const state = this.getState(modelId);
    const config = this.getConfig(modelId);

    // Clean old requests from state
    state.requests = state.requests.filter(r => r.timestamp > oneMinuteAgo);

    // Check if we have known remaining from headers
    if (state.knownRemaining !== undefined && state.knownRemaining <= 0) {
      if (state.resetTimestamp && state.resetTimestamp > now) {
        const waitTime = state.resetTimestamp - now + 100; // Add 100ms buffer
        logger.warn({
          modelId,
          waitTime,
          resetTimestamp: state.resetTimestamp,
        }, 'Rate limit exhausted, must wait for reset');
        return waitTime;
      }
    }

    // Calculate effective limit (use known limit if available, otherwise default)
    const effectiveLimit = state.knownLimit
      ? Math.floor(state.knownLimit * config.safetyBuffer)
      : Math.floor(config.requestsPerMinute * config.safetyBuffer);

    // Check per-minute limit
    const requestsInMinute = state.requests.length;
    if (requestsInMinute >= effectiveLimit) {
      // Find oldest request in window and calculate wait
      const oldestRequest = state.requests[0];
      if (oldestRequest) {
        const waitTime = oldestRequest.timestamp + 60000 - now + 100;
        logger.debug({
          modelId,
          requestsInMinute,
          effectiveLimit,
          waitTime,
        }, 'Per-minute limit reached');
        return Math.max(0, waitTime);
      }
    }

    // Check per-second limit
    const requestsInSecond = state.requests.filter(r => r.timestamp > oneSecondAgo).length;
    const effectiveRPS = Math.floor(config.requestsPerSecond * config.safetyBuffer);
    if (requestsInSecond >= effectiveRPS) {
      logger.debug({
        modelId,
        requestsInSecond,
        effectiveRPS,
      }, 'Per-second limit reached');
      return 1000 - (now - oneSecondAgo) + 100;
    }

    // Check global limits
    this.globalRequests = this.globalRequests.filter(r => r.timestamp > oneMinuteAgo);
    if (this.globalRequests.length >= this.globalRequestsPerMinute) {
      const oldestGlobal = this.globalRequests[0];
      if (oldestGlobal) {
        return oldestGlobal.timestamp + 60000 - now + 100;
      }
    }

    const globalInSecond = this.globalRequests.filter(r => r.timestamp > oneSecondAgo).length;
    if (globalInSecond >= this.globalRequestsPerSecond) {
      return 1000 - (now - oneSecondAgo) + 100;
    }

    return 0;
  }

  /**
   * Record a request being made
   */
  recordRequest(modelId: string): void {
    const now = Date.now();
    const state = this.getState(modelId);

    const record: RequestRecord = { timestamp: now, modelId };
    state.requests.push(record);
    this.globalRequests.push(record);

    // Decrement known remaining if we have it
    if (state.knownRemaining !== undefined && state.knownRemaining > 0) {
      state.knownRemaining--;
    }

    logger.debug({
      modelId,
      requestsInWindow: state.requests.length,
      knownRemaining: state.knownRemaining,
    }, 'Request recorded');
  }

  /**
   * Wait if necessary before making a request
   * Returns immediately if no wait needed
   */
  async waitIfNeeded(modelId: string): Promise<void> {
    const waitTime = this.checkLimit(modelId);

    if (waitTime > 0) {
      logger.info({
        modelId,
        waitTimeMs: waitTime,
      }, 'Rate limiting - waiting before request');

      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Calculate wait time from a 429 response
   */
  getRetryAfter(modelId: string, headers?: RateLimitHeaders): number {
    // If we have reset timestamp from headers, use it
    if (headers?.reset) {
      const now = Date.now();
      const waitTime = headers.reset - now;
      if (waitTime > 0) {
        return waitTime + 100; // Add buffer
      }
    }

    // Check state for reset timestamp
    const state = this.getState(modelId);
    if (state.resetTimestamp) {
      const now = Date.now();
      const waitTime = state.resetTimestamp - now;
      if (waitTime > 0) {
        return waitTime + 100;
      }
    }

    // Default backoff based on tier
    const tier = this.getModelTier(modelId);
    const backoffs: Record<string, number> = {
      free: 30000,      // 30 seconds for free tier
      budget: 10000,    // 10 seconds for budget
      mid_tier: 5000,   // 5 seconds for mid-tier
      frontier: 3000,   // 3 seconds for frontier
      default: 10000,
    };

    return backoffs[tier] ?? backoffs['default'] ?? 10000;
  }

  /**
   * Clean up old records
   */
  private cleanup(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean global requests
    this.globalRequests = this.globalRequests.filter(r => r.timestamp > oneMinuteAgo);

    // Clean model states
    for (const [modelId, state] of this.modelStates.entries()) {
      state.requests = state.requests.filter(r => r.timestamp > oneMinuteAgo);

      // Clear stale header data (older than 5 minutes)
      if (state.lastUpdated < now - 300000) {
        state.knownLimit = undefined;
        state.knownRemaining = undefined;
        state.resetTimestamp = undefined;
      }

      // Remove models with no recent activity
      if (state.requests.length === 0 && state.lastUpdated < now - 300000) {
        this.modelStates.delete(modelId);
      }
    }
  }

  /**
   * Get current stats for debugging
   */
  getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {
      globalRequests: this.globalRequests.length,
      models: {} as Record<string, unknown>,
    };

    for (const [modelId, state] of this.modelStates.entries()) {
      (stats.models as Record<string, unknown>)[modelId] = {
        requestsInWindow: state.requests.length,
        knownLimit: state.knownLimit,
        knownRemaining: state.knownRemaining,
        resetTimestamp: state.resetTimestamp,
      };
    }

    return stats;
  }
}

/**
 * Parse rate limit headers from OpenRouter response
 */
export function parseRateLimitHeaders(headers: Record<string, string>): RateLimitHeaders {
  const result: RateLimitHeaders = {};

  // OpenRouter uses X-RateLimit-* headers
  const limit = headers['x-ratelimit-limit'] || headers['X-RateLimit-Limit'];
  const remaining = headers['x-ratelimit-remaining'] || headers['X-RateLimit-Remaining'];
  const reset = headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'];

  if (limit) {
    result.limit = parseInt(limit, 10);
  }
  if (remaining) {
    result.remaining = parseInt(remaining, 10);
  }
  if (reset) {
    result.reset = parseInt(reset, 10);
  }

  return result;
}

/**
 * Singleton rate limiter instance
 */
let defaultRateLimiter: RateLimiter | null = null;

/**
 * Get the default rate limiter instance
 */
export function getRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = new RateLimiter();
  }
  return defaultRateLimiter;
}

/**
 * Create a custom rate limiter
 */
export function createRateLimiter(options?: {
  globalRequestsPerMinute?: number;
  globalRequestsPerSecond?: number;
}): RateLimiter {
  return new RateLimiter(options);
}
