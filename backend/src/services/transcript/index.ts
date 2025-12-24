/**
 * Transcript Service
 *
 * Central export point for transcript recording and compilation services
 */

export {
  TranscriptRecorder,
  createTranscriptRecorder,
  type DebateTranscript,
  type TranscriptMeta,
  type Proposition,
  type TranscriptUtterance,
  type TranscriptIntervention,
  type StructuredAnalysis,
  type SideAnalysis,
  type ModeratorSynthesis,
} from './transcript-recorder.js';
