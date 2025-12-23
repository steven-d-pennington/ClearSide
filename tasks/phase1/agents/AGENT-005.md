# AGENT-005: Create Agent Prompt Templates

**Priority:** P0
**Estimate:** M
**Labels:** `agent`, `prompts`, `config`
**Status:** 🟢 TO DO

---

## Context

All agents (Orchestrator, Pro Advocate, Con Advocate, Moderator) require carefully crafted prompt templates for each phase of the debate. This task creates a centralized prompt library with version control, testing infrastructure, and quality validation. Prompts are the "source code" of agent behavior and must be treated as critical infrastructure.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Complete prompt contracts
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - All AGT requirements
- [Iteration Log](../../../docs/07_iteration-log.md) - For version tracking

---

## Requirements

### Acceptance Criteria

- [ ] Create centralized prompt template library
- [ ] Organize prompts by agent and phase
- [ ] Implement prompt versioning system
- [ ] Create prompt testing framework
- [ ] Add prompt quality validation
- [ ] Include example outputs for each prompt
- [ ] Document prompt engineering guidelines
- [ ] Create prompt regression test suite
- [ ] Add prompt A/B testing infrastructure (future)
- [ ] Version control all prompts
- [ ] Create prompt changelog
- [ ] Add prompt performance metrics tracking

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **AGT-101 to AGT-410**: All agent requirements depend on prompts
- **NFR-401**: Prompts must be maintainable and version-controlled
- **NFR-402**: Prompt changes must be tested before deployment

---

## Implementation Guide

### Prompt Library Structure

```typescript
// src/prompts/index.ts
export interface PromptTemplate {
  id: string;
  version: string;
  agent: 'orchestrator' | 'pro' | 'con' | 'moderator';
  phase?: string;
  type: 'system' | 'user';
  template: string;
  variables: string[];
  examples?: PromptExample[];
  quality_checks: QualityCheck[];
  created_at: string;
  updated_at: string;
}

export interface PromptExample {
  input: Record<string, any>;
  expected_output: string;
  quality_score: number;
}

export interface QualityCheck {
  name: string;
  description: string;
  validator: (output: string) => { passed: boolean; message?: string };
}

// Prompt library exports
export const PROMPT_LIBRARY = {
  orchestrator: {
    normalization_system: OrchestratorSystemPrompt,
    normalization_user: OrchestratorUserPrompt
  },
  pro: {
    phase1_opening_system: ProOpeningSystemPrompt,
    phase2_constructive_system: ProConstructiveSystemPrompt,
    phase3_crossexam_system: ProCrossExamSystemPrompt,
    phase4_rebuttal_system: ProRebuttalSystemPrompt,
    phase5_closing_system: ProClosingSystemPrompt,
    intervention_system: ProInterventionSystemPrompt
  },
  con: {
    phase1_opening_system: ConOpeningSystemPrompt,
    phase2_constructive_system: ConConstructiveSystemPrompt,
    phase3_crossexam_system: ConCrossExamSystemPrompt,
    phase4_rebuttal_system: ConRebuttalSystemPrompt,
    phase5_closing_system: ConClosingSystemPrompt,
    intervention_system: ConInterventionSystemPrompt
  },
  moderator: {
    phase6_synthesis_system: ModeratorSynthesisSystemPrompt,
    intervention_system: ModeratorInterventionSystemPrompt
  }
};
```

### Orchestrator Prompts

