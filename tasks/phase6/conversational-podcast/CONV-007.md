# CONV-007: PodcastHostAgent (Ultrathink)

**Task ID:** CONV-007
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** L (8-16 hours)
**Dependencies:** CONV-002 (Types), CONV-005 (PersonaAgent), CONV-006 (ContextBoard)
**Status:** Ready

---

## Context

This task creates the PodcastHostAgent - the talk show host that guides podcast conversations. Unlike debate moderators, this agent acts like Terry Gross, Joe Rogan, or Lex Fridman: introducing guests with backstories, presenting topics engagingly, asking probing questions, and steering discussions organically.

The host uses "ultrathink" (extended thinking with Claude models) for complex decisions about conversation flow.

**References:**
- [CONV-005](./CONV-005.md) - PersonaAgent pattern
- [CONV-006](./CONV-006.md) - ContextBoardService for state
- Existing: `backend/src/services/agents/moderator-agent.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `PodcastHostAgent` in `backend/src/services/agents/podcast-host-agent.ts`
- [ ] Implement `generateOpening()` - introduce guests and topic
- [ ] Implement `decideNextSpeaker()` - consider signals, balance, topic coverage
- [ ] Implement `generateFollowUp()` - ask probing questions
- [ ] Implement `generateBridge()` - connect viewpoints
- [ ] Implement `generateClosing()` - summarize without declaring winners
- [ ] Use extended thinking for speaker selection decisions
- [ ] Consider context board state in all decisions

---

## Implementation Guide

### PodcastHostAgent Implementation

Create file: `backend/src/services/agents/podcast-host-agent.ts`

```typescript
import pino from 'pino';
import type { LLMClient } from '../llm/client.js';
import type { SSEManager } from '../sse/sse-manager.js';
import type { ContextBoardService } from '../conversation/context-board-service.js';
import type {
  PodcastPersona,
  ConversationParticipant,
  ContextBoardState,
  SpeakerSignal,
} from '../../types/conversation.js';
import { createOpenRouterClient, OpenRouterLLMClient } from '../llm/openrouter-adapter.js';

