# AGENT-003: Implement Con Advocate Agent

**Priority:** P0
**Estimate:** L
**Labels:** `agent`, `backend`, `llm`
**Status:** 🟢 TO DO

---

## Context

The Con Advocate Agent is the adversarial counterpart to the Pro Advocate. It argues AGAINST the proposition across all 6 phases of the debate protocol. This agent mirrors the Pro Advocate's structure but with AGAINST framing. It must construct equally strong steel-man arguments, treat the Pro position as intelligent, and avoid trivial objections or condescension.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Con Advocate Prompt Contract
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - AGT-301 to AGT-313
- [Product Vision](../../../docs/01_product-vision.md) - Design Principle #2: No final answers

---

## Requirements

### Acceptance Criteria

- [ ] Create ConAdvocateAgent class mirroring ProAdvocateAgent structure
- [ ] Implement AGAINST-framed prompts for all 6 phases
- [ ] Enforce steel-man quality (no trivial objections)
- [ ] Treat Pro position as intelligent (no condescension)
- [ ] Include explicit assumptions in every argument
- [ ] Add confidence levels and uncertainty markers
- [ ] Categorize arguments (economic, ethical, technical, social, political, environmental)
- [ ] Classify evidence types (fact, projection, analogy, value_judgment)
- [ ] Handle user interventions
- [ ] Build context from debate transcript
- [ ] Validate outputs against schema
- [ ] Add retry logic for API failures
- [ ] Log all agent calls
- [ ] Write comprehensive unit tests
- [ ] Test against flagship demo

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **AGT-301**: Con Advocate SHALL argue AGAINST the proposition
- **AGT-302**: Con Advocate SHALL produce steel-man quality arguments
- **AGT-303**: Con Advocate SHALL NOT use straw-man tactics
- **AGT-304**: Con Advocate SHALL NOT make trivial objections
- **AGT-305**: Con Advocate SHALL treat Pro position as intelligent
- **AGT-306**: Con Advocate SHALL state assumptions explicitly
- **AGT-307**: Con Advocate SHALL preserve uncertainty
- **AGT-308**: Con Advocate SHALL categorize arguments by type
- **AGT-309**: Con Advocate SHALL classify evidence
- **AGT-310**: Con Advocate SHALL respond to user questions in character
- **AGT-311**: Con Advocate outputs SHALL validate against schema
- **AGT-312**: Con Advocate SHALL adapt to each debate phase
- **AGT-313**: Con Advocate SHALL respond to cross-examination directly

---

## Implementation Guide

### Con Advocate Agent Class

```typescript
// src/services/agents/con-advocate-agent.ts
import { LLMClient, LLMRequest, LLMResponse } from '../llm/client';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';
import { DebatePhase } from '../../types/debate-types';

export class ConAdvocateAgent {
  private llmClient: LLMClient;
  private modelName: string = 'claude-sonnet-4-5';

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async generateUtterance(
    promptType: string,
    proposition: NormalizedProposition,
    context: AgentContext
  ): Promise<string> {
    loggers.info('[ConAdvocateAgent] Generating utterance', {
      debateId: context.debateId,
      phase: context.currentPhase,
      promptType
    });

    const startTime = Date.now();

    try {
      const systemPrompt = this.getSystemPromptForPhase(context.currentPhase);
      const userPrompt = this.buildUserPrompt(promptType, proposition, context);

      const llmRequest: LLMRequest = {
        provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        maxTokens: 2000
      };

      const response = await this.llmClient.complete(llmRequest);

      const qualityCheck = await this.validateSteelManQuality(response.content);
      if (!qualityCheck.valid) {
        loggers.warn('[ConAdvocateAgent] Quality check failed', {
          warnings: qualityCheck.warnings
        });
      }

      loggers.agentCall({
        debateId: context.debateId,
        agent: 'con',
        phase: context.currentPhase,
        model: this.modelName,
        latency_ms: Date.now() - startTime,
        success: true
      });

      return response.content;
    } catch (error) {
      loggers.error('[ConAdvocateAgent] Generation failed', error as Error, {
        debateId: context.debateId,
        phase: context.currentPhase
      });
      throw error;
    }
  }

  async respondToQuestion(
    question: string,
    context: AgentContext
  ): Promise<string> {
    loggers.info('[ConAdvocateAgent] Responding to user question', {
      debateId: context.debateId,
      question: question.substring(0, 100)
    });

    const systemPrompt = this.getInterventionSystemPrompt();
    const userPrompt = `User question: "${question}"\n\nProvide a direct answer while maintaining your AGAINST position. Be concise (2-3 paragraphs).`;

    const llmRequest: LLMRequest = {
      provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
      model: this.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.buildContextSummary(context) },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      maxTokens: 800
    };

    const response = await this.llmClient.complete(llmRequest);
    return response.content;
  }

  private getSystemPromptForPhase(phase: DebatePhase): string {
    switch (phase) {
      case DebatePhase.PHASE_1_OPENING:
        return this.getOpeningSystemPrompt();
      case DebatePhase.PHASE_2_CONSTRUCTIVE:
        return this.getConstructiveSystemPrompt();
      case DebatePhase.PHASE_3_CROSSEXAM:
        return this.getCrossExamSystemPrompt();
      case DebatePhase.PHASE_4_REBUTTAL:
        return this.getRebuttalSystemPrompt();
      case DebatePhase.PHASE_5_CLOSING:
        return this.getClosingSystemPrompt();
      default:
        return this.getOpeningSystemPrompt();
    }
  }

  private getOpeningSystemPrompt(): string {
    return `You are the Con Advocate in a structured debate. Your role is to argue AGAINST the proposition.

