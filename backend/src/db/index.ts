/**
 * Database Module Barrel Export
 * Centralized exports for all database functionality
 */

// Connection and utilities
export { pool, testConnection, closePool, query } from './connection.js';
export type { Pool, PoolClient, QueryResult } from './connection.js';

// Repositories
export * as debateRepository from './repositories/debate-repository.js';
export * as utteranceRepository from './repositories/utterance-repository.js';
export * as interventionRepository from './repositories/intervention-repository.js';

// Re-export repository defaults for convenience
export { default as DebateRepository } from './repositories/debate-repository.js';
export { default as UtteranceRepository } from './repositories/utterance-repository.js';
export { default as InterventionRepository } from './repositories/intervention-repository.js';

// Types (re-exported for convenience)
export type {
  Debate,
  DebateStatus,
  DebatePhase,
  Speaker,
  Utterance,
  UserIntervention,
  InterventionType,
  CreateDebateInput,
  CreateUtteranceInput,
  CreateInterventionInput,
  UpdateDebateStatusInput,
} from '../types/database.js';