const logger = pino({
  name: 'podcast-host-agent',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Default model for host (Claude Sonnet for quality + speed)
 */
const HOST_MODEL = 'anthropic/claude-sonnet-4-20250514';

/**
 * Extended thinking budget for complex decisions
 */
const THINKING_BUDGET_TOKENS = 8000;

/**
 * Guest info for host to reference
 */
interface GuestInfo {
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
 * PodcastHostAgent Class
 *
 * The talk show host that guides podcast conversations.
 * Uses extended thinking for complex flow decisions.
 */
export class PodcastHostAgent {
  private llmClient: LLMClient;
  private sseManager?: SSEManager;
  private sessionId: string;
  private topic: string;
  private topicContext?: string;
  private guests: GuestInfo[];
  private conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
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
  // SYSTEM PROMPT
  // =========================================================================

  private buildSystemPrompt(): string {
    const guestIntros = this.guests.map(g =>
      `- ${g.displayName} (${g.persona.avatarEmoji}): ${g.persona.backstory.split('.')[0]}.`
    ).join('\n');

    return `You are a world-class podcast host, in the style of Terry Gross, Joe Rogan, and Lex Fridman combined.

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

GUESTS TO INTRODUCE:
${guestDetails}

TOPIC: ${this.topic}
${this.topicContext ? `CONTEXT: ${this.topicContext}` : ''}

Your opening should:
1. Welcome listeners warmly
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

    // Update guest turn counts from state
    const turnCounts = this.guests.map(g => ({
      name: g.displayName,
      participantId: g.participantId,
      turns: g.turnCount,
    }));

    const signalInfo = signalQueue.length > 0
      ? `\nPENDING SIGNALS:\n${signalQueue.map(s => {
          const guest = this.guests.find(g => g.participantId === s.participantId);
          return `- ${guest?.displayName || 'Unknown'} (${s.urgency}): ${s.reason} - "${s.preview}"`;
        }).join('\n')}`
      : '\nNo pending signals.';

    const prompt = `Decide who should speak next in this podcast conversation.

RECENT TRANSCRIPT:
${recentTranscript}

CONTEXT BOARD STATE:
- Current thread: ${state.currentThread || 'general discussion'}
- Topics covered: ${state.topicsDiscussed.map(t => t.topic).join(', ') || 'none yet'}
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

Respond in this format:
DECISION: [participant_id OR "host"]
REASON: [1-2 sentence explanation]
DIRECT_ADDRESS: [yes/no - should I call on them by name?]
QUESTION: [optional - if host should ask a specific question]`;

    try {
      // Use extended thinking for this complex decision
      const response = await this.generateWithThinking(prompt, 0.7, 300);

      return this.parseSpeakerDecision(response);
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to decide next speaker');
      // Fallback: pick least-spoken guest
      const leastSpoken = [...this.guests].sort((a, b) => a.turnCount - b.turnCount)[0];
      return {
        participantId: leastSpoken?.participantId || this.guests[0].participantId,
        reason: 'Fallback selection',
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
    const prompt = `Generate a follow-up question for ${targetGuest.displayName}.

WHAT THEY JUST SAID (or context):
${recentContent}

REASON FOR FOLLOW-UP: ${reason}

THEIR BACKGROUND:
${targetGuest.persona.backstory}

Generate a natural, probing question that:
- Addresses them by name
- Digs deeper into what they said OR connects to their expertise
- Is conversational (1-2 sentences max)
- Shows genuine curiosity`;

    const content = await this.generate(prompt, 'followup', 0.8, 150);
    this.addToHistory('assistant', content);
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
    const prompt = `Generate a bridging statement connecting viewpoints from ${guestA.displayName} and ${guestB.displayName}.

POINT OF CONNECTION: ${pointOfConnection}

Create a natural transition that:
- Acknowledges what ${guestA.displayName} said
- Draws a connection to ${guestB.displayName}'s perspective or expertise
- Invites ${guestB.displayName} to respond
- Is warm and curious, not confrontational (1-2 sentences)`;

    const content = await this.generate(prompt, 'bridge', 0.8, 100);
    this.addToHistory('assistant', content);
    return content;
  }

  /**
   * Generate a redirection when conversation goes off track
   */
  async generateRedirect(
    currentTangent: string,
    desiredDirection: string
  ): Promise<string> {
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
    return content;
  }

  /**
   * Generate closing remarks - summarize without declaring winners
   */
  async generateClosing(
    contextBoard: ContextBoardService,
    fullTranscript: string
  ): Promise<string> {
    const state = contextBoard.getState();

    const keyPointsSummary = Object.entries(state.keyPointsByParticipant)
      .map(([id, points]) => {
        const guest = this.guests.find(g => g.participantId === id);
        return `${guest?.displayName || 'Guest'}: ${points.slice(0, 2).join('; ')}`;
      })
      .join('\n');

    const prompt = `Generate a warm closing for this podcast conversation.

TOPICS COVERED:
${state.topicsDiscussed.map(t => `- ${t.topic} (${t.status})`).join('\n')}

KEY POINTS BY GUEST:
${keyPointsSummary || 'Various perspectives shared'}

AGREEMENTS REACHED: ${state.agreements.length}
DISAGREEMENTS: ${state.disagreements.length}

Your closing should:
1. Thank each guest by name for their unique contribution
2. Summarize 2-3 key threads WITHOUT declaring anyone right or wrong
3. Note any interesting agreements or productive tensions
4. End warmly, leaving listeners with something to think about

Be genuine and appreciative. This is a conversation, not a competition.`;

    try {
      const content = await this.generate(prompt, 'closing', 0.8, 400);
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
    }
  }

  /**
   * Add conversation context
   */
  addContext(content: string): void {
    this.addToHistory('user', `[CONVERSATION]: ${content}`);
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private parseSpeakerDecision(response: string): SpeakerDecision {
    const decisionMatch = response.match(/DECISION:\s*(\S+)/i);
    const reasonMatch = response.match(/REASON:\s*(.+?)(?=\n|DIRECT|QUESTION|$)/is);
    const directMatch = response.match(/DIRECT_ADDRESS:\s*(yes|no)/i);
    const questionMatch = response.match(/QUESTION:\s*(.+)/i);

    const participantId = decisionMatch?.[1] || this.guests[0].participantId;

    return {
      participantId: participantId === 'host' ? 'host' : participantId,
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

  private async generateWithThinking(
    prompt: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // For Claude models, use extended thinking
    const messages = [...this.conversationHistory, { role: 'user' as const, content: prompt }];

    // TODO: When OpenRouter supports extended thinking, use it here
    // For now, fall back to regular generation with higher token budget
    return this.llmClient.chat(messages, {
      temperature,
      maxTokens: maxTokens + 200 // Extra budget for reasoning
    });
  }

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

      if (this.sseManager) {
        this.sseManager.broadcastToConversation(this.sessionId, 'conversation_token', {
          participantId: 'host',
          personaSlug: 'host',
          personaName: 'Host',
          segment,
          token: chunk,
        });
      }
    }

    return chunks.join('');
  }

  private addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Trim if too long
    const maxEntries = 41;
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
// FACTORY FUNCTION
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
```

---

## Validation

### How to Test

1. Create a host agent:
   ```typescript
   const host = createPodcastHostAgent(
     'session-123',
     'The future of AI in healthcare',
     [
       { participant: p1, persona: professorClara },
       { participant: p2, persona: drViktor },
     ]
   );
   ```

2. Generate opening:
   ```typescript
   const opening = await host.generateOpening();
   console.log(opening);
   // Should introduce both guests with backstory and present topic
   ```

3. Test speaker decision:
   ```typescript
   const decision = await host.decideNextSpeaker(
     contextBoard,
     'Clara: I think AI will transform diagnostics. Viktor: *nodding skeptically*'
   );
   console.log(decision);
   // Should consider signals, balance, and natural flow
   ```

### Definition of Done

- [ ] `PodcastHostAgent` class implemented
- [ ] Opening generation introduces all guests with backstory
- [ ] Speaker decision considers signals, balance, and flow
- [ ] Follow-up questions are probing and relevant
- [ ] Bridge statements connect viewpoints naturally
- [ ] Closing summarizes without declaring winners
- [ ] Streaming via SSE works
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-007 COMPLETE</promise>
```

---

**Estimated Time:** 8-16 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