**PHASE: Opening Statement**

**Your Mandate:**
- Present your AGAINST position clearly and confidently
- Preview your 2-3 strongest counterarguments
- State your key assumptions explicitly
- Establish credibility and authority

**HARD RULES:**
1. NO straw-man arguments - treat Pro position as intelligent and well-reasoned
2. NO trivial objections - only substantive counterarguments
3. NO condescension toward Pro position - respect the opposing view
4. EXPLICIT assumptions - state every premise
5. PRESERVE uncertainty - acknowledge what you don't know
6. NO rebuttals - Pro hasn't spoken yet (or spoke in parallel)

**OUTPUT STRUCTURE:**
1. Clear AGAINST position statement (1-2 sentences)
2. Preview of main counterarguments (2-3 strongest points)
3. Key assumptions underlying your position
4. Acknowledgment of complexity/uncertainty

**Quality Standards:**
- Professional, confident tone without arrogance
- Avoid rhetorical tricks or emotional appeals
- Focus on substance over style
- Be intellectually honest about limitations
- Treat Pro position as worthy opponent, not straw man

**Length:** Approximately 300-400 words (2-minute speaking time)`;
  }

  private getConstructiveSystemPrompt(): string {
    return `You are the Con Advocate in a structured debate. Your role is to argue AGAINST the proposition.

**PHASE: Constructive Arguments**

**Your Mandate:**
- Build 3 distinct counterarguments across different categories
- Use category rotation: Economic → Ethical → Technical/Social
- Each argument must be fully developed with evidence
- State assumptions and uncertainties for each
- Challenge the proposition on its merits, not with trivial objections

**HARD RULES:**
1. Steel-man quality - strongest possible version of each counterargument
2. NO trivial objections (e.g., "it's too hard", "people won't like it")
3. Treat Pro position as intelligent - acknowledge its strengths before challenging
4. Categorize each argument clearly
5. Classify all evidence: fact, projection, analogy, or value_judgment
6. Include confidence levels: low, medium, high
7. State assumptions explicitly for each argument
8. Acknowledge uncertainties - no false confidence

**ARGUMENT STRUCTURE:**
For each counterargument:
{
  "category": "economic|ethical|technical|social|political|environmental",
  "claim": "Clear, specific claim AGAINST the proposition",
  "reasoning": ["Step 1", "Step 2", "Step 3"],
  "evidence": [
    {
      "type": "fact|projection|analogy|value_judgment",
      "content": "Evidence statement",
      "source": "Optional source",
      "confidence": "low|medium|high"
    }
  ],
  "assumptions": ["Assumption 1", "Assumption 2"],
  "uncertainties": ["Uncertainty 1", "Uncertainty 2"],
  "confidence_level": "low|medium|high"
}

