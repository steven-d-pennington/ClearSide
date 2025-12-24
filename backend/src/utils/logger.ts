/**
 * Centralized logging utility using Pino
 */

import pino from 'pino';

/**
 * Create logger instance with environment-specific configuration
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Create a child logger with specific context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
