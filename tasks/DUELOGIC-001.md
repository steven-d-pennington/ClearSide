# DUELOGIC-001: Implement Duelogic Debate Mode

**Priority:** P0
**Estimate:** L (17 days)
**Status:** Planning Complete
**Created:** 2026-01-03

---

## Overview

Create a new **Duelogic Debate** mode that combines the best elements of the current debate system with the principles from the Duelogic podcast format. This mode features philosophical "Chairs," mandatory steel-manning, self-critique requirements, and an Arbiter who enforces intellectual honesty.

### Key Features

| Feature | Description |
|---------|-------------|
| **Philosophical Chair System** | 2-6 participants assigned philosophical frameworks (Utilitarian, Virtue Ethics, etc.) |
| **Podcast-Style Arbiter** | Engaging intro/outro, introduces chairs by model name, professional podcast closing |
| **Steel-Manning Mandate** | Must articulate opponent's strongest position before critiquing |
| **Self-Critique Mandate** | Must acknowledge own framework's blind spots |
| **Chair Interruptions** | Chairs can interrupt each other for corrections or pivotal moments |
| **Response Evaluation** | Arbiter evaluates adherence to debate principles |
| **Multi-Model Support** | Each chair can be a different AI model |

### Design Principles (from Duelogic Format)

1. **Chair System:** Each episode features philosophical "Chairs" with models rotating between them
2. **Internal Challenge Mandate:** Each debater must acknowledge the strongest counterargument AND the blind spots of their own assigned framework
3. **Steel-Manning Requirement:** Before dismantling an opponent's position, models must articulate the best version of it
4. **Transparency:** Announce philosophical assignments at the start of each episode
5. **Success Metric:** Listeners should leave uncertain which side "won" and questioning their own priors

---

## Type System

### Core Types

```typescript
// backend/src/types/duelogic.ts

/**
 * Philosophical frameworks that can be assigned as "Chairs"
 */
export type PhilosophicalChair =
  | 'utilitarian'        // Maximize aggregate welfare
  | 'virtue_ethics'      // Character and human flourishing
  | 'deontological'      // Duty-based, rule-following
  | 'pragmatic'          // Practical consequences, what works
  | 'libertarian'        // Individual liberty, minimal intervention
  | 'communitarian'      // Community bonds, social obligations
  | 'cosmopolitan'       // Universal human rights, global perspective
  | 'precautionary'      // Caution, risk-aversion
  | 'autonomy_centered'  // Self-determination, agency
  | 'care_ethics';       // Relationships, vulnerability, care

/**
 * A Chair participant in a Duelogic debate
 */
export interface DuelogicChair {
  /** Unique position identifier */
  position: string; // 'chair_1', 'chair_2', etc.

  /** Assigned philosophical framework */
  framework: PhilosophicalChair;

  /** LLM model ID */
  modelId: string;

  /** Display name for the model (e.g., "Grok 4.1 Flash") */
  modelDisplayName?: string;

  /** Provider name (e.g., "xAI", "Anthropic", "OpenAI") */
  providerName?: string;

  /** Optional custom persona overlay */
  persona?: string;
}

/**
 * Accountability level for arbiter
 */
export type AccountabilityLevel =
  | 'relaxed'    // Only synthesizes at end
  | 'moderate'   // Interjects on major violations
  | 'strict';    // Evaluates every response, calls out all violations

/**
 * Full Duelogic configuration - supports 2-6 chairs
 */
export interface DuelogicConfig {
  mode: 'duelogic';

  /** 2-6 chairs participating in the debate */
  chairs: DuelogicChair[];

  /** Arbiter configuration */
  arbiter: {
    modelId: string;
    modelDisplayName?: string;
    accountabilityLevel: AccountabilityLevel;
  };

  /** Flow and pacing */
  flow: {
    style: 'structured' | 'conversational';
    maxExchanges: number;
    targetDurationMinutes: number;
  };

  /** Interruption settings */
  interruptions: {
    enabled: boolean;
    /** Who can interrupt */
    allowChairInterruptions: boolean;
    allowArbiterInterruptions: boolean;
    /** 1=polite, 5=aggressive */
    aggressiveness: 1 | 2 | 3 | 4 | 5;
    /** Cooldown between interrupts per chair (seconds) */
    cooldownSeconds: number;
  };

  /** Tone settings */
  tone: 'respectful' | 'spirited' | 'heated';

  /** Podcast production mode */
  podcastMode: {
    enabled: boolean;
    showName: string;  // "Duelogic" by default
    episodeNumber?: number;
    includeCallToAction: boolean;
  };

  /** Accountability mandates */
  mandates: {
    requireSteelManning: boolean;
    requireSelfCritique: boolean;
    arbiterCanInterject: boolean;
  };
}

/**
 * Constraints
 */
export const DUELOGIC_CONSTRAINTS = {
  minChairs: 2,
  maxChairs: 6,
  minExchanges: 3,
  maxExchanges: 30,
} as const;
```

