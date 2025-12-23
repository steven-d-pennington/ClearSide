# AGENT-001: Implement Orchestrator Agent (Proposition Normalization)

**Priority:** P0
**Estimate:** M
**Labels:** `agent`, `backend`, `llm`
**Status:** 🟢 TO DO

---

## Context

The Orchestrator Agent is the first agent in the debate pipeline. Its sole responsibility is to normalize user input into a clear, debatable proposition with structured context. This agent outputs ONLY the `proposition` section of the transcript schema and must not generate arguments or take sides.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Orchestrator Prompt Contract
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-101, AGT-101
- [JSON Schema](../../../docs/04_json-schema.md) - Proposition section specification

---

## Requirements

### Acceptance Criteria

- [ ] Create Orchestrator Agent class with normalize() method
- [ ] Implement prompt template for proposition normalization
- [ ] Call LLM API (Claude Sonnet 4.5 or GPT-4)
- [ ] Parse and validate LLM response
- [ ] Extract normalized proposition text
- [ ] Extract structured context (geography, timeframe, domain)
- [ ] Validate output conforms to schema
- [ ] Handle edge cases (vague input, multiple questions, statements vs questions)
- [ ] Add retry logic for failed API calls
- [ ] Log normalization results
- [ ] Write unit tests with various input types
- [ ] Test against flagship demo proposition

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-101**: System SHALL accept user input question or claim
- **FR-102**: System SHALL normalize proposition into neutral, debatable form
- **AGT-101**: Orchestrator Agent SHALL output proposition section only
- **AGT-102**: Orchestrator Agent SHALL NOT add arguments or opinions
- **AGT-103**: Orchestrator Agent SHALL extract context metadata

---

## Implementation Guide

### Orchestrator Agent Class

```typescript
// src/services/agents/orchestrator-agent.ts
import { LLMClient, LLMRequest, LLMResponse } from '../llm/client';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';

export interface PropositionContext {
  geography?: string;
  timeframe?: string;
  domain?: string;
}

export interface NormalizedProposition {
  raw_input: string;
  normalized_question: string;
  context: PropositionContext;
  stakeholders: string[];
  complexity_level: 'low' | 'medium' | 'high';
  debate_framing: string;
}

export class OrchestratorAgent {
  private llmClient: LLMClient;
  private modelName: string = 'claude-sonnet-4-5';

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async normalize(
    rawInput: string,
    userContext?: PropositionContext
  ): Promise<NormalizedProposition> {
    loggers.info('[OrchestratorAgent] Starting normalization', { rawInput });

    try {
      // Build prompt
      const prompt = this.buildNormalizationPrompt(rawInput, userContext);

      // Call LLM
      const llmRequest: LLMRequest = {
        provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
        model: this.modelName,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for consistency
        maxTokens: 1000
      };

      const response = await this.llmClient.complete(llmRequest);

      // Parse response
      const normalized = this.parseNormalizationResponse(response.content, rawInput);

      // Validate schema
      const validation = schemaValidator.validateProposition(normalized);
      if (!validation.valid) {
        throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
      }

      loggers.info('[OrchestratorAgent] Normalization complete', {
        normalized_question: normalized.normalized_question,
        complexity: normalized.complexity_level
      });

      return normalized;
    } catch (error) {
      loggers.error('[OrchestratorAgent] Normalization failed', error as Error);
      throw error;
    }
  }

  private getSystemPrompt(): string {
    return `You are the Orchestrator Agent for ClearSide, a structured reasoning platform.

Your SOLE responsibility is to normalize user input into a clear, debatable proposition.

