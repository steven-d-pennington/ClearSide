/**
 * Prompt Modifiers
 *
 * Dynamically adjust agent prompts based on debate configuration.
 * These modifiers are injected into prompts to enforce brevity levels
 * and citation requirements.
 */

import type { BrevityLevel, DebateConfiguration, Persona } from '../../../types/configuration.js';
import { BREVITY_WORD_TARGETS } from '../../../types/configuration.js';

// ============================================================================
// Brevity Instructions
// ============================================================================

/**
 * Brevity instructions for each level (1 = detailed, 5 = concise)
 */
export const BREVITY_INSTRUCTIONS: Record<BrevityLevel, string> = {
  1: `**Response Length & Detail:**
Be comprehensive and thorough in your analysis. Provide extensive exploration of each point,
multiple supporting examples, and detailed explanations of your reasoning.

Target: ${BREVITY_WORD_TARGETS[1].min}-${BREVITY_WORD_TARGETS[1].max} words
Style: Full paragraphs, thorough analysis, multiple examples per point`,

  2: `**Response Length & Detail:**
Be detailed but focused in your analysis. Provide thorough coverage of key points
with supporting examples where they strengthen your argument.

Target: ${BREVITY_WORD_TARGETS[2].min}-${BREVITY_WORD_TARGETS[2].max} words
Style: Well-developed paragraphs, key examples, complete reasoning`,

  3: `**Response Length & Detail:**
Balance depth with conciseness. Cover essential points with select examples,
avoiding excessive elaboration while maintaining substance.

Target: ${BREVITY_WORD_TARGETS[3].min}-${BREVITY_WORD_TARGETS[3].max} words
Style: Balanced paragraphs, focused examples, clear reasoning`,

  4: `**Response Length & Detail:**
Be concise and focused. Prioritize your strongest arguments with minimal
elaboration. Every sentence should directly support your position.

Target: ${BREVITY_WORD_TARGETS[4].min}-${BREVITY_WORD_TARGETS[4].max} words
Style: Tight paragraphs, essential points only, efficient prose`,

  5: `**Response Length & Detail:**
Be highly concise and direct. Present core arguments in the most efficient form.
Bullet points are encouraged for clarity.

Target: ${BREVITY_WORD_TARGETS[5].min}-${BREVITY_WORD_TARGETS[5].max} words
Style: Bullet points encouraged, minimal elaboration, maximum clarity`,
};

// ============================================================================
// Citation Instructions
// ============================================================================

/**
 * Citation/evidence instructions based on configuration
 */
export const CITATION_INSTRUCTIONS = {
  required: `**Evidence Requirements (MANDATORY):**
ALL substantive claims MUST include evidence classification. Use these tags:

- [FACT: source/data] - Empirical data, statistics, documented outcomes
- [STUDY: study name/year] - Academic research, peer-reviewed findings
- [EXPERT: name/credentials] - Expert opinion, authoritative sources
- [ANALOGY: comparison] - Historical or situational comparisons
- [PROJECTION: basis] - Forecasts, models, trend extrapolations

Claims without evidence tags will be flagged as unsupported.
Distinguish between high-confidence facts and lower-confidence projections.`,

  optional: `**Evidence (Recommended):**
Include evidence where available. Classify evidence types when citing:
- FACT: Empirical data, statistics
- STUDY: Research findings
- EXPERT: Authoritative opinions
- ANALOGY: Relevant comparisons
- PROJECTION: Forecasts and models`,

  none: '', // No additional instructions
};

// ============================================================================
// Temperature Instructions (Optional - for context)
// ============================================================================

/**
 * Instructions based on temperature setting
 * These are informational and help agents understand the expected style
 */
export function getTemperatureGuidance(temperature: number): string {
  if (temperature < 0.3) {
    return `**Style Note:** Prioritize consistency and precision. Use established argumentative patterns.`;
  } else if (temperature < 0.6) {
    return `**Style Note:** Balance consistency with fresh perspectives. Maintain analytical rigor.`;
  } else if (temperature < 0.8) {
    return ''; // Default, no special guidance needed
  } else {
    return `**Style Note:** Feel free to explore creative angles while maintaining logical coherence.`;
  }
}

// ============================================================================
// Prompt Modification Functions
// ============================================================================

/**
 * Build configuration context to inject into prompts
 */
export function buildConfigurationContext(config: DebateConfiguration): string {
  const sections: string[] = [];

  // Add brevity instructions
  sections.push(BREVITY_INSTRUCTIONS[config.brevityLevel]);

  // Add citation instructions
  if (config.requireCitations) {
    sections.push(CITATION_INSTRUCTIONS.required);
  } else {
    sections.push(CITATION_INSTRUCTIONS.optional);
  }

  // Add temperature guidance if non-default
  const tempGuidance = getTemperatureGuidance(config.llmSettings.temperature);
  if (tempGuidance) {
    sections.push(tempGuidance);
  }

  return sections.join('\n\n');
}

