/**
 * HTTP request logging middleware
 * Logs all incoming requests and outgoing responses with performance metrics
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logging/logger.js';

/**
 * Request logger middleware
 * Logs request details and response status with duration
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Attach request ID to request object for tracing
  (req as any).requestId = requestId;

  // Log incoming request
  logger.info({
    category: 'http',
    event: 'request_received',
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }, `${req.method} ${req.path}`);

  // Capture original res.json to log response bodies in development
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
      logger.debug({
        category: 'http',
        event: 'response_body',
        requestId,
        body,
      }, 'Response body');
    }
    return originalJson(body);
  };

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = getLogLevel(res.statusCode);

    logger[level]({
      category: 'http',
      event: 'request_completed',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration_ms: duration,
      contentLength: res.get('content-length'),
    }, `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });

  // Log errors
  res.on('error', (error: Error) => {
    logger.error({
      category: 'http',
      event: 'response_error',
      requestId,
      method: req.method,
      path: req.path,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    }, `Response error: ${error.message}`);
  });

  next();
}

/**
 * Determine log level based on HTTP status code
 * @param statusCode - HTTP status code
 * @returns Appropriate log level
 */
function getLogLevel(statusCode: number): 'info' | 'warn' | 'error' {
  if (statusCode >= 500) {
    return 'error';
  }
  if (statusCode >= 400) {
    return 'warn';
  }
  return 'info';
}

/**
 * Generate a unique request ID for tracing
 * @returns Random alphanumeric ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Error logging middleware
 * Catches and logs all Express errors
 */
export function errorLogger(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = (req as any).requestId || 'unknown';

  logger.error({
    category: 'http',
    event: 'unhandled_error',
    requestId,
    method: req.method,
    path: req.path,
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name,
    },
  }, `Unhandled error: ${err.message}`);

  // Pass error to next error handler
  next(err);
}

/**
 * Log slow requests (> threshold)
 * Use as middleware after requestLogger
 */
export function slowRequestLogger(thresholdMs: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (duration > thresholdMs) {
        logger.warn({
          category: 'performance',
          event: 'slow_request',
          method: req.method,
          path: req.path,
          duration_ms: duration,
          threshold_ms: thresholdMs,
        }, `Slow request: ${req.method} ${req.path} (${duration}ms)`);
      }
    });

    next();
  };
}
