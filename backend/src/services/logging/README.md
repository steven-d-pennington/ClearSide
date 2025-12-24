# Logging Service Documentation

## Overview

The ClearSide logging service provides structured logging with context tracking, performance monitoring, and error tracking capabilities. Built on Pino for high performance.

## Quick Start

```typescript
import { logger, loggers } from './services/logging/index.js';

// Simple logging
logger.info('Application started');
logger.error({ error: err }, 'Operation failed');

// Structured logging
loggers.stateTransition('debate-123', 'OPENING', 'REBUTTAL', 1500);
loggers.agentCall({
  debateId: 'debate-123',
  agent: 'pro',
  phase: 'opening',
  model: 'claude-sonnet-4-5',
  latency_ms: 2500,
  tokens: 1500,
  success: true,
});
```

## Log Levels

Use log levels appropriately:

- **`fatal`**: System is unusable (reserved for critical failures)
- **`error`**: Error events that prevent operations from completing
- **`warn`**: Warning events that are unexpected but recoverable
- **`info`**: General operational events (startup, shutdown, major state changes)
- **`debug`**: Detailed diagnostic information for debugging
- **`trace`**: Very detailed trace information (rarely used)

### Environment Configuration

```bash
# Development - see detailed logs
LOG_LEVEL=debug

# Production - essential logs only
LOG_LEVEL=info
```

## Structured Logging Helpers

### State Machine Transitions

```typescript
loggers.stateTransition(debateId, fromPhase, toPhase, duration_ms);
```

### Agent API Calls

```typescript
loggers.agentCall({
  debateId: 'debate-123',
  agent: 'pro',           // 'pro', 'con', 'moderator', 'orchestrator'
  phase: 'opening',
  model: 'claude-sonnet-4-5',
  latency_ms: 2500,
  tokens: 1500,
  success: true,
  error?: 'Rate limit exceeded',  // Include if success: false
});
```

### Schema Validation

```typescript
// Success
loggers.schemaValidation('debate-123', 'opening_argument', true);

// Failure
loggers.schemaValidation('debate-123', 'rebuttal', false, [
  'Missing required field: claims',
  'Invalid type for evidence'
]);
```

### SSE Events

```typescript
loggers.sseEvent('debate-123', 'turn_started', clientCount);
```

### User Interventions

```typescript
// Directed intervention
loggers.userIntervention('debate-123', 'question', 'pro');

// General intervention
loggers.userIntervention('debate-123', 'pause');
```

### Database Operations

```typescript
loggers.dbOperation('select', 'debates', latency_ms, success, rowCount);
```

### Errors

```typescript
try {
  await operation();
} catch (error) {
  loggers.error('Operation failed', error as Error, {
    debateId: 'debate-123',
    phase: 'opening',
  });
}
```

### Debate Lifecycle

```typescript
loggers.debateLifecycle('debate-123', 'started', { topic: 'AI Ethics' });
loggers.debateLifecycle('debate-123', 'paused');
loggers.debateLifecycle('debate-123', 'resumed');
loggers.debateLifecycle('debate-123', 'completed', { duration_ms: 300000 });
loggers.debateLifecycle('debate-123', 'failed', { reason: 'timeout' });
```

### Performance Metrics

```typescript
loggers.metric('response_time', 250, 'ms', { endpoint: '/api/debates' });
```

### Security Events

```typescript
loggers.security('unauthorized_access', {
  ip: req.ip,
  path: req.path,
  userId: userId,
});
```

## Child Loggers with Context

Create child loggers to automatically include context in all log entries:

```typescript
import { createDebateLogger, createAgentLogger, createLogger } from './services/logging/index.js';

// Debate-specific logger
const debateLogger = createDebateLogger('debate-123');
debateLogger.info('Phase transition completed');  // Includes debateId automatically

// Agent-specific logger
const proLogger = createAgentLogger('pro');
proLogger.debug('Generating opening argument');  // Includes agentType automatically

// Custom context logger
const userLogger = createLogger({ userId: 'user-456', sessionId: 'session-789' });
userLogger.info('User action');  // Includes userId and sessionId automatically
```

## Performance Timing

### Manual Timing

```typescript
import { startTimer } from './services/logging/index.js';

const endTimer = startTimer();
await someOperation();
const duration = endTimer('operation_name', { debateId: 'debate-123' });
// Logs: operation_name completed in Xms
```

### Automatic Timing with Error Handling

```typescript
import { loggedOperation } from './services/logging/index.js';

const result = await loggedOperation(
  'fetch_debate_data',
  async () => {
    return await database.query(...);
  },
  { debateId: 'debate-123' }
);
// Automatically logs duration and handles errors
```

## Error Tracking (Sentry Integration)

### Setup

```typescript
import { initializeErrorTracking } from './services/logging/index.js';

// Call once during application startup
initializeErrorTracking();
```

### Capture Errors

```typescript
import { captureError, captureMessage } from './services/logging/index.js';

try {
  await riskyOperation();
} catch (error) {
  captureError(error as Error, {
    debateId: 'debate-123',
    phase: 'opening',
  });
  throw error;  // Re-throw if needed
}

// Capture custom messages
captureMessage('Unusual behavior detected', 'warn', {
  debateId: 'debate-123',
});
```

