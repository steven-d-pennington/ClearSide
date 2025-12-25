/**
 * Export service type definitions
 *
 * Defines types for export configuration, output formats, and metadata.
 * These types are used across all export functionality (Markdown, PDF, audio, video).
 */

/**
 * Format for exported debates
 */
export type ExportFormat = 'markdown' | 'pdf' | 'audio' | 'video';

/**
 * Export status for async operations
 */
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Options for Markdown export
 * Allows customization of which sections to include and formatting style
 */
export interface MarkdownExportOptions {
  /** Include metadata header (generated date, model, version) */
  includeMetadata?: boolean;

  /** Include proposition section */
  includeProposition?: boolean;

  /** Include Pro advocate arguments */
  includePro?: boolean;

  /** Include Con advocate arguments */
  includeCon?: boolean;

  /** Include moderator synthesis */
  includeModerator?: boolean;

  /** Include user challenges/interventions */
  includeChallenges?: boolean;

  /** Include full transcript (chronological utterances) */
  includeTranscript?: boolean;

  /** Formatting style */
  format?: 'standard' | 'compact';

  /** Maximum length for summaries (characters) */
  maxSummaryLength?: number;
}

/**
 * Metadata for exported files
 */
export interface ExportMetadata {
  /** ID of the original debate */
  debateId: string;

  /** Format of the export */
  format: ExportFormat;

  /** When the export was generated */
  generatedAt: string;

  /** Version of the exporter */
  exporterVersion: string;

  /** Schema version of the debate data */
  schemaVersion: string;

  /** File size in bytes (for completed exports) */
  fileSizeBytes?: number;

  /** File name */
  fileName?: string;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  /** Whether the export was successful */
  success: boolean;

  /** Exported content (for synchronous exports like Markdown) */
  content?: string;

  /** File path (for file-based exports) */
  filePath?: string;

  /** Export metadata */
  metadata: ExportMetadata;

  /** Error message if export failed */
  error?: string;
}

/**
 * Default Markdown export options
 */
export const DEFAULT_MARKDOWN_OPTIONS: MarkdownExportOptions = {
  includeMetadata: true,
  includeProposition: true,
  includePro: true,
  includeCon: true,
  includeModerator: true,
  includeChallenges: false,
  includeTranscript: false,
  format: 'standard',
  maxSummaryLength: 500,
};
