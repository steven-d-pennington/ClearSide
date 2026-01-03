/**
 * Informal Discussion Orchestrator
 *
 * Orchestrates freeform discussions between 2+ AI models without
 * structured debate roles, phases, or moderation.
 *
 * Key differences from LivelyDebateOrchestrator:
 * - No phases - just continuous exchanges
 * - No Pro/Con roles - generic participants
 * - No moderator - self-directed discussion
 * - Hybrid ending: max exchanges + user wrap-up + AI detection
 * - Brief wrap-up turns at the end
 * - Auto-generated summary
 */

import pino from 'pino';
import type { SSEManager } from '../sse/sse-manager.js';
import type { SimpleLLMRequest, LLMResponse } from '../../types/llm.js';
import type {
  InformalParticipant,
  InformalState,
  InformalSummary,
  EndDetectionContext,
  EndDetectionResult,
  DiscussionStyle,
  DiscussionTone,
} from '../../types/informal.js';
import { INFORMAL_DEFAULTS } from '../../types/informal.js';
import { EndDetector, createEndDetector } from './end-detector.js';
import { createOpenRouterClient } from '../llm/openrouter-adapter.js';
import * as debateRepo from '../../db/repositories/debate-repository.js';
import * as utteranceRepo from '../../db/repositories/utterance-repository.js';
import type { CreateUtteranceInput } from '../../types/database.js';