### Response Evaluation Types

```typescript
/**
 * Evaluation of a chair's response for adherence to principles
 */
export interface ResponseEvaluation {
  /** Overall adherence score (0-100) */
  adherenceScore: number;

  /** Did they steel-man before critiquing? */
  steelManning: {
    attempted: boolean;
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    notes?: string;
  };

  /** Did they acknowledge their framework's weaknesses? */
  selfCritique: {
    attempted: boolean;
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    notes?: string;
  };

  /** Were they consistent with their assigned framework? */
  frameworkConsistency: {
    consistent: boolean;
    violations?: string[];
  };

  /** Any intellectual honesty issues? */
  intellectualHonesty: {
    score: 'high' | 'medium' | 'low';
    issues?: string[];
  };

  /** Should the arbiter interject? */
  requiresInterjection: boolean;
  interjectionReason?: string;
}
```

### Chair Interruption Types

```typescript
/**
 * Candidate for a chair interruption
 */
export interface ChairInterruptCandidate {
  /** The chair that wants to interrupt */
  interruptingChair: DuelogicChair;

  /** The chair being interrupted */
  interruptedChair: DuelogicChair;

  /** Why they want to interrupt */
  triggerReason: ChairInterruptReason;

  /** What triggered it (phrase or concept) */
  triggerContent: string;

  /** Urgency score 0-1 */
  urgency: number;

  /** Suggested interjection opener */
  suggestedOpener?: string;
}

export type ChairInterruptReason =
  | 'factual_correction'     // "That's not actually what utilitarianism claims..."
  | 'straw_man_detected'     // "Hold on, you're misrepresenting my position..."
  | 'direct_challenge'       // "I have to push back on that..."
  | 'clarification_needed'   // "Wait, can you clarify what you mean by..."
  | 'strong_agreement'       // "Yes! And let me build on that..."
  | 'pivotal_point';         // "This is exactly the crux of our disagreement..."
```

---

## Philosophical Chair Definitions

