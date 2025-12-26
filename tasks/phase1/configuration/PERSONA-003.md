# PERSONA-003: Parameterize Agent Identity Prompts

**Priority:** P0
**Estimate:** L
**Labels:** `personas`, `prompts`, `backend`
**Status:** 🟢 TO DO

---

## Context

Transform the hardcoded `PRO_IDENTITY` and `CON_IDENTITY` constants in agent prompts into dynamic functions that incorporate persona information when available. This is the core change that makes personas functional.

**References:**
- [Pro Advocate Prompts](../../../backend/src/services/agents/prompts/pro-advocate-prompts.ts) - Current hardcoded identity
- [Con Advocate Prompts](../../../backend/src/services/agents/prompts/con-advocate-prompts.ts) - Current hardcoded identity
- [Persona Repository](./PERSONA-002.md) - Where to get persona data

---

## Requirements

### Acceptance Criteria

- [ ] Convert `PRO_IDENTITY` constant to `buildProIdentity(persona)` function
- [ ] Convert `CON_IDENTITY` constant to `buildConIdentity(persona)` function
- [ ] Functions return default identity when persona is null
- [ ] Persona's `systemPromptAddition` is incorporated into identity
- [ ] Update all prompt templates to use the new functions
- [ ] Update agents to pass persona to prompt builders
- [ ] Backward compatible (null persona = original behavior)

---

## Implementation Guide

### Update Pro Advocate Prompts

Modify `backend/src/services/agents/prompts/pro-advocate-prompts.ts`:

```typescript
import type { Persona } from '../../../types/configuration.js';

// ============================================================================
// Base Identity (used when no persona specified)
// ============================================================================

const PRO_BASE_IDENTITY = `You are the Pro Advocate in a structured debate on the ClearSide platform.

Your role is to construct the STRONGEST possible case FOR the proposition. You are not trying to "win" but to help the user understand the best arguments supporting this position.`;

const PRO_DEFAULT_PRINCIPLES = `**Core Principles:**
- Steel-man your position: Present the strongest, most charitable version
- Explicit assumptions: State every premise underlying your arguments
- Preserve uncertainty: Acknowledge what you don't know
- Professional tone: Neutral, substantive, no rhetoric or emotional appeals
- Treat opposition as intelligent: Never condescend or strawman`;

// ============================================================================
// Dynamic Identity Builder
// ============================================================================

/**
 * Build the Pro Advocate identity section based on persona
 *
 * @param persona - The persona to apply, or null for default identity
 * @returns The identity string to use in system prompts
 */
export function buildProIdentity(persona: Persona | null): string {
  // Base identity is always included
  let identity = PRO_BASE_IDENTITY;

  if (persona) {
    // Add persona-specific identity
    identity += `

**Your Persona: ${persona.name}**
*Archetype: ${formatArchetype(persona.archetype)}*

${persona.systemPromptAddition}`;

    // Add default principles as a reminder (shortened when persona active)
    identity += `

**Remember:** While arguing from your ${persona.name} perspective, maintain steel-man quality, explicit assumptions, and professional tone.`;
  } else {
    // No persona - use full default principles
    identity += '\n\n' + PRO_DEFAULT_PRINCIPLES;
  }

  return identity;
}

/**
 * Format archetype for display
 */
function formatArchetype(archetype: string): string {
  const labels: Record<string, string> = {
    academic: 'Theoretical/Philosophical',
    pragmatic: 'Pragmatic/Political',
    empirical: 'Empirical/Scientific',
    legal: 'Legal/Rights-based',
    economic: 'Economic/Incentive-focused',
    moral: 'Ethical/Values-based',
  };
  return labels[archetype] ?? archetype;
}

// ============================================================================
// Update Prompt Templates to Use Dynamic Identity
// ============================================================================

/**
 * Build complete system prompt for Pro opening
 */
export function buildProOpeningSystemPrompt(persona: Persona | null): string {
  const identity = buildProIdentity(persona);

  return `${identity}

**PHASE: Opening Statement (2 minutes)**

**Your Task:**
Deliver a compelling opening statement arguing FOR the proposition.

**Requirements:**
1. State your position clearly and confidently (1-2 sentences)
2. Preview 2-3 of your strongest arguments (brief, not fully developed)
3. State your key assumptions explicitly
4. Establish the framework for why this position matters

**HARD RULES:**
- NO rebuttals - Con has not spoken yet (parallel construction)
- NO hedging - Be clear about your FOR position
- NO straw-manning of potential opposing views
- EXPLICIT assumptions - State every premise you rely on
- ACKNOWLEDGE complexity where it exists

**Output Structure:**
1. Clear position statement
2. Preview of main arguments
3. Key assumptions
4. Why this matters (stakes)

**Tone:** Confident, professional, substantive. Focus on substance over style.

**Length:** 300-400 words (approximately 2 minutes speaking time)`;
}

/**
 * Build complete system prompt for Pro constructive (economic)
 */
export function buildProConstructiveEconomicSystemPrompt(persona: Persona | null): string {
  const identity = buildProIdentity(persona);

  return `${identity}

