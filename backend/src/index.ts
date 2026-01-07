/**
 * ClearSide Backend Server
 * Main entry point for the Express application
 */

// Load environment variables FIRST - before any other imports
// This ensures process.env is populated when modules initialize
import { config } from 'dotenv';
config();

import express, { type Request, type Response } from 'express';
import path from 'path';
import { sseManager } from './services/sse/index.js';
import debateRoutes from './routes/debate-routes.js';
import interventionRoutes from './routes/intervention-routes.js';
import exportRoutes from './routes/export-routes.js';
import personaRoutes from './routes/persona-routes.js';
import livelyRoutes from './routes/lively-routes.js';
import modelRoutes from './routes/model-routes.js';
import adminRoutes from './routes/admin-routes.js';
import duelogicRoutes from './routes/duelogic-routes.js';
import podcastRoutes from './routes/podcast-routes.js';
import duelogicResearchRoutes from './routes/duelogic-research-routes.js';
import { logger } from './utils/logger.js';
import { pool } from './db/connection.js';
import { runMigrationsOnStartup } from './db/runMigrations.js';

const PORT = process.env.PORT || 3000;
const app = express();

/**
 * Middleware
 */

// Enable CORS for all routes
app.use((req, res, next) => {
  // In production, restrict to frontend URL; in development, allow all
  const allowedOrigin = process.env.FRONTEND_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Last-Event-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

// Parse JSON request bodies
app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(
    {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    },
    'Incoming request'
  );
  next();
});

// Serve static files from exports directory
const exportsDir = process.env.EXPORTS_DIR || './exports';
app.use('/exports', express.static(path.resolve(exportsDir)));

/**
 * Routes
 */

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeConnections: sseManager.getClientCount(),
  });
});

// API routes
app.use('/api', debateRoutes);
app.use('/api', interventionRoutes);
app.use('/api', exportRoutes);
app.use('/api/personas', personaRoutes);
app.use('/api', livelyRoutes);
app.use('/api/models', modelRoutes);
app.use('/api', adminRoutes);
app.use('/api', duelogicRoutes);
app.use('/api/exports/podcast', podcastRoutes);
app.use('/api/duelogic', duelogicResearchRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, _next: express.NextFunction) => {
  logger.error({ error: err, path: req.path }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

/**
 * Server lifecycle
 */

let server: ReturnType<typeof app.listen> | null = null;

/**
 * Start the server
 * Runs database migrations first, then starts accepting requests
 */
async function start() {
  try {
    // Run database migrations on startup
    const migrationResult = await runMigrationsOnStartup();

    if (!migrationResult.success) {
      logger.error(
        { error: migrationResult.error },
        'Database migration failed - server not started'
      );
      process.exit(1);
    }

    if (migrationResult.applied.length > 0) {
      logger.info(
        { applied: migrationResult.applied },
        'Database migrations applied successfully'
      );
    }

    // Start the HTTP server
    server = app.listen(PORT, () => {
      logger.info({ port: PORT, env: process.env.NODE_ENV }, 'Server started');
    });

    // Handle server errors
    server.on('error', (error: Error) => {
      logger.error({ error }, 'Server error');
      process.exit(1);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 * Closes all connections cleanly before exiting
 */
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  // Stop accepting new requests
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  try {
    // Shutdown SSE manager (closes all client connections)
    sseManager.shutdown();

    // Close database connection pool
    await pool.end();
    logger.info('Database connection pool closed');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

/**
 * Register shutdown handlers
 */
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error({ error }, 'Uncaught exception');
  shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});

/**
 * Start the server if this file is run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

// Export app for testing
export { app, start, shutdown };
