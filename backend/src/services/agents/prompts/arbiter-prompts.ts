/**
 * Arbiter Agent Prompts for Duelogic Debate Mode
 *
 * The Arbiter is the host and referee of Duelogic debates:
 * - Provides engaging podcast-style introductions
 * - Monitors for principle violations (steel-manning, self-critique)
 * - Issues interjections when chairs fail their obligations
 * - Delivers synthesizing closings
 */

import {
  type DuelogicChair,
  type ResponseEvaluation,
  type QualityLevel,
  PHILOSOPHICAL_CHAIR_INFO,
} from '../../../types/duelogic.js';

/**
 * Context for generating podcast introduction
 */
export interface PodcastIntroContext {
  proposition: string;
  propositionContext?: string;
  chairs: DuelogicChair[];
  showName: string;
  episodeNumber?: number;
}

/**
 * Context for generating podcast closing
 */
export interface PodcastClosingContext {
  proposition: string;
  chairs: DuelogicChair[];
  transcript: string;
  evaluations: Map<string, ResponseEvaluation[]>;
  showName: string;
  includeCallToAction: boolean;
}

/**
 * Context for evaluating a response
 */
export interface EvaluationContext {
  chair: DuelogicChair;
  responseContent: string;
  debateHistory: string;
  previousSpeaker?: DuelogicChair;
  previousContent?: string;
}

/**
 * Types of violations that can trigger arbiter interjection
 */
export type ViolationType =
  | 'straw_manning'
  | 'missing_self_critique'
  | 'framework_inconsistency'
  | 'rhetorical_evasion';

// ============================================================================
// PODCAST INTRODUCTION PROMPT
// ============================================================================

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

// ============================================================================
// PODCAST CLOSING PROMPT
// ============================================================================

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

// ============================================================================
// INTERJECTION PROMPT
// ============================================================================

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

// ============================================================================
// RESPONSE EVALUATION PROMPT
// ============================================================================

export const ARBITER_EVALUATION_PROMPT = `You are evaluating a debate response for adherence to Duelogic principles.

**EVALUATION CRITERIA:**

1. **STEEL-MANNING** (Did they articulate opponent's strongest position before critiquing?)
   - attempted: true/false
   - quality: "strong" | "adequate" | "weak" | "absent"
   - notes: brief explanation

   Quality Guide:
   - strong: Articulated opponent's position better than opponent might themselves
   - adequate: Clear, charitable interpretation of opponent's view
   - weak: Brief or superficial mention
   - absent: No acknowledgment or attacked a straw man

2. **SELF-CRITIQUE** (Did they acknowledge their framework's blind spots?)
   - attempted: true/false
   - quality: "strong" | "adequate" | "weak" | "absent"
   - notes: brief explanation

   Quality Guide:
   - strong: Genuine acknowledgment of framework weakness with nuance
   - adequate: Clear admission of limitation
   - weak: Brief nod or hedged acknowledgment
   - absent: No acknowledgment or defensive

3. **FRAMEWORK CONSISTENCY** (Did they stay true to their assigned framework?)
   - consistent: true/false
   - violations: list any departures from their framework

4. **INTELLECTUAL HONESTY** (Overall honesty and good faith)
   - score: "high" | "medium" | "low"
   - issues: list any concerning patterns

   Watch for:
   - Evasion of direct challenges
   - Misrepresenting opponent's position
   - Cherry-picking evidence
   - Moving goalposts
   - False equivalences

5. **OVERALL ADHERENCE SCORE** (0-100)
   Weight: 25 points each for steel-manning, self-critique, framework consistency, intellectual honesty

6. **REQUIRES INTERJECTION?**
   - requiresInterjection: true/false
   - interjectionReason: if true, why?

   Set to TRUE if:
   - Steel-manning is absent or very weak
   - Self-critique is completely absent
   - Major framework violation
   - Significant intellectual dishonesty

**OUTPUT FORMAT (strict JSON):**
{
  "adherenceScore": <0-100>,
  "steelManning": { "attempted": boolean, "quality": "string", "notes": "string" },
  "selfCritique": { "attempted": boolean, "quality": "string", "notes": "string" },
  "frameworkConsistency": { "consistent": boolean, "violations": ["array"] },
  "intellectualHonesty": { "score": "string", "issues": ["array"] },
  "requiresInterjection": boolean,
  "interjectionReason": "string or null"
}`;

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * Build the full podcast introduction prompt with debate context
 */
