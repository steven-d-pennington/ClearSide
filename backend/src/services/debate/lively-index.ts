/**
 * Lively Debate Mode - Public Exports
 *
 * Entry point for all lively debate functionality.
 */

// Core components
export { LivelyScheduler, createLivelyScheduler } from './lively-scheduler.js';
export {
  InterruptionEngine,
  createInterruptionEngine,
  type EvaluationContext,
} from './interruption-engine.js';
export {
  LivelyDebateOrchestrator,
  createLivelyOrchestrator,
  type LivelyOrchestratorConfig,
} from './lively-orchestrator.js';

// Re-export types
export type {
  DebateMode,
  PacingMode,
  LivelySettings,
  LivelySettingsInput,
  Interruption,
  InterruptCandidate,
  ActiveSpeakerState,
  SpeakerState,
  LivelyState,
} from '../../types/lively.js';

// Re-export repository functions
export * as livelyRepository from '../../db/repositories/lively-repository.js';
