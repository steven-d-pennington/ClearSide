import { expect } from 'vitest';

interface Proposition {
  normalized: string;
  original: string;
}

interface Argument {
  title: string;
  description: string;
  category: string;
  evidence: unknown[];
}

expect.extend({
  /**
   * Check if a proposition object has valid structure
   */
  toHaveValidProposition(received: unknown) {
    const prop = received as Proposition;
    const pass =
      typeof prop === 'object' &&
      prop !== null &&
      typeof prop.normalized === 'string' &&
      typeof prop.original === 'string' &&
      prop.normalized.length >= 10 &&
      prop.normalized.length <= 500;

    return {
      pass,
      message: () =>
        pass
          ? 'Expected proposition to be invalid'
          : 'Expected valid proposition with normalized and original strings (10-500 chars)',
      actual: received,
      expected: { normalized: 'string (10-500 chars)', original: 'string' },
    };
  },

  /**
   * Check if an argument object has valid structure
   */
  toHaveValidArgument(received: unknown) {
    const arg = received as Argument;
    const pass =
      typeof arg === 'object' &&
      arg !== null &&
      typeof arg.title === 'string' &&
      typeof arg.description === 'string' &&
      typeof arg.category === 'string' &&
      Array.isArray(arg.evidence);

    return {
      pass,
      message: () =>
        pass
          ? 'Expected argument to be invalid'
          : 'Expected valid argument with title, description, category, and evidence array',
      actual: received,
      expected: {
        title: 'string',
        description: 'string',
        category: 'string',
        evidence: 'array',
      },
    };
  },

  /**
   * Check if text content is within character limits
   */
  toBeWithinCharacterLimit(received: string, min: number, max: number) {
    const length = received?.length ?? 0;
    const pass = length >= min && length <= max;

    return {
      pass,
      message: () =>
        pass
          ? `Expected string to be outside ${min}-${max} character limit`
          : `Expected string (length: ${length}) to be within ${min}-${max} characters`,
      actual: length,
      expected: { min, max },
    };
  },
});

// Type declarations for custom matchers
declare module 'vitest' {
  interface Assertion<T> {
    toHaveValidProposition(): T;
    toHaveValidArgument(): T;
    toBeWithinCharacterLimit(min: number, max: number): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveValidProposition(): unknown;
    toHaveValidArgument(): unknown;
    toBeWithinCharacterLimit(min: number, max: number): unknown;
  }
}
