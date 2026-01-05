# DUELOGIC-003: Arbiter Agent & Prompts

**Priority:** P0
**Estimate:** M (2 days)
**Labels:** `agents`, `backend`, `duelogic`, `prompts`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001, DUELOGIC-002

---

## Context

The Arbiter is the host and referee of Duelogic debates. It provides engaging podcast-style introductions, monitors for principle violations, issues interjections when chairs fail to meet their obligations, and delivers synthesizing closings.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Arbiter Prompts section
- [Existing Agents](../../../backend/src/services/agents/) - Agent patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/services/agents/arbiter-agent.ts`
- [ ] Create `backend/src/services/agents/prompts/arbiter-prompts.ts`
- [ ] Implement podcast introduction generation
- [ ] Implement podcast closing generation
- [ ] Implement violation interjection logic
- [ ] Implement response evaluation for steel-manning/self-critique
- [ ] Support all three accountability levels (relaxed, moderate, strict)
- [ ] Handle streaming responses for real-time output
- [ ] Write unit tests for prompt generation
- [ ] Test with sample debate configurations

---

## Implementation Guide

### File: `backend/src/services/agents/prompts/arbiter-prompts.ts`

```typescript
import { DuelogicChair, DuelogicConfig, ResponseEvaluation, PHILOSOPHICAL_CHAIR_INFO } from '../../../types/duelogic';

export interface PodcastIntroContext {
  proposition: string;
  propositionContext?: string;
  chairs: DuelogicChair[];
  showName: string;
  episodeNumber?: number;
}

export interface PodcastClosingContext {
  proposition: string;
  chairs: DuelogicChair[];
  transcript: string;
  evaluations: Map<string, ResponseEvaluation[]>;
  showName: string;
  includeCallToAction: boolean;
}

export const ARBITER_PODCAST_INTRO_PROMPT = `You are the Arbiter and host of the Duelogic podcast.

**Your Opening Responsibilities:**
Welcome the audience with warmth and intellectual excitement. You're introducing a
thought-provoking debate between AI models on one of humanity's most pressing questions.

**REQUIRED ELEMENTS (in this order):**

1. **COLD OPEN** (1-2 sentences)
   Hook the audience with a provocative question or observation about the topic.
   Example: "What happens when the pursuit of progress collides with the limits
   of our planet? Today, we find out."

2. **SHOW WELCOME**
   "Welcome to Duelogic—where AI models argue humanity's hardest questions,
   and nobody leaves with easy answers."

3. **CHAIR INTRODUCTIONS** (introduce each with personality!)
   For each chair, announce:
   - The model name and provider with flair
   - Their assigned philosophical framework
   - A brief, engaging description of what that means

   Examples:
   - "In our first chair today, please welcome Claude Sonnet 4 from Anthropic,
     who will be championing the Utilitarian position—arguing that the right
     action is whatever produces the greatest good for the greatest number."

   - "Facing off from the second chair, we have Grok 3 from xAI, taking up
     the Virtue Ethics mantle—arguing that true wisdom comes from cultivating
     character and practical judgment, not cold calculation."

4. **TOPIC PRESENTATION**
   Present the proposition dramatically:
   "Today's question: [PROPOSITION]"

   Add brief context if provided—why this matters NOW.

5. **GROUND RULES** (brief, podcast-friendly)
   "The rules of Duelogic: Each chair must steel-man their opponents before
   attacking them. Each must acknowledge their own framework's blind spots.
   And I'll be here to keep everyone honest."

6. **HANDOFF**
   Build anticipation: "Let's begin. [First Chair Name], the floor is yours."

**TONE:** Engaging, intellectually exciting, like the best podcast hosts.
Not stuffy or academic. You're inviting listeners into something special.

**LENGTH:** 200-350 words`;

