/**
 * Intervention Queue Unit Tests
 * Tests intervention queue service functionality with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserIntervention } from '../src/types/database.js';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const {
  mockCreate,
  mockFindById,
  mockFindByDebateId,
  mockAddResponse,
  mockFindUnanswered,
  mockCountUnanswered,
  mockFindByType,
  mockFindByDirectedTo,
  mockValidateIntervention,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByDebateId: vi.fn(),
  mockAddResponse: vi.fn(),
  mockFindUnanswered: vi.fn(),
  mockCountUnanswered: vi.fn(),
  mockFindByType: vi.fn(),
  mockFindByDirectedTo: vi.fn(),
  mockValidateIntervention: vi.fn(),
}));

// Mock intervention repository
vi.mock('../src/db/repositories/intervention-repository.js', () => ({
  create: mockCreate,
  findById: mockFindById,
  findByDebateId: mockFindByDebateId,
  addResponse: mockAddResponse,
  findUnanswered: mockFindUnanswered,
  countUnanswered: mockCountUnanswered,
  findByType: mockFindByType,
  findByDirectedTo: mockFindByDirectedTo,
}));

// Mock schema validator
vi.mock('../src/services/validation/schema-validator.js', () => ({
  schemaValidator: {
    validateIntervention: mockValidateIntervention,
  },
}));

// Import after mocking
import { InterventionQueue, InterventionStatus } from '../src/services/intervention/intervention-queue.js';

describe('InterventionQueue', () => {
  let queue: InterventionQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new InterventionQueue();

    // Default: validation passes
    mockValidateIntervention.mockReturnValue({ valid: true });
  });

  describe('addIntervention', () => {
    it('should add a valid intervention to the queue', async () => {
      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Can you clarify this point?',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);

      const id = await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Can you clarify this point?',
        directedTo: 'pro_advocate',
      });

      expect(id).toBe(1);
      expect(mockValidateIntervention).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp_ms: 1000,
          intervention_type: 'question',
          content: 'Can you clarify this point?',
          directed_to: 'pro_advocate',
        })
      );
      expect(mockCreate).toHaveBeenCalledWith({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Can you clarify this point?',
        directedTo: 'pro_advocate',
      });
    });

    it('should throw error if validation fails', async () => {
      mockValidateIntervention.mockReturnValueOnce({
        valid: false,
        errors: [
          { path: '/content', message: 'Content is too short' },
        ],
      });

      await expect(
        queue.addIntervention({
          debateId: 'debate-123',
          timestampMs: 1000,
          interventionType: 'question',
          content: '',
          directedTo: 'pro_advocate',
        })
      ).rejects.toThrow('Invalid intervention: Content is too short');

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should handle intervention without directedTo', async () => {
      const mockIntervention: UserIntervention = {
        id: 2,
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'pause_request',
        content: 'Please pause',
        directedTo: null,
        response: null,
        responseTimestampMs: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);

      const id = await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'pause_request',
        content: 'Please pause',
      });

      expect(id).toBe(2);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          directedTo: null,
        })
      );
    });
  });

  describe('getQueuedInterventions', () => {
    it('should return only queued interventions for a debate', async () => {
      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question 1',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question 1',
        directedTo: 'pro_advocate',
      });

      const queued = queue.getQueuedInterventions('debate-123');

      expect(queued).toHaveLength(1);
      expect(queued[0].status).toBe(InterventionStatus.QUEUED);
      expect(queued[0].intervention.id).toBe(1);
    });

    it('should filter out processing and completed interventions', async () => {
      const mockIntervention1: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question 1',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      const mockIntervention2: UserIntervention = {
        id: 2,
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'question',
        content: 'Question 2',
        directedTo: 'con_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention1);
      mockCreate.mockResolvedValueOnce(mockIntervention2);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question 1',
        directedTo: 'pro_advocate',
      });

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'question',
        content: 'Question 2',
        directedTo: 'con_advocate',
      });

      // Mark first as processing
      await queue.markProcessing(1);

      const queued = queue.getQueuedInterventions('debate-123');

      expect(queued).toHaveLength(1);
      expect(queued[0].intervention.id).toBe(2);
    });

    it('should return empty array for non-existent debate', () => {
      const queued = queue.getQueuedInterventions('non-existent');
      expect(queued).toHaveLength(0);
    });
  });

  describe('getClarificationRequests', () => {
    it('should filter clarification requests only', async () => {
      const mockQuestion: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      const mockClarification: UserIntervention = {
        id: 2,
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'clarification_request',
        content: 'Clarify this',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockQuestion);
      mockCreate.mockResolvedValueOnce(mockClarification);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
      });

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'clarification_request',
        content: 'Clarify this',
        directedTo: 'pro_advocate',
      });

      const clarifications = queue.getClarificationRequests('debate-123');

      expect(clarifications).toHaveLength(1);
      expect(clarifications[0].intervention.interventionType).toBe('clarification_request');
      expect(clarifications[0].intervention.id).toBe(2);
    });
  });

  describe('markProcessing', () => {
    it('should update intervention status to processing', async () => {
      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
      });

      await queue.markProcessing(1);

      const intervention = queue.getIntervention(1);
      expect(intervention?.status).toBe(InterventionStatus.PROCESSING);
    });

    it('should handle non-existent intervention gracefully', async () => {
      await expect(queue.markProcessing(999)).resolves.not.toThrow();
    });
  });

  describe('markCompleted', () => {
    it('should update intervention with response', async () => {
      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);
      mockAddResponse.mockResolvedValueOnce(undefined);

      const id = await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
      });

      await queue.markCompleted(id, 'This is the response', 2000);

      const intervention = queue.getIntervention(id);
      expect(intervention?.status).toBe(InterventionStatus.COMPLETED);
      expect(intervention?.intervention.response).toBe('This is the response');
      expect(intervention?.intervention.responseTimestampMs).toBe(2000);

      expect(mockAddResponse).toHaveBeenCalledWith(id, 'This is the response', 2000);
    });
  });

  describe('markFailed', () => {
    it('should mark intervention as failed with error', async () => {
      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);

      const id = await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
      });

      await queue.markFailed(id, 'Agent timeout');

      const intervention = queue.getIntervention(id);
      expect(intervention?.status).toBe(InterventionStatus.FAILED);
      expect(intervention?.error).toBe('Agent timeout');
    });
  });

  describe('getByType', () => {
    it('should filter interventions by type', async () => {
      const mockQuestion: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      const mockEvidence: UserIntervention = {
        id: 2,
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'evidence_injection',
        content: 'Evidence',
        directedTo: null,
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockQuestion);
      mockCreate.mockResolvedValueOnce(mockEvidence);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
      });

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'evidence_injection',
        content: 'Evidence',
      });

      const questions = queue.getByType('debate-123', 'question');
      const evidence = queue.getByType('debate-123', 'evidence_injection');

      expect(questions).toHaveLength(1);
      expect(questions[0].intervention.interventionType).toBe('question');
      expect(evidence).toHaveLength(1);
      expect(evidence[0].intervention.interventionType).toBe('evidence_injection');
    });
  });

  describe('getByDirectedTo', () => {
    it('should filter interventions by target speaker', async () => {
      const mockPro: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question for Pro',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      const mockCon: UserIntervention = {
        id: 2,
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'question',
        content: 'Question for Con',
        directedTo: 'con_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockPro);
      mockCreate.mockResolvedValueOnce(mockCon);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question for Pro',
        directedTo: 'pro_advocate',
      });

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 2000,
        interventionType: 'question',
        content: 'Question for Con',
        directedTo: 'con_advocate',
      });

      const forPro = queue.getByDirectedTo('debate-123', 'pro_advocate');
      const forCon = queue.getByDirectedTo('debate-123', 'con_advocate');

      expect(forPro).toHaveLength(1);
      expect(forPro[0].intervention.directedTo).toBe('pro_advocate');
      expect(forCon).toHaveLength(1);
      expect(forCon[0].intervention.directedTo).toBe('con_advocate');
    });
  });

  describe('clearQueue', () => {
    it('should clear all interventions for a debate', async () => {
      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      mockCreate.mockResolvedValueOnce(mockIntervention);

      await queue.addIntervention({
        debateId: 'debate-123',
        timestampMs: 1000,
        interventionType: 'question',
        content: 'Question',
        directedTo: 'pro_advocate',
      });

      queue.clearQueue('debate-123');

      const interventions = queue.getAllInterventions('debate-123');
      expect(interventions).toHaveLength(0);
    });
  });

  describe('loadFromDatabase', () => {
    it('should load interventions from database into queue', async () => {
      const mockInterventions: UserIntervention[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 1000,
          interventionType: 'question',
          content: 'Question 1',
          directedTo: 'pro_advocate',
          response: null,
          responseTimestampMs: null,
          createdAt: new Date(),
        },
        {
          id: 2,
          debateId: 'debate-123',
          timestampMs: 2000,
          interventionType: 'question',
          content: 'Question 2',
          directedTo: 'con_advocate',
          response: 'Answer 2',
          responseTimestampMs: 3000,
          createdAt: new Date(),
        },
      ];

      mockFindByDebateId.mockResolvedValueOnce(mockInterventions);

      await queue.loadFromDatabase('debate-123');

      const loaded = queue.getAllInterventions('debate-123');
      expect(loaded).toHaveLength(2);
      expect(loaded[0].status).toBe(InterventionStatus.QUEUED); // No response
      expect(loaded[1].status).toBe(InterventionStatus.COMPLETED); // Has response
    });

    it('should handle database errors', async () => {
      mockFindByDebateId.mockRejectedValueOnce(new Error('Database error'));

      await expect(queue.loadFromDatabase('debate-123')).rejects.toThrow('Database error');
    });
  });

  describe('getUnansweredCount', () => {
    it('should return count from repository', async () => {
      mockCountUnanswered.mockResolvedValueOnce(5);

      const count = await queue.getUnansweredCount('debate-123');
      expect(count).toBe(5);
      expect(mockCountUnanswered).toHaveBeenCalledWith('debate-123');
    });
  });
});
