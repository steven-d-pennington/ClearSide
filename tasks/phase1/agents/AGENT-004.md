# AGENT-004: Implement Moderator Agent

**Priority:** P0
**Estimate:** M
**Labels:** `agent`, `backend`, `llm`
**Status:** 🟢 TO DO

---

## Context

The Moderator Agent is the final agent in the debate protocol. It operates ONLY in Phase 6 (Synthesis) after both Pro and Con have completed their arguments. The Moderator's role is to provide neutral analysis without picking a winner or recommending action. It identifies areas of agreement, core disagreements, assumption conflicts, evidence gaps, and decision hinges.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Moderator Prompt Contract
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - AGT-401 to AGT-410
- [Product Vision](../../../docs/01_product-vision.md) - Design Principle #2: No final answers

---

## Requirements

### Acceptance Criteria

- [ ] Create ModeratorAgent class with synthesis generation method
- [ ] Implement Phase 6 synthesis prompt
- [ ] Enforce STRICT neutrality (no winner picking)
- [ ] Extract areas of agreement between Pro and Con
- [ ] Identify core disagreements with root causes
- [ ] Surface assumption conflicts
- [ ] Highlight evidence gaps
- [ ] Identify decision hinges (what would change the calculus)
- [ ] MUST NOT recommend action or pick winner
- [ ] Validate neutrality before output
- [ ] Build synthesis from complete transcript
- [ ] Handle user clarification questions
- [ ] Log synthesis generation
- [ ] Write unit tests
- [ ] Test against flagship demo

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **AGT-401**: Moderator SHALL operate only in Phase 6 (Synthesis)
- **AGT-402**: Moderator SHALL provide neutral analysis
- **AGT-403**: Moderator SHALL NOT pick winner or recommend action
- **AGT-404**: Moderator SHALL identify areas of agreement
- **AGT-405**: Moderator SHALL identify core disagreements
- **AGT-406**: Moderator SHALL surface assumption conflicts
- **AGT-407**: Moderator SHALL highlight evidence gaps
- **AGT-408**: Moderator SHALL identify decision hinges
- **AGT-409**: Moderator outputs SHALL validate against schema
- **AGT-410**: Moderator SHALL maintain neutrality validation

---

## Implementation Guide

### Moderator Agent Class

