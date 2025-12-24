/**
 * Validation utilities for form inputs
 */

const QUESTION_MIN_LENGTH = 10;
const QUESTION_MAX_LENGTH = 500;
const CONTEXT_MAX_LENGTH = 5000;

/**
 * Validate question input
 */
export function validateQuestion(question: string): string | undefined {
  const trimmed = question.trim();

  if (!trimmed) {
    return 'Question is required';
  }

  if (trimmed.length < QUESTION_MIN_LENGTH) {
    return `Question must be at least ${QUESTION_MIN_LENGTH} characters`;
  }

  if (trimmed.length > QUESTION_MAX_LENGTH) {
    return `Question must be no more than ${QUESTION_MAX_LENGTH} characters`;
  }

  return undefined;
}

/**
 * Validate context input
 */
export function validateContext(context: string): string | undefined {
  const trimmed = context.trim();

  if (trimmed.length > CONTEXT_MAX_LENGTH) {
    return `Context must be no more than ${CONTEXT_MAX_LENGTH} characters`;
  }

  return undefined;
}

/**
 * Validation constants export
 */
export const VALIDATION_LIMITS = {
  QUESTION_MIN_LENGTH,
  QUESTION_MAX_LENGTH,
  CONTEXT_MAX_LENGTH,
} as const;
