/**
 * Structured logging helpers for common event types
 * Provides consistent logging patterns across the application
 */

import { logger } from './logger.js';

/**
 * Category-based logging helpers
 * Each helper logs a specific type of event with consistent structure
 */
export const loggers = {
  /**
   * Log state machine transitions
   * @param debateId - Unique identifier for the debate
   * @param from - Current phase/state
   * @param to - Target phase/state
   * @param duration - Optional transition duration in milliseconds
   */
  stateTransition(debateId: string, from: string, to: string, duration?: number) {
    logger.info({
      category: 'state_machine',
      debateId,
      from,
      to,
      duration_ms: duration,
      event: 'transition',
    }, `State transition: ${from} -> ${to}`);
  },

  /**
   * Log agent API calls with performance metrics
   * @param params - Agent call parameters including latency and token usage
   */
  agentCall(params: {
    debateId: string;
    agent: string;
    phase: string;
    model: string;
    latency_ms: number;
    tokens?: number;
    success: boolean;
    error?: string;
  }) {
    const level = params.success ? 'info' : 'error';
    logger[level]({
      category: 'agent_call',
      event: 'llm_request',
      ...params,
    }, `Agent ${params.agent} ${params.success ? 'completed' : 'failed'} in ${params.latency_ms}ms`);
  },

  /**
   * Log schema validation results
   * @param debateId - Unique identifier for the debate
   * @param type - Type of schema being validated (e.g., 'opening_argument', 'rebuttal')
   * @param valid - Whether validation passed
   * @param errors - Validation error messages if validation failed
   */
  schemaValidation(debateId: string, type: string, valid: boolean, errors?: string[]) {
    if (valid) {
      logger.debug({
        category: 'validation',
        event: 'schema_valid',
        debateId,
        type,
      }, `Schema validation passed: ${type}`);
    } else {
      logger.error({
        category: 'validation',
        event: 'schema_invalid',
        debateId,
        type,
        errors,
        error_count: errors?.length || 0,
      }, `Schema validation failed: ${type}`);
    }
  },

  /**
   * Log SSE event broadcasts
   * @param debateId - Unique identifier for the debate
   * @param eventType - Type of SSE event being broadcast
   * @param clientCount - Number of connected clients receiving the event
   */
  sseEvent(debateId: string, eventType: string, clientCount: number) {
    logger.debug({
      category: 'streaming',
      event: 'sse_broadcast',
      debateId,
      eventType,
      clientCount,
    }, `Broadcasting ${eventType} to ${clientCount} client(s)`);
  },

  /**
   * Log user interventions during debates
   * @param debateId - Unique identifier for the debate
   * @param type - Type of intervention (question, evidence, pause, resume)
   * @param directedTo - Optional agent the intervention is directed to
   */
  userIntervention(debateId: string, type: string, directedTo?: string) {
    logger.info({
      category: 'intervention',
      event: 'user_action',
      debateId,
      type,
      directedTo,
    }, `User intervention: ${type}${directedTo ? ` -> ${directedTo}` : ''}`);
  },

  /**
   * Log database operations with performance metrics
   * @param operation - Type of operation (select, insert, update, delete)
   * @param table - Database table name
   * @param latency_ms - Operation duration in milliseconds
   * @param success - Whether operation succeeded
   * @param rowCount - Optional number of rows affected
   */
  dbOperation(
    operation: string,
    table: string,
    latency_ms: number,
    success: boolean,
    rowCount?: number
  ) {
    logger.debug({
      category: 'database',
      event: 'db_query',
      operation,
      table,
      latency_ms,
      success,
      rowCount,
    }, `DB ${operation} on ${table} (${latency_ms}ms)`);
  },

  /**
   * Log errors with full context and stack traces
   * @param message - Human-readable error message
   * @param error - Error object
   * @param context - Additional context (debateId, phase, etc.)
   */
  error(message: string, error: Error, context?: Record<string, any>) {
    logger.error({
      category: 'error',
      event: 'error_occurred',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...context,
    }, message);
  },

  /**
   * Log debate lifecycle events (start, pause, resume, complete)
   * @param debateId - Unique identifier for the debate
   * @param event - Lifecycle event type
   * @param metadata - Additional event metadata
   */
  debateLifecycle(
    debateId: string,
    event: 'started' | 'paused' | 'resumed' | 'completed' | 'failed',
    metadata?: Record<string, any>
  ) {
    logger.info({
      category: 'debate_lifecycle',
      event: `debate_${event}`,
      debateId,
      ...metadata,
    }, `Debate ${event}`);
  },

  /**
   * Log performance metrics for monitoring
   * @param metric - Metric name
   * @param value - Metric value
   * @param unit - Unit of measurement (ms, bytes, count, etc.)
   * @param tags - Optional tags for filtering/grouping
   */
  metric(
    metric: string,
    value: number,
    unit: string,
    tags?: Record<string, string>
  ) {
    logger.debug({
      category: 'metrics',
      event: 'metric_recorded',
      metric,
      value,
      unit,
      tags,
    }, `${metric}: ${value}${unit}`);
  },

  /**
   * Log security-related events
   * @param event - Security event type
   * @param details - Event details
   */
  security(event: string, details: Record<string, any>) {
    logger.warn({
      category: 'security',
      event: `security_${event}`,
      ...details,
    }, `Security event: ${event}`);
  },
};

/**
 * Performance timing helper
 * Returns a function that logs the duration when called
 *
 * @example
 * const endTimer = startTimer();
 * await someOperation();
 * endTimer('operation_name', { debateId: '123' });
 */
export function startTimer() {
  const start = Date.now();
  return (operation: string, context?: Record<string, any>) => {
    const duration = Date.now() - start;
    logger.debug({
      category: 'performance',
      event: 'operation_timed',
      operation,
      duration_ms: duration,
      ...context,
    }, `${operation} completed in ${duration}ms`);
    return duration;
  };
}

/**
 * Async operation wrapper with automatic timing and error logging
 * @param operation - Name of the operation
 * @param fn - Async function to execute
 * @param context - Additional context for logging
 * @returns Result of the async function
 */
export async function loggedOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  const timer = startTimer();
  try {
    const result = await fn();
    timer(operation, { ...context, success: true });
    return result;
  } catch (error) {
    timer(operation, { ...context, success: false });
    loggers.error(`Operation failed: ${operation}`, error as Error, context);
    throw error;
  }
}