HARD RULES:
1. Output ONLY the proposition section - NO arguments, opinions, or analysis
2. Convert statements into neutral questions suitable for debate
3. Extract context (geography, timeframe, domain) if mentioned or inferrable
4. Identify key stakeholders affected by the proposition
5. Assess complexity level: low (binary choice), medium (multiple factors), high (systemic/philosophical)
6. Frame the debate appropriately (policy, ethical, technical, practical)

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "normalized_question": "Clear, neutral, debatable question",
  "context": {
    "geography": "Location if relevant (e.g., 'United States', 'Global')",
    "timeframe": "Time scope if relevant (e.g., '2025-2030', 'Next decade')",
    "domain": "Subject area (e.g., 'technology policy', 'healthcare', 'education')"
  },
  "stakeholders": ["Group 1", "Group 2", "Group 3"],
  "complexity_level": "low|medium|high",
  "debate_framing": "policy|ethical|technical|practical|philosophical"
}

QUALITY STANDARDS:
- Normalized question must be neutral (no leading language)
- Must be answerable with FOR/AGAINST positions
- Must be specific enough to debate meaningfully
- Avoid yes/no questions; prefer "Should X do Y?" format
- Stakeholders should be concrete groups, not abstractions`;
  }

  private buildNormalizationPrompt(
    rawInput: string,
    userContext?: PropositionContext
  ): string {
    let prompt = `Normalize this user input into a debatable proposition:\n\n"${rawInput}"`;

    if (userContext) {
      prompt += '\n\nUser-provided context:';
      if (userContext.geography) prompt += `\n- Geography: ${userContext.geography}`;
      if (userContext.timeframe) prompt += `\n- Timeframe: ${userContext.timeframe}`;
      if (userContext.domain) prompt += `\n- Domain: ${userContext.domain}`;
    }

    prompt += '\n\nReturn the normalized proposition as valid JSON following the schema.';

    return prompt;
  }

  private parseNormalizationResponse(
    llmOutput: string,
    rawInput: string
  ): NormalizedProposition {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = llmOutput.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/\n?```$/g, '');
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```\n?/g, '').replace(/\n?```$/g, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);

      return {
        raw_input: rawInput,
        normalized_question: parsed.normalized_question,
        context: parsed.context || {},
        stakeholders: parsed.stakeholders || [],
        complexity_level: parsed.complexity_level || 'medium',
        debate_framing: parsed.debate_framing || 'policy'
      };
    } catch (error) {
      loggers.error('[OrchestratorAgent] JSON parse failed', error as Error, {
        llmOutput: llmOutput.substring(0, 500)
      });
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  async validateNeutrality(normalizedQuestion: string): Promise<boolean> {
    // Simple heuristics to detect bias
    const biasedPhrases = [
      'obviously',
      'clearly',
      'of course',
      'everyone knows',
      'it\'s obvious that',
      'undeniably',
      'without question'
    ];

    const lowercaseQuestion = normalizedQuestion.toLowerCase();

    for (const phrase of biasedPhrases) {
      if (lowercaseQuestion.includes(phrase)) {
        loggers.warn('[OrchestratorAgent] Biased language detected', {
          phrase,
          question: normalizedQuestion
        });
        return false;
      }
    }

    return true;
  }
}
```

### Example Normalizations

```typescript
// tests/orchestrator-agent.examples.ts

// Example 1: Statement → Question
const input1 = "AI data centers are consuming too much energy";
const expected1 = {
  normalized_question: "Should new AI data centers be subject to stricter energy consumption regulations?",
  context: {
    geography: "Global",
    timeframe: "2025-2030",
    domain: "technology policy"
  },
  stakeholders: ["Tech companies", "Energy providers", "Environmental groups", "Regulators"],
  complexity_level: "high",
  debate_framing: "policy"
};

// Example 2: Vague → Specific
const input2 = "Remote work";
const expected2 = {
  normalized_question: "Should remote work be the default option for knowledge workers in the technology sector?",
  context: {
    geography: "United States",
    timeframe: "2025 onwards",
    domain: "workplace policy"
  },
  stakeholders: ["Employees", "Employers", "Commercial real estate", "Local economies"],
  complexity_level: "medium",
  debate_framing: "practical"
};