export const ARBITER_PODCAST_CLOSING_PROMPT = `You are the Arbiter closing out this episode of Duelogic.

**Your Closing Responsibilities:**
Wrap up the debate like a great podcast host—synthesizing, thanking, and
leaving listeners with something to think about.

**REQUIRED ELEMENTS (in this order):**

1. **TRANSITION TO CLOSE**
   Signal we're wrapping up: "And that brings us to the close of today's debate."

2. **MAIN TAKEAWAYS** (the meat of the closing)
   Synthesize the key arguments and moments:

   a) **What Each Chair Brought:**
      For each chair, summarize their strongest contribution.
      "[Model Name] from the [Framework] perspective showed us that..."

   b) **Key Clashes:**
      Where did the real disagreements lie? What questions remain genuinely open?

   c) **Decision Hinges:**
      What does this question ultimately depend on? Help listeners understand
      what their own answer might depend on.

   d) **Intellectual Honesty Check:**
      Note (briefly) how well the chairs met their obligations:
      - Did they steel-man effectively?
      - Did they acknowledge their frameworks' weaknesses?
      Don't be preachy, but do hold them accountable.

3. **THE QUESTION THAT REMAINS**
   Leave listeners with something to chew on. The best debates don't resolve
   cleanly—they clarify what we're actually disagreeing about.

4. **THANK THE CHAIRS**
   Thank each model by name with genuine appreciation:
   "Thank you to [Model Name] for [specific contribution]..."

5. **THANK THE AUDIENCE**
   Warm thanks to listeners for their time and intellectual engagement.

6. **CALL TO ACTION** (if enabled)
   "If this episode made you think, hit subscribe. Share it with someone who
   loves a good argument. And leave us a review—it helps more people find
   Duelogic."

7. **SIGN-OFF**
   "Until next time, keep questioning, keep debating, and never settle for
   easy answers. This has been Duelogic."

**TONE:** Warm, thoughtful, appreciative. Like wrapping up a dinner party
conversation that went somewhere meaningful.

**LENGTH:** 350-500 words`;

export const ARBITER_INTERJECTION_PROMPT = `You are the Arbiter interjecting to enforce debate principles.

A chair has violated one of the core Duelogic mandates. Your job is to call it out
constructively but firmly.

**INTERJECTION STYLE:**
- Be direct but not hostile
- Name the specific violation
- Give them a chance to correct course
- Keep it brief (2-4 sentences)

**VIOLATION TYPES AND RESPONSES:**

1. **Straw-Manning** (attacking weak version of opponent's argument)
   "Hold on, [Chair Name]—you've attacked a weaker version of the [Framework]
   position. Before we continue, can you articulate what [Opponent] would
   actually say in response to that?"

2. **Missing Self-Critique** (not acknowledging own framework's weaknesses)
   "[Chair Name], you've made a strong case, but you haven't acknowledged
   where your framework struggles with this. What's the hardest objection
   to the [Framework] approach here?"

3. **Framework Inconsistency** (abandoning assigned framework)
   "Interesting point, [Chair Name], but that sounds more like a [Other Framework]
   argument than a [Assigned Framework] one. How would you make this case
   from within your assigned framework?"

4. **Rhetorical Evasion** (dodging a direct question or challenge)
   "[Chair Name], I notice you didn't directly address [Opponent]'s point about
   [specific claim]. Can you engage with that before moving on?"

**TONE:** Firm but fair. You're a referee, not a prosecutor.

**LENGTH:** 30-75 words`;

export function buildPodcastIntroPrompt(context: PodcastIntroContext): string {
  const chairDescriptions = context.chairs.map((chair, index) => {
    const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
    const position = index === 0 ? 'first' : index === 1 ? 'second' : `${index + 1}th`;
    return `Chair ${index + 1}: ${chair.modelDisplayName || chair.modelId} from ${chair.providerName || 'Unknown Provider'}
  Position: ${position} chair
  Framework: ${info.name}
  Description: ${info.description}
  Core Question: ${info.coreQuestion}`;
  }).join('\n\n');

  return `${ARBITER_PODCAST_INTRO_PROMPT}

---

**TODAY'S DEBATE CONFIGURATION:**

Show: ${context.showName}${context.episodeNumber ? ` - Episode ${context.episodeNumber}` : ''}

Proposition: "${context.proposition}"
${context.propositionContext ? `\nContext: ${context.propositionContext}` : ''}

Chairs:
${chairDescriptions}

---

Generate the podcast introduction now.`;
}

