/**
 * Lively Scheduler
 * Manages active speaker tracking, token streaming, and interrupt windows
 * for the "Lively Debate" mode with orchestrated interruptions.
 */

import { EventEmitter } from 'events';
import { Speaker } from '../../types/debate.js';
import type {
  LivelySettings,
  ActiveSpeakerState,
  SpeakerState,
  PacingMode,
} from '../../types/lively.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'LivelyScheduler' });

/**
 * Events emitted by the LivelyScheduler
 */
export interface LivelySchedulerEvents {
  'speaker:started': (speaker: Speaker, timestampMs: number) => void;
  'speaker:ended': (speaker: Speaker, timestampMs: number) => void;
  'token:chunk': (speaker: Speaker, chunk: string, position: number) => void;
  'boundary:safe': (speaker: Speaker, position: number, content: string) => void;
  'window:opened': (speaker: Speaker, sinceMs: number) => void;
  'window:closed': (speaker: Speaker, reason: string) => void;
}

/**
 * Pacing configuration by mode
 */
const PACING: Record<PacingMode, {
  evaluationIntervalMs: number;
  baseAggressionMultiplier: number;
  tokenChunkSize: number;
  minBoundaryGapMs: number;
}> = {
  slow: {
    evaluationIntervalMs: 2000,
    baseAggressionMultiplier: 0.5,
    tokenChunkSize: 100,
    minBoundaryGapMs: 3000,
  },
  medium: {
    evaluationIntervalMs: 1000,
    baseAggressionMultiplier: 1.0,
    tokenChunkSize: 50,
    minBoundaryGapMs: 2000,
  },
  fast: {
    evaluationIntervalMs: 500,
    baseAggressionMultiplier: 1.5,
    tokenChunkSize: 30,
    minBoundaryGapMs: 1000,
  },
  frantic: {
    evaluationIntervalMs: 250,
    baseAggressionMultiplier: 2.0,
    tokenChunkSize: 20,
    minBoundaryGapMs: 500,
  },
};

/**
 * Sentence boundary patterns for detecting safe interrupt points
 */
const SENTENCE_BOUNDARIES = /[.!?]+\s+|\n\n/g;
const CLAUSE_BOUNDARIES = /[,;:]\s+|—\s+/g;

/**
 * LivelyScheduler Class
 * Coordinates speaker turns and interrupt windows in lively mode
 */
export class LivelyScheduler extends EventEmitter {
  private readonly settings: LivelySettings;
  private readonly pacingConfig: typeof PACING[PacingMode];

  /** Current active speaker state */
  private activeSpeaker: ActiveSpeakerState | null = null;

  /** Speaker states for all participants */
  private speakerStates: Map<Speaker, SpeakerState> = new Map();

  /** Debate start time for relative timestamps */
  private debateStartMs: number = 0;

  /** Last boundary detection timestamp */
  private lastBoundaryMs: number = 0;

  /** Accumulated content buffer for boundary detection */
  private contentBuffer: string = '';

  /** Whether scheduler is active */
  private isActive: boolean = false;

  constructor(settings: LivelySettings) {
    super();
    this.settings = settings;
    this.pacingConfig = PACING[settings.pacingMode];

    // Initialize speaker states
    this.speakerStates.set(Speaker.PRO, 'ready');
    this.speakerStates.set(Speaker.CON, 'ready');
    this.speakerStates.set(Speaker.MODERATOR, 'ready');

    logger.info(
      { pacingMode: settings.pacingMode, aggressionLevel: settings.aggressionLevel },
      'LivelyScheduler initialized'
    );
  }

