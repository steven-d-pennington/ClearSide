/**
 * Persona Agent Prompts
 *
 * Prompts for building persona-based agents in conversational podcast mode.
 * Unlike chair-prompts which argue positions, these embody character personas.
 */

import type { PodcastPersona, EmotionalBeatState } from '../../../types/conversation.js';
import type { PersonaMemoryContext } from '../../../types/persona-memory.js';

/**
 * Detect if a persona has a naturally verbose speaking style
 * (storytellers, anecdote-tellers, etc.)
 */
function isVerbosePersona(persona: PodcastPersona): boolean {
  const verboseIndicators = [
    'storyteller',
    'story',
    'anecdote',
    'elaborate',
    'detailed',
    'verbose',
    'let me tell you',
    'grounds abstract issues in real people',
    'uses examples',
    'illustrates with',
  ];

  const styleText = (persona.speakingStyle + ' ' + persona.quirks.join(' ')).toLowerCase();
  return verboseIndicators.some(indicator => styleText.includes(indicator));
}

/**
 * Build the memory injection section for the system prompt
 * Exported for use by both PersonaAgent and PodcastHostAgent
 */
export function buildMemorySection(memoryContext: PersonaMemoryContext): string {
  const sections: string[] = [];

  // Core values section (immutable personality anchors)
  if (memoryContext.coreValues.length > 0) {
    const values = memoryContext.coreValues
      .slice(0, 5) // Limit to top 5 by priority
      .map(v => `- ${v.description}`)
      .join('\n');
    sections.push(`YOUR CORE VALUES (Never compromise these):
${values}`);
  }

  // Relevant opinions section (malleable stances)
  if (memoryContext.relevantOpinions.length > 0) {
    const opinions = memoryContext.relevantOpinions
      .map(o => {
        const stanceDescription = {
          supports: 'support',
          opposes: 'oppose',
          neutral: 'are neutral on',
          mixed: 'have mixed feelings about',
          evolving: 'are still forming your view on',
        }[o.stance] || o.stance;
        return `- ${o.topicDisplay || o.topicKey}: You ${stanceDescription} this. ${o.summary}`;
      })
      .join('\n');
    sections.push(`YOUR ESTABLISHED POSITIONS:
${opinions}`);
  }

  // Relationships section (inter-persona dynamics)
  if (memoryContext.relationships.length > 0) {
    const relationships = memoryContext.relationships
      .map(r => {
        const dynamicDesc = r.dynamicType
          ? ` (${r.dynamicType.replace('_', ' ')})`
          : '';
        const frictionNote = r.frictionPoints && r.frictionPoints.length > 0
          ? ` You tend to clash on: ${r.frictionPoints.slice(0, 2).join(', ')}.`
          : '';
        const commonNote = r.commonGround && r.commonGround.length > 0
          ? ` You tend to agree on: ${r.commonGround.slice(0, 2).join(', ')}.`
          : '';
        return `- ${r.otherPersonaName}${dynamicDesc}:${frictionNote}${commonNote}`;
      })
      .join('\n');
    sections.push(`YOUR RELATIONSHIPS WITH TODAY'S GUESTS:
${relationships}`);
  }

  // Personality notes section (admin-curated guidance)
  if (memoryContext.personalityNotes) {
    sections.push(`PERSONALITY NOTES:
${memoryContext.personalityNotes}`);
  }

  return sections.join('\n\n');
}

/**
 * Build system prompt for a persona agent
 */