// Example 3: Already clear question
const input3 = "Should the United States implement universal basic income?";
const expected3 = {
  normalized_question: "Should the United States implement a universal basic income program?",
  context: {
    geography: "United States",
    timeframe: "Near-term policy consideration",
    domain: "economic policy"
  },
  stakeholders: ["Low-income households", "Taxpayers", "Government", "Employers"],
  complexity_level: "high",
  debate_framing: "policy"
};

// Example 4: Multiple questions → Primary focus
const input4 = "Should we ban social media for kids under 13? What about 16?";
const expected4 = {
  normalized_question: "Should social media access be restricted for users under 16 years old?",
  context: {
    geography: "United States",
    timeframe: "Current policy debate",
    domain: "technology regulation"
  },
  stakeholders: ["Minors", "Parents", "Social media companies", "Mental health professionals"],
  complexity_level: "medium",
  debate_framing: "policy"
};
```

### Prompt Template

```typescript
// src/services/agents/prompts/orchestrator-prompt.ts

export const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Orchestrator Agent for ClearSide, a structured reasoning platform.

Your SOLE responsibility is to normalize user input into a clear, debatable proposition.

HARD RULES:
1. Output ONLY the proposition section - NO arguments, opinions, or analysis
2. Convert statements into neutral questions suitable for debate
3. Extract context (geography, timeframe, domain) if mentioned or inferrable
4. Identify key stakeholders affected by the proposition
5. Assess complexity level: low (binary choice), medium (multiple factors), high (systemic/philosophical)
6. Frame the debate appropriately (policy, ethical, technical, practical)

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "normalized_question": "Clear, neutral, debatable question",
  "context": {
    "geography": "Location if relevant (e.g., 'United States', 'Global')",
    "timeframe": "Time scope if relevant (e.g., '2025-2030', 'Next decade')",
    "domain": "Subject area (e.g., 'technology policy', 'healthcare', 'education')"
  },
  "stakeholders": ["Group 1", "Group 2", "Group 3"],
  "complexity_level": "low|medium|high",
  "debate_framing": "policy|ethical|technical|practical|philosophical"
}

QUALITY STANDARDS:
- Normalized question must be neutral (no leading language)
- Must be answerable with FOR/AGAINST positions
- Must be specific enough to debate meaningfully
- Avoid yes/no questions; prefer "Should X do Y?" format
- Stakeholders should be concrete groups, not abstractions

EXAMPLES:

Input: "AI is dangerous and should be banned"
Output:
{
  "normalized_question": "Should artificial intelligence development be subject to a moratorium or ban?",
  "context": {
    "geography": "Global",
    "timeframe": "Near-term policy consideration",
    "domain": "technology regulation"
  },
  "stakeholders": ["AI researchers", "Technology companies", "Regulators", "General public"],
  "complexity_level": "high",
  "debate_framing": "policy"
}

Input: "College is too expensive"
Output:
{
  "normalized_question": "Should the United States government provide free college tuition for all students?",
  "context": {
    "geography": "United States",
    "timeframe": "Next decade",
    "domain": "education policy"
  },
  "stakeholders": ["Students", "Families", "Taxpayers", "Universities", "Employers"],
  "complexity_level": "high",
  "debate_framing": "policy"
}

Input: "Is eating meat ethical?"
Output:
{
  "normalized_question": "Is consuming animal products morally justifiable in modern society?",
  "context": {
    "geography": "Global",
    "timeframe": "Contemporary ethical debate",
    "domain": "ethics"
  },
  "stakeholders": ["Consumers", "Animals", "Farmers", "Environmental advocates"],
  "complexity_level": "high",
  "debate_framing": "ethical"
}`;

export function buildOrchestratorPrompt(
  rawInput: string,
  userContext?: PropositionContext
): string {
  let prompt = `Normalize this user input into a debatable proposition:\n\n"${rawInput}"`;

  if (userContext) {
    prompt += '\n\nUser-provided context:';
    if (userContext.geography) prompt += `\n- Geography: ${userContext.geography}`;
    if (userContext.timeframe) prompt += `\n- Timeframe: ${userContext.timeframe}`;
    if (userContext.domain) prompt += `\n- Domain: ${userContext.domain}`;
  }

  prompt += '\n\nReturn the normalized proposition as valid JSON following the schema.';

  return prompt;
}
```

