/**
 * Export Job Type Definitions
 * Types for tracking audio, video, and document export jobs
 */

/**
 * Export job types
 */
export type ExportJobType = 'audio' | 'video' | 'markdown' | 'pdf';

/**
 * Export job status
 */
export type ExportJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Export job record from database
 */
export interface ExportJob {
  id: string;
  debateId: string;

  /** Type of export */
  jobType: ExportJobType;

  /** Current status */
  status: ExportJobStatus;

  /** Progress percentage (0-100) */
  progress: number;

  /** Current processing stage description */
  stage: string | null;

  /** Configuration options passed to the export */
  options: Record<string, unknown>;

  /** Output file path on server */
  outputPath: string | null;

  /** Public URL for download */
  outputUrl: string | null;

  /** File size in bytes */
  fileSizeBytes: number | null;

  /** Duration in seconds (for audio/video) */
  durationSeconds: number | null;

  /** Error message if failed */
  error: string | null;

  /** Provider used (elevenlabs, playht, openai, etc.) */
  provider: string | null;

  /** Timestamps */
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

/**
 * Database row type (snake_case from PostgreSQL)
 */
export interface ExportJobRow {
  id: string;
  debate_id: string;
  job_type: string;
  status: string;
  progress: number;
  stage: string | null;
  options: Record<string, unknown>;
  output_path: string | null;
  output_url: string | null;
  file_size_bytes: string | null; // BIGINT comes as string
  duration_seconds: string | null; // DECIMAL comes as string
  error: string | null;
  provider: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

/**
 * Input for creating a new export job
 */
export interface CreateExportJobInput {
  debateId: string;
  jobType: ExportJobType;
  options?: Record<string, unknown>;
  provider?: string;
}

/**
 * Input for updating an export job
 */
export interface UpdateExportJobInput {
  status?: ExportJobStatus;
  progress?: number;
  stage?: string;
  outputPath?: string;
  outputUrl?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Options for listing export jobs
 */
export interface ListExportJobsOptions {
  debateId?: string;
  jobType?: ExportJobType;
  status?: ExportJobStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at';
  orderDir?: 'asc' | 'desc';
}

/**
 * Export job count by status
 */
export interface ExportJobCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

/**
 * Convert database row to ExportJob
 */
export function rowToExportJob(row: ExportJobRow): ExportJob {
  return {
    id: row.id,
    debateId: row.debate_id,
    jobType: row.job_type as ExportJobType,
    status: row.status as ExportJobStatus,
    progress: row.progress,
    stage: row.stage,
    options: row.options,
    outputPath: row.output_path,
    outputUrl: row.output_url,
    fileSizeBytes: row.file_size_bytes ? parseInt(row.file_size_bytes, 10) : null,
    durationSeconds: row.duration_seconds ? parseFloat(row.duration_seconds) : null,
    error: row.error,
    provider: row.provider,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}
