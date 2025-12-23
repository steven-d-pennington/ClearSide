# AGENT-002: Implement Pro Advocate Agent

**Priority:** P0
**Estimate:** L
**Labels:** `agent`, `backend`, `llm`
**Status:** 🟢 TO DO

---

## Context

The Pro Advocate Agent is one of two adversarial agents that conduct the core debate. It argues FOR the proposition across all 6 phases of the debate protocol. This agent must construct steel-man arguments, explicitly state assumptions, preserve uncertainty, and respond to user interventions without breaking character or hedging its position.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Pro Advocate Prompt Contract
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - AGT-201 to AGT-213
- [Product Vision](../../../docs/01_product-vision.md) - Design Principle #4: Evidence classification

---

## Requirements

### Acceptance Criteria

- [ ] Create ProAdvocateAgent class with phase-specific methods
- [ ] Implement prompts for all 6 phases (Opening, Constructive, Cross-exam, Rebuttal, Closing, Synthesis)
- [ ] Enforce steel-man quality (no straw-man arguments)
- [ ] Include explicit assumptions in every argument
- [ ] Add confidence levels and uncertainty markers
- [ ] Categorize arguments (economic, ethical, technical, social, political, environmental)
- [ ] Classify evidence types (fact, projection, analogy, value_judgment)
- [ ] Handle user interventions (pause questions, evidence injection, clarification requests)
- [ ] Build context from debate transcript
- [ ] Validate outputs against schema
- [ ] Add retry logic for API failures
- [ ] Log all agent calls with latency tracking
- [ ] Write comprehensive unit tests
- [ ] Test against flagship demo

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **AGT-201**: Pro Advocate SHALL argue FOR the proposition
- **AGT-202**: Pro Advocate SHALL produce steel-man quality arguments
- **AGT-203**: Pro Advocate SHALL NOT use straw-man tactics
- **AGT-204**: Pro Advocate SHALL state assumptions explicitly
- **AGT-205**: Pro Advocate SHALL preserve uncertainty (no false confidence)
- **AGT-206**: Pro Advocate SHALL categorize arguments by type
- **AGT-207**: Pro Advocate SHALL classify evidence as fact/projection/analogy/value
- **AGT-208**: Pro Advocate SHALL respond to user questions without breaking character
- **AGT-209**: Pro Advocate outputs SHALL validate against JSON schema
- **AGT-210**: Pro Advocate SHALL adapt to each debate phase
- **AGT-211**: Pro Advocate SHALL NOT hedge or equivocate on position
- **AGT-212**: Pro Advocate SHALL treat Con advocate as intelligent opponent
- **AGT-213**: Pro Advocate SHALL respond to cross-examination directly

---

## Implementation Guide

### Pro Advocate Agent Class

```typescript
// src/services/agents/pro-advocate-agent.ts
import { LLMClient, LLMRequest, LLMResponse } from '../llm/client';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';
import { DebatePhase } from '../../types/debate-types';

export interface AgentContext {
  debateId: string;
  currentPhase: DebatePhase;
  proposition: NormalizedProposition;
  previousUtterances: Utterance[];
  interventions: UserIntervention[];
}

export interface ArgumentOutput {
  category: 'economic' | 'ethical' | 'technical' | 'social' | 'political' | 'environmental';
  claim: string;
  reasoning: string[];
  evidence: Evidence[];
  assumptions: string[];
  uncertainties: string[];
  confidence_level: 'low' | 'medium' | 'high';
}

export interface Evidence {
  type: 'fact' | 'projection' | 'analogy' | 'value_judgment';
  content: string;
  source?: string;
  confidence: 'low' | 'medium' | 'high';
}

export class ProAdvocateAgent {
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
    loggers.info('[ProAdvocateAgent] Generating utterance', {
      debateId: context.debateId,
      phase: context.currentPhase,
      promptType
    });

    const startTime = Date.now();

    try {
      // Select phase-specific prompt
      const systemPrompt = this.getSystemPromptForPhase(context.currentPhase);
      const userPrompt = this.buildUserPrompt(promptType, proposition, context);

      // Call LLM
      const llmRequest: LLMRequest = {
        provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7, // Higher for argumentation
        maxTokens: 2000
      };

      const response = await this.llmClient.complete(llmRequest);

      // Validate steel-man quality
      const qualityCheck = await this.validateSteelManQuality(response.content);
      if (!qualityCheck.valid) {
        loggers.warn('[ProAdvocateAgent] Quality check failed', {
          warnings: qualityCheck.warnings
        });
        // Optionally retry with stronger guidance
      }

      loggers.agentCall({
        debateId: context.debateId,
        agent: 'pro',
        phase: context.currentPhase,
        model: this.modelName,
        latency_ms: Date.now() - startTime,
        success: true
      });

      return response.content;
    } catch (error) {
      loggers.error('[ProAdvocateAgent] Generation failed', error as Error, {
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
    loggers.info('[ProAdvocateAgent] Responding to user question', {
      debateId: context.debateId,
      question: question.substring(0, 100)
    });

    const systemPrompt = this.getInterventionSystemPrompt();
    const userPrompt = `User question: "${question}"\n\nProvide a direct answer while maintaining your FOR position. Be concise (2-3 paragraphs).`;

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
    return `You are the Pro Advocate in a structured debate. Your role is to argue FOR the proposition.

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

