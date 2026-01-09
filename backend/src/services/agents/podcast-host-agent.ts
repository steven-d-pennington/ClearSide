/**
 * Podcast Host Agent for Conversational Podcast Mode
 *
 * The talk show host that guides podcast conversations. Unlike debate moderators,
 * this agent acts like Terry Gross, Joe Rogan, or Lex Fridman: introducing guests
 * with backstories, presenting topics engagingly, asking probing questions, and
 * steering discussions organically.
 *
 * Uses extended thinking for complex decisions about conversation flow.
 */

import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type { ContextBoardService } from '../conversation/context-board-service.js';
import type {
  PodcastPersona,
  ConversationParticipant,
} from '../../types/conversation.js';
import { createOpenRouterClient, OpenRouterLLMClient } from '../llm/openrouter-adapter.js';

const logger = pino({
  name: 'podcast-host-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Default model for host (Claude Sonnet for quality + speed)
 */
const HOST_MODEL = 'anthropic/claude-sonnet-4';

/**
 * Guest info for host to reference
 */
export interface GuestInfo {
  participantId: string;
  persona: PodcastPersona;
  displayName: string;
  turnCount: number;
}

/**
 * Speaker decision result
 */
export interface SpeakerDecision {
  participantId: string;
  reason: string;
  addressDirectly: boolean;
  promptingQuestion?: string;
}

/**
 * Options for PodcastHostAgent
 */
export interface PodcastHostAgentOptions {
  llmClient?: LLMClient;
  sseManager?: SSEManager;
  sessionId: string;
  topic: string;
  topicContext?: string;
  guests: GuestInfo[];
}

/**
 * Conversation history entry
 */
interface ConversationEntry {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * PodcastHostAgent Class
 *
 * The talk show host that guides podcast conversations.
 * Uses extended thinking for complex flow decisions.
 *
 * Responsibilities:
 * - Generate engaging opening segments
 * - Decide who should speak next (considering signals, balance, flow)
 * - Ask probing follow-up questions
 * - Bridge between different viewpoints
 * - Redirect tangents back to topic
 * - Generate closing summaries without declaring winners
 */
export class PodcastHostAgent {
  private llmClient: LLMClient;
  private sseManager?: SSEManager;
  private sessionId: string;
  private topic: string;
  private topicContext?: string;
  private guests: GuestInfo[];
  private conversationHistory: ConversationEntry[];
  private systemPrompt: string;

  constructor(options: PodcastHostAgentOptions) {
    this.llmClient = options.llmClient || createOpenRouterClient(HOST_MODEL);
    this.sseManager = options.sseManager;
    this.sessionId = options.sessionId;
    this.topic = options.topic;
    this.topicContext = options.topicContext;
    this.guests = options.guests;

    this.systemPrompt = this.buildSystemPrompt();
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];

    logger.info({
      sessionId: this.sessionId,
      topic: this.topic,
      guestCount: this.guests.length,
    }, 'PodcastHostAgent initialized');
  }

  // =========================================================================
  // PUBLIC PROPERTIES
  // =========================================================================

  get name(): string {
    return 'Host';
  }

  get participantId(): string {
    return 'host';
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'PodcastHostAgent',
      version: '1.0.0',
      model: HOST_MODEL,
      capabilities: [
        'opening-generation',
        'speaker-selection',
        'follow-up-questions',
        'viewpoint-bridging',
        'closing-generation',
      ],
    };
  }

  // =========================================================================
  // SYSTEM PROMPT
  // =========================================================================

  private buildSystemPrompt(): string {
    const guestIntros = this.guests.map(g =>
      `- ${g.displayName} (${g.persona.avatarEmoji || '🎙️'}): ${this.getFirstSentence(g.persona.backstory)}`
    ).join('\n');

    return `You are the host of "Duel-Logic", a podcast where diverse thinkers explore complex topics together.
Your hosting style combines the best of Terry Gross, Joe Rogan, and Lex Fridman.

YOUR ROLE:
- Guide engaging, natural conversations between your guests
- Introduce each guest warmly with relevant backstory
- Ask probing, thoughtful questions that draw out insights
- Bridge between different viewpoints without taking sides
- Ensure everyone gets heard while keeping the conversation flowing
- Summarize discussions without declaring winners or "right" answers

TODAY'S TOPIC: ${this.topic}
${this.topicContext ? `\nCONTEXT: ${this.topicContext}` : ''}

YOUR GUESTS:
${guestIntros}

GUIDELINES:
1. Be warm and curious, never confrontational
2. Use guests' names naturally
3. Reference their backgrounds when relevant
4. Ask follow-up questions like "What do you mean by...?" or "Can you give an example?"
5. Notice when someone seems to want to respond and invite them in
6. Keep responses concise - you're the host, not the star
7. Never declare one guest "right" or "wrong"
8. Build bridges: "Interesting - [Name], how does that connect to what you said about...?"`;
  }

  private getFirstSentence(text: string): string {
    const match = text.match(/^[^.!?]+[.!?]/);
    return match ? match[0] : text.slice(0, 100);
  }

  // =========================================================================
  // GENERATION METHODS
  // =========================================================================

  /**
   * Generate the opening segment - introduce guests and topic
   */
  async generateOpening(): Promise<string> {
    logger.info({ sessionId: this.sessionId }, 'Generating podcast opening');

    const guestDetails = this.guests.map(g => `
${g.displayName}:
- Background: ${g.persona.backstory}
- Speaking style: ${g.persona.speakingStyle}
- Worldview: ${g.persona.worldview}`
    ).join('\n');

    const prompt = `Generate an engaging podcast opening (2-3 paragraphs).

SHOW NAME: Duel-Logic (always use this name when welcoming listeners)

GUESTS TO INTRODUCE:
${guestDetails}

TOPIC: ${this.topic}
${this.topicContext ? `CONTEXT: ${this.topicContext}` : ''}

Your opening should:
1. Welcome listeners to Duel-Logic
2. Introduce each guest with their name, a bit of their background, and what perspective they bring
3. Present the topic in an engaging, accessible way
4. End with an opening question directed at one specific guest

Be conversational and warm, like you're excited to have these guests together.`;

    try {
      const content = await this.generate(prompt, 'opening', 0.8, 600);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info({
        sessionId: this.sessionId,
        length: content.length,
      }, 'Opening generated');

      return content;
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to generate opening');
      throw error;
    }
  }

  /**
   * Decide who should speak next using extended thinking
   * Considers: signal queue, turn balance, topic coverage, natural flow
   */
  async decideNextSpeaker(
    contextBoard: ContextBoardService,
    recentTranscript: string
  ): Promise<SpeakerDecision> {
    const state = contextBoard.getState();
    const signalQueue = contextBoard.getSpeakerQueue();

    // Build turn counts info
    const turnCounts = this.guests.map(g => ({
      name: g.displayName,
      participantId: g.participantId,
      turns: g.turnCount,
    }));

    const signalInfo = signalQueue.length > 0
      ? `\nPENDING SIGNALS:\n${signalQueue.map(s => {
          const guest = this.guests.find(g => g.participantId === s.participantId);
          return `- ${guest?.displayName || s.participantName || 'Unknown'} (${s.urgency}): ${s.reason} - "${s.preview || 'wants to speak'}"`;
        }).join('\n')}`
      : '\nNo pending signals.';

    const topicsInfo = state.topicsDiscussed.length > 0
      ? state.topicsDiscussed.map(t => t.topic).join(', ')
      : 'none yet';

    const prompt = `Decide who should speak next in this podcast conversation.

RECENT TRANSCRIPT:
${recentTranscript}

CONTEXT BOARD STATE:
- Current thread: ${state.currentThread || 'general discussion'}
- Topics covered: ${topicsInfo}
- Active agreements: ${state.agreements.length}
- Active disagreements: ${state.disagreements.length}
${signalInfo}

TURN BALANCE:
${turnCounts.map(t => `- ${t.name}: ${t.turns} turns`).join('\n')}

Consider:
1. Does anyone have a high-urgency signal?
2. Is someone being left out of the conversation?
3. Would it be natural for someone to respond to what was just said?
4. Should I (the host) ask a follow-up question instead?

Respond in this EXACT format:
DECISION: [participant_id OR "host"]
REASON: [1-2 sentence explanation]
DIRECT_ADDRESS: [yes/no - should I call on them by name?]
QUESTION: [optional - if host should ask a specific question]`;

    try {
      // Use generation with higher token budget for complex reasoning
      const response = await this.generate(prompt, 'speaker_decision', 0.7, 400);
      return this.parseSpeakerDecision(response);
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to decide next speaker');
      // Fallback: pick least-spoken guest
      const leastSpoken = [...this.guests].sort((a, b) => a.turnCount - b.turnCount)[0];
      return {
        participantId: leastSpoken?.participantId || this.guests[0]?.participantId || 'host',
        reason: 'Fallback selection - ensuring balanced participation',
        addressDirectly: true,
      };
    }
  }

  /**
   * Generate a follow-up question for a specific guest
   */
  async generateFollowUp(
    targetGuest: GuestInfo,
    recentContent: string,
    reason: string
  ): Promise<string> {
    logger.info({
      sessionId: this.sessionId,
      targetGuest: targetGuest.displayName,
      reason,
    }, 'Generating follow-up question');

    const prompt = `Generate a follow-up question for ${targetGuest.displayName}.

WHAT THEY JUST SAID (or context):
${recentContent}

REASON FOR FOLLOW-UP: ${reason}

THEIR BACKGROUND:
${targetGuest.persona.backstory}

THEIR WORLDVIEW:
${targetGuest.persona.worldview}

Generate a natural, probing question that:
- Addresses them by name
- Digs deeper into what they said OR connects to their expertise
- Is conversational (1-2 sentences max)
- Shows genuine curiosity`;

    const content = await this.generate(prompt, 'followup', 0.8, 150);
    this.addToHistory('assistant', content);

    logger.info({
      sessionId: this.sessionId,
      targetGuest: targetGuest.displayName,
      length: content.length,
    }, 'Follow-up question generated');

    return content;
  }

  /**
   * Generate a bridge between two viewpoints
   */
  async generateBridge(
    guestA: GuestInfo,
    guestB: GuestInfo,
    pointOfConnection: string
  ): Promise<string> {
    logger.info({
      sessionId: this.sessionId,
      guestA: guestA.displayName,
      guestB: guestB.displayName,
    }, 'Generating bridge statement');

    const prompt = `Generate a bridging statement connecting viewpoints from ${guestA.displayName} and ${guestB.displayName}.

POINT OF CONNECTION: ${pointOfConnection}

${guestA.displayName}'s perspective:
${guestA.persona.worldview}

${guestB.displayName}'s perspective:
${guestB.persona.worldview}

Create a natural transition that:
- Acknowledges what ${guestA.displayName} said
- Draws a connection to ${guestB.displayName}'s perspective or expertise
- Invites ${guestB.displayName} to respond
- Is warm and curious, not confrontational (1-2 sentences)`;

    const content = await this.generate(prompt, 'bridge', 0.8, 120);
    this.addToHistory('assistant', content);

    logger.info({
      sessionId: this.sessionId,
      length: content.length,
    }, 'Bridge statement generated');

    return content;
  }

  /**
   * Generate a redirection when conversation goes off track
   */
  async generateRedirect(
    currentTangent: string,
    desiredDirection: string
  ): Promise<string> {
    logger.info({
      sessionId: this.sessionId,
      desiredDirection,
    }, 'Generating redirect');

    const prompt = `Generate a gentle redirect for the conversation.

CURRENT TANGENT: ${currentTangent}
DESIRED DIRECTION: ${desiredDirection}

Create a natural transition that:
- Acknowledges the current discussion briefly
- Smoothly steers toward the desired topic
- Doesn't feel abrupt or dismissive
- Is 1-2 sentences`;

    const content = await this.generate(prompt, 'redirect', 0.7, 100);
    this.addToHistory('assistant', content);

    logger.info({
      sessionId: this.sessionId,
      length: content.length,
    }, 'Redirect generated');

    return content;
  }

  /**
   * Generate a brief interjection to keep conversation flowing
   */
  async generateInterjection(
    lastSpeaker: string,
    context: string
  ): Promise<string> {
    const prompt = `Generate a brief host interjection (1 sentence max) after ${lastSpeaker} spoke.

CONTEXT: ${context}

This should be a natural reaction that:
- Shows you're listening ("That's interesting...", "Hmm, I hadn't considered...")
- Optionally prompts someone else to react
- Keeps the energy flowing`;

    const content = await this.generate(prompt, 'interjection', 0.85, 50);
    this.addToHistory('assistant', content);
    return content;
  }

  /**
   * Generate closing remarks - summarize without declaring winners
   */
  async generateClosing(
    contextBoard: ContextBoardService,
    _fullTranscript?: string
  ): Promise<string> {
    logger.info({ sessionId: this.sessionId }, 'Generating podcast closing');

    const state = contextBoard.getState();

    const keyPointsSummary = Object.entries(state.keyPointsByParticipant)
      .map(([id, points]) => {
        const guest = this.guests.find(g => g.participantId === id);
        const displayPoints = Array.isArray(points) ? points.slice(0, 2).join('; ') : '';
        return `${guest?.displayName || 'Guest'}: ${displayPoints}`;
      })
      .filter(line => line.includes(':') && !line.endsWith(': '))
      .join('\n');

    const topicsInfo = state.topicsDiscussed.length > 0
      ? state.topicsDiscussed.map(t => `- ${t.topic} (${t.status})`).join('\n')
      : '- General discussion';

    const prompt = `Generate a warm closing for this podcast conversation.

TOPICS COVERED:
${topicsInfo}

KEY POINTS BY GUEST:
${keyPointsSummary || 'Various perspectives shared throughout'}

AGREEMENTS REACHED: ${state.agreements.length}
DISAGREEMENTS: ${state.disagreements.length}

YOUR GUESTS (to thank):
${this.guests.map(g => `- ${g.displayName}`).join('\n')}

Your closing should:
1. Thank each guest by name for their unique contribution
2. Summarize 2-3 key threads WITHOUT declaring anyone right or wrong
3. Note any interesting agreements or productive tensions
4. End warmly, leaving listeners with something to think about

Be genuine and appreciative. This is a conversation, not a competition.`;

    try {
      const content = await this.generate(prompt, 'closing', 0.8, 450);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info({ sessionId: this.sessionId }, 'Closing generated');
      return content;
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to generate closing');
      throw error;
    }
  }

  // =========================================================================
  // UPDATE METHODS
  // =========================================================================

  /**
   * Update guest turn count
   */
  updateGuestTurnCount(participantId: string): void {
    const guest = this.guests.find(g => g.participantId === participantId);
    if (guest) {
      guest.turnCount++;
      logger.debug({
        sessionId: this.sessionId,
        participantId,
        newTurnCount: guest.turnCount,
      }, 'Updated guest turn count');
    }
  }

  /**
   * Get a guest by participant ID
   */
  getGuest(participantId: string): GuestInfo | undefined {
    return this.guests.find(g => g.participantId === participantId);
  }

  /**
   * Get all guests
   */
  getGuests(): GuestInfo[] {
    return [...this.guests];
  }

  /**
   * Add conversation context
   */
  addContext(content: string): void {
    this.addToHistory('user', `[CONVERSATION]: ${content}`);
  }

  /**
   * Add a message from a participant to history
   */
  addParticipantMessage(speakerName: string, content: string): void {
    this.addToHistory('user', `[${speakerName}]: ${content}`);
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private parseSpeakerDecision(response: string): SpeakerDecision {
    const decisionMatch = response.match(/DECISION:\s*(\S+)/i);
    const reasonMatch = response.match(/REASON:\s*(.+?)(?=\n|DIRECT|QUESTION|$)/is);
    const directMatch = response.match(/DIRECT_ADDRESS:\s*(yes|no)/i);
    const questionMatch = response.match(/QUESTION:\s*(.+)/i);

    let participantId = decisionMatch?.[1]?.toLowerCase() || 'host';

    // Try to match participant ID with guests
    if (participantId !== 'host') {
      // Check if it's an exact match
      const exactMatch = this.guests.find(g =>
        g.participantId.toLowerCase() === participantId
      );

      if (!exactMatch) {
        // Try to find by name
        const byName = this.guests.find(g =>
          g.displayName.toLowerCase().includes(participantId) ||
          participantId.includes(g.displayName.toLowerCase().split(' ')[0] || '')
        );

        if (byName) {
          participantId = byName.participantId;
        } else {
          // Default to first guest if no match
          participantId = this.guests[0]?.participantId || 'host';
        }
      }
    }

    return {
      participantId,
      reason: reasonMatch?.[1]?.trim() || 'Natural flow',
      addressDirectly: directMatch?.[1]?.toLowerCase() === 'yes',
      promptingQuestion: questionMatch?.[1]?.trim(),
    };
  }

  private async generate(
    prompt: string,
    segment: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const messages = [...this.conversationHistory, { role: 'user' as const, content: prompt }];

    if (this.sseManager && this.llmClient instanceof OpenRouterLLMClient) {
      return this.generateWithStreaming(messages, segment, temperature, maxTokens);
    }

    return this.llmClient.chat(messages, { temperature, maxTokens });
  }

  private async generateWithStreaming(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    segment: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const chunks: string[] = [];

    try {
      const stream = (this.llmClient as OpenRouterLLMClient).streamChat(
        messages,
        { temperature, maxTokens }
      );

      for await (const chunk of stream) {
        chunks.push(chunk);

        // Broadcast token via SSE using conversation_token event type
        // Note: SSE manager uses broadcastToDebate, we reuse it for conversations
        // by using the sessionId as the "debateId" parameter
        if (this.sseManager) {
          this.sseManager.broadcastToDebate(this.sessionId, 'conversation_token' as any, {
            participantId: 'host',
            personaSlug: 'host',
            personaName: 'Host',
            segment,
            token: chunk,
          });
        }
      }

      return chunks.join('');
    } catch (error) {
      logger.error(
        { error, segment, sessionId: this.sessionId },
        'Streaming generation failed'
      );
      throw error;
    }
  }

  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Trim if too long (keep system prompt + last 40 exchanges)
    const maxEntries = 41; // 1 system + 40 user/assistant pairs
    if (this.conversationHistory.length > maxEntries) {
      const systemPrompt = this.conversationHistory[0];
      if (systemPrompt) {
        this.conversationHistory = [
          systemPrompt,
          ...this.conversationHistory.slice(-(maxEntries - 1)),
        ];
      }
    }
  }

  /**
   * Get conversation history length
   */
  getHistoryLength(): number {
    return this.conversationHistory.length;
  }

  /**
   * Clear conversation history (keep system prompt)
   */
  clearHistory(): void {
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];
    logger.debug({ sessionId: this.sessionId }, 'Conversation history cleared');
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a PodcastHostAgent for a session
 */
export function createPodcastHostAgent(
  sessionId: string,
  topic: string,
  guests: Array<{ participant: ConversationParticipant; persona: PodcastPersona }>,
  topicContext?: string,
  sseManager?: SSEManager
): PodcastHostAgent {
  const guestInfos: GuestInfo[] = guests.map(g => ({
    participantId: g.participant.id,
    persona: g.persona,
    displayName: g.participant.displayNameOverride || g.persona.name,
    turnCount: 0,
  }));

  return new PodcastHostAgent({
    sessionId,
    topic,
    topicContext,
    guests: guestInfos,
    sseManager,
  });
}

/**
 * Create a PodcastHostAgent with a custom LLM client
 */
export function createPodcastHostAgentWithClient(
  sessionId: string,
  topic: string,
  guests: GuestInfo[],
  llmClient: LLMClient,
  topicContext?: string,
  sseManager?: SSEManager
): PodcastHostAgent {
  return new PodcastHostAgent({
    sessionId,
    topic,
    topicContext,
    guests,
    llmClient,
    sseManager,
  });
}
