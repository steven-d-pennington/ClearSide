/**
 * Uncertainty Preservation Tests
 *
 * Ensures agent outputs appropriately acknowledge and preserve uncertainty,
 * avoiding false confidence and absolute claims where inappropriate.
 */

import { describe, it, expect } from 'vitest';
import {
  checkUncertaintyPreservation,
  type Evidence,
} from '../../src/utils/validation/qualityChecks.js';

describe('Uncertainty Preservation in Agent Outputs', () => {
  describe('False Certainty in Projections', () => {
    it('flags "definitely" in projection claims', () => {
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

    it('flags "will certainly" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'The economy will certainly grow by 5%',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues.some((i) => i.includes('will certainly') || i.includes('certainly'))).toBe(
        true
      );
    });

    it('flags "guaranteed" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Success is guaranteed with this approach',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "guaranteed"');
    });

    it('flags "no doubt" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'There is no doubt this will succeed',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "no doubt"');
    });

    it('flags "absolutely will" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This absolutely will improve outcomes',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "absolutely will"');
    });

    it('flags "100%" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: '100% of users will benefit',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "100%"');
    });

    it('flags "always" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This approach always works',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "always"');
    });

    it('flags "never" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This will never fail',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "never"');
    });
  });

  describe('Inappropriate Confidence Levels', () => {
    it('flags high confidence on future projections', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Economic growth will accelerate next year',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('High confidence on future projection');
    });

    it('flags multiple high-confidence projections', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Market will grow',
          confidence: 'high',
        },
        {
          type: 'projection',
          claim: 'Technology will improve',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues.filter((i) => i.includes('High confidence')).length).toBe(2);
    });

    it('accepts medium confidence on projections', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Growth likely to continue',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      const confidenceIssues = issues.filter((i) => i.includes('High confidence'));
      expect(confidenceIssues).toHaveLength(0);
    });

    it('accepts low confidence on projections', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Possible future scenario',
          confidence: 'low',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      const confidenceIssues = issues.filter((i) => i.includes('High confidence'));
      expect(confidenceIssues).toHaveLength(0);
    });
  });

  describe('Appropriate Uncertainty Language', () => {
    it('approves "may" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This may reduce emissions by 15-25%',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });

    it('approves "likely" in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Growth is likely to continue',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });

    it('approves ranges in projection claims', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Emissions could decrease by 10-30%',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });

    it('approves conditional language', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'If renewable adoption continues, emissions may decrease',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Facts vs Projections', () => {
    it('allows high confidence for factual claims', () => {
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

    it('allows definitive language for well-sourced facts', () => {
      const evidence: Evidence[] = [
        {
          type: 'fact',
          claim: 'Studies have proven the correlation',
          source: 'Meta-analysis 2024',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });

    it('differentiates between facts and projections', () => {
      const evidence: Evidence[] = [
        {
          type: 'fact',
          claim: 'Current consumption is 1%',
          confidence: 'high',
        },
        {
          type: 'projection',
          claim: 'Future consumption will be 2%',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      // Should only flag the projection, not the fact
      expect(issues).toContain('High confidence on future projection');
      expect(issues.length).toBe(1);
    });
  });

  describe('Value Judgments', () => {
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

    it('flags "must always" in value judgments', () => {
      const evidence: Evidence[] = [
        {
          type: 'value_judgment',
          claim: 'We must always prioritize environment over economy',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Value judgment uses absolute language: "must always"');
    });

    it('flags "everyone agrees" in value judgments', () => {
      const evidence: Evidence[] = [
        {
          type: 'value_judgment',
          claim: 'Everyone agrees this is important',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Value judgment uses absolute language: "everyone agrees"');
    });

    it('approves nuanced value judgments', () => {
      const evidence: Evidence[] = [
        {
          type: 'value_judgment',
          claim: 'Many ethicists argue this approach is preferable',
          confidence: 'medium',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Analogies', () => {
    it('allows analogies without false certainty checks', () => {
      const evidence: Evidence[] = [
        {
          type: 'analogy',
          claim: 'Similar to the renewable energy transition in the 2000s',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });

    it('does not flag analogies for confidence levels', () => {
      const evidence: Evidence[] = [
        {
          type: 'analogy',
          claim: 'Just like previous technology transitions',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });
  });

  describe('Mixed Evidence Collections', () => {
    it('flags issues in mixed evidence types', () => {
      const evidence: Evidence[] = [
        {
          type: 'fact',
          claim: 'Current state is X',
          confidence: 'high',
        },
        {
          type: 'projection',
          claim: 'This will definitely happen',
          confidence: 'high',
        },
        {
          type: 'value_judgment',
          claim: 'This is the only option',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues.length).toBeGreaterThan(1);
      expect(issues.some((i) => i.includes('Projection'))).toBe(true);
      expect(issues.some((i) => i.includes('Value judgment'))).toBe(true);
    });

    it('handles empty evidence array', () => {
      const evidence: Evidence[] = [];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toHaveLength(0);
    });

    it('handles evidence without confidence levels', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'Future outcome possible',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      // Should not crash, might have issues for language but not confidence
      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles very long claim text', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'A'.repeat(10000) + ' definitely',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toBeDefined();
    });

    it('handles claims with multiple false certainty phrases', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This will definitely, certainly, and guaranteed happen 100% always',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues.length).toBeGreaterThan(1);
    });

    it('is case insensitive for phrase detection', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This will DEFINITELY happen',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      expect(issues).toContain('Projection uses absolute language: "definitely"');
    });
  });

  describe('Integration with Quality Assessment', () => {
    it('catches uncertainty issues that reduce argument quality', () => {
      const evidence: Evidence[] = [
        {
          type: 'projection',
          claim: 'This will definitely reduce costs by 50%',
          confidence: 'high',
        },
        {
          type: 'projection',
          claim: 'Success is 100% guaranteed',
          confidence: 'high',
        },
      ];

      const issues = checkUncertaintyPreservation(evidence);
      // Should catch multiple issues
      expect(issues.length).toBeGreaterThanOrEqual(4); // Multiple phrases + confidence issues
    });
  });
});
