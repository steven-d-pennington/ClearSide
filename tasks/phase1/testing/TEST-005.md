# TEST-005: Agent Output Validation & Quality Testing

**Task ID:** TEST-005
**Phase:** Phase 1 - MVP
**Category:** Testing
**Priority:** P0 (Critical - Quality Assurance)
**Estimated Effort:** 3 days
**Dependencies:** AGENT-001 through AGENT-005, TEST-001
**Status:** TO DO

---

## Overview

Implement comprehensive testing for agent outputs to ensure they meet quality standards, follow JSON schema, avoid common pitfalls (straw-man arguments, false certainty), and maintain neutrality. This is critical for ClearSide's core value proposition.

### Related Documentation
- **Requirements:** `docs/REQUIREMENTS.md` - Agent quality requirements
- **JSON Schema:** `docs/04_json-schema.md` - Output structure
- **Product Vision:** `docs/01_product-vision.md` - Quality principles
- **Kanban:** `docs/KANBAN.md` - Task TEST-005

---

## Objectives

1. **JSON Schema validation** for all agent outputs
2. **Quality checks** for steel-man arguments
3. **Straw-man detection** to catch weak arguments
4. **Neutrality verification** for moderator
5. **Assumption explicitness** validation
6. **Uncertainty preservation** checks
7. **Flagship demo regression** testing

---

## Acceptance Criteria

- [ ] All outputs validate against JSON Schema v1.0.0
- [ ] Steel-man quality metrics pass
- [ ] No straw-man arguments detected
- [ ] Moderator maintains neutrality
- [ ] Assumptions are explicit and listed
- [ ] Uncertainties preserved (not collapsed)
- [ ] Flagship demo benchmarks maintained
- [ ] Quality tests run in CI/CD

---

## Technical Specification

### JSON Schema Validation

```typescript
// src/__tests__/agents/schemaValidation.test.ts

import Ajv from 'ajv';
import debateSchema from '@/schemas/debate-output-v1.json';
import { validateDebateOutput } from '@/utils/validation/schemaValidator';

const ajv = new Ajv();
const validate = ajv.compile(debateSchema);

describe('JSON Schema Validation', () => {
  it('validates complete debate output', () => {
    const output = {
      meta: {
        version: '1.0.0',
        generated_at: new Date().toISOString(),
        model: 'claude-sonnet-4.5',
      },
      proposition: {
        normalized: 'Should we implement a moratorium on AI data centers?',
        original: 'Should we implement a moratorium on AI data centers?',
        context: null,
      },
      pro: {
        summary: 'Arguments in favor of the moratorium',
        arguments: [
          {
            id: 'pro-1',
            title: 'Environmental Protection',
            description: 'Reducing carbon emissions from data centers',
            category: 'environmental',
            evidence: [
              {
                type: 'fact',
                claim: 'Data centers account for 1% of global electricity',
                source: 'IEA Report 2023',
                confidence: 'high',
              },
            ],
            assumptions: ['Energy grid remains carbon-intensive'],
          },
        ],
        assumptions: ['Energy costs will rise'],
        uncertainties: ['Timeline for renewable transition'],
      },
      con: {
        summary: 'Arguments against the moratorium',
        arguments: [
          {
            id: 'con-1',
            title: 'Economic Impact',
            description: 'Potential slowdown in AI development',
            category: 'economic',
            evidence: [],
            assumptions: [],
          },
        ],
        assumptions: [],
        uncertainties: [],
      },
      moderator: {
        summary: 'Balanced synthesis of both perspectives',
        agreements: ['Both prioritize sustainability'],
        disagreements: ['Timeline for action differs'],
        hinges: ['Cost of renewable energy transition'],
      },
      challenges: [],
    };

    const valid = validate(output);
    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects output missing required fields', () => {
    const invalidOutput = {
      meta: { version: '1.0.0' },
      // Missing proposition, pro, con, moderator
    };

    const valid = validate(invalidOutput);
    expect(valid).toBe(false);
    expect(validate.errors).not.toBeNull();
  });

  it('rejects invalid evidence types', () => {
    const invalidOutput = {
      meta: { version: '1.0.0', generated_at: new Date().toISOString() },
      proposition: { normalized: 'Test', original: 'Test' },
      pro: {
        arguments: [
          {
            id: 'pro-1',
            title: 'Test',
            description: 'Test',
            category: 'economic',
            evidence: [
              {
                type: 'invalid_type', // Should be fact, projection, analogy, or value_judgment
                claim: 'Test claim',
              },
            ],
          },
        ],
      },
      con: { arguments: [] },
      moderator: {},
    };

    const valid = validate(invalidOutput);
    expect(valid).toBe(false);
  });
});
```

