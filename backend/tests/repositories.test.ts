/**
 * Repository Unit Tests
 * Tests CRUD operations for all database repositories using mocked pool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResult } from 'pg';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const { mockQuery, mockConnect } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockConnect: vi.fn(),
}));

// Mock the database pool
vi.mock('../src/db/connection.js', () => ({
  pool: {
    query: mockQuery,
    connect: mockConnect,
  },
  closePool: vi.fn(),
  testConnection: vi.fn(),
  query: mockQuery,
  default: {
    query: mockQuery,
    connect: mockConnect,
  },
}));

// Import repositories after mocking
import * as debateRepository from '../src/db/repositories/debate-repository.js';
import * as utteranceRepository from '../src/db/repositories/utterance-repository.js';
import * as interventionRepository from '../src/db/repositories/intervention-repository.js';
import type {
  DebateRow,
  UtteranceRow,
  UserInterventionRow,
  CreateDebateInput,
  CreateUtteranceInput,
  CreateInterventionInput,
} from '../src/types/database.js';

describe('DebateRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new debate', async () => {
      const input: CreateDebateInput = {
        propositionText: 'Test proposition',
        propositionContext: { test: 'context' },
      };

      const mockRow: DebateRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        proposition_text: 'Test proposition',
        proposition_context: { test: 'context' },
        status: 'initializing',
        current_phase: 'opening_statements',
        current_speaker: 'moderator',
        started_at: null,
        completed_at: null,
        total_duration_ms: null,
        transcript_json: null,
        structured_analysis_json: null,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<DebateRow>);

      const result = await debateRepository.create(input);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO debates'),
        expect.arrayContaining(['Test proposition', '{"test":"context"}'])
      );
      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.propositionText).toBe('Test proposition');
      expect(result.status).toBe('initializing');
    });

    it('should throw error if creation fails', async () => {
      const input: CreateDebateInput = {
        propositionText: 'Test proposition',
      };

      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(debateRepository.create(input)).rejects.toThrow('Failed to create debate');
    });
  });

  describe('findById', () => {
    it('should find a debate by ID', async () => {
      const mockRow: DebateRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        proposition_text: 'Test proposition',
        proposition_context: {},
        status: 'live',
        current_phase: 'opening_statements',
        current_speaker: 'pro_advocate',
        started_at: new Date('2024-01-01T00:00:00Z'),
        completed_at: null,
        total_duration_ms: null,
        transcript_json: null,
        structured_analysis_json: null,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:00:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<DebateRow>);

      const result = await debateRepository.findById('123e4567-e89b-12d3-a456-426614174000');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM debates WHERE id'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result).not.toBeNull();
      expect(result?.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result?.status).toBe('live');
    });

    it('should return null if debate not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as QueryResult<DebateRow>);

      const result = await debateRepository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update debate status', async () => {
      const mockRow: DebateRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        proposition_text: 'Test proposition',
        proposition_context: {},
        status: 'paused',
        current_phase: 'rebuttals',
        current_speaker: 'con_advocate',
        started_at: new Date('2024-01-01T00:00:00Z'),
        completed_at: null,
        total_duration_ms: null,
        transcript_json: null,
        structured_analysis_json: null,
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T00:01:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<DebateRow>);

      const result = await debateRepository.updateStatus('123e4567-e89b-12d3-a456-426614174000', {
        status: 'paused',
        currentPhase: 'rebuttals',
        currentSpeaker: 'con_advocate',
      });

      expect(result?.status).toBe('paused');
      expect(result?.currentPhase).toBe('rebuttals');
      expect(result?.currentSpeaker).toBe('con_advocate');
    });
  });

  describe('complete', () => {
    it('should complete a debate with analysis', async () => {
      const mockRow: DebateRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        proposition_text: 'Test proposition',
        proposition_context: {},
        status: 'completed',
        current_phase: 'closing_statements',
        current_speaker: 'moderator',
        started_at: new Date('2024-01-01T00:00:00Z'),
        completed_at: new Date('2024-01-01T01:00:00Z'),
        total_duration_ms: 3600000,
        transcript_json: null,
        structured_analysis_json: { summary: 'Test analysis' },
        created_at: new Date('2024-01-01T00:00:00Z'),
        updated_at: new Date('2024-01-01T01:00:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<DebateRow>);

      const result = await debateRepository.complete('123e4567-e89b-12d3-a456-426614174000', {
        summary: 'Test analysis',
      });

      expect(result?.status).toBe('completed');
      expect(result?.completedAt).not.toBeNull();
      expect(result?.structuredAnalysisJson).toEqual({ summary: 'Test analysis' });
    });
  });

  describe('list', () => {
    it('should list debates with filtering', async () => {
      const mockRows: DebateRow[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          proposition_text: 'Test 1',
          proposition_context: {},
          status: 'live',
          current_phase: 'opening_statements',
          current_speaker: 'moderator',
          started_at: new Date('2024-01-01T00:00:00Z'),
          completed_at: null,
          total_duration_ms: null,
          transcript_json: null,
          structured_analysis_json: null,
          created_at: new Date('2024-01-01T00:00:00Z'),
          updated_at: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      } as QueryResult<DebateRow>);

      const result = await debateRepository.list({ status: 'live', limit: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('live');
    });
  });
});

describe('UtteranceRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new utterance', async () => {
      const input: CreateUtteranceInput = {
        debateId: '123e4567-e89b-12d3-a456-426614174000',
        timestampMs: 1000,
        phase: 'opening_statements',
        speaker: 'pro_advocate',
        content: 'Test utterance',
        metadata: { tokens: 10 },
      };

      const mockRow: UtteranceRow = {
        id: 1,
        debate_id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp_ms: 1000,
        phase: 'opening_statements',
        speaker: 'pro_advocate',
        content: 'Test utterance',
        metadata: { tokens: 10 },
        created_at: new Date('2024-01-01T00:00:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<UtteranceRow>);

      const result = await utteranceRepository.create(input);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO utterances'),
        expect.arrayContaining([
          '123e4567-e89b-12d3-a456-426614174000',
          1000,
          'opening_statements',
          'pro_advocate',
          'Test utterance',
          '{"tokens":10}',
        ])
      );
      expect(result.id).toBe(1);
      expect(result.content).toBe('Test utterance');
      expect(result.speaker).toBe('pro_advocate');
    });
  });

  describe('findByDebateId', () => {
    it('should find all utterances for a debate', async () => {
      const mockRows: UtteranceRow[] = [
        {
          id: 1,
          debate_id: '123e4567-e89b-12d3-a456-426614174000',
          timestamp_ms: 0,
          phase: 'opening_statements',
          speaker: 'moderator',
          content: 'Welcome',
          metadata: {},
          created_at: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 2,
          debate_id: '123e4567-e89b-12d3-a456-426614174000',
          timestamp_ms: 1000,
          phase: 'opening_statements',
          speaker: 'pro_advocate',
          content: 'I argue...',
          metadata: {},
          created_at: new Date('2024-01-01T00:00:01Z'),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 2,
      } as QueryResult<UtteranceRow>);

      const result = await utteranceRepository.findByDebateId('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toHaveLength(2);
      expect(result[0].speaker).toBe('moderator');
      expect(result[1].speaker).toBe('pro_advocate');
    });
  });

  describe('findByDebateIdAndTimeRange', () => {
    it('should find utterances within time range', async () => {
      const mockRows: UtteranceRow[] = [
        {
          id: 2,
          debate_id: '123e4567-e89b-12d3-a456-426614174000',
          timestamp_ms: 1000,
          phase: 'opening_statements',
          speaker: 'pro_advocate',
          content: 'I argue...',
          metadata: {},
          created_at: new Date('2024-01-01T00:00:01Z'),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      } as QueryResult<UtteranceRow>);

      const result = await utteranceRepository.findByDebateIdAndTimeRange(
        '123e4567-e89b-12d3-a456-426614174000',
        500,
        1500
      );

      expect(result).toHaveLength(1);
      expect(result[0].timestampMs).toBe(1000);
    });
  });

  describe('batchCreate', () => {
    it('should create multiple utterances', async () => {
      const inputs: CreateUtteranceInput[] = [
        {
          debateId: '123e4567-e89b-12d3-a456-426614174000',
          timestampMs: 0,
          phase: 'opening_statements',
          speaker: 'moderator',
          content: 'Welcome',
        },
        {
          debateId: '123e4567-e89b-12d3-a456-426614174000',
          timestampMs: 1000,
          phase: 'opening_statements',
          speaker: 'pro_advocate',
          content: 'I argue...',
        },
      ];

      const mockRows: UtteranceRow[] = inputs.map((input, idx) => ({
        id: idx + 1,
        debate_id: input.debateId,
        timestamp_ms: input.timestampMs,
        phase: input.phase,
        speaker: input.speaker,
        content: input.content,
        metadata: {},
        created_at: new Date('2024-01-01T00:00:00Z'),
      }));

      mockQuery.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 2,
      } as QueryResult<UtteranceRow>);

      const result = await utteranceRepository.batchCreate(inputs);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO utterances'),
        expect.any(Array)
      );
    });
  });
});

describe('InterventionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new intervention', async () => {
      const input: CreateInterventionInput = {
        debateId: '123e4567-e89b-12d3-a456-426614174000',
        timestampMs: 5000,
        interventionType: 'question',
        content: 'What about X?',
        directedTo: 'pro_advocate',
      };

      const mockRow: UserInterventionRow = {
        id: 1,
        debate_id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp_ms: 5000,
        intervention_type: 'question',
        content: 'What about X?',
        directed_to: 'pro_advocate',
        response: null,
        response_timestamp_ms: null,
        created_at: new Date('2024-01-01T00:00:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<UserInterventionRow>);

      const result = await interventionRepository.create(input);

      expect(result.id).toBe(1);
      expect(result.content).toBe('What about X?');
      expect(result.directedTo).toBe('pro_advocate');
      expect(result.response).toBeNull();
    });
  });

  describe('addResponse', () => {
    it('should add a response to an intervention', async () => {
      const mockRow: UserInterventionRow = {
        id: 1,
        debate_id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp_ms: 5000,
        intervention_type: 'question',
        content: 'What about X?',
        directed_to: 'pro_advocate',
        response: 'Good question! Here is my answer...',
        response_timestamp_ms: 6000,
        created_at: new Date('2024-01-01T00:00:00Z'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockRow],
        rowCount: 1,
      } as QueryResult<UserInterventionRow>);

      const result = await interventionRepository.addResponse(
        1,
        'Good question! Here is my answer...',
        6000
      );

      expect(result?.response).toBe('Good question! Here is my answer...');
      expect(result?.responseTimestampMs).toBe(6000);
    });
  });

  describe('findUnanswered', () => {
    it('should find interventions without responses', async () => {
      const mockRows: UserInterventionRow[] = [
        {
          id: 1,
          debate_id: '123e4567-e89b-12d3-a456-426614174000',
          timestamp_ms: 5000,
          intervention_type: 'question',
          content: 'What about X?',
          directed_to: 'pro_advocate',
          response: null,
          response_timestamp_ms: null,
          created_at: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      } as QueryResult<UserInterventionRow>);

      const result = await interventionRepository.findUnanswered('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toHaveLength(1);
      expect(result[0].response).toBeNull();
    });
  });

  describe('findByType', () => {
    it('should find interventions by type', async () => {
      const mockRows: UserInterventionRow[] = [
        {
          id: 1,
          debate_id: '123e4567-e89b-12d3-a456-426614174000',
          timestamp_ms: 5000,
          intervention_type: 'evidence_injection',
          content: 'Here is some data...',
          directed_to: null,
          response: null,
          response_timestamp_ms: null,
          created_at: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockRows,
        rowCount: 1,
      } as QueryResult<UserInterventionRow>);

      const result = await interventionRepository.findByType(
        '123e4567-e89b-12d3-a456-426614174000',
        'evidence_injection'
      );

      expect(result).toHaveLength(1);
      expect(result[0].interventionType).toBe('evidence_injection');
    });
  });

  describe('count and countUnanswered', () => {
    it('should count total interventions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '5' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const result = await interventionRepository.count('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBe(5);
    });

    it('should count unanswered interventions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '2' }],
        rowCount: 1,
      } as QueryResult<{ count: string }>);

      const result = await interventionRepository.countUnanswered('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBe(2);
    });
  });
});