**Categories Defined:**
- Economic: Costs, benefits, market disruption, unintended consequences
- Ethical: Rights violations, justice concerns, fairness issues
- Technical: Implementation barriers, feasibility constraints
- Social: Community harm, equity concerns, cultural impacts
- Political: Governance challenges, enforcement problems
- Environmental: Ecological costs, sustainability issues

**Evidence Types:**
- Fact: Verifiable data, historical record, current state
- Projection: Forecasts, predictions, future scenarios
- Analogy: Historical comparisons, parallel cases
- Value Judgment: Normative claims, priorities, principles

**Tone:** Respectful of Pro position while firmly AGAINST the proposition

**Length:** Approximately 500-600 words per argument (3 arguments total)`;
  }

  private getCrossExamSystemPrompt(): string {
    return `You are the Con Advocate in a structured debate. Your role is to argue AGAINST the proposition.

**PHASE: Cross-Examination**

**Your Mandate:**
- Question Pro's arguments to expose weaknesses
- Challenge unstated assumptions
- Probe evidence quality
- Highlight contradictions or gaps
- Strengthen your AGAINST position through questioning

**HARD RULES:**
1. Ask genuine questions - not rhetorical traps
2. Focus on substance - not personal attacks
3. Be intellectually honest - don't misrepresent Pro's position
4. Steel-man even in questioning - assume Pro is intelligent
5. NO "gotcha" questions - seek genuine clarity
6. Respect Pro's arguments while challenging them

**QUESTIONING STRATEGIES:**
- Assumption probing: "Your argument assumes X. What if Y instead?"
- Evidence quality: "You cite projection Z. What's your confidence level?"
- Scope/limits: "Does this apply to all cases or only specific contexts?"
- Contradictions: "You argued X earlier, but now suggest Y. Can you reconcile?"
- Alternative explanations: "Could this data support a different conclusion?"
- Unintended consequences: "Have you considered impact W?"

**OUTPUT STRUCTURE:**
1. Identify Pro argument to examine
2. Ask 2-3 probing questions
3. Explain why answers matter to the debate
4. Suggest how different answers would affect positions

**Tone:**
- Respectful but incisive
- Genuinely curious, not combative
- Professional and analytical
- Acknowledge Pro's intelligence while challenging claims

**Length:** Approximately 400-500 words`;
  }

  private getRebuttalSystemPrompt(): string {
    return `You are the Con Advocate in a structured debate. Your role is to argue AGAINST the proposition.

**PHASE: Rebuttal**

**Your Mandate:**
- Directly address Pro's strongest arguments
- Refute evidence or reasoning
- Reassert your AGAINST position
- Strengthen counterarguments Pro challenged
- Introduce new counterpoints if needed

**HARD RULES:**
1. Steel-man Pro's arguments before rebutting them
2. Address substance, not style
3. Acknowledge valid points from Pro
4. NO straw-man misrepresentations
5. NO trivial dismissals
6. Maintain your AGAINST position without hedging
7. Preserve intellectual honesty

**REBUTTAL STRUCTURE:**
For each Pro argument addressed:
1. State Pro's argument fairly (steel-man it)
2. Acknowledge any valid components
3. Explain where you disagree and why
4. Provide counter-evidence or counter-reasoning
5. Reassert your AGAINST position

**Rebuttal Types:**
- Evidence challenge: "Pro cites X, but more recent data shows Y"
- Assumption challenge: "This relies on assumption Z, which is questionable because..."
- Scope limitation: "This applies in context A but not context B"
- Alternative interpretation: "The same data supports interpretation C"
- Trade-off reframing: "This benefit is outweighed by cost D"
- Unintended consequences: "Pro overlooks negative consequence E"

**Tone:**
- Respectful of Pro's intelligence
- Confident but not dismissive
- Analytical and evidence-based
- Acknowledge strengths while refuting

**Length:** Approximately 600-700 words (address 2-3 key Pro arguments)`;
  }

  private getClosingSystemPrompt(): string {
    return `You are the Con Advocate in a structured debate. Your role is to argue AGAINST the proposition.

**PHASE: Closing Statement**

**Your Mandate:**
- Summarize your strongest counterarguments
- Address why Pro's arguments don't outweigh your concerns
- Reinforce key assumptions and evidence
- Leave audience with clear understanding of AGAINST position
- NO new arguments (synthesis only)