### Steel-Man Quality Tests

```typescript
// src/__tests__/agents/steelmanQuality.test.ts

import { assessArgumentQuality } from '@/utils/validation/qualityChecks';
import { Argument } from '@/types/debate';

describe('Steel-Man Quality Assessment', () => {
  it('detects straw-man arguments', () => {
    const strawmanArgument: Argument = {
      id: 'arg-1',
      title: 'Opponents are irrational',
      description: 'People who disagree clearly haven\'t thought this through',
      category: 'other',
      evidence: [],
      assumptions: [],
    };

    const assessment = assessArgumentQuality(strawmanArgument);
    expect(assessment.isStrawman).toBe(true);
    expect(assessment.issues).toContain('Dismisses opposition as irrational');
  });

  it('validates steel-man arguments have evidence', () => {
    const weakArgument: Argument = {
      id: 'arg-1',
      title: 'Economic Benefits',
      description: 'This would be good for the economy',
      category: 'economic',
      evidence: [], // No evidence
      assumptions: [],
    };

    const assessment = assessArgumentQuality(weakArgument);
    expect(assessment.hasEvidence).toBe(false);
    expect(assessment.issues).toContain('Lacks supporting evidence');
  });

  it('validates arguments have explicit assumptions', () => {
    const argumentWithoutAssumptions: Argument = {
      id: 'arg-1',
      title: 'Environmental Impact',
      description: 'This will reduce emissions by 20%',
      category: 'environmental',
      evidence: [
        {
          type: 'projection',
          claim: '20% reduction in emissions',
          confidence: 'medium',
        },
      ],
      assumptions: [], // Missing assumptions about the projection
    };

    const assessment = assessArgumentQuality(argumentWithoutAssumptions);
    expect(assessment.hasExplicitAssumptions).toBe(false);
    expect(assessment.issues).toContain('Projections lack explicit assumptions');
  });

  it('approves strong steel-man arguments', () => {
    const strongArgument: Argument = {
      id: 'arg-1',
      title: 'Renewable Energy Transition',
      description: 'Delaying data center expansion provides time for grid transition to renewables',
      category: 'environmental',
      evidence: [
        {
          type: 'fact',
          claim: 'Data centers consume 1% of global electricity',
          source: 'IEA 2023',
          confidence: 'high',
        },
        {
          type: 'projection',
          claim: 'Renewable capacity will increase 40% by 2030',
          source: 'IRENA forecast',
          confidence: 'medium',
        },
      ],
      assumptions: [
        'Current energy grid remains predominantly fossil fuel-based',
        'Renewable energy costs continue to decline',
        'Data center energy demand continues growing',
      ],
    };

    const assessment = assessArgumentQuality(strongArgument);
    expect(assessment.isStrawman).toBe(false);
    expect(assessment.hasEvidence).toBe(true);
    expect(assessment.hasExplicitAssumptions).toBe(true);
    expect(assessment.qualityScore).toBeGreaterThan(0.8);
  });
});
```

### Neutrality Tests

```typescript
// src/__tests__/agents/neutrality.test.ts

import { assessModeratorNeutrality } from '@/utils/validation/neutralityChecks';
import { ModeratorSynthesis } from '@/types/debate';

describe('Moderator Neutrality', () => {
  it('detects biased language', () => {
    const biasedSynthesis: ModeratorSynthesis = {
      summary: 'Clearly, the pro side has better arguments',
      agreements: [],
      disagreements: [],
      hinges: [],
    };

    const assessment = assessModeratorNeutrality(biasedSynthesis);
    expect(assessment.isNeutral).toBe(false);
    expect(assessment.biasIndicators).toContain('Uses absolute language: "Clearly"');
  });

  it('detects recommendations (should not make them)', () => {
    const recommendingSynthesis: ModeratorSynthesis = {
      summary: 'Based on this analysis, you should support the moratorium',
      agreements: [],
      disagreements: [],
      hinges: [],
    };

    const assessment = assessModeratorNeutrality(recommendingSynthesis);
    expect(assessment.isNeutral).toBe(false);
    expect(assessment.biasIndicators).toContain('Makes recommendation');
  });

  it('detects winner-picking', () => {
    const winnerPickingSynthesis: ModeratorSynthesis = {
      summary: 'The arguments against are stronger overall',
      agreements: [],
      disagreements: [],
      hinges: [],
    };

    const assessment = assessModeratorNeutrality(winnerPickingSynthesis);
    expect(assessment.isNeutral).toBe(false);
    expect(assessment.biasIndicators).toContain('Declares winner');
  });

  it('approves neutral synthesis', () => {
    const neutralSynthesis: ModeratorSynthesis = {
      summary: 'Both sides present substantive arguments grounded in different value frameworks',
      agreements: [
        'Both prioritize long-term sustainability',
        'Both acknowledge technological progress is important',
      ],
      disagreements: [
        'Timeframe for action (immediate vs gradual)',
        'Weight given to environmental vs economic concerns',
      ],
      hinges: [
        'Rate of renewable energy transition',
        'Actual energy efficiency gains from newer data centers',
        'Economic impact of delaying AI development',
      ],
    };

    const assessment = assessModeratorNeutrality(neutralSynthesis);
    expect(assessment.isNeutral).toBe(true);
    expect(assessment.biasIndicators).toHaveLength(0);
  });
});
```