**Length:** Approximately 300-400 words (2-minute speaking time)`;
  }

  private getConstructiveSystemPrompt(): string {
    return `You are the Pro Advocate in a structured debate. Your role is to argue FOR the proposition.

**PHASE: Constructive Arguments**

**Your Mandate:**
- Build 3 distinct arguments across different categories
- Use category rotation: Economic → Ethical → Technical/Social
- Each argument must be fully developed with evidence
- State assumptions and uncertainties for each

**HARD RULES:**
1. Steel-man quality - strongest possible version of each argument
2. Categorize each argument clearly
3. Classify all evidence: fact, projection, analogy, or value_judgment
4. Include confidence levels: low, medium, high
5. State assumptions explicitly for each argument
6. Acknowledge uncertainties - no false confidence
7. Cite specific evidence where possible

**ARGUMENT STRUCTURE:**
For each argument:
{
  "category": "economic|ethical|technical|social|political|environmental",
  "claim": "Clear, specific claim",
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
- Economic: Costs, benefits, financial impacts, market effects
- Ethical: Moral considerations, rights, justice, fairness
- Technical: Feasibility, implementation, capabilities
- Social: Community impact, equity, cultural effects
- Political: Governance, power, policy mechanisms
- Environmental: Ecological impacts, sustainability

**Evidence Types:**
- Fact: Verifiable data, historical record, current state
- Projection: Forecasts, predictions, future scenarios
- Analogy: Historical comparisons, parallel cases
- Value Judgment: Normative claims, priorities, principles

**Length:** Approximately 500-600 words per argument (3 arguments total)`;
  }

  private getCrossExamSystemPrompt(): string {
    return `You are the Pro Advocate in a structured debate. Your role is to argue FOR the proposition.

**PHASE: Cross-Examination**

**Your Mandate:**
- Question Con's arguments to expose weaknesses
- Challenge unstated assumptions
- Probe evidence quality
- Highlight contradictions or gaps
- Strengthen your position through questioning

**HARD RULES:**
1. Ask genuine questions - not rhetorical traps
2. Focus on substance - not personal attacks
3. Be intellectually honest - don't misrepresent Con's position
4. Steel-man even in questioning - assume Con is intelligent
5. No "gotcha" questions - seek genuine clarity

**QUESTIONING STRATEGIES:**
- Assumption probing: "Your argument assumes X. What if Y instead?"
- Evidence quality: "You cite projection Z. What's your confidence level?"
- Scope/limits: "Does this apply to all cases or only specific contexts?"
- Contradictions: "You argued X earlier, but now suggest Y. Can you reconcile?"
- Alternative explanations: "Could this data support a different conclusion?"

**OUTPUT STRUCTURE:**
1. Identify Con argument to examine
2. Ask 2-3 probing questions
3. Explain why answers matter to the debate
4. Suggest how different answers would affect your positions

**Tone:**
- Respectful but incisive
- Genuinely curious, not combative
- Professional and analytical

**Length:** Approximately 400-500 words`;
  }

  private getRebuttalSystemPrompt(): string {
    return `You are the Pro Advocate in a structured debate. Your role is to argue FOR the proposition.

**PHASE: Rebuttal**

**Your Mandate:**
- Directly address Con's strongest arguments
- Refute evidence or reasoning
- Reassert your position
- Strengthen arguments Con challenged
- Introduce new counterpoints if needed

**HARD RULES:**
1. Steel-man Con's arguments before rebutting them
2. Address substance, not style
3. Acknowledge valid points from Con
4. No straw-man misrepresentations
5. Maintain your FOR position without hedging
6. Preserve intellectual honesty

**REBUTTAL STRUCTURE:**
For each Con argument addressed:
1. State Con's argument fairly (steel-man it)
2. Acknowledge any valid components
3. Explain where you disagree and why
4. Provide counter-evidence or counter-reasoning
5. Reassert your position

**Rebuttal Types:**
- Evidence challenge: "Con cites X, but more recent data shows Y"
- Assumption challenge: "This relies on assumption Z, which is questionable because..."
- Scope limitation: "This applies in context A but not context B"
- Alternative interpretation: "The same data supports interpretation C"
- Trade-off reframing: "This cost is outweighed by benefit D"

**Tone:**
- Respectful of Con's intelligence
- Confident but not dismissive
- Analytical and evidence-based

**Length:** Approximately 600-700 words (address 2-3 key Con arguments)`;
  }

  private getClosingSystemPrompt(): string {
    return `You are the Pro Advocate in a structured debate. Your role is to argue FOR the proposition.

**PHASE: Closing Statement**

**Your Mandate:**
- Summarize your strongest arguments
- Address why Con's objections don't outweigh your case
- Reinforce key assumptions and evidence
- Leave audience with clear understanding of FOR position
- NO new arguments (synthesis only)

**HARD RULES:**
1. Recap only - no new major arguments
2. Acknowledge debate complexity honestly
3. Restate your position clearly
4. Highlight decision hinges from your perspective
5. Maintain intellectual humility despite advocacy

**CLOSING STRUCTURE:**
1. Restate the proposition
2. Summarize your 3 strongest arguments (brief)
3. Address Con's key objections (why they don't undermine your case)
4. Highlight what's at stake (why this matters)
5. Final position statement (clear, confident, nuanced)