**HARD RULES:**
1. Recap only - no new major arguments
2. Acknowledge debate complexity honestly
3. Restate your AGAINST position clearly
4. Highlight decision hinges from your perspective
5. Maintain intellectual humility despite advocacy
6. Respect Pro position while firmly disagreeing

**CLOSING STRUCTURE:**
1. Restate the proposition
2. Summarize your 3 strongest counterarguments (brief)
3. Address Pro's key claims (why they don't outweigh your concerns)
4. Highlight what's at stake from AGAINST perspective
5. Final position statement (clear, confident, nuanced)

**Tone:**
- Confident but humble
- Comprehensive but concise
- Forward-looking and constructive
- Respectful of opposing view

**Length:** Approximately 400-500 words (2-minute speaking time)`;
  }

  private getInterventionSystemPrompt(): string {
    return `You are the Con Advocate responding to a user question during a live debate.

**Your Role:**
- Answer the user's question directly and honestly
- Maintain your AGAINST position
- Provide clarity without breaking character
- Be concise (2-3 paragraphs)

**HARD RULES:**
1. Don't hedge on your position
2. Don't defer to Pro or Moderator
3. Acknowledge limitations honestly
4. Stay in character as Con Advocate
5. Be helpful and informative
6. Respect Pro position while maintaining AGAINST stance

**Tone:** Professional, direct, educational`;
  }

  private buildUserPrompt(
    promptType: string,
    proposition: NormalizedProposition,
    context: AgentContext
  ): string {
    let prompt = `**Proposition:** ${proposition.normalized_question}\n\n`;

    if (proposition.context) {
      prompt += `**Context:**\n`;
      if (proposition.context.geography) prompt += `- Geography: ${proposition.context.geography}\n`;
      if (proposition.context.timeframe) prompt += `- Timeframe: ${proposition.context.timeframe}\n`;
      if (proposition.context.domain) prompt += `- Domain: ${proposition.context.domain}\n`;
      prompt += '\n';
    }

    if (context.previousUtterances.length > 0) {
      prompt += `**Debate History:**\n`;
      const recentUtterances = context.previousUtterances.slice(-5);
      for (const utterance of recentUtterances) {
        prompt += `[${utterance.speaker.toUpperCase()}]: ${utterance.content.substring(0, 200)}...\n\n`;
      }
    }

    prompt += `**Your Task:** Generate your ${promptType} for the ${context.currentPhase} phase.\n\n`;

    return prompt;
  }

  private buildContextSummary(context: AgentContext): string {
    let summary = `**Debate Context:**\n`;
    summary += `Proposition: ${context.proposition.normalized_question}\n`;
    summary += `Current Phase: ${context.currentPhase}\n\n`;

    if (context.previousUtterances.length > 0) {
      summary += `**Your Previous Arguments:**\n`;
      const conUtterances = context.previousUtterances.filter(u => u.speaker === 'con');
      for (const utterance of conUtterances) {
        summary += `- ${utterance.content.substring(0, 150)}...\n`;
      }
    }

    return summary;
  }

  private async validateSteelManQuality(output: string): Promise<{ valid: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    // Check for straw-man indicators
    const strawManPhrases = [
      'they claim',
      'they want us to believe',
      'the naive view',
      'simplistic',
      'anyone who thinks',
      'it\'s absurd to think'
    ];

    const lowercaseOutput = output.toLowerCase();
    for (const phrase of strawManPhrases) {
      if (lowercaseOutput.includes(phrase)) {
        warnings.push(`Potential straw-man language detected: "${phrase}"`);
      }
    }

    // Check for trivial objections
    const trivialPhrases = [
      'too hard',
      'too expensive',
      'won\'t work',
      'people won\'t like it',
      'impossible'
    ];

    for (const phrase of trivialPhrases) {
      if (lowercaseOutput.includes(phrase)) {
        warnings.push(`Potential trivial objection detected: "${phrase}"`);
      }
    }

    // Check for condescension
    const condescendingPhrases = [
      'obviously wrong',
      'clearly flawed',
      'foolish',
      'ignorant',
      'fail to understand'
    ];

    for (const phrase of condescendingPhrases) {
      if (lowercaseOutput.includes(phrase)) {
        warnings.push(`Potential condescending language detected: "${phrase}"`);
      }
    }

    // Check for assumption markers
    const hasAssumptions = lowercaseOutput.includes('assum') ||
                           lowercaseOutput.includes('premise') ||
                           lowercaseOutput.includes('presuppose');

    if (!hasAssumptions) {
      warnings.push('No explicit assumptions detected');
    }

    // Check for uncertainty markers
    const hasUncertainty = lowercaseOutput.includes('uncertain') ||
                           lowercaseOutput.includes('unknown') ||
                           lowercaseOutput.includes('unclear') ||
                           lowercaseOutput.includes('may') ||
                           lowercaseOutput.includes('could');

    if (!hasUncertainty) {
      warnings.push('No uncertainty markers detected - may be overconfident');
    }

    return {
      valid: warnings.length < 2,
      warnings
    };
  }
}
```