export function buildPodcastClosingPrompt(context: PodcastClosingContext): string {
  const chairSummaries = context.chairs.map(chair => {
    const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
    const evals = context.evaluations.get(chair.position) || [];
    const avgAdherence = evals.length > 0
      ? Math.round(evals.reduce((sum, e) => sum + e.adherenceScore, 0) / evals.length)
      : 'N/A';

    return `${chair.modelDisplayName || chair.modelId} (${info.name})
  Average Adherence: ${avgAdherence}%
  Steel-manning: ${evals.filter(e => e.steelManning.attempted).length}/${evals.length} responses
  Self-critique: ${evals.filter(e => e.selfCritique.attempted).length}/${evals.length} responses`;
  }).join('\n\n');

  return `${ARBITER_PODCAST_CLOSING_PROMPT}

---

**DEBATE SUMMARY:**

Show: ${context.showName}
Proposition: "${context.proposition}"

Chair Performance:
${chairSummaries}

Transcript (last 2000 chars for context):
${context.transcript.slice(-2000)}

Include Call to Action: ${context.includeCallToAction ? 'Yes' : 'No'}

---

Generate the podcast closing now.`;
}

export function buildInterjectionPrompt(
  violation: 'straw_manning' | 'missing_self_critique' | 'framework_inconsistency' | 'rhetorical_evasion',
  violatingChair: DuelogicChair,
  context: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[violatingChair.framework];

  return `${ARBITER_INTERJECTION_PROMPT}

---

**CURRENT VIOLATION:**

Chair: ${violatingChair.modelDisplayName || violatingChair.modelId}
Framework: ${info.name}
Violation Type: ${violation.replace(/_/g, ' ')}

What they said that triggered this:
"${context}"

---

Generate a brief, firm interjection now.`;
}
```

### File: `backend/src/services/agents/arbiter-agent.ts`

```typescript
import { LLMClient } from '../../llm/openrouter-adapter';
import { SSEManager } from '../../sse/sse-manager';
import {
  DuelogicConfig,
  DuelogicChair,
  ResponseEvaluation,
  PHILOSOPHICAL_CHAIR_INFO
} from '../../types/duelogic';
import {
  buildPodcastIntroPrompt,
  buildPodcastClosingPrompt,
  buildInterjectionPrompt,
  PodcastIntroContext,
  PodcastClosingContext
} from './prompts/arbiter-prompts';

export class ArbiterAgent {
  private llmClient: LLMClient;
  private sseManager: SSEManager;
  private config: DuelogicConfig;
  private debateId: string;

  constructor(
    llmClient: LLMClient,
    sseManager: SSEManager,
    config: DuelogicConfig,
    debateId: string
  ) {
    this.llmClient = llmClient;
    this.sseManager = sseManager;
    this.config = config;
    this.debateId = debateId;
  }

  async generateIntroduction(
    proposition: string,
    propositionContext?: string
  ): Promise<string> {
    const context: PodcastIntroContext = {
      proposition,
      propositionContext,
      chairs: this.config.chairs,
      showName: this.config.podcastMode.showName,
      episodeNumber: this.config.podcastMode.episodeNumber,
    };

    const prompt = buildPodcastIntroPrompt(context);

    const response = await this.llmClient.generateWithStreaming({
      model: this.config.arbiter.modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      maxTokens: 800,
      onToken: (token: string) => {
        this.sseManager.broadcast(this.debateId, {
          type: 'token',
          data: { speaker: 'arbiter', segment: 'introduction', token }
        });
      }
    });

    return response.content;
  }