export function buildPersonaSystemPrompt(
  persona: PodcastPersona,
  topic: string,
  otherParticipantNames: string[],
  rapidFire: boolean = false,
  minimalPersonaMode: boolean = false,
  memoryContext?: PersonaMemoryContext
): string {
  // MINIMAL PERSONA MODE: Model speaks naturally without character constraints
  if (minimalPersonaMode) {
    const lengthGuideline = rapidFire
      ? `- Keep responses to 2-4 sentences typically
- Be focused and avoid repetition - make each sentence count
- Cut unnecessary throat-clearing and preambles
- Get to your core point quickly and clearly
- Build naturally on what others say without rehashing`
      : '- Keep responses concise (2-4 paragraphs typically, unless asked for more detail)';

    return `You are ${persona.name}, an AI model participating in a debate about ${topic}.

OTHER PARTICIPANTS: ${otherParticipantNames.join(', ')}

GUIDELINES:
1. Speak from your own reasoning and training - there's no character to play
2. Take clear positions based on evidence and logic
3. Engage substantively with what others say - agree or disagree honestly
4. Challenge assumptions when warranted
5. Show your reasoning process, not just conclusions
${lengthGuideline}
6. Be conversational but substantive - this is a thoughtful discussion
7. Don't shy away from disagreement when you see issues differently
8. Build on points made by ${otherParticipantNames.join(' and ')}
9. When you disagree, explain why with specific reasoning

Speak authentically as an AI - no need to pretend otherwise.`;
  }

  // NORMAL PERSONA MODE: Full character with backstory/worldview
  const quirksText = persona.quirks.length > 0
    ? `\n\nQUIRKS:\n${persona.quirks.map(q => `- ${q}`).join('\n')}`
    : '';

  const examplesText = persona.examplePhrases.length > 0
    ? `\n\nEXAMPLE PHRASES (use similar style):\n${persona.examplePhrases.map(p => `- "${p}"`).join('\n')}`
    : '';

  const topicsText = persona.preferredTopics.length > 0
    ? `\n\nYOUR PREFERRED TOPICS: ${persona.preferredTopics.join(', ')}`
    : '';

  // Memory context injection (persistent personality memories)
  const memorySection = memoryContext
    ? `\n\n${buildMemorySection(memoryContext)}`
    : '';

  // Response length guideline changes based on rapid fire mode
  // Verbose personas (storytellers) get extra guidance to condense their style
  const verboseOverride = rapidFire && isVerbosePersona(persona)
    ? `
   - YOUR STYLE ADAPTS: You're naturally a storyteller, but in rapid-fire mode, give us the TAKEAWAY, not the story
   - Skip the setup - jump straight to your point
   - Instead of "Let me tell you about my neighbor..." just say "In my neighborhood, we see X"
   - Save the full anecdotes for longer formats - here, distill to essence`
    : '';

  const lengthGuideline = rapidFire
    ? `6. RAPID FIRE MODE - This is a fast-paced, focused exchange:
   - Keep responses to 2-4 sentences typically
   - Be focused and avoid repetition - make each sentence count
   - Cut unnecessary throat-clearing and preambles
   - Get to your core point quickly and clearly
   - Build naturally on what others say without rehashing${verboseOverride}`
    : '6. Keep responses concise (2-4 paragraphs typically, unless asked for more detail)';

  return `You are ${persona.name}, a participant in a podcast conversation.

BACKSTORY:
${persona.backstory}

SPEAKING STYLE:
${persona.speakingStyle}

WORLDVIEW:
${persona.worldview}
${quirksText}
${examplesText}
${topicsText}
${memorySection}

TODAY'S TOPIC: ${topic}

OTHER PARTICIPANTS: ${otherParticipantNames.join(', ')}

GUIDELINES:
1. Stay in character at all times - you ARE ${persona.name.split(' ')[0]}
2. Respond naturally as ${persona.name.split(' ')[0]} would
3. You may address other participants by name when responding to them
4. Express your genuine perspective based on your worldview
5. Be conversational - this is a podcast, not a debate or lecture
${lengthGuideline}
7. Show authentic reactions - agreement, curiosity, skepticism, surprise, etc.
8. Build on what others say rather than just stating your position
9. When you disagree, do so respectfully while staying true to your perspective

NATURAL SPEECH PATTERNS - Sound like a real person talking, not written text:
- INCLUDE OCCASIONALLY (not every response):
  * False starts: "I think— well, actually..."
  * Self-corrections: "That's about 60%— sorry, closer to 70%"
  * Hedging phrases: "I mean, look...", "Here's the thing..."
  * Thinking transitions: "Hmm...", "Well..."
  * Mid-sentence pivots: "The data shows— and this is important—"
- GUIDELINES:
  * Use 1-2 disfluencies per response maximum (don't overdo it)
  * Place them at natural decision points or topic shifts
  * Vary which types you use - don't repeat the same pattern
  * Skip them entirely for short, direct responses
  * More common when expressing uncertainty or changing direction

CRITICAL - VARIETY IS ESSENTIAL:
- VARY your verbal mannerisms! Do NOT use the same action tags (*adjusts glasses*, *nods*, *leans forward*) repeatedly
- VARY your opening phrases! If you've started with "In my experience..." before, try something different
- VARY your catchphrases! Use them sparingly (once or twice max in a conversation), not in every response
- Each response should feel fresh - avoid formulaic structures you've used before
- If you notice yourself repeating a pattern, consciously break it
- Don't start every response the same way - mix up your approach

ENGAGE DIRECTLY WITH OTHER GUESTS:
- Ask other guests questions directly: "${otherParticipantNames[0] || 'fellow guest'}, what do you make of...?"
- Challenge their points: "I'd push back on what you said about..."
- Build on their ideas: "That's interesting because it connects to..."
- Don't always wait for the host to direct traffic - jump into the conversation naturally
- A great podcast has guests talking TO each other, not just AT the host`;
}

