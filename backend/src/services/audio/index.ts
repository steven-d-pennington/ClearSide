/**
 * Audio Export Module
 *
 * Provides audio export functionality for debate transcripts.
 * Converts debates to MP3 podcasts with TTS, chapter markers, and metadata.
 *
 * @module audio
 *
 * @example
 * ```typescript
 * import {
 *   createAudioExportOrchestrator,
 *   exportAudioSync,
 * } from './services/audio';
 *
 * // Async export (recommended for long debates)
 * const orchestrator = createAudioExportOrchestrator();
 * const jobId = await orchestrator.startExport(transcript, { format: 'mp3' });
 *
 * // Poll for status
 * const status = orchestrator.getJobStatus(jobId);
 *
 * // Sync export (blocks until complete)
 * const result = await exportAudioSync(transcript, { format: 'mp3' });
 * ```
 */

// Types
export type {
  VoiceType,
  Speaker,
  AudioJobStatus,
  AudioFormat,
  VoiceConfig,
  VoiceProfiles,
  AudioSegment,
  AudioScript,
  ChapterMarker,
  AudioExportOptions,
  AudioExportJob,
  TTSResult,
  AudioProcessingResult,
  ID3Tags,
  AudioExportResult,
} from './types.js';

export { DEFAULT_AUDIO_OPTIONS } from './types.js';

// ElevenLabs TTS Service
export {
  ElevenLabsService,
  createElevenLabsService,
  DEFAULT_VOICE_PROFILES,
  type ElevenLabsConfig,
} from './elevenlabs-service.js';

// Script Generator
export {
  ScriptGenerator,
  createScriptGenerator,
} from './script-generator.js';

// Audio Processor
export {
  AudioProcessor,
  createAudioProcessor,
  type AudioProcessorConfig,
} from './audio-processor.js';

// ID3 Manager
export {
  ID3Manager,
  createID3Manager,
  type ID3ManagerConfig,
} from './id3-manager.js';

// Audio Export Orchestrator
export {
  AudioExportOrchestrator,
  createAudioExportOrchestrator,
  exportAudioSync,
  type AudioExportOrchestratorConfig,
} from './audio-export-orchestrator.js';
