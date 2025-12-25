/**
 * Steel-Man Quality Assessment Tests
 *
 * Ensures arguments meet steel-man quality standards and avoid straw-man tactics.
 */

import { describe, it, expect } from 'vitest';
import {
  assessArgumentQuality,
  checkUncertaintyPreservation,
  type Argument,
  type Evidence,
} from '../../src/utils/validation/qualityChecks.js';

describe('Steel-Man Quality Assessment', () => {
  describe('Straw-Man Detection', () => {
    it('detects dismissive language toward opponents', () => {
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
      expect(assessment.issues.some((i) => i.includes('irrational'))).toBe(true);
    });

    it('detects "clearly haven\'t thought" as straw-man', () => {
      const strawmanArgument: Argument = {
        id: 'arg-2',
        title: 'Economic Analysis',
        description: 'The opposition clearly hasn\'t thought about the economic implications',
        category: 'economic',
        evidence: [],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(strawmanArgument);
      expect(assessment.isStrawman).toBe(true);
      expect(assessment.issues.some((i) => i.toLowerCase().includes('clearly'))).toBe(true);
    });

    it('detects "obviously wrong" as straw-man', () => {
      const strawmanArgument: Argument = {
        id: 'arg-3',
        title: 'Technical Assessment',
        description: 'The other side is obviously wrong about the technical feasibility',
        category: 'technical',
        evidence: [],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(strawmanArgument);
      expect(assessment.isStrawman).toBe(true);
    });

    it('approves arguments without dismissive language', () => {
      const strongArgument: Argument = {
        id: 'arg-4',
        title: 'Environmental Considerations',
        description:
          'While there are valid concerns about economic impact, environmental protection requires urgent action',
        category: 'environmental',
        evidence: [
          {
            type: 'fact',
            claim: 'Data centers account for 1% of global electricity',
            source: 'IEA 2023',
            confidence: 'high',
          },
        ],
        assumptions: ['Current energy grid remains carbon-intensive'],
      };

      const assessment = assessArgumentQuality(strongArgument);
      expect(assessment.isStrawman).toBe(false);
    });
  });

  describe('Evidence Requirements', () => {
    it('flags arguments lacking evidence', () => {
      const weakArgument: Argument = {
        id: 'arg-5',
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

    it('approves arguments with supporting evidence', () => {
      const evidencedArgument: Argument = {
        id: 'arg-6',
        title: 'Job Creation',
        description: 'AI data centers create high-paying technical jobs',
        category: 'economic',
        evidence: [
          {
            type: 'fact',
            claim: 'Average data center employs 50-100 technical staff',
            source: 'Industry Report 2024',
            confidence: 'high',
          },
        ],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(evidencedArgument);
      expect(assessment.hasEvidence).toBe(true);
      expect(assessment.issues).not.toContain('Lacks supporting evidence');
    });

    it('rewards diverse evidence types', () => {
      const diverseArgument: Argument = {
        id: 'arg-7',
        title: 'Comprehensive Analysis',
        description: 'Multiple factors support this position',
        category: 'comprehensive',
        evidence: [
          {
            type: 'fact',
            claim: 'Historical data shows pattern',
            source: 'Research Study',
            confidence: 'high',
          },
          {
            type: 'projection',
            claim: 'Trend likely to continue',
            confidence: 'medium',
          },
          {
            type: 'analogy',
            claim: 'Similar to historical precedent',
          },
        ],
        assumptions: ['Trend reflects underlying mechanism'],
      };

      const assessment = assessArgumentQuality(diverseArgument);
      expect(assessment.strengths).toContain(
        'Uses diverse evidence types (fact, projection, analogy)'
      );
      expect(assessment.qualityScore).toBeGreaterThan(0.6);
    });
  });

  describe('Explicit Assumptions', () => {
    it('flags projections without explicit assumptions', () => {
      const argumentWithoutAssumptions: Argument = {
        id: 'arg-8',
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

    it('approves projections with explicit assumptions', () => {
      const argumentWithAssumptions: Argument = {
        id: 'arg-9',
        title: 'Energy Transition',
        description: 'Delaying expansion allows grid to transition to renewables',
        category: 'environmental',
        evidence: [
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
          'Government policies support renewable transition',
        ],
      };

      const assessment = assessArgumentQuality(argumentWithAssumptions);
      expect(assessment.hasExplicitAssumptions).toBe(true);
      expect(assessment.strengths).toContain('States 3 explicit assumption(s)');
    });

    it('does not require assumptions for fact-only arguments', () => {
      const factOnlyArgument: Argument = {
        id: 'arg-10',
        title: 'Current State',
        description: 'Data centers currently use significant energy',
        category: 'environmental',
        evidence: [
          {
            type: 'fact',
            claim: 'Data centers consume 1% of global electricity',
            source: 'IEA 2023',
            confidence: 'high',
          },
        ],
        assumptions: [], // No assumptions needed for pure facts
      };

      const assessment = assessArgumentQuality(factOnlyArgument);
      expect(assessment.hasExplicitAssumptions).toBe(true); // Should pass because no projections
    });
  });

  describe('Quality Scoring', () => {
    it('gives high score to strong steel-man arguments', () => {
      const strongArgument: Argument = {
        id: 'arg-11',
        title: 'Renewable Energy Transition',
        description:
          'Delaying data center expansion provides time for grid transition to renewables',
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
      expect(assessment.qualityScore).toBeGreaterThan(0.7);
    });

    it('gives low score to weak arguments', () => {
      const weakArgument: Argument = {
        id: 'arg-12',
        title: 'Bad Idea',
        description: 'The opposition hasn\'t thought this through',
        category: 'other',
        evidence: [],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(weakArgument);
      expect(assessment.isStrawman).toBe(true);
      expect(assessment.hasEvidence).toBe(false);
      expect(assessment.qualityScore).toBeLessThanOrEqual(0.3);
    });

    it('rewards high-confidence factual evidence', () => {
      const factBasedArgument: Argument = {
        id: 'arg-13',
        title: 'Evidence-Based Claim',
        description: 'Research demonstrates clear pattern',
        category: 'scientific',
        evidence: [
          {
            type: 'fact',
            claim: 'Study found 95% correlation',
            source: 'Peer-reviewed journal',
            confidence: 'high',
          },
          {
            type: 'fact',
            claim: 'Replicated in 5 independent studies',
            source: 'Meta-analysis',
            confidence: 'high',
          },
        ],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(factBasedArgument);
      expect(assessment.qualityScore).toBeGreaterThan(0.5);
    });
  });

  describe('Steel-Man Indicators', () => {
    it('recognizes constructive framing', () => {
      const steelmanArgument: Argument = {
        id: 'arg-14',
        title: 'Balanced Perspective',
        description:
          'This perspective considers valid concerns about economic impact while prioritizing environmental sustainability',
        category: 'comprehensive',
        evidence: [
          {
            type: 'fact',
            claim: 'Both economic and environmental factors matter',
            confidence: 'high',
          },
        ],
        assumptions: ['Trade-offs exist between competing priorities'],
      };

      const assessment = assessArgumentQuality(steelmanArgument);
      expect(assessment.strengths).toContain('Uses constructive, steel-man framing');
    });

    it('recognizes "valid concern" language', () => {
      const steelmanArgument: Argument = {
        id: 'arg-15',
        title: 'Acknowledging Opposition',
        description: 'The opposition raises a valid concern about job losses',
        category: 'economic',
        evidence: [
          {
            type: 'fact',
            claim: 'Industry employs 100,000 workers',
            source: 'Labor Statistics',
            confidence: 'high',
          },
        ],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(steelmanArgument);
      expect(assessment.strengths).toContain('Uses constructive, steel-man framing');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty arguments gracefully', () => {
      const emptyArgument: Argument = {
        id: 'arg-16',
        title: '',
        description: '',
        category: 'other',
        evidence: [],
        assumptions: [],
      };

      const assessment = assessArgumentQuality(emptyArgument);
      expect(assessment).toBeDefined();
      expect(assessment.qualityScore).toBeLessThanOrEqual(1);
      expect(assessment.qualityScore).toBeGreaterThanOrEqual(0);
    });

    it('handles very long arguments', () => {
      const longArgument: Argument = {
        id: 'arg-17',
        title: 'Comprehensive Analysis',
        description: 'A'.repeat(10000), // Very long description
        category: 'comprehensive',
        evidence: [
          {
            type: 'fact',
            claim: 'Test claim',
            confidence: 'high',
          },
        ],
        assumptions: ['Test assumption'],
      };

      const assessment = assessArgumentQuality(longArgument);
      expect(assessment).toBeDefined();
    });
  });
});

describe('Uncertainty Preservation in Evidence', () => {
  it('flags "definitely" in projections', () => {
    const evidence: Evidence[] = [
      {
        type: 'projection',
        claim: 'This will definitely reduce emissions by 20%',
        confidence: 'high',
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toContain('Projection uses absolute language: "definitely"');
  });

  it('flags high confidence on future projections', () => {
    const evidence: Evidence[] = [
      {
        type: 'projection',
        claim: 'Economic growth will accelerate',
        confidence: 'high',
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toContain('High confidence on future projection');
  });

  it('approves appropriately uncertain projections', () => {
    const evidence: Evidence[] = [
      {
        type: 'projection',
        claim: 'May reduce emissions by 15-25%',
        confidence: 'medium',
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toHaveLength(0);
  });

  it('approves high-confidence facts', () => {
    const evidence: Evidence[] = [
      {
        type: 'fact',
        claim: 'Data centers currently consume 1% of global electricity',
        source: 'IEA 2023',
        confidence: 'high',
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toHaveLength(0);
  });

  it('flags absolute language in value judgments', () => {
    const evidence: Evidence[] = [
      {
        type: 'value_judgment',
        claim: 'This is the only ethical choice',
        confidence: 'high',
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues).toContain('Value judgment uses absolute language: "the only"');
  });

  it('flags multiple certainty issues', () => {
    const evidence: Evidence[] = [
      {
        type: 'projection',
        claim: 'This will definitely happen',
        confidence: 'high',
      },
      {
        type: 'projection',
        claim: 'No doubt this will succeed',
        confidence: 'high',
      },
    ];

    const issues = checkUncertaintyPreservation(evidence);
    expect(issues.length).toBeGreaterThan(2); // Should catch multiple issues
  });
});
