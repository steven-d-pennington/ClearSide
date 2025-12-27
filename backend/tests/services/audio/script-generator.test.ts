/**
 * Script Generator Tests
 *
 * Tests for the audio script generation functionality.
 * Verifies correct conversion of debate transcripts to audio scripts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptGenerator, createScriptGenerator } from '../../../src/services/audio/script-generator.js';
import type { DebateTranscript } from '../../../src/services/transcript/transcript-recorder.js';

/**
 * Create a mock debate transcript for testing
 */
function createMockTranscript(overrides: Partial<DebateTranscript> = {}): DebateTranscript {
  return {
    meta: {
      schema_version: '2.0.0',
      debate_id: 'test-debate-123',
      generated_at: '2025-12-26T12:00:00Z',
      debate_format: 'live_theater',
      total_duration_seconds: 600,
      status: 'completed',
    },
    proposition: {
      raw_input: 'Should AI be regulated?',
      normalized_question: 'Should artificial intelligence development be subject to government regulation?',
      context: 'Discussion about AI policy',
    },
    transcript: [
      {
        id: '1',
        timestamp_ms: 0,
        phase: 'phase_1_opening',
        speaker: 'pro',
        content: 'I believe AI regulation is essential for protecting society from potential harms.',
      },
      {
        id: '2',
        timestamp_ms: 30000,
        phase: 'phase_1_opening',
        speaker: 'con',
        content: 'Regulation would stifle innovation and put us at a competitive disadvantage.',
      },
      {
        id: '3',
        timestamp_ms: 60000,
        phase: 'phase_2_constructive',
        speaker: 'pro',
        content: 'Studies show that unregulated AI can perpetuate bias and cause harm to vulnerable populations.',
      },
      {
        id: '4',
        timestamp_ms: 90000,
        phase: 'phase_2_constructive',
        speaker: 'con',
        content: 'The market can self-regulate through industry standards and consumer pressure.',
      },
      {
        id: '5',
        timestamp_ms: 120000,
        phase: 'phase_6_synthesis',
        speaker: 'moderator',
        content: 'Both sides agree that some form of oversight is needed, but disagree on the mechanism.',
      },
    ],
    structured_analysis: {
      pro: {
        executive_summary: 'AI regulation is essential for public safety.',
        arguments: [
          {
            content: 'AI can cause significant harm without oversight.',
            category: 'safety',
            evidence_type: 'empirical',
            confidence_level: 'high',
          },
        ],
        assumptions: ['Government can effectively regulate technology'],
        uncertainties: ['Unknown long-term effects of regulation'],
      },
      con: {
        executive_summary: 'Regulation would harm innovation.',
        arguments: [
          {
            content: 'Heavy regulation stifles technological progress.',
            category: 'economic',
            evidence_type: 'historical',
            confidence_level: 'medium',
          },
        ],
        assumptions: ['Markets can self-regulate effectively'],
        uncertainties: ['Unclear if self-regulation is sufficient'],
      },
      moderator: {
        areas_of_agreement: [
          { topic: 'Oversight need', description: 'Both agree some oversight is beneficial' },
        ],
        core_disagreements: [
          { topic: 'Mechanism', description: 'Government vs market-based regulation' },
        ],
        assumption_conflicts: [
          { pro_assumes: 'Government is capable', con_assumes: 'Markets are efficient' },
        ],
        evidence_gaps: ['Long-term impact data missing'],
        decision_hinges: ['Trust in government vs market'],
      },
    },
    user_interventions: [],
    ...overrides,
  };
}

describe('ScriptGenerator', () => {
  let generator: ScriptGenerator;

  beforeEach(() => {
    generator = createScriptGenerator();
  });

  describe('generate', () => {
    it('should create an audio script from a debate transcript', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      expect(script).toBeDefined();
      expect(script.segments).toBeInstanceOf(Array);
      expect(script.segments.length).toBeGreaterThan(0);
      expect(script.totalDuration).toBeGreaterThan(0);
      expect(script.chapters).toBeInstanceOf(Array);
      expect(script.metadata.debateId).toBe('test-debate-123');
    });

    it('should include intro and outro by default', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      const intro = script.segments[0];
      const outro = script.segments[script.segments.length - 1];

      expect(intro?.metadata.phase).toBe('intro');
      expect(outro?.metadata.phase).toBe('outro');
    });

    it('should skip intro/outro when disabled', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript, { includeIntroOutro: false });

      const hasIntro = script.segments.some((s) => s.metadata.phase === 'intro');
      const hasOutro = script.segments.some((s) => s.metadata.phase === 'outro');

      expect(hasIntro).toBe(false);
      expect(hasOutro).toBe(false);
    });

    it('should map speakers to correct voice types', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      const proSegments = script.segments.filter((s) => s.voiceType === 'pro');
      const conSegments = script.segments.filter((s) => s.voiceType === 'con');
      const moderatorSegments = script.segments.filter((s) => s.voiceType === 'moderator');

      expect(proSegments.length).toBeGreaterThan(0);
      expect(conSegments.length).toBeGreaterThan(0);
      expect(moderatorSegments.length).toBeGreaterThan(0);
    });

    it('should generate chapter markers for each phase', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      expect(script.chapters.length).toBeGreaterThan(0);

      const chapterPhases = script.chapters.map((c) => c.phase);
      expect(chapterPhases).toContain('phase_1_opening');
    });

    it('should calculate estimated duration for segments', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      for (const segment of script.segments) {
        expect(segment.metadata.estimatedDuration).toBeGreaterThan(0);
      }
    });

    it('should generate SSML for each segment', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      for (const segment of script.segments) {
        expect(segment.ssml).toBeDefined();
        expect(segment.ssml).toContain('<speak>');
        expect(segment.ssml).toContain('</speak>');
      }
    });
  });

  describe('text cleaning', () => {
    it('should clean markdown formatting from text', () => {
      const transcript = createMockTranscript({
        transcript: [
          {
            id: '1',
            timestamp_ms: 0,
            phase: 'phase_1_opening',
            speaker: 'pro',
            content: '**Bold** and *italic* and `code` text',
          },
        ],
      });

      const script = generator.generate(transcript);
      const contentSegment = script.segments.find((s) => s.metadata.phase === 'phase_1_opening');

      expect(contentSegment?.text).not.toContain('**');
      expect(contentSegment?.text).not.toContain('*');
      expect(contentSegment?.text).not.toContain('`');
    });
  });

  describe('fallback to structured analysis', () => {
    it('should use structured analysis when transcript is empty', () => {
      const transcript = createMockTranscript({
        transcript: [],
      });

      const script = generator.generate(transcript);

      // Should still have segments from structured analysis
      expect(script.segments.length).toBeGreaterThan(2); // At least intro + outro + some content
    });
  });

  describe('metadata', () => {
    it('should include debate metadata in script', () => {
      const transcript = createMockTranscript();
      const script = generator.generate(transcript);

      expect(script.metadata.debateId).toBe('test-debate-123');
      expect(script.metadata.proposition).toBe(
        'Should artificial intelligence development be subject to government regulation?'
      );
      expect(script.metadata.generatedAt).toBeDefined();
    });
  });
});

describe('createScriptGenerator', () => {
  it('should create a ScriptGenerator instance', () => {
    const generator = createScriptGenerator();
    expect(generator).toBeInstanceOf(ScriptGenerator);
  });

  it('should accept custom options', () => {
    const generator = createScriptGenerator({
      pauseBetweenSegments: 1000,
      pauseBetweenPhases: 2000,
    });
    expect(generator).toBeInstanceOf(ScriptGenerator);
  });
});