### Example Outputs by Phase

```typescript
// tests/con-advocate-examples.ts

export const CON_OPENING_EXAMPLE = `**Position: AGAINST a moratorium on new AI data centers**

I argue that imposing a moratorium on AI data centers would be premature, counterproductive, and ultimately harmful to American technological leadership and economic competitiveness. While energy concerns are legitimate, a blunt moratorium is the wrong tool for addressing them.

My strongest counterarguments will focus on:

1. **Economic Competitiveness Risk:** A unilateral U.S. moratorium would cede AI infrastructure leadership to China and other nations, potentially costing hundreds of thousands of jobs and trillions in economic value over the next decade.

2. **False Dichotomy:** We don't have to choose between AI development and energy sustainability. Market-driven efficiency improvements, renewable energy integration, and targeted regulations can address energy concerns without halting progress.

3. **Innovation Paradox:** Moratoriums freeze current inefficient technology in place. Continued development drives efficiency breakthroughs - newer data centers use 40% less energy per computation than 2020 facilities.

**Key Assumptions:**
- AI development provides significant economic and scientific value
- Market forces and targeted regulations can address energy concerns
- A moratorium would be effectively enforced (preventing offshore migration)
- Alternative approaches (efficiency standards, renewable requirements) are viable

**Acknowledged Uncertainties:**
- Exact competitive impact of a moratorium is difficult to model
- Rate of energy efficiency improvements is projection-based
- Optimal regulatory approach is debatable
- Global coordination on AI development is unlikely

This is a complex policy question with legitimate concerns on both sides. The AGAINST case rests on the principle that targeted regulation is preferable to broad moratoriums that risk unintended consequences.`;

export const CON_CONSTRUCTIVE_ECONOMIC_EXAMPLE = {
  category: 'economic',
  claim: 'A moratorium would severely damage U.S. economic competitiveness and cede technological leadership to other nations',
  reasoning: [
    'AI data center infrastructure is prerequisite for AI development and deployment',
    'China and other nations are rapidly expanding AI infrastructure investment',
    'Unilateral U.S. moratorium creates first-mover disadvantage, not advantage',
    'Economic spillover effects: AI drives productivity gains across all sectors'
  ],
  evidence: [
    {
      type: 'fact',
      content: 'China announced $200B in AI infrastructure investment for 2024-2028, including 50 new data centers',
      source: 'MIT Technology Review, 2024',
      confidence: 'high'
    },
    {
      type: 'projection',
      content: 'McKinsey estimates AI could add $13 trillion to global economic output by 2030, with infrastructure as key enabler',
      source: 'McKinsey Global Institute, 2023',
      confidence: 'medium'
    },
    {
      type: 'analogy',
      content: 'Similar to how U.S. semiconductor manufacturing decline led to supply chain vulnerabilities, AI infrastructure gaps would create strategic dependencies',
      confidence: 'medium'
    },
    {
      type: 'fact',
      content: 'Current U.S. AI companies employ 500,000+ workers directly, with millions more in dependent industries',
      source: 'Bureau of Labor Statistics, 2024',
      confidence: 'high'
    }
  ],
  assumptions: [
    'Economic competitiveness remains important U.S. policy goal',
    'AI infrastructure located domestically provides strategic advantage',
    'Other nations will not implement similar moratoriums',
    'Job losses from moratorium would not be offset by other sectors'
  ],
  uncertainties: [
    'Exact job impact is difficult to quantify',
    'Whether offshore infrastructure would serve U.S. companies adequately',
    'Long-term competitive dynamics are inherently unpredictable'
  ],
  confidence_level: 'medium'
};
```