### Set Context

```typescript
import { setUserContext, setDebateContext } from './services/logging/index.js';

// Set user context (persists across errors)
setUserContext('user-123', { email: 'user@example.com' });

// Set debate context
setDebateContext('debate-123', { topic: 'AI Ethics', phase: 'opening' });
```

### Add Breadcrumbs

```typescript
import { addBreadcrumb } from './services/logging/index.js';

addBreadcrumb('User clicked start debate', 'user_action', {
  topic: 'AI Ethics',
});
```

## HTTP Request Logging

### Request Logger Middleware

```typescript
import { requestLogger, slowRequestLogger } from './middleware/request-logger.js';

app.use(requestLogger);  // Logs all requests and responses
app.use(slowRequestLogger(1000));  // Warns about requests > 1000ms
```

Automatically logs:
- Request method, path, query params, IP, user agent
- Response status code, duration, content length
- Generates unique request IDs for tracing

### Error Logger Middleware

```typescript
import { errorLogger } from './middleware/request-logger.js';

// Add AFTER routes, BEFORE final error handler
app.use(errorLogger);
app.use((err, req, res, next) => {
  // Your error handler
});
```

## Log Categories

All logs include a `category` field for filtering:

- `http` - HTTP requests and responses
- `state_machine` - State transitions
- `agent_call` - LLM API calls
- `validation` - Schema validation
- `streaming` - SSE events
- `intervention` - User interventions
- `database` - Database operations
- `error` - Error events
- `debate_lifecycle` - Debate lifecycle events
- `metrics` - Performance metrics
- `performance` - Timing measurements
- `security` - Security events
- `error_tracking` - Error tracking events

## Best Practices

### DO

✅ Always include context (debateId, phase, agent, etc.)
✅ Use structured logging helpers when available
✅ Log state transitions and API calls
✅ Include performance metrics (latency, tokens)
✅ Use appropriate log levels
✅ Log errors with full context
✅ Use child loggers for repeated context

### DON'T

❌ Log sensitive data (passwords, API keys, PII)
❌ Log at debug level in production unless needed
❌ Log inside tight loops (impacts performance)
❌ Include large objects in logs (truncate if needed)
❌ Use console.log (use logger instead)
❌ Forget to log errors before throwing

### Example: Good Logging

```typescript
import { loggers, createDebateLogger } from './services/logging/index.js';

class DebateOrchestrator {
  async startDebate(debateId: string, topic: string) {
    const debateLogger = createDebateLogger(debateId);

    loggers.debateLifecycle(debateId, 'started', { topic });

    try {
      const startTime = Date.now();
      const response = await this.llmClient.complete({...});

      loggers.agentCall({
        debateId,
        agent: 'pro',
        phase: 'opening',
        model: response.model,
        latency_ms: Date.now() - startTime,
        tokens: response.usage.totalTokens,
        success: true,
      });

      loggers.stateTransition(debateId, 'INIT', 'OPENING', Date.now() - startTime);

      return response;
    } catch (error) {
      loggers.error('Failed to start debate', error as Error, {
        debateId,
        topic,
      });
      loggers.debateLifecycle(debateId, 'failed', {
        reason: (error as Error).message,
      });
      throw error;
    }
  }
}
```

## Enabling Sentry (Production)

1. Install Sentry:
```bash
npm install @sentry/node
```

2. Uncomment Sentry code in `src/services/logging/error-tracker.ts`

3. Set environment variables:
```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_SAMPLE_RATE=0.1  # 10% of transactions
NODE_ENV=production
```

4. Initialize in your app:
```typescript
import { initializeErrorTracking } from './services/logging/index.js';
initializeErrorTracking();
```

## Log Formats

### Development (Human-Readable)

```
03:45:12 INFO - Server started
  port: 3001
  env: development

03:45:15 DEBUG - DB select on debates (150ms)
  category: database
  operation: select
  table: debates
  latency_ms: 150
```

### Production (JSON)

```json
{
  "level": "info",
  "time": "2025-12-24T03:45:12.123Z",
  "msg": "Server started",
  "port": 3001,
  "env": "production",
  "pid": 1234,
  "hostname": "app-server"
}
```

## Troubleshooting

### No logs appearing

- Check `LOG_LEVEL` environment variable
- Ensure you're using `logger` not `console.log`
- Verify log level matches severity (e.g., debug logs won't show if LOG_LEVEL=info)

### Too many logs

- Increase `LOG_LEVEL` (debug → info → warn → error)
- Use child loggers to filter by context
- Review and remove unnecessary debug logs

### Performance issues

- Avoid logging in tight loops
- Use async logging (Pino handles this automatically)
- Increase log level in production
- Avoid logging large objects

## Testing

Tests are in `/tests/logging.test.ts`:

```bash
npm test logging.test.ts
```

Coverage includes:
- Logger creation and configuration
- All structured logging helpers
- Child loggers with context
- Performance timing utilities
- Error tracking functions

---

**Last Updated:** 2025-12-24
**Maintained By:** ClearSide Team