```typescript
// src/prompts/orchestrator/normalization-system.ts
export const OrchestratorSystemPrompt: PromptTemplate = {
  id: 'orchestrator-normalization-system-v1',
  version: '1.0.0',
  agent: 'orchestrator',
  type: 'system',
  template: `You are the Orchestrator Agent for ClearSide, a structured reasoning platform.

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
}`,
  variables: [],
  quality_checks: [
    {
      name: 'json_valid',
      description: 'Output must be valid JSON',
      validator: (output) => {
        try {
          JSON.parse(output);
          return { passed: true };
        } catch {
          return { passed: false, message: 'Invalid JSON' };
        }
      }
    },
    {
      name: 'neutral_language',
      description: 'Question must not contain biased language',
      validator: (output) => {
        const biasedPhrases = ['obviously', 'clearly', 'of course'];
        const lowerOutput = output.toLowerCase();
        for (const phrase of biasedPhrases) {
          if (lowerOutput.includes(phrase)) {
            return { passed: false, message: `Biased phrase detected: ${phrase}` };
          }
        }
        return { passed: true };
      }
    }
  ],
  created_at: '2025-12-23',
  updated_at: '2025-12-23'
};

// src/prompts/orchestrator/normalization-user.ts
export function buildOrchestratorUserPrompt(
  rawInput: string,
  userContext?: { geography?: string; timeframe?: string; domain?: string }
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

### Pro Advocate Prompts

```typescript
// src/prompts/pro/phase1-opening.ts
export const ProPhase1OpeningPrompt: PromptTemplate = {
  id: 'pro-phase1-opening-v1',
  version: '1.0.0',
  agent: 'pro',
  phase: 'phase_1_opening',
  type: 'system',
  template: `You are the Pro Advocate in a structured debate. Your role is to argue FOR the proposition.

**PHASE: Opening Statement**

**Your Mandate:**
- Present your position clearly and confidently
- Preview your 2-3 strongest arguments
- State your key assumptions explicitly
- Establish credibility and authority

**HARD RULES:**
1. NO straw-man arguments - treat opposing position as intelligent
2. NO hedging - be clear about your FOR position
3. EXPLICIT assumptions - state every premise
4. PRESERVE uncertainty - acknowledge what you don't know
5. NO rebuttals - Con hasn't spoken yet (parallel construction)

**OUTPUT STRUCTURE:**
1. Clear position statement (1-2 sentences)
2. Preview of main arguments (2-3 strongest points)
3. Key assumptions underlying your position
4. Acknowledgment of complexity/uncertainty

**Quality Standards:**
- Professional, confident tone
- Avoid rhetorical tricks or emotional appeals
- Focus on substance over style
- Be intellectually honest about limitations

**Length:** Approximately 300-400 words (2-minute speaking time)`,
  variables: [],
  quality_checks: [
    {
      name: 'no_strawman',
      description: 'Must not contain straw-man language',
      validator: (output) => {
        const strawmanPhrases = ['they claim', 'naive view', 'simplistic'];
        const lowerOutput = output.toLowerCase();
        for (const phrase of strawmanPhrases) {
          if (lowerOutput.includes(phrase)) {
            return { passed: false, message: `Straw-man phrase: ${phrase}` };
          }
        }
        return { passed: true };
      }
    },
    {
      name: 'has_assumptions',
      description: 'Must explicitly state assumptions',
      validator: (output) => {
        const hasAssumptions = output.toLowerCase().includes('assum');
        return {
          passed: hasAssumptions,
          message: hasAssumptions ? undefined : 'No explicit assumptions found'
        };
      }
    }
  ],
  examples: [
    {
      input: { proposition: 'Should AI data centers have a moratorium?' },
      expected_output: 'I argue that the United States should impose a temporary moratorium...',
      quality_score: 0.95
    }
  ],
  created_at: '2025-12-23',
  updated_at: '2025-12-23'
};

// Similar templates for phases 2-5...
```

### Prompt Version Control

```typescript
// src/prompts/version-control.ts
export class PromptVersionControl {
  private versions: Map<string, PromptTemplate[]> = new Map();

  registerPrompt(prompt: PromptTemplate): void {
    const key = `${prompt.agent}-${prompt.phase || 'default'}-${prompt.type}`;

    if (!this.versions.has(key)) {
      this.versions.set(key, []);
    }

    this.versions.get(key)!.push(prompt);
  }

