/**
 * Database Module Barrel Export
 * Centralized exports for all database functionality
 */

// Connection and utilities
export { pool, testConnection, closePool, query } from './connection.js';
export type { Pool, PoolClient, QueryResult } from './connection.js';

// Migrations
export { runMigrationsOnStartup, isDatabaseReady } from './runMigrations.js';

// Repositories
export * as debateRepository from './repositories/debate-repository.js';
export * as utteranceRepository from './repositories/utterance-repository.js';
export * as interventionRepository from './repositories/intervention-repository.js';
export * as podcastExportRepository from './repositories/podcast-export-repository.js';

// Re-export repository defaults for convenience
export { default as DebateRepository } from './repositories/debate-repository.js';
export { default as UtteranceRepository } from './repositories/utterance-repository.js';
export { default as InterventionRepository } from './repositories/intervention-repository.js';
export { default as PodcastExportRepository } from './repositories/podcast-export-repository.js';

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

export type {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastJobStatus,
  PodcastSegment,
  VoiceAssignment,
  ElevenLabsVoiceSettings,
} from '../types/podcast-export.js';

// Authentication repositories
export { UserRepository, createUserRepository } from './repositories/user-repository.js';
export { OrganizationRepository, createOrganizationRepository } from './repositories/organization-repository.js';

// Authentication seed
export { ensureSuperUser } from './seedSuperUser.js';

// Authentication types
export type {
  User,
  UserPublic,
  Organization,
  UserRole,
  JwtPayload,
  CreateUserInput,
  UpdateUserInput,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from '../types/auth.js';

// Persona Memory repository
export { PersonaMemoryRepository, createPersonaMemoryRepository } from './repositories/persona-memory-repository.js';

// Persona Memory types
export type {
  PersonaCoreValue,
  PersonaOpinion,
  PersonaRelationship,
  PersonaMemoryConfig,
  PersonaMemoryContext,
  PersonaRelationshipWithNames,
  CoreValueType,
  OpinionStance,
  RelationshipDynamicType,
  CreateCoreValueInput,
  UpdateCoreValueInput,
  CreateOpinionInput,
  UpdateOpinionInput,
  EvolveOpinionInput,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  UpdateMemoryConfigInput,
  OpinionEvolutionEntry,
  MemoryExtractionResult,
  ExtractedTopic,
} from '../types/persona-memory.js';
