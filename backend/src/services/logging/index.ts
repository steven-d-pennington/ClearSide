/**
 * Logging service exports
 * Central export point for all logging utilities
 */

// Core logger
export {
  logger,
  createDebateLogger,
  createAgentLogger,
  createLogger,
  logStartup,
  logShutdown,
} from './logger.js';

// Structured logging helpers
export {
  loggers,
  startTimer,
  loggedOperation,
} from './log-helpers.js';

// Error tracking
export {
  initializeErrorTracking,
  captureError,
  captureMessage,
  setUserContext,
  setDebateContext,
  clearUserContext,
  addBreadcrumb,
  flush as flushErrorTracking,
  isErrorTrackingEnabled,
} from './error-tracker.js';
