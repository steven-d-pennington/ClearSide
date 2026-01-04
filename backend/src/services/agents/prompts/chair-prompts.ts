/**
 * Chair Agent Prompts for Duelogic Debate Mode
 *
 * Chair agents represent philosophical positions in Duelogic debates.
 * Each chair is assigned a framework and must argue from that perspective
 * while meeting steel-manning and self-critique obligations.
 */

import {
  type DuelogicChair,
  type PhilosophicalChair,
  type DebateTone,
  PHILOSOPHICAL_CHAIR_INFO,
} from '../../../types/duelogic.js';

// ============================================================================
// TONE INSTRUCTIONS
// ============================================================================

export const TONE_INSTRUCTIONS: Record<DebateTone, string> = {
  respectful: 'Maintain professional, collegial discourse. Disagree with ideas, not people.',
  spirited: 'Engage with passion and conviction. Be direct and pointed in your critiques.',
  heated: 'Argue forcefully. Challenge aggressively. Make your disagreements memorable.',
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

/**
 * Build the system prompt for a chair agent
 */
export function buildChairSystemPrompt(
  chair: DuelogicChair,
  opponentChairs: DuelogicChair[],
  tone: DebateTone
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
   Before critiquing any opponent's position, articulate the strongest version
   of their argument. Show you understand it deeply before engaging.

2. **ACKNOWLEDGE YOUR WEAKNESSES**
   In each substantive response, acknowledge at least one limitation or blind
   spot of your framework. This shows intellectual honesty.

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
- Speak as if you're in a REAL conversation, not writing an essay
- VARY your language naturally—never use the same phrases repeatedly
- Avoid templated openings like "I appreciate the force of..." or "What they're really saying is..."
- It's okay to express uncertainty or acknowledge good points from opponents

**REMEMBER:** The goal is not to "win" but to illuminate the question from your
framework's perspective. The best debates clarify disagreements; they don't
paper over them.`;
}

// ============================================================================
// OPENING STATEMENT PROMPT
// ============================================================================

/**
 * Build prompt for opening statement
 */
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

// ============================================================================
// EXCHANGE RESPONSE PROMPT
// ============================================================================

/**
 * Build prompt for responding to another chair's argument
 */
export function buildExchangeResponsePrompt(
  chair: DuelogicChair,
  previousSpeaker: DuelogicChair,
  previousContent: string,
  debateContext: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
  const prevInfo = PHILOSOPHICAL_CHAIR_INFO[previousSpeaker.framework];
  const prevName = previousSpeaker.modelDisplayName || previousSpeaker.modelId;

  return `You are responding from the ${info.name} perspective.

**WHAT ${prevName} (${prevInfo.name}) JUST SAID:**
"${previousContent}"

**DEBATE SO FAR (last 1500 chars):**
${debateContext.slice(-1500)}

**YOUR TASK:**
Respond to what was just said. Engage directly with their argument.

**MANDATORY ELEMENTS:**

1. **STEEL-MAN FIRST** (2-3 sentences)
   Begin by articulating the strongest version of what they said. Show you genuinely
   understand their position before critiquing it.

2. **YOUR RESPONSE** (main body)
   Now engage with their strongest argument from your ${info.name} perspective.
   Don't attack a weakened version.

3. **SELF-CRITIQUE** (1-2 sentences)
   Acknowledge where your own framework struggles with this point.

**CRITICAL - NATURAL LANGUAGE:**
- Use VARIED phrasing each response. Never repeat the same sentence structures.
- DON'T use templated phrases like "I appreciate the force of..." or "what they're really saying is..."
- Speak naturally as if in a real conversation—professors don't repeat identical phrases.
- Find fresh ways to acknowledge points, push back, and admit limitations.

**LENGTH:** 150-300 words

Respond now.`;
}

// ============================================================================
// DIRECT CHALLENGE PROMPT
// ============================================================================

/**
 * Build prompt for responding to a direct challenge
 */
export function buildDirectChallengePrompt(
  chair: DuelogicChair,
  challenger: DuelogicChair,
  challengeContent: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
  const challInfo = PHILOSOPHICAL_CHAIR_INFO[challenger.framework];
  const challName = challenger.modelDisplayName || challenger.modelId;

  return `You've been directly challenged by ${challName} (${challInfo.name}).

**THE CHALLENGE:**
"${challengeContent}"

**YOUR TASK:**
Defend your position while maintaining intellectual honesty.

**REQUIREMENTS:**
1. Address the challenge directly—don't evade
2. Explain how your ${info.name} framework handles this objection
3. If it's a genuine weakness, admit it and explain how you weigh it against your framework's strengths
4. NEVER ask for clarification about whether messages are complete
5. NEVER comment on message formatting or whether you can see the full message
6. Assume you have received the complete challenge and respond to the substance

**LENGTH:** 120-250 words

Respond to the challenge now.`;
}

// ============================================================================
// INTERRUPTION RESPONSE PROMPT
// ============================================================================

/**
 * Build prompt for responding to an interruption
 */
export function buildInterruptionResponsePrompt(
  _chair: DuelogicChair,
  interrupter: DuelogicChair,
  interruptionContent: string
): string {
  const interrupterName = interrupter.modelDisplayName || interrupter.modelId;

  return `You've been interrupted by ${interrupterName}.

**WHAT THEY SAID:**
"${interruptionContent}"

**YOUR TASK:**
Respond briefly to the interruption before continuing your point.

**GUIDELINES:**
- Address what they said directly—focus on the SUBSTANCE of their point
- Don't get defensive—engage with the substance
- You can concede a point if it's valid
- Then return to your argument if you weren't finished
- NEVER ask for clarification about whether messages are complete
- NEVER comment on message formatting or whether you can see the full message
- Assume you have received the complete interruption and respond to it

**LENGTH:** 80-180 words

Respond to the interruption now.`;
}

// ============================================================================
// CLARIFICATION REQUEST PROMPT
// ============================================================================

/**
 * Build prompt for requesting clarification from another chair
 */
export function buildClarificationRequestPrompt(
  _chair: DuelogicChair,
  targetChair: DuelogicChair,
  unclearContent: string
): string {
  const targetInfo = PHILOSOPHICAL_CHAIR_INFO[targetChair.framework];
  const targetName = targetChair.modelDisplayName || targetChair.modelId;

  return `You need clarification from ${targetName} (${targetInfo.name}).

**WHAT THEY SAID THAT'S UNCLEAR:**
"${unclearContent}"

**YOUR TASK:**
Ask a focused clarifying question that will help you understand their position
better—and help the audience understand too.

**GUIDELINES:**
- Be specific about what's unclear
- Frame it as genuine curiosity, not a trap
- This is a podcast—make it interesting

**LENGTH:** 30-60 words

Ask your clarifying question now.`;
}

// ============================================================================
// SYNTHESIS CONTRIBUTION PROMPT
// ============================================================================

/**
 * Build prompt for contributing to debate synthesis
 */
export function buildSynthesisContributionPrompt(
  chair: DuelogicChair,
  debateContext: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];

  return `We're wrapping up the debate. Provide your final thoughts from the ${info.name} perspective.

**DEBATE SO FAR (last 2000 chars):**
${debateContext.slice(-2000)}

**YOUR TASK:**
Offer a brief synthesis of what this debate has revealed from your perspective.

**REQUIREMENTS:**
1. Acknowledge the strongest points your opponents made
2. Summarize what ${info.name} brings to this question
3. Identify what remains genuinely uncertain or contested
4. Be humble—you don't have to "win"

**LENGTH:** 100-200 words

Provide your synthesis now.`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

/**
 * Get framework-specific steel-man starter phrases
 */
export function getSteelManStarter(framework: PhilosophicalChair): string {
  const starters: Record<PhilosophicalChair, string> = {
    utilitarian: "I understand why outcome-focused reasoning is appealing here—",
    virtue_ethics: "The emphasis on character and wisdom is compelling—",
    deontological: "Rights and duties matter, and I can see why—",
    pragmatic: "Looking at what actually works is important—",
    libertarian: "Individual liberty is a real concern here—",
    communitarian: "Our responsibilities to community matter—",
    cosmopolitan: "Universal human dignity is a powerful principle—",
    precautionary: "Caution about risks is warranted—",
    autonomy_centered: "Personal choice deserves respect—",
    care_ethics: "The relational dimension here is important—",
  };
  return starters[framework];
}

/**
 * Get framework-specific response phrases for acknowledging other frameworks
 */
export function getAcknowledgmentPhrase(
  speakerFramework: PhilosophicalChair,
  targetFramework: PhilosophicalChair
): string {
  const speakerInfo = PHILOSOPHICAL_CHAIR_INFO[speakerFramework];
  const targetInfo = PHILOSOPHICAL_CHAIR_INFO[targetFramework];

  return `From the ${speakerInfo.name} perspective, I can appreciate what the ${targetInfo.name} brings to this discussion.`;
}

/**
 * Build a conversation context summary for multi-turn exchanges
 */
export function buildConversationSummary(
  exchanges: Array<{ speaker: string; content: string }>
): string {
  if (exchanges.length === 0) {
    return '(No previous exchanges)';
  }

  return exchanges
    .slice(-6) // Last 6 exchanges
    .map((e, i) => `[${i + 1}] ${e.speaker}: ${e.content.slice(0, 200)}${e.content.length > 200 ? '...' : ''}`)
    .join('\n\n');
}

/**
 * Check if response content includes steel-manning (heuristic)
 */
export function hasApparentSteelMan(content: string): boolean {
  const patterns = [
    /I (appreciate|understand|recognize|acknowledge|see|grant)/i,
    /they'?re? right (that|to|about)/i,
    /the.+argument.+(has|makes).+(merit|sense|point)/i,
    /from (their|the.+) perspective/i,
    /(fair|valid|good|strong|compelling) (point|argument|case)/i,
  ];
  return patterns.some(p => p.test(content));
}

/**
 * Check if response content includes self-critique (heuristic)
 */
export function hasApparentSelfCritique(content: string): boolean {
  const patterns = [
    /I('ll| must| will)? (admit|acknowledge|concede)/i,
    /my (framework|approach|perspective) (struggles?|fails?|has difficulty)/i,
    /(limitation|weakness|blind spot) of/i,
    /critics (of|would|might)/i,
    /where.+(falls short|struggles)/i,
  ];
  return patterns.some(p => p.test(content));
}