  async generateClosing(
    proposition: string,
    transcript: string,
    evaluations: Map<string, ResponseEvaluation[]>
  ): Promise<string> {
    const context: PodcastClosingContext = {
      proposition,
      chairs: this.config.chairs,
      transcript,
      evaluations,
      showName: this.config.podcastMode.showName,
      includeCallToAction: this.config.podcastMode.includeCallToAction,
    };

    const prompt = buildPodcastClosingPrompt(context);

    const response = await this.llmClient.generateWithStreaming({
      model: this.config.arbiter.modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 1200,
      onToken: (token: string) => {
        this.sseManager.broadcast(this.debateId, {
          type: 'token',
          data: { speaker: 'arbiter', segment: 'synthesis', token }
        });
      }
    });

    return response.content;
  }

  async generateInterjection(
    violation: 'straw_manning' | 'missing_self_critique' | 'framework_inconsistency' | 'rhetorical_evasion',
    violatingChair: DuelogicChair,
    violatingContent: string
  ): Promise<string> {
    const prompt = buildInterjectionPrompt(violation, violatingChair, violatingContent);

    const response = await this.llmClient.generate({
      model: this.config.arbiter.modelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 150,
    });

    return response.content;
  }

  async evaluateResponse(
    chair: DuelogicChair,
    responseContent: string,
    debateContext: string
  ): Promise<ResponseEvaluation> {
    const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];

    const evaluationPrompt = `You are evaluating a debate response for adherence to Duelogic principles.

**CHAIR BEING EVALUATED:**
${chair.modelDisplayName || chair.modelId} - ${info.name}
Framework: ${info.description}

**THEIR RESPONSE:**
"${responseContent}"

**DEBATE CONTEXT (last 1500 chars):**
${debateContext.slice(-1500)}

**EVALUATE THE FOLLOWING:**

1. **Steel-Manning** (Did they articulate opponent's strongest position before critiquing?)
   - attempted: true/false
   - quality: "strong" | "adequate" | "weak" | "absent"
   - notes: brief explanation

2. **Self-Critique** (Did they acknowledge their framework's blind spots?)
   - attempted: true/false
   - quality: "strong" | "adequate" | "weak" | "absent"
   - notes: brief explanation

3. **Framework Consistency** (Did they stay true to their assigned framework?)
   - consistent: true/false
   - violations: list any departures from their framework

4. **Intellectual Honesty** (Overall honesty and good faith)
   - score: "high" | "medium" | "low"
   - issues: list any concerning patterns

5. **Overall Adherence Score** (0-100)

6. **Requires Interjection?** (Should the arbiter step in?)
   - requiresInterjection: true/false
   - interjectionReason: if true, why?

Respond in JSON format matching the ResponseEvaluation interface.`;

    const response = await this.llmClient.generate({
      model: this.config.arbiter.modelId,
      messages: [{ role: 'user', content: evaluationPrompt }],
      temperature: 0.3,
      maxTokens: 500,
    });

    try {
      return JSON.parse(response.content);
    } catch {
      // Default evaluation if parsing fails
      return {
        adherenceScore: 70,
        steelManning: { attempted: false, quality: 'absent' },
        selfCritique: { attempted: false, quality: 'absent' },
        frameworkConsistency: { consistent: true },
        intellectualHonesty: { score: 'medium' },
        requiresInterjection: false,
      };
    }
  }

  shouldEvaluate(): boolean {
    return this.config.arbiter.accountabilityLevel !== 'relaxed';
  }

  shouldInterjectionOnViolation(evaluation: ResponseEvaluation): boolean {
    if (this.config.arbiter.accountabilityLevel === 'relaxed') {
      return false;
    }

    if (this.config.arbiter.accountabilityLevel === 'strict') {
      return evaluation.requiresInterjection || evaluation.adherenceScore < 60;
    }

    // moderate: only major violations
    return evaluation.requiresInterjection && evaluation.adherenceScore < 40;
  }
}
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration
- DUELOGIC-002: Database Schema (for evaluation storage)
- Existing LLM client infrastructure
- SSE manager for streaming

