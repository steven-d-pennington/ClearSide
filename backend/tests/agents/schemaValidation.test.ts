/**
 * Schema Validation Tests for Agent Outputs
 *
 * Ensures all agent outputs conform to JSON Schema v2.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { schemaValidator } from '../../src/services/validation/schema-validator.js';
import {
  DebatePhase,
  Speaker,
  DebateStatus,
  type DebateTranscript,
  type Utterance,
} from '../../src/schemas/debate-transcript-v2.schema.js';

describe('Agent Output Schema Validation', () => {
  describe('Complete Debate Transcript', () => {
    it('validates complete debate transcript with all required fields', () => {
      const validTranscript: DebateTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'live-debate-theater-v1',
          total_duration_seconds: 1620, // 27 minutes
          status: DebateStatus.COMPLETED,
        },
        proposition: {
          raw_input: 'Should we implement a moratorium on AI data centers?',
          normalized_question:
            'Should we implement a temporary moratorium on new AI data centers pending renewable energy grid improvements?',
          context: 'Environmental and economic considerations for AI infrastructure',
        },
        transcript: [
          {
            id: 'utterance-1',
            timestamp_ms: 0,
            phase: DebatePhase.PHASE_1_OPENING,
            speaker: Speaker.PRO,
            content: 'We should implement a moratorium on AI data centers...',
            metadata: {
              tokens: 150,
              model: 'claude-sonnet-4.5',
              response_time_ms: 2500,
            },
          },
        ],
        structured_analysis: {
          pro: {
            key_arguments: ['Environmental protection', 'Energy conservation'],
            evidence_cited: ['IEA Report 2023'],
            assumptions: ['Energy grid remains carbon-intensive'],
            uncertainties: ['Timeline for renewable transition'],
          },
          con: {
            key_arguments: ['Economic growth', 'Innovation impact'],
            evidence_cited: ['McKinsey AI Report 2024'],
            assumptions: ['AI development continues at current pace'],
            uncertainties: ['Actual economic impact of moratorium'],
          },
          moderator: {
            key_arguments: ['Trade-offs between environment and economy'],
            evidence_cited: [],
            assumptions: [],
            uncertainties: ['Optimal timing for intervention'],
          },
        },
        user_interventions: [],
      };

      const result = schemaValidator.validateTranscript(validTranscript);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('rejects transcript missing required meta fields', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          // Missing debate_id, generated_at, etc.
        },
        proposition: {
          raw_input: 'Test',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('rejects transcript with invalid schema version', () => {
      const invalidTranscript = {
        meta: {
          schema_version: 'invalid-version',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: DebateStatus.COMPLETED,
        },
        proposition: {
          raw_input: 'Test',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);
      expect(result.valid).toBe(false);
    });

    it('rejects transcript with invalid debate status', () => {
      const invalidTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: 'invalid_status', // Should be DebateStatus enum value
        },
        proposition: {
          raw_input: 'Test',
          normalized_question: 'Test?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Utterance Validation', () => {
    it('validates utterance with all required fields', () => {
      const validUtterance: Utterance = {
        id: 'utterance-1',
        timestamp_ms: 1000,
        phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
        speaker: Speaker.PRO,
        content: 'This is a valid utterance with meaningful content.',
      };

      const result = schemaValidator.validateUtterance(validUtterance);
      expect(result.valid).toBe(true);
    });

    it('validates utterance with optional metadata', () => {
      const validUtterance: Utterance = {
        id: 'utterance-2',
        timestamp_ms: 2000,
        phase: DebatePhase.PHASE_3_CROSSEXAM,
        speaker: Speaker.CON,
        content: 'Question for the pro advocate.',
        metadata: {
          tokens: 50,
          model: 'gpt-4',
          response_time_ms: 1200,
        },
      };

      const result = schemaValidator.validateUtterance(validUtterance);
      expect(result.valid).toBe(true);
    });

    it('rejects utterance missing required fields', () => {
      const invalidUtterance = {
        id: 'utterance-3',
        timestamp_ms: 3000,
        // Missing phase, speaker, content
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('rejects utterance with invalid phase', () => {
      const invalidUtterance = {
        id: 'utterance-4',
        timestamp_ms: 4000,
        phase: 'invalid_phase',
        speaker: Speaker.PRO,
        content: 'Content',
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
    });

    it('rejects utterance with invalid speaker', () => {
      const invalidUtterance = {
        id: 'utterance-5',
        timestamp_ms: 5000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: 'invalid_speaker',
        content: 'Content',
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
    });

    it('rejects utterance with empty content', () => {
      const invalidUtterance = {
        id: 'utterance-6',
        timestamp_ms: 6000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.MODERATOR,
        content: '', // Empty content not allowed
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
    });

    it('rejects utterance with negative timestamp', () => {
      const invalidUtterance = {
        id: 'utterance-7',
        timestamp_ms: -1000, // Negative not allowed
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.PRO,
        content: 'Content',
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
    });
  });

  describe('Proposition Validation', () => {
    it('validates proposition with context', () => {
      const transcript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'AI data centers',
          normalized_question: 'Should we build more AI data centers?',
          context: 'Environmental impact of AI infrastructure',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(transcript);
      expect(result.valid).toBe(true);
    });

    it('validates proposition without context', () => {
      const transcript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test input',
          normalized_question: 'Test question?',
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(transcript);
      expect(result.valid).toBe(true);
    });

    it('rejects proposition missing normalized_question', () => {
      const transcript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: DebateStatus.LIVE,
        },
        proposition: {
          raw_input: 'Test input',
          // Missing normalized_question
        },
        transcript: [],
      };

      const result = schemaValidator.validateTranscript(transcript);
      expect(result.valid).toBe(false);
    });
  });

  describe('Structured Analysis Validation', () => {
    it('validates structured analysis with all sections', () => {
      const transcript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: DebateStatus.COMPLETED,
        },
        proposition: {
          raw_input: 'Test',
          normalized_question: 'Test?',
        },
        transcript: [],
        structured_analysis: {
          pro: {
            key_arguments: ['Argument 1', 'Argument 2'],
            evidence_cited: ['Source 1'],
            assumptions: ['Assumption 1'],
            uncertainties: ['Uncertainty 1'],
          },
          con: {
            key_arguments: ['Counter-argument 1'],
            evidence_cited: ['Source 2'],
            assumptions: ['Assumption 2'],
            uncertainties: ['Uncertainty 2'],
          },
          moderator: {
            key_arguments: ['Synthesis point 1'],
            evidence_cited: [],
            assumptions: [],
            uncertainties: ['Hinge 1'],
          },
        },
      };

      const result = schemaValidator.validateTranscript(transcript);
      expect(result.valid).toBe(true);
    });

    it('validates structured analysis with partial sections', () => {
      const transcript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'test',
          total_duration_seconds: 100,
          status: DebateStatus.COMPLETED,
        },
        proposition: {
          raw_input: 'Test',
          normalized_question: 'Test?',
        },
        transcript: [],
        structured_analysis: {
          pro: {
            key_arguments: ['Argument 1'],
          },
        },
      };

      const result = schemaValidator.validateTranscript(transcript);
      expect(result.valid).toBe(true);
    });
  });

  describe('Schema Version Support', () => {
    it('lists supported schema versions', () => {
      const versions = schemaValidator.getSupportedVersions();
      expect(versions).toContain('2.0.0');
    });

    it('confirms version 2.0.0 is supported', () => {
      expect(schemaValidator.isSupportedVersion('2.0.0')).toBe(true);
    });

    it('confirms invalid version is not supported', () => {
      expect(schemaValidator.isSupportedVersion('999.0.0')).toBe(false);
    });
  });
});
