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
  TTSProvider,
  TTSProviderInfo,
  ITTSService,
} from './types.js';

export { DEFAULT_AUDIO_OPTIONS, TTS_PROVIDERS } from './types.js';

// TTS Provider Factory (multi-provider support)
export {
  createTTSService,
  getTTSService,
  getAvailableProviders,
  getDefaultProvider,
  getProvidersWithStatus,
  isProviderAvailable,
  clearServiceCache,
} from './tts-provider-factory.js';

// ElevenLabs TTS Service
export {
  ElevenLabsService,
  createElevenLabsService,
  DEFAULT_VOICE_PROFILES,
  type ElevenLabsConfig,
} from './elevenlabs-service.js';

// Gemini TTS Service
export {
  GeminiTTSService,
  createGeminiTTSService,
  GEMINI_VOICE_PROFILES,
  GEMINI_AVAILABLE_VOICES,
  type GeminiTTSConfig,
} from './gemini-tts-service.js';

// Google Cloud TTS Service
export {
  GoogleCloudTTSService,
  createGoogleCloudTTSService,
  GOOGLE_CLOUD_VOICE_PROFILES,
  GOOGLE_CLOUD_AVAILABLE_VOICES,
  type GoogleCloudTTSConfig,
} from './google-cloud-tts-service.js';

// Azure TTS Service
export {
  AzureTTSService,
  createAzureTTSService,
  AZURE_VOICE_PROFILES,
  type AzureTTSConfig,
} from './azure-tts-service.js';

// Edge TTS Service (free, no API key)
export {
  EdgeTTSService,
  createEdgeTTSService,
  EDGE_VOICE_PROFILES,
  EDGE_AVAILABLE_VOICES,
  type EdgeTTSConfig,
} from './edge-tts-service.js';

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