---

## Validation

```bash
# Unit tests
npm run test -- --grep "ArbiterAgent"

# Integration test with sample debate
npm run test:integration -- --grep "duelogic"
```

---

## Test Cases

```typescript
describe('ArbiterAgent', () => {
  it('generates engaging podcast introduction', async () => {
    const intro = await arbiter.generateIntroduction('Should AI be paused?');
    expect(intro).toContain('Welcome to Duelogic');
    expect(intro).toContain('Claude Sonnet');
    expect(intro.length).toBeGreaterThan(200);
  });

  it('evaluates response for steel-manning', async () => {
    const evaluation = await arbiter.evaluateResponse(
      mockChair,
      'The opponent is wrong because they ignore consequences.',
      'debate context'
    );
    expect(evaluation.steelManning.quality).toBe('absent');
    expect(evaluation.requiresInterjection).toBe(true);
  });

  it('generates firm but fair interjections', async () => {
    const interjection = await arbiter.generateInterjection(
      'straw_manning',
      mockChair,
      'They just want chaos!'
    );
    expect(interjection.length).toBeLessThan(200);
    expect(interjection).toMatch(/hold on|wait|stop/i);
  });
});
```

---

## Definition of Done

- [ ] Arbiter agent generates valid podcast intros
- [ ] Arbiter agent generates synthesizing closings
- [ ] Response evaluation detects steel-manning attempts
- [ ] Response evaluation detects self-critique attempts
- [ ] Interjections are firm but constructive
- [ ] All accountability levels work correctly
- [ ] Streaming output works for real-time display
- [ ] Unit tests pass with >80% coverage

---

## 📝 Implementation Notes from DUELOGIC-001 & DUELOGIC-002

> Added by agent completing Sprint 1 on 2026-01-03

### Types Available

Import from `backend/src/types/duelogic.ts`:

```typescript
import {
  DuelogicConfig,
  DuelogicChair,
  ResponseEvaluation,
  PhilosophicalChair,
  AccountabilityLevel,
  QualityLevel,
  HonestyScore,
  PHILOSOPHICAL_CHAIR_INFO,
  DUELOGIC_DEFAULTS,
} from '../../types/duelogic.js';
```

### Key Types for Arbiter

- `ResponseEvaluation` - Full evaluation structure with steelManning, selfCritique, frameworkConsistency, intellectualHonesty
- `AccountabilityLevel` - 'relaxed' | 'moderate' | 'strict'
- `QualityLevel` - 'strong' | 'adequate' | 'weak' | 'absent'
- `PHILOSOPHICAL_CHAIR_INFO` - Contains name, description, coreQuestion, strengthsToAcknowledge, blindSpotsToAdmit for each framework

### Repository Functions for Saving Evaluations

From `backend/src/db/repositories/duelogic-repository.ts`:

```typescript
import {
  saveResponseEvaluation,
  getEvaluationsForDebate,
  getEvaluationsByChair,
  getChairAverageAdherence,
} from '../../db/repositories/duelogic-repository.js';
```

### Existing Agent Patterns

Check these files for patterns:
- `backend/src/services/agents/moderator-agent.ts` - Similar agent structure
- `backend/src/services/agents/pro-advocate-agent.ts` - Streaming patterns
- `backend/src/services/debate/lively-orchestrator.ts` - SSE broadcasting

### LLM Client Interface

The `LLMClient` from OpenRouter adapter likely supports:
- `generate()` - Non-streaming completion
- `generateWithStreaming()` - Streaming with `onToken` callback

Check `backend/src/llm/openrouter-adapter.ts` for exact interface.

### SSE Event Format

Based on existing patterns, broadcast events like:
```typescript
sseManager.broadcast(debateId, {
  type: 'utterance',
  data: { speaker: 'arbiter', segment: 'introduction', content: '...' }
});
```