### Edge Case Handling

```typescript
// src/services/agents/orchestrator-edge-cases.ts

export class OrchestratorEdgeCaseHandler {
  static detectMultipleQuestions(input: string): boolean {
    // Count question marks
    const questionCount = (input.match(/\?/g) || []).length;
    return questionCount > 1;
  }

  static detectStatement(input: string): boolean {
    // Check if input is a statement (no question mark)
    return !input.includes('?');
  }

  static detectVagueInput(input: string): boolean {
    // Check if input is too short or lacks specificity
    const words = input.trim().split(/\s+/);
    return words.length < 3;
  }

  static detectPolarizingLanguage(input: string): string[] {
    const polarizingTerms = [
      'stupid', 'insane', 'ridiculous', 'absurd', 'evil',
      'perfect', 'flawless', 'always', 'never', 'everyone'
    ];

    const detected: string[] = [];
    const lowercaseInput = input.toLowerCase();

    for (const term of polarizingTerms) {
      if (lowercaseInput.includes(term)) {
        detected.push(term);
      }
    }

    return detected;
  }

  static generateWarnings(input: string): string[] {
    const warnings: string[] = [];

    if (this.detectMultipleQuestions(input)) {
      warnings.push('Input contains multiple questions. Agent will focus on primary question.');
    }

    if (this.detectVagueInput(input)) {
      warnings.push('Input is very short. Agent may infer additional context.');
    }

    const polarizingTerms = this.detectPolarizingLanguage(input);
    if (polarizingTerms.length > 0) {
      warnings.push(`Input contains polarizing language: ${polarizingTerms.join(', ')}. Agent will neutralize.`);
    }

    return warnings;
  }
}
```

---

## Dependencies

- **INFRA-001**: LLM API Integration Layer
- **INFRA-004**: JSON Schema Validation

---

## Validation

### Unit Tests