```typescript
// src/services/agents/moderator-agent.ts
import { LLMClient, LLMRequest, LLMResponse } from '../llm/client';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';

export interface ModeratorSynthesis {
  executive_summary: string;
  areas_of_agreement: AgreementArea[];
  core_disagreements: Disagreement[];
  assumption_conflicts: AssumptionConflict[];
  evidence_gaps: EvidenceGap[];
  decision_hinges: DecisionHinge[];
  complexity_assessment: string;
  neutrality_check: boolean;
}

export interface AgreementArea {
  topic: string;
  description: string;
  shared_evidence: string[];
}

export interface Disagreement {
  topic: string;
  pro_position: string;
  con_position: string;
  root_cause: 'factual' | 'values' | 'priorities' | 'assumptions' | 'evidence_interpretation';
  bridgeable: boolean;
}

export interface AssumptionConflict {
  pro_assumption: string;
  con_assumption: string;
  impact_on_debate: string;
}

export interface EvidenceGap {
  question: string;
  why_it_matters: string;
  current_state: 'unknown' | 'contested' | 'projected';
}

export interface DecisionHinge {
  if_true: string;
  then_favors: 'pro' | 'con' | 'neutral';
  current_evidence: string;
  confidence: 'low' | 'medium' | 'high';
}

export class ModeratorAgent {
  private llmClient: LLMClient;
  private modelName: string = 'claude-sonnet-4-5';

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async generateSynthesis(
    proposition: NormalizedProposition,
    context: AgentContext
  ): Promise<ModeratorSynthesis> {
    loggers.info('[ModeratorAgent] Generating synthesis', {
      debateId: context.debateId
    });

    const startTime = Date.now();

    try {
      // Build complete transcript for analysis
      const transcript = this.buildCompleteTranscript(context);

      const systemPrompt = this.getSynthesisSystemPrompt();
      const userPrompt = this.buildSynthesisPrompt(proposition, transcript);

      const llmRequest: LLMRequest = {
        provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3, // Lower for analytical neutrality
        maxTokens: 3000
      };

      const response = await this.llmClient.complete(llmRequest);

      // Parse synthesis
      const synthesis = this.parseSynthesisResponse(response.content);

      // Validate neutrality
      const neutralityCheck = await this.validateNeutrality(synthesis);
      if (!neutralityCheck.valid) {
        loggers.error('[ModeratorAgent] Neutrality validation failed', new Error('Non-neutral synthesis'), {
          violations: neutralityCheck.violations
        });
        throw new Error('Moderator synthesis failed neutrality check');
      }

      synthesis.neutrality_check = true;

      // Validate schema
      const schemaValidation = schemaValidator.validateModeratorSynthesis(synthesis);
      if (!schemaValidation.valid) {
        throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`);
      }

      loggers.agentCall({
        debateId: context.debateId,
        agent: 'moderator',
        phase: 'phase_6_synthesis',
        model: this.modelName,
        latency_ms: Date.now() - startTime,
        success: true
      });

      return synthesis;
    } catch (error) {
      loggers.error('[ModeratorAgent] Synthesis generation failed', error as Error, {
        debateId: context.debateId
      });
      throw error;
    }
  }

  async respondToQuestion(
    question: string,
    context: AgentContext
  ): Promise<string> {
    loggers.info('[ModeratorAgent] Responding to user question', {
      debateId: context.debateId,
      question: question.substring(0, 100)
    });

    const systemPrompt = this.getInterventionSystemPrompt();
    const userPrompt = `User question: "${question}"\n\nProvide a neutral, analytical answer. Do NOT pick a winner or recommend action. Be concise (2-3 paragraphs).`;

    const llmRequest: LLMRequest = {
      provider: { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
      model: this.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 800
    };

    const response = await this.llmClient.complete(llmRequest);

    // Validate response neutrality
    const neutralityCheck = await this.validateTextNeutrality(response.content);
    if (!neutralityCheck.valid) {
      loggers.warn('[ModeratorAgent] Response not neutral, regenerating', {
        violations: neutralityCheck.violations
      });
      // Optionally retry with stronger neutrality guidance
    }

    return response.content;
  }

  private getSynthesisSystemPrompt(): string {
    return `You are the Moderator in a structured debate. Your role is to provide NEUTRAL analysis and synthesis.

**PHASE: Synthesis (Phase 6)**

**Your Mandate:**
- Analyze the complete debate objectively
- Identify areas of agreement between Pro and Con
- Identify core disagreements and their root causes
- Surface assumption conflicts
- Highlight evidence gaps
- Identify decision hinges (what would change the calculus)

**CRITICAL HARD RULES:**
1. NEVER pick a winner - this is non-negotiable
2. NEVER recommend action or favor one side
3. NEVER use language like "should", "must", "better to"
4. Present Pro and Con positions with equal weight and respect
5. Acknowledge both sides' strongest arguments
6. Maintain analytical, neutral tone throughout

**PROHIBITED PHRASES:**
- "I recommend..."
- "The better approach is..."
- "Pro/Con is right..."
- "We should..."
- "The winner is..."
- "The stronger argument..."
- Any comparative judgment favoring one side

**OUTPUT STRUCTURE:**

Return valid JSON with this structure:
{
  "executive_summary": "2-3 sentence overview of the debate",
  "areas_of_agreement": [
    {
      "topic": "Topic both sides agree on",
      "description": "What they agree about",
      "shared_evidence": ["Evidence both cited"]
    }
  ],
  "core_disagreements": [
    {
      "topic": "Topic of disagreement",
      "pro_position": "Pro's stance",
      "con_position": "Con's stance",
      "root_cause": "factual|values|priorities|assumptions|evidence_interpretation",
      "bridgeable": true|false
    }
  ],
  "assumption_conflicts": [
    {
      "pro_assumption": "Pro assumes X",
      "con_assumption": "Con assumes Y",
      "impact_on_debate": "How this affects positions"
    }
  ],
  "evidence_gaps": [
    {
      "question": "What we don't know",
      "why_it_matters": "Impact on debate",
      "current_state": "unknown|contested|projected"
    }
  ],
  "decision_hinges": [
    {
      "if_true": "If this were true...",
      "then_favors": "pro|con|neutral",
      "current_evidence": "What we know now",
      "confidence": "low|medium|high"
    }
  ],
  "complexity_assessment": "Overall assessment of issue complexity"
}

**Root Cause Types:**
- factual: Disagreement over facts or data
- values: Different moral/ethical values
- priorities: Different weighting of concerns
- assumptions: Different underlying premises
- evidence_interpretation: Same data, different conclusions

**Tone:**
- Analytical and objective
- Respectful to both sides
- Intellectually humble
- Focused on clarity, not judgment

**Quality Standard:**
- A neutral observer should not be able to determine your personal view
- Both Pro and Con advocates should feel fairly represented
- User should understand the issue better, not feel told what to think`;
  }

  private buildSynthesisPrompt(
    proposition: NormalizedProposition,
    transcript: DebateTranscript
  ): string {
    let prompt = `**Proposition:** ${proposition.normalized_question}\n\n`;

    prompt += `**Complete Debate Transcript:**\n\n`;

    // Include all Pro utterances
    const proUtterances = transcript.filter(u => u.speaker === 'pro');
    prompt += `**Pro Advocate Arguments:**\n`;
    for (const utterance of proUtterances) {
      prompt += `[${utterance.phase}] ${utterance.content}\n\n`;
    }

    // Include all Con utterances
    const conUtterances = transcript.filter(u => u.speaker === 'con');
    prompt += `**Con Advocate Arguments:**\n`;
    for (const utterance of conUtterances) {
      prompt += `[${utterance.phase}] ${utterance.content}\n\n`;
    }

    prompt += `**Your Task:** Generate a neutral synthesis following the JSON structure. Remember: NO winner picking, NO recommendations, PURE analysis.`;

    return prompt;
  }

  private buildCompleteTranscript(context: AgentContext): DebateTranscript {
    return context.previousUtterances.map(u => ({
      speaker: u.speaker,
      phase: u.phase,
      content: u.content,
      timestamp: u.timestamp
    }));
  }

  private parseSynthesisResponse(llmOutput: string): ModeratorSynthesis {
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
        executive_summary: parsed.executive_summary,
        areas_of_agreement: parsed.areas_of_agreement || [],
        core_disagreements: parsed.core_disagreements || [],
        assumption_conflicts: parsed.assumption_conflicts || [],
        evidence_gaps: parsed.evidence_gaps || [],
        decision_hinges: parsed.decision_hinges || [],
        complexity_assessment: parsed.complexity_assessment,
        neutrality_check: false // Will be set after validation
      };
    } catch (error) {
      loggers.error('[ModeratorAgent] JSON parse failed', error as Error);
      throw new Error('Failed to parse Moderator synthesis as JSON');
    }
  }

  private async validateNeutrality(
    synthesis: ModeratorSynthesis
  ): Promise<{ valid: boolean; violations: string[] }> {
    const violations: string[] = [];

    // Check executive summary for bias
    const summaryCheck = await this.validateTextNeutrality(synthesis.executive_summary);
    if (!summaryCheck.valid) {
      violations.push(...summaryCheck.violations.map(v => `Summary: ${v}`));
    }

    // Check disagreements are balanced
    for (const disagreement of synthesis.core_disagreements) {
      const proLength = disagreement.pro_position.length;
      const conLength = disagreement.con_position.length;

      // Flag if one position is more than 2x longer (potential bias)
      if (proLength > conLength * 2) {
        violations.push(`Disagreement "${disagreement.topic}": Pro position much longer than Con`);
      } else if (conLength > proLength * 2) {
        violations.push(`Disagreement "${disagreement.topic}": Con position much longer than Pro`);
      }
    }

    // Check decision hinges don't all favor one side
    const hingeCount = { pro: 0, con: 0, neutral: 0 };
    for (const hinge of synthesis.decision_hinges) {
      hingeCount[hinge.then_favors]++;
    }

    if (hingeCount.pro > hingeCount.con * 2 || hingeCount.con > hingeCount.pro * 2) {
      violations.push(`Decision hinges appear biased: ${hingeCount.pro} pro, ${hingeCount.con} con`);
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  private async validateTextNeutrality(text: string): Promise<{ valid: boolean; violations: string[] }> {
    const violations: string[] = [];

    const biasedPhrases = [
      'recommend',
      'should',
      'must',
      'better to',
      'worse to',
      'clearly the right',
      'obviously correct',
      'winner',
      'stronger argument',
      'weaker argument',
      'superior',
      'inferior',
      'pro is right',
      'con is right',
      'pro wins',
      'con wins'
    ];

    const lowercaseText = text.toLowerCase();

    for (const phrase of biasedPhrases) {
      if (lowercaseText.includes(phrase)) {
        violations.push(`Biased language: "${phrase}"`);
      }
    }

    // Check for asymmetric treatment
    const proCount = (lowercaseText.match(/\bpro\b/g) || []).length;
    const conCount = (lowercaseText.match(/\bcon\b/g) || []).length;

    if (proCount > conCount * 2 || conCount > proCount * 2) {
      violations.push(`Asymmetric mention: Pro mentioned ${proCount} times, Con ${conCount} times`);
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  private getInterventionSystemPrompt(): string {
    return `You are the Moderator responding to a user question during a debate.

**Your Role:**
- Provide neutral, analytical answers
- Clarify both sides' positions
- Do NOT pick a winner or recommend action
- Be concise (2-3 paragraphs)

**CRITICAL RULES:**
1. Never use "should", "recommend", "better"
2. Present both perspectives equally
3. Focus on clarifying the debate, not judging it
4. Stay neutral at all costs

**Tone:** Analytical, balanced, educational`;
  }
}

type DebateTranscript = Array<{
  speaker: string;
  phase: string;
  content: string;
  timestamp: number;
}>;
```

### Example Synthesis Output

```typescript
// tests/moderator-examples.ts

export const MODERATOR_SYNTHESIS_EXAMPLE = {
  executive_summary: "This debate centers on whether the United States should impose a moratorium on new AI data centers. Pro argues that energy infrastructure strain and regulatory gaps necessitate a pause, while Con contends that economic competitiveness and innovation require continued development with targeted regulation instead.",

  areas_of_agreement: [
    {
      topic: "Energy consumption is significant",
      description: "Both Pro and Con acknowledge that AI data centers consume substantial electricity and that current growth trajectories will increase demand significantly by 2030.",
      shared_evidence: [
        "AI data centers currently use ~3% of U.S. electricity",
        "Consumption projected to grow substantially",
        "Energy efficiency improvements are important"
      ]
    },
    {
      topic: "Current regulatory framework is insufficient",
      description: "Both sides agree that existing regulations were not designed for AI-specific energy and environmental impacts, though they disagree on the appropriate response.",
      shared_evidence: [
        "No AI-specific emissions disclosure requirements",
        "Energy grid planning hasn't accounted for AI growth"
      ]
    }
  ],

  core_disagreements: [
    {
      topic: "Economic impact of a moratorium",
      pro_position: "A temporary moratorium would prevent costly infrastructure lock-in and enable more efficient long-term energy allocation, outweighing short-term economic costs.",
      con_position: "A moratorium would severely damage U.S. competitiveness, cede technological leadership to China, and result in job losses and economic decline that would not be offset by efficiency gains.",
      root_cause: "priorities",
      bridgeable: false
    },
    {
      topic: "Regulatory approach",
      pro_position: "A moratorium is necessary because targeted regulations cannot be developed and enforced quickly enough to address immediate grid strain and environmental concerns.",
      con_position: "Targeted regulations (efficiency standards, renewable requirements) can address concerns without halting progress, and market forces will drive improvements.",
      root_cause: "assumptions",
      bridgeable: true
    },
    {
      topic: "Innovation effects",
      pro_position: "A moratorium would drive efficiency innovation and prevent lock-in to inefficient technology.",
      con_position: "A moratorium would freeze current inefficient technology in place and slow the development of next-generation efficiency improvements.",
      root_cause: "evidence_interpretation",
      bridgeable: true
    }
  ],

  assumption_conflicts: [
    {
      pro_assumption: "Energy grids cannot rapidly adapt to exponential AI demand increases, creating near-term crisis risk.",
      con_assumption: "Market forces and incremental grid improvements can accommodate AI growth without system-level intervention.",
      impact_on_debate: "This assumption drives different urgency assessments - Pro sees immediate action as necessary, Con sees gradual adaptation as sufficient."
    },
    {
      pro_assumption: "A U.S. moratorium can be enforced without simply displacing AI infrastructure to other countries.",
      con_assumption: "Unilateral U.S. action would primarily shift infrastructure development offshore rather than reducing global AI development.",
      impact_on_debate: "This affects whether the proposed solution would achieve its stated environmental/energy goals or simply create competitive disadvantage."
    }
  ],

  evidence_gaps: [
    {
      question: "What is the actual elasticity of U.S. energy grids to handle projected AI load growth?",
      why_it_matters: "Determines whether grid strain is a near-term crisis (favoring Pro) or manageable challenge (favoring Con).",
      current_state: "contested"
    },
    {
      question: "What would be the actual economic impact (job losses, GDP effects) of a 3-5 year moratorium?",
      why_it_matters: "Critical for weighing Pro's efficiency benefits against Con's competitiveness concerns.",
      current_state: "projected"
    },
    {
      question: "How quickly can efficiency improvements be developed and deployed without a moratorium?",
      why_it_matters: "Tests whether Con's market-driven efficiency claim is realistic or whether Pro's lock-in concern is valid.",
      current_state: "unknown"
    }
  ],

  decision_hinges: [
    {
      if_true: "Energy grids face imminent collapse risk from AI load growth",
      then_favors: "pro",
      current_evidence: "Grid operators report strain in some regions, but no consensus on 'imminent collapse' risk",
      confidence: "low"
    },
    {
      if_true: "Targeted regulations can be developed and enforced within 12-18 months",
      then_favors: "con",
      current_evidence: "Historical regulatory timelines suggest 3-5 years for major new frameworks",
      confidence: "medium"
    },
    {
      if_true: "China and other nations would also implement similar restrictions",
      then_favors: "pro",
      current_evidence: "No indication of coordinated global action; China accelerating AI infrastructure investment",
      confidence: "high"
    },
    {
      if_true: "Next-generation AI efficiency improvements are 5+ years away",
      then_favors: "pro",
      current_evidence: "Some efficiency gains demonstrated, but timeline for major breakthroughs uncertain",
      confidence: "low"
    }
  ],

  complexity_assessment: "This is a high-complexity policy question involving trade-offs between environmental sustainability, economic competitiveness, technological innovation, and regulatory approaches. The debate reveals fundamental tensions between precautionary and market-driven approaches, with legitimate concerns and uncertainties on both sides. Key decision factors depend on contested empirical questions (grid capacity, economic impacts, efficiency timelines) and value priorities (environment vs. competitiveness, short-term vs. long-term optimization). No clear consensus exists on optimal path forward.",

  neutrality_check: true
};
```

---

## Dependencies

- **INFRA-001**: LLM API Integration Layer
- **INFRA-004**: JSON Schema Validation
- **AGENT-002**: Pro Advocate Agent (provides arguments to synthesize)
- **AGENT-003**: Con Advocate Agent (provides arguments to synthesize)

---

## Validation

### Unit Tests

```typescript
// tests/moderator-agent.test.ts
import { ModeratorAgent } from '../src/services/agents/moderator-agent';

describe('ModeratorAgent', () => {
  let agent: ModeratorAgent;
  let mockLLMClient: any;

  beforeEach(() => {
    mockLLMClient = { complete: jest.fn() };
    agent = new ModeratorAgent(mockLLMClient);
  });

  it('should generate neutral synthesis', async () => {
    mockLLMClient.complete.mockResolvedValue({
      content: JSON.stringify(MODERATOR_SYNTHESIS_EXAMPLE),
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 1000, completionTokens: 1500, totalTokens: 2500 },
      finishReason: 'stop'
    });

    const context = createMockContextWithFullDebate();
    const result = await agent.generateSynthesis(mockProposition, context);

    expect(result.areas_of_agreement.length).toBeGreaterThan(0);
    expect(result.core_disagreements.length).toBeGreaterThan(0);
    expect(result.neutrality_check).toBe(true);
  });

  it('should reject biased synthesis', async () => {
    const biasedSynthesis = {
      executive_summary: "Pro clearly has the stronger argument...",
      // ... rest of structure
    };

    const validation = await agent['validateNeutrality'](biasedSynthesis as any);

    expect(validation.valid).toBe(false);
    expect(validation.violations).toContain(expect.stringContaining('biased'));
  });

  it('should detect winner-picking language', async () => {
    const winnerPicking = "Based on this debate, I recommend adopting the Pro position.";

    const validation = await agent['validateTextNeutrality'](winnerPicking);

    expect(validation.valid).toBe(false);
    expect(validation.violations.length).toBeGreaterThan(0);
  });

  it('should identify assumption conflicts', async () => {
    mockLLMClient.complete.mockResolvedValue({
      content: JSON.stringify({
        ...MODERATOR_SYNTHESIS_EXAMPLE,
        assumption_conflicts: [
          {
            pro_assumption: "X is true",
            con_assumption: "Y is true",
            impact_on_debate: "Affects conclusion"
          }
        ]
      }),
      model: 'claude-sonnet-4-5',
      usage: { promptTokens: 1000, completionTokens: 1500, totalTokens: 2500 },
      finishReason: 'stop'
    });

    const context = createMockContextWithFullDebate();
    const result = await agent.generateSynthesis(mockProposition, context);

    expect(result.assumption_conflicts.length).toBeGreaterThan(0);
  });
});
```

### Definition of Done

- [ ] ModeratorAgent class implemented
- [ ] Synthesis prompt created with strict neutrality rules
- [ ] Neutrality validation working (rejects bias)
- [ ] Areas of agreement extraction working
- [ ] Core disagreements identification working
- [ ] Root cause classification working
- [ ] Assumption conflicts surfacing working
- [ ] Evidence gaps identification working
- [ ] Decision hinges identification working
- [ ] Schema validation passing
- [ ] Unit tests achieve >90% coverage
- [ ] Integration test with flagship demo passes
- [ ] Manual review confirms neutrality

---

## Notes

- **Neutrality is CRITICAL**: This is the hardest part - LLMs tend to pick sides
- **Validation Essential**: Always run neutrality checks before returning synthesis
- **Temperature**: Use 0.3 (lower than advocates) for analytical objectivity
- **Token Budget**: ~2500-3000 tokens for comprehensive synthesis
- **Decision Hinges**: Most valuable output - shows what would change minds
- **Quality Bar**: Both Pro and Con should feel fairly represented
- **Common Failure Mode**: Subtle bias through asymmetric treatment (e.g., mentioning Pro more)

---

**Estimated Time:** 8-10 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
