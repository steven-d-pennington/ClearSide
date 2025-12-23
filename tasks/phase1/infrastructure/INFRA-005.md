# INFRA-005: Set Up Logging & Monitoring

**Priority:** P0
**Estimate:** S
**Labels:** `infrastructure`, `backend`, `observability`
**Status:** 🟢 TO DO

---

## Context

ClearSide requires structured logging and monitoring to debug issues, track performance, and maintain system health. This is critical for production reliability and troubleshooting agent behavior.

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Performance Considerations
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - NFR-201, NFR-202, NFR-204
- [CLAUDE.md](../../../CLAUDE.md) - Testing Requirements

---

## Requirements

### Acceptance Criteria

- [ ] Set up structured logging library (Winston, Pino, or similar)
- [ ] Configure log levels (debug, info, warn, error)
- [ ] Add context to all logs (debateId, phase, speaker, timestamp)
- [ ] Log all agent API calls with latency
- [ ] Log all state machine transitions
- [ ] Log schema validation failures
- [ ] Set up error tracking (Sentry or similar for production)
- [ ] Create log formatting for development vs production
- [ ] Add request/response logging middleware
- [ ] Document logging conventions

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **NFR-201**: 99.9% uptime requires visibility into failures
- **NFR-202**: < 1% error rate requires error tracking
- **NFR-204**: Error recovery requires diagnostic logs
- **SCH-305**: System SHALL log schema violations

---

## Implementation Guide

### Logging Service (Winston)

```typescript
// src/services/logging/logger.ts
import winston from 'winston';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

winston.addColors(logColors);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    // Production: also log to file
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' })
        ]
      : [])
  ]
});

// Specialized loggers with context
export function createDebateLogger(debateId: string) {
  return logger.child({ debateId });
}

export function createAgentLogger(agentType: 'pro' | 'con' | 'moderator' | 'orchestrator') {
  return logger.child({ agentType });
}
```

### Structured Logging Helpers

```typescript
// src/services/logging/log-helpers.ts
import { logger } from './logger';

export const loggers = {
  // State machine transitions
  stateTransition(debateId: string, from: string, to: string, duration?: number) {
    logger.info('State transition', {
      debateId,
      from,
      to,
      duration_ms: duration,
      category: 'state_machine'
    });
  },

  // Agent API calls
  agentCall(params: {
    debateId: string;
    agent: string;
    phase: string;
    model: string;
    latency_ms: number;
    tokens?: number;
    success: boolean;
  }) {
    logger.info('Agent API call', {
      ...params,
      category: 'agent_call'
    });
  },

  // Schema validation
  schemaValidation(debateId: string, type: string, valid: boolean, errors?: string[]) {
    if (valid) {
      logger.debug('Schema validation passed', {
        debateId,
        type,
        category: 'validation'
      });
    } else {
      logger.error('Schema validation failed', {
        debateId,
        type,
        errors,
        category: 'validation'
      });
    }
  },

  // SSE streaming
  sseEvent(debateId: string, eventType: string, clientCount: number) {
    logger.debug('SSE event broadcast', {
      debateId,
      eventType,
      clientCount,
      category: 'streaming'
    });
  },

  // User interventions
  userIntervention(debateId: string, type: string, directedTo?: string) {
    logger.info('User intervention', {
      debateId,
      type,
      directedTo,
      category: 'intervention'
    });
  },

  // Database operations
  dbOperation(operation: string, table: string, latency_ms: number, success: boolean) {
    logger.debug('Database operation', {
      operation,
      table,
      latency_ms,
      success,
      category: 'database'
    });
  },

  // Errors
  error(message: string, error: Error, context?: Record<string, any>) {
    logger.error(message, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...context,
      category: 'error'
    });
  }
};
```

### Request Logging Middleware

```typescript
// src/middleware/request-logger.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logging/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    category: 'http'
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration_ms: duration,
      category: 'http'
    });
  });

  next();
}
```

### Error Tracking (Sentry)