```typescript
export const PHILOSOPHICAL_CHAIR_INFO: Record<PhilosophicalChair, {
  name: string;
  description: string;
  coreQuestion: string;
  strengthsToAcknowledge: string[];
  blindSpotsToAdmit: string[];
}> = {
  utilitarian: {
    name: 'Utilitarian Chair',
    description: 'Argues from maximizing aggregate welfare and outcomes',
    coreQuestion: 'What produces the greatest good for the greatest number?',
    strengthsToAcknowledge: [
      'Forces calculation of real-world consequences',
      'Egalitarian - each person counts equally',
      'Provides measurable decision framework'
    ],
    blindSpotsToAdmit: [
      'Can justify sacrificing minorities for majority benefit',
      'Difficult to measure and compare utilities',
      'May ignore rights and justice concerns'
    ]
  },
  virtue_ethics: {
    name: 'Virtue Ethics Chair',
    description: 'Argues from character, wisdom, and human flourishing',
    coreQuestion: 'What would a person of good character do?',
    strengthsToAcknowledge: [
      'Centers human development and excellence',
      'Recognizes moral complexity requiring judgment',
      'Integrates emotion and reason'
    ],
    blindSpotsToAdmit: [
      'Virtues can be culturally relative',
      'Offers less guidance for novel dilemmas',
      'May prioritize individual flourishing over collective welfare'
    ]
  },
  deontological: {
    name: 'Deontological Chair',
    description: 'Argues from duty, rules, and moral obligations',
    coreQuestion: 'What does moral duty require, regardless of consequences?',
    strengthsToAcknowledge: [
      'Provides clear moral boundaries',
      'Protects individual rights absolutely',
      'Offers consistency and predictability'
    ],
    blindSpotsToAdmit: [
      'Can be inflexible in complex situations',
      'May lead to worse outcomes by ignoring consequences',
      'Rules can conflict with each other'
    ]
  },
  pragmatic: {
    name: 'Pragmatic Chair',
    description: 'Argues from what works in practice and real-world feasibility',
    coreQuestion: 'What approach will actually work in the real world?',
    strengthsToAcknowledge: [
      'Grounded in practical reality',
      'Flexible and adaptive to circumstances',
      'Focuses on achievable outcomes'
    ],
    blindSpotsToAdmit: [
      'May sacrifice principle for expediency',
      'Short-term thinking can miss long-term consequences',
      '"What works" can be defined by those in power'
    ]
  },
  libertarian: {
    name: 'Libertarian Chair',
    description: 'Argues from individual liberty and minimal coercion',
    coreQuestion: 'Does this respect individual freedom and consent?',
    strengthsToAcknowledge: [
      'Protects individual autonomy',
      'Skeptical of concentrated power',
      'Values voluntary cooperation'
    ],
    blindSpotsToAdmit: [
      'May ignore structural inequalities',
      'Underweights positive obligations to help others',
      'Assumes level playing field that may not exist'
    ]
  },
  communitarian: {
    name: 'Communitarian Chair',
    description: 'Argues from community bonds, social obligations, and shared values',
    coreQuestion: 'What do we owe to our communities and what do they owe us?',
    strengthsToAcknowledge: [
      'Recognizes humans as social beings',
      'Values tradition and social cohesion',
      'Emphasizes mutual obligations'
    ],
    blindSpotsToAdmit: [
      'Can suppress individual dissent',
      'May privilege in-group over outsiders',
      'Traditions can encode past injustices'
    ]
  },
  cosmopolitan: {
    name: 'Cosmopolitan Chair',
    description: 'Argues from universal human rights and global perspective',
    coreQuestion: 'What do we owe to all humans, regardless of nationality?',
    strengthsToAcknowledge: [
      'Recognizes universal human dignity',
      'Challenges arbitrary borders and boundaries',
      'Promotes global cooperation'
    ],
    blindSpotsToAdmit: [
      'May be culturally imperialistic',
      'Underweights local knowledge and context',
      'Can seem abstract and detached from lived reality'
    ]
  },
  precautionary: {
    name: 'Precautionary Chair',
    description: 'Argues from caution, risk-aversion, and avoiding irreversible harm',
    coreQuestion: 'What are the risks of getting this wrong, and can we afford them?',
    strengthsToAcknowledge: [
      'Takes catastrophic risks seriously',
      'Protects against irreversible harm',
      'Acknowledges uncertainty honestly'
    ],
    blindSpotsToAdmit: [
      'Can paralyze decision-making',
      'May ignore the risks of inaction',
      'Can be used to block any change'
    ]
  },
  autonomy_centered: {
    name: 'Autonomy-Centered Chair',
    description: 'Argues from self-determination and personal agency',
    coreQuestion: 'Does this respect people\'s right to make their own choices?',
    strengthsToAcknowledge: [
      'Respects individual self-determination',
      'Protects against paternalism',
      'Values informed consent'
    ],
    blindSpotsToAdmit: [
      'May ignore how choices are shaped by circumstances',
      'Underweights relational aspects of selfhood',
      'Assumes capacity for autonomous choice exists'
    ]
  },
  care_ethics: {
    name: 'Care Ethics Chair',
    description: 'Argues from relationships, vulnerability, and caring obligations',
    coreQuestion: 'How do we best care for those who depend on us?',
    strengthsToAcknowledge: [
      'Centers human relationships and connection',
      'Attends to vulnerability and dependency',
      'Values emotional responsiveness'
    ],
    blindSpotsToAdmit: [
      'May privilege close relationships over strangers',
      'Can reinforce gendered care expectations',
      'Less guidance for impersonal policy decisions'
    ]
  },
};
```

