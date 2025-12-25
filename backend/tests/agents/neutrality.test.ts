/**
 * Moderator Neutrality Tests
 *
 * Ensures moderator maintains strict neutrality and never picks winners.
 */

import { describe, it, expect } from 'vitest';
import {
  assessModeratorNeutrality,
  containsWinnerPicking,
  containsRecommendation,
  findBiasedLanguage,
  type ModeratorSynthesis,
} from '../../src/utils/validation/neutralityChecks.js';

describe('Moderator Neutrality Assessment', () => {
  describe('Biased Language Detection', () => {
    it('detects "clearly" as biased language', () => {
      const biasedSynthesis: ModeratorSynthesis = {
        summary: 'Clearly, the pro side has better arguments',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(biasedSynthesis);
      expect(assessment.isNeutral).toBe(false);
      expect(assessment.biasIndicators).toContain('Uses absolute language: "clearly"');
    });

    it('detects "obviously" as biased language', () => {
      const biasedSynthesis: ModeratorSynthesis = {
        summary: 'The environmental concerns are obviously more important',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(biasedSynthesis);
      expect(assessment.isNeutral).toBe(false);
      expect(assessment.biasIndicators).toContain('Uses absolute language: "obviously"');
    });

    it('detects "undeniably" as biased language', () => {
      const biasedSynthesis: ModeratorSynthesis = {
        summary: 'This is undeniably the correct approach',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(biasedSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });

    it('detects biased language in agreements section', () => {
      const biasedSynthesis: ModeratorSynthesis = {
        summary: 'Both perspectives have merit',
        agreements: ['Both clearly agree that action is needed'],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(biasedSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });
  });

  describe('Winner-Picking Detection', () => {
    it('detects "stronger argument" as winner-picking', () => {
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

    it('detects "wins the debate" as winner-picking', () => {
      const winnerPickingSynthesis: ModeratorSynthesis = {
        summary: 'The pro side wins the debate on environmental grounds',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(winnerPickingSynthesis);
      expect(assessment.isNeutral).toBe(false);
      expect(assessment.biasIndicators).toContain('Declares winner');
    });

    it('detects "better case" as winner-picking', () => {
      const winnerPickingSynthesis: ModeratorSynthesis = {
        summary: 'The con side makes a better case',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(winnerPickingSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });

    it('detects "more compelling" as winner-picking', () => {
      const winnerPickingSynthesis: ModeratorSynthesis = {
        summary: 'The environmental arguments are more compelling',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(winnerPickingSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });
  });

  describe('Recommendation Detection', () => {
    it('detects "you should" as recommendation', () => {
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

    it('detects "I recommend" as recommendation', () => {
      const recommendingSynthesis: ModeratorSynthesis = {
        summary: 'I recommend adopting the pro position',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(recommendingSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });

    it('detects "the answer is" as recommendation', () => {
      const recommendingSynthesis: ModeratorSynthesis = {
        summary: 'The answer is to implement the moratorium',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(recommendingSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });

    it('detects "the right choice" as recommendation', () => {
      const recommendingSynthesis: ModeratorSynthesis = {
        summary: 'Protecting the environment is the right choice',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(recommendingSynthesis);
      expect(assessment.isNeutral).toBe(false);
    });
  });

  describe('Neutral Synthesis Examples', () => {
    it('approves neutral synthesis focusing on trade-offs', () => {
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
      expect(assessment.strengths.length).toBeGreaterThan(0);
    });

    it('approves synthesis identifying competing values', () => {
      const neutralSynthesis: ModeratorSynthesis = {
        summary: 'This debate hinges on how we prioritize competing values: environmental protection versus economic growth',
        agreements: ['Both recognize the importance of sustainable development'],
        disagreements: ['Timeline and urgency of action'],
        hinges: ['Cost-benefit analysis of delay', 'Reversibility of environmental damage'],
      };

      const assessment = assessModeratorNeutrality(neutralSynthesis);
      expect(assessment.isNeutral).toBe(true);
    });

    it('approves synthesis using "different perspectives"', () => {
      const neutralSynthesis: ModeratorSynthesis = {
        summary: 'Each perspective offers valid considerations based on different priorities',
        agreements: [],
        disagreements: ['Fundamental values prioritized'],
        hinges: ['Individual risk tolerance', 'Time horizon considered'],
      };

      const assessment = assessModeratorNeutrality(neutralSynthesis);
      expect(assessment.isNeutral).toBe(true);
    });

    it('approves synthesis acknowledging uncertainty', () => {
      const neutralSynthesis: ModeratorSynthesis = {
        summary: 'The optimal policy depends on factors with significant uncertainty',
        agreements: ['Both acknowledge uncertainty in future outcomes'],
        disagreements: ['How to respond to uncertainty'],
        hinges: [
          'Future renewable energy costs',
          'AI innovation trajectory',
          'Political feasibility of moratorium',
        ],
      };

      const assessment = assessModeratorNeutrality(neutralSynthesis);
      expect(assessment.isNeutral).toBe(true);
    });
  });

  describe('Structural Neutrality Indicators', () => {
    it('recognizes balanced structure with agreements and disagreements', () => {
      const balancedSynthesis: ModeratorSynthesis = {
        summary: 'Multiple considerations inform this question',
        agreements: ['Both value sustainability', 'Both recognize AI\'s potential'],
        disagreements: ['Timeline urgency', 'Risk assessment'],
        hinges: ['Renewable transition speed'],
      };

      const assessment = assessModeratorNeutrality(balancedSynthesis);
      expect(assessment.strengths).toContain('Identifies 2 area(s) of agreement');
      expect(assessment.strengths).toContain('Identifies 2 area(s) of disagreement');
      expect(assessment.strengths).toContain('Identifies 1 key hinge(s)');
    });

    it('recognizes neutral framing with "both sides"', () => {
      const neutralSynthesis: ModeratorSynthesis = {
        summary: 'Both sides present evidence-based arguments',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(neutralSynthesis);
      expect(assessment.strengths.some((s) => s.includes('neutral framing'))).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('containsWinnerPicking detects winner language', () => {
      expect(containsWinnerPicking('The pro side wins this debate')).toBe(true);
      expect(containsWinnerPicking('The arguments are stronger on one side')).toBe(true);
      expect(containsWinnerPicking('Both sides make valid points')).toBe(false);
    });

    it('containsRecommendation detects recommendation language', () => {
      expect(containsRecommendation('You should support this position')).toBe(true);
      expect(containsRecommendation('I recommend the pro side')).toBe(true);
      expect(containsRecommendation('Different values lead to different conclusions')).toBe(false);
    });

    it('findBiasedLanguage detects biased phrases', () => {
      const biased = findBiasedLanguage('Obviously this is the right choice');
      expect(biased).toContain('obviously');

      const neutral = findBiasedLanguage('Both perspectives have merit');
      expect(neutral).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty synthesis', () => {
      const emptySynthesis: ModeratorSynthesis = {
        summary: '',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(emptySynthesis);
      expect(assessment).toBeDefined();
      expect(assessment.isNeutral).toBe(true); // Empty is neutral by default
    });

    it('handles synthesis with only summary', () => {
      const minimalSynthesis: ModeratorSynthesis = {
        summary: 'Different frameworks lead to different conclusions',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(minimalSynthesis);
      expect(assessment.isNeutral).toBe(true);
    });

    it('handles very long synthesis text', () => {
      const longSynthesis: ModeratorSynthesis = {
        summary: 'A'.repeat(10000),
        agreements: Array(100).fill('Agreement point'),
        disagreements: Array(100).fill('Disagreement point'),
        hinges: Array(100).fill('Hinge point'),
      };

      const assessment = assessModeratorNeutrality(longSynthesis);
      expect(assessment).toBeDefined();
    });

    it('detects bias even with many neutral indicators', () => {
      const mixedSynthesis: ModeratorSynthesis = {
        summary: 'Both sides make points, different perspectives exist, but clearly the pro side is right',
        agreements: ['Both value X'],
        disagreements: ['Timeline'],
        hinges: ['Factor Y'],
      };

      const assessment = assessModeratorNeutrality(mixedSynthesis);
      expect(assessment.isNeutral).toBe(false); // Bias should override neutral indicators
    });
  });

  describe('Case Insensitivity', () => {
    it('detects biased language regardless of case', () => {
      const upperCaseBias: ModeratorSynthesis = {
        summary: 'CLEARLY the better argument',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(upperCaseBias);
      expect(assessment.isNeutral).toBe(false);
    });

    it('detects winner-picking in mixed case', () => {
      const mixedCaseBias: ModeratorSynthesis = {
        summary: 'The Stronger Argument is obvious',
        agreements: [],
        disagreements: [],
        hinges: [],
      };

      const assessment = assessModeratorNeutrality(mixedCaseBias);
      expect(assessment.isNeutral).toBe(false);
    });
  });
});