```typescript
// tests/orchestrator-agent.test.ts
import { OrchestratorAgent } from '../src/services/agents/orchestrator-agent';
import { LLMClient } from '../src/services/llm/client';

describe('OrchestratorAgent', () => {
  let agent: OrchestratorAgent;
  let mockLLMClient: jest.Mocked<LLMClient>;

  beforeEach(() => {
    mockLLMClient = {
      complete: jest.fn()
    } as any;

    agent = new OrchestratorAgent(mockLLMClient);
  });

  it('should normalize a statement into a question', async () => {
    const rawInput = 'AI data centers consume too much energy';

    mockLLMClient.complete.mockResolvedValue({
      content: JSON.stringify({
        normalized_question: 'Should AI data centers be subject to stricter energy consumption regulations?',
        context: {
          geography: 'Global',
          timeframe: '2025-2030',
          domain: 'technology policy'
        },
        stakeholders: ['Tech companies', 'Regulators', 'Environmental groups'],
        complexity_level: 'high',
        debate_framing: 'policy'
      }),
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: 'stop'
    });

    const result = await agent.normalize(rawInput);

    expect(result.normalized_question).toContain('Should');
    expect(result.stakeholders.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(result.complexity_level);
  });

  it('should extract user-provided context', async () => {
    const rawInput = 'Should remote work be mandatory?';
    const userContext = {
      geography: 'United States',
      timeframe: '2025',
      domain: 'workplace policy'
    };

    mockLLMClient.complete.mockResolvedValue({
      content: JSON.stringify({
        normalized_question: 'Should remote work be the default option for knowledge workers in the United States?',
        context: userContext,
        stakeholders: ['Employees', 'Employers'],
        complexity_level: 'medium',
        debate_framing: 'practical'
      }),
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: 'stop'
    });

    const result = await agent.normalize(rawInput, userContext);

    expect(result.context.geography).toBe('United States');
    expect(result.context.timeframe).toBe('2025');
  });

  it('should handle already-clear questions', async () => {
    const rawInput = 'Should the US implement universal healthcare?';

    mockLLMClient.complete.mockResolvedValue({
      content: JSON.stringify({
        normalized_question: 'Should the United States implement a universal healthcare system?',
        context: {
          geography: 'United States',
          domain: 'healthcare policy'
        },
        stakeholders: ['Patients', 'Healthcare providers', 'Insurance companies', 'Government'],
        complexity_level: 'high',
        debate_framing: 'policy'
      }),
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: 'stop'
    });

    const result = await agent.normalize(rawInput);

    expect(result.normalized_question).toBeTruthy();
  });

  it('should detect neutrality violations', async () => {
    const biasedQuestion = 'Obviously, AI is dangerous and should be banned, right?';

    const isNeutral = await agent.validateNeutrality(biasedQuestion);

    expect(isNeutral).toBe(false);
  });

  it('should retry on LLM API failure', async () => {
    const rawInput = 'Test question';

    mockLLMClient.complete
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({
        content: JSON.stringify({
          normalized_question: 'Should X do Y?',
          context: {},
          stakeholders: ['Group A'],
          complexity_level: 'medium',
          debate_framing: 'policy'
        }),
        model: 'claude-sonnet-4-5',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop'
      });

    // Should not throw due to retry
    await expect(agent.normalize(rawInput)).resolves.not.toThrow();
  });
});
```

### Integration Test

```typescript
// tests/orchestrator-agent.integration.test.ts
import { OrchestratorAgent } from '../src/services/agents/orchestrator-agent';
import { LLMClient } from '../src/services/llm/client';

describe('OrchestratorAgent Integration', () => {
  let agent: OrchestratorAgent;

  beforeAll(() => {
    // Use real LLM client with API key from env
    const llmClient = new LLMClient();
    agent = new OrchestratorAgent(llmClient);
  });

  it('should normalize flagship demo proposition', async () => {
    const rawInput = 'Should there be a moratorium on AI data centers?';

    const result = await agent.normalize(rawInput);

    expect(result.normalized_question).toBeTruthy();
    expect(result.stakeholders.length).toBeGreaterThanOrEqual(3);
    expect(result.complexity_level).toBe('high');
    expect(result.debate_framing).toBe('policy');
  }, 30000); // 30s timeout for real API call
});
```

### Definition of Done

- [ ] OrchestratorAgent class implemented
- [ ] Normalization prompt template created
- [ ] LLM integration working with Claude/OpenAI
- [ ] JSON parsing handles markdown code blocks
- [ ] Schema validation enforced
- [ ] Edge cases handled (vague input, multiple questions, statements)
- [ ] Neutrality validation implemented
- [ ] Unit tests pass with >90% coverage
- [ ] Integration test with real LLM API passes
- [ ] Flagship demo proposition normalizes correctly
- [ ] Logs all normalization attempts
- [ ] Error handling with retry logic

---

## Notes

- **Model Choice**: Claude Sonnet 4.5 recommended for complex reasoning; GPT-4 acceptable fallback
- **Temperature**: Use 0.3 for consistency (not creative writing)
- **Token Budget**: Normalization should use <1000 completion tokens
- **Caching**: Consider caching normalizations for identical raw input
- **Monitoring**: Track normalization quality manually in first 100 debates
- **Bias Detection**: Current heuristics are simple; consider more sophisticated NLP later
- **Multi-language**: Currently English-only; internationalization in Phase 3

---

**Estimated Time:** 6-8 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