---

## Arbiter Prompts

### Podcast Introduction Prompt

```typescript
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

   - "And joining as our wild card, GPT-4o from OpenAI holds the Pragmatic
     chair—cutting through abstract philosophy to ask: what actually works?"

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
```

### Podcast Closing Prompt

```typescript
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
```

### Arbiter Interjection Prompt

```typescript
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
```

---

## Chair Prompts

### Chair System Prompt Template

```typescript
export function buildChairSystemPrompt(
  chair: DuelogicChair,
  opponentChairs: DuelogicChair[],
  tone: 'respectful' | 'spirited' | 'heated'
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
  const opponentDescriptions = opponentChairs.map(opp => {
    const oppInfo = PHILOSOPHICAL_CHAIR_INFO[opp.framework];
    return `- ${opp.modelDisplayName} (${oppInfo.name}): ${oppInfo.description}`;
  }).join('\n');

  const toneInstructions = {
    respectful: 'Maintain professional, collegial discourse. Disagree with ideas, not people.',
    spirited: 'Engage with passion and conviction. Be direct and pointed in your critiques.',
    heated: 'Argue forcefully. Challenge aggressively. Make your disagreements memorable.',
  };

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

**TONE:** ${toneInstructions[tone]}

**FORMAT:** This is for a podcast audience. Be engaging, substantive, but natural.
- Aim for 150-300 words per response
- No formal headers or bullet lists unless they genuinely help
- Speak as if you're in a conversation, not writing an essay
- It's okay to express uncertainty or acknowledge good points from opponents

**REMEMBER:** The goal is not to "win" but to illuminate the question from your
framework's perspective. The best debates clarify disagreements; they don't
paper over them.`;
}
```

---

## Chair Interruption System

### Interrupt Evaluation

```typescript
export async function evaluateChairInterrupt(
  context: {
    currentSpeaker: DuelogicChair;
    otherChairs: DuelogicChair[];
    recentContent: string;
    debateSoFar: string;
    topic: string;
  },
  llmClient: LLMClient,
  aggressiveness: number
): Promise<ChairInterruptCandidate | null> {
  const urgencyThreshold = {
    1: 0.9,  // Very polite - only interrupt for major issues
    2: 0.8,
    3: 0.7,  // Moderate
    4: 0.6,
    5: 0.5,  // Aggressive - interrupt frequently
  }[aggressiveness] || 0.7;

  const prompt = `You are evaluating whether any chair should interrupt the current speaker.

Current speaker: ${context.currentSpeaker.modelDisplayName} (${PHILOSOPHICAL_CHAIR_INFO[context.currentSpeaker.framework].name})

What they just said:
"${context.recentContent}"

Other chairs who could interrupt:
${context.otherChairs.map(c => `- ${c.modelDisplayName} (${PHILOSOPHICAL_CHAIR_INFO[c.framework].name})`).join('\n')}

Should any chair interrupt? Valid reasons:
- factual_correction: Speaker made an error about philosophical frameworks
- straw_man_detected: Speaker is attacking a weakened version of a position
- direct_challenge: A point demands immediate pushback
- clarification_needed: Something crucial is unclear
- strong_agreement: A point is so good it deserves amplification
- pivotal_point: This is the core disagreement being crystallized

Respond in JSON:
{
  "shouldInterrupt": boolean,
  "interruptingChairPosition": "chair_1" | "chair_2" | etc or null,
  "reason": "factual_correction" | "straw_man_detected" | etc,
  "triggerContent": "the specific phrase or claim that triggered this",
  "urgency": 0.0-1.0,
  "suggestedOpener": "How the interruption should start (2-8 words)"
}

Only recommend interrupting for genuinely significant moments.`;

  const response = await llmClient.complete({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 200,
  });

  const parsed = JSON.parse(response.content);

  if (!parsed.shouldInterrupt || parsed.urgency < urgencyThreshold) {
    return null;
  }

  const interruptingChair = context.otherChairs.find(
    c => c.position === parsed.interruptingChairPosition
  );

  if (!interruptingChair) return null;

  return {
    interruptingChair,
    interruptedChair: context.currentSpeaker,
    triggerReason: parsed.reason,
    triggerContent: parsed.triggerContent,
    urgency: parsed.urgency,
    suggestedOpener: parsed.suggestedOpener,
  };
}
```

### Interrupt Opener Templates

```typescript
export const INTERRUPT_OPENERS: Record<ChairInterruptReason, string[]> = {
  factual_correction: [
    "Actually, that's a mischaracterization—",
    "I need to correct something there—",
    "That's not quite what my framework holds—",
    "Wait, that's not accurate—",
  ],
  straw_man_detected: [
    "Hold on, you're attacking a position I never took—",
    "Wait, that's not the strongest version of my argument—",
    "Let me stop you there—I wouldn't actually claim that—",
    "You're not engaging with my actual position—",
  ],
  direct_challenge: [
    "I have to push back on that—",
    "That's exactly where we disagree—",
    "I can't let that go unchallenged—",
    "No, and here's why—",
  ],
  clarification_needed: [
    "Can you clarify what you mean by—",
    "I'm not sure I follow—are you saying—",
    "Wait, help me understand—",
    "What exactly do you mean when you say—",
  ],
  strong_agreement: [
    "Yes, and this is crucial—",
    "Exactly right, and let me build on that—",
    "This is the key insight—",
    "You've hit on something important—",
  ],
  pivotal_point: [
    "And this is exactly our core disagreement—",
    "This is where the real tension lies—",
    "Let's not gloss over this—this is the crux—",
    "Here's where our frameworks truly clash—",
  ],
};
```

---

## Orchestrator Flow

### Segment Structure

```typescript
export type DuelogicSegment =
  | 'introduction'    // Arbiter introduces topic and Chair assignments
  | 'opening'         // Each Chair presents initial position (no interrupts)
  | 'exchange'        // Back-and-forth discussion (with interrupts if enabled)
  | 'synthesis';      // Arbiter synthesizes and closes

