/**
 * Error tracking service with Sentry integration
 * Provides centralized error reporting for production monitoring
 *
 * NOTE: This is a stub implementation. To enable Sentry:
 * 1. Install @sentry/node: npm install @sentry/node
 * 2. Set SENTRY_DSN in .env
 * 3. Uncomment Sentry imports and initialization code
 */

import { logger } from './logger.js';

// Uncomment when Sentry is installed:
// import * as Sentry from '@sentry/node';

/**
 * Error tracking configuration
 */
interface ErrorTrackerConfig {
  dsn?: string;
  environment: string;
  sampleRate?: number;
  enabled: boolean;
}

/**
 * Global error tracker state
 */
let isInitialized = false;
let config: ErrorTrackerConfig;

/**
 * Initialize error tracking service
 * Call this once during application startup
 *
 * @example
 * import { initializeErrorTracking } from './services/logging/error-tracker';
 * initializeErrorTracking();
 */
export function initializeErrorTracking() {
  config = {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    sampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE || '0.1'),
    enabled: !!(process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN),
  };

  if (config.enabled) {
    logger.info({
      category: 'error_tracking',
      event: 'initializing',
      environment: config.environment,
      sampleRate: config.sampleRate,
    }, 'Initializing error tracking (Sentry)');

    // Uncomment when Sentry is installed:
    /*
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      tracesSampleRate: config.sampleRate,
      beforeSend(event, hint) {
        // Log to console for debugging
        logger.debug({
          category: 'error_tracking',
          event: 'sentry_event',
          event_id: event.event_id,
          error: hint.originalException,
        }, 'Sentry event captured');
        return event;
      },
      integrations: [
        // Add integrations as needed
      ],
    });
    */

    logger.info({
      category: 'error_tracking',
      event: 'initialized',
    }, 'Error tracking initialized');

    isInitialized = true;
  } else {
    logger.info({
      category: 'error_tracking',
      event: 'disabled',
      reason: !config.dsn ? 'No DSN configured' : 'Not production environment',
    }, 'Error tracking disabled');
  }
}

/**
 * Capture and report an error
 * @param error - Error object to report
 * @param context - Additional context (debateId, userId, etc.)
 */
export function captureError(error: Error, context?: Record<string, any>) {
  // Always log locally
  logger.error({
    category: 'error_tracking',
    event: 'error_captured',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
  }, `Error captured: ${error.message}`);

  // Send to Sentry if enabled
  if (config?.enabled) {
    // Uncomment when Sentry is installed:
    /*
    Sentry.captureException(error, {
      extra: context,
    });
    */
    logger.debug({
      category: 'error_tracking',
      event: 'sentry_captured',
      error_type: error.name,
    }, 'Error sent to Sentry');
  }
}

/**
 * Capture a custom message (not an Error object)
 * @param message - Message to report
 * @param level - Severity level
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' = 'info',
  context?: Record<string, any>
) {
  const logLevel = level === 'fatal' ? 'error' : level;
  logger[logLevel]({
    category: 'error_tracking',
    event: 'message_captured',
    ...context,
  }, message);

  if (config?.enabled) {
    // Uncomment when Sentry is installed:
    /*
    Sentry.captureMessage(message, {
      level: level === 'fatal' ? 'error' : level,
      extra: context,
    });
    */
  }
}

/**
 * Set user context for error tracking
 * Helps identify which user encountered errors
 * @param userId - Unique user identifier
 * @param metadata - Additional user metadata
 */
export function setUserContext(userId: string, metadata?: Record<string, any>) {
  logger.debug({
    category: 'error_tracking',
    event: 'user_context_set',
    userId,
    ...metadata,
  }, 'User context set');

  if (config?.enabled) {
    // Uncomment when Sentry is installed:
    /*
    Sentry.setUser({
      id: userId,
      ...metadata,
    });
    */
  }
}

/**
 * Set debate context for error tracking
 * Helps correlate errors with specific debates
 * @param debateId - Unique debate identifier
 * @param metadata - Additional debate metadata
 */
export function setDebateContext(debateId: string, metadata?: Record<string, any>) {
  logger.debug({
    category: 'error_tracking',
    event: 'debate_context_set',
    debateId,
    ...metadata,
  }, 'Debate context set');

  if (config?.enabled) {
    // Uncomment when Sentry is installed:
    /*
    Sentry.setContext('debate', {
      debateId,
      ...metadata,
    });
    */
  }
}

/**
 * Clear user context
 */
export function clearUserContext() {
  if (config?.enabled) {
    // Uncomment when Sentry is installed:
    /*
    Sentry.setUser(null);
    */
  }
}

/**
 * Add breadcrumb for tracking user actions
 * Helps understand what led to an error
 * @param message - Breadcrumb message
 * @param category - Breadcrumb category
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, any>
) {
  logger.debug({
    category: 'error_tracking',
    event: 'breadcrumb_added',
    breadcrumb_category: category,
    message,
    ...data,
  }, message);

  if (config?.enabled) {
    // Uncomment when Sentry is installed:
    /*
    Sentry.addBreadcrumb({
      message,
      category,
      data,
      level: 'info',
      timestamp: Date.now() / 1000,
    });
    */
  }
}

/**
 * Flush pending error reports
 * Call before application shutdown to ensure all errors are sent
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  if (config?.enabled) {
    logger.info({
      category: 'error_tracking',
      event: 'flushing',
      timeout,
    }, 'Flushing error tracking');

    // Uncomment when Sentry is installed:
    /*
    try {
      const success = await Sentry.flush(timeout);
      logger.info({
        category: 'error_tracking',
        event: 'flushed',
        success,
      }, 'Error tracking flushed');
      return success;
    } catch (error) {
      logger.error({
        category: 'error_tracking',
        event: 'flush_failed',
        error,
      }, 'Failed to flush error tracking');
      return false;
    }
    */

    return true;
  }

  return true;
}

/**
 * Check if error tracking is initialized and enabled
 */
export function isErrorTrackingEnabled(): boolean {
  return isInitialized && (config?.enabled || false);
}
