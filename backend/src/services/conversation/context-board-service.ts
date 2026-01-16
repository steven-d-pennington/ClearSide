/**
 * Context Board Service for Conversational Podcast Mode
 *
 * Maintains a real-time "whiteboard" tracking topics discussed, claims made,
 * agreements, disagreements, and key points per participant. Uses a fast LLM
 * (Haiku) to extract structured information from each utterance.
 */

import pino from 'pino';
import type { Pool } from 'pg';
import { createOpenRouterClient } from '../llm/openrouter-adapter.js';
import type { LLMClient } from '../llm/client.js';
import {
  ContextBoardRepository,
  createContextBoardRepository,
} from '../../db/repositories/context-board-repository.js';
import type {
  ContextBoardState,
  TopicEntry,
  ClaimEntry,
  AgreementEntry,
  DisagreementEntry,
  SpeakerSignal,
  ConversationUtterance,
  EmotionalBeatState,
  EmotionalTemperature,
  MomentumMetrics,
  EmotionalIndicators,
} from '../../types/conversation.js';

const logger = pino({
  name: 'context-board-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Model for fast extraction (Haiku for speed and cost)
 */
const EXTRACTION_MODEL = 'anthropic/claude-haiku-4.5';

/**
 * Extraction result from LLM
 */
interface ExtractionResult {
  newTopics: string[];
  claims: Array<{
    content: string;
    stance: 'assertion' | 'hypothesis' | 'question';
  }>;
  agreementsWith: string[];
  disagreementsWith: string[];
  isKeyPoint: boolean;
  topicMarker?: string;
  emotionalIndicators?: EmotionalIndicators;
}

/**
 * ContextBoardService
 *
 * Maintains shared state for podcast conversations:
 * - Topics discussed (introduced by whom, status)
 * - Claims made (who, stance, supporters/challengers)
 * - Agreements and disagreements
 * - Key points per participant
 * - Current conversational thread
 * - Speaker signal queue
 */
export class ContextBoardService {
  private repository: ContextBoardRepository;
  private extractionClient: LLMClient;
  private sessionId: string;
  private state: ContextBoardState;
  private participantNames: Map<string, string>; // participantId -> display name

  constructor(
    pool: Pool,
    sessionId: string,
    participantNames: Map<string, string>,
    extractionClient?: LLMClient
  ) {
    this.repository = createContextBoardRepository(pool);
    this.extractionClient = extractionClient || createOpenRouterClient(EXTRACTION_MODEL);
    this.sessionId = sessionId;
    this.participantNames = participantNames;

    // Initialize empty state
    this.state = {
      sessionId,
      topicsDiscussed: [],
      claims: [],
      agreements: [],
      disagreements: [],
      keyPointsByParticipant: {},
      currentThread: undefined,
      speakerQueue: [],
      updatedAt: new Date(),
      // Flow control tracking
      recentSpeakerHistory: [],
      consecutiveHostTurns: 0,
      // Emotional tracking
      emotionalBeat: {
        currentTemperature: 'neutral',
        recentAgreements: 0,
        recentDisagreements: 0,
        energyLevel: 'medium',
      },
      momentum: {
        signalFrequency: 0,
        hostGuestRatio: 0.3,
        topicDepth: 0,
        engagementScore: 50,
        balanceHealth: 'good',
      },
    };

    logger.info({ sessionId, participantCount: participantNames.size }, 'ContextBoardService initialized');
  }

  // =========================================================================
  // STATE ACCESS
  // =========================================================================

  /**
   * Get current board state
   */
  getState(): ContextBoardState {
    return { ...this.state };
  }

  /**
   * Get current speaker queue
   */
  getSpeakerQueue(): SpeakerSignal[] {
    return [...this.state.speakerQueue];
  }

  /**
   * Get next speaker signal (highest urgency)
   */
  getNextSignal(): SpeakerSignal | null {
    if (this.state.speakerQueue.length === 0) return null;

    // Sort by urgency (high > medium > low) and createdAt
    const urgencyOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const sorted = [...this.state.speakerQueue].sort((a, b) => {
      const urgencyA = urgencyOrder[a.urgency] ?? 0;
      const urgencyB = urgencyOrder[b.urgency] ?? 0;
      const urgencyDiff = urgencyB - urgencyA;
      if (urgencyDiff !== 0) return urgencyDiff;

      // Sort by createdAt (earlier first)
      const timeA = a.createdAt?.getTime() ?? 0;
      const timeB = b.createdAt?.getTime() ?? 0;
      return timeA - timeB;
    });

    return sorted[0] || null;
  }

  /**
   * Get summary for display
   */
  getSummary(): string {
    const parts: string[] = [];

    if (this.state.currentThread) {
      parts.push(`Current: ${this.state.currentThread}`);
    }

    const activeTopics = this.state.topicsDiscussed.filter(t => t.status === 'active');
    if (activeTopics.length > 0) {
      parts.push(`Topics: ${activeTopics.map(t => t.topic).join(', ')}`);
    }

    if (this.state.agreements.length > 0) {
      parts.push(`Agreements: ${this.state.agreements.length}`);
    }

    if (this.state.disagreements.length > 0) {
      parts.push(`Disagreements: ${this.state.disagreements.length}`);
    }

    return parts.join(' | ') || 'No topics yet';
  }

  /**
   * Get topics list
   */
  getTopics(): TopicEntry[] {
    return [...this.state.topicsDiscussed];
  }

  /**
   * Get claims list
   */
  getClaims(): ClaimEntry[] {
    return [...this.state.claims];
  }

  /**
   * Get key points for a participant
   */
  getKeyPointsFor(participantId: string): string[] {
    return this.state.keyPointsByParticipant[participantId] || [];
  }

  // =========================================================================
  // PROCESSING METHODS
  // =========================================================================

  /**
   * Process a new utterance and update the board
   */
  async processUtterance(utterance: ConversationUtterance): Promise<void> {
    const participantId = utterance.participantId || 'host';
    const participantName = this.participantNames.get(participantId) || 'Host';

    logger.debug({
      sessionId: this.sessionId,
      participantId,
      participantName,
      contentLength: utterance.content.length,
    }, 'Processing utterance for context board');

    try {
      // Extract structured information using fast LLM
      const extraction = await this.extractFromUtterance(utterance.content, participantName);

      // Update topics
      for (const topic of extraction.newTopics) {
        await this.addTopic(topic, participantId, participantName);
      }

      // Update claims
      for (const claim of extraction.claims) {
        await this.addClaim(participantId, participantName, claim.content, claim.stance);
      }

      // Update agreements
      for (const agreedWith of extraction.agreementsWith) {
        await this.addAgreement(participantId, agreedWith);
      }

      // Update disagreements
      for (const disagreedWith of extraction.disagreementsWith) {
        await this.addDisagreement(participantId, disagreedWith);
      }

      // Track key points
      if (extraction.isKeyPoint) {
        await this.addKeyPoint(participantId, utterance.content);
      }

      // Update current thread
      if (extraction.topicMarker) {
        await this.updateCurrentThread(extraction.topicMarker);
      }

      // Update emotional beat with extracted indicators
      this.updateEmotionalBeat(extraction.emotionalIndicators);

      // Calculate momentum metrics
      this.calculateMomentum();

      this.state.updatedAt = new Date();

      logger.debug({
        sessionId: this.sessionId,
        newTopics: extraction.newTopics.length,
        newClaims: extraction.claims.length,
        isKeyPoint: extraction.isKeyPoint,
        emotionalTemperature: this.state.emotionalBeat?.currentTemperature,
      }, 'Context board updated');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to process utterance');
      // Don't throw - context board is non-critical
    }
  }

  /**
   * Add a speaker signal to the queue
   */
  addSignal(signal: SpeakerSignal): void {
    // Remove any existing signal from this participant
    this.state.speakerQueue = this.state.speakerQueue.filter(
      s => s.participantId !== signal.participantId
    );

    // Ensure createdAt is set
    const signalWithTime: SpeakerSignal = {
      ...signal,
      createdAt: signal.createdAt || new Date(),
    };

    // Add new signal
    this.state.speakerQueue.push(signalWithTime);

    logger.debug({
      sessionId: this.sessionId,
      participantId: signal.participantId,
      urgency: signal.urgency,
      queueLength: this.state.speakerQueue.length,
    }, 'Speaker signal added to queue');

    // Persist to database
    this.repository.setSpeakerQueue(this.sessionId, this.state.speakerQueue).catch(err => {
      logger.warn({ err }, 'Failed to persist speaker queue');
    });
  }

  /**
   * Remove a signal after participant speaks
   */
  consumeSignal(participantId: string): void {
    this.state.speakerQueue = this.state.speakerQueue.filter(
      s => s.participantId !== participantId
    );

    // Persist to database
    this.repository.removeFromSpeakerQueue(this.sessionId, participantId).catch(err => {
      logger.warn({ err }, 'Failed to persist speaker queue removal');
    });
  }

  /**
   * Clear all signals
   */
  clearSignals(): void {
    this.state.speakerQueue = [];

    // Persist to database
    this.repository.clearSpeakerQueue(this.sessionId).catch(err => {
      logger.warn({ err }, 'Failed to clear speaker queue');
    });
  }

  // =========================================================================
  // TOPIC MANAGEMENT
  // =========================================================================

  private async addTopic(topic: string, introducedBy: string, introducedByName: string): Promise<void> {
    const existing = this.state.topicsDiscussed.find(
      t => t.topic.toLowerCase() === topic.toLowerCase()
    );

    if (!existing) {
      const entry: TopicEntry = {
        topic,
        introducedBy,
        introducedByName,
        timestampMs: Date.now(),
        status: 'active',
      };

      this.state.topicsDiscussed.push(entry);
      await this.repository.addTopic(this.sessionId, entry);
    }
  }

  /**
   * Mark a topic as resolved or tabled
   */
  async updateTopicStatus(topic: string, status: 'active' | 'resolved' | 'tabled'): Promise<void> {
    const existing = this.state.topicsDiscussed.find(
      t => t.topic.toLowerCase() === topic.toLowerCase()
    );
    if (existing) {
      existing.status = status;
      await this.repository.updateTopicStatus(this.sessionId, topic, status);
    }
  }

  // =========================================================================
  // CLAIM MANAGEMENT
  // =========================================================================

  private async addClaim(
    participantId: string,
    participantName: string,
    content: string,
    stance: 'assertion' | 'hypothesis' | 'question'
  ): Promise<void> {
    const entry: ClaimEntry = {
      claim: content,
      participantId,
      participantName,
      stance,
      supportedBy: [],
      challengedBy: [],
      timestampMs: Date.now(),
    };

    this.state.claims.push(entry);
    await this.repository.addClaim(this.sessionId, entry);
  }

  /**
   * Add support to an existing claim
   */
  async addClaimSupport(claimIndex: number, participantId: string): Promise<void> {
    const claim = this.state.claims[claimIndex];
    if (claim && !claim.supportedBy.includes(participantId)) {
      claim.supportedBy.push(participantId);
      await this.repository.addClaimSupport(this.sessionId, claimIndex, participantId);
    }
  }

  /**
   * Add challenge to an existing claim
   */
  async addClaimChallenge(claimIndex: number, participantId: string): Promise<void> {
    const claim = this.state.claims[claimIndex];
    if (claim && !claim.challengedBy.includes(participantId)) {
      claim.challengedBy.push(participantId);
      await this.repository.addClaimChallenge(this.sessionId, claimIndex, participantId);
    }
  }

  // =========================================================================
  // AGREEMENT/DISAGREEMENT TRACKING
  // =========================================================================

  private async addAgreement(participantId: string, withParticipantName: string): Promise<void> {
    // Find the participant ID for the name
    let withParticipantId: string | undefined;
    for (const [id, name] of this.participantNames.entries()) {
      if (name.toLowerCase().includes(withParticipantName.toLowerCase()) ||
          withParticipantName.toLowerCase().includes(name.split(' ')[0]?.toLowerCase() || '')) {
        withParticipantId = id;
        break;
      }
    }

    const entry: AgreementEntry = {
      topic: this.state.currentThread || 'general discussion',
      participants: withParticipantId ? [participantId, withParticipantId] : [participantId],
      participantNames: withParticipantId
        ? [this.participantNames.get(participantId) || 'Unknown', withParticipantName]
        : [this.participantNames.get(participantId) || 'Unknown'],
      timestampMs: Date.now(),
    };

    this.state.agreements.push(entry);
    await this.repository.addAgreement(this.sessionId, entry);
  }

  private async addDisagreement(participantId: string, withParticipantName: string): Promise<void> {
    // Find the participant ID for the name
    let withParticipantId: string | undefined;
    for (const [id, name] of this.participantNames.entries()) {
      if (name.toLowerCase().includes(withParticipantName.toLowerCase()) ||
          withParticipantName.toLowerCase().includes(name.split(' ')[0]?.toLowerCase() || '')) {
        withParticipantId = id;
        break;
      }
    }

    const entry: DisagreementEntry = {
      topic: this.state.currentThread || 'general discussion',
      sideA: [participantId],
      sideB: withParticipantId ? [withParticipantId] : [],
      sideANames: [this.participantNames.get(participantId) || 'Unknown'],
      sideBNames: [withParticipantName],
      timestampMs: Date.now(),
    };

    this.state.disagreements.push(entry);
    await this.repository.addDisagreement(this.sessionId, entry);
  }

  // =========================================================================
  // KEY POINTS
  // =========================================================================

  private async addKeyPoint(participantId: string, content: string): Promise<void> {
    if (!this.state.keyPointsByParticipant[participantId]) {
      this.state.keyPointsByParticipant[participantId] = [];
    }

    // Store abbreviated version
    const abbreviated = content.length > 200
      ? content.substring(0, 200) + '...'
      : content;

    this.state.keyPointsByParticipant[participantId].push(abbreviated);
    await this.repository.addKeyPoint(this.sessionId, participantId, abbreviated);
  }

  // =========================================================================
  // SPEAKER HISTORY & FLOW CONTROL
  // =========================================================================

  /**
   * Add a speaker to the history and update consecutive host turn tracking
   */
  addToSpeakerHistory(speakerId: string): void {
    // Add to history, keeping last 5
    this.state.recentSpeakerHistory.push(speakerId);
    if (this.state.recentSpeakerHistory.length > 5) {
      this.state.recentSpeakerHistory.shift();
    }

    // Track consecutive host turns
    if (speakerId === 'host') {
      this.state.consecutiveHostTurns++;
    } else {
      this.state.consecutiveHostTurns = 0;
    }

    logger.debug({
      sessionId: this.sessionId,
      speakerId,
      consecutiveHostTurns: this.state.consecutiveHostTurns,
      recentSpeakers: this.state.recentSpeakerHistory,
    }, 'Speaker history updated');
  }

  /**
   * Get consecutive host turn count
   */
  getConsecutiveHostTurns(): number {
    return this.state.consecutiveHostTurns;
  }

  /**
   * Get recent speaker history
   */
  getRecentSpeakerHistory(): string[] {
    return [...this.state.recentSpeakerHistory];
  }

  // =========================================================================
  // EMOTIONAL BEAT TRACKING
  // =========================================================================

  /**
   * Update emotional beat state based on recent utterance indicators
   */
  updateEmotionalBeat(indicators?: EmotionalIndicators): void {
    if (!this.state.emotionalBeat) {
      this.state.emotionalBeat = {
        currentTemperature: 'neutral',
        recentAgreements: 0,
        recentDisagreements: 0,
        energyLevel: 'medium',
      };
    }

    // Update counters from indicators
    if (indicators) {
      if (indicators.showsAgreement || indicators.showsConcession) {
        this.state.emotionalBeat.recentAgreements++;
      }
      if (indicators.showsFrustration) {
        this.state.emotionalBeat.recentDisagreements++;
      }
    }

    // Also count recent agreements/disagreements from state
    const recentAgreementCount = this.state.agreements.filter(
      a => Date.now() - a.timestampMs < 300000 // last 5 minutes
    ).length;
    const recentDisagreementCount = this.state.disagreements.filter(
      d => Date.now() - d.timestampMs < 300000
    ).length;

    // Calculate temperature
    this.state.emotionalBeat.currentTemperature = this.calculateTemperature(
      recentAgreementCount + (this.state.emotionalBeat.recentAgreements || 0),
      recentDisagreementCount + (this.state.emotionalBeat.recentDisagreements || 0),
      indicators
    );

    // Calculate energy level
    this.state.emotionalBeat.energyLevel = this.calculateEnergyLevel(indicators);

    logger.debug({
      sessionId: this.sessionId,
      temperature: this.state.emotionalBeat.currentTemperature,
      energyLevel: this.state.emotionalBeat.energyLevel,
      recentAgreements: this.state.emotionalBeat.recentAgreements,
      recentDisagreements: this.state.emotionalBeat.recentDisagreements,
    }, 'Emotional beat updated');
  }

  /**
   * Calculate emotional temperature from agreement/disagreement patterns
   */
  private calculateTemperature(
    agreements: number,
    disagreements: number,
    indicators?: EmotionalIndicators
  ): EmotionalTemperature {
    // Check for breakthrough (concession after disagreement)
    if (indicators?.showsConcession && disagreements > 0) {
      return 'breakthrough';
    }

    // Rising tension: more disagreements than agreements recently
    if (disagreements > agreements && disagreements >= 2) {
      return 'rising_tension';
    }

    // Agreement forming: multiple agreements, few disagreements
    if (agreements > disagreements && agreements >= 2) {
      return 'agreement_forming';
    }

    // Declining energy: few interactions overall
    const totalInteractions = agreements + disagreements;
    if (totalInteractions < 1 && this.state.claims.length > 5) {
      return 'declining_energy';
    }

    return 'neutral';
  }

  /**
   * Calculate energy level from emotional indicators
   */
  private calculateEnergyLevel(indicators?: EmotionalIndicators): 'high' | 'medium' | 'low' {
    if (!indicators) return 'medium';

    // High energy: excitement or frustration
    if (indicators.showsExcitement || indicators.showsFrustration) {
      return 'high';
    }

    // Lower energy when there's agreement/concession without excitement
    if (indicators.showsAgreement || indicators.showsConcession) {
      return 'medium';
    }

    return 'medium';
  }

  /**
   * Get current emotional beat state
   */
  getEmotionalBeat(): EmotionalBeatState | undefined {
    return this.state.emotionalBeat;
  }

  // =========================================================================
  // MOMENTUM TRACKING
  // =========================================================================

  /**
   * Calculate and update momentum metrics
   */
  calculateMomentum(): MomentumMetrics {
    const totalTurns = this.state.recentSpeakerHistory.length;
    const hostTurns = this.state.recentSpeakerHistory.filter(s => s === 'host').length;

    // Calculate host-guest ratio (ideal ~0.3)
    const hostGuestRatio = totalTurns > 0 ? hostTurns / totalTurns : 0.3;

    // Calculate signal frequency (how often speakers signal desire to speak)
    const recentSignals = this.state.speakerQueue.length;
    const signalFrequency = Math.min(1, recentSignals / 3); // Normalize to 0-1

    // Topic depth: how many turns on current topic
    const topicDepth = this.state.currentThread
      ? this.state.claims.filter(c => c.timestampMs > Date.now() - 180000).length
      : 0;

    // Engagement score: composite of various factors
    const engagementScore = this.calculateEngagementScore(
      signalFrequency,
      hostGuestRatio,
      topicDepth
    );

    // Balance health assessment
    let balanceHealth: 'good' | 'host_heavy' | 'guest_heavy' = 'good';
    if (hostGuestRatio > 0.5) {
      balanceHealth = 'host_heavy';
    } else if (hostGuestRatio < 0.15 && totalTurns > 3) {
      balanceHealth = 'guest_heavy';
    }

    const momentum: MomentumMetrics = {
      signalFrequency,
      hostGuestRatio,
      topicDepth,
      engagementScore,
      balanceHealth,
    };

    this.state.momentum = momentum;

    logger.debug({
      sessionId: this.sessionId,
      momentum,
    }, 'Momentum calculated');

    return momentum;
  }

  /**
   * Calculate engagement score (0-100)
   */
  private calculateEngagementScore(
    signalFrequency: number,
    hostGuestRatio: number,
    topicDepth: number
  ): number {
    // Signal frequency contributes 30%
    const signalScore = signalFrequency * 30;

    // Balance contributes 40% (optimal around 0.3)
    const balanceDeviation = Math.abs(hostGuestRatio - 0.3);
    const balanceScore = Math.max(0, 40 - balanceDeviation * 80);

    // Topic depth contributes 30% (deeper is better, up to a point)
    const depthScore = Math.min(30, topicDepth * 5);

    return Math.round(signalScore + balanceScore + depthScore);
  }

  /**
   * Get current momentum metrics
   */
  getMomentum(): MomentumMetrics | undefined {
    return this.state.momentum;
  }

  // =========================================================================
  // THREAD TRACKING
  // =========================================================================

  private async updateCurrentThread(thread: string): Promise<void> {
    this.state.currentThread = thread;
    await this.repository.updateCurrentThread(this.sessionId, thread);
  }

  // =========================================================================
  // LLM EXTRACTION
  // =========================================================================

  /**
   * Extract structured information from utterance using fast LLM
   */
  private async extractFromUtterance(
    content: string,
    speakerName: string
  ): Promise<ExtractionResult> {
    const participantNamesList = Array.from(this.participantNames.values());

    const prompt = `Analyze this podcast conversation utterance and extract structured information.

SPEAKER: ${speakerName}
CONTENT: ${content}

OTHER PARTICIPANTS: ${participantNamesList.filter(n => n !== speakerName).join(', ')}

Extract the following (respond in JSON format only, no other text):
{
  "newTopics": ["topic1"],
  "claims": [
    {"content": "claim text", "stance": "assertion|hypothesis|question"}
  ],
  "agreementsWith": ["participant name"],
  "disagreementsWith": ["participant name"],
  "isKeyPoint": true,
  "topicMarker": "current topic being discussed",
  "emotionalIndicators": {
    "showsAgreement": false,
    "showsConcession": false,
    "showsExcitement": false,
    "showsFrustration": false
  }
}

Guidelines:
- newTopics: Only include if a genuinely new topic is introduced
- claims: Identify main points being made. Use "assertion" for facts/opinions, "hypothesis" for speculation, "question" for inquiries
- agreementsWith/disagreementsWith: Names of other participants they explicitly agree or disagree with
- isKeyPoint: True if this is a particularly insightful, important, or quotable point
- topicMarker: The main topic currently under discussion
- emotionalIndicators: Detect emotional signals in the utterance
  - showsAgreement: Speaker explicitly agrees ("I agree", "You're right", "That's fair")
  - showsConcession: Speaker changes position or yields ground ("I'll grant you", "Actually you have a point")
  - showsExcitement: High energy, enthusiasm, emphasis ("This is exactly it!", uses exclamations)
  - showsFrustration: Impatience, tension, pushback ("That's not what I said", "You're missing...")

Return only valid JSON.`;

    try {
      const response = await this.extractionClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.3, maxTokens: 400 }
      );

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyExtraction();
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Parse emotional indicators
      const emotionalIndicators: EmotionalIndicators | undefined = parsed.emotionalIndicators
        ? {
            showsAgreement: Boolean(parsed.emotionalIndicators.showsAgreement),
            showsConcession: Boolean(parsed.emotionalIndicators.showsConcession),
            showsExcitement: Boolean(parsed.emotionalIndicators.showsExcitement),
            showsFrustration: Boolean(parsed.emotionalIndicators.showsFrustration),
          }
        : undefined;

      return {
        newTopics: Array.isArray(parsed.newTopics) ? parsed.newTopics : [],
        claims: Array.isArray(parsed.claims) ? parsed.claims.map((c: any) => ({
          content: c.content || '',
          stance: this.parseStance(c.stance),
        })) : [],
        agreementsWith: Array.isArray(parsed.agreementsWith) ? parsed.agreementsWith : [],
        disagreementsWith: Array.isArray(parsed.disagreementsWith) ? parsed.disagreementsWith : [],
        isKeyPoint: Boolean(parsed.isKeyPoint),
        topicMarker: typeof parsed.topicMarker === 'string' ? parsed.topicMarker : undefined,
        emotionalIndicators,
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to extract from utterance');
      return this.emptyExtraction();
    }
  }

  private parseStance(stance: string): 'assertion' | 'hypothesis' | 'question' {
    const normalized = String(stance).toLowerCase();
    if (normalized === 'hypothesis') return 'hypothesis';
    if (normalized === 'question') return 'question';
    return 'assertion';
  }

  private emptyExtraction(): ExtractionResult {
    return {
      newTopics: [],
      claims: [],
      agreementsWith: [],
      disagreementsWith: [],
      isKeyPoint: false,
    };
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  /**
   * Load state from database
   */
  async load(): Promise<void> {
    const dbState = await this.repository.findBySessionId(this.sessionId);
    if (dbState) {
      this.state = dbState;
      logger.debug({ sessionId: this.sessionId }, 'Context board state loaded');
    }
  }

  /**
   * Initialize board in database
   */
  async initialize(): Promise<void> {
    await this.repository.ensureExists(this.sessionId);
    logger.info({ sessionId: this.sessionId }, 'Context board initialized in database');
  }

  /**
   * Get full state for persistence/export
   */
  exportState(): ContextBoardState {
    return { ...this.state };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a ContextBoardService for a session
 */
export async function createContextBoardService(
  pool: Pool,
  sessionId: string,
  participantNames: Map<string, string>
): Promise<ContextBoardService> {
  const service = new ContextBoardService(pool, sessionId, participantNames);
  await service.initialize();
  return service;
}

/**
 * Load existing ContextBoardService for a session
 */
export async function loadContextBoardService(
  pool: Pool,
  sessionId: string,
  participantNames: Map<string, string>
): Promise<ContextBoardService> {
  const service = new ContextBoardService(pool, sessionId, participantNames);
  await service.load();
  return service;
}