/**
 * Build acknowledgment guidance for natural conversational responses
 */
function buildAcknowledgmentGuidance(): string {
  return `
CONVERSATIONAL NATURALNESS:
- When responding to a strong point, consider a brief acknowledgment first:
  "That's interesting...", "I hear you...", "Fair point...", "That's a good point..."
- Before changing your position or conceding, add a thinking pause: "..." or "[short pause]"
- If agreeing unexpectedly: "Actually, you know what...", "I hadn't thought of it that way..."
- Before a complex response, a brief pause signals you're considering: "Hmm...", "[short pause]"
- Use these naturally - max 1-2 per response, not every time`;
}

/**
 * Build emotional context guidance based on conversation dynamics
 */
function buildEmotionalGuidance(emotionalBeat: EmotionalBeatState): string {
  let guidance = `
CONVERSATION DYNAMICS:
- Temperature: ${emotionalBeat.currentTemperature}
- Energy: ${emotionalBeat.energyLevel}`;

  if (emotionalBeat.currentTemperature === 'rising_tension') {
    guidance += `
- Consider finding common ground or acknowledging valid points in the other perspective
- You don't have to agree, but show you're listening and engaging thoughtfully`;
  } else if (emotionalBeat.currentTemperature === 'agreement_forming') {
    guidance += `
- Add your unique perspective rather than just echoing agreement
- Find the nuance or "yes, and..." that moves the conversation forward`;
  } else if (emotionalBeat.currentTemperature === 'breakthrough') {
    guidance += `
- Someone just made a concession or shifted position - acknowledge this meaningfully
- Build on this moment of progress without gloating`;
  } else if (emotionalBeat.currentTemperature === 'declining_energy') {
    guidance += `
- The conversation energy is dropping - bring some spark or new angle
- Ask a probing question or introduce a fresh perspective`;
  }

  return guidance;
}

/**
 * Build prompt for generating a response
 */
export function buildResponsePrompt(
  persona: PodcastPersona,
  conversationContext: string,
  addressedTo?: string,
  previousSpeaker?: string,
  participantNames?: string[],
  rapidFire: boolean = false,
  emotionalBeat?: EmotionalBeatState
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
    prompt += `You may address ${participantNames.join(' or ')} directly - ask them questions, challenge their points, or build on their ideas. Great conversations happen when guests talk TO each other, not just respond to the host. `;
  }

  // Length instruction changes based on rapid fire mode
  // Verbose personas get extra reminder to condense
  const verboseReminder = rapidFire && isVerbosePersona(persona)
    ? ' Give us the takeaway, not the full story - distill to essence!'
    : '';

  const lengthInstruction = rapidFire
    ? `RAPID FIRE: 2-4 sentences typically. Be focused and avoid repetition - make every sentence count!${verboseReminder}`
    : 'Keep your response focused and conversational (2-4 paragraphs unless more detail is explicitly requested).';

  // Add acknowledgment guidance for natural conversation flow
  prompt += buildAcknowledgmentGuidance();

  // Add emotional context guidance if available
  if (emotionalBeat) {
    prompt += buildEmotionalGuidance(emotionalBeat);
  }

  prompt += `

Stay in character and be authentic to your worldview. ${lengthInstruction}

IMPORTANT: Vary your response style! Don't repeat the same verbal tics, action tags, or opening phrases you've used before. Each response should feel fresh.`;

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
- Is this something you feel strongly about?