const logger = pino({
  name: 'informal-orchestrator',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Interface for LLM client
 */
interface InformalLLMClient {
  complete(request: SimpleLLMRequest): Promise<LLMResponse>;
  streamChat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<string, void, unknown>;
}

/**
 * Participant with LLM client attached
 */
interface ActiveParticipant extends InformalParticipant {
  llmClient: InformalLLMClient;
}

/**
 * Style-specific instructions for participants
 */
const STYLE_INSTRUCTIONS: Record<DiscussionStyle, string> = {
  collaborative: `Guidelines:
- Keep responses conversational (2-4 paragraphs, 150-300 words)
- You may agree, disagree, ask questions, or introduce new angles
- Acknowledge and build upon points made by others
- Be intellectually curious and open-minded
- Share perspectives while remaining open to other views`,

  natural_disagreement: `Guidelines:
- Keep responses conversational (2-4 paragraphs, 150-300 words)
- Actively look for points of disagreement with other participants
- Challenge assumptions and conclusions you find questionable
- Present alternative perspectives and counterarguments
- Ask probing questions that test the strength of arguments
- It's okay to firmly disagree - intellectual conflict drives clarity
- Don't agree just to be agreeable - push back when you see flaws`,

  devils_advocate: `Guidelines:
- Keep responses conversational (2-4 paragraphs, 150-300 words)
- Your role is to challenge every position taken by other participants
- Find the strongest counterarguments to whatever is being claimed
- Point out overlooked risks, edge cases, and potential failures
- Question the evidence and reasoning behind assertions
- Don't agree easily - your job is to stress-test ideas
- Play the skeptic even if you might personally agree`,
};

/**
 * Instructions for non-devil's advocate participants when someone else is the devil's advocate
 */
const NON_DEVILS_ADVOCATE_INSTRUCTIONS = `Guidelines:
- Keep responses conversational (2-4 paragraphs, 150-300 words)
- One participant ({devilsAdvocateName}) will challenge your positions
- Defend your ideas thoughtfully but remain open to valid critiques
- Acknowledge when the devil's advocate raises a good point
- Strengthen your arguments in response to challenges`;

/**
 * Tone-specific instructions
 */
const TONE_INSTRUCTIONS: Record<DiscussionTone, string> = {
  respectful: `Tone:
- Maintain professional, collegial discourse
- Disagree with ideas, not people
- Use measured language even when strongly disagreeing`,

  spirited: `Tone:
- Engage with passion and conviction
- Use emphatic language when you disagree
- Be direct and pointed in your critiques
- Don't soften valid criticisms - clarity over comfort
- Make your disagreements memorable and impactful`,
};

/**
 * Build dynamic system prompt based on style and tone
 */
function buildParticipantSystemPrompt(
  topic: string,
  participantName: string,
  otherParticipants: string,
  style: DiscussionStyle,
  tone: DiscussionTone,
  isDevilsAdvocate: boolean,
  devilsAdvocateName?: string
): string {
  let styleInstructions: string;

  if (style === 'devils_advocate') {
    if (isDevilsAdvocate) {
      styleInstructions = STYLE_INSTRUCTIONS.devils_advocate;
    } else {
      styleInstructions = NON_DEVILS_ADVOCATE_INSTRUCTIONS.replace(
        '{devilsAdvocateName}',
        devilsAdvocateName || 'The Devil\'s Advocate'
      );
    }
  } else {
    styleInstructions = STYLE_INSTRUCTIONS[style];
  }

  const toneInstructions = TONE_INSTRUCTIONS[tone];

  return `You are participating in an informal discussion about the following topic:

Topic: ${topic}

You are ${participantName}.${isDevilsAdvocate ? ' You are playing the role of Devil\'s Advocate.' : ''}

${styleInstructions}

${toneInstructions}

Other participants in this discussion: ${otherParticipants}`;
}

/**
 * Wrap-up prompt for final summary turns
 */
const WRAPUP_PROMPT = `The discussion is wrapping up. Please provide a brief summary of your key takeaways from this conversation.

In 2-3 sentences:
- What was the most valuable insight or perspective raised?
- What did you learn or find most interesting?
- Is there anything that remains unresolved or worth exploring further?

Keep your wrap-up concise and reflective.`;

/**
 * Summary generation prompt
 */
const SUMMARY_GENERATION_PROMPT = `Generate a concise summary of this informal discussion.

Topic: {topic}
Participants: {participants}

Full transcript:
{transcript}

Provide a JSON response with the following structure:
{
  "topicsCovered": ["topic1", "topic2", ...],
  "keyInsights": ["insight1", "insight2", ...],
  "areasOfAgreement": ["agreement1", "agreement2", ...],
  "areasOfDisagreement": ["disagreement1", "disagreement2", ...],
  "participantHighlights": [
    {"participant": "Name", "highlight": "Their standout contribution"},
    ...
  ]
}

Be concise but comprehensive. Focus on the most significant points.`;

/**
 * Configuration for informal orchestrator
 */
export interface InformalOrchestratorConfig {
  discussionId: string;
  topic: string;
  topicContext?: string;
  participants: InformalParticipant[];
  maxExchanges: number;
  endDetection: {
    enabled: boolean;
    checkInterval: number;
    confidenceThreshold: number;
  };
  broadcastEvents?: boolean;
  /** Discussion style: collaborative, natural_disagreement, or devils_advocate */
  discussionStyle: DiscussionStyle;
  /** Discussion tone: respectful or spirited */
  tone: DiscussionTone;
  /** Participant ID assigned as devil's advocate (only for devils_advocate style) */
  devilsAdvocateParticipantId?: string;
}

/**
 * Informal Discussion Orchestrator Class
 */
export class InformalOrchestrator {
  private readonly discussionId: string;
  private readonly topic: string;
  // Reserved for future context injection
  public readonly topicContext?: string;
  private readonly config: InformalOrchestratorConfig;
  private readonly sseManager: SSEManager;
  private readonly endDetector: EndDetector;

  private readonly participants: ActiveParticipant[] = [];
  private readonly broadcastEvents: boolean;
  private readonly discussionStyle: DiscussionStyle;
  private readonly tone: DiscussionTone;
  private readonly devilsAdvocateParticipantId?: string;
  private devilsAdvocateName?: string;

  private state: InformalState;
  private startTimeMs: number = 0;
  private isRunning: boolean = false;
  private wrapUpRequested: boolean = false;

  /** Track all utterances for summary generation */
  private utterances: Array<{
    participant: string;
    content: string;
    exchangeNumber: number;
    isWrapUp: boolean;
  }> = [];

  constructor(config: InformalOrchestratorConfig, sseManager: SSEManager) {
    this.discussionId = config.discussionId;
    this.topic = config.topic;
    this.topicContext = config.topicContext;
    this.config = config;
    this.sseManager = sseManager;
    this.broadcastEvents = config.broadcastEvents ?? true;
    this.discussionStyle = config.discussionStyle;
    this.tone = config.tone;
    this.devilsAdvocateParticipantId = config.devilsAdvocateParticipantId;

    // Initialize state
    this.state = {
      exchangeCount: 0,
      currentParticipantIndex: 0,
      isWrappingUp: false,
      isComplete: false,
    };

    // Create LLM clients for each participant
    for (const participant of config.participants) {
      const llmClient = createOpenRouterClient(participant.modelId);
      this.participants.push({
        ...participant,
        llmClient,
      });

      // Track devil's advocate name if applicable
      if (config.devilsAdvocateParticipantId === participant.id) {
        this.devilsAdvocateName = participant.name;
      }
    }

    // Create end detector with fast model
    const endDetectorClient = createOpenRouterClient('google/gemini-2.0-flash-001');
    this.endDetector = createEndDetector(
      config.discussionId,
      endDetectorClient,
      config.endDetection
    );

    logger.info(
      {
        discussionId: this.discussionId,
        topic: this.topic,
        participantCount: this.participants.length,
        maxExchanges: config.maxExchanges,
      },
      'InformalOrchestrator created'
    );
  }

  /**
   * Start the informal discussion
   */
  async start(): Promise<void> {
    logger.info({ discussionId: this.discussionId }, 'Starting informal discussion');

    this.startTimeMs = Date.now();
    this.isRunning = true;

    // Update database status
    await debateRepo.updateStatus(this.discussionId, { status: 'live' });

    // Broadcast discussion started
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.discussionId, 'discussion_started', {
        discussionId: this.discussionId,
        topic: this.topic,
        participants: this.participants.map((p) => ({
          id: p.id,
          name: p.name,
          modelId: p.modelId,
        })),
        maxExchanges: this.config.maxExchanges,
        timestampMs: 0,
      });
    }

    try {
      // Execute the discussion
      await this.executeDiscussion();

      // Execute wrap-up turns
      await this.executeWrapUpTurns();

      // Generate summary
      const summary = await this.generateSummary();

      // Save summary to database
      await this.saveSummary(summary);

      // Broadcast summary
      if (this.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.discussionId, 'discussion_summary', {
          discussionId: this.discussionId,
          summary,
          timestampMs: this.getElapsedMs(),
        });
      }

      // Mark complete
      this.state.isComplete = true;
      await debateRepo.complete(this.discussionId);

      // Broadcast completion
      if (this.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.discussionId, 'discussion_complete', {
          discussionId: this.discussionId,
          completedAt: new Date().toISOString(),
          totalDurationMs: this.getElapsedMs(),
          totalExchanges: this.state.exchangeCount,
          endTrigger: this.state.endTrigger,
          summary,
        });
      }

      logger.info(
        {
          discussionId: this.discussionId,
          totalExchanges: this.state.exchangeCount,
          endTrigger: this.state.endTrigger,
        },
        'Informal discussion completed'
      );

    } catch (error) {
      logger.error({ error, discussionId: this.discussionId }, 'Discussion failed');
      await debateRepo.updateStatus(this.discussionId, { status: 'error' });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Request early wrap-up (user-triggered)
   */
  requestWrapUp(): void {
    logger.info({ discussionId: this.discussionId }, 'User requested wrap-up');
    this.wrapUpRequested = true;
    this.state.endTrigger = 'user_wrapup';
  }

  /**
   * Stop the discussion immediately
   */
  async stop(): Promise<void> {
    logger.info({ discussionId: this.discussionId }, 'Stopping discussion');
    this.isRunning = false;
    await debateRepo.updateStatus(this.discussionId, { status: 'completed' });
  }

  /**
   * Get current state
   */
  getState(): InformalState {
    return { ...this.state };
  }

  // ===========================================================================
  // Discussion Execution
  // ===========================================================================

  /**
   * Execute the main discussion loop
   */
  private async executeDiscussion(): Promise<void> {
    while (this.isRunning && this.state.exchangeCount < this.config.maxExchanges) {
      // Check for user wrap-up request
      if (this.wrapUpRequested) {
        logger.info({ discussionId: this.discussionId }, 'Breaking for user wrap-up');
        break;
      }

      // Execute one exchange (all participants speak once)
      await this.executeExchange();

      // Check for AI-detected end (every N exchanges)
      if (
        this.config.endDetection.enabled &&
        this.state.exchangeCount >= INFORMAL_DEFAULTS.minExchanges &&
        this.state.exchangeCount % this.config.endDetection.checkInterval === 0
      ) {
        const result = await this.checkForNaturalEnd();
        if (result.shouldEnd && result.confidence >= this.config.endDetection.confidenceThreshold) {
          logger.info(
            { confidence: result.confidence, reasons: result.reasons },
            'AI detected natural end'
          );
          this.state.endTrigger = 'ai_detected';

          // Broadcast end detection result
          if (this.broadcastEvents) {
            this.sseManager.broadcastToDebate(this.discussionId, 'end_detection_result', {
              discussionId: this.discussionId,
              result,
              timestampMs: this.getElapsedMs(),
            });
          }

          break;
        }
      }
    }

    // Set end trigger if not already set
    if (!this.state.endTrigger) {
      this.state.endTrigger = 'max_exchanges';
    }
  }

  /**
   * Execute one exchange (all participants speak once)
   */
  private async executeExchange(): Promise<void> {
    const exchangeNumber = this.state.exchangeCount + 1;

    logger.debug(
      { discussionId: this.discussionId, exchangeNumber },
      'Starting exchange'
    );

    // Each participant speaks once in round-robin order
    for (let i = 0; i < this.participants.length; i++) {
      if (!this.isRunning || this.wrapUpRequested) break;

      const participant = this.participants[i]!;  // Safe: i is always within bounds
      this.state.currentParticipantIndex = i;

      await this.executeParticipantTurn(participant, exchangeNumber, false);
    }

    this.state.exchangeCount = exchangeNumber;

    // Broadcast exchange complete
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.discussionId, 'exchange_complete', {
        discussionId: this.discussionId,
        exchangeNumber,
        maxExchanges: this.config.maxExchanges,
        timestampMs: this.getElapsedMs(),
      });
    }
  }

  /**
   * Execute a single participant's turn
   */
  private async executeParticipantTurn(
    participant: ActiveParticipant,
    exchangeNumber: number,
    isWrapUp: boolean
  ): Promise<string> {
    const startMs = this.getElapsedMs();

    // Broadcast turn started
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.discussionId, 'speaker_started', {
        discussionId: this.discussionId,
        speaker: participant.id,
        speakerName: participant.name,
        exchangeNumber,
        isWrapUp,
        timestampMs: startMs,
      });
    }

    try {
      // Build messages for this turn
      const messages = this.buildParticipantMessages(participant, isWrapUp);

      // Stream the response
      let fullContent = '';
      const stream = participant.llmClient.streamChat(messages, {
        temperature: 0.7,
        maxTokens: isWrapUp ? 200 : 500,
      });

      for await (const chunk of stream) {
        if (!this.isRunning) break;

        fullContent += chunk;

        // Broadcast token chunk
        if (this.broadcastEvents) {
          this.sseManager.broadcastToDebate(this.discussionId, 'token_chunk', {
            discussionId: this.discussionId,
            speaker: participant.id,
            chunk,
            timestampMs: this.getElapsedMs(),
          });
        }
      }

      // Track utterance
      this.utterances.push({
        participant: participant.name,
        content: fullContent,
        exchangeNumber,
        isWrapUp,
      });

      // Save to database
      await this.saveUtterance(participant, fullContent, exchangeNumber, isWrapUp);

      // Broadcast utterance complete
      if (this.broadcastEvents) {
        this.sseManager.broadcastToDebate(this.discussionId, 'utterance', {
          discussionId: this.discussionId,
          speaker: participant.id,
          speakerName: participant.name,
          content: fullContent,
          exchangeNumber,
          isWrapUp,
          model: participant.modelId,
          timestampMs: this.getElapsedMs(),
        });
      }

      logger.debug(
        {
          participant: participant.name,
          contentLength: fullContent.length,
          exchangeNumber,
          isWrapUp,
        },
        'Participant turn complete'
      );

      return fullContent;

    } catch (error) {
      logger.error(
        { error, participant: participant.name, exchangeNumber },
        'Error in participant turn'
      );
      throw error;
    }
  }

  /**
   * Build messages for a participant's turn
   */
  private buildParticipantMessages(
    participant: ActiveParticipant,
    isWrapUp: boolean
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    // Build system prompt
    const otherNames = this.participants
      .filter((p) => p.id !== participant.id)
      .map((p) => p.name)
      .join(', ');

    const isDevilsAdvocate = this.devilsAdvocateParticipantId === participant.id;

    const systemPrompt = buildParticipantSystemPrompt(
      this.topic,
      participant.name,
      otherNames,
      this.discussionStyle,
      this.tone,
      isDevilsAdvocate,
      this.devilsAdvocateName
    );

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const utterance of this.utterances) {
      if (utterance.isWrapUp) continue; // Don't include wrap-up turns in context

      const role: 'user' | 'assistant' =
        utterance.participant === participant.name ? 'assistant' : 'user';

      const prefix = role === 'user' ? `[${utterance.participant}]: ` : '';
      messages.push({
        role,
        content: prefix + utterance.content,
      });
    }

    // Add user prompt for this turn
    if (isWrapUp) {
      messages.push({ role: 'user', content: WRAPUP_PROMPT });
    } else if (this.utterances.length === 0) {
      // First turn - ask to start the discussion
      messages.push({
        role: 'user',
        content: `Please begin the discussion by sharing your initial thoughts on the topic: "${this.topic}"`,
      });
    } else {
      // Continuing discussion - ask for response
      messages.push({
        role: 'user',
        content: 'Please continue the discussion by responding to the points raised.',
      });
    }

    return messages;
  }

  // ===========================================================================
  // Wrap-up and Summary
  // ===========================================================================

  /**
   * Execute wrap-up turns for all participants
   */
  private async executeWrapUpTurns(): Promise<void> {
    logger.info({ discussionId: this.discussionId }, 'Starting wrap-up phase');

    this.state.isWrappingUp = true;

    // Broadcast entering wrap-up
    if (this.broadcastEvents) {
      this.sseManager.broadcastToDebate(this.discussionId, 'entering_wrapup', {
        discussionId: this.discussionId,
        endTrigger: this.state.endTrigger,
        timestampMs: this.getElapsedMs(),
      });
    }

    // Each participant gets a wrap-up turn
    for (const participant of this.participants) {
      if (!this.isRunning) break;
      await this.executeParticipantTurn(participant, this.state.exchangeCount + 1, true);
    }
  }

  /**
   * Generate auto-summary of the discussion
   */
  private async generateSummary(): Promise<InformalSummary> {
    logger.info({ discussionId: this.discussionId }, 'Generating discussion summary');

    // Use a capable model for summary generation
    const summaryClient = createOpenRouterClient('anthropic/claude-sonnet-4');

    // Build transcript for summary
    const transcript = this.utterances
      .filter((u) => !u.isWrapUp)
      .map((u) => `[${u.participant}]: ${u.content}`)
      .join('\n\n');

    const participantNames = this.participants.map((p) => p.name).join(', ');

    const prompt = SUMMARY_GENERATION_PROMPT
      .replace('{topic}', this.topic)
      .replace('{participants}', participantNames)
      .replace('{transcript}', transcript);

    try {
      const response = await summaryClient.complete({
        messages: [
          {
            role: 'system',
            content: 'You are summarizing an informal discussion. Respond only in valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 500,
      });

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in summary response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const summary: InformalSummary = {
        topicsCovered: parsed.topicsCovered || [],
        keyInsights: parsed.keyInsights || [],
        areasOfAgreement: parsed.areasOfAgreement || [],
        areasOfDisagreement: parsed.areasOfDisagreement || [],
        participantHighlights: parsed.participantHighlights || [],
        generatedAt: new Date().toISOString(),
      };

      logger.info(
        { discussionId: this.discussionId, topicCount: summary.topicsCovered.length },
        'Summary generated'
      );

      return summary;

    } catch (error) {
      logger.error({ error, discussionId: this.discussionId }, 'Error generating summary');

      // Return empty summary on error
      return {
        topicsCovered: [],
        keyInsights: [],
        areasOfAgreement: [],
        areasOfDisagreement: [],
        participantHighlights: [],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // ===========================================================================
  // End Detection
  // ===========================================================================

  /**
   * Check if discussion should end naturally
   */
  private async checkForNaturalEnd(): Promise<EndDetectionResult> {
    // Build context from recent exchanges
    const recentExchangeCount = Math.min(5, this.state.exchangeCount);
    const recentUtterances = this.utterances.slice(-recentExchangeCount * this.participants.length);

    // Group by exchange
    const recentExchanges: EndDetectionContext['recentExchanges'] = [];
    let currentExchange: EndDetectionContext['recentExchanges'][0] | null = null;

    for (const u of recentUtterances) {
      if (!currentExchange || currentExchange.exchangeNumber !== u.exchangeNumber) {
        if (currentExchange) {
          recentExchanges.push(currentExchange);
        }
        currentExchange = {
          exchangeNumber: u.exchangeNumber,
          utterances: [],
        };
      }
      currentExchange.utterances.push({
        participant: u.participant,
        content: u.content,
      });
    }
    if (currentExchange) {
      recentExchanges.push(currentExchange);
    }

    const context: EndDetectionContext = {
      discussionId: this.discussionId,
      topic: this.topic,
      recentExchanges,
      totalExchanges: this.state.exchangeCount,
      maxExchanges: this.config.maxExchanges,
    };

    return await this.endDetector.evaluate(context);
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  /**
   * Save utterance to database
   */
  private async saveUtterance(
    participant: ActiveParticipant,
    content: string,
    exchangeNumber: number,
    isWrapUp: boolean
  ): Promise<void> {
    const input: CreateUtteranceInput = {
      debateId: this.discussionId,
      phase: isWrapUp ? 'wrapup' : 'informal',
      speaker: participant.id as 'participant_1' | 'participant_2' | 'participant_3' | 'participant_4',
      content,
      timestampMs: this.getElapsedMs(),
      metadata: {
        participantName: participant.name,
        modelId: participant.modelId,
        exchangeNumber,
        isWrapUp,
        discussionMode: 'informal',
      },
    };

    await utteranceRepo.create(input);
  }

  /**
   * Save summary to database
   */
  private async saveSummary(summary: InformalSummary): Promise<void> {
    // Update debate record with summary
    // This uses the informal_summary column added in migration 009
    await debateRepo.updateInformalSummary(
      this.discussionId,
      summary as unknown as Record<string, unknown>
    );
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get elapsed time since discussion start
   */
  private getElapsedMs(): number {
    return Date.now() - this.startTimeMs;
  }
}

/**
 * Create an informal orchestrator
 */
export async function createInformalOrchestrator(
  discussionId: string,
  topic: string,
  sseManager: SSEManager,
  config: {
    topicContext?: string;
    participants: Array<{
      name?: string;
      modelId: string;
      persona?: string;
    }>;
    maxExchanges?: number;
    endDetectionEnabled?: boolean;
    endDetectionInterval?: number;
    endDetectionThreshold?: number;
    discussionStyle?: DiscussionStyle;
    tone?: DiscussionTone;
    devilsAdvocateParticipantId?: string;
  }
): Promise<InformalOrchestrator> {
  // Assign default names if not provided
  const participants: InformalParticipant[] = config.participants.map((p, index) => ({
    id: `participant_${index + 1}`,
    name: p.name || `Participant ${index + 1}`,
    modelId: p.modelId,
    persona: p.persona,
  }));

  const orchestratorConfig: InformalOrchestratorConfig = {
    discussionId,
    topic,
    topicContext: config.topicContext,
    participants,
    maxExchanges: config.maxExchanges ?? INFORMAL_DEFAULTS.maxExchanges,
    endDetection: {
      enabled: config.endDetectionEnabled ?? INFORMAL_DEFAULTS.endDetection.enabled,
      checkInterval: config.endDetectionInterval ?? INFORMAL_DEFAULTS.endDetection.checkInterval,
      confidenceThreshold: config.endDetectionThreshold ?? INFORMAL_DEFAULTS.endDetection.confidenceThreshold,
    },
    discussionStyle: config.discussionStyle ?? INFORMAL_DEFAULTS.discussionStyle,
    tone: config.tone ?? INFORMAL_DEFAULTS.tone,
    devilsAdvocateParticipantId: config.devilsAdvocateParticipantId,
  };

  return new InformalOrchestrator(orchestratorConfig, sseManager);
}