/**
 * Apply configuration to a base prompt
 *
 * Inserts configuration instructions before the **Output Structure:** section
 * or appends to end if that section doesn't exist.
 */
export function applyConfigurationToPrompt(
  basePrompt: string,
  config: DebateConfiguration
): string {
  const configContext = buildConfigurationContext(config);

  // Look for the Output Structure section to insert before it
  const outputStructureMarker = '**Output Structure:**';
  const insertPoint = basePrompt.indexOf(outputStructureMarker);

  if (insertPoint !== -1) {
    // Insert configuration context before Output Structure
    return (
      basePrompt.slice(0, insertPoint) +
      configContext +
      '\n\n' +
      basePrompt.slice(insertPoint)
    );
  }

  // If no Output Structure section, append to end
  return basePrompt + '\n\n' + configContext;
}

/**
 * Create a modified system prompt with configuration applied
 */
export function createConfiguredPrompt(
  baseSystemPrompt: string,
  config: DebateConfiguration
): string {
  // Add a configuration header
  const configHeader = `
---
**DEBATE CONFIGURATION**
Mode: ${config.presetMode.replace('_', ' ').toUpperCase()}
Brevity: Level ${config.brevityLevel} (${getBrevityLabel(config.brevityLevel)})
Citations: ${config.requireCitations ? 'REQUIRED' : 'Optional'}
---
`;

  const modifiedPrompt = applyConfigurationToPrompt(baseSystemPrompt, config);
  return configHeader + '\n' + modifiedPrompt;
}

/**
 * Helper to get brevity label
 */
function getBrevityLabel(level: BrevityLevel): string {
  const labels: Record<BrevityLevel, string> = {
    1: 'Very Detailed',
    2: 'Detailed',
    3: 'Balanced',
    4: 'Concise',
    5: 'Very Concise',
  };
  return labels[level];
}

// ============================================================================
// Persona Injection
// ============================================================================

/**
 * Build persona context to inject into prompts
 * This adds the persona's unique argumentation style to the prompt
 */
export function buildPersonaContext(persona: Persona): string {
  return `
---
**PERSONA: ${persona.name}** ${persona.avatarEmoji || ''}
---

${persona.systemPromptAddition}
`;
}

/**
 * Apply persona to a base prompt
 *
 * Inserts the persona's system_prompt_addition after the core identity section,
 * before the PHASE description.
 */
export function applyPersonaToPrompt(
  basePrompt: string,
  persona: Persona | null | undefined
): string {
  if (!persona) {
    return basePrompt;
  }

  const personaContext = buildPersonaContext(persona);

  // Look for the PHASE section to insert before it
  const phaseMarker = '**PHASE:';
  const insertPoint = basePrompt.indexOf(phaseMarker);

  if (insertPoint !== -1) {
    // Insert persona context before PHASE section
    return (
      basePrompt.slice(0, insertPoint) +
      personaContext +
      '\n' +
      basePrompt.slice(insertPoint)
    );
  }

  // If no PHASE section, insert after the Core Principles section
  const coreMarker = 'Treat opposition as intelligent';
  const coreEndPoint = basePrompt.indexOf(coreMarker);

  if (coreEndPoint !== -1) {
    // Find the end of that line
    const lineEnd = basePrompt.indexOf('\n', coreEndPoint);
    if (lineEnd !== -1) {
      return (
        basePrompt.slice(0, lineEnd + 1) +
        personaContext +
        basePrompt.slice(lineEnd + 1)
      );
    }
  }

  // Fallback: append to end
  return basePrompt + '\n' + personaContext;
}

/**
 * Create a fully configured prompt with both configuration and persona applied
 */
export function createFullyConfiguredPrompt(
  baseSystemPrompt: string,
  config: DebateConfiguration,
  persona?: Persona | null
): string {
  // First apply persona (modifies identity)
  let modifiedPrompt = applyPersonaToPrompt(baseSystemPrompt, persona);

  // Then apply configuration (modifies behavior)
  modifiedPrompt = applyConfigurationToPrompt(modifiedPrompt, config);

  // Add configuration header
  const configHeader = `
---
**DEBATE CONFIGURATION**
Mode: ${config.presetMode.replace('_', ' ').toUpperCase()}
Brevity: Level ${config.brevityLevel} (${getBrevityLabel(config.brevityLevel)})
Citations: ${config.requireCitations ? 'REQUIRED' : 'Optional'}
${persona ? `Persona: ${persona.name} (${persona.archetype})` : 'Persona: Standard Advocate'}
---
`;

  return configHeader + '\n' + modifiedPrompt;
}

// ============================================================================
// Exports
// ============================================================================

export const promptModifiers = {
  BREVITY_INSTRUCTIONS,
  CITATION_INSTRUCTIONS,
  buildConfigurationContext,
  applyConfigurationToPrompt,
  createConfiguredPrompt,
  getTemperatureGuidance,
  buildPersonaContext,
  applyPersonaToPrompt,
  createFullyConfiguredPrompt,
};

export default promptModifiers;
