/**
 * Validation Helper Functions
 *
 * Provides assertion-style validators that throw on validation failure.
 * These are convenience wrappers around SchemaValidator for use in business logic.
 *
 * @see src/services/validation/schema-validator.ts for the underlying validator
 */

import {
  schemaValidator,
  type ValidationError,
} from './schema-validator.js';
import type {
  DebateTranscript,
  Utterance,
  UserIntervention,
  SchemaVersion,
} from '../../schemas/debate-transcript-v2.schema.js';

/**
 * Custom error class for schema validation failures
 *
 * Includes detailed error information from the schema validator.
 */
export class SchemaValidationError extends Error {
  public readonly errors: ValidationError[];
  public readonly validationType: string;

  constructor(
    validationType: string,
    errors: ValidationError[],
    message?: string
  ) {
    const errorMessage =
      message ||
      `${validationType} validation failed: ${SchemaValidationError.formatErrors(errors)}`;

    super(errorMessage);
    this.name = 'SchemaValidationError';
    this.validationType = validationType;
    this.errors = errors;

    // Maintain proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchemaValidationError);
    }

    // Ensure instanceof works correctly
    Object.setPrototypeOf(this, SchemaValidationError.prototype);
  }

  /**
   * Format errors into a human-readable string
   */
  private static formatErrors(errors: ValidationError[]): string {
    return errors
      .map((err) => `${err.path}: ${err.message}`)
      .join('; ');
  }

  /**
   * Get a detailed error report
   */
  getDetailedReport(): string {
    const lines = [
      `${this.validationType} Validation Failed`,
      `Total errors: ${this.errors.length}`,
      '',
      'Errors:',
    ];

    this.errors.forEach((err, index) => {
      lines.push(`  ${index + 1}. Path: ${err.path}`);
      lines.push(`     Message: ${err.message}`);
      if (err.keyword) {
        lines.push(`     Keyword: ${err.keyword}`);
      }
      if (err.params && Object.keys(err.params).length > 0) {
        lines.push(`     Params: ${JSON.stringify(err.params)}`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Get errors in JSON format for API responses
   */
  toJSON(): {
    name: string;
    message: string;
    validationType: string;
    errors: ValidationError[];
  } {
    return {
      name: this.name,
      message: this.message,
      validationType: this.validationType,
      errors: this.errors,
    };
  }
}

/**
 * Assert that a debate transcript is valid
 *
 * @param data - The transcript data to validate
 * @param version - Schema version to validate against (default: '2.0.0')
 * @throws {SchemaValidationError} If validation fails
 * @returns The validated transcript (typed)
 */
export function assertValidTranscript(
  data: unknown,
  version: SchemaVersion = '2.0.0'
): asserts data is DebateTranscript {
  const result = schemaValidator.validateTranscript(data, version);

  if (!result.valid) {
    throw new SchemaValidationError(
      'Transcript',
      result.errors || [],
      `Debate transcript failed schema validation (v${version})`
    );
  }
}

/**
 * Assert that an utterance is valid
 *
 * @param utterance - The utterance to validate
 * @throws {SchemaValidationError} If validation fails
 * @returns The validated utterance (typed)
 */
export function assertValidUtterance(
  utterance: unknown
): asserts utterance is Utterance {
  const result = schemaValidator.validateUtterance(utterance);

  if (!result.valid) {
    throw new SchemaValidationError(
      'Utterance',
      result.errors || [],
      'Utterance failed schema validation'
    );
  }
}

/**
 * Assert that a user intervention is valid
 *
 * @param intervention - The intervention to validate
 * @throws {SchemaValidationError} If validation fails
 * @returns The validated intervention (typed)
 */
export function assertValidIntervention(
  intervention: unknown
): asserts intervention is UserIntervention {
  const result = schemaValidator.validateIntervention(intervention);

  if (!result.valid) {
    throw new SchemaValidationError(
      'Intervention',
      result.errors || [],
      'User intervention failed schema validation'
    );
  }
}

/**
 * Validate transcript and return typed result (non-throwing version)
 *
 * @param data - The transcript data to validate
 * @param version - Schema version to validate against
 * @returns The validated transcript or null if invalid
 */
export function validateTranscript(
  data: unknown,
  version: SchemaVersion = '2.0.0'
): DebateTranscript | null {
  const result = schemaValidator.validateTranscript(data, version);
  return result.valid ? (data as DebateTranscript) : null;
}

/**
 * Validate utterance and return typed result (non-throwing version)
 *
 * @param utterance - The utterance to validate
 * @returns The validated utterance or null if invalid
 */
export function validateUtterance(utterance: unknown): Utterance | null {
  const result = schemaValidator.validateUtterance(utterance);
  return result.valid ? (utterance as Utterance) : null;
}

/**
 * Validate intervention and return typed result (non-throwing version)
 *
 * @param intervention - The intervention to validate
 * @returns The validated intervention or null if invalid
 */
export function validateIntervention(
  intervention: unknown
): UserIntervention | null {
  const result = schemaValidator.validateIntervention(intervention);
  return result.valid ? (intervention as UserIntervention) : null;
}
