/**
 * Export Type Definitions for Frontend
 *
 * Types for audio and text export functionality
 */

// ============================================================================
// TTS Providers
// ============================================================================

/**
 * Available TTS providers for audio export
 */
export type TTSProvider = 'elevenlabs' | 'gemini' | 'google-cloud' | 'azure' | 'edge';

/**
 * Quality level for TTS providers
 */
export type TTSQuality = 'premium' | 'high' | 'good' | 'standard';

/**
 * TTS Provider information
 */
export interface TTSProviderInfo {
  id: TTSProvider;
  name: string;
  description: string;
  freeTier: string;
  quality: TTSQuality;
  requiresApiKey: boolean;
  envVar?: string;
  available: boolean;
}

// ============================================================================
// Audio Export
// ============================================================================

/**
 * Audio format options
 */
export type AudioFormat = 'mp3' | 'wav' | 'ogg';

/**
 * Audio export job status
 */
export type AudioJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Audio export options for API request
 */
export interface AudioExportOptions {
  provider?: TTSProvider;
  format?: AudioFormat;
  includeBackgroundMusic?: boolean;
  backgroundMusicVolume?: number;
  voiceSpeed?: number;
  includeIntroOutro?: boolean;
  normalizeAudio?: boolean;
}

/**
 * Audio export job response from API
 */
export interface AudioExportJob {
  jobId: string;
  debateId: string;
  provider?: TTSProvider;
  status: AudioJobStatus;
  progress: number;
  stage: string;
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  error?: string;
}

/**
 * Provider list response from API
 */
export interface ProvidersResponse {
  providers: TTSProviderInfo[];
  defaultProvider: TTSProvider;
  availableProviders: TTSProvider[];
}

// ============================================================================
// Export Format Selection
// ============================================================================

/**
 * Available export formats
 */
export type ExportFormat = 'markdown' | 'audio' | 'pdf';

/**
 * Export format information
 */
export interface ExportFormatInfo {
  id: ExportFormat;
  name: string;
  description: string;
  icon: string;
  available: boolean;
}

/**
 * Available export formats with metadata
 */
export const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: 'markdown',
    name: 'Markdown',
    description: 'Text transcript in Markdown format',
    icon: 'file-text',
    available: true,
  },
  {
    id: 'audio',
    name: 'Audio Podcast',
    description: 'MP3 with TTS narration and chapter markers',
    icon: 'headphones',
    available: true,
  },
  {
    id: 'pdf',
    name: 'PDF Document',
    description: 'Formatted PDF document',
    icon: 'file',
    available: false, // Coming soon
  },
];

// ============================================================================
// Quality badge colors
// ============================================================================

export const QUALITY_COLORS: Record<TTSQuality, string> = {
  premium: '#10b981', // green
  high: '#3b82f6',    // blue
  good: '#8b5cf6',    // purple
  standard: '#6b7280', // gray
};

export const QUALITY_LABELS: Record<TTSQuality, string> = {
  premium: 'Premium',
  high: 'High Quality',
  good: 'Good',
  standard: 'Standard',
};