**Tone:**
- Confident but humble
- Comprehensive but concise
- Forward-looking and constructive

**Length:** Approximately 400-500 words (2-minute speaking time)`;
  }

  private getInterventionSystemPrompt(): string {
    return `You are the Pro Advocate responding to a user question during a live debate.

**Your Role:**
- Answer the user's question directly and honestly
- Maintain your FOR position
- Provide clarity without breaking character
- Be concise (2-3 paragraphs)

**HARD RULES:**
1. Don't hedge on your position
2. Don't defer to Con or Moderator
3. Acknowledge limitations honestly
4. Stay in character as Pro Advocate
5. Be helpful and informative

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

    // Add debate history for later phases
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
      const proUtterances = context.previousUtterances.filter(u => u.speaker === 'pro');
      for (const utterance of proUtterances) {
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
// tests/pro-advocate-examples.ts

export const PRO_OPENING_EXAMPLE = `**Position: FOR a moratorium on new AI data centers**

I argue that the United States should impose a temporary moratorium on the construction of new AI data centers while we establish comprehensive energy and environmental standards. This position rests on three critical pillars: energy grid strain, environmental impact, and the need for regulatory catch-up.

My strongest arguments will focus on:

1. **Energy Infrastructure Crisis:** AI data centers already consume 3% of U.S. electricity (projected to reach 8% by 2030), threatening grid stability in regions like Texas and California that are already struggling with peak demand.

2. **Environmental Accountability Gap:** Current AI training runs can emit as much carbon as 5 cars over their lifetimes, yet there are no disclosure requirements or emissions standards specific to AI computation.

3. **Regulatory Vacuum:** We're building permanent infrastructure based on temporary regulatory assumptions, repeating the mistakes of social media's growth-first, regulate-later approach.

**Key Assumptions:**
- Current growth trajectories in AI development will continue
- Energy grids cannot rapidly adapt to exponential demand increases
- A moratorium can be time-limited and sector-specific (not a permanent ban)
- Alternative approaches (distributed computing, efficiency standards) are viable

**Acknowledged Uncertainties:**
- Exact future energy consumption is projection-based
- Economic impact of a moratorium is difficult to quantify
- Optimal duration and scope of such a moratorium is debatable

This is a complex issue with legitimate competing interests, but the FOR case rests on the precautionary principle: permanent infrastructure decisions should not be made in a regulatory vacuum.`;

export const PRO_CONSTRUCTIVE_ECONOMIC_EXAMPLE = {
  category: 'economic',
  claim: 'A moratorium would prevent costly infrastructure lock-in and enable more efficient long-term energy allocation',
  reasoning: [
    'Building AI data centers now commits regions to decades of energy allocation decisions',
    'Current facilities are not optimized for energy efficiency due to rapid deployment pressure',
    'A pause allows development of efficiency standards that could reduce long-term costs by 30-40%',
    'First-mover disadvantage: early adopters bear higher costs than later, more efficient facilities'
  ],
  evidence: [
    {
      type: 'fact',
      content: 'Meta\'s latest AI data center uses 2.5x more energy per computation than their 2020 facility',
      source: 'Meta Engineering Blog, 2024',
      confidence: 'high'
    },
    {
      type: 'projection',
      content: 'Goldman Sachs estimates AI data centers will require $1 trillion in energy infrastructure investment by 2030',
      source: 'Goldman Sachs Research, 2024',
      confidence: 'medium'
    },
    {
      type: 'analogy',
      content: 'Similar to how early solar panel installations now seem inefficient compared to modern panels, rushing AI infrastructure may create costly legacy systems',
      confidence: 'medium'
    }
  ],
  assumptions: [
    'Energy efficiency technology will improve significantly in next 3-5 years',
    'Infrastructure built today will operate for 15-20 years',
    'Market forces alone won\'t optimize for energy efficiency under current incentives',
    'A moratorium can be implemented without completely halting AI development'
  ],
  uncertainties: [
    'Exact rate of efficiency improvements is unknown',
    'Economic cost of delayed deployment vs. efficiency gains is difficult to model precisely',
    'Whether alternative computation methods (e.g., distributed AI) will become viable'
  ],
  confidence_level: 'medium'
};
```

---

## Dependencies

- **INFRA-001**: LLM API Integration Layer
- **INFRA-004**: JSON Schema Validation
- **AGENT-001**: Orchestrator Agent (provides normalized proposition)

---

## Validation

### Unit Tests

```typescript
// tests/pro-advocate-agent.test.ts
import { ProAdvocateAgent } from '../src/services/agents/pro-advocate-agent';

describe('ProAdvocateAgent', () => {
  let agent: ProAdvocateAgent;
  let mockLLMClient: any;

  beforeEach(() => {
    mockLLMClient = { complete: jest.fn() };
    agent = new ProAdvocateAgent(mockLLMClient);
  });

  it('should generate opening statement', async () => {
    mockLLMClient.complete.mockResolvedValue({
      content: 'Opening statement FOR the proposition...',
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 200, completionTokens: 400, totalTokens: 600 },
      finishReason: 'stop'
    });

    const context = createMockContext(DebatePhase.PHASE_1_OPENING);
    const result = await agent.generateUtterance('opening_statement', mockProposition, context);

    expect(result).toContain('FOR');
    expect(mockLLMClient.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        maxTokens: 2000
      })
    );
  });

  it('should detect straw-man arguments', async () => {
    const strawManOutput = 'The naive view that Con advocates suggests...';

    const validation = await agent['validateSteelManQuality'](strawManOutput);

    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain(expect.stringContaining('straw-man'));
  });

  it('should warn on missing assumptions', async () => {
    const outputWithoutAssumptions = 'This is clearly the right approach because...';

    const validation = await agent['validateSteelManQuality'](outputWithoutAssumptions);

    expect(validation.warnings).toContain(expect.stringContaining('assumptions'));
  });

  it('should respond to user questions', async () => {
    mockLLMClient.complete.mockResolvedValue({
      content: 'In response to your question, I maintain the FOR position because...',
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 150, completionTokens: 200, totalTokens: 350 },
      finishReason: 'stop'
    });

    const context = createMockContext(DebatePhase.PHASE_2_CONSTRUCTIVE);
    const result = await agent.respondToQuestion('Can you clarify your economic argument?', context);

    expect(result).toBeTruthy();
    expect(mockLLMClient.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 800
      })
    );
  });
});
```

### Definition of Done

- [ ] ProAdvocateAgent class implemented with all phase methods
- [ ] System prompts created for all 6 phases
- [ ] Steel-man quality validation working
- [ ] Argument categorization enforced
- [ ] Evidence classification working
- [ ] Assumption extraction working
- [ ] Uncertainty preservation working
- [ ] User intervention handling implemented
- [ ] Context building from transcript working
- [ ] Schema validation passing
- [ ] Unit tests achieve >90% coverage
- [ ] Integration test with flagship demo passes
- [ ] Quality benchmarks met (no straw-man detected)

---

## Notes

- **Voice/Persona**: Professional, confident, analytical - not aggressive or dismissive
- **Argument Quality**: Every argument must pass steel-man test
- **Evidence Hierarchy**: Facts > Projections > Analogies > Value Judgments
- **Uncertainty Balance**: Acknowledge unknowns without undermining position
- **Cross-examination**: Ask genuine questions, not rhetorical traps
- **Token Budget**: Opening ~600 tokens, Constructive ~1800 tokens, Closing ~700 tokens
- **Model Tuning**: Temperature 0.7 for argumentation creativity while maintaining coherence

---

**Estimated Time:** 12-16 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
