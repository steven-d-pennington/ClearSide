/**
 * Enhanced logging service using Pino
 * Provides structured logging with context for debugging and monitoring
 */

import pino from 'pino';

/**
 * Log levels following standard severity hierarchy
 */
const logLevels = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

/**
 * Development transport configuration with pretty printing
 */
const developmentTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
    messageFormat: '{levelLabel} - {msg}',
  },
};

/**
 * Production logger configuration (JSON format for log aggregation)
 */
const productionConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      node_version: process.version,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV,
  },
};

/**
 * Development logger configuration (human-readable format)
 */
const developmentConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'debug',
  transport: developmentTransport,
};

/**
 * Main logger instance
 */
export const logger = pino(
  process.env.NODE_ENV === 'production' ? productionConfig : developmentConfig
);

/**
 * Create a child logger with debate context
 * @param debateId - Unique identifier for the debate
 * @returns Child logger with debateId in all log entries
 */
export function createDebateLogger(debateId: string) {
  return logger.child({ debateId, context: 'debate' });
}

/**
 * Create a child logger with agent context
 * @param agentType - Type of agent (pro, con, moderator, orchestrator)
 * @returns Child logger with agentType in all log entries
 */
export function createAgentLogger(
  agentType: 'pro' | 'con' | 'moderator' | 'orchestrator'
) {
  return logger.child({ agentType, context: 'agent' });
}

/**
 * Create a child logger with custom context
 * @param context - Arbitrary context object to attach to all logs
 * @returns Child logger with context in all log entries
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log system startup information
 */
export function logStartup(port: number | string) {
  logger.info(
    {
      port,
      nodeEnv: process.env.NODE_ENV,
      nodeVersion: process.version,
      logLevel: logger.level,
    },
    'Server starting'
  );
}

/**
 * Log system shutdown information
 */
export function logShutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
}