### Uncertainty Preservation Tests

```typescript
// src/__tests__/agents/uncertaintyPreservation.test.ts

import { checkUncertaintyPreservation } from '@/utils/validation/uncertaintyChecks';

describe('Uncertainty Preservation', () => {
  it('detects false certainty in projections', () => {
    const evidence = [
      {
        type: 'projection' as const,
        claim: 'This will definitely reduce emissions by 20%',
        confidence: 'high' as const,
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toContain('Projection uses absolute language: "definitely"');
  });

  it('validates appropriate confidence levels', () => {
    const evidence = [
      {
        type: 'projection' as const,
        claim: 'May reduce emissions by 15-25%',
        confidence: 'medium' as const,
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toHaveLength(0);
  });

  it('flags high confidence on projections', () => {
    const evidence = [
      {
        type: 'projection' as const,
        claim: 'Economic growth will accelerate',
        confidence: 'high' as const, // Suspicious for a projection
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toContain('High confidence on future projection');
  });
});
```

### Flagship Demo Regression Tests

```typescript
// src/__tests__/agents/flagshipDemo.test.ts

import { generateDebate } from '@/services/debateService';
import { assessArgumentQuality } from '@/utils/validation/qualityChecks';
import { assessModeratorNeutrality } from '@/utils/validation/neutralityChecks';

describe('Flagship Demo Benchmark', () => {
  const FLAGSHIP_QUESTION =
    'Should we implement a temporary moratorium on new AI data centers pending renewable energy grid improvements?';

  it('maintains quality standards from flagship demo', async () => {
    const output = await generateDebate(FLAGSHIP_QUESTION, {
      includeContext: true,
    });

    // Validate structure
    expect(output.pro.arguments.length).toBeGreaterThanOrEqual(3);
    expect(output.con.arguments.length).toBeGreaterThanOrEqual(3);

    // Validate argument quality
    const proQualities = output.pro.arguments.map(assessArgumentQuality);
    const avgProQuality =
      proQualities.reduce((sum, q) => sum + q.qualityScore, 0) /
      proQualities.length;
    expect(avgProQuality).toBeGreaterThan(0.7);

    const conQualities = output.con.arguments.map(assessArgumentQuality);
    const avgConQuality =
      conQualities.reduce((sum, q) => sum + q.qualityScore, 0) /
      conQualities.length;
    expect(avgConQuality).toBeGreaterThan(0.7);

    // Validate moderator neutrality
    const neutrality = assessModeratorNeutrality(output.moderator);
    expect(neutrality.isNeutral).toBe(true);

    // Validate assumptions are explicit
    expect(output.pro.assumptions.length).toBeGreaterThan(0);
    expect(output.con.assumptions.length).toBeGreaterThan(0);

    // Validate uncertainties are preserved
    expect(output.pro.uncertainties.length).toBeGreaterThan(0);
    expect(output.con.uncertainties.length).toBeGreaterThan(0);
  }, 60000); // 60s timeout for full generation
});
```

---

## Implementation Steps

1. **Day 1:** Implement JSON schema validation and steel-man quality checks
2. **Day 2:** Add neutrality and uncertainty preservation tests
3. **Day 3:** Create flagship demo regression tests and integrate into CI

---

## Validation Steps

- [ ] All schema validation tests pass
- [ ] Steel-man quality checks catch weak arguments
- [ ] Neutrality tests catch bias
- [ ] Uncertainty preservation validated
- [ ] Flagship demo benchmarks maintained
- [ ] All tests run in CI/CD
- [ ] Quality gates prevent regressions

---

**Last Updated:** 2025-12-23
