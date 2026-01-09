/**
 * Chair Agent for Duelogic Debate Mode
 *
 * Chair agents represent philosophical positions in Duelogic debates.
 * Each chair is assigned a philosophical framework and must argue from
 * that perspective while meeting steel-manning and self-critique obligations.
 */

import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import type { SSEManager } from '../sse/sse-manager.js';
import {
  type DuelogicChair,
  type DuelogicConfig,
  type PhilosophicalChair,
  PHILOSOPHICAL_CHAIR_INFO,
} from '../../types/duelogic.js';
import {
  buildChairSystemPrompt,
  buildOpeningStatementPrompt,
  buildExchangeResponsePrompt,
  buildDirectChallengePrompt,
  buildInterruptionResponsePrompt,
  buildClarificationRequestPrompt,
  buildSynthesisContributionPrompt,
  getFrameworkOpeningHook,
  getSelfCritiquePrompt,
  hasApparentSteelMan,
  hasApparentSelfCritique,
} from './prompts/chair-prompts.js';
import { createOpenRouterClient, OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import { RAGRetrievalService } from '../research/rag-retrieval-service.js';

const logger = pino({
  name: 'chair-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Error thrown when a chair agent receives an empty response from the LLM
 */
export class EmptyResponseError extends Error {
  public readonly chairPosition: string;
  public readonly modelId: string;
  public readonly segment: string;

  constructor(chairPosition: string, modelId: string, segment: string) {
    super(`Empty response from model ${modelId} for ${chairPosition} during ${segment}`);
    this.name = 'EmptyResponseError';
    this.chairPosition = chairPosition;
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
 * Options for ChairAgent constructor
 */
export interface ChairAgentOptions {
  llmClient?: LLMClient;
  sseManager?: SSEManager;
  chair: DuelogicChair;
  config: DuelogicConfig;
  debateId: string;
  /** Key tensions from the proposal to guide the debate */
  keyTensions?: string[];
}

/**
 * Conversation history entry
 */
interface ConversationEntry {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chair Agent Class
 *
 * Responsibilities:
 * - Generate framework-consistent arguments
 * - Steel-man opponent positions before critiquing
 * - Acknowledge framework weaknesses
 * - Respond to interruptions and challenges
 */
export class ChairAgent {
  private llmClient: LLMClient;
  private sseManager?: SSEManager;
  private chair: DuelogicChair;
  private debateId: string;
  private systemPrompt: string;
  private conversationHistory: ConversationEntry[];
  private frameworkInfo: typeof PHILOSOPHICAL_CHAIR_INFO[PhilosophicalChair];
  private keyTensions?: string[];

  // RAG support
  private ragService?: RAGRetrievalService;
  private episodeId?: string;

  constructor(options: ChairAgentOptions) {
    // Create model-specific OpenRouter client or use provided
    this.llmClient = options.llmClient || createOpenRouterClient(options.chair.modelId);
    this.sseManager = options.sseManager;
    this.chair = options.chair;
    this.debateId = options.debateId;
    this.frameworkInfo = PHILOSOPHICAL_CHAIR_INFO[options.chair.framework];
    this.keyTensions = options.keyTensions;

    // Build system prompt with opponents and key tensions
    const opponents = options.config.chairs.filter(c => c.position !== options.chair.position);
    this.systemPrompt = buildChairSystemPrompt(
      options.chair,
      opponents,
      options.config.tone,
      options.keyTensions
    );

    // Initialize conversation history with system prompt
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];

    logger.info(
      {
        debateId: options.debateId,
        position: options.chair.position,
        framework: options.chair.framework,
        modelId: options.chair.modelId,
        hasProposalContext: !!options.chair.proposalContext,
        keyTensionsCount: options.keyTensions?.length ?? 0,
      },
      'ChairAgent initialized'
    );
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'ChairAgent',
      version: '1.0.0',
      model: this.chair.modelId,
      position: this.chair.position,
      framework: this.chair.framework,
      capabilities: [
        'opening-statement',
        'exchange-response',
        'direct-challenge',
        'interruption-response',
        'synthesis-contribution',
      ],
    };
  }

  // =========================================================================
  // PUBLIC PROPERTIES
  // =========================================================================

  get position(): string {
    return this.chair.position;
  }

  get framework(): PhilosophicalChair {
    return this.chair.framework;
  }

  get displayName(): string {
    return this.chair.modelDisplayName || this.chair.modelId;
  }

  get providerName(): string | undefined {
    return this.chair.providerName;
  }

  /**
   * Get full framework info
   */
  getFrameworkInfo() {
    return this.frameworkInfo;
  }

  /**
   * Enable RAG (Retrieval-Augmented Generation) for this chair agent
   * When enabled, relevant research citations will be injected into prompts
   */
  enableRAG(ragService: RAGRetrievalService, episodeId: string): void {
    this.ragService = ragService;
    this.episodeId = episodeId;
    logger.info(
      {
        debateId: this.debateId,
        position: this.position,
        episodeId,
      },
      'RAG enabled for chair agent'
    );
  }

  /**
   * Check if RAG is enabled for this agent
   */
  isRAGEnabled(): boolean {
    return !!(this.ragService && this.episodeId);
  }

  /**
   * Get RAG citation context for a given query
   * Returns formatted citation prompt to inject into the conversation
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

      if (citationContext) {
        logger.debug(
          {
            debateId: this.debateId,
            position: this.position,
            hasContext: true,
          },
          'Retrieved RAG context for turn'
        );
      }

      return citationContext;
    } catch (error) {
      logger.warn(
        { error, debateId: this.debateId, position: this.position },
        'Failed to retrieve RAG context, continuing without citations'
      );
      return '';
    }
  }

  /**
   * Get an engaging opening hook for this framework
   */
  getOpeningHook(): string {
    return getFrameworkOpeningHook(this.chair.framework);
  }

  /**
   * Get a self-critique statement for this framework
   */
  getSelfCritique(): string {
    return getSelfCritiquePrompt(this.chair.framework);
  }

  // =========================================================================
  // GENERATION METHODS
  // =========================================================================

  /**
   * Generate opening statement
   */
  async generateOpening(
    proposition: string,
    propositionContext?: string
  ): Promise<string> {
    logger.info(
      { debateId: this.debateId, position: this.position },
      'Generating opening statement'
    );

    const prompt = buildOpeningStatementPrompt(
      this.chair,
      proposition,
      propositionContext,
      this.keyTensions
    );

    try {
      const content = await this.generate(prompt, 'opening', 0.8, 600);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info(
        {
          debateId: this.debateId,
          position: this.position,
          length: content.length,
        },
        'Opening statement generated'
      );

      return content;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, position: this.position },
        'Failed to generate opening statement'
      );
      throw error;
    }
  }

  /**
   * Generate response to another chair's argument
   */
  async generateExchangeResponse(
    previousSpeaker: DuelogicChair,
    previousContent: string,
    debateContext: string
  ): Promise<string> {
    logger.info(
      {
        debateId: this.debateId,
        position: this.position,
        respondingTo: previousSpeaker.position,
      },
      'Generating exchange response'
    );

    const prompt = buildExchangeResponsePrompt(
      this.chair,
      previousSpeaker,
      previousContent,
      debateContext
    );

    try {
      const content = await this.generate(prompt, 'exchange', 0.75, 500);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      // Log quality checks
      const hasSteelMan = hasApparentSteelMan(content);
      const hasSelfCritique = hasApparentSelfCritique(content);

      logger.info(
        {
          debateId: this.debateId,
          position: this.position,
          length: content.length,
          hasSteelMan,
          hasSelfCritique,
        },
        'Exchange response generated'
      );

      return content;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, position: this.position },
        'Failed to generate exchange response'
      );
      throw error;
    }
  }

  /**
   * Respond to a direct challenge
   */
  async respondToChallenge(
    challenger: DuelogicChair,
    challengeContent: string
  ): Promise<string> {
    logger.info(
      {
        debateId: this.debateId,
        position: this.position,
        challenger: challenger.position,
      },
      'Generating challenge response'
    );

    const prompt = buildDirectChallengePrompt(this.chair, challenger, challengeContent);

    try {
      const content = await this.generate(prompt, 'challenge_response', 0.7, 600);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info(
        {
          debateId: this.debateId,
          position: this.position,
          length: content.length,
        },
        'Challenge response generated'
      );

      return content;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, position: this.position },
        'Failed to generate challenge response'
      );
      throw error;
    }
  }

  /**
   * Respond to an interruption
   */
  async respondToInterruption(
    interrupter: DuelogicChair,
    interruptionContent: string
  ): Promise<string> {
    logger.info(
      {
        debateId: this.debateId,
        position: this.position,
        interrupter: interrupter.position,
      },
      'Generating interruption response'
    );

    const prompt = buildInterruptionResponsePrompt(this.chair, interrupter, interruptionContent);

    try {
      // Interruption responses - allow enough room for complete thoughts
      const response = await this.llmClient.chat(
        [...this.conversationHistory, { role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 450 }
      );

      this.addToHistory('user', prompt);
      this.addToHistory('assistant', response);

      logger.info(
        {
          debateId: this.debateId,
          position: this.position,
          length: response.length,
        },
        'Interruption response generated'
      );

      return response;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, position: this.position },
        'Failed to generate interruption response'
      );
      throw error;
    }
  }

  /**
   * Request clarification from another chair
   */
  async requestClarification(
    targetChair: DuelogicChair,
    unclearContent: string
  ): Promise<string> {
    logger.info(
      {
        debateId: this.debateId,
        position: this.position,
        target: targetChair.position,
      },
      'Generating clarification request'
    );

    const prompt = buildClarificationRequestPrompt(this.chair, targetChair, unclearContent);

    try {
      const response = await this.llmClient.chat(
        [...this.conversationHistory, { role: 'user', content: prompt }],
        { temperature: 0.6, maxTokens: 100 }
      );

      this.addToHistory('user', prompt);
      this.addToHistory('assistant', response);

      logger.info(
        {
          debateId: this.debateId,
          position: this.position,
          length: response.length,
        },
        'Clarification request generated'
      );

      return response;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, position: this.position },
        'Failed to generate clarification request'
      );
      throw error;
    }
  }

  /**
   * Contribute to debate synthesis
   */
  async contributeSynthesis(debateContext: string): Promise<string> {
    logger.info(
      { debateId: this.debateId, position: this.position },
      'Generating synthesis contribution'
    );

    const prompt = buildSynthesisContributionPrompt(this.chair, debateContext);

    try {
      const content = await this.generate(prompt, 'synthesis', 0.7, 350);
      this.addToHistory('user', prompt);
      this.addToHistory('assistant', content);

      logger.info(
        {
          debateId: this.debateId,
          position: this.position,
          length: content.length,
        },
        'Synthesis contribution generated'
      );

      return content;
    } catch (error) {
      logger.error(
        { error, debateId: this.debateId, position: this.position },
        'Failed to generate synthesis contribution'
      );
      throw error;
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

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
    logger.debug(
      { debateId: this.debateId, position: this.position },
      'Conversation history cleared'
    );
  }

  /**
   * Add external context to conversation
   */
  addContext(context: string): void {
    this.addToHistory('user', `[CONTEXT]: ${context}`);
  }

  // =========================================================================
  // PRIVATE HELPER METHODS
  // =========================================================================

  /**
   * Generate with optional streaming and empty response validation
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
        logger.debug(
          { debateId: this.debateId, position: this.position, segment },
          'Injected RAG citations into prompt'
        );
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
          logger.warn(
            {
              debateId: this.debateId,
              position: this.position,
              segment,
              attempt: attempt + 1,
              contentLength: trimmedContent.length,
            },
            'Empty or short response from LLM, retrying'
          );
          // Brief delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        // Re-throw non-empty-response errors
        throw error;
      }
    }

    // All retries exhausted, throw EmptyResponseError
    logger.error(
      {
        debateId: this.debateId,
        position: this.position,
        modelId: this.chair.modelId,
        segment,
        lastContentLength: lastContent.trim().length,
      },
      'Failed to get valid response after retries'
    );

    throw new EmptyResponseError(this.position, this.chair.modelId, segment);
  }

  /**
   * Generate with streaming, broadcasting tokens via SSE
   */
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

        // Broadcast token via SSE
        if (this.sseManager) {
          this.sseManager.broadcastToDebate(this.debateId, 'token', {
            speaker: this.chair.position,
            segment,
            framework: this.chair.framework,
            token: chunk,
          });
        }
      }

      return chunks.join('');
    } catch (error) {
      logger.error(
        { error, position: this.position, segment },
        'Streaming generation failed'
      );
      throw error;
    }
  }

  /**
   * Add entry to conversation history
   */
  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Trim history if too long (keep system prompt + last 20 exchanges)
    const maxEntries = 41; // 1 system + 40 user/assistant pairs
    if (this.conversationHistory.length > maxEntries) {
      const systemPrompt = this.conversationHistory[0];
      if (systemPrompt) {
        this.conversationHistory = [
          systemPrompt, // Keep system prompt
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
 * Create a single ChairAgent
 */
export function createChairAgent(options: ChairAgentOptions): ChairAgent {
  return new ChairAgent(options);
}

/**
 * Factory function to create all chair agents for a debate
 */
export function createChairAgents(
  config: DuelogicConfig,
  debateId: string,
  sseManager?: SSEManager,
  keyTensions?: string[]
): Map<string, ChairAgent> {
  const agents = new Map<string, ChairAgent>();

  for (const chair of config.chairs) {
    const agent = new ChairAgent({
      chair,
      config,
      debateId,
      sseManager,
      keyTensions,
    });
    agents.set(chair.position, agent);
  }

  logger.info(
    {
      debateId,
      chairCount: agents.size,
      positions: Array.from(agents.keys()),
      hasKeyTensions: !!keyTensions?.length,
    },
    'Created all chair agents for debate'
  );

  return agents;
}

/**
 * Get a chair agent from a map by position
 */
export function getChairAgent(
  agents: Map<string, ChairAgent>,
  position: string
): ChairAgent | undefined {
  return agents.get(position);
}

/**
 * Get all chair agents as an array
 */
export function getAllChairAgents(agents: Map<string, ChairAgent>): ChairAgent[] {
  return Array.from(agents.values());
}