```typescript
// src/services/logging/error-tracker.ts
import * as Sentry from '@sentry/node';
import { logger } from './logger';

export function initializeErrorTracking() {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1, // 10% of transactions
      beforeSend(event, hint) {
        // Log to console for debugging
        logger.error('Sentry event', {
          event_id: event.event_id,
          error: hint.originalException
        });
        return event;
      }
    });

    logger.info('Error tracking initialized (Sentry)');
  } else {
    logger.info('Error tracking disabled (development mode)');
  }
}

export function captureError(error: Error, context?: Record<string, any>) {
  logger.error('Captured error', { error, context });

  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error, {
      extra: context
    });
  }
}

export function setUserContext(userId: string) {
  Sentry.setUser({ id: userId });
}

export function setDebateContext(debateId: string) {
  Sentry.setContext('debate', { debateId });
}
```

### Usage Examples

```typescript
// In debate orchestrator
import { loggers } from './logging/log-helpers';
import { captureError } from './logging/error-tracker';

class DebateOrchestrator {
  async transitionPhase(debateId: string, toPhase: string) {
    const startTime = Date.now();
    const currentPhase = this.stateMachine.getCurrentPhase();

    try {
      await this.stateMachine.transition(toPhase);

      loggers.stateTransition(
        debateId,
        currentPhase,
        toPhase,
        Date.now() - startTime
      );
    } catch (error) {
      loggers.error('Phase transition failed', error as Error, {
        debateId,
        from: currentPhase,
        to: toPhase
      });
      captureError(error as Error, { debateId, currentPhase, toPhase });
      throw error;
    }
  }

  async callAgent(debateId: string, agent: string, phase: string) {
    const startTime = Date.now();

    try {
      const response = await this.llmClient.complete({
        model: 'claude-sonnet-4-5',
        prompt: buildPrompt(phase, agent)
      });

      loggers.agentCall({
        debateId,
        agent,
        phase,
        model: response.model,
        latency_ms: Date.now() - startTime,
        tokens: response.usage.totalTokens,
        success: true
      });

      return response.content;
    } catch (error) {
      loggers.agentCall({
        debateId,
        agent,
        phase,
        model: 'unknown',
        latency_ms: Date.now() - startTime,
        success: false
      });

      loggers.error('Agent call failed', error as Error, {
        debateId,
        agent,
        phase
      });

      throw error;
    }
  }
}
```

### Environment Configuration

```bash
# .env
LOG_LEVEL=debug  # development
# LOG_LEVEL=info  # production

NODE_ENV=development
# NODE_ENV=production

SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

---

## Dependencies

**None** - This is a foundational task

---

## Validation

### Manual Testing

```typescript
// Test logging at different levels
logger.debug('Debug message', { data: 'test' });
logger.info('Info message', { data: 'test' });
logger.warn('Warning message', { data: 'test' });
logger.error('Error message', { error: new Error('Test error') });

// Test structured logging
loggers.stateTransition('test-debate-id', 'PHASE_1', 'PHASE_2', 1500);
loggers.agentCall({
  debateId: 'test-debate-id',
  agent: 'pro',
  phase: 'phase_1_opening',
  model: 'claude-sonnet-4-5',
  latency_ms: 2500,
  tokens: 1500,
  success: true
});
```

### Definition of Done

- [ ] Winston (or similar) logging library installed and configured
- [ ] Log levels configured (debug, info, warn, error)
- [ ] Structured logging with context fields working
- [ ] Request/response middleware logs all HTTP traffic
- [ ] Agent API calls logged with latency and token usage
- [ ] State machine transitions logged
- [ ] Schema validation failures logged
- [ ] Error tracking (Sentry) integrated for production
- [ ] Development logs are human-readable and colored
- [ ] Production logs are JSON formatted
- [ ] Documentation includes logging conventions

---

## Notes

- **Winston** is recommended for Node.js (mature, flexible)
- **Pino** is faster but less feature-rich
- Always include context (debateId, phase, agent) in logs
- Use log categories for filtering (state_machine, agent_call, validation, etc.)
- Avoid logging sensitive data (user PII, API keys)
- Use different log levels appropriately:
  - `debug`: Detailed diagnostic info
  - `info`: General operational events
  - `warn`: Unexpected but recoverable issues
  - `error`: Failures requiring attention
- Consider log aggregation service for production (Datadog, LogRocket, etc.)
- Implement log rotation for file-based logging
- Add performance metrics logging (latency, throughput)

---

**Estimated Time:** 3-4 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
