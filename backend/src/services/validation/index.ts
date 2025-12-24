/**
 * Validation Service - Barrel Export
 *
 * Provides centralized exports for all validation-related functionality.
 *
 * Usage:
 * ```typescript
 * import {
 *   schemaValidator,
 *   assertValidTranscript,
 *   assertValidUtterance,
 *   SchemaValidationError
 * } from './services/validation';
 * ```
 */

// Schema validator service
export {
  SchemaValidator,
  schemaValidator,
  type ValidationResult,
  type ValidationError,
} from './schema-validator.js';

// Validation helper functions and error class
export {
  SchemaValidationError,
  assertValidTranscript,
  assertValidUtterance,
  assertValidIntervention,
  validateTranscript,
  validateUtterance,
  validateIntervention,
} from './validators.js';

// Re-export schema types for convenience
export type {
  DebateTranscript,
  DebateMeta,
  Proposition,
  Utterance,
  UserIntervention,
  StructuredAnalysis,
  AnalysisSection,
  SchemaVersion,
} from '../../schemas/debate-transcript-v2.schema.js';

export {
  DebatePhase,
  Speaker,
  DebateStatus,
  InterventionType,
  SCHEMA_VERSION,
  SCHEMA_REGISTRY,
} from '../../schemas/debate-transcript-v2.schema.js';
