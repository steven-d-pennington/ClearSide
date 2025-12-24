import { describe, it, expect } from 'vitest';
import {
  validateQuestion,
  validateContext,
  VALIDATION_LIMITS,
} from './validation';

describe('Validation Utilities', () => {
  describe('validateQuestion', () => {
    it('returns error for empty question', () => {
      expect(validateQuestion('')).toBe('Question is required');
    });

    it('returns error for whitespace-only question', () => {
      expect(validateQuestion('   ')).toBe('Question is required');
    });

    it('returns error for question below minimum length', () => {
      expect(validateQuestion('Short')).toBe(
        `Question must be at least ${VALIDATION_LIMITS.QUESTION_MIN_LENGTH} characters`
      );
    });

    it('returns error for question above maximum length', () => {
      const longQuestion = 'a'.repeat(VALIDATION_LIMITS.QUESTION_MAX_LENGTH + 1);
      expect(validateQuestion(longQuestion)).toBe(
        `Question must be no more than ${VALIDATION_LIMITS.QUESTION_MAX_LENGTH} characters`
      );
    });

    it('returns undefined for valid question', () => {
      const validQuestion = 'Should artificial intelligence be regulated by the government?';
      expect(validateQuestion(validQuestion)).toBeUndefined();
    });

    it('returns undefined for question at minimum length', () => {
      const minQuestion = 'a'.repeat(VALIDATION_LIMITS.QUESTION_MIN_LENGTH);
      expect(validateQuestion(minQuestion)).toBeUndefined();
    });

    it('returns undefined for question at maximum length', () => {
      const maxQuestion = 'a'.repeat(VALIDATION_LIMITS.QUESTION_MAX_LENGTH);
      expect(validateQuestion(maxQuestion)).toBeUndefined();
    });
  });

  describe('validateContext', () => {
    it('returns undefined for empty context (optional field)', () => {
      expect(validateContext('')).toBeUndefined();
    });

    it('returns undefined for valid context', () => {
      const validContext = 'This is some additional context for the debate.';
      expect(validateContext(validContext)).toBeUndefined();
    });

    it('returns error for context above maximum length', () => {
      const longContext = 'a'.repeat(VALIDATION_LIMITS.CONTEXT_MAX_LENGTH + 1);
      expect(validateContext(longContext)).toBe(
        `Context must be no more than ${VALIDATION_LIMITS.CONTEXT_MAX_LENGTH} characters`
      );
    });

    it('returns undefined for context at maximum length', () => {
      const maxContext = 'a'.repeat(VALIDATION_LIMITS.CONTEXT_MAX_LENGTH);
      expect(validateContext(maxContext)).toBeUndefined();
    });
  });

  describe('VALIDATION_LIMITS', () => {
    it('has expected question minimum length', () => {
      expect(VALIDATION_LIMITS.QUESTION_MIN_LENGTH).toBe(10);
    });

    it('has expected question maximum length', () => {
      expect(VALIDATION_LIMITS.QUESTION_MAX_LENGTH).toBe(500);
    });

    it('has expected context maximum length', () => {
      expect(VALIDATION_LIMITS.CONTEXT_MAX_LENGTH).toBe(5000);
    });
  });
});
