# CONFIG-005: Update Agents to Use Configuration

**Priority:** P0
**Estimate:** M
**Labels:** `configuration`, `agents`, `backend`
**Status:** 🟢 TO DO

---

## Context

Update the Pro, Con, and Moderator agents to use per-debate configuration settings when making LLM calls. This includes applying prompt modifiers and using configuration-specified temperature and max tokens.

**References:**
- [Pro Advocate Agent](../../../backend/src/services/agents/pro-advocate-agent.ts) - Agent implementation
- [Debate Orchestrator](../../../backend/src/services/debate/debate-orchestrator.ts) - Where config is loaded
- [Prompt Modifiers](./CONFIG-004.md) - Modifier functions

---

## Requirements

### Acceptance Criteria

- [ ] Update agent context interface to include configuration
- [ ] Pro agent uses config temperature and maxTokens in LLM calls
- [ ] Con agent uses config temperature and maxTokens in LLM calls
- [ ] Moderator agent uses config (with possibly different settings)
- [ ] Prompt modifiers applied before LLM calls
- [ ] Fallback to defaults if no config provided (backward compatible)

---

## Implementation Guide

### Update Agent Context

First, update the context type that's passed to agents. In `backend/src/types/orchestrator.ts` or create `backend/src/types/agent-context.ts`:

```typescript
import type { DebateConfiguration } from './configuration.js';

/**
 * Context passed to agents during response generation
 */
export interface AgentContext {
  /** The debate ID */
  debateId: string;

  /** The proposition being debated */
  proposition: string;

  /** Normalized/processed proposition (if available) */
  normalizedProposition?: string;

  /** Additional proposition context */
  propositionContext?: Record<string, unknown>;

  /** Current debate phase */
  phase: DebatePhase;

  /** Previous utterances for context */
  previousUtterances?: string;

  /** Opponent's arguments (for rebuttal/cross-exam) */
  opponentArguments?: string;

  /** User intervention content (if responding to intervention) */
  interventionContent?: string;

  /** Debate configuration settings */
  configuration: DebateConfiguration;
}
```

### Update Pro Advocate Agent

Modify `backend/src/services/agents/pro-advocate-agent.ts`:

```typescript
import { applyConfigurationToPrompt } from './prompts/prompt-modifiers.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';
import type { DebateConfiguration } from '../../types/configuration.js';
import type { AgentContext } from '../../types/agent-context.js';

export class ProAdvocateAgent {
  private llmClient: LLMClient;
  private provider: string;
  private modelName: string;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
    this.provider = llmConfig.defaultProvider;
    this.modelName = llmConfig.defaultModels[this.provider];
  }

  /**
   * Generate a response with configuration applied
   */
  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext
  ): Promise<string> {
    // Get configuration with fallback to defaults
    const config = context.configuration ?? DEFAULT_CONFIGURATION;

    // Apply prompt modifiers based on configuration
    const modifiedSystemPrompt = applyConfigurationToPrompt(systemPrompt, config);

    // Make LLM call with configuration-specific settings
    const response = await this.llmClient.chat({
      provider: this.provider,
      model: this.modelName,
      messages: [
        { role: 'system', content: modifiedSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.llmSettings.temperature,
      maxTokens: config.llmSettings.maxTokensPerResponse,
    });

    return response.content;
  }

  /**
   * Generate opening statement
   */
  async generateOpening(context: AgentContext): Promise<string> {
    const systemPrompt = ProOpeningPrompt.template;
    const userPrompt = buildProOpeningUserPrompt({
      proposition: context.proposition,
      propositionContext: context.propositionContext,
    });

    return this.generateResponse(systemPrompt, userPrompt, context);
  }

  /**
   * Generate constructive argument
   */
  async generateConstructive(
    context: AgentContext,
    round: 'economic' | 'ethical' | 'practical'
  ): Promise<string> {
    const promptMap = {
      economic: ProConstructiveEconomicPrompt,
      ethical: ProConstructiveEthicalPrompt,
      practical: ProConstructivePracticalPrompt,
    };

    const systemPrompt = promptMap[round].template;
    const userPrompt = buildProConstructiveUserPrompt({
      proposition: context.proposition,
      previousUtterances: context.previousUtterances,
      constructiveRound: round,
    });

    return this.generateResponse(systemPrompt, userPrompt, context);
  }

  // ... similar updates for crossExam, rebuttal, closing methods
}
```

### Update Con Advocate Agent

Apply the same pattern to `backend/src/services/agents/con-advocate-agent.ts`:

```typescript
import { applyConfigurationToPrompt } from './prompts/prompt-modifiers.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';

export class ConAdvocateAgent {
  // ... same structure as ProAdvocateAgent

  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext
  ): Promise<string> {
    const config = context.configuration ?? DEFAULT_CONFIGURATION;
    const modifiedSystemPrompt = applyConfigurationToPrompt(systemPrompt, config);

    const response = await this.llmClient.chat({
      provider: this.provider,
      model: this.modelName,
      messages: [
        { role: 'system', content: modifiedSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.llmSettings.temperature,
      maxTokens: config.llmSettings.maxTokensPerResponse,
    });

    return response.content;
  }
}
```

### Update Moderator Agent

The moderator may have slightly different settings (e.g., always more balanced regardless of config):

