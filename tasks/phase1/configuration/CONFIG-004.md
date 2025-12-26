# CONFIG-004: Prompt Modifiers for Configuration

**Priority:** P0
**Estimate:** M
**Labels:** `configuration`, `prompts`, `backend`
**Status:** 🟢 TO DO

---

## Context

Create a prompt modifier system that dynamically adjusts agent prompts based on debate configuration. This includes brevity instructions (word count targets) and citation requirements that are injected into agent prompts.

**References:**
- [Pro Advocate Prompts](../../../backend/src/services/agents/prompts/pro-advocate-prompts.ts) - Current prompt structure
- [Configuration Types](./CONFIG-002.md) - BrevityLevel and related types

---

## Requirements

### Acceptance Criteria

- [ ] Create `prompt-modifiers.ts` with brevity instructions for all 5 levels
- [ ] Create citation requirement instructions (required vs optional)
- [ ] Create `applyConfigurationToPrompt()` function
- [ ] Instructions integrate naturally with existing prompt structure
- [ ] Word count targets match brevity level expectations
- [ ] Function preserves prompt structure while adding config context

---

## Implementation Guide

### New File: `backend/src/services/agents/prompts/prompt-modifiers.ts`

```typescript
/**
 * Prompt Modifiers
 *
 * Dynamically adjust agent prompts based on debate configuration.
 * These modifiers are injected into prompts to enforce brevity levels
 * and citation requirements.
 */

import type { BrevityLevel, DebateConfiguration } from '../../../types/configuration.js';
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
// Exports
// ============================================================================

export const promptModifiers = {
  BREVITY_INSTRUCTIONS,
  CITATION_INSTRUCTIONS,
  buildConfigurationContext,
  applyConfigurationToPrompt,
  createConfiguredPrompt,
  getTemperatureGuidance,
};

export default promptModifiers;
```

### Usage Example

In agent code:

```typescript
import { applyConfigurationToPrompt } from './prompts/prompt-modifiers.js';
import type { DebateConfiguration } from '../../types/configuration.js';

// When generating a response
async function generateResponse(
  basePrompt: string,
  config: DebateConfiguration
): Promise<string> {
  // Apply configuration modifiers to the prompt
  const modifiedPrompt = applyConfigurationToPrompt(basePrompt, config);

  // Use modified prompt with LLM
  const response = await this.llmClient.complete({
    messages: [{ role: 'system', content: modifiedPrompt }, ...],
    temperature: config.llmSettings.temperature,
    maxTokens: config.llmSettings.maxTokensPerResponse,
  });

  return response.content;
}
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-002: Configuration types (must exist for type imports)

---

## Validation

### Unit Tests

```typescript
// backend/src/services/agents/prompts/__tests__/prompt-modifiers.test.ts

import {
  BREVITY_INSTRUCTIONS,
  CITATION_INSTRUCTIONS,
  buildConfigurationContext,
  applyConfigurationToPrompt,
  createConfiguredPrompt,
} from '../prompt-modifiers.js';
import { DEFAULT_CONFIGURATION } from '../../../../types/configuration.js';

describe('Prompt Modifiers', () => {
  describe('BREVITY_INSTRUCTIONS', () => {
    it('has instructions for all 5 levels', () => {
      expect(Object.keys(BREVITY_INSTRUCTIONS)).toHaveLength(5);
      expect(BREVITY_INSTRUCTIONS[1]).toContain('500-600 words');
      expect(BREVITY_INSTRUCTIONS[5]).toContain('Bullet points');
    });
  });

  describe('buildConfigurationContext', () => {
    it('includes brevity instructions', () => {
      const context = buildConfigurationContext(DEFAULT_CONFIGURATION);
      expect(context).toContain('300-400 words'); // Level 3 target
    });

    it('includes required citations when enabled', () => {
      const config = { ...DEFAULT_CONFIGURATION, requireCitations: true };
      const context = buildConfigurationContext(config);
      expect(context).toContain('MANDATORY');
      expect(context).toContain('[FACT:');
    });

    it('includes optional citations when disabled', () => {
      const config = { ...DEFAULT_CONFIGURATION, requireCitations: false };
      const context = buildConfigurationContext(config);
      expect(context).toContain('Recommended');
      expect(context).not.toContain('MANDATORY');
    });
  });

  describe('applyConfigurationToPrompt', () => {
    const basePrompt = `You are an agent.

**Your Task:**
Do something.

**Output Structure:**
- Point 1
- Point 2`;

    it('inserts config before Output Structure', () => {
      const result = applyConfigurationToPrompt(basePrompt, DEFAULT_CONFIGURATION);

      const outputIndex = result.indexOf('**Output Structure:**');
      const configIndex = result.indexOf('Response Length');

      expect(configIndex).toBeLessThan(outputIndex);
    });

    it('preserves original prompt content', () => {
      const result = applyConfigurationToPrompt(basePrompt, DEFAULT_CONFIGURATION);

      expect(result).toContain('You are an agent');
      expect(result).toContain('Do something');
      expect(result).toContain('Point 1');
    });
  });

  describe('createConfiguredPrompt', () => {
    it('adds configuration header', () => {
      const result = createConfiguredPrompt('Base prompt', DEFAULT_CONFIGURATION);

      expect(result).toContain('DEBATE CONFIGURATION');
      expect(result).toContain('Mode: BALANCED');
      expect(result).toContain('Brevity: Level 3');
    });
  });
});
```

### Integration Test

```typescript
// Test with actual prompt templates
import { ProOpeningPrompt } from '../pro-advocate-prompts.js';
import { applyConfigurationToPrompt } from '../prompt-modifiers.js';

describe('Prompt Modifiers with Real Prompts', () => {
  it('correctly modifies Pro Opening prompt', () => {
    const config = {
      presetMode: 'research' as const,
      brevityLevel: 2 as const,
      llmSettings: { temperature: 0.6, maxTokensPerResponse: 2048 },
      requireCitations: true,
    };

    const modified = applyConfigurationToPrompt(ProOpeningPrompt.template, config);

    // Should have citation requirements
    expect(modified).toContain('[FACT:');
    expect(modified).toContain('MANDATORY');

    // Should have word count target for level 2
    expect(modified).toContain('400-500 words');

    // Original content preserved
    expect(modified).toContain('Pro Advocate');
    expect(modified).toContain('Steel-man');
  });
});
```

### Definition of Done

- [ ] `prompt-modifiers.ts` created with all modifier functions
- [ ] Brevity instructions for all 5 levels implemented
- [ ] Citation instructions (required/optional) implemented
- [ ] `applyConfigurationToPrompt` correctly inserts modifiers
- [ ] `createConfiguredPrompt` adds header with config summary
- [ ] Unit tests written and passing
- [ ] Integration tests with real prompts passing

---

## Notes

### Prompt Insertion Strategy

The modifiers are inserted **before** the `**Output Structure:**` section because:
1. Output structure is the final instruction before agent responds
2. Configuration context should inform how they structure their response
3. Preserves the natural flow of the prompt

### Citation Tag Format

Using bracketed tags like `[FACT: source]` allows:
1. Easy parsing for quality validation
2. Clear distinction between claim and evidence
3. Consistency across all agents

---

**Estimated Time:** 4 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