export function buildPodcastIntroPrompt(context: PodcastIntroContext): string {
  const chairDescriptions = context.chairs.map((chair, index) => {
    const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
    const ordinal = getOrdinal(index + 1);
    return `Chair ${index + 1}: ${chair.modelDisplayName || chair.modelId} from ${chair.providerName || 'Unknown Provider'}
  Position: ${ordinal} chair
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

/**
 * Build the full podcast closing prompt with debate results
 */
export function buildPodcastClosingPrompt(context: PodcastClosingContext): string {
  const chairSummaries = context.chairs.map(chair => {
    const info = PHILOSOPHICAL_CHAIR_INFO[chair.framework];
    const evals = context.evaluations.get(chair.position) || [];
    const avgAdherence = evals.length > 0
      ? Math.round(evals.reduce((sum, e) => sum + e.adherenceScore, 0) / evals.length)
      : 'N/A';

    const steelManCount = evals.filter(e => e.steelManning.attempted).length;
    const selfCritiqueCount = evals.filter(e => e.selfCritique.attempted).length;

    return `${chair.modelDisplayName || chair.modelId} (${info.name})
  Average Adherence: ${avgAdherence}${typeof avgAdherence === 'number' ? '%' : ''}
  Steel-manning: ${steelManCount}/${evals.length} responses
  Self-critique: ${selfCritiqueCount}/${evals.length} responses`;
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

/**
 * Build an interjection prompt for a specific violation
 */
export function buildInterjectionPrompt(
  violation: ViolationType,
  violatingChair: DuelogicChair,
  violatingContent: string
): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[violatingChair.framework];
  const violationDisplay = violation.replace(/_/g, ' ');

  return `${ARBITER_INTERJECTION_PROMPT}

---

**CURRENT VIOLATION:**

Chair: ${violatingChair.modelDisplayName || violatingChair.modelId}
Framework: ${info.name}
Violation Type: ${violationDisplay}

What they said that triggered this:
"${violatingContent}"

---

Generate a brief, firm interjection now.`;
}

/**
 * Build a response evaluation prompt
 */
export function buildEvaluationPrompt(context: EvaluationContext): string {
  const info = PHILOSOPHICAL_CHAIR_INFO[context.chair.framework];
  const prevInfo = context.previousSpeaker
    ? PHILOSOPHICAL_CHAIR_INFO[context.previousSpeaker.framework]
    : null;

  return `${ARBITER_EVALUATION_PROMPT}

---

**CHAIR BEING EVALUATED:**
${context.chair.modelDisplayName || context.chair.modelId} - ${info.name}
Framework: ${info.description}
Core Question: ${info.coreQuestion}

Known Blind Spots for ${info.name}:
${info.blindSpotsToAdmit.map(b => `- ${b}`).join('\n')}

**THEIR RESPONSE:**
"${context.responseContent}"

${context.previousSpeaker && context.previousContent ? `
**WHAT THEY WERE RESPONDING TO:**
${context.previousSpeaker.modelDisplayName || context.previousSpeaker.modelId} (${prevInfo!.name}) said:
"${context.previousContent}"
` : ''}

**DEBATE CONTEXT (last 1500 chars):**
${context.debateHistory.slice(-1500)}

---

Evaluate now and respond in JSON format:`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get ordinal string for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0] ?? 'th');
}

/**
 * Quick heuristic check for steel-manning patterns
 * Use before full LLM evaluation for efficiency
 */
export function quickSteelManCheck(content: string): boolean {
  const patterns = [
    /I (appreciate|understand|see|acknowledge|recognize)/i,
    /the .+ (makes? a (good|valid|fair|strong|compelling) point|argument)/i,
    /from (their|the .+) perspective/i,
    /they'?re? right (that|to|about)/i,
    /I (agree|concede|grant) (that|with)/i,
    /there's (truth|merit|value) (in|to)/i,
    /the (force|strength|appeal) of (their|the)/i,
    /what they'?re? really (saying|arguing)/i,
  ];
  return patterns.some(p => p.test(content));
}

/**
 * Quick heuristic check for self-critique patterns
 * Use before full LLM evaluation for efficiency
 */
export function quickSelfCritiqueCheck(content: string): boolean {
  const patterns = [
    /my (framework|approach|position) (struggles?|fails?|has difficulty)/i,
    /I('ll| must)? (admit|acknowledge|concede)/i,
    /this is (where|a point where) .+ (struggles?|is weak|falls short)/i,
    /(limitation|weakness|blind spot) of (my|this)/i,
    /critics (of|would say|might argue)/i,
    /(fair|valid) (criticism|objection|challenge)/i,
    /I (don't|can't) (fully|entirely|completely) (address|answer|resolve)/i,
  ];
  return patterns.some(p => p.test(content));
}

/**
 * Parse JSON from LLM response, handling common issues
 */
export function parseEvaluationResponse(content: string): ResponseEvaluation | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return validateAndNormalizeEvaluation(parsed);
  } catch {
    return null;
  }
}

/**
 * Validate and normalize parsed evaluation data
 */
function validateAndNormalizeEvaluation(parsed: unknown): ResponseEvaluation {
  const p = parsed as Record<string, unknown>;

  return {
    adherenceScore: clamp(Number(p.adherenceScore) || 50, 0, 100),
    steelManning: {
      attempted: Boolean((p.steelManning as Record<string, unknown>)?.attempted),
      quality: validateQuality((p.steelManning as Record<string, unknown>)?.quality),
      notes: String((p.steelManning as Record<string, unknown>)?.notes || ''),
    },
    selfCritique: {
      attempted: Boolean((p.selfCritique as Record<string, unknown>)?.attempted),
      quality: validateQuality((p.selfCritique as Record<string, unknown>)?.quality),
      notes: String((p.selfCritique as Record<string, unknown>)?.notes || ''),
    },
    frameworkConsistency: {
      consistent: Boolean((p.frameworkConsistency as Record<string, unknown>)?.consistent ?? true),
      violations: Array.isArray((p.frameworkConsistency as Record<string, unknown>)?.violations)
        ? ((p.frameworkConsistency as Record<string, unknown>)?.violations as string[])
        : undefined,
    },
    intellectualHonesty: {
      score: validateHonestyScore((p.intellectualHonesty as Record<string, unknown>)?.score),
      issues: Array.isArray((p.intellectualHonesty as Record<string, unknown>)?.issues)
        ? ((p.intellectualHonesty as Record<string, unknown>)?.issues as string[])
        : undefined,
    },
    requiresInterjection: Boolean(p.requiresInterjection),
    interjectionReason: p.interjectionReason ? String(p.interjectionReason) : undefined,
  };
}

function validateQuality(quality: unknown): QualityLevel {
  const valid: QualityLevel[] = ['strong', 'adequate', 'weak', 'absent'];
  return valid.includes(quality as QualityLevel) ? (quality as QualityLevel) : 'absent';
}

function validateHonestyScore(score: unknown): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(score as string) ? (score as 'high' | 'medium' | 'low') : 'medium';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get default evaluation when parsing fails
 */
export function getDefaultEvaluation(): ResponseEvaluation {
  return {
    adherenceScore: 50,
    steelManning: { attempted: false, quality: 'absent' },
    selfCritique: { attempted: false, quality: 'absent' },
    frameworkConsistency: { consistent: true },
    intellectualHonesty: { score: 'medium' },
    requiresInterjection: false,
  };
}