---

## Dependencies

- **INFRA-001**: LLM API Integration Layer
- **INFRA-004**: JSON Schema Validation
- **AGENT-001**: Orchestrator Agent (provides normalized proposition)
- **AGENT-002**: Pro Advocate Agent (parallel implementation)

---

## Validation

### Unit Tests

```typescript
// tests/con-advocate-agent.test.ts
import { ConAdvocateAgent } from '../src/services/agents/con-advocate-agent';

describe('ConAdvocateAgent', () => {
  let agent: ConAdvocateAgent;
  let mockLLMClient: any;

  beforeEach(() => {
    mockLLMClient = { complete: jest.fn() };
    agent = new ConAdvocateAgent(mockLLMClient);
  });

  it('should generate opening statement AGAINST proposition', async () => {
    mockLLMClient.complete.mockResolvedValue({
      content: 'Opening statement AGAINST the proposition...',
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 200, completionTokens: 400, totalTokens: 600 },
      finishReason: 'stop'
    });

    const context = createMockContext(DebatePhase.PHASE_1_OPENING);
    const result = await agent.generateUtterance('opening_statement', mockProposition, context);

    expect(result).toContain('AGAINST');
  });

  it('should detect trivial objections', async () => {
    const trivialOutput = 'This proposal is too hard and won\'t work';

    const validation = await agent['validateSteelManQuality'](trivialOutput);

    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain(expect.stringContaining('trivial'));
  });

  it('should detect condescension toward Pro', async () => {
    const condescendingOutput = 'The Pro advocate clearly fails to understand...';

    const validation = await agent['validateSteelManQuality'](condescendingOutput);

    expect(validation.warnings).toContain(expect.stringContaining('condescending'));
  });

  it('should mirror Pro structure but with AGAINST framing', async () => {
    mockLLMClient.complete.mockResolvedValue({
      content: JSON.stringify({
        category: 'economic',
        claim: 'AGAINST claim',
        reasoning: ['Step 1', 'Step 2'],
        evidence: [],
        assumptions: ['Assumption 1'],
        uncertainties: ['Uncertainty 1'],
        confidence_level: 'medium'
      }),
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 200, completionTokens: 400, totalTokens: 600 },
      finishReason: 'stop'
    });

    const context = createMockContext(DebatePhase.PHASE_2_CONSTRUCTIVE);
    const result = await agent.generateUtterance('constructive_argument', mockProposition, context);

    const parsed = JSON.parse(result);
    expect(parsed.category).toBeDefined();
    expect(parsed.assumptions.length).toBeGreaterThan(0);
  });
});
```

### Definition of Done

- [ ] ConAdvocateAgent class implemented mirroring Pro structure
- [ ] AGAINST-framed system prompts for all 6 phases
- [ ] Steel-man quality validation working (no trivial objections)
- [ ] Condescension detection working
- [ ] Argument categorization enforced
- [ ] Evidence classification working
- [ ] Assumption extraction working
- [ ] Uncertainty preservation working
- [ ] User intervention handling implemented
- [ ] Context building working
- [ ] Schema validation passing
- [ ] Unit tests achieve >90% coverage
- [ ] Integration test with flagship demo passes
- [ ] Quality benchmarks met (treats Pro as intelligent)

---

## Notes

- **Symmetry with Pro**: Con should be equally rigorous, just AGAINST instead of FOR
- **No Trivial Objections**: "Too expensive" or "Too hard" are insufficient without deep analysis
- **Respect for Pro**: Always steel-man Pro's position before rebutting
- **Voice/Persona**: Professional, analytical, confident - never dismissive or arrogant
- **Common Pitfall**: Avoid "status quo bias" (defending current state without argument)
- **Token Budget**: Same as Pro - Opening ~600, Constructive ~1800, Closing ~700
- **Quality Bar**: Con arguments must be as strong as Pro arguments

---

**Estimated Time:** 12-16 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
