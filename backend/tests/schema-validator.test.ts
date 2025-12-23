/**
 * Schema Validator Unit Tests
 *
 * Comprehensive test suite for JSON Schema validation.
 * Target: >95% code coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  schemaValidator,
  SchemaValidationError,
  assertValidTranscript,
  assertValidUtterance,
  assertValidIntervention,
  validateTranscript,
  validateUtterance,
  validateIntervention,
  DebatePhase,
  Speaker,
  DebateStatus,
  InterventionType,
  type DebateTranscript,
  type Utterance,
  type UserIntervention,
} from '../src/services/validation/index.js';

describe('SchemaValidator', () => {
  describe('validateTranscript', () => {
    it('should accept a valid complete transcript', () => {
      const validTranscript: DebateTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 1800,
          status: DebateStatus.COMPLETED,
        },
        proposition: {
          raw_input: 'Should we implement AI regulation?',
          normalized_question:
            'Should governments implement comprehensive AI regulation?',
          context: 'Current state of AI development and risks',
        },
        transcript: [
          {
            id: 'utt-001',
            timestamp_ms: 1000,
            phase: DebatePhase.PHASE_1_OPENING,
            speaker: Speaker.MODERATOR,
            content: 'Welcome to the debate on AI regulation.',
            metadata: {
              tokens: 10,
              model: 'gpt-4',
              response_time_ms: 500,
            },
          },
          {
            id: 'utt-002',
            timestamp_ms: 2000,
            phase: DebatePhase.PHASE_1_OPENING,
            speaker: Speaker.PRO,
            content: 'I believe we need strong AI regulation.',
          },
        ],
        structured_analysis: {
          pro: {
            key_arguments: ['Safety concerns', 'Ethical considerations'],
            evidence_cited: ['Study A', 'Report B'],
            assumptions: ['AI poses risks'],
            uncertainties: ['Timeline for regulation'],
          },
          con: {
            key_arguments: ['Innovation concerns'],
          },
          moderator: {
            key_arguments: ['Balance needed'],
          },
        },
        user_interventions: [
          {
            id: 'int-001',
            timestamp_ms: 5000,
            phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
            type: InterventionType.QUESTION,
            content: 'What about small startups?',
            metadata: {
              user_id: 'user-123',
            },
          },
        ],
      };

      const result = schemaValidator.validateTranscript(validTranscript);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should accept a minimal valid transcript', () => {
      const minimalTranscript: DebateTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-456',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 0,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test question?',
          normalized_question: 'Test question?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(minimalTranscript);

      expect(result.valid).toBe(true);
    });

    it('should reject transcript with missing required meta fields', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          // Missing: generated_at, debate_format, total_duration_seconds, status
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors!.some((e) => e.message?.includes('required'))).toBe(
        true
      );
    });

    it('should reject transcript with missing proposition fields', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test?',
          // Missing: normalized_question
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject transcript with invalid status enum', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 100,
          status: 'invalid_status', // Invalid enum value
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'enum')).toBe(true);
    });

    it('should reject transcript with invalid date-time format', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: 'not-a-valid-date', // Invalid date-time format
          debate_format: 'live_adversarial',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'format')).toBe(true);
    });

    it('should reject transcript with negative total_duration_seconds', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: -100, // Negative value
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'minimum')).toBe(true);
    });

    it('should reject transcript with additional properties in meta', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
          extra_field: 'should not be here', // Additional property
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(
        result.errors!.some((e) => e.keyword === 'additionalProperties')
      ).toBe(true);
    });

    it('should reject transcript with unsupported schema version', () => {
      const result = schemaValidator.validateTranscript({}, '99.99.99' as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Unknown schema version');
    });
  });

  describe('validateUtterance', () => {
    it('should accept a valid complete utterance', () => {
      const validUtterance: Utterance = {
        id: 'utt-001',
        timestamp_ms: 1000,
        phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
        speaker: Speaker.PRO,
        content: 'This is a valid argument.',
        metadata: {
          tokens: 10,
          model: 'gpt-4',
          response_time_ms: 500,
          custom_field: 'allowed',
        },
      };

      const result = schemaValidator.validateUtterance(validUtterance);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should accept a minimal valid utterance', () => {
      const minimalUtterance: Utterance = {
        id: 'utt-002',
        timestamp_ms: 2000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.MODERATOR,
        content: 'Minimal content.',
      };

      const result = schemaValidator.validateUtterance(minimalUtterance);

      expect(result.valid).toBe(true);
    });

    it('should reject utterance with empty content', () => {
      const invalidUtterance = {
        id: 'utt-003',
        timestamp_ms: 3000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: '', // Empty string
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'minLength')).toBe(true);
    });

    it('should reject utterance with invalid speaker enum', () => {
      const invalidUtterance = {
        id: 'utt-004',
        timestamp_ms: 4000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: 'invalid_speaker', // Invalid speaker
        content: 'Some content',
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'enum')).toBe(true);
    });

    it('should reject utterance with invalid phase enum', () => {
      const invalidUtterance = {
        id: 'utt-005',
        timestamp_ms: 5000,
        phase: 'invalid_phase', // Invalid phase
        speaker: Speaker.PRO,
        content: 'Some content',
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'enum')).toBe(true);
    });

    it('should reject utterance with missing required fields', () => {
      const invalidUtterance = {
        id: 'utt-006',
        // Missing: timestamp_ms, phase, speaker, content
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should reject utterance with negative timestamp', () => {
      const invalidUtterance = {
        id: 'utt-007',
        timestamp_ms: -1000, // Negative timestamp
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: 'Some content',
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'minimum')).toBe(true);
    });

    it('should accept all valid speaker types', () => {
      const speakers = [Speaker.PRO, Speaker.CON, Speaker.MODERATOR, Speaker.SYSTEM];

      speakers.forEach((speaker) => {
        const utterance: Utterance = {
          id: `utt-${speaker}`,
          timestamp_ms: 1000,
          phase: DebatePhase.PHASE_1_OPENING,
          speaker,
          content: 'Content',
        };

        const result = schemaValidator.validateUtterance(utterance);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept all valid phase types', () => {
      const phases = [
        DebatePhase.PHASE_1_OPENING,
        DebatePhase.PHASE_2_CONSTRUCTIVE,
        DebatePhase.PHASE_3_CROSSEXAM,
        DebatePhase.PHASE_4_REBUTTAL,
        DebatePhase.PHASE_5_CLOSING,
        DebatePhase.PHASE_6_SYNTHESIS,
      ];

      phases.forEach((phase) => {
        const utterance: Utterance = {
          id: `utt-${phase}`,
          timestamp_ms: 1000,
          phase,
          speaker: Speaker.PRO,
          content: 'Content',
        };

        const result = schemaValidator.validateUtterance(utterance);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateIntervention', () => {
    it('should accept a valid complete intervention', () => {
      const validIntervention: UserIntervention = {
        id: 'int-001',
        timestamp_ms: 5000,
        phase: DebatePhase.PHASE_3_CROSSEXAM,
        type: InterventionType.QUESTION,
        content: 'What about edge cases?',
        metadata: {
          user_id: 'user-123',
          custom_data: { foo: 'bar' },
        },
      };

      const result = schemaValidator.validateIntervention(validIntervention);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should accept a minimal valid intervention', () => {
      const minimalIntervention: UserIntervention = {
        id: 'int-002',
        timestamp_ms: 6000,
        phase: DebatePhase.PHASE_4_REBUTTAL,
        type: InterventionType.PAUSE,
        content: 'Pause please',
      };

      const result = schemaValidator.validateIntervention(minimalIntervention);

      expect(result.valid).toBe(true);
    });

    it('should reject intervention with invalid type enum', () => {
      const invalidIntervention = {
        id: 'int-003',
        timestamp_ms: 7000,
        phase: DebatePhase.PHASE_5_CLOSING,
        type: 'invalid_type', // Invalid intervention type
        content: 'Some content',
      };

      const result = schemaValidator.validateIntervention(invalidIntervention);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.keyword === 'enum')).toBe(true);
    });

    it('should reject intervention with missing required fields', () => {
      const invalidIntervention = {
        id: 'int-004',
        // Missing: timestamp_ms, phase, type, content
      };

      const result = schemaValidator.validateIntervention(invalidIntervention);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should accept all valid intervention types', () => {
      const types = [
        InterventionType.QUESTION,
        InterventionType.CHALLENGE,
        InterventionType.EVIDENCE,
        InterventionType.PAUSE,
        InterventionType.RESUME,
      ];

      types.forEach((type) => {
        const intervention: UserIntervention = {
          id: `int-${type}`,
          timestamp_ms: 1000,
          phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
          type,
          content: 'Content',
        };

        const result = schemaValidator.validateIntervention(intervention);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('SchemaValidationError', () => {
    it('should create error with correct properties', () => {
      const errors = [
        { path: '/test', message: 'Test error', keyword: 'required' },
      ];
      const error = new SchemaValidationError('Test', errors);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect(error.name).toBe('SchemaValidationError');
      expect(error.validationType).toBe('Test');
      expect(error.errors).toEqual(errors);
      expect(error.message).toContain('Test validation failed');
    });

    it('should format errors in message', () => {
      const errors = [
        { path: '/field1', message: 'Error 1' },
        { path: '/field2', message: 'Error 2' },
      ];
      const error = new SchemaValidationError('Test', errors);

      expect(error.message).toContain('/field1: Error 1');
      expect(error.message).toContain('/field2: Error 2');
    });

    it('should generate detailed report', () => {
      const errors = [
        {
          path: '/test',
          message: 'Test error',
          keyword: 'required',
          params: { missingProperty: 'foo' },
        },
      ];
      const error = new SchemaValidationError('Test', errors);
      const report = error.getDetailedReport();

      expect(report).toContain('Test Validation Failed');
      expect(report).toContain('Total errors: 1');
      expect(report).toContain('Path: /test');
      expect(report).toContain('Message: Test error');
      expect(report).toContain('Keyword: required');
      expect(report).toContain('Params:');
    });

    it('should convert to JSON', () => {
      const errors = [{ path: '/test', message: 'Test error' }];
      const error = new SchemaValidationError('Test', errors);
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'SchemaValidationError',
        message: expect.any(String),
        validationType: 'Test',
        errors,
      });
    });
  });

  describe('assertValidTranscript', () => {
    it('should not throw for valid transcript', () => {
      const validTranscript: DebateTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      expect(() => assertValidTranscript(validTranscript)).not.toThrow();
    });

    it('should throw SchemaValidationError for invalid transcript', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          // Missing required fields
        },
        proposition: {
          raw_input: 'Test?',
        },
        transcript: [],
      };

      expect(() => assertValidTranscript(invalidTranscript)).toThrow(
        SchemaValidationError
      );
    });
  });

  describe('assertValidUtterance', () => {
    it('should not throw for valid utterance', () => {
      const validUtterance: Utterance = {
        id: 'utt-001',
        timestamp_ms: 1000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: 'Valid content',
      };

      expect(() => assertValidUtterance(validUtterance)).not.toThrow();
    });

    it('should throw SchemaValidationError for invalid utterance', () => {
      const invalidUtterance = {
        id: 'utt-001',
        // Missing required fields
      };

      expect(() => assertValidUtterance(invalidUtterance)).toThrow(
        SchemaValidationError
      );
    });
  });

  describe('assertValidIntervention', () => {
    it('should not throw for valid intervention', () => {
      const validIntervention: UserIntervention = {
        id: 'int-001',
        timestamp_ms: 5000,
        phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
        type: InterventionType.QUESTION,
        content: 'Valid question?',
      };

      expect(() => assertValidIntervention(validIntervention)).not.toThrow();
    });

    it('should throw SchemaValidationError for invalid intervention', () => {
      const invalidIntervention = {
        id: 'int-001',
        // Missing required fields
      };

      expect(() => assertValidIntervention(invalidIntervention)).toThrow(
        SchemaValidationError
      );
    });
  });

  describe('non-throwing validators', () => {
    it('validateTranscript should return transcript for valid data', () => {
      const validTranscript: DebateTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: '2024-01-15T10:30:00Z',
          debate_format: 'live_adversarial',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = validateTranscript(validTranscript);
      expect(result).toEqual(validTranscript);
    });

    it('validateTranscript should return null for invalid data', () => {
      const invalidTranscript = { meta: {} };
      const result = validateTranscript(invalidTranscript);
      expect(result).toBeNull();
    });

    it('validateUtterance should return utterance for valid data', () => {
      const validUtterance: Utterance = {
        id: 'utt-001',
        timestamp_ms: 1000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: 'Content',
      };

      const result = validateUtterance(validUtterance);
      expect(result).toEqual(validUtterance);
    });

    it('validateUtterance should return null for invalid data', () => {
      const invalidUtterance = { id: 'test' };
      const result = validateUtterance(invalidUtterance);
      expect(result).toBeNull();
    });

    it('validateIntervention should return intervention for valid data', () => {
      const validIntervention: UserIntervention = {
        id: 'int-001',
        timestamp_ms: 5000,
        phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
        type: InterventionType.QUESTION,
        content: 'Question?',
      };

      const result = validateIntervention(validIntervention);
      expect(result).toEqual(validIntervention);
    });

    it('validateIntervention should return null for invalid data', () => {
      const invalidIntervention = { id: 'test' };
      const result = validateIntervention(invalidIntervention);
      expect(result).toBeNull();
    });
  });

  describe('SchemaValidator methods', () => {
    it('should return supported versions', () => {
      const versions = schemaValidator.getSupportedVersions();
      expect(versions).toContain('2.0.0');
      expect(versions.length).toBeGreaterThan(0);
    });

    it('should check if version is supported', () => {
      expect(schemaValidator.isSupportedVersion('2.0.0')).toBe(true);
      expect(schemaValidator.isSupportedVersion('99.99.99')).toBe(false);
    });
  });
});
