/**
 * Neutrality Checks for Moderator Outputs
 *
 * Utilities for ensuring moderator maintains neutrality and doesn't
 * pick winners, make recommendations, or use biased language.
 */

/**
 * Moderator synthesis interface
 */
export interface ModeratorSynthesis {
  summary: string;
  agreements: string[];
  disagreements: string[];
  hinges: string[];
}

/**
 * Neutrality assessment result
 */
export interface NeutralityAssessment {
  /** Whether the synthesis is neutral */
  isNeutral: boolean;

  /** List of bias indicators found */
  biasIndicators: string[];

  /** List of neutral strengths found */
  strengths: string[];
}

/**
 * Biased phrases that indicate non-neutral language
 */
const BIASED_PHRASES = [
  'obviously',
  'clearly',
  'of course',
  'everyone knows',
  'it is obvious',
  'undeniably',
  'unquestionably',
  'without a doubt',
  'certainly',
  'definitely',
  'absolutely',
  'no one can deny',
  'the truth is',
  'the fact is',
  'only a fool',
  'any reasonable person',
];

/**
 * Winner-picking phrases
 */
const WINNER_PICKING_PHRASES = [
  'winner is',
  'wins the debate',
  'wins this debate',
  'won the debate',
  'stronger',
  'weaker argument',
  'better case',
  'worse case',
  'more compelling',
  'less compelling',
  'superior',
  'inferior',
  'prevails',
  'defeats',
  'the correct',
  'the right answer',
];

/**
 * Recommendation phrases (moderator should not recommend)
 */
const RECOMMENDATION_PHRASES = [
  'i recommend',
  'you should',
  'we should',
  'the answer is',
  'the right choice',
  'the correct position',
  'i believe',
  'in my opinion',
  'my recommendation',
  'i suggest',
  'it would be best',
  'the better option',
  'adopt this position',
  'support this view',
  'oppose this view',
];

/**
 * Neutral framing indicators (positive)
 */
const NEUTRAL_INDICATORS = [
  'both sides',
  'each perspective',
  'different priorities',
  'trade-offs',
  'depends on',
  'hinges on',
  'reasonable people disagree',
  'multiple considerations',
  'competing values',
  'different frameworks',
  'various stakeholders',
];

/**
 * Assess moderator neutrality
 *
 * @param synthesis - The moderator synthesis to assess
 * @returns Neutrality assessment result
 */
export function assessModeratorNeutrality(
  synthesis: ModeratorSynthesis
): NeutralityAssessment {
  const biasIndicators: string[] = [];
  const strengths: string[] = [];

  const fullText = [
    synthesis.summary,
    ...synthesis.agreements,
    ...synthesis.disagreements,
    ...synthesis.hinges,
  ].join(' ');

  const lowerText = fullText.toLowerCase();

  // Check for biased language
  for (const phrase of BIASED_PHRASES) {
    if (lowerText.includes(phrase)) {
      biasIndicators.push(`Uses absolute language: "${phrase}"`);
    }
  }

  // Check for winner-picking
  for (const phrase of WINNER_PICKING_PHRASES) {
    if (lowerText.includes(phrase)) {
      biasIndicators.push('Declares winner');
      break; // Only add once
    }
  }

  // Check for recommendations
  for (const phrase of RECOMMENDATION_PHRASES) {
    if (lowerText.includes(phrase)) {
      biasIndicators.push('Makes recommendation');
      break; // Only add once
    }
  }

  // Check for neutral framing (strengths)
  for (const indicator of NEUTRAL_INDICATORS) {
    if (lowerText.includes(indicator)) {
      strengths.push(`Uses neutral framing: "${indicator}"`);
    }
  }

  // Check structure indicates balance
  if (synthesis.agreements.length > 0) {
    strengths.push(`Identifies ${synthesis.agreements.length} area(s) of agreement`);
  }

  if (synthesis.disagreements.length > 0) {
    strengths.push(`Identifies ${synthesis.disagreements.length} area(s) of disagreement`);
  }

  if (synthesis.hinges.length > 0) {
    strengths.push(`Identifies ${synthesis.hinges.length} key hinge(s)`);
  }

  const isNeutral = biasIndicators.length === 0;

  return {
    isNeutral,
    biasIndicators,
    strengths,
  };
}

/**
 * Check if text contains winner-picking language
 *
 * @param text - Text to check
 * @returns True if winner-picking detected
 */
export function containsWinnerPicking(text: string): boolean {
  const lowerText = text.toLowerCase();

  for (const phrase of WINNER_PICKING_PHRASES) {
    if (lowerText.includes(phrase)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if text contains recommendation language
 *
 * @param text - Text to check
 * @returns True if recommendation detected
 */
export function containsRecommendation(text: string): boolean {
  const lowerText = text.toLowerCase();

  for (const phrase of RECOMMENDATION_PHRASES) {
    if (lowerText.includes(phrase)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if text uses biased language
 *
 * @param text - Text to check
 * @returns List of biased phrases found
 */
export function findBiasedLanguage(text: string): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const phrase of BIASED_PHRASES) {
    if (lowerText.includes(phrase)) {
      found.push(phrase);
    }
  }

  return found;
}
