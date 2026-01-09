# CONV-005: PersonaAgent Class

**Task ID:** CONV-005
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-002 (Types), CONV-003 (Persona Repository)
**Status:** Ready

---

## Context

This task creates the PersonaAgent class that represents individual participants in podcast conversations. Unlike ChairAgent which argues from a philosophical framework, PersonaAgent embodies a character persona with distinct speaking style, worldview, and personality quirks.

**References:**
- [CONV-002](./CONV-002.md) - TypeScript types
- [CONV-003](./CONV-003.md) - Persona repository
- Existing pattern: `backend/src/services/agents/chair-agent.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `PersonaAgent` class in `backend/src/services/conversation/persona-agent.ts`
- [ ] Build persona-based system prompts from persona definitions
- [ ] Implement `generateResponse()` for conversation turns
- [ ] Implement `evaluateSpeakingDesire()` for signal generation
- [ ] Support direct addressing of other participants
- [ ] Maintain conversation history with memory trimming
- [ ] Support RAG context injection
- [ ] Stream tokens via SSE manager

---

## Implementation Guide

### PersonaAgent Implementation

Create file: `backend/src/services/conversation/persona-agent.ts`

```typescript
import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type { RAGRetrievalService } from '../research/rag-retrieval-service.js';
import type {
  PodcastPersona,
  ConversationParticipant,
  SpeakerSignal,
  SignalUrgency,
  SignalReason,
} from '../../types/conversation.js';
import { createOpenRouterClient, OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import { buildPersonaSystemPrompt, buildResponsePrompt, buildSpeakingDesirePrompt } from './prompts/persona-prompts.js';

const logger = pino({
  name: 'persona-agent',
  level: process.env.LOG_LEVEL || 'info',
});

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
 * Represents a character in podcast conversations.
 * Unlike ChairAgent, this embodies a persona rather than arguing a position.
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
      const content = await this.generate(prompt, 'response', 0.8, 400);
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

      if (signal && signal.urgency !== 'none') {
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

      if (!urgencyMatch || urgencyMatch[1] === 'none') {
        return null;
      }

      return {
        participantId: this.participant.id,
        urgency: urgencyMatch[1].toLowerCase() as SignalUrgency,
        reason: (reasonMatch?.[1]?.toLowerCase() || 'addition') as SignalReason,
        preview: previewMatch?.[1]?.trim() || '',
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Add external context to the conversation
   */
  addContext(context: string): void {
    this.addToHistory('user', `[CONTEXT]: ${context}`);
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
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Generate with optional streaming and RAG injection
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
      }
    }

    const messages = [...this.conversationHistory, { role: 'user' as const, content: enhancedPrompt }];

    // Use streaming if SSE manager is available
    if (this.sseManager && this.llmClient instanceof OpenRouterLLMClient) {
      return this.generateWithStreaming(messages, segment, temperature, maxTokens);
    }

    return this.llmClient.chat(messages, { temperature, maxTokens });
  }

  /**
   * Generate with streaming via SSE
   */
  private async generateWithStreaming(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    segment: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    const chunks: string[] = [];

    const stream = (this.llmClient as OpenRouterLLMClient).streamChat(
      messages,
      { temperature, maxTokens }
    );

    for await (const chunk of stream) {
      chunks.push(chunk);

      // Broadcast token via SSE
      if (this.sseManager) {
        this.sseManager.broadcastToConversation(this.sessionId, 'conversation_token', {
          participantId: this.participant.id,
          personaSlug: this.persona.slug,
          personaName: this.name,
          segment,
          token: chunk,
        });
      }
    }

    return chunks.join('');
  }

  /**
   * Add entry to conversation history with trimming
   */
  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Trim history if too long (keep system prompt + last 30 exchanges)
    const maxEntries = 61;
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
```

### Persona Prompts

Create file: `backend/src/services/conversation/prompts/persona-prompts.ts`

```typescript
import type { PodcastPersona } from '../../../types/conversation.js';

/**
 * Build system prompt for a persona agent
 */
export function buildPersonaSystemPrompt(
  persona: PodcastPersona,
  topic: string,
  otherParticipantNames: string[]
): string {
  const quirksText = persona.quirks.length > 0
    ? `\n\nQUIRKS:\n${persona.quirks.map(q => `- ${q}`).join('\n')}`
    : '';

  const examplesText = persona.examplePhrases.length > 0
    ? `\n\nEXAMPLE PHRASES (use similar style):\n${persona.examplePhrases.map(p => `- "${p}"`).join('\n')}`
    : '';

  return `You are ${persona.name}, a participant in a podcast conversation.

BACKSTORY:
${persona.backstory}

SPEAKING STYLE:
${persona.speakingStyle}

WORLDVIEW:
${persona.worldview}
${quirksText}
${examplesText}

TODAY'S TOPIC: ${topic}

OTHER PARTICIPANTS: ${otherParticipantNames.join(', ')}

GUIDELINES:
1. Stay in character at all times
2. Respond naturally as ${persona.name.split(' ')[0]} would
3. You may address other participants by name when responding to them
4. Express your genuine perspective based on your worldview
5. Be conversational - this is a podcast, not a debate
6. Keep responses concise (2-4 paragraphs typically)
7. Show authentic reactions - agreement, curiosity, skepticism, etc.
8. Build on what others say rather than just stating your position`;
}

/**
 * Build prompt for generating a response
 */
export function buildResponsePrompt(
  persona: PodcastPersona,
  conversationContext: string,
  addressedTo?: string,
  previousSpeaker?: string,
  participantNames?: string[]
): string {
  let prompt = `RECENT CONVERSATION:
${conversationContext}

---

`;

  if (addressedTo === persona.name || addressedTo === persona.slug) {
    prompt += `The host has specifically asked you to respond. `;
  } else if (previousSpeaker) {
    prompt += `${previousSpeaker} just spoke. `;
  }

  prompt += `As ${persona.name}, share your perspective on what's being discussed. `;

  if (participantNames && participantNames.length > 0) {
    prompt += `You may address ${participantNames.join(' or ')} directly if relevant. `;
  }

  prompt += `Stay in character and be authentic to your worldview.`;

  return prompt;
}

/**
 * Build prompt for evaluating desire to speak
 */
export function buildSpeakingDesirePrompt(
  persona: PodcastPersona,
  recentContext: string,
  currentSpeaker: string
): string {
  return `RECENT CONVERSATION:
${recentContext}

---

${currentSpeaker} is currently speaking.

As ${persona.name}, evaluate whether you have something important to add to this conversation.

Consider:
- Does this topic touch on your expertise or worldview?
- Do you agree or disagree with what's being said?
- Can you offer a unique perspective or clarification?
- Would jumping in feel natural and valuable?

Respond in this exact format:
URGENCY: [high/medium/low/none]
REASON: [agreement/disagreement/clarification/addition/redirect]
PREVIEW: [1-2 sentence preview of what you'd say]

If you don't feel compelled to speak, use URGENCY: none`;
}

/**
 * Check if content appears to address someone directly
 */
export function extractAddressedParticipant(content: string, participantNames: string[]): string | null {
  for (const name of participantNames) {
    const firstName = name.split(' ')[0];
    // Check for patterns like "Mike, I think..." or "What do you think, Sarah?"
    if (
      content.toLowerCase().includes(firstName.toLowerCase() + ',') ||
      content.toLowerCase().includes(', ' + firstName.toLowerCase()) ||
      content.toLowerCase().startsWith(firstName.toLowerCase())
    ) {
      return name;
    }
  }
  return null;
}
```

---

## Validation

### How to Test

1. Create a test persona agent:
   ```typescript
   const agent = new PersonaAgent({
     persona: professorClara,
     participant: { id: 'test', modelId: 'anthropic/claude-sonnet-4', ... },
     sessionId: 'test-session',
     topic: 'The future of AI',
     otherParticipants: [{ name: 'Maverick Mike', persona: maverickMike }],
   });

   const response = await agent.generateResponse(
     'Mike just said AI will replace all jobs within 5 years.',
     undefined,
     'Maverick Mike'
   );
   console.log(response);
   ```

2. Test speaking desire evaluation:
   ```typescript
   const signal = await agent.evaluateSpeakingDesire(
     'Host: What about the educational implications?',
     'Host'
   );
   console.log(signal); // { urgency: 'high', reason: 'addition', preview: '...' }
   ```

3. Verify character consistency across multiple responses

### Definition of Done

- [ ] `PersonaAgent` class implemented with all methods
- [ ] `buildPersonaSystemPrompt` produces character-consistent prompts
- [ ] `generateResponse` maintains character voice
- [ ] `evaluateSpeakingDesire` returns structured signals
- [ ] Direct addressing detection works
- [ ] Streaming via SSE works when manager provided
- [ ] RAG integration optional and functional
- [ ] History trimming prevents context overflow
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-005 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