  /**
   * Start the scheduler for a debate
   */
  start(debateStartMs: number = Date.now()): void {
    this.debateStartMs = debateStartMs;
    this.isActive = true;
    logger.info({ debateStartMs }, 'LivelyScheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isActive = false;
    if (this.activeSpeaker) {
      const endMs = this.getCurrentMs();
      this.emit('speaker:ended', this.activeSpeaker.speaker, endMs);
    }
    this.activeSpeaker = null;
    logger.info('LivelyScheduler stopped');
  }

  /**
   * Start a speaker's turn
   */
  startSpeaker(speaker: Speaker): void {
    if (!this.isActive) {
      logger.warn({ speaker }, 'Attempted to start speaker while scheduler inactive');
      return;
    }

    const startMs = this.getCurrentMs();

    // End previous speaker if any
    if (this.activeSpeaker && this.activeSpeaker.speaker !== speaker) {
      this.emit('speaker:ended', this.activeSpeaker.speaker, startMs);
      this.speakerStates.set(this.activeSpeaker.speaker, 'ready');
    }

    // Initialize new active speaker
    this.activeSpeaker = {
      speaker,
      startedAtMs: startMs,
      tokenPosition: 0,
      partialContent: '',
      interruptWindowOpen: false,
      lastSafeBoundary: 0,
    };

    this.contentBuffer = '';
    this.lastBoundaryMs = startMs;
    this.speakerStates.set(speaker, 'speaking');

    logger.debug({ speaker, startMs }, 'Speaker started');
    this.emit('speaker:started', speaker, startMs);
  }

  /**
   * End current speaker's turn
   */
  endSpeaker(): void {
    if (!this.activeSpeaker) {
      return;
    }

    const endMs = this.getCurrentMs();
    const speaker = this.activeSpeaker.speaker;

    this.speakerStates.set(speaker, 'ready');
    this.emit('speaker:ended', speaker, endMs);

    logger.debug(
      { speaker, duration: endMs - this.activeSpeaker.startedAtMs },
      'Speaker ended'
    );

    this.activeSpeaker = null;
    this.contentBuffer = '';
  }

  /**
   * Process a token chunk from the active speaker
   * Returns true if a safe boundary was detected
   */
  processTokenChunk(chunk: string): boolean {
    if (!this.activeSpeaker) {
      return false;
    }

    const currentMs = this.getCurrentMs();
    const speaker = this.activeSpeaker.speaker;

    // Update token position
    this.activeSpeaker.tokenPosition += chunk.length;
    this.activeSpeaker.partialContent += chunk;
    this.contentBuffer += chunk;

    // Emit token chunk event
    this.emit('token:chunk', speaker, chunk, this.activeSpeaker.tokenPosition);

    // Check if interrupt window should open
    this.updateInterruptWindow(currentMs);

    // Check for safe boundaries
    const boundaryDetected = this.detectBoundary(currentMs);

    return boundaryDetected;
  }

  /**
   * Check if interrupt window is currently open
   */
  canInterrupt(): boolean {
    if (!this.activeSpeaker || !this.isActive) {
      return false;
    }

    return this.activeSpeaker.interruptWindowOpen;
  }

  /**
   * Get current active speaker
   */
  getActiveSpeaker(): Speaker | null {
    return this.activeSpeaker?.speaker ?? null;
  }

  /**
   * Get active speaker state
   */
  getActiveSpeakerState(): ActiveSpeakerState | null {
    return this.activeSpeaker ? { ...this.activeSpeaker } : null;
  }

  /**
   * Get current token position
   */
  getTokenPosition(): number {
    return this.activeSpeaker?.tokenPosition ?? 0;
  }

  /**
   * Get partial content generated so far
   */
  getPartialContent(): string {
    return this.activeSpeaker?.partialContent ?? '';
  }

  /**
   * Get speaking duration in milliseconds
   */
  getSpeakingDuration(): number {
    if (!this.activeSpeaker) {
      return 0;
    }
    return this.getCurrentMs() - this.activeSpeaker.startedAtMs;
  }

  /**
   * Get state for a specific speaker
   */
  getSpeakerState(speaker: Speaker): SpeakerState {
    return this.speakerStates.get(speaker) ?? 'ready';
  }

  /**
   * Set speaker state (e.g., for cooldown)
   */
  setSpeakerState(speaker: Speaker, state: SpeakerState): void {
    this.speakerStates.set(speaker, state);
    logger.debug({ speaker, state }, 'Speaker state updated');
  }

  /**
   * Get all speaker states
   */
  getAllSpeakerStates(): Map<Speaker, SpeakerState> {
    return new Map(this.speakerStates);
  }

  /**
   * Get last safe boundary position for cutoff
   */
  getLastSafeBoundary(): number {
    return this.activeSpeaker?.lastSafeBoundary ?? 0;
  }

  /**
   * Force close interrupt window (e.g., after interrupt fired)
   */
  closeInterruptWindow(reason: string): void {
    if (this.activeSpeaker && this.activeSpeaker.interruptWindowOpen) {
      this.activeSpeaker.interruptWindowOpen = false;
      this.emit('window:closed', this.activeSpeaker.speaker, reason);
      logger.debug({ speaker: this.activeSpeaker.speaker, reason }, 'Interrupt window closed');
    }
  }

  /**
   * Mark a speaker as interrupted (partial turn)
   */
  markInterrupted(speaker: Speaker): void {
    if (this.activeSpeaker?.speaker === speaker) {
      this.speakerStates.set(speaker, 'interrupted');
      this.activeSpeaker = null;
    }
  }

  /**
   * Get pacing configuration
   */
  getPacingConfig(): typeof PACING[PacingMode] {
    return { ...this.pacingConfig };
  }

  /**
   * Get settings
   */
  getSettings(): LivelySettings {
    return { ...this.settings };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Update interrupt window state based on speaking duration
   */
  private updateInterruptWindow(currentMs: number): void {
    if (!this.activeSpeaker) {
      return;
    }

    const speakingDuration = currentMs - this.activeSpeaker.startedAtMs;
    const wasOpen = this.activeSpeaker.interruptWindowOpen;

    // Open window after minimum speaking time
    if (speakingDuration >= this.settings.minSpeakingTimeMs) {
      if (!wasOpen) {
        this.activeSpeaker.interruptWindowOpen = true;
        this.emit('window:opened', this.activeSpeaker.speaker, speakingDuration);
        logger.debug(
          { speaker: this.activeSpeaker.speaker, afterMs: speakingDuration },
          'Interrupt window opened'
        );
      }
    }
  }

  /**
   * Detect safe boundaries (sentence/clause ends) in content
   */
  private detectBoundary(currentMs: number): boolean {
    if (!this.activeSpeaker) {
      return false;
    }

    // Check if enough time has passed since last boundary
    if (currentMs - this.lastBoundaryMs < this.pacingConfig.minBoundaryGapMs) {
      return false;
    }

    // Look for sentence boundaries first (stronger)
    const sentenceMatch = this.contentBuffer.match(SENTENCE_BOUNDARIES);
    if (sentenceMatch) {
      const boundaryPos = this.activeSpeaker.tokenPosition;
      this.activeSpeaker.lastSafeBoundary = boundaryPos;
      this.lastBoundaryMs = currentMs;
      this.contentBuffer = ''; // Reset buffer

      this.emit(
        'boundary:safe',
        this.activeSpeaker.speaker,
        boundaryPos,
        this.activeSpeaker.partialContent
      );

      logger.debug(
        { speaker: this.activeSpeaker.speaker, position: boundaryPos },
        'Sentence boundary detected'
      );

      return true;
    }

    // Look for clause boundaries (weaker, only in fast/frantic mode)
    if (this.settings.pacingMode === 'fast' || this.settings.pacingMode === 'frantic') {
      const clauseMatch = this.contentBuffer.match(CLAUSE_BOUNDARIES);
      if (clauseMatch) {
        const boundaryPos = this.activeSpeaker.tokenPosition;
        this.activeSpeaker.lastSafeBoundary = boundaryPos;
        this.lastBoundaryMs = currentMs;
        this.contentBuffer = '';

        this.emit(
          'boundary:safe',
          this.activeSpeaker.speaker,
          boundaryPos,
          this.activeSpeaker.partialContent
        );

        logger.debug(
          { speaker: this.activeSpeaker.speaker, position: boundaryPos },
          'Clause boundary detected'
        );

        return true;
      }
    }

    return false;
  }

  /**
   * Get current time relative to debate start
   */
  private getCurrentMs(): number {
    return Date.now() - this.debateStartMs + this.debateStartMs;
    // Simplified: just returns Date.now() for absolute timestamps
    // Could be changed to relative if needed
  }
}

/**
 * Create a new LivelyScheduler instance
 */
export function createLivelyScheduler(settings: LivelySettings): LivelyScheduler {
  return new LivelyScheduler(settings);
}