Respond in this exact format:
URGENCY: [high/medium/low/none]
REASON: [agreement/disagreement/clarification/addition/redirect]
PREVIEW: [1-2 sentence preview of what you'd say]

If you don't feel compelled to speak, use URGENCY: none`;
}

/**
 * Build prompt for generating an opening statement when introduced
 */
export function buildIntroductionResponsePrompt(
  persona: PodcastPersona,
  topic: string,
  hostIntroduction: string,
  rapidFire: boolean = false
): string {
  const lengthInstruction = rapidFire
    ? 'Keep it to ONE sentence - just a quick greeting and jump in!'
    : 'Keep it warm, natural, and in character (1-2 paragraphs).';

  return `The host just introduced you:

"${hostIntroduction}"

The topic is: ${topic}

As ${persona.name}, respond briefly to your introduction. You might:
- Thank the host
- Express your excitement or interest in the topic
- Give a quick preview of your perspective
- Share a brief anecdote or connection to the topic

${lengthInstruction}`;
}

/**
 * Build prompt for direct addressing of another participant
 */
export function buildDirectAddressPrompt(
  persona: PodcastPersona,
  targetName: string,
  targetStatement: string,
  recentContext: string
): string {
  return `RECENT CONVERSATION:
${recentContext}

---

${targetName} said: "${targetStatement}"

As ${persona.name}, respond directly to ${targetName}. You feel compelled to address what they said.

Speak naturally as if in a real conversation - use their name, reference their point, and share your reaction or counter-perspective.`;
}

/**
 * Check if content appears to address someone directly
 */
export function extractAddressedParticipant(content: string, participantNames: string[]): string | null {
  for (const name of participantNames) {
    const firstName = name.split(' ')[0];
    if (!firstName) continue;

    const lowerContent = content.toLowerCase();
    const lowerFirstName = firstName.toLowerCase();

    // Check for patterns like "Mike, I think..." or "What do you think, Sarah?"
    // or "I agree with Viktor" or "As Professor Clara mentioned"
    if (
      lowerContent.includes(lowerFirstName + ',') ||
      lowerContent.includes(', ' + lowerFirstName) ||
      lowerContent.startsWith(lowerFirstName) ||
      lowerContent.includes('agree with ' + lowerFirstName) ||
      lowerContent.includes('disagree with ' + lowerFirstName) ||
      lowerContent.includes('like ' + lowerFirstName + ' said') ||
      lowerContent.includes('as ' + lowerFirstName + ' mentioned')
    ) {
      return name;
    }
  }
  return null;
}

/**
 * Check if content contains a question
 */
export function containsQuestion(content: string): boolean {
  return content.includes('?');
}

/**
 * Check if content shows agreement
 */
export function showsAgreement(content: string): boolean {
  const agreementPhrases = [
    'i agree',
    'that\'s right',
    'exactly',
    'well said',
    'you\'re right',
    'good point',
    'i couldn\'t agree more',
    'absolutely',
    'precisely',
    'i think you\'re onto something',
  ];

  const lowerContent = content.toLowerCase();
  return agreementPhrases.some(phrase => lowerContent.includes(phrase));
}

/**
 * Check if content shows disagreement
 */
export function showsDisagreement(content: string): boolean {
  const disagreementPhrases = [
    'i disagree',
    'i\'m not sure about that',
    'i see it differently',
    'but wait',
    'on the other hand',
    'i have to push back',
    'that\'s not quite right',
    'i\'d challenge that',
    'respectfully disagree',
    'i\'m skeptical',
    'hold on',
  ];

  const lowerContent = content.toLowerCase();
  return disagreementPhrases.some(phrase => lowerContent.includes(phrase));
}

/**
 * Build a summary of a persona for quick reference
 */
export function buildPersonaSummary(persona: PodcastPersona): string {
  return `${persona.name} (${persona.avatarEmoji}): ${persona.worldview.split('.')[0]}. Style: ${persona.speakingStyle.split('.')[0]}.`;
}
