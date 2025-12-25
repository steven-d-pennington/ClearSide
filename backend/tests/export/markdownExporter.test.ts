/**
 * Tests for Markdown Exporter
 *
 * Validates that debate transcripts are correctly converted to Markdown format
 * with proper formatting, section inclusion/exclusion, and metadata.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownExporter, createMarkdownExporter } from '../../src/services/export/markdownExporter.js';
import type { DebateTranscript } from '../../src/services/transcript/transcript-recorder.js';
import type { MarkdownExportOptions } from '../../src/services/export/types.js';

describe('MarkdownExporter', () => {
  let exporter: MarkdownExporter;
  let mockTranscript: DebateTranscript;

  beforeEach(() => {
    exporter = createMarkdownExporter();

    // Create a comprehensive mock transcript
    mockTranscript = {
      meta: {
        schema_version: '2.0.0',
        debate_id: 'test-debate-123',
        generated_at: '2025-12-25T10:00:00.000Z',
        debate_format: 'live_theater',
        total_duration_seconds: 1800,
        status: 'completed',
      },
      proposition: {
        raw_input: 'Should we ban AI data centers?',
        normalized_question: 'Should AI data centers be subject to a moratorium?',
        context: 'Discussing environmental and economic impacts',
      },
      transcript: [
        {
          id: '1',
          timestamp_ms: 0,
          phase: 'phase_1_opening',
          speaker: 'pro',
          content: 'AI data centers consume massive amounts of energy and water.',
          metadata: {},
        },
        {
          id: '2',
          timestamp_ms: 30000,
          phase: 'phase_1_opening',
          speaker: 'con',
          content: 'AI data centers drive innovation and economic growth.',
          metadata: {},
        },
        {
          id: '3',
          timestamp_ms: 120000,
          phase: 'phase_2_constructive',
          speaker: 'pro',
          content: 'Data centers use as much energy as entire cities.',
          metadata: {
            argument_category: 'environmental',
            evidence_type: 'statistical',
            confidence_level: 'high',
          },
        },
      ],
      structured_analysis: {
        pro: {
          executive_summary:
            'AI data centers pose significant environmental risks due to their massive energy consumption and resource usage.',
          arguments: [
            {
              content:
                'Data centers consume enormous amounts of electricity, contributing to carbon emissions.',
              category: 'environmental',
              evidence_type: 'statistical',
              confidence_level: 'high',
            },
            {
              content:
                'Water usage for cooling is unsustainable in drought-prone regions.',
              category: 'environmental',
              evidence_type: 'factual',
              confidence_level: 'medium',
            },
          ],
          assumptions: [
            'Current energy grid relies heavily on fossil fuels',
            'Renewable energy scaling cannot keep pace with AI growth',
          ],
          uncertainties: [
            'Future efficiency improvements in cooling technology are uncertain',
            'The rate of renewable energy adoption is unclear',
          ],
        },
        con: {
          executive_summary:
            'AI data centers are essential for economic growth and technological progress, with improving efficiency.',
          arguments: [
            {
              content:
                'Data centers create high-paying jobs and attract investment.',
              category: 'economic',
              evidence_type: 'statistical',
              confidence_level: 'high',
            },
            {
              content: 'Modern data centers are increasingly energy-efficient.',
              category: 'technological',
              evidence_type: 'trend',
              confidence_level: 'medium',
            },
          ],
          assumptions: [
            'Economic growth outweighs environmental concerns',
            'Technology will solve environmental challenges',
          ],
          uncertainties: [
            'The long-term economic benefits are not fully quantified',
            'Public sentiment on AI may shift dramatically',
          ],
        },
        moderator: {
          areas_of_agreement: [
            {
              topic: 'Energy consumption is significant',
              description:
                'Both sides agree that current data centers use substantial energy.',
            },
            {
              topic: 'Innovation is valuable',
              description: 'Both acknowledge the importance of technological progress.',
            },
          ],
          core_disagreements: [
            {
              topic: 'Priority of environmental vs economic concerns',
              description:
                'Pro prioritizes environmental sustainability; Con prioritizes economic growth.',
            },
            {
              topic: 'Feasibility of technological solutions',
              description:
                'Pro is skeptical; Con is optimistic about efficiency improvements.',
            },
          ],
          assumption_conflicts: [
            {
              pro_assumes: 'Environmental damage is irreversible',
              con_assumes: 'Technology will mitigate environmental impacts',
            },
          ],
          evidence_gaps: [
            'Long-term environmental impact data',
            'Comprehensive cost-benefit analysis',
            'Regional variation in impacts',
          ],
          decision_hinges: [
            'Whether environmental concerns outweigh economic benefits',
            'The feasibility and timeline of renewable energy scaling',
            'The rate of efficiency improvements in data center technology',
          ],
        },
      },
      user_interventions: [
        {
          id: '101',
          timestamp_ms: 60000,
          phase: 'phase_1_opening',
          type: 'question',
          content: 'What about renewable energy for data centers?',
          metadata: {
            directed_to: 'con',
            response: 'Many data centers are transitioning to renewable energy sources.',
            response_timestamp_ms: 65000,
          },
        },
        {
          id: '102',
          timestamp_ms: 180000,
          phase: 'phase_2_constructive',
          type: 'challenge',
          content: 'Can you provide specific data on water usage?',
          metadata: {
            directed_to: 'pro',
            response: 'Studies show data centers use billions of gallons annually.',
            response_timestamp_ms: 185000,
          },
        },
      ],
    };
  });

  describe('createMarkdownExporter', () => {
    it('should create a MarkdownExporter instance', () => {
      expect(exporter).toBeInstanceOf(MarkdownExporter);
    });
  });

  describe('export', () => {
    it('should successfully export a complete transcript', () => {
      const result = exporter.export(mockTranscript);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should include all sections by default', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('# Debate Analysis');
      expect(result.content).toContain('## Proposition');
      expect(result.content).toContain('## Arguments FOR');
      expect(result.content).toContain('## Arguments AGAINST');
      expect(result.content).toContain('## Moderator Synthesis');
    });

    it('should exclude sections based on options', () => {
      const options: MarkdownExportOptions = {
        includePro: false,
        includeCon: false,
        includeModerator: false,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).not.toContain('## Arguments FOR');
      expect(result.content).not.toContain('## Arguments AGAINST');
      expect(result.content).not.toContain('## Moderator Synthesis');
    });

    it('should include metadata when requested', () => {
      const options: MarkdownExportOptions = {
        includeMetadata: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('**Generated:**');
      expect(result.content).toContain('**Debate ID:** test-debate-123');
      expect(result.content).toContain('**Duration:**');
      expect(result.content).toContain('**Status:** completed');
    });

    it('should exclude metadata when not requested', () => {
      const options: MarkdownExportOptions = {
        includeMetadata: false,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).not.toContain('**Debate ID:**');
    });

    it('should include challenges when requested', () => {
      const options: MarkdownExportOptions = {
        includeChallenges: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('## User Interventions');
      expect(result.content).toContain('What about renewable energy for data centers?');
      expect(result.content).toContain('Can you provide specific data on water usage?');
    });

    it('should include full transcript when requested', () => {
      const options: MarkdownExportOptions = {
        includeTranscript: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('## Full Transcript');
      expect(result.content).toContain('### Opening Statements');
      expect(result.content).toContain('AI data centers consume massive amounts of energy');
    });

    it('should generate proper metadata in result', () => {
      const result = exporter.export(mockTranscript);

      expect(result.metadata.debateId).toBe('test-debate-123');
      expect(result.metadata.format).toBe('markdown');
      expect(result.metadata.exporterVersion).toBe('1.0.0');
      expect(result.metadata.schemaVersion).toBe('2.0.0');
      expect(result.metadata.fileSizeBytes).toBeGreaterThan(0);
      expect(result.metadata.fileName).toContain('.md');
    });

    it('should generate valid filename', () => {
      const result = exporter.export(mockTranscript);

      expect(result.metadata.fileName).toMatch(/^debate-.+-.+\.md$/);
      expect(result.metadata.fileName).toContain('ai-data-centers');
    });

    it('should use section separators', () => {
      const result = exporter.export(mockTranscript);

      // Should have horizontal rules between sections
      expect(result.content).toContain('\n---\n');
    });
  });

  describe('formatProposition', () => {
    it('should format proposition with normalized question', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('**Question:** Should AI data centers be subject to a moratorium?');
    });

    it('should include context when present', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('**Context:** Discussing environmental and economic impacts');
    });

    it('should include original input when different from normalized', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('**Original Input:** Should we ban AI data centers?');
    });
  });

  describe('formatProSection', () => {
    it('should format Pro section with executive summary', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('## Arguments FOR');
      expect(result.content).toContain(
        '*AI data centers pose significant environmental risks'
      );
    });

    it('should include arguments with metadata', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('**Category:** Environmental');
      expect(result.content).toContain('**Evidence Type:** Statistical');
      expect(result.content).toContain('**Confidence:** 🟢 High');
    });

    it('should include assumptions section', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Underlying Assumptions');
      expect(result.content).toContain('Current energy grid relies heavily on fossil fuels');
    });

    it('should include uncertainties section', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Key Uncertainties');
      expect(result.content).toContain('Future efficiency improvements in cooling technology');
    });
  });

  describe('formatConSection', () => {
    it('should format Con section with correct header', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('## Arguments AGAINST');
    });

    it('should include Con arguments', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('Data centers create high-paying jobs');
    });
  });

  describe('formatModeratorSection', () => {
    it('should format moderator synthesis header', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('## Moderator Synthesis');
    });

    it('should include areas of agreement', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Areas of Agreement');
      expect(result.content).toContain('Energy consumption is significant');
    });

    it('should include core disagreements', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Core Disagreements');
      expect(result.content).toContain('Priority of environmental vs economic concerns');
    });

    it('should include assumption conflicts', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Conflicting Assumptions');
      expect(result.content).toContain('Environmental damage is irreversible');
    });

    it('should include evidence gaps', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Evidence Gaps');
      expect(result.content).toContain('Long-term environmental impact data');
    });

    it('should include decision hinges', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('### Key Decision Points');
      expect(result.content).toContain('Whether environmental concerns outweigh economic benefits');
    });
  });

  describe('formatInterventions', () => {
    it('should format user interventions with timestamps', () => {
      const options: MarkdownExportOptions = {
        includeChallenges: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('### 1. Question (01:00)');
      expect(result.content).toContain('What about renewable energy for data centers?');
    });

    it('should include directed_to information', () => {
      const options: MarkdownExportOptions = {
        includeChallenges: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('**Directed to:** Con Advocate');
    });

    it('should include responses when present', () => {
      const options: MarkdownExportOptions = {
        includeChallenges: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('**Response** (01:05):');
      expect(result.content).toContain('Many data centers are transitioning to renewable energy');
    });
  });

  describe('formatTranscript', () => {
    it('should format full transcript chronologically', () => {
      const options: MarkdownExportOptions = {
        includeTranscript: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('## Full Transcript');
      expect(result.content).toContain('### Opening Statements');
      expect(result.content).toContain('**[00:00] Pro Advocate:**');
      expect(result.content).toContain('**[00:30] Con Advocate:**');
    });

    it('should group by phase', () => {
      const options: MarkdownExportOptions = {
        includeTranscript: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('### Opening Statements');
      expect(result.content).toContain('### Evidence Presentation');
    });
  });

  describe('formatting helpers', () => {
    it('should format duration correctly', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('**Duration:** 30m 0s');
    });

    it('should format timestamps correctly', () => {
      const options: MarkdownExportOptions = {
        includeTranscript: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('[00:00]');
      expect(result.content).toContain('[00:30]');
      expect(result.content).toContain('[02:00]');
    });

    it('should format speaker names correctly', () => {
      const options: MarkdownExportOptions = {
        includeTranscript: true,
      };

      const result = exporter.export(mockTranscript, options);

      expect(result.content).toContain('Pro Advocate');
      expect(result.content).toContain('Con Advocate');
    });

    it('should format confidence levels with emojis', () => {
      const result = exporter.export(mockTranscript);

      expect(result.content).toContain('🟢 High');
      expect(result.content).toContain('🟡 Medium');
    });
  });

  describe('error handling', () => {
    it('should handle missing structured_analysis gracefully', () => {
      const minimalTranscript: DebateTranscript = {
        ...mockTranscript,
        structured_analysis: {
          pro: {
            executive_summary: '',
            arguments: [],
            assumptions: [],
            uncertainties: [],
          },
          con: {
            executive_summary: '',
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
      };

      const result = exporter.export(minimalTranscript);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should handle empty interventions array', () => {
      const noInterventionsTranscript: DebateTranscript = {
        ...mockTranscript,
        user_interventions: [],
      };

      const options: MarkdownExportOptions = {
        includeChallenges: true,
      };

      const result = exporter.export(noInterventionsTranscript, options);

      expect(result.success).toBe(true);
      expect(result.content).not.toContain('## User Interventions');
    });

    it('should handle empty transcript array', () => {
      const noUtterancesTranscript: DebateTranscript = {
        ...mockTranscript,
        transcript: [],
      };

      const options: MarkdownExportOptions = {
        includeTranscript: true,
      };

      const result = exporter.export(noUtterancesTranscript, options);

      expect(result.success).toBe(true);
      expect(result.content).not.toContain('## Full Transcript');
    });
  });

  describe('file size calculation', () => {
    it('should calculate file size in bytes', () => {
      const result = exporter.export(mockTranscript);

      expect(result.metadata.fileSizeBytes).toBeGreaterThan(0);
      expect(typeof result.metadata.fileSizeBytes).toBe('number');
    });

    it('should match actual content length', () => {
      const result = exporter.export(mockTranscript);

      const actualSize = Buffer.byteLength(result.content || '', 'utf8');
      expect(result.metadata.fileSizeBytes).toBe(actualSize);
    });
  });
});