export class DuelogicOrchestrator {
  async start(): Promise<void> {
    // SEGMENT 1: Podcast Introduction
    await this.executeIntroduction();

    // SEGMENT 2: Opening Statements (each chair, no interrupts)
    await this.executeOpenings();

    // SEGMENT 3: Main Exchange (with interruptions if enabled)
    await this.executeExchange();

    // SEGMENT 4: Podcast Closing
    await this.executeSynthesis();
  }

  private async executeIntroduction(): Promise<void> {
    const prompt = buildArbiterPodcastIntroPrompt({
      proposition: this.proposition,
      propositionContext: this.propositionContext,
      chairs: this.config.chairs,
      showName: this.config.podcastMode.showName,
      episodeNumber: this.config.podcastMode.episodeNumber,
    });

    const intro = await this.arbiter.generate(prompt);
    await this.saveAndBroadcast('arbiter', intro, 'introduction');
  }

  private async executeOpenings(): Promise<void> {
    for (const chair of this.config.chairs) {
      const opening = await this.chairs.get(chair.position)!.generateOpening();
      await this.saveAndBroadcast(chair.position, opening, 'opening');
    }
  }

  private async executeExchange(): Promise<void> {
    let exchangeCount = 0;

    while (exchangeCount < this.config.flow.maxExchanges && this.isRunning) {
      for (const chair of this.config.chairs) {
        if (!this.isRunning) break;

        const { content, wasInterrupted, interruptedBy } =
          await this.generateWithInterruptEvaluation(chair);

        // Evaluate adherence
        const evaluation = await this.evaluator.evaluate(content, chair);

        // Save utterance
        await this.saveUtterance(chair, content, evaluation, { wasInterrupted });

        // Handle interrupt if one occurred
        if (wasInterrupted && interruptedBy) {
          await this.executeInterruption(interruptedBy, chair);
        }

        // Arbiter interjection on major violations
        if (this.config.mandates.arbiterCanInterject && evaluation.requiresInterjection) {
          await this.executeArbiterInterjection(evaluation, chair);
        }
      }

      exchangeCount++;
    }
  }

