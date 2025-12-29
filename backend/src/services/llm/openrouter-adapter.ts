/**
 * OpenRouter LLM Client Adapter
 *
 * Creates LLM clients configured to use OpenRouter with specific models.
 * Uses OpenAI SDK with baseURL override for compatibility since OpenRouter
 * is OpenAI-compatible.
 */

import OpenAI from 'openai';
import pino from 'pino';
import { LLMClient } from './client.js';
import type { DebateModelConfig } from '../../types/openrouter.js';

const logger = pino({
  name: 'openrouter-adapter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * OpenRouter-specific configuration
 */
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Model-specific LLM client for OpenRouter
 *
 * Wraps the standard LLMClient but routes requests through OpenRouter
 * with a specific model.
 */
export class OpenRouterLLMClient extends LLMClient {
  private openRouterClient: OpenAI;
  private modelId: string;

  constructor(modelId: string, apiKey?: string) {
    super(); // Initialize base LLM client

    this.modelId = modelId;
    const key = apiKey || process.env.OPENROUTER_API_KEY;

    if (!key) {
      throw new Error('OpenRouter API key not configured');
    }

    this.openRouterClient = new OpenAI({
      apiKey: key,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
        'X-Title': 'ClearSide Debate',
      },
    });

    logger.info({ modelId }, 'OpenRouter LLM client created');
  }

  /**
   * Get the OpenAI-compatible client for OpenRouter
   */
  getOpenAIClient(): OpenAI {
    return this.openRouterClient;
  }

  /**
   * Get the model ID this client is configured for
   */
  getModelId(): string {
    return this.modelId;
  }

  /**
   * Override complete method to use OpenRouter
   * This is the main method used by agents
   */
  async complete(request: import('../../types/llm.js').LLMRequest): Promise<import('../../types/llm.js').LLMResponse> {
    const startTime = Date.now();

    logger.info({
      provider: 'openrouter',
      model: this.modelId,
      messageCount: request.messages.length,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    }, 'Starting OpenRouter completion request');

    try {
      const completion = await this.openRouterClient.chat.completions.create({
        model: this.modelId,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stream: false,
      });

      const choice = completion.choices[0];
      const content = choice?.message?.content ?? '';

      const duration = Date.now() - startTime;
      const usage = {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      };

      logger.info({
        provider: 'openrouter',
        model: this.modelId,
        duration,
        usage,
      }, 'OpenRouter completion successful');

      return {
        content,
        model: completion.model || this.modelId,
        usage,
        finishReason: choice?.finish_reason === 'length' ? 'length' : 'stop',
        provider: 'openrouter',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        modelId: this.modelId,
        duration,
      }, 'OpenRouter completion error');
      throw error;
    }
  }

  /**
   * Override chat method to use OpenRouter
   */
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    try {
      const response = await this.openRouterClient.chat.completions.create({
        model: this.modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        stream: false,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error({ error, modelId: this.modelId }, 'OpenRouter chat error');
      throw error;
    }
  }

  /**
   * Override streamChat method to use OpenRouter
   */
  async *streamChat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await this.openRouterClient.chat.completions.create({
        model: this.modelId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      logger.error({ error, modelId: this.modelId }, 'OpenRouter stream error');
      throw error;
    }
  }
}

/**
 * Create an OpenRouter LLM client for a specific model
 */
export function createOpenRouterClient(modelId: string): OpenRouterLLMClient {
  return new OpenRouterLLMClient(modelId);
}

/**
 * Create LLM clients for Pro, Con, and Moderator roles
 *
 * If model config specifies OpenRouter models, creates OpenRouter clients.
 * Otherwise falls back to default LLM client.
 */
export async function createDebateClients(config?: DebateModelConfig): Promise<{
  proClient: LLMClient;
  conClient: LLMClient;
  moderatorClient: LLMClient;
  proModelId?: string;
  conModelId?: string;
  moderatorModelId?: string;
}> {
  // Import default client lazily to avoid circular dependencies
  const { defaultLLMClient } = await import('./index.js');

  // If no config or auto mode without models set, use defaults
  if (!config || (config.selectionMode === 'auto' && !config.proModelId)) {
    logger.debug('Using default LLM clients for all roles');
    return {
      proClient: defaultLLMClient,
      conClient: defaultLLMClient,
      moderatorClient: defaultLLMClient,
    };
  }

  // Check if OpenRouter is configured
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!hasOpenRouter) {
    logger.warn('OpenRouter not configured, falling back to default clients');
    return {
      proClient: defaultLLMClient,
      conClient: defaultLLMClient,
      moderatorClient: defaultLLMClient,
    };
  }

  // Create model-specific clients
  const proClient = config.proModelId
    ? createOpenRouterClient(config.proModelId)
    : defaultLLMClient;

  const conClient = config.conModelId
    ? createOpenRouterClient(config.conModelId)
    : defaultLLMClient;

  // Moderator uses specified model or default
  const moderatorClient = config.moderatorModelId
    ? createOpenRouterClient(config.moderatorModelId)
    : defaultLLMClient;

  logger.info(
    {
      proModel: config.proModelId || 'default',
      conModel: config.conModelId || 'default',
      moderatorModel: config.moderatorModelId || 'default',
    },
    'Created debate clients with model config'
  );

  return {
    proClient,
    conClient,
    moderatorClient,
    proModelId: config.proModelId,
    conModelId: config.conModelId,
    moderatorModelId: config.moderatorModelId,
  };
}

/**
 * Check if OpenRouter is available
 */
export function isOpenRouterAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}
