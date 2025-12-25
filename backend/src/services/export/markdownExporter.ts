/**
 * Markdown Export Service
 *
 * Converts debate transcripts into clean, readable Markdown format.
 * Supports customizable sections and formatting options.
 *
 * @see tasks/phase2/text-export/EXPORT-001.md
 */

import pino from 'pino';
import type {
  DebateTranscript,
  TranscriptUtterance,
  TranscriptIntervention,
  SideAnalysis,
  ModeratorSynthesis,
} from '../transcript/transcript-recorder.js';
import type {
  MarkdownExportOptions,
  ExportResult,
  ExportMetadata,
} from './types.js';
import { DEFAULT_MARKDOWN_OPTIONS } from './types.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'markdown-exporter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Current version of the Markdown exporter
 */
const EXPORTER_VERSION = '1.0.0';

/**
 * Markdown Exporter Class
 *
 * Converts debate transcripts to Markdown format with customizable options
 */
export class MarkdownExporter {
  /**
   * Export a debate transcript to Markdown format
   *
   * @param transcript - Complete debate transcript
   * @param options - Export options (which sections to include, formatting)
   * @returns Export result with Markdown content
   */
  export(
    transcript: DebateTranscript,
    options: MarkdownExportOptions = {}
  ): ExportResult {
    logger.info(
      { debateId: transcript.meta.debate_id, options },
      'Starting Markdown export'
    );

    try {
      // Merge with defaults
      const opts = { ...DEFAULT_MARKDOWN_OPTIONS, ...options };

      // Build sections
      const sections: string[] = [];

      // Metadata header
      if (opts.includeMetadata) {
        sections.push(this.formatMetadata(transcript));
      }

      // Proposition
      if (opts.includeProposition) {
        sections.push(this.formatProposition(transcript));
      }

      // Pro arguments
      if (opts.includePro && transcript.structured_analysis?.pro) {
        sections.push(this.formatProSection(transcript.structured_analysis.pro));
      }

      // Con arguments
      if (opts.includeCon && transcript.structured_analysis?.con) {
        sections.push(this.formatConSection(transcript.structured_analysis.con));
      }

      // Moderator synthesis
      if (opts.includeModerator && transcript.structured_analysis?.moderator) {
        sections.push(
          this.formatModeratorSection(transcript.structured_analysis.moderator)
        );
      }

      // User interventions
      if (opts.includeChallenges && transcript.user_interventions?.length > 0) {
        sections.push(this.formatInterventions(transcript.user_interventions));
      }

      // Full transcript
      if (opts.includeTranscript && transcript.transcript?.length > 0) {
        sections.push(this.formatTranscript(transcript.transcript));
      }

      // Join sections with horizontal rules
      const content = sections.join('\n\n---\n\n');

      // Build metadata
      const metadata: ExportMetadata = {
        debateId: transcript.meta.debate_id,
        format: 'markdown',
        generatedAt: new Date().toISOString(),
        exporterVersion: EXPORTER_VERSION,
        schemaVersion: transcript.meta.schema_version,
        fileSizeBytes: Buffer.byteLength(content, 'utf8'),
        fileName: this.generateFileName(transcript),
      };

      logger.info(
        {
          debateId: transcript.meta.debate_id,
          sizeBytes: metadata.fileSizeBytes,
        },
        'Markdown export completed successfully'
      );

      return {
        success: true,
        content,
        metadata,
      };
    } catch (error) {
      logger.error(
        { error, debateId: transcript.meta.debate_id },
        'Failed to export Markdown'
      );

      return {
        success: false,
        metadata: {
          debateId: transcript.meta.debate_id,
          format: 'markdown',
          generatedAt: new Date().toISOString(),
          exporterVersion: EXPORTER_VERSION,
          schemaVersion: transcript.meta.schema_version,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Format metadata header
   */
  private formatMetadata(transcript: DebateTranscript): string {
    const meta = transcript.meta;
    const generatedDate = new Date(meta.generated_at);

    return `# Debate Analysis

**Generated:** ${generatedDate.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}
**Debate ID:** ${meta.debate_id}
**Format:** ${meta.debate_format}
**Duration:** ${this.formatDuration(meta.total_duration_seconds)}
**Status:** ${meta.status}
**Schema Version:** ${meta.schema_version}`;
  }

  /**
   * Format proposition section
   */
  private formatProposition(transcript: DebateTranscript): string {
    const prop = transcript.proposition;

    let section = `## Proposition

**Question:** ${prop.normalized_question}`;

    if (prop.context && prop.context !== prop.raw_input) {
      section += `\n\n**Context:** ${prop.context}`;
    }

    if (prop.raw_input !== prop.normalized_question) {
      section += `\n\n**Original Input:** ${prop.raw_input}`;
    }

    return section;
  }

  /**
   * Format Pro advocate section
   */
  private formatProSection(pro: SideAnalysis): string {
    const parts: string[] = ['## Arguments FOR'];

    // Executive summary
    if (pro.executive_summary) {
      parts.push(`*${pro.executive_summary}*`);
    }

    // Arguments
    if (pro.arguments && pro.arguments.length > 0) {
      parts.push('### Key Arguments\n');

      pro.arguments.forEach((arg, i) => {
        const argSection = this.formatArgument(arg, i + 1);
        parts.push(argSection);
      });
    }

    // Assumptions
    if (pro.assumptions && pro.assumptions.length > 0) {
      parts.push('### Underlying Assumptions\n');
      parts.push(pro.assumptions.map((a) => `- ${a}`).join('\n'));
    }

    // Uncertainties
    if (pro.uncertainties && pro.uncertainties.length > 0) {
      parts.push('### Key Uncertainties\n');
      parts.push(pro.uncertainties.map((u) => `- ${u}`).join('\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * Format Con advocate section
   */
  private formatConSection(con: SideAnalysis): string {
    // Reuse Pro formatting, just change the header
    return this.formatProSection(con).replace('Arguments FOR', 'Arguments AGAINST');
  }

  /**
   * Format a single argument
   */
  private formatArgument(
    arg: {
      content: string;
      category: string;
      evidence_type: string;
      confidence_level: string;
    },
    index: number
  ): string {
    return `#### ${index}. ${arg.content.substring(0, 100)}${arg.content.length > 100 ? '...' : ''}

**Category:** ${this.formatCategory(arg.category)}
**Evidence Type:** ${this.formatEvidenceType(arg.evidence_type)}
**Confidence:** ${this.formatConfidence(arg.confidence_level)}

${arg.content}`;
  }

  /**
   * Format moderator synthesis section
   */
  private formatModeratorSection(moderator: ModeratorSynthesis): string {
    const parts: string[] = ['## Moderator Synthesis'];

    // Areas of agreement
    if (moderator.areas_of_agreement && moderator.areas_of_agreement.length > 0) {
      parts.push('### Areas of Agreement\n');
      moderator.areas_of_agreement.forEach((area) => {
        parts.push(`**${area.topic}**  \n${area.description}\n`);
      });
    }

    // Core disagreements
    if (moderator.core_disagreements && moderator.core_disagreements.length > 0) {
      parts.push('### Core Disagreements\n');
      moderator.core_disagreements.forEach((disagreement) => {
        parts.push(`**${disagreement.topic}**  \n${disagreement.description}\n`);
      });
    }

    // Assumption conflicts
    if (moderator.assumption_conflicts && moderator.assumption_conflicts.length > 0) {
      parts.push('### Conflicting Assumptions\n');
      moderator.assumption_conflicts.forEach((conflict) => {
        parts.push(
          `- **Pro assumes:** ${conflict.pro_assumes}  \n  **Con assumes:** ${conflict.con_assumes}\n`
        );
      });
    }

    // Evidence gaps
    if (moderator.evidence_gaps && moderator.evidence_gaps.length > 0) {
      parts.push('### Evidence Gaps\n');
      parts.push(moderator.evidence_gaps.map((gap) => `- ${gap}`).join('\n'));
    }

    // Decision hinges
    if (moderator.decision_hinges && moderator.decision_hinges.length > 0) {
      parts.push('### Key Decision Points\n');
      parts.push(moderator.decision_hinges.map((hinge) => `- ${hinge}`).join('\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * Format user interventions section
   */
  private formatInterventions(interventions: TranscriptIntervention[]): string {
    const parts: string[] = ['## User Interventions'];

    interventions.forEach((intervention, i) => {
      const timestamp = this.formatTimestamp(intervention.timestamp_ms);
      const type = this.formatInterventionType(intervention.type);

      let section = `### ${i + 1}. ${type} (${timestamp})

**Content:** ${intervention.content}`;

      if (intervention.metadata?.directed_to) {
        section += `  \n**Directed to:** ${this.formatSpeaker(
          intervention.metadata.directed_to as string
        )}`;
      }

      if (intervention.metadata?.response) {
        const responseTime = intervention.metadata.response_timestamp_ms
          ? this.formatTimestamp(intervention.metadata.response_timestamp_ms as number)
          : 'unknown';

        section += `\n\n**Response** (${responseTime}):\n\n> ${intervention.metadata.response}`;
      }

      parts.push(section);
    });

    return parts.join('\n\n');
  }

  /**
   * Format full chronological transcript
   */
  private formatTranscript(utterances: TranscriptUtterance[]): string {
    const parts: string[] = ['## Full Transcript'];

    let currentPhase = '';

    utterances.forEach((utterance) => {
      // Add phase header if phase changed
      if (utterance.phase !== currentPhase) {
        currentPhase = utterance.phase;
        parts.push(`\n### ${this.formatPhase(utterance.phase)}\n`);
      }

      const timestamp = this.formatTimestamp(utterance.timestamp_ms);
      const speaker = this.formatSpeaker(utterance.speaker);

      parts.push(`**[${timestamp}] ${speaker}:**

${utterance.content}
`);
    });

    return parts.join('\n');
  }

  /**
   * Generate a descriptive filename for the export
   */
  private generateFileName(transcript: DebateTranscript): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const prop = transcript.proposition.normalized_question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .substring(0, 50);

    return `debate-${prop}-${date}.md`;
  }

  /**
   * Format duration in seconds to human-readable string
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins === 0) {
      return `${secs}s`;
    }

    return `${mins}m ${secs}s`;
  }

  /**
   * Format timestamp in milliseconds to MM:SS
   */
  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format phase name for display
   */
  private formatPhase(phase: string): string {
    const phaseMap: Record<string, string> = {
      phase_1_opening: 'Opening Statements',
      phase_2_constructive: 'Evidence Presentation',
      phase_3_crossexam: 'Clarifying Questions',
      phase_4_rebuttal: 'Rebuttals',
      phase_5_closing: 'Closing Statements',
      phase_6_synthesis: 'Moderator Synthesis',
    };

    return phaseMap[phase] || phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Format speaker for display
   */
  private formatSpeaker(speaker: string): string {
    const speakerMap: Record<string, string> = {
      pro: 'Pro Advocate',
      con: 'Con Advocate',
      moderator: 'Moderator',
      system: 'System',
    };

    return speakerMap[speaker] || speaker.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Format intervention type for display
   */
  private formatInterventionType(type: string): string {
    const typeMap: Record<string, string> = {
      question: 'Question',
      challenge: 'Challenge',
      evidence: 'Evidence Injection',
      pause: 'Pause Request',
      resume: 'Clarification Request',
    };

    return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Format argument category for display
   */
  private formatCategory(category: string): string {
    return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Format evidence type for display
   */
  private formatEvidenceType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Format confidence level for display
   */
  private formatConfidence(level: string): string {
    const confidenceMap: Record<string, string> = {
      high: '🟢 High',
      medium: '🟡 Medium',
      low: '🔴 Low',
    };

    return confidenceMap[level] || level;
  }
}

/**
 * Create a new MarkdownExporter instance
 */
export function createMarkdownExporter(): MarkdownExporter {
  return new MarkdownExporter();
}
