/**
 * Persona Agent for Conversational Podcast Mode
 *
 * Persona agents represent character personas in podcast conversations.
 * Unlike ChairAgent which argues from philosophical frameworks, PersonaAgent
 * embodies a character persona with distinct speaking style, worldview, and quirks.
 */

import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type { RAGRetrievalService } from '../research/rag-retrieval-service.js';
import type {
  PodcastPersona,
  ConversationParticipant,
  SpeakerSignal,
  SignalReason,
} from '../../types/conversation.js';
import type {
  ConversationTruncationDetectedEventData,
  ConversationTruncationRetryEventData,
} from '../../types/sse.js';
import { createOpenRouterClient, OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import {
  buildPersonaSystemPrompt,
  buildResponsePrompt,
  buildSpeakingDesirePrompt,
  buildIntroductionResponsePrompt,
  buildDirectAddressPrompt,
  extractAddressedParticipant,
} from './prompts/persona-prompts.js';

const logger = pino({
  name: 'persona-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Error thrown when a persona agent receives an empty response from the LLM
 */
export class EmptyPersonaResponseError extends Error {
  public readonly personaSlug: string;
  public readonly modelId: string;
  public readonly segment: string;

  constructor(personaSlug: string, modelId: string, segment: string) {
    super(`Empty response from model ${modelId} for persona ${personaSlug} during ${segment}`);
    this.name = 'EmptyPersonaResponseError';
    this.personaSlug = personaSlug;
    this.modelId = modelId;
    this.segment = segment;
  }
}

/**
 * Minimum content length to consider a response valid
 */
const MIN_CONTENT_LENGTH = 10;

/**
 * Maximum retries for empty responses
 */
const MAX_EMPTY_RETRIES = 2;

/**
 * Maximum retries for truncated responses
 */
const MAX_TRUNCATION_RETRIES = 1;

/**
 * Check if content appears to be truncated (ends mid-sentence)
 * Returns true if the content likely got cut off before completion
 */
function detectTruncation(content: string, finishReason: 'stop' | 'length' | 'unknown'): boolean {
  // If the API explicitly says it hit length limit, it's truncated
  if (finishReason === 'length') {
    return true;
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  // Check if ends with valid sentence terminators
  const lastChar = trimmed.slice(-1);
  const validEndings = ['.', '!', '?', '"', "'", ')', ']', '*', '—'];

  // If ends with a valid ending, likely not truncated
  if (validEndings.includes(lastChar)) {
    return false;
  }

  // Check for mid-word truncation (ends with a letter followed by nothing)
  const endsWithLetter = /[a-zA-Z]$/.test(trimmed);
  const endsWithComma = trimmed.endsWith(',');
  const endsWithColon = trimmed.endsWith(':');

  // These patterns suggest truncation
  if (endsWithLetter || endsWithComma || endsWithColon) {
    return true;
  }

  return false;
}

/**
 * Conversation history entry
 */
interface ConversationEntry {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for PersonaAgent constructor
 */
export interface PersonaAgentOptions {
  llmClient?: LLMClient;
  sseManager?: SSEManager;
  persona: PodcastPersona;
  participant: ConversationParticipant;
  sessionId: string;
  topic: string;
  otherParticipants: Array<{ name: string; persona: PodcastPersona }>;
}

/**
 * PersonaAgent Class
 *
 * Responsibilities:
 * - Generate character-consistent responses
 * - Evaluate desire to speak (signal generation)
 * - Support direct addressing of other participants
 * - Maintain conversation history with memory trimming
 * - Stream tokens via SSE when manager is available
 * - Support RAG context injection
 */
export class PersonaAgent {
  private llmClient: LLMClient;
  private sseManager?: SSEManager;
  private persona: PodcastPersona;
  private participant: ConversationParticipant;
  private sessionId: string;
  private topic: string;
  private systemPrompt: string;
  private conversationHistory: ConversationEntry[];
  private otherParticipants: Array<{ name: string; persona: PodcastPersona }>;

  // RAG support
  private ragService?: RAGRetrievalService;
  private episodeId?: string;

  // Turn tracking for truncation events
  private currentTurnCount: number = 0;
  private currentUtteranceId?: number;

  constructor(options: PersonaAgentOptions) {
    this.llmClient = options.llmClient || createOpenRouterClient(options.participant.modelId);
    this.sseManager = options.sseManager;
    this.persona = options.persona;
    this.participant = options.participant;
    this.sessionId = options.sessionId;
    this.topic = options.topic;
    this.otherParticipants = options.otherParticipants;

    // Build system prompt from persona definition
    this.systemPrompt = buildPersonaSystemPrompt(
      this.persona,
      this.topic,
      this.otherParticipants.map(p => p.name)
    );

    // Initialize conversation history
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];

    logger.info({
      sessionId: this.sessionId,
      personaSlug: this.persona.slug,
      participantId: this.participant.id,
      modelId: this.participant.modelId,
    }, 'PersonaAgent initialized');
  }

  // =========================================================================
  // PUBLIC PROPERTIES
  // =========================================================================

  get name(): string {
    return this.participant.displayNameOverride || this.persona.name;
  }

  get personaSlug(): string {
    return this.persona.slug;
  }

  get participantId(): string {
    return this.participant.id;
  }

  get avatarEmoji(): string {
    return this.persona.avatarEmoji || '🎙️';
  }

  get modelId(): string {
    return this.participant.modelId;
  }

  /**
   * Get the persona definition
   */
  getPersona(): PodcastPersona {
    return this.persona;
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'PersonaAgent',
      version: '1.0.0',
      model: this.participant.modelId,
      persona: this.persona.slug,
      displayName: this.name,
      capabilities: [
        'conversation-response',
        'speaking-desire-signal',
        'direct-addressing',
        'introduction-response',
      ],
    };
  }

  // =========================================================================
  // RAG INTEGRATION
  // =========================================================================

  /**
   * Enable RAG for this persona agent
   */
  enableRAG(ragService: RAGRetrievalService, episodeId: string): void {
    this.ragService = ragService;
    this.episodeId = episodeId;
    logger.info({
      sessionId: this.sessionId,
      personaSlug: this.persona.slug,
      episodeId,
    }, 'RAG enabled for persona agent');
  }

  /**
   * Check if RAG is enabled
   */
  isRAGEnabled(): boolean {
    return !!(this.ragService && this.episodeId);
  }

  /**
   * Get RAG context for a query
   */
  private async getRAGContext(query: string): Promise<string> {
    if (!this.ragService || !this.episodeId) {
      return '';
    }

    try {
      const citationContext = await this.ragService.buildCitationContext(
        this.episodeId,
        query
      );
      return citationContext || '';
    } catch (error) {
      logger.warn({ error, sessionId: this.sessionId }, 'Failed to retrieve RAG context');
      return '';
    }
  }

  // =========================================================================
  // GENERATION METHODS
  // =========================================================================

  /**
   * Generate a response to the conversation
   */
  async generateResponse(
    conversationContext: string,
    addressedTo?: string,
    previousSpeaker?: string
  ): Promise<string> {
    logger.info({
      sessionId: this.sessionId,
      persona: this.persona.slug,
      addressedTo,
      previousSpeaker,
    }, 'Generating persona response');

    const prompt = buildResponsePrompt(
      this.persona,
      conversationContext,
      addressedTo,
      previousSpeaker,
      this.otherParticipants.map(p => p.name)
    );

    try {
      // Use 600 tokens to prevent truncation (was 400)
      const content = await this.generate(prompt, 'response', 0.8, 600);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info({
        sessionId: this.sessionId,
        persona: this.persona.slug,
        length: content.length,
      }, 'Persona response generated');

      return content;
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to generate response');
      throw error;
    }
  }

  /**
   * Generate a response to host introduction
   */
  async generateIntroductionResponse(
    hostIntroduction: string
  ): Promise<string> {
    logger.info({
      sessionId: this.sessionId,
      persona: this.persona.slug,
    }, 'Generating introduction response');

    const prompt = buildIntroductionResponsePrompt(
      this.persona,
      this.topic,
      hostIntroduction
    );

    try {
      const content = await this.generate(prompt, 'introduction', 0.75, 200);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info({
        sessionId: this.sessionId,
        persona: this.persona.slug,
        length: content.length,
      }, 'Introduction response generated');

      return content;
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to generate introduction response');
      throw error;
    }
  }

  /**
   * Generate a direct address to another participant
   */
  async generateDirectAddress(
    targetName: string,
    targetStatement: string,
    recentContext: string
  ): Promise<string> {
    logger.info({
      sessionId: this.sessionId,
      persona: this.persona.slug,
      targetName,
    }, 'Generating direct address');

    const prompt = buildDirectAddressPrompt(
      this.persona,
      targetName,
      targetStatement,
      recentContext
    );

    try {
      const content = await this.generate(prompt, 'direct_address', 0.8, 350);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info({
        sessionId: this.sessionId,
        persona: this.persona.slug,
        targetName,
        length: content.length,
      }, 'Direct address generated');

      return content;
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to generate direct address');
      throw error;
    }
  }

  /**
   * Evaluate desire to speak based on recent conversation
   * Returns a signal indicating urgency, reason, and preview
   */
  async evaluateSpeakingDesire(
    recentContext: string,
    currentSpeaker: string
  ): Promise<SpeakerSignal | null> {
    const prompt = buildSpeakingDesirePrompt(
      this.persona,
      recentContext,
      currentSpeaker
    );

    try {
      const response = await this.llmClient.chat(
        [...this.conversationHistory, { role: 'user', content: prompt }],
        { temperature: 0.6, maxTokens: 150 }
      );

      // Parse structured response
      const signal = this.parseSignalResponse(response);

      if (signal) {
        logger.debug({
          sessionId: this.sessionId,
          persona: this.persona.slug,
          urgency: signal.urgency,
          reason: signal.reason,
        }, 'Speaking desire signal generated');
      }

      return signal;
    } catch (error) {
      logger.warn({ error }, 'Failed to evaluate speaking desire');
      return null;
    }
  }

  /**
   * Parse the LLM's signal response into structured format
   */
  private parseSignalResponse(response: string): SpeakerSignal | null {
    try {
      // Expected format:
      // URGENCY: high|medium|low|none
      // REASON: agreement|disagreement|clarification|addition|redirect
      // PREVIEW: brief preview text

      const urgencyMatch = response.match(/URGENCY:\s*(high|medium|low|none)/i);
      const reasonMatch = response.match(/REASON:\s*(agreement|disagreement|clarification|addition|redirect)/i);
      const previewMatch = response.match(/PREVIEW:\s*(.+)/i);

      const urgencyValue = urgencyMatch?.[1]?.toLowerCase();
      if (!urgencyValue || urgencyValue === 'none') {
        return null;
      }

      // Validate urgency is a valid SignalUrgency value
      if (urgencyValue !== 'low' && urgencyValue !== 'medium' && urgencyValue !== 'high') {
        return null;
      }

      // Map LLM reason to our SignalReason type
      const reasonMap: Record<string, SignalReason> = {
        'agreement': 'add_point',
        'disagreement': 'disagree',
        'clarification': 'question',
        'addition': 'add_point',
        'redirect': 'respond',
      };

      const rawReason = reasonMatch?.[1]?.toLowerCase() || 'addition';
      const mappedReason = reasonMap[rawReason] || 'add_point';

      return {
        participantId: this.participant.id,
        participantName: this.name,
        urgency: urgencyValue,
        reason: mappedReason,
        preview: previewMatch?.[1]?.trim(),
        createdAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if content addresses any other participant
   */
  detectAddressing(content: string): string | null {
    return extractAddressedParticipant(
      content,
      this.otherParticipants.map(p => p.name)
    );
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Set the current turn count for truncation event tracking
   */
  setTurnContext(turnCount: number, utteranceId?: number): void {
    this.currentTurnCount = turnCount;
    this.currentUtteranceId = utteranceId;
  }

  /**
   * Add external context to the conversation
   */
  addContext(context: string): void {
    this.addToHistory('user', `[CONTEXT]: ${context}`);
  }

  /**
   * Add a message from another participant to history
   */
  addOtherSpeakerMessage(speakerName: string, content: string): void {
    this.addToHistory('user', `[${speakerName}]: ${content}`);
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
    logger.debug({
      sessionId: this.sessionId,
      persona: this.persona.slug,
    }, 'Conversation history cleared');
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Generate with optional streaming, RAG injection, and empty response validation
   */
  private async generate(
    prompt: string,
    segment: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Get RAG context if available
    let enhancedPrompt = prompt;
    if (this.isRAGEnabled()) {
      const ragContext = await this.getRAGContext(prompt);
      if (ragContext) {
        enhancedPrompt = `${ragContext}\n\n---\n\n${prompt}`;
        logger.debug({
          sessionId: this.sessionId,
          persona: this.persona.slug,
          segment,
        }, 'Injected RAG citations into prompt');
      }
    }

    const messages = [...this.conversationHistory, { role: 'user' as const, content: enhancedPrompt }];

    let lastContent = '';

    for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
      try {
        let content: string;

        // Use streaming if SSE manager is available and client supports it
        if (this.sseManager && this.llmClient instanceof OpenRouterLLMClient) {
          content = await this.generateWithStreaming(messages, segment, temperature, maxTokens);
        } else {
          content = await this.llmClient.chat(messages, { temperature, maxTokens });
        }

        // Validate response is not empty
        const trimmedContent = content.trim();
        if (trimmedContent.length >= MIN_CONTENT_LENGTH) {
          return content;
        }

        // Content is empty or too short
        lastContent = content;

        if (attempt < MAX_EMPTY_RETRIES) {
          logger.warn({
            sessionId: this.sessionId,
            persona: this.persona.slug,
            segment,
            attempt: attempt + 1,
            contentLength: trimmedContent.length,
          }, 'Empty or short response from LLM, retrying');
          // Brief delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        // Re-throw non-empty-response errors
        throw error;
      }
    }

    // All retries exhausted, throw EmptyPersonaResponseError
    logger.error({
      sessionId: this.sessionId,
      persona: this.persona.slug,
      modelId: this.participant.modelId,
      segment,
      lastContentLength: lastContent.trim().length,
    }, 'Failed to get valid response after retries');

    throw new EmptyPersonaResponseError(this.persona.slug, this.participant.modelId, segment);
  }

  /**
   * Generate with streaming via SSE with truncation detection
   */
  private async generateWithStreaming(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    segment: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const client = this.llmClient as OpenRouterLLMClient;

    // Token callback for SSE broadcasting
    const onToken = (token: string) => {
      if (this.sseManager) {
        this.sseManager.broadcastToDebate(this.sessionId, 'conversation_token' as any, {
          participantId: this.participant.id,
          personaSlug: this.persona.slug,
          personaName: this.name,
          segment,
          token,
        });
      }
    };

    try {
      // First attempt
      let result = await client.streamChatWithMetadata(
        messages,
        { temperature, maxTokens },
        onToken
      );

      // Check for truncation - only if we have substantial content (not empty responses)
      if (detectTruncation(result.content, result.finishReason) && result.content.trim().length >= MIN_CONTENT_LENGTH) {
        logger.warn({
          sessionId: this.sessionId,
          persona: this.persona.slug,
          segment,
          contentLength: result.content.length,
          finishReason: result.finishReason,
          lastChars: result.content.slice(-50),
        }, 'Detected truncated response, attempting continuation');

        // Retry with continuation prompt
        for (let retry = 0; retry < MAX_TRUNCATION_RETRIES; retry++) {
          // Emit retry event to let frontend know we're attempting recovery
          this.emitTruncationRetryEvent(retry + 1, MAX_TRUNCATION_RETRIES, result.content.length);

          // Add partial response to messages and ask to continue
          const continuationMessages = [
            ...messages,
            { role: 'assistant' as const, content: result.content },
            { role: 'user' as const, content: 'Please continue your thought and complete your response.' },
          ];

          // Broadcast a marker that we're continuing
          if (this.sseManager) {
            this.sseManager.broadcastToDebate(this.sessionId, 'conversation_token' as any, {
              participantId: this.participant.id,
              personaSlug: this.persona.slug,
              personaName: this.name,
              segment,
              token: ' ',
            });
          }

          const continuation = await client.streamChatWithMetadata(
            continuationMessages,
            { temperature, maxTokens: Math.min(maxTokens, 400) }, // Smaller for continuation
            onToken
          );

          // Append continuation to original content
          result = {
            content: result.content + ' ' + continuation.content,
            finishReason: continuation.finishReason,
          };

          logger.info({
            sessionId: this.sessionId,
            persona: this.persona.slug,
            segment,
            retry: retry + 1,
            newContentLength: result.content.length,
            finishReason: result.finishReason,
          }, 'Truncation recovery attempted');

          // If continuation completed normally, break
          if (!detectTruncation(result.content, result.finishReason)) {
            break;
          }
        }

        // If truncation still detected after retries AND we have substantial content,
        // emit SSE event for user intervention and throw error to pause conversation.
        // Don't emit for empty/very short responses as those are handled by the empty response retry logic.
        if (detectTruncation(result.content, result.finishReason) && result.content.trim().length >= MIN_CONTENT_LENGTH) {
          this.emitTruncationDetectedEvent(result.content, result.finishReason);

          // Throw specific error to signal orchestrator to pause and wait for user intervention
          const truncationError = new Error('Response truncated after retry attempts - user intervention required');
          (truncationError as any).code = 'TRUNCATION_DETECTED';
          (truncationError as any).partialContent = result.content;
          (truncationError as any).participantId = this.participant.id;
          throw truncationError;
        }
      }

      return result.content;
    } catch (error) {
      logger.error(
        { error, persona: this.persona.slug, segment },
        'Streaming generation failed'
      );
      throw error;
    }
  }

  /**
   * Emit an SSE event when attempting to recover from truncation
   * Lets frontend show user that we're trying to continue the response
   */
  private emitTruncationRetryEvent(
    retryAttempt: number,
    maxRetries: number,
    currentContentLength: number
  ): void {
    if (!this.sseManager) {
      return;
    }

    const eventData: ConversationTruncationRetryEventData = {
      sessionId: this.sessionId,
      participantId: this.participant.id,
      personaSlug: this.persona.slug,
      personaName: this.name,
      retryAttempt,
      maxRetries,
      currentContentLength,
      timestampMs: Date.now(),
    };

    this.sseManager.broadcastToConversation(
      this.sessionId,
      'conversation_truncation_retry',
      eventData
    );

    logger.info({
      sessionId: this.sessionId,
      persona: this.persona.slug,
      retryAttempt,
      maxRetries,
    }, 'Truncation retry event emitted');
  }

  /**
   * Emit an SSE event when truncation is detected and unrecoverable
   * Allows frontend to offer user the option to regenerate with a different model
   */
  private emitTruncationDetectedEvent(
    content: string,
    finishReason: 'stop' | 'length' | 'unknown'
  ): void {
    if (!this.sseManager) {
      return;
    }

    const eventData: ConversationTruncationDetectedEventData = {
      sessionId: this.sessionId,
      participantId: this.participant.id,
      personaSlug: this.persona.slug,
      personaName: this.name,
      partialContent: content,
      contentLength: content.length,
      lastChars: content.slice(-50),
      detectionType: finishReason === 'length' ? 'length' : 'heuristic',
      currentModelId: this.participant.modelId,
      turnCount: this.currentTurnCount,
      utteranceId: this.currentUtteranceId,
      timestampMs: Date.now(),
    };

    this.sseManager.broadcastToConversation(
      this.sessionId,
      'conversation_truncation_detected',
      eventData
    );

    logger.warn({
      sessionId: this.sessionId,
      persona: this.persona.slug,
      contentLength: content.length,
      turnCount: this.currentTurnCount,
    }, 'Truncation detected event emitted to frontend');
  }

  /**
   * Add entry to conversation history with trimming
   */
  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Trim history if too long (keep system prompt + last 30 exchanges)
    const maxEntries = 61; // 1 system + 60 user/assistant pairs
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
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a PersonaAgent for a participant
 */
export function createPersonaAgent(options: PersonaAgentOptions): PersonaAgent {
  return new PersonaAgent(options);
}

/**
 * Create all persona agents for a conversation session
 */
export function createPersonaAgents(
  sessionId: string,
  topic: string,
  participants: Array<{ participant: ConversationParticipant; persona: PodcastPersona }>,
  sseManager?: SSEManager
): Map<string, PersonaAgent> {
  const agents = new Map<string, PersonaAgent>();

  for (const { participant, persona } of participants) {
    const otherParticipants = participants
      .filter(p => p.participant.id !== participant.id)
      .map(p => ({
        name: p.participant.displayNameOverride || p.persona.name,
        persona: p.persona,
      }));

    const agent = new PersonaAgent({
      persona,
      participant,
      sessionId,
      topic,
      otherParticipants,
      sseManager,
    });

    agents.set(participant.id, agent);
  }

  logger.info({
    sessionId,
    participantCount: agents.size,
    personas: participants.map(p => p.persona.slug),
  }, 'Created all persona agents for conversation');

  return agents;
}

/**
 * Get a persona agent from a map by participant ID
 */
export function getPersonaAgent(
  agents: Map<string, PersonaAgent>,
  participantId: string
): PersonaAgent | undefined {
  return agents.get(participantId);
}

/**
 * Get all persona agents as an array
 */
export function getAllPersonaAgents(agents: Map<string, PersonaAgent>): PersonaAgent[] {
  return Array.from(agents.values());
}

/**
 * Enable RAG for all persona agents
 */
export function enableRAGForAllAgents(
  agents: Map<string, PersonaAgent>,
  ragService: RAGRetrievalService,
  episodeId: string
): void {
  const agentList = Array.from(agents.values());
  for (const agent of agentList) {
    agent.enableRAG(ragService, episodeId);
  }

  logger.info({
    episodeId,
    agentCount: agents.size,
  }, 'RAG enabled for all persona agents');
}
