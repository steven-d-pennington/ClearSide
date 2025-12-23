/**
 * Schema Validation Service
 *
 * Provides strict validation for all debate-related data structures using Ajv.
 * Ensures all agent outputs, user interventions, and transcripts conform to
 * the JSON Schema v2.0.0 specification.
 *
 * @see src/schemas/debate-transcript-v2.schema.ts for schema definitions
 */

import AjvDefault, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormatsDefault from 'ajv-formats';

// Handle default exports for CJS/ESM interop
const Ajv = AjvDefault.default ?? AjvDefault;
const addFormats = addFormatsDefault.default ?? addFormatsDefault;

import {
  utteranceSchema,
  userInterventionSchema,
  SCHEMA_REGISTRY,
  type SchemaVersion,
} from '../../schemas/debate-transcript-v2.schema.js';

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Detailed validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, unknown>;
}

/**
 * Schema Validator Service
 *
 * Singleton service that validates debate data against JSON schemas.
 * Uses Ajv with strict validation and detailed error reporting.
 */
export class SchemaValidator {
  private ajv: InstanceType<typeof Ajv>;
  private transcriptValidators: Map<string, ValidateFunction>;
  private utteranceValidator: ValidateFunction;
  private interventionValidator: ValidateFunction;

  constructor() {
    // Configure Ajv with strict validation
    this.ajv = new Ajv({
      allErrors: true, // Collect all errors, not just the first
      verbose: true, // Include schema and data in errors
      strict: true, // Strict mode for schema validation
      strictSchema: true,
      strictNumbers: true,
      strictTypes: true,
      strictTuples: true,
      strictRequired: true,
      validateFormats: true,
      removeAdditional: false, // Don't remove additional properties silently
    });

    // Add format validators (date-time, email, etc.)
    addFormats(this.ajv);

    // Compile validators for all schema versions
    this.transcriptValidators = new Map();
    for (const [version, schema] of Object.entries(SCHEMA_REGISTRY)) {
      const validator = this.ajv.compile(schema);
      this.transcriptValidators.set(version, validator);
    }

    // Compile individual component validators
    this.utteranceValidator = this.ajv.compile(utteranceSchema);
    this.interventionValidator = this.ajv.compile(userInterventionSchema);
  }

  /**
   * Validate a complete debate transcript
   *
   * @param data - The transcript data to validate
   * @param version - Schema version to validate against (default: '2.0.0')
   * @returns Validation result with errors if invalid
   */
  validateTranscript(
    data: unknown,
    version: SchemaVersion = '2.0.0'
  ): ValidationResult {
    const validator = this.transcriptValidators.get(version);

    if (!validator) {
      return {
        valid: false,
        errors: [
          {
            path: '/meta/schema_version',
            message: `Unknown schema version: ${version}`,
            keyword: 'version',
            params: { version },
          },
        ],
      };
    }

    const valid = validator(data);

    if (valid) {
      return { valid: true };
    }

    const errors = this.formatErrors(validator.errors || []);
    this.logValidationErrors('Transcript', errors);

    return { valid: false, errors };
  }

  /**
   * Validate a single utterance
   *
   * @param utterance - The utterance to validate
   * @returns Validation result with errors if invalid
   */
  validateUtterance(utterance: unknown): ValidationResult {
    const valid = this.utteranceValidator(utterance);

    if (valid) {
      return { valid: true };
    }

    const errors = this.formatErrors(this.utteranceValidator.errors || []);
    this.logValidationErrors('Utterance', errors);

    return { valid: false, errors };
  }

  /**
   * Validate a user intervention
   *
   * @param intervention - The intervention to validate
   * @returns Validation result with errors if invalid
   */
  validateIntervention(intervention: unknown): ValidationResult {
    const valid = this.interventionValidator(intervention);

    if (valid) {
      return { valid: true };
    }

    const errors = this.formatErrors(this.interventionValidator.errors || []);
    this.logValidationErrors('Intervention', errors);

    return { valid: false, errors };
  }

  /**
   * Format Ajv errors into our ValidationError format
   */
  private formatErrors(ajvErrors: ErrorObject[]): ValidationError[] {
    return ajvErrors.map((error) => ({
      path: error.instancePath || '/',
      message: error.message || 'Validation failed',
      keyword: error.keyword,
      params: error.params,
    }));
  }

  /**
   * Log validation errors with full context
   */
  private logValidationErrors(type: string, errors: ValidationError[]): void {
    console.error(`[SchemaValidator] ${type} validation failed:`, {
      errorCount: errors.length,
      errors: errors.map((err) => ({
        path: err.path,
        message: err.message,
        keyword: err.keyword,
        params: err.params,
      })),
    });
  }

  /**
   * Get list of supported schema versions
   */
  getSupportedVersions(): SchemaVersion[] {
    return Array.from(this.transcriptValidators.keys()) as SchemaVersion[];
  }

  /**
   * Check if a schema version is supported
   */
  isSupportedVersion(version: string): version is SchemaVersion {
    return this.transcriptValidators.has(version);
  }
}

/**
 * Singleton instance of SchemaValidator
 */
export const schemaValidator = new SchemaValidator();