  private async executeSynthesis(): Promise<void> {
    const prompt = buildArbiterPodcastClosingPrompt({
      proposition: this.proposition,
      chairs: this.config.chairs,
      transcript: this.transcript,
      evaluations: this.evaluations,
      showName: this.config.podcastMode.showName,
      includeCallToAction: this.config.podcastMode.includeCallToAction,
    });

    const closing = await this.arbiter.generate(prompt);
    await this.saveAndBroadcast('arbiter', closing, 'synthesis');
  }
}
```

---

## Configuration Defaults & Presets

### Defaults

```typescript
export const DUELOGIC_DEFAULTS: DuelogicConfig = {
  mode: 'duelogic',
  chairs: [
    {
      position: 'chair_1',
      framework: 'utilitarian',
      modelId: 'anthropic/claude-sonnet-4',
      modelDisplayName: 'Claude Sonnet 4',
      providerName: 'Anthropic',
    },
    {
      position: 'chair_2',
      framework: 'virtue_ethics',
      modelId: 'x-ai/grok-3',
      modelDisplayName: 'Grok 3',
      providerName: 'xAI',
    },
  ],
  arbiter: {
    modelId: 'openai/gpt-4o',
    modelDisplayName: 'GPT-4o',
    accountabilityLevel: 'moderate',
  },
  flow: {
    style: 'conversational',
    maxExchanges: 8,
    targetDurationMinutes: 45,
  },
  interruptions: {
    enabled: true,
    allowChairInterruptions: true,
    allowArbiterInterruptions: true,
    aggressiveness: 3,
    cooldownSeconds: 60,
  },
  tone: 'spirited',
  podcastMode: {
    enabled: true,
    showName: 'Duelogic',
    includeCallToAction: true,
  },
  mandates: {
    requireSteelManning: true,
    requireSelfCritique: true,
    arbiterCanInterject: true,
  },
};
```

### Preset Matchups

```typescript
export const DUELOGIC_PRESETS = {
  classic_clash: {
    name: 'Classic Clash',
    description: 'Utilitarian vs Virtue Ethics — the foundational philosophical battle',
    chairs: [
      { framework: 'utilitarian' as const },
      { framework: 'virtue_ethics' as const },
    ],
  },

  liberty_vs_community: {
    name: 'Liberty vs Community',
    description: 'Individual rights against collective obligations',
    chairs: [
      { framework: 'libertarian' as const },
      { framework: 'communitarian' as const },
    ],
  },

  three_way_ethics: {
    name: 'Three-Way Ethics Showdown',
    description: 'Consequences vs Character vs Duty',
    chairs: [
      { framework: 'utilitarian' as const },
      { framework: 'virtue_ethics' as const },
      { framework: 'deontological' as const },
    ],
  },

  global_vs_local: {
    name: 'Global vs Local',
    description: 'Universal human rights vs bounded community obligations',
    chairs: [
      { framework: 'cosmopolitan' as const },
      { framework: 'communitarian' as const },
    ],
  },

  caution_vs_progress: {
    name: 'Caution vs Progress',
    description: 'Risk-averse precaution vs bold pragmatism',
    chairs: [
      { framework: 'precautionary' as const },
      { framework: 'pragmatic' as const },
    ],
  },

  battle_royale: {
    name: 'Battle Royale (4-way)',
    description: 'Four frameworks clash: Utilitarian, Virtue, Libertarian, Pragmatic',
    chairs: [
      { framework: 'utilitarian' as const },
      { framework: 'virtue_ethics' as const },
      { framework: 'libertarian' as const },
      { framework: 'pragmatic' as const },
    ],
  },
};
```

---

## Database Schema

```sql
-- backend/src/db/migrations/010_add_duelogic_mode.sql

-- Add duelogic mode to debates
ALTER TABLE debates ADD COLUMN IF NOT EXISTS debate_mode TEXT
  CHECK (debate_mode IN ('formal', 'lively', 'informal', 'duelogic'));

ALTER TABLE debates ADD COLUMN IF NOT EXISTS duelogic_config JSONB;

-- Chair assignments tracking
CREATE TABLE IF NOT EXISTS debate_chairs (
  id SERIAL PRIMARY KEY,
  debate_id TEXT REFERENCES debates(id) ON DELETE CASCADE,
  chair_position TEXT NOT NULL,
  framework TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_display_name TEXT,
  provider_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(debate_id, chair_position)
);

