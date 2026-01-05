# DUELOGIC-004: Chair Agent & Prompts

**Priority:** P0
**Estimate:** M (1.5 days)
**Labels:** `agents`, `backend`, `duelogic`, `prompts`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001

---

## Context

Chair agents represent philosophical positions in Duelogic debates. Each chair is assigned a philosophical framework and must argue from that perspective while meeting steel-manning and self-critique obligations.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Chair Prompts section
- [Existing Agents](../../../backend/src/services/agents/) - Agent patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/services/agents/chair-agent.ts`
- [ ] Create `backend/src/services/agents/prompts/chair-prompts.ts`
- [ ] Implement framework-aware system prompts
- [ ] Support all 10 philosophical frameworks
- [ ] Generate opening statements
- [ ] Generate exchange responses with steel-manning
- [ ] Generate self-critique acknowledgments
- [ ] Support all three tone levels (respectful, spirited, heated)
- [ ] Handle streaming responses
- [ ] Write unit tests for each framework

---

## Implementation Guide

### File: `backend/src/services/agents/prompts/chair-prompts.ts`

```typescript
import { DuelogicChair, DuelogicConfig, PHILOSOPHICAL_CHAIR_INFO, PhilosophicalChair } from '../../../types/duelogic';

const TONE_INSTRUCTIONS = {
  respectful: 'Maintain professional, collegial discourse. Disagree with ideas, not people.',
  spirited: 'Engage with passion and conviction. Be direct and pointed in your critiques.',
  heated: 'Argue forcefully. Challenge aggressively. Make your disagreements memorable.',
} as const;

export function buildChairSystemPrompt(
  chair: DuelogicChair,
  opponentChairs: DuelogicChair[],
  tone: 'respectful' | 'spirited' | 'heated'
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
  const opponentDescriptions = opponentChairs.map(opp => {
    const oppInfo = PHILOSOPHICAL_CHAIR_INFO[opp.framework];
    return `- ${opp.modelDisplayName || opp.modelId} (${oppInfo.name}): ${oppInfo.description}`;
  }).join('\n');

  return `You are holding the ${info.name} in this Duelogic debate.

**Your Assigned Framework:**
${info.description}

Core Question: "${info.coreQuestion}"

**Your Opponents:**
${opponentDescriptions}

---

**MANDATORY OBLIGATIONS:**

1. **STEEL-MAN FIRST**
   Before critiquing any opponent's position, you MUST articulate the strongest
   version of their argument. Show you understand it deeply.

   Say something like: "The ${opponentChairs[0]?.modelDisplayName || 'opposing chair'}
   makes a compelling case that..." Then engage with THAT version, not a weakened one.

2. **ACKNOWLEDGE YOUR WEAKNESSES**
   In each substantive response, you MUST acknowledge at least one limitation
   or blind spot of your framework. This shows intellectual honesty.

   Known blind spots to consider:
${info.blindSpotsToAdmit.map(b => `   - ${b}`).join('\n')}

3. **ARGUE FROM YOUR FRAMEWORK**
   Stay true to ${info.name} reasoning. Don't abandon your framework when
   it gets difficult—that's when it's most important to show how it handles
   hard cases.

---

**TONE:** ${TONE_INSTRUCTIONS[tone]}

**FORMAT:** This is for a podcast audience. Be engaging, substantive, but natural.
- Aim for 150-300 words per response
- No formal headers or bullet lists unless they genuinely help
- Speak as if you're in a conversation, not writing an essay
- It's okay to express uncertainty or acknowledge good points from opponents

**REMEMBER:** The goal is not to "win" but to illuminate the question from your
framework's perspective. The best debates clarify disagreements; they don't
paper over them.`;
}

export function buildOpeningStatementPrompt(
  chair: DuelogicChair,
  proposition: string,
  propositionContext?: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];

  return `You are opening the debate from the ${info.name} perspective.

**PROPOSITION:** "${proposition}"
${propositionContext ? `\n**CONTEXT:** ${propositionContext}` : ''}

**YOUR TASK:**
Present your framework's initial position on this proposition. This is your opening
statement—set up your core argument.

**REQUIREMENTS:**
1. Explain why this question matters from your framework's perspective
2. State your framework's key principles as they apply here
3. Preview your main argument
4. Acknowledge one limitation of your approach (briefly)

**TONE:** Confident but humble. You have a perspective, not the final word.

**LENGTH:** 200-350 words

Begin your opening statement now.`;
}