```typescript
import { applyConfigurationToPrompt } from './prompts/prompt-modifiers.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';

export class ModeratorAgent {
  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext
  ): Promise<string> {
    const config = context.configuration ?? DEFAULT_CONFIGURATION;

    // Moderator uses slightly different settings:
    // - Always balanced brevity (level 3) for neutrality
    // - Lower temperature for consistency
    const moderatorConfig = {
      ...config,
      brevityLevel: 3 as const, // Moderator always balanced
      llmSettings: {
        ...config.llmSettings,
        temperature: Math.min(config.llmSettings.temperature, 0.6), // Cap at 0.6
      },
    };

    const modifiedSystemPrompt = applyConfigurationToPrompt(systemPrompt, moderatorConfig);

    const response = await this.llmClient.chat({
      provider: this.provider,
      model: this.modelName,
      messages: [
        { role: 'system', content: modifiedSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: moderatorConfig.llmSettings.temperature,
      maxTokens: moderatorConfig.llmSettings.maxTokensPerResponse,
    });

    return response.content;
  }
}
```

### Update Debate Orchestrator

Update `backend/src/services/debate/debate-orchestrator.ts` to build and pass configuration:

```typescript
import type { DebateConfiguration } from '../../types/configuration.js';

export class DebateOrchestrator {
  private debate: Debate;
  private configuration: DebateConfiguration;

  constructor(debate: Debate, agents: AgentSet) {
    this.debate = debate;

    // Build configuration from debate record
    this.configuration = {
      presetMode: debate.presetMode,
      brevityLevel: debate.brevityLevel as BrevityLevel,
      llmSettings: {
        temperature: debate.llmTemperature,
        maxTokensPerResponse: debate.maxTokensPerResponse,
      },
      requireCitations: debate.requireCitations,
    };
  }

  private buildAgentContext(): AgentContext {
    return {
      debateId: this.debate.id,
      proposition: this.debate.propositionText,
      propositionContext: this.debate.propositionContext,
      phase: this.currentPhase,
      previousUtterances: this.getRecentUtterances(),
      configuration: this.configuration,
    };
  }

  async executeProOpening(): Promise<string> {
    const context = this.buildAgentContext();
    return this.agents.pro.generateOpening(context);
  }

  // ... similar for all phase executions
}
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-002: Configuration types
- CONFIG-003: Debate repository (to read config from debate)
- CONFIG-004: Prompt modifiers

---

## Validation

### Unit Tests

```typescript
// backend/src/services/agents/__tests__/pro-advocate-agent.test.ts

import { ProAdvocateAgent } from '../pro-advocate-agent.js';
import { DEFAULT_CONFIGURATION } from '../../../types/configuration.js';

describe('ProAdvocateAgent with Configuration', () => {
  let agent: ProAdvocateAgent;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = {
      chat: jest.fn().mockResolvedValue({ content: 'Response' }),
    };
    agent = new ProAdvocateAgent(mockLLMClient);
  });

  it('uses configuration temperature', async () => {
    const context = {
      debateId: '123',
      proposition: 'Test',
      phase: 'opening_statements',
      configuration: {
        ...DEFAULT_CONFIGURATION,
        llmSettings: { temperature: 0.5, maxTokensPerResponse: 512 },
      },
    };

    await agent.generateOpening(context);

    expect(mockLLMClient.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.5,
        maxTokens: 512,
      })
    );
  });

  it('applies prompt modifiers', async () => {
    const context = {
      debateId: '123',
      proposition: 'Test',
      phase: 'opening_statements',
      configuration: {
        ...DEFAULT_CONFIGURATION,
        requireCitations: true,
      },
    };

    await agent.generateOpening(context);

    const callArgs = mockLLMClient.chat.mock.calls[0][0];
    const systemPrompt = callArgs.messages[0].content;

    expect(systemPrompt).toContain('MANDATORY');
    expect(systemPrompt).toContain('[FACT:');
  });

  it('falls back to defaults when no config', async () => {
    const context = {
      debateId: '123',
      proposition: 'Test',
      phase: 'opening_statements',
      configuration: undefined,
    };

    await agent.generateOpening(context);

    expect(mockLLMClient.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7, // Default
        maxTokens: 1024, // Default
      })
    );
  });
});
```

### Integration Test

```typescript
// Test full flow with orchestrator
describe('Orchestrator with Configuration', () => {
  it('passes configuration to all agents', async () => {
    const debate = await debateRepository.create({
      propositionText: 'Test proposition',
      presetMode: 'research',
      brevityLevel: 2,
      llmTemperature: 0.6,
      maxTokensPerResponse: 2048,
      requireCitations: true,
    });

    const orchestrator = new DebateOrchestrator(debate, agents);

    // Verify configuration is built correctly
    const context = orchestrator['buildAgentContext']();

    expect(context.configuration.presetMode).toBe('research');
    expect(context.configuration.requireCitations).toBe(true);
  });
});
```

### Definition of Done

- [ ] AgentContext type includes configuration
- [ ] ProAdvocateAgent uses configuration for LLM calls
- [ ] ConAdvocateAgent uses configuration for LLM calls
- [ ] ModeratorAgent uses configuration (with adjustments)
- [ ] DebateOrchestrator builds and passes configuration
- [ ] Prompt modifiers applied to all agent prompts
- [ ] Backward compatible (defaults used when no config)
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing

---

## Notes

### Moderator Special Handling

The moderator has special handling because:
1. Should always remain neutral (balanced brevity)
2. Should be more consistent (lower temperature cap)
3. Citation requirements still apply

### Performance Consideration

Prompt modification happens on every LLM call. The `applyConfigurationToPrompt` function is designed to be fast (string operations only).

---

**Estimated Time:** 4 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