-- Response evaluations for accountability tracking
CREATE TABLE IF NOT EXISTS response_evaluations (
  id SERIAL PRIMARY KEY,
  utterance_id INTEGER REFERENCES utterances(id) ON DELETE CASCADE,
  adherence_score INTEGER CHECK (adherence_score BETWEEN 0 AND 100),
  steel_manning_attempted BOOLEAN,
  steel_manning_quality TEXT,
  self_critique_attempted BOOLEAN,
  self_critique_quality TEXT,
  framework_consistent BOOLEAN,
  evaluation_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chair interruptions log
CREATE TABLE IF NOT EXISTS chair_interruptions (
  id SERIAL PRIMARY KEY,
  debate_id TEXT REFERENCES debates(id) ON DELETE CASCADE,
  interrupting_chair TEXT NOT NULL,
  interrupted_chair TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  trigger_content TEXT,
  urgency DECIMAL(3,2),
  timestamp_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_debate_chairs_debate ON debate_chairs(debate_id);
CREATE INDEX idx_response_evaluations_utterance ON response_evaluations(utterance_id);
CREATE INDEX idx_chair_interruptions_debate ON chair_interruptions(debate_id);
```

---

## API Endpoints

```typescript
// POST /api/debates/duelogic
// Create a new Duelogic debate
interface CreateDuelogicDebateRequest {
  proposition: string;
  propositionContext?: PropositionContext;
  config: Partial<DuelogicConfig>;
}

// GET /api/duelogic/chairs
// List available philosophical chairs with descriptions
// Returns: PhilosophicalChairInfo[]

// GET /api/duelogic/presets
// List preset chair matchups
// Returns: DuelogicPreset[]

// GET /api/duelogic/models
// List available models with display names and providers
// Returns: ModelInfo[]

// POST /api/debates/:id/arbiter/interject
// Manually trigger arbiter interjection (for testing/moderation)
interface ManualInterjectionRequest {
  reason: string;
  targetChair?: string;
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/types/duelogic.ts` | CREATE | Core types for Duelogic mode |
| `backend/src/services/agents/arbiter-agent.ts` | CREATE | Arbiter agent implementation |
| `backend/src/services/agents/chair-agent.ts` | CREATE | Chair agent implementation |
| `backend/src/services/agents/prompts/arbiter-prompts.ts` | CREATE | Podcast intro/outro prompts |
| `backend/src/services/agents/prompts/chair-prompts.ts` | CREATE | Framework-aware chair prompts |
| `backend/src/services/debate/duelogic-orchestrator.ts` | CREATE | Main orchestrator |
| `backend/src/services/debate/chair-interruption-engine.ts` | CREATE | Chair interrupt logic |
| `backend/src/services/debate/response-evaluator.ts` | CREATE | Adherence evaluation |
| `backend/src/db/migrations/010_add_duelogic_mode.sql` | CREATE | Database schema |
| `backend/src/db/repositories/duelogic-repository.ts` | CREATE | Data access |
| `backend/src/routes/duelogic-routes.ts` | CREATE | API endpoints |
| `frontend/src/components/DuelogicConfig/` | CREATE | Configuration UI |
| `frontend/src/components/DuelogicDebate/` | CREATE | Debate view components |

---

## Example Arbiter Introduction

For a debate on "Should AI development be paused?" with Claude Sonnet 4 (Utilitarian) vs Grok 3 (Virtue Ethics):

> *"Can humanity build gods faster than it can learn wisdom? That's the question lurking beneath today's debate.*
>
> *Welcome to Duelogic—where AI models argue humanity's hardest questions, and nobody leaves with easy answers.*
>
> *In our first chair today, please welcome Claude Sonnet 4 from Anthropic, championing the Utilitarian position. Claude will be asking: what action produces the greatest good for the greatest number? When millions of lives hang in the balance, can we afford anything less than rigorous calculation?*
>
> *Facing off from the second chair, we have Grok 3 from xAI, taking up the Virtue Ethics mantle. Grok will argue that wisdom isn't a spreadsheet—that true judgment comes from cultivating character, practical wisdom, and the kind of moral imagination no formula can capture.*
>
> *Today's proposition: "Major AI labs should voluntarily pause development of frontier models for two years to allow governance to catch up."*
>
> *The rules of Duelogic: Each chair must steel-man their opponent before attacking them. Each must acknowledge their own framework's blind spots. And I'll be here to keep everyone honest.*
>
> *The stakes are real. The disagreements are genuine. Let's see where this goes.*
>
> *Claude, the floor is yours."*

---

## Example Arbiter Closing

> *"And that brings us to the close of today's debate.*
>
> *What did we learn? Claude, from the Utilitarian chair, showed us the power of consequentialist thinking—when we're talking about existential risk, the sheer scale of potential harm demands we take the mathematics of suffering seriously. The strongest moment came when Claude acknowledged that utilitarian calculations can be gamed, but argued that's a reason to calculate better, not to abandon calculation.*
>
> *Grok, from the Virtue Ethics chair, reminded us that wisdom can't be reduced to spreadsheets. The most compelling point was that pausing AI development isn't just about risk mitigation—it's about what kind of civilization we want to become. Do we want to be the species that built the gods, or the species that became wise enough to deserve them?*
>
> *The key clash? It comes down to this: Can moral judgment be systematized, or does true wisdom require the kind of practical judgment that only comes from experience and character? Claude says systematize everything. Grok says some things can't be systematized without losing what matters most.*
>
> *Both chairs largely met their obligations today. Claude's steel-manning of virtue ethics was genuine—acknowledging that rule-following can become hollow. Grok acknowledged that virtue ethics can be vague when we need concrete guidance. That's what Duelogic demands.*
>
> *The question that remains: What kind of reasoning do we trust with the highest stakes? That's not a question I can answer for you.*
>
> *Thank you to Claude Sonnet 4 for bringing analytical rigor and genuine moral seriousness. Thank you to Grok 3 for reminding us that some questions are too important for formulas. And thank you to everyone listening for your time and your willingness to think hard about hard questions.*
>
> *If this episode made you think, subscribe. Share it with someone who loves a good argument. And leave us a review—it helps more people find Duelogic.*
>
> *Until next time, keep questioning, keep debating, and never settle for easy answers.*
>
> *This has been Duelogic."*

---

## Implementation Order

| Phase | Days | Description |
|-------|------|-------------|
| 1. Types & Configuration | 1 | `duelogic.ts`, extend `configuration.ts` |
| 2. Database Schema | 0.5 | Migration for duelogic mode |
| 3. Arbiter Agent + Prompts | 2 | Podcast intro/outro, interjections |
| 4. Chair Agent + Prompts | 1.5 | Framework-aware prompts |
| 5. Response Evaluator | 2 | Steel-man/self-critique detection |
| 6. Chair Interruption Engine | 2 | Multi-chair interrupt logic |
| 7. Duelogic Orchestrator | 3 | Full orchestration flow |
| 8. API Routes | 1 | Endpoints and validation |
| 9. Frontend Config UI | 2-3 | Chair selector, config panel |
| 10. Testing & Tuning | 2 | Sample debates, prompt tuning |
| **Total** | **~17 days** | |

---

## Success Metrics

Following the Duelogic format principles:

- **Listeners should leave uncertain which side "won"**
- **Listeners should be questioning their own priors**
- Steel-manning attempts in >80% of critique responses
- Self-critique present in >70% of substantive responses
- Framework consistency maintained throughout
- Interruptions feel natural and enhance (not derail) the debate

---

## Dependencies

- Existing LLM client infrastructure (`openrouter-adapter.ts`)
- SSE broadcasting system (`sse-manager.ts`)
- Utterance/transcript persistence
- Lively orchestrator patterns (for interruption handling)

---

## Notes

- The Arbiter is NOT neutral about quality—it actively evaluates intellectual honesty
- Chairs can (and should) disagree sharply while meeting their obligations
- Podcast mode is the primary use case; non-podcast mode is a simplified variant
- Multi-chair support (3-6) creates richer debates but increases complexity
- Interruption aggressiveness should be tuned based on user feedback

---

*Created: 2026-01-03*
*Status: Planning Complete - Ready for Implementation*