**PHASE: Constructive Arguments - Economic/Technical Round (2 minutes)**

**Your Task:**
Present your economic and/or technical arguments FOR the proposition.

**Requirements:**
1. Focus ONLY on economic and technical aspects
2. Classify each piece of evidence:
   - FACT: Empirical data, statistics, documented outcomes
   - PROJECTION: Forecasts, models, expected trends
   - ANALOGY: Comparisons to similar situations
3. State confidence level for each claim (low/medium/high)
4. List assumptions for each argument

**HARD RULES:**
- Stay on topic: Economic and technical arguments ONLY
- NO rebuttals to Con (building parallel cases)
- NO mixing in ethical/social arguments (save for next round)
- CLASSIFY evidence types explicitly
- ACKNOWLEDGE uncertainties honestly

**Output Structure:**
For each argument:
- Claim statement
- Evidence (with type classification)
- Confidence level
- Assumptions

**Tone:** Analytical, data-driven, precise.

**Length:** 300-400 words (approximately 2 minutes speaking time)`;
}

// Similar functions for other phases...

// ============================================================================
// Backward Compatible Exports
// ============================================================================

// Keep the old constant for backward compatibility during transition
export const PRO_IDENTITY = PRO_BASE_IDENTITY + '\n\n' + PRO_DEFAULT_PRINCIPLES;

// Export all builders
export const PRO_IDENTITY_BUILDERS = {
  buildProIdentity,
  buildProOpeningSystemPrompt,
  buildProConstructiveEconomicSystemPrompt,
  // ... other phase builders
} as const;
```

### Update Con Advocate Prompts

Apply the same pattern to `backend/src/services/agents/prompts/con-advocate-prompts.ts`:

```typescript
import type { Persona } from '../../../types/configuration.js';

const CON_BASE_IDENTITY = `You are the Con Advocate in a structured debate on the ClearSide platform.

Your role is to construct the STRONGEST possible case AGAINST the proposition. You are not trying to "win" but to help the user understand the best arguments opposing this position.`;

const CON_DEFAULT_PRINCIPLES = `**Core Principles:**
- Steel-man your position: Present the strongest, most charitable version
- Explicit assumptions: State every premise underlying your arguments
- Preserve uncertainty: Acknowledge what you don't know
- Professional tone: Neutral, substantive, no rhetoric or emotional appeals
- Treat opposition as intelligent: Never condescend or strawman`;

/**
 * Build the Con Advocate identity section based on persona
 */
export function buildConIdentity(persona: Persona | null): string {
  let identity = CON_BASE_IDENTITY;

  if (persona) {
    identity += `

**Your Persona: ${persona.name}**
*Archetype: ${formatArchetype(persona.archetype)}*

${persona.systemPromptAddition}`;

    identity += `

**Remember:** While arguing from your ${persona.name} perspective, maintain steel-man quality, explicit assumptions, and professional tone.`;
  } else {
    identity += '\n\n' + CON_DEFAULT_PRINCIPLES;
  }

  return identity;
}

// ... similar pattern for all Con prompt builders
```

### Update Agent Classes

Modify `backend/src/services/agents/pro-advocate-agent.ts`:

```typescript
import { buildProOpeningSystemPrompt } from './prompts/pro-advocate-prompts.js';
import { applyConfigurationToPrompt } from './prompts/prompt-modifiers.js';
import type { Persona } from '../../types/configuration.js';
import type { AgentContext } from '../../types/agent-context.js';

// Update AgentContext type to include persona
interface AgentContext {
  // ... existing fields
  persona?: Persona | null;
}

export class ProAdvocateAgent {
  /**
   * Generate opening statement
   */
  async generateOpening(context: AgentContext): Promise<string> {
    // Build system prompt with persona
    const baseSystemPrompt = buildProOpeningSystemPrompt(context.persona ?? null);

    // Apply configuration modifiers (brevity, citations)
    const modifiedPrompt = applyConfigurationToPrompt(baseSystemPrompt, context.configuration);

    const userPrompt = buildProOpeningUserPrompt({
      proposition: context.proposition,
      propositionContext: context.propositionContext,
    });

    return this.generateResponse(modifiedPrompt, userPrompt, context);
  }

  // ... similar updates for other methods
}
```

### Update Debate Orchestrator

Modify `backend/src/services/debate/debate-orchestrator.ts`:

```typescript
import { personaRepository } from '../../db/repositories/persona-repository.js';
import type { Persona } from '../../types/configuration.js';

export class DebateOrchestrator {
  private proPersona: Persona | null = null;
  private conPersona: Persona | null = null;

  async startDebate(propositionText: string, context?: Record<string, unknown>): Promise<void> {
    // Load personas if specified
    if (this.debate.proPersonaId || this.debate.conPersonaId) {
      const { pro, con } = await personaRepository.getDebatePersonas(
        this.debate.proPersonaId,
        this.debate.conPersonaId
      );
      this.proPersona = pro;
      this.conPersona = con;
    }

    // ... rest of start logic
  }

  private buildProContext(): AgentContext {
    return {
      debateId: this.debate.id,
      proposition: this.debate.propositionText,
      phase: this.currentPhase,
      configuration: this.configuration,
      persona: this.proPersona, // Add persona to context
      // ... other fields
    };
  }

  private buildConContext(): AgentContext {
    return {
      debateId: this.debate.id,
      proposition: this.debate.propositionText,
      phase: this.currentPhase,
      configuration: this.configuration,
      persona: this.conPersona, // Add persona to context
      // ... other fields
    };
  }
}
```

