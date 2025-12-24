/**
 * Transcript Recorder Unit Tests
 *
 * Comprehensive test suite for transcript recording and compilation.
 * Target: >90% code coverage
 *
 * Tests cover:
 * - Recording utterances
 * - Recording interventions
 * - Compiling transcripts
 * - Saving transcripts
 * - Loading transcripts
 * - Structured analysis extraction
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranscriptRecorder } from '../src/services/transcript/transcript-recorder.js';
import { SchemaValidator } from '../src/services/validation/schema-validator.js';
import type {
  Debate,
  Utterance,
  UserIntervention,
  CreateUtteranceInput,
  CreateInterventionInput,
} from '../src/types/database.js';

// Mock the repositories
vi.mock('../src/db/repositories/debate-repository.js', () => ({
  findById: vi.fn(),
  saveTranscript: vi.fn(),
}));

vi.mock('../src/db/repositories/utterance-repository.js', () => ({
  create: vi.fn(),
  findByDebateId: vi.fn(),
}));

vi.mock('../src/db/repositories/intervention-repository.js', () => ({
  create: vi.fn(),
  findByDebateId: vi.fn(),
  addResponse: vi.fn(),
}));

import * as debateRepo from '../src/db/repositories/debate-repository.js';
import * as utteranceRepo from '../src/db/repositories/utterance-repository.js';
import * as interventionRepo from '../src/db/repositories/intervention-repository.js';

describe('TranscriptRecorder', () => {
  let recorder: TranscriptRecorder;
  let schemaValidator: SchemaValidator;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create schema validator
    schemaValidator = new SchemaValidator();

    // Create recorder instance
    recorder = new TranscriptRecorder(schemaValidator);
  });

  describe('recordUtterance', () => {
    it('should record a valid utterance successfully', async () => {
      const input: CreateUtteranceInput = {
        debateId: 'debate-123',
        timestampMs: 1000,
        phase: 'opening_statements',
        speaker: 'pro_advocate',
        content: 'This is a test utterance',
        metadata: { model: 'gpt-4' },
      };

      const mockUtterance: Utterance = {
        id: 1,
        debateId: input.debateId,
        timestampMs: input.timestampMs,
        phase: input.phase,
        speaker: input.speaker,
        content: input.content,
        metadata: input.metadata || {},
        createdAt: new Date(),
      };

      vi.mocked(utteranceRepo.create).mockResolvedValue(mockUtterance);

      const result = await recorder.recordUtterance(input);

      expect(result).toEqual(mockUtterance);
      expect(utteranceRepo.create).toHaveBeenCalledWith(input);
      expect(utteranceRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should record utterance even with validation warnings', async () => {
      const input: CreateUtteranceInput = {
        debateId: 'debate-123',
        timestampMs: 1000,
        phase: 'opening_statements',
        speaker: 'pro_advocate',
        content: 'Test',
      };

      const mockUtterance: Utterance = {
        id: 1,
        ...input,
        metadata: {},
        createdAt: new Date(),
      };

      vi.mocked(utteranceRepo.create).mockResolvedValue(mockUtterance);

      const result = await recorder.recordUtterance(input);

      expect(result).toEqual(mockUtterance);
    });

    it('should throw error when database create fails', async () => {
      const input: CreateUtteranceInput = {
        debateId: 'debate-123',
        timestampMs: 1000,
        phase: 'opening_statements',
        speaker: 'pro_advocate',
        content: 'Test',
      };

      vi.mocked(utteranceRepo.create).mockRejectedValue(new Error('Database error'));

      await expect(recorder.recordUtterance(input)).rejects.toThrow(
        'Failed to record utterance'
      );
    });
  });

  describe('recordIntervention', () => {
    it('should record a valid intervention successfully', async () => {
      const input: CreateInterventionInput = {
        debateId: 'debate-123',
        timestampMs: 5000,
        interventionType: 'question',
        content: 'What about X?',
        directedTo: 'pro_advocate',
      };

      const mockIntervention: UserIntervention = {
        id: 1,
        debateId: input.debateId,
        timestampMs: input.timestampMs,
        interventionType: input.interventionType,
        content: input.content,
        directedTo: input.directedTo || null,
        response: null,
        responseTimestampMs: null,
        createdAt: new Date(),
      };

      vi.mocked(interventionRepo.create).mockResolvedValue(mockIntervention);

      const result = await recorder.recordIntervention(input);

      expect(result).toEqual(mockIntervention);
      expect(interventionRepo.create).toHaveBeenCalledWith(input);
    });

    it('should throw error when intervention create fails', async () => {
      const input: CreateInterventionInput = {
        debateId: 'debate-123',
        timestampMs: 5000,
        interventionType: 'question',
        content: 'Test?',
      };

      vi.mocked(interventionRepo.create).mockRejectedValue(
        new Error('Database error')
      );

      await expect(recorder.recordIntervention(input)).rejects.toThrow(
        'Failed to record intervention'
      );
    });
  });

  describe('addInterventionResponse', () => {
    it('should add response to intervention successfully', async () => {
      const mockUpdated: UserIntervention = {
        id: 1,
        debateId: 'debate-123',
        timestampMs: 5000,
        interventionType: 'question',
        content: 'What about X?',
        directedTo: 'pro_advocate',
        response: 'Good question. Here is my answer...',
        responseTimestampMs: 6000,
        createdAt: new Date(),
      };

      vi.mocked(interventionRepo.addResponse).mockResolvedValue(mockUpdated);

      const result = await recorder.addInterventionResponse(
        1,
        'Good question. Here is my answer...',
        6000
      );

      expect(result).toEqual(mockUpdated);
      expect(interventionRepo.addResponse).toHaveBeenCalledWith(
        1,
        'Good question. Here is my answer...',
        6000
      );
    });
  });

  describe('compileTranscript', () => {
    it('should compile a complete transcript successfully', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Should we regulate AI?',
        propositionContext: { domain: 'technology' },
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:30:00Z'),
        totalDurationMs: 1800000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUtterances: Utterance[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 0,
          phase: 'opening_statements',
          speaker: 'pro_advocate',
          content:
            'I believe we should regulate AI because it poses significant risks to society.',
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 2,
          debateId: 'debate-123',
          timestampMs: 1000,
          phase: 'opening_statements',
          speaker: 'con_advocate',
          content: 'I disagree. AI regulation would stifle innovation.',
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 3,
          debateId: 'debate-123',
          timestampMs: 2000,
          phase: 'evidence_presentation',
          speaker: 'pro_advocate',
          content:
            'Assuming AI continues to advance rapidly, we need safeguards.',
          metadata: { confidence_level: 'high' },
          createdAt: new Date(),
        },
        {
          id: 4,
          debateId: 'debate-123',
          timestampMs: 3000,
          phase: 'synthesis',
          speaker: 'moderator',
          content: JSON.stringify({
            areas_of_agreement: [
              { topic: 'AI importance', description: 'Both agree AI is important' },
            ],
            core_disagreements: [
              { topic: 'Regulation', description: 'Different views on regulation' },
            ],
            assumption_conflicts: [],
            evidence_gaps: ['Long-term impact data'],
            decision_hinges: ['Balance innovation vs safety'],
          }),
          metadata: {},
          createdAt: new Date(),
        },
      ];

      const mockInterventions: UserIntervention[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 2500,
          interventionType: 'question',
          content: 'What about startups?',
          directedTo: 'pro_advocate',
          response: 'Good question...',
          responseTimestampMs: 2600,
          createdAt: new Date(),
        },
      ];

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue(mockUtterances);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue(
        mockInterventions
      );

      const transcript = await recorder.compileTranscript('debate-123');

      expect(transcript).toBeDefined();
      expect(transcript.meta.debate_id).toBe('debate-123');
      expect(transcript.meta.schema_version).toBe('2.0.0');
      expect(transcript.meta.status).toBe('completed');
      expect(transcript.proposition.raw_input).toBe('Should we regulate AI?');
      expect(transcript.transcript).toHaveLength(4);
      expect(transcript.user_interventions).toHaveLength(1);
      expect(transcript.structured_analysis).toBeDefined();
      expect(transcript.structured_analysis.pro).toBeDefined();
      expect(transcript.structured_analysis.con).toBeDefined();
      expect(transcript.structured_analysis.moderator).toBeDefined();
    });

    it('should throw error when debate not found', async () => {
      vi.mocked(debateRepo.findById).mockResolvedValue(null);

      await expect(recorder.compileTranscript('nonexistent')).rejects.toThrow(
        'Debate not found'
      );
    });

    it('should throw error when compiled transcript fails validation', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue([]);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue([]);

      // Mock schema validator to fail
      const mockValidator = {
        validateTranscript: vi.fn().mockReturnValue({
          valid: false,
          errors: [{ path: '/test', message: 'Test error' }],
        }),
      } as any;

      const failingRecorder = new TranscriptRecorder(mockValidator);

      await expect(failingRecorder.compileTranscript('debate-123')).rejects.toThrow(
        'Transcript validation failed'
      );
    });
  });

  describe('saveTranscript', () => {
    it('should save transcript successfully', async () => {
      const transcript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'live_theater',
          total_duration_seconds: 1800,
          status: 'completed',
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
        structured_analysis: {
          pro: {
            executive_summary: 'Test',
            arguments: [],
            assumptions: [],
            uncertainties: [],
          },
          con: {
            executive_summary: 'Test',
            arguments: [],
            assumptions: [],
            uncertainties: [],
          },
          moderator: {
            areas_of_agreement: [],
            core_disagreements: [],
            assumption_conflicts: [],
            evidence_gaps: [],
            decision_hinges: [],
          },
        },
        user_interventions: [],
      };

      vi.mocked(debateRepo.saveTranscript).mockResolvedValue({} as any);

      await recorder.saveTranscript('debate-123', transcript);

      expect(debateRepo.saveTranscript).toHaveBeenCalledWith(
        'debate-123',
        transcript
      );
    });

    it('should throw error when save fails', async () => {
      const transcript = {} as any;

      vi.mocked(debateRepo.saveTranscript).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        recorder.saveTranscript('debate-123', transcript)
      ).rejects.toThrow('Failed to save transcript');
    });
  });

  describe('loadTranscript', () => {
    it('should load transcript successfully', async () => {
      const mockTranscript = {
        meta: {
          schema_version: '2.0.0',
          debate_id: 'debate-123',
          generated_at: new Date().toISOString(),
          debate_format: 'live_theater',
          total_duration_seconds: 1800,
          status: 'completed',
        },
        proposition: {
          raw_input: 'Test?',
          normalized_question: 'Test?',
        },
        transcript: [],
        structured_analysis: {} as any,
        user_interventions: [],
      };

      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: mockTranscript as any,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);

      const result = await recorder.loadTranscript('debate-123');

      expect(result).toEqual(mockTranscript);
    });

    it('should return null when debate not found', async () => {
      vi.mocked(debateRepo.findById).mockResolvedValue(null);

      const result = await recorder.loadTranscript('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when transcript not saved', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'live',
        currentPhase: 'opening_statements',
        currentSpeaker: 'pro_advocate',
        startedAt: new Date(),
        completedAt: null,
        totalDurationMs: null,
        transcriptJson: null, // No transcript saved
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);

      const result = await recorder.loadTranscript('debate-123');

      expect(result).toBeNull();
    });

    it('should throw error when load fails', async () => {
      vi.mocked(debateRepo.findById).mockRejectedValue(new Error('Database error'));

      await expect(recorder.loadTranscript('debate-123')).rejects.toThrow(
        'Failed to load transcript'
      );
    });
  });

  describe('structured analysis extraction', () => {
    it('should extract executive summary from opening statement', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUtterances: Utterance[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 0,
          phase: 'opening_statements',
          speaker: 'pro_advocate',
          content:
            'This is a comprehensive opening statement that explains the position in great detail and provides context for the arguments that will follow. It is designed to be longer than 500 characters to test the truncation functionality of the executive summary extraction. We continue with more text here to ensure we definitely exceed the 500 character limit. Additional text is added here to make absolutely certain we have enough content. Even more text is needed to be completely sure we are well over the 500 character threshold for this test case to work properly.',
          metadata: {},
          createdAt: new Date(),
        },
      ];

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue(mockUtterances);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue([]);

      const transcript = await recorder.compileTranscript('debate-123');

      expect(transcript.structured_analysis.pro.executive_summary).toBeDefined();
      expect(transcript.structured_analysis.pro.executive_summary.length).toBeLessThanOrEqual(
        503
      ); // 500 + "..."
    });

    it('should extract assumptions from utterances', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUtterances: Utterance[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 0,
          phase: 'evidence_presentation',
          speaker: 'pro_advocate',
          content:
            'Assuming AI continues to develop at the current pace, we will need regulation.',
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 2,
          debateId: 'debate-123',
          timestampMs: 1000,
          phase: 'evidence_presentation',
          speaker: 'pro_advocate',
          content:
            'Given that companies prioritize profit, oversight is necessary.',
          metadata: {},
          createdAt: new Date(),
        },
      ];

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue(mockUtterances);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue([]);

      const transcript = await recorder.compileTranscript('debate-123');

      expect(transcript.structured_analysis.pro.assumptions).toBeDefined();
      expect(transcript.structured_analysis.pro.assumptions.length).toBeGreaterThan(
        0
      );
    });

    it('should extract uncertainties from low-confidence utterances', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUtterances: Utterance[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 0,
          phase: 'evidence_presentation',
          speaker: 'con_advocate',
          content:
            'The long-term effects are uncertain and may vary significantly.',
          metadata: { confidence_level: 'low' },
          createdAt: new Date(),
        },
        {
          id: 2,
          debateId: 'debate-123',
          timestampMs: 1000,
          phase: 'rebuttals',
          speaker: 'con_advocate',
          content: 'This might not work as expected in all scenarios.',
          metadata: {},
          createdAt: new Date(),
        },
      ];

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue(mockUtterances);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue([]);

      const transcript = await recorder.compileTranscript('debate-123');

      expect(transcript.structured_analysis.con.uncertainties).toBeDefined();
      expect(transcript.structured_analysis.con.uncertainties.length).toBeGreaterThan(
        0
      );
    });

    it('should parse moderator synthesis from JSON', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const synthesisContent = {
        areas_of_agreement: [
          { topic: 'Climate change', description: 'Both agree it exists' },
        ],
        core_disagreements: [
          { topic: 'Solutions', description: 'Different approaches' },
        ],
        assumption_conflicts: [
          { pro_assumes: 'Government action', con_assumes: 'Market solutions' },
        ],
        evidence_gaps: ['Long-term data', 'Economic models'],
        decision_hinges: ['Cost-benefit analysis'],
      };

      const mockUtterances: Utterance[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 0,
          phase: 'synthesis',
          speaker: 'moderator',
          content: JSON.stringify(synthesisContent),
          metadata: {},
          createdAt: new Date(),
        },
      ];

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue(mockUtterances);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue([]);

      const transcript = await recorder.compileTranscript('debate-123');

      expect(transcript.structured_analysis.moderator).toEqual(synthesisContent);
    });

    it('should handle malformed moderator synthesis gracefully', async () => {
      const mockDebate: Debate = {
        id: 'debate-123',
        propositionText: 'Test',
        propositionContext: {},
        status: 'completed',
        currentPhase: 'synthesis',
        currentSpeaker: 'moderator',
        startedAt: new Date(),
        completedAt: new Date(),
        totalDurationMs: 1000,
        transcriptJson: null,
        structuredAnalysisJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUtterances: Utterance[] = [
        {
          id: 1,
          debateId: 'debate-123',
          timestampMs: 0,
          phase: 'synthesis',
          speaker: 'moderator',
          content: 'This is not valid JSON and cannot be parsed',
          metadata: {},
          createdAt: new Date(),
        },
      ];

      vi.mocked(debateRepo.findById).mockResolvedValue(mockDebate);
      vi.mocked(utteranceRepo.findByDebateId).mockResolvedValue(mockUtterances);
      vi.mocked(interventionRepo.findByDebateId).mockResolvedValue([]);

      const transcript = await recorder.compileTranscript('debate-123');

      // Should return empty structure as fallback
      expect(transcript.structured_analysis.moderator).toEqual({
        areas_of_agreement: [],
        core_disagreements: [],
        assumption_conflicts: [],
        evidence_gaps: [],
        decision_hinges: [],
      });
    });
  });
});