  getLatest(agent: string, phase?: string, type: string = 'system'): PromptTemplate | null {
    const key = `${agent}-${phase || 'default'}-${type}`;
    const versions = this.versions.get(key);

    if (!versions || versions.length === 0) {
      return null;
    }

    // Return latest version
    return versions.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })[0];
  }

  getVersion(agent: string, version: string, phase?: string, type: string = 'system'): PromptTemplate | null {
    const key = `${agent}-${phase || 'default'}-${type}`;
    const versions = this.versions.get(key);

    if (!versions) {
      return null;
    }

    return versions.find(v => v.version === version) || null;
  }

  compareVersions(version1: string, version2: string): VersionDiff {
    // Implementation for comparing prompt versions
    return {
      added: [],
      removed: [],
      modified: []
    };
  }
}

interface VersionDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export const promptVersionControl = new PromptVersionControl();
```

### Prompt Testing Framework

```typescript
// src/prompts/testing/prompt-tester.ts
export class PromptTester {
  async testPrompt(
    prompt: PromptTemplate,
    llmClient: LLMClient,
    testCases: PromptTestCase[]
  ): Promise<PromptTestResult> {
    const results: TestCaseResult[] = [];

    for (const testCase of testCases) {
      const startTime = Date.now();

      // Call LLM with prompt
      const response = await llmClient.complete({
        provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: prompt.template },
          { role: 'user', content: testCase.input }
        ],
        temperature: 0.7,
        maxTokens: 2000
      });

      // Run quality checks
      const qualityResults = prompt.quality_checks.map(check => ({
        name: check.name,
        result: check.validator(response.content)
      }));

      const passed = qualityResults.every(r => r.result.passed);

      results.push({
        testCase: testCase.name,
        passed,
        output: response.content,
        qualityChecks: qualityResults,
        latency_ms: Date.now() - startTime,
        tokens_used: response.usage.totalTokens
      });
    }

    const passRate = results.filter(r => r.passed).length / results.length;

    return {
      prompt_id: prompt.id,
      total_tests: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      pass_rate: passRate,
      average_latency_ms: results.reduce((sum, r) => sum + r.latency_ms, 0) / results.length,
      total_tokens_used: results.reduce((sum, r) => sum + r.tokens_used, 0),
      results
    };
  }
}

interface PromptTestCase {
  name: string;
  input: string;
  expected_qualities: string[];
}

interface TestCaseResult {
  testCase: string;
  passed: boolean;
  output: string;
  qualityChecks: Array<{ name: string; result: { passed: boolean; message?: string } }>;
  latency_ms: number;
  tokens_used: number;
}