---

## Dependencies

**Task Dependencies:**
- PERSONA-002: Persona types and repository
- CONFIG-004: Prompt modifiers (for integration)
- CONFIG-005: Agents using configuration (context pattern)

---

## Validation

### Unit Tests

```typescript
// backend/src/services/agents/prompts/__tests__/identity-builders.test.ts

import { buildProIdentity, buildProOpeningSystemPrompt } from '../pro-advocate-prompts.js';
import { buildConIdentity } from '../con-advocate-prompts.js';
import type { Persona } from '../../../../types/configuration.js';

const mockPersona: Persona = {
  id: 'theorist',
  name: 'The Theorist',
  archetype: 'academic',
  description: 'Theoretical approach',
  argumentationStyle: 'First principles reasoning',
  vocabularyHints: 'axiom, framework',
  focusAreas: ['philosophy', 'theory'],
  rhetoricalPreferences: null,
  systemPromptAddition: 'You approach this debate as a theorist grounded in first principles.',
  avatarEmoji: '🎓',
  colorPrimary: '#6366f1',
  colorSecondary: '#818cf8',
  isSystemPersona: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Pro Identity Builder', () => {
  it('returns default identity when persona is null', () => {
    const identity = buildProIdentity(null);

    expect(identity).toContain('Pro Advocate');
    expect(identity).toContain('STRONGEST possible case FOR');
    expect(identity).toContain('Steel-man');
    expect(identity).not.toContain('Your Persona');
  });

  it('incorporates persona when provided', () => {
    const identity = buildProIdentity(mockPersona);

    expect(identity).toContain('Pro Advocate');
    expect(identity).toContain('Your Persona: The Theorist');
    expect(identity).toContain('first principles');
    expect(identity).toContain('Theoretical/Philosophical');
  });

  it('includes persona systemPromptAddition', () => {
    const identity = buildProIdentity(mockPersona);

    expect(identity).toContain(mockPersona.systemPromptAddition);
  });
});

describe('Con Identity Builder', () => {
  it('returns default identity when persona is null', () => {
    const identity = buildConIdentity(null);

    expect(identity).toContain('Con Advocate');
    expect(identity).toContain('STRONGEST possible case AGAINST');
  });

  it('incorporates persona when provided', () => {
    const identity = buildConIdentity(mockPersona);

    expect(identity).toContain('Con Advocate');
    expect(identity).toContain('Your Persona: The Theorist');
  });
});

describe('Complete System Prompt Builder', () => {
  it('builds full prompt with persona identity', () => {
    const prompt = buildProOpeningSystemPrompt(mockPersona);

    // Has identity
    expect(prompt).toContain('The Theorist');

    // Has phase instructions
    expect(prompt).toContain('Opening Statement');
    expect(prompt).toContain('HARD RULES');
    expect(prompt).toContain('Output Structure');
  });

  it('builds full prompt with default identity', () => {
    const prompt = buildProOpeningSystemPrompt(null);

    expect(prompt).toContain('Core Principles');
    expect(prompt).toContain('Opening Statement');
  });
});
```

### Integration Test

```typescript
describe('Debate with Personas', () => {
  it('uses persona in agent responses', async () => {
    // Create debate with personas
    const debate = await debateRepository.create({
      propositionText: 'AI should be regulated',
      proPersonaId: 'theorist',
      conPersonaId: 'economist',
    });

    // Start orchestrator
    const orchestrator = new DebateOrchestrator(debate, agents);
    await orchestrator.startDebate(debate.propositionText);

    // Verify personas loaded
    expect(orchestrator['proPersona']?.id).toBe('theorist');
    expect(orchestrator['conPersona']?.id).toBe('economist');
  });
});
```

### Definition of Done

- [ ] `buildProIdentity(persona)` function implemented
- [ ] `buildConIdentity(persona)` function implemented
- [ ] All phase-specific prompt builders updated
- [ ] Default behavior preserved when persona is null
- [ ] Persona systemPromptAddition incorporated correctly
- [ ] Agents receive persona in context
- [ ] Orchestrator loads and passes personas
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing

---

## Notes

### Backward Compatibility

- Old `PRO_IDENTITY` constant still exported for any code using it
- Null persona produces identical output to original behavior
- Gradual migration path for existing code

### Prompt Structure

With persona, the identity section becomes:
1. Base identity (Pro/Con advocate role)
2. Persona header with name and archetype
3. Persona's systemPromptAddition
4. Reminder to maintain quality standards

### Testing Approach

Test both:
1. Identity builder functions in isolation
2. Full prompt generation with configuration
3. Integration with actual agent calls

---

**Estimated Time:** 8 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