export function buildExchangeResponsePrompt(
  chair: DuelogicChair,
  previousSpeaker: DuelogicChair,
  previousContent: string,
  debateContext: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
  const prevInfo = PHILOSOPHICAL_CHAIR_INFO[previousSpeaker.framework];

  return `You are responding from the ${info.name} perspective.

**WHAT ${previousSpeaker.modelDisplayName || previousSpeaker.modelId} (${prevInfo.name}) JUST SAID:**
"${previousContent}"

**DEBATE SO FAR (last 1500 chars):**
${debateContext.slice(-1500)}

**YOUR TASK:**
Respond to what was just said. Engage directly with their argument.

**MANDATORY ELEMENTS:**

1. **STEEL-MAN FIRST** (2-3 sentences)
   Begin by articulating the strongest version of what they said.
   "I appreciate the force of the ${prevInfo.name} argument here—what they're
   really saying is..."

2. **YOUR RESPONSE** (main body)
   Now engage with their strongest argument from your ${info.name} perspective.
   Don't attack a weakened version.

3. **SELF-CRITIQUE** (1-2 sentences)
   Acknowledge where your own framework struggles with this point.
   "I'll admit, this is where ${info.name} faces a genuine challenge..."

**LENGTH:** 150-300 words

Respond now.`;
}

export function buildDirectChallengePrompt(
  chair: DuelogicChair,
  challenger: DuelogicChair,
  challengeContent: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
  const challInfo = PHILOSOPHICAL_CHAIR_INFO[challenger.framework];

  return `You've been directly challenged by ${challenger.modelDisplayName || challenger.modelId} (${challInfo.name}).

**THE CHALLENGE:**
"${challengeContent}"

**YOUR TASK:**
Defend your position while maintaining intellectual honesty.

**REQUIREMENTS:**
1. Address the challenge directly—don't evade
2. Explain how your ${info.name} framework handles this objection
3. If it's a genuine weakness, admit it and explain how you weigh it against your framework's strengths

**LENGTH:** 100-200 words

Respond to the challenge now.`;
}

export function buildInterruptionResponsePrompt(
  chair: DuelogicChair,
  interrupter: DuelogicChair,
  interruptionContent: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];

  return `You've been interrupted by ${interrupter.modelDisplayName || interrupter.modelId}.

**WHAT THEY SAID:**
"${interruptionContent}"

**YOUR TASK:**
Respond briefly to the interruption before continuing your point.

**GUIDELINES:**
- Address what they said directly
- Don't get defensive—engage with the substance
- You can concede a point if it's valid
- Then return to your argument if you weren't finished

**LENGTH:** 50-150 words

Respond to the interruption now.`;
}

/**
 * Get framework-specific opening hooks for engagement
 */
export function getFrameworkOpeningHook(framework: PhilosophicalChair): string {
  const hooks: Record<PhilosophicalChair, string> = {
    utilitarian: "Let's start with a simple question: what outcome would produce the greatest good?",
    virtue_ethics: "Before we dive into policy, let me ask: what would a wise person do here?",
    deontological: "Some principles cannot be violated, no matter the consequences.",
    pragmatic: "Theory is fine, but let's talk about what actually works.",
    libertarian: "The first question should always be: does this respect individual liberty?",
    communitarian: "We don't exist as isolated individuals—we're embedded in communities.",
    cosmopolitan: "Every human being has equal moral worth, regardless of where they were born.",
    precautionary: "Before we act, let's consider what we might lose if we get this wrong.",
    autonomy_centered: "People have a right to make their own choices, even ones we disagree with.",
    care_ethics: "Moral reasoning starts with relationships, not abstract principles.",
  };
  return hooks[framework];
}

/**
 * Get framework-specific self-critique prompts
 */
export function getSelfCritiquePrompt(framework: PhilosophicalChair): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[framework];
  const randomBlindSpot = info.blindSpotsToAdmit[
    Math.floor(Math.random() * info.blindSpotsToAdmit.length)
  ];
  return `I'll acknowledge a limitation of my ${info.name} approach: ${randomBlindSpot}.`;
}
```

### File: `backend/src/services/agents/chair-agent.ts`

```typescript
import { LLMClient } from '../../llm/openrouter-adapter';
import { SSEManager } from '../../sse/sse-manager';
import {
  DuelogicChair,
  DuelogicConfig,
  PHILOSOPHICAL_CHAIR_INFO
} from '../../types/duelogic';
import {
  buildChairSystemPrompt,
  buildOpeningStatementPrompt,
  buildExchangeResponsePrompt,
  buildDirectChallengePrompt,
  buildInterruptionResponsePrompt,
  getFrameworkOpeningHook
} from './prompts/chair-prompts';