interface PromptTestResult {
  prompt_id: string;
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number;
  average_latency_ms: number;
  total_tokens_used: number;
  results: TestCaseResult[];
}
```

### Prompt Regression Test Suite

```typescript
// tests/prompts/regression-tests.ts
describe('Prompt Regression Tests', () => {
  let promptTester: PromptTester;
  let llmClient: LLMClient;

  beforeAll(() => {
    llmClient = new LLMClient();
    promptTester = new PromptTester();
  });

  it('Orchestrator normalization prompt should pass quality checks', async () => {
    const testCases: PromptTestCase[] = [
      {
        name: 'Statement to question',
        input: 'AI data centers use too much energy',
        expected_qualities: ['neutral_language', 'json_valid']
      },
      {
        name: 'Vague to specific',
        input: 'Remote work',
        expected_qualities: ['neutral_language', 'json_valid']
      },
      {
        name: 'Biased to neutral',
        input: 'Obviously AI is dangerous and should be banned',
        expected_qualities: ['neutral_language', 'json_valid']
      }
    ];

    const result = await promptTester.testPrompt(
      OrchestratorSystemPrompt,
      llmClient,
      testCases
    );

    expect(result.pass_rate).toBeGreaterThan(0.8); // 80% pass rate
    expect(result.average_latency_ms).toBeLessThan(5000);
  }, 60000);

  it('Pro opening prompt should pass quality checks', async () => {
    const testCases: PromptTestCase[] = [
      {
        name: 'AI moratorium',
        input: buildProOpeningPrompt('Should there be a moratorium on AI data centers?'),
        expected_qualities: ['no_strawman', 'has_assumptions']
      }
    ];

    const result = await promptTester.testPrompt(
      ProPhase1OpeningPrompt,
      llmClient,
      testCases
    );

    expect(result.pass_rate).toBeGreaterThan(0.8);
  }, 60000);

  it('Moderator synthesis prompt should maintain neutrality', async () => {
    const testCases: PromptTestCase[] = [
      {
        name: 'Full debate synthesis',
        input: buildModeratorSynthesisPrompt(mockFullDebate),
        expected_qualities: ['neutral_language', 'no_winner_picking']
      }
    ];

    const result = await promptTester.testPrompt(
      ModeratorSynthesisSystemPrompt,
      llmClient,
      testCases
    );

    expect(result.pass_rate).toBe(1.0); // 100% required for neutrality
  }, 60000);
});
```

### Prompt Engineering Guidelines

```typescript
// docs/PROMPT_ENGINEERING_GUIDELINES.md
export const PROMPT_ENGINEERING_GUIDELINES = `
# ClearSide Prompt Engineering Guidelines

## General Principles

1. **Explicit is better than implicit**: State all rules clearly
2. **Examples are powerful**: Include 2-3 examples of desired output
3. **Forbidden patterns**: List what NOT to do, not just what to do
4. **Structured output**: Always specify exact JSON schema for structured outputs
5. **Quality checks**: Include validators for every critical requirement

## Prompt Structure Template

\`\`\`
You are [ROLE] in [CONTEXT].

**Your Mandate:**
- [Primary responsibility 1]
- [Primary responsibility 2]
- [Primary responsibility 3]

**HARD RULES:**
1. [Absolute constraint 1]
2. [Absolute constraint 2]
3. [Absolute constraint 3]

**OUTPUT FORMAT:**
[Exact structure with examples]

**Quality Standards:**
- [Quality criterion 1]
- [Quality criterion 2]

**Examples:**
[2-3 concrete examples]

**Tone:** [Desired voice/style]
\`\`\`

## Version Control

- All prompt changes must be versioned
- Breaking changes require major version bump
- Test prompts before deployment
- Document changes in prompt changelog
- Keep deprecated prompts for 90 days

## Testing Requirements

- Every prompt must have >= 3 test cases
- Quality checks must cover all HARD RULES
- Regression tests must pass before deployment
- Track pass rate, latency, and token usage

## Common Pitfalls

1. **Too vague**: LLMs need specificity
2. **No examples**: Examples anchor behavior
3. **Conflicting instructions**: Prioritize explicit rules
4. **No validation**: Always validate outputs programmatically
5. **Prompt drift**: Version control prevents unintended changes
`;
```

---

## Dependencies

- **INFRA-001**: LLM API Integration Layer (for testing)

---

## Validation

### Definition of Done

- [ ] Centralized prompt library created
- [ ] All agent prompts organized by phase
- [ ] Versioning system implemented
- [ ] Testing framework working
- [ ] Quality validators implemented for each prompt
- [ ] Example outputs documented
- [ ] Regression test suite passing
- [ ] Prompt engineering guidelines documented
- [ ] Changelog system in place
- [ ] All prompts version controlled in git
- [ ] Performance metrics tracked (latency, tokens, pass rate)

---

## Notes

- **Prompts are Code**: Treat them with same rigor as TypeScript code
- **Version Everything**: Never modify prompts without versioning
- **Test Thoroughly**: Prompt changes can subtly break agent behavior
- **Track Performance**: Monitor latency and token usage over time
- **A/B Testing**: Future work to compare prompt versions in production
- **Internationalization**: Currently English only; plan for multi-language
- **Cost Optimization**: Shorter prompts save tokens and latency

---

**Estimated Time:** 10-12 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
