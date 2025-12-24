/**
 * Debate Orchestrator Integration Tests
 *
 * Comprehensive tests for the debate orchestrator covering:
 * - Complete debate flow execution
 * - Phase transitions
 * - Turn execution
 * - Pause/resume functionality
 * - Intervention handling
 * - Error recovery with retry
 * - Transcript generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueryResult } from 'pg';
import type { Response } from 'express';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock the database connection
vi.mock('../src/db/connection.js', () => ({
  pool: {
    query: mockQuery,
  },
}));

// Import after mocking
import { DebateOrchestrator } from '../src/services/debate/debate-orchestrator.js';
import { DebateStateMachine } from '../src/services/debate/state-machine.js';
import { TurnManager } from '../src/services/debate/turn-manager.js';
import { SSEManager } from '../src/services/sse/sse-manager.js';
import { schemaValidator } from '../src/services/validation/schema-validator.js';
import {
  mockAgentFactory,
  MockProAdvocate,
  MockConAdvocate,
  MockModerator,
  MockOrchestrator,
} from '../src/services/agents/mock-agents.js';
import { DebatePhase, Speaker } from '../src/types/debate.js';
import type { DebateRow, UtteranceRow, UserInterventionRow } from '../src/types/database.js';

describe('DebateOrchestrator', () => {
  const mockDebateId = 'orchestrator-test-123';
  const mockProposition = 'AI data centers should be subject to a moratorium';

  let orchestrator: DebateOrchestrator;
  let stateMachine: DebateStateMachine;
  let turnManager: TurnManager;
  let sseManager: SSEManager;
  let agents: {
    pro: MockProAdvocate;
    con: MockConAdvocate;
    moderator: MockModerator;
    orchestrator: MockOrchestrator;
  };

  // Helper to create a mock debate row
  const createMockDebateRow = (overrides: Partial<DebateRow> = {}): DebateRow => ({
    id: mockDebateId,
    proposition_text: mockProposition,
    proposition_context: {},
    status: 'initializing',
    current_phase: 'opening_statements',
    current_speaker: 'moderator',
    started_at: null,
    completed_at: null,
    total_duration_ms: null,
    transcript_json: null,
    structured_analysis_json: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  // Helper to create a mock utterance row
  const createMockUtteranceRow = (
    id: number,
    speaker: string,
    content: string
  ): UtteranceRow => ({
    id,
    debate_id: mockDebateId,
    timestamp_ms: 1000 * id,
    phase: 'opening_statements',
    speaker: speaker as UtteranceRow['speaker'],
    content,
    metadata: {},
    created_at: new Date(),
  });

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create agents
    agents = {
      pro: mockAgentFactory.createProAdvocate() as MockProAdvocate,
      con: mockAgentFactory.createConAdvocate() as MockConAdvocate,
      moderator: mockAgentFactory.createModerator() as MockModerator,
      orchestrator: mockAgentFactory.createOrchestrator() as MockOrchestrator,
    };

    // Create state machine
    stateMachine = new DebateStateMachine(mockDebateId);

    // Create turn manager
    turnManager = new TurnManager();

    // Create SSE manager
    sseManager = new SSEManager();

    // Create orchestrator
    orchestrator = new DebateOrchestrator(
      mockDebateId,
      stateMachine,
      turnManager,
      sseManager,
      schemaValidator,
      agents,
      {
        maxRetries: 3,
        retryDelayMs: 100,
        agentTimeoutMs: 5000,
        validateUtterances: true,
        broadcastEvents: false, // Disable for testing
        autoSaveTranscript: false,
      }
    );

    // Setup default mock responses
    mockQuery.mockResolvedValue({
      rows: [createMockDebateRow()],
      rowCount: 1,
    } as QueryResult);
  });

  afterEach(() => {
    // Cleanup SSE manager
    sseManager.shutdown();
  });

  describe('Proposition Normalization', () => {
    it('should normalize a raw proposition', async () => {
      const rawInput = 'Should we ban AI data centers';

      const normalized = await orchestrator.normalizeProposition(rawInput);

      expect(normalized).toBeDefined();
      expect(normalized.normalized_question).toBeDefined();
      expect(normalized.context).toBeDefined();
      expect(normalized.confidence).toBeGreaterThan(0);
    });

    it('should reject invalid propositions', async () => {
      const rawInput = ''; // Too short

      await expect(orchestrator.normalizeProposition(rawInput)).rejects.toThrow(
        'Invalid proposition'
      );
    });

    it('should include proposition context', async () => {
      const rawInput = 'Test proposition';
      const context = { background: 'Test background' };

      const normalized = await orchestrator.normalizeProposition(rawInput, context);

      expect(normalized.context.background).toBe('Test background');
    });
  });

  describe('Turn Execution', () => {
    it('should execute a single turn successfully', async () => {
      // Mock utterance creation
      let utteranceId = 1;
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO utterances')) {
          return Promise.resolve({
            rows: [createMockUtteranceRow(utteranceId++, 'moderator', 'Test utterance')],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({
            rows: [],
            rowCount: 0,
          } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const turn = {
        turnNumber: 1,
        speaker: Speaker.MODERATOR,
        promptType: 'introduction',
      };

      await orchestrator['executeTurn'](turn, mockProposition);

      // Verify utterance was created
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO utterances'),
        expect.any(Array)
      );
    });

    it('should build agent context correctly', async () => {
      // Mock utterances
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({
            rows: [
              createMockUtteranceRow(1, 'moderator', 'Introduction'),
              createMockUtteranceRow(2, 'pro_advocate', 'Pro opening'),
            ],
            rowCount: 2,
          } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const context = await orchestrator['buildAgentContext'](
        Speaker.PRO,
        mockProposition
      );

      expect(context.debateId).toBe(mockDebateId);
      expect(context.speaker).toBe(Speaker.PRO);
      expect(context.proposition).toBe(mockProposition);
      expect(context.previousUtterances).toHaveLength(2);
    });
  });

  describe('Agent Routing', () => {
    it('should route to Pro Advocate correctly', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const context = await orchestrator['buildAgentContext'](
        Speaker.PRO,
        mockProposition
      );

      const response = await orchestrator['callProAdvocate']('opening_statement', context);

      expect(response).toContain('[Pro Advocate - Opening Statement]');
    });

    it('should route to Con Advocate correctly', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const context = await orchestrator['buildAgentContext'](
        Speaker.CON,
        mockProposition
      );

      const response = await orchestrator['callConAdvocate']('opening_statement', context);

      expect(response).toContain('[Con Advocate - Opening Statement]');
    });

    it('should route to Moderator correctly', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const context = await orchestrator['buildAgentContext'](
        Speaker.MODERATOR,
        mockProposition
      );

      const response = await orchestrator['callModerator']('introduction', context);

      expect(response).toContain('[Moderator - Introduction]');
    });
  });

  describe('Error Handling and Retry', () => {
    it('should retry on agent failure', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const context = await orchestrator['buildAgentContext'](
        Speaker.PRO,
        mockProposition
      );

      // Spy on the internal call
      const spy = vi.spyOn(orchestrator as any, 'callAgentInternal');
      
      // First call fails, second succeeds
      spy.mockRejectedValueOnce(new Error('Agent failed'));
      spy.mockResolvedValueOnce('Success!');

      const result = await orchestrator['callAgent'](
        Speaker.PRO,
        'opening_statement',
        mockProposition,
        context
      );

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result).toBe('Success!');

      spy.mockRestore();
    });

    it('should throw after max retries', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      const context = await orchestrator['buildAgentContext'](
        Speaker.PRO,
        mockProposition
      );

      // Spy on the internal call
      const spy = vi.spyOn(orchestrator as any, 'callAgentInternal');
      spy.mockRejectedValue(new Error('Agent always fails'));

      await expect(
        orchestrator['callAgent'](
          Speaker.PRO,
          'opening_statement',
          mockProposition,
          context
        )
      ).rejects.toThrow('Agent call failed');

      expect(spy).toHaveBeenCalledTimes(3); // maxRetries = 3

      spy.mockRestore();
    });
  });

  describe('Pause and Resume', () => {
    it('should pause the debate', async () => {
      // Mock database update
      mockQuery.mockResolvedValue({
        rows: [createMockDebateRow({ status: 'paused' })],
        rowCount: 1,
      } as QueryResult);

      await orchestrator.pause();

      expect(orchestrator['isPausedFlag']).toBe(true);
    });

    it('should resume the debate', async () => {
      // First pause
      mockQuery.mockResolvedValue({
        rows: [createMockDebateRow({ status: 'paused' })],
        rowCount: 1,
      } as QueryResult);
      
      await orchestrator.pause();

      // Then resume
      mockQuery.mockResolvedValue({
        rows: [createMockDebateRow({ status: 'live' })],
        rowCount: 1,
      } as QueryResult);

      await orchestrator.resume();

      expect(orchestrator['isPausedFlag']).toBe(false);
    });
  });

  describe('Transcript Generation', () => {
    it('should build final transcript', async () => {
      // Mock debate data
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM debates')) {
          return Promise.resolve({
            rows: [
              createMockDebateRow({
                started_at: new Date('2025-01-01T00:00:00Z'),
                completed_at: new Date('2025-01-01T00:30:00Z'),
              }),
            ],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({
            rows: [
              createMockUtteranceRow(1, 'moderator', 'Introduction'),
              createMockUtteranceRow(2, 'pro_advocate', 'Pro opening'),
              createMockUtteranceRow(3, 'con_advocate', 'Con opening'),
            ],
            rowCount: 3,
          } as QueryResult);
        }
        if (query.includes('SELECT * FROM user_interventions')) {
          return Promise.resolve({
            rows: [],
            rowCount: 0,
          } as QueryResult);
        }
        return Promise.resolve({
          rows: [],
          rowCount: 0,
        } as QueryResult);
      });

      const transcript = await orchestrator['buildFinalTranscript']();

      expect(transcript.meta.debate_id).toBe(mockDebateId);
      expect(transcript.meta.proposition).toBe(mockProposition);
      expect(transcript.meta.schema_version).toBe('2.0.0');
      expect(transcript.utterances).toHaveLength(3);
      expect(transcript.interventions).toHaveLength(0);
      expect(transcript.phases).toBeDefined();
    });

    it('should include agent metadata in transcript', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('SELECT * FROM debates')) {
          return Promise.resolve({
            rows: [createMockDebateRow()],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        if (query.includes('SELECT * FROM user_interventions')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
      });

      const transcript = await orchestrator['buildFinalTranscript']();

      expect(transcript.meta.agents.pro_advocate.name).toBe('MockProAdvocate');
      expect(transcript.meta.agents.con_advocate.name).toBe('MockConAdvocate');
      expect(transcript.meta.agents.moderator.name).toBe('MockModerator');
    });
  });

  describe('Intervention Handling', () => {
    it('should handle user intervention', async () => {
      let interventionId = 1;
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO user_interventions')) {
          const mockIntervention: UserInterventionRow = {
            id: interventionId++,
            debate_id: mockDebateId,
            timestamp_ms: 5000,
            intervention_type: 'question',
            content: 'Test question',
            directed_to: 'moderator',
            response: null,
            response_timestamp_ms: null,
            created_at: new Date(),
          };
          return Promise.resolve({
            rows: [mockIntervention],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('UPDATE user_interventions')) {
          const mockIntervention: UserInterventionRow = {
            id: 1,
            debate_id: mockDebateId,
            timestamp_ms: 5000,
            intervention_type: 'question',
            content: 'Test question',
            directed_to: 'moderator',
            response: '[Moderator - Intervention Response]',
            response_timestamp_ms: 6000,
            created_at: new Date(),
          };
          return Promise.resolve({
            rows: [mockIntervention],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      await orchestrator.handleIntervention({
        debateId: mockDebateId,
        timestampMs: 5000,
        interventionType: 'question',
        content: 'Test question',
        directedTo: Speaker.MODERATOR,
        response: null,
        responseTimestampMs: null,
      });

      // Verify intervention was created and responded to
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_interventions'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_interventions'),
        expect.any(Array)
      );
    });

    it('should pause on pause_request intervention', async () => {
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO user_interventions')) {
          return Promise.resolve({
            rows: [
              {
                id: 1,
                debate_id: mockDebateId,
                timestamp_ms: 5000,
                intervention_type: 'pause_request',
                content: 'Pause please',
                directed_to: null,
                response: null,
                response_timestamp_ms: null,
                created_at: new Date(),
              },
            ],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('UPDATE')) {
          return Promise.resolve({
            rows: [createMockDebateRow({ status: 'paused' })],
            rowCount: 1,
          } as QueryResult);
        }
        if (query.includes('SELECT * FROM utterances')) {
          return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
        }
        return Promise.resolve({
          rows: [createMockDebateRow()],
          rowCount: 1,
        } as QueryResult);
      });

      await orchestrator.handleIntervention({
        debateId: mockDebateId,
        timestampMs: 5000,
        interventionType: 'pause_request',
        content: 'Pause please',
        directedTo: null,
        response: null,
        responseTimestampMs: null,
      });

      expect(orchestrator['isPausedFlag']).toBe(true);
    });
  });

  describe('Recording Utterances', () => {
    it('should validate utterances before persisting', async () => {
      let utteranceId = 1;
      mockQuery.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO utterances')) {
          return Promise.resolve({
            rows: [createMockUtteranceRow(utteranceId++, 'moderator', 'Test')],
            rowCount: 1,
          } as QueryResult);
        }
        return Promise.resolve({ rows: [], rowCount: 0 } as QueryResult);
      });

      await orchestrator['recordUtterance']({
        debateId: mockDebateId,
        timestampMs: 1000,
        phase: DebatePhase.PHASE_1_OPENING,
        speaker: Speaker.MODERATOR,
        content: 'Test utterance',
        metadata: {},
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO utterances'),
        expect.any(Array)
      );
    });
  });
});
