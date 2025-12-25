/**
 * Quality Checks for Agent Outputs
 *
 * Utilities for assessing argument quality, detecting straw-man arguments,
 * and ensuring arguments meet steel-man quality standards.
 */

/**
 * Evidence types in ClearSide
 */
export type EvidenceType = 'fact' | 'projection' | 'analogy' | 'value_judgment';

/**
 * Confidence levels
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * Evidence interface
 */
export interface Evidence {
  type: EvidenceType;
  claim: string;
  source?: string;
  confidence?: ConfidenceLevel;
}

/**
 * Argument interface
 */
export interface Argument {
  id: string;
  title: string;
  description: string;
  category: string;
  evidence: Evidence[];
  assumptions: string[];
}

/**
 * Quality assessment result
 */
export interface QualityAssessment {
  /** Whether this is a straw-man argument */
  isStrawman: boolean;

  /** Whether the argument has supporting evidence */
  hasEvidence: boolean;

  /** Whether assumptions are explicit */
  hasExplicitAssumptions: boolean;

  /** Overall quality score (0-1) */
  qualityScore: number;

  /** List of quality issues found */
  issues: string[];

  /** List of strengths found */
  strengths: string[];
}

/**
 * Straw-man indicator phrases
 */
const STRAWMAN_INDICATORS = [
  'opponents are irrational',
  'clearly haven\'t thought',
  'clearly hasn\'t thought',
  'haven\'t thought this through',
  'obviously wrong',
  'stupid',
  'foolish',
  'ridiculous argument',
  'naive',
  'simplistic view',
  'anyone with common sense',
  'only an idiot',
  'no one in their right mind',
  'dismiss',
  'ignore the facts',
  'conveniently forget',
  'they claim',
  'they believe',
  'their flawed logic',
  'bad idea',
  'opposition hasn\'t thought',
];

/**
 * Positive steel-man indicators
 */
const STEELMAN_INDICATORS = [
  'perspective considers',
  'valid concern',
  'reasonable to consider',
  'important point',
  'legitimate consideration',
  'understandable concern',
  'thoughtful approach',
  'well-reasoned',
  'substantive argument',
  'credible evidence',
  'worth considering',
];

/**
 * Assess the quality of an argument
 *
 * @param argument - The argument to assess
 * @returns Quality assessment result
 */
export function assessArgumentQuality(argument: Argument): QualityAssessment {
  const issues: string[] = [];
  const strengths: string[] = [];

  // Check for straw-man indicators
  const isStrawman = detectStrawman(argument, issues);

  // Check for evidence
  const hasEvidence = argument.evidence.length > 0;
  if (!hasEvidence) {
    issues.push('Lacks supporting evidence');
  } else {
    strengths.push(`Includes ${argument.evidence.length} evidence item(s)`);
  }

  // Check for explicit assumptions when projections are used
  const hasProjections = argument.evidence.some((e) => e.type === 'projection');
  const hasAssumptions = argument.assumptions.length > 0;
  const hasExplicitAssumptions = !hasProjections || hasAssumptions;

  if (hasProjections && !hasAssumptions) {
    issues.push('Projections lack explicit assumptions');
  } else if (hasAssumptions) {
    strengths.push(`States ${argument.assumptions.length} explicit assumption(s)`);
  }

  // Check for diverse evidence types
  const evidenceTypes = new Set(argument.evidence.map((e) => e.type));
  if (evidenceTypes.size > 1) {
    strengths.push(`Uses diverse evidence types (${Array.from(evidenceTypes).join(', ')})`);
  }

  // Check for steel-man indicators
  const hasPositiveFraming = detectSteelmanIndicators(argument);
  if (hasPositiveFraming) {
    strengths.push('Uses constructive, steel-man framing');
  }

  // Calculate quality score
  let qualityScore = 0;

  // Base score from evidence
  if (hasEvidence) qualityScore += 0.3;
  if (hasExplicitAssumptions) qualityScore += 0.2;

  // Evidence quality bonus
  const highConfidenceEvidence = argument.evidence.filter(
    (e) => e.confidence === 'high' && e.type === 'fact'
  );
  qualityScore += Math.min(0.25, highConfidenceEvidence.length * 0.1);

  // Diversity bonus
  if (evidenceTypes.size > 1) qualityScore += 0.15;

  // Steel-man bonus
  if (hasPositiveFraming) qualityScore += 0.15;

  // Straw-man penalty
  if (isStrawman) qualityScore = Math.max(0, qualityScore - 0.5);

  // Assumption penalty
  if (!hasExplicitAssumptions) qualityScore -= 0.15;

  // Ensure score is in [0, 1]
  qualityScore = Math.max(0, Math.min(1, qualityScore));

  return {
    isStrawman,
    hasEvidence,
    hasExplicitAssumptions,
    qualityScore,
    issues,
    strengths,
  };
}

/**
 * Detect straw-man arguments
 *
 * @param argument - The argument to check
 * @param issues - Array to append issues to
 * @returns True if straw-man detected
 */
function detectStrawman(argument: Argument, issues: string[]): boolean {
  const fullText = `${argument.title} ${argument.description}`.toLowerCase();

  for (const indicator of STRAWMAN_INDICATORS) {
    if (fullText.includes(indicator.toLowerCase())) {
      issues.push(`Dismisses opposition as irrational: "${indicator}"`);
      return true;
    }
  }

  return false;
}

/**
 * Detect steel-man indicators
 *
 * @param argument - The argument to check
 * @returns True if steel-man indicators found
 */
function detectSteelmanIndicators(argument: Argument): boolean {
  const fullText = `${argument.title} ${argument.description}`.toLowerCase();

  for (const indicator of STEELMAN_INDICATORS) {
    if (fullText.includes(indicator.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Check for uncertainty preservation in evidence
 *
 * @param evidence - Array of evidence to check
 * @returns Array of issues found
 */
export function checkUncertaintyPreservation(evidence: Evidence[]): string[] {
  const issues: string[] = [];

  // Phrases that indicate false certainty
  const falseCertaintyPhrases = [
    'will definitely',
    'will certainly',
    'definitely',
    'certainly will',
    'guaranteed',
    'is certain',
    'no doubt',
    'absolutely will',
    'proven fact',
    'undeniably',
    '100%',
    'always',
    'never',
  ];

  for (const item of evidence) {
    const lowerClaim = item.claim.toLowerCase();

    // Check for false certainty in projections
    if (item.type === 'projection') {
      for (const phrase of falseCertaintyPhrases) {
        if (lowerClaim.includes(phrase)) {
          issues.push(`Projection uses absolute language: "${phrase}"`);
        }
      }

      // Check for inappropriate high confidence on projections
      if (item.confidence === 'high') {
        issues.push('High confidence on future projection');
      }
    }

    // Check for false certainty in value judgments
    if (item.type === 'value_judgment') {
      const absoluteValuePhrases = ['the only', 'must always', 'everyone agrees'];
      for (const phrase of absoluteValuePhrases) {
        if (lowerClaim.includes(phrase)) {
          issues.push(`Value judgment uses absolute language: "${phrase}"`);
        }
      }
    }
  }

  return issues;
}