export class ChairAgent {
  private llmClient: LLMClient;
  private sseManager: SSEManager;
  private chair: DuelogicChair;
  private config: DuelogicConfig;
  private debateId: string;
  private systemPrompt: string;
  private conversationHistory: Array<{ role: string; content: string }>;

  constructor(
    llmClient: LLMClient,
    sseManager: SSEManager,
    chair: DuelogicChair,
    config: DuelogicConfig,
    debateId: string
  ) {
    this.llmClient = llmClient;
    this.sseManager = sseManager;
    this.chair = chair;
    this.config = config;
    this.debateId = debateId;

    const opponents = config.chairs.filter(c => c.position !== chair.position);
    this.systemPrompt = buildChairSystemPrompt(chair, opponents, config.tone);
    this.conversationHistory = [
      { role: 'system', content: this.systemPrompt }
    ];
  }

  get position(): string {
    return this.chair.position;
  }

  get framework(): string {
    return this.chair.framework;
  }

  get displayName(): string {
    return this.chair.modelDisplayName || this.chair.modelId;
  }

  async generateOpening(
    proposition: string,
    propositionContext?: string
  ): Promise<string> {
    const prompt = buildOpeningStatementPrompt(this.chair, proposition, propositionContext);

    const response = await this.llmClient.generateWithStreaming({
      model: this.chair.modelId,
      messages: [
        ...this.conversationHistory,
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      maxTokens: 600,
      onToken: (token: string) => {
        this.sseManager.broadcast(this.debateId, {
          type: 'token',
          data: {
            speaker: this.chair.position,
            segment: 'opening',
            framework: this.chair.framework,
            token
          }
        });
      }
    });

    this.conversationHistory.push(
      { role: 'user', content: prompt },
      { role: 'assistant', content: response.content }
    );

    return response.content;
  }

  async generateExchangeResponse(
    previousSpeaker: DuelogicChair,
    previousContent: string,
    debateContext: string
  ): Promise<string> {
    const prompt = buildExchangeResponsePrompt(
      this.chair,
      previousSpeaker,
      previousContent,
      debateContext
    );

    const response = await this.llmClient.generateWithStreaming({
      model: this.chair.modelId,
      messages: [
        ...this.conversationHistory,
        { role: 'user', content: prompt }
      ],
      temperature: 0.75,
      maxTokens: 500,
      onToken: (token: string) => {
        this.sseManager.broadcast(this.debateId, {
          type: 'token',
          data: {
            speaker: this.chair.position,
            segment: 'exchange',
            framework: this.chair.framework,
            token
          }
        });
      }
    });

    this.conversationHistory.push(
      { role: 'user', content: prompt },
      { role: 'assistant', content: response.content }
    );

    return response.content;
  }

  async respondToChallenge(
    challenger: DuelogicChair,
    challengeContent: string
  ): Promise<string> {
    const prompt = buildDirectChallengePrompt(this.chair, challenger, challengeContent);

    const response = await this.llmClient.generateWithStreaming({
      model: this.chair.modelId,
      messages: [
        ...this.conversationHistory,
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 350,
      onToken: (token: string) => {
        this.sseManager.broadcast(this.debateId, {
          type: 'token',
          data: {
            speaker: this.chair.position,
            segment: 'challenge_response',
            framework: this.chair.framework,
            token
          }
        });
      }
    });

    this.conversationHistory.push(
      { role: 'user', content: prompt },
      { role: 'assistant', content: response.content }
    );

    return response.content;
  }

  async respondToInterruption(
    interrupter: DuelogicChair,
    interruptionContent: string
  ): Promise<string> {
    const prompt = buildInterruptionResponsePrompt(this.chair, interrupter, interruptionContent);

    const response = await this.llmClient.generate({
      model: this.chair.modelId,
      messages: [
        ...this.conversationHistory,
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 250,
    });

    this.conversationHistory.push(
      { role: 'user', content: prompt },
      { role: 'assistant', content: response.content }
    );

    return response.content;
  }

  getFrameworkInfo() {
    return PHILOSOPHICAL_CHAIR_INFO[this.chair.framework];
  }

  getOpeningHook(): string {
    return getFrameworkOpeningHook(this.chair.framework);
  }
}

/**
 * Factory function to create all chair agents for a debate
 */
export function createChairAgents(
  llmClient: LLMClient,
  sseManager: SSEManager,
  config: DuelogicConfig,
  debateId: string
): Map<string, ChairAgent> {
  const agents = new Map<string, ChairAgent>();

  for (const chair of config.chairs) {
    agents.set(
      chair.position,
      new ChairAgent(llmClient, sseManager, chair, config, debateId)
    );
  }

  return agents;
}
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration

---

## Validation

```bash
# Unit tests
npm run test -- --grep "ChairAgent"

# Test each framework generates valid responses
npm run test:integration -- --grep "chair frameworks"
```

---

## Test Cases

```typescript
describe('ChairAgent', () => {
  describe('system prompts', () => {
    it.each([
      'utilitarian', 'virtue_ethics', 'deontological', 'pragmatic',
      'libertarian', 'communitarian', 'cosmopolitan', 'precautionary',
      'autonomy_centered', 'care_ethics'
    ])('generates valid system prompt for %s', (framework) => {
      const prompt = buildChairSystemPrompt(
        { position: 'chair_1', framework: framework as any, modelId: 'test' },
        [{ position: 'chair_2', framework: 'utilitarian', modelId: 'test' }],
        'spirited'
      );
      expect(prompt).toContain('STEEL-MAN FIRST');
      expect(prompt).toContain('ACKNOWLEDGE YOUR WEAKNESSES');
    });
  });

  describe('opening statements', () => {
    it('includes framework perspective', async () => {
      const opening = await chairAgent.generateOpening('Should AI be regulated?');
      const info = PHILOSOPHICAL_CHAIR_INFO[chairAgent.framework];
      expect(opening).toMatch(new RegExp(info.coreQuestion.split(' ')[0], 'i'));
    });
  });

  describe('exchange responses', () => {
    it('steel-mans opponent before critiquing', async () => {
      const response = await chairAgent.generateExchangeResponse(
        opponentChair,
        'Consequences are all that matter!',
        'debate context'
      );
      expect(response.toLowerCase()).toMatch(/appreciate|understand|point|valid/);
    });
  });
});
```

---

## Definition of Done

- [ ] All 10 philosophical frameworks have valid prompts
- [ ] Opening statements reference framework principles
- [ ] Exchange responses include steel-manning
- [ ] Exchange responses include self-critique
- [ ] Tone settings affect output appropriately
- [ ] Streaming works for real-time display
- [ ] Conversation history maintained properly
- [ ] Unit tests pass with >80% coverage

---

## 📝 Implementation Notes from DUELOGIC-001 & DUELOGIC-002

> Added by agent completing Sprint 1 on 2026-01-03

### Types Available

Import from `backend/src/types/duelogic.ts`:

```typescript
import {
  DuelogicChair,
  DuelogicConfig,
  PhilosophicalChair,
  DebateTone,
  PHILOSOPHICAL_CHAIR_INFO,
  TONE_INFO,
} from '../../types/duelogic.js';
```

### 10 Philosophical Frameworks

Each has `name`, `description`, `coreQuestion`, `strengthsToAcknowledge[]`, `blindSpotsToAdmit[]`:

1. `utilitarian` - "What produces the greatest good for the greatest number?"
2. `virtue_ethics` - "What would a person of good character do?"
3. `deontological` - "What does moral duty require, regardless of consequences?"
4. `pragmatic` - "What approach will actually work in the real world?"
5. `libertarian` - "Does this respect individual freedom and consent?"
6. `communitarian` - "What do we owe to our communities?"
7. `cosmopolitan` - "What do we owe to all humans, regardless of nationality?"
8. `precautionary` - "What are the risks of getting this wrong?"
9. `autonomy_centered` - "Does this respect people's right to make their own choices?"
10. `care_ethics` - "How do we best care for those who depend on us?"

### Tone Settings

Three tones defined in `TONE_INFO`:
- `respectful` - Professional, collegial
- `spirited` - Passionate, direct
- `heated` - Forceful, aggressive

### Chair Position Naming

Chairs use positions: `chair_1`, `chair_2`, ... `chair_6`
These are valid speakers in the database (utterances table constraint updated).

### Repository Functions for Chair Data

From `backend/src/db/repositories/duelogic-repository.ts`:

```typescript
import {
  getChairAssignments,
  getChairByPosition,
} from '../../db/repositories/duelogic-repository.js';
```

### Existing Agent Patterns to Follow

- `backend/src/services/agents/pro-advocate-agent.ts` - Advocate structure
- `backend/src/services/agents/con-advocate-agent.ts` - Conversation history management

### Multi-Model Support

Each chair can use a different model via `chair.modelId`. The OpenRouter adapter handles routing to different providers (Anthropic, OpenAI, xAI, Google, Meta).
