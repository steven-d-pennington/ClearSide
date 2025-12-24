/**
 * Quality Validators for Prompt Outputs
 *
 * Reusable validators that check agent outputs for quality,
 * compliance with debate protocol, and adherence to ClearSide principles.
 */

import type { QualityCheck, QualityCheckResult } from './types.js';

// ============================================================================
// JSON & Structure Validators
// ============================================================================

/**
 * Validates that output is valid JSON
 */
export const jsonValidCheck: QualityCheck = {
  name: 'json_valid',
  description: 'Output must be valid JSON',
  severity: 'error',
  validator: (output: string): QualityCheckResult => {
    try {
      JSON.parse(output);
      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        message: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`,
      };
    }
  },
};

/**
 * Validates JSON has required fields
 */
export function createRequiredFieldsCheck(
  fields: string[],
  name = 'required_fields'
): QualityCheck {
  return {
    name,
    description: `Output must contain required fields: ${fields.join(', ')}`,
    severity: 'error',
    validator: (output: string): QualityCheckResult => {
      try {
        const parsed = JSON.parse(output);
        const missing = fields.filter((field) => !(field in parsed));

        if (missing.length > 0) {
          return {
            passed: false,
            message: `Missing required fields: ${missing.join(', ')}`,
          };
        }

        return { passed: true };
      } catch {
        return { passed: false, message: 'Cannot validate fields: invalid JSON' };
      }
    },
  };
}

// ============================================================================
// Neutrality & Bias Validators
// ============================================================================

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
 * Validates neutral language (no leading phrases)
 */
export const neutralLanguageCheck: QualityCheck = {
  name: 'neutral_language',
  description: 'Output must not contain biased or leading language',
  severity: 'error',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    for (const phrase of BIASED_PHRASES) {
      if (lowerOutput.includes(phrase)) {
        return {
          passed: false,
          message: `Biased phrase detected: "${phrase}"`,
          details: { phrase },
        };
      }
    }

    return { passed: true };
  },
};

/**
 * Winner-picking phrases that moderators must avoid
 */
const WINNER_PICKING_PHRASES = [
  'winner is',
  'wins the debate',
  'won the debate',
  'stronger argument',
  'weaker argument',
  'better case',
  'worse case',
  'i recommend',
  'you should',
  'the answer is',
  'the right choice',
  'the correct position',
  'clearly superior',
  'obviously correct',
  'i believe',
  'in my opinion',
  'my recommendation',
];

/**
 * Validates moderator neutrality (no winner picking)
 */
export const noWinnerPickingCheck: QualityCheck = {
  name: 'no_winner_picking',
  description: 'Moderator must not pick a winner or recommend action',
  severity: 'error',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    for (const phrase of WINNER_PICKING_PHRASES) {
      if (lowerOutput.includes(phrase)) {
        return {
          passed: false,
          message: `Winner-picking or recommendation detected: "${phrase}"`,
          details: { phrase },
        };
      }
    }

    return { passed: true };
  },
};

// ============================================================================
// Steel-Man & Straw-Man Validators
// ============================================================================

/**
 * Straw-man phrases that indicate unfair characterization
 */
const STRAWMAN_PHRASES = [
  'they claim',
  'they believe',
  'naive view',
  'simplistic',
  'foolish',
  'ridiculous',
  'absurd position',
  'silly argument',
  'misguided',
  'opponents think',
  'the other side says',
  'their flawed logic',
  'their mistake',
  'they fail to understand',
  'they ignore',
  'they conveniently forget',
];

/**
 * Validates no straw-man arguments
 */
export const noStrawmanCheck: QualityCheck = {
  name: 'no_strawman',
  description: 'Must not contain straw-man characterizations of opposing view',
  severity: 'error',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    for (const phrase of STRAWMAN_PHRASES) {
      if (lowerOutput.includes(phrase)) {
        return {
          passed: false,
          message: `Straw-man phrase detected: "${phrase}"`,
          details: { phrase },
        };
      }
    }

    return { passed: true };
  },
};

// ============================================================================
// Assumption & Uncertainty Validators
// ============================================================================

/**
 * Validates explicit assumption statements
 */
export const hasAssumptionsCheck: QualityCheck = {
  name: 'has_assumptions',
  description: 'Must explicitly state assumptions',
  severity: 'warning',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    const assumptionIndicators = [
      'assum',
      'premise',
      'presuppos',
      'given that',
      'if we accept',
      'this relies on',
      'this depends on',
      'underlying belief',
    ];

    const hasAssumptions = assumptionIndicators.some((indicator) =>
      lowerOutput.includes(indicator)
    );

    return {
      passed: hasAssumptions,
      message: hasAssumptions ? undefined : 'No explicit assumptions found in output',
    };
  },
};

/**
 * Validates uncertainty preservation (not over-claiming)
 */
export const preservesUncertaintyCheck: QualityCheck = {
  name: 'preserves_uncertainty',
  description: 'Must acknowledge uncertainty where appropriate',
  severity: 'warning',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    // Phrases that indicate false certainty
    const falseCertaintyPhrases = [
      'will definitely',
      'is guaranteed',
      'will certainly',
      'there is no doubt',
      'it is certain',
      'we know for sure',
      'will absolutely',
      'is proven that',
      'has been proven',
    ];

    for (const phrase of falseCertaintyPhrases) {
      if (lowerOutput.includes(phrase)) {
        return {
          passed: false,
          message: `False certainty detected: "${phrase}"`,
          details: { phrase },
        };
      }
    }

    // Check for uncertainty acknowledgment
    const uncertaintyIndicators = [
      'may',
      'might',
      'could',
      'uncertain',
      'unclear',
      'depends on',
      'if ',
      'potentially',
      'possibly',
      'likely',
      'unlikely',
      'evidence suggests',
      'appears to',
      'seems to',
    ];

    const acknowledgesUncertainty = uncertaintyIndicators.some((indicator) =>
      lowerOutput.includes(indicator)
    );

    // Warning if no uncertainty acknowledgment (not an error)
    if (!acknowledgesUncertainty && output.length > 500) {
      return {
        passed: true, // Still passes, but with warning
        message: 'Consider acknowledging uncertainty where appropriate',
        details: { warning: true },
      };
    }

    return { passed: true };
  },
};

// ============================================================================
// Evidence & Argument Structure Validators
// ============================================================================

/**
 * Evidence type indicators
 */
const EVIDENCE_TYPES = {
  fact: ['data shows', 'studies indicate', 'research demonstrates', 'statistics reveal'],
  projection: ['is expected to', 'will likely', 'projections suggest', 'forecast'],
  analogy: ['similar to', 'like when', 'just as', 'comparable to', 'parallels'],
  value: ['important that', 'we value', 'morally', 'ethically', 'should prioritize'],
};

/**
 * Validates evidence classification
 */
export const hasEvidenceClassificationCheck: QualityCheck = {
  name: 'has_evidence_classification',
  description: 'Arguments should classify evidence types',
  severity: 'warning',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    let foundTypes = 0;
    const typesFound: string[] = [];

    for (const [type, indicators] of Object.entries(EVIDENCE_TYPES)) {
      for (const indicator of indicators) {
        if (lowerOutput.includes(indicator)) {
          foundTypes++;
          typesFound.push(type);
          break;
        }
      }
    }

    if (foundTypes === 0 && output.length > 300) {
      return {
        passed: true, // Warning only
        message: 'Consider classifying evidence types (fact, projection, analogy, value)',
        details: { warning: true },
      };
    }

    return {
      passed: true,
      details: { typesFound },
    };
  },
};

// ============================================================================
// Phase-Specific Validators
// ============================================================================

/**
 * Validates no rebuttals in opening phase
 */
export const noRebuttalInOpeningCheck: QualityCheck = {
  name: 'no_rebuttal_in_opening',
  description: 'Opening statements must not rebut opponent (parallel construction)',
  severity: 'error',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    const rebuttalIndicators = [
      'my opponent',
      'the other side',
      'they argued',
      'in response to',
      'contrary to their',
      'however, they',
      'but they fail',
      'their argument',
      'rebutting',
      'counter to',
    ];

    for (const indicator of rebuttalIndicators) {
      if (lowerOutput.includes(indicator)) {
        return {
          passed: false,
          message: `Rebuttal detected in opening: "${indicator}"`,
          details: { indicator },
        };
      }
    }

    return { passed: true };
  },
};

/**
 * Validates no new arguments in rebuttal/closing
 */
export const noNewArgumentsCheck: QualityCheck = {
  name: 'no_new_arguments',
  description: 'Rebuttals and closings must not introduce new arguments',
  severity: 'warning',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    const newArgumentIndicators = [
      'additionally',
      'furthermore',
      'another point',
      'a new argument',
      'i would also add',
      'let me introduce',
      'here is a new',
    ];

    for (const indicator of newArgumentIndicators) {
      if (lowerOutput.includes(indicator)) {
        return {
          passed: false,
          message: `Potential new argument detected: "${indicator}"`,
          details: { indicator, warning: true },
        };
      }
    }

    return { passed: true };
  },
};

// ============================================================================
// Length & Format Validators
// ============================================================================

/**
 * Creates a word count validator
 */
export function createWordCountCheck(
  minWords: number,
  maxWords: number,
  name = 'word_count'
): QualityCheck {
  return {
    name,
    description: `Output must be between ${minWords} and ${maxWords} words`,
    severity: 'warning',
    validator: (output: string): QualityCheckResult => {
      const wordCount = output.split(/\s+/).filter((w) => w.length > 0).length;

      if (wordCount < minWords) {
        return {
          passed: false,
          message: `Too short: ${wordCount} words (minimum ${minWords})`,
          details: { wordCount, minWords, maxWords },
        };
      }

      if (wordCount > maxWords) {
        return {
          passed: false,
          message: `Too long: ${wordCount} words (maximum ${maxWords})`,
          details: { wordCount, minWords, maxWords },
        };
      }

      return { passed: true, details: { wordCount } };
    },
  };
}

/**
 * Validates professional tone
 */
export const professionalToneCheck: QualityCheck = {
  name: 'professional_tone',
  description: 'Output must maintain professional, non-chatty tone',
  severity: 'warning',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    const unprofessionalPhrases = [
      'lol',
      'haha',
      'omg',
      'btw',
      'tbh',
      "let's be real",
      'honestly',
      'like, ',
      'you know',
      'kinda',
      'gonna',
      'wanna',
      '!!',
      '???',
    ];

    for (const phrase of unprofessionalPhrases) {
      if (lowerOutput.includes(phrase)) {
        return {
          passed: false,
          message: `Unprofessional language detected: "${phrase}"`,
          details: { phrase },
        };
      }
    }

    return { passed: true };
  },
};

// ============================================================================
// Cross-Examination Validators
// ============================================================================

/**
 * Validates question format for cross-examination
 */
export const isQuestionFormatCheck: QualityCheck = {
  name: 'is_question_format',
  description: 'Cross-examination must contain actual questions',
  severity: 'error',
  validator: (output: string): QualityCheckResult => {
    const hasQuestionMark = output.includes('?');

    if (!hasQuestionMark) {
      return {
        passed: false,
        message: 'Cross-examination must contain questions (no ? found)',
      };
    }

    return { passed: true };
  },
};

/**
 * Validates direct answer (no evasion)
 */
export const directAnswerCheck: QualityCheck = {
  name: 'direct_answer',
  description: 'Response must directly answer the question',
  severity: 'warning',
  validator: (output: string): QualityCheckResult => {
    const lowerOutput = output.toLowerCase();

    const evasionIndicators = [
      "that's not the right question",
      'the real issue is',
      'let me redirect',
      "i won't answer",
      "that's irrelevant",
      'instead of answering',
    ];

    for (const indicator of evasionIndicators) {
      if (lowerOutput.includes(indicator)) {
        return {
          passed: false,
          message: `Potential evasion detected: "${indicator}"`,
          details: { indicator },
        };
      }
    }

    return { passed: true };
  },
};

// ============================================================================
// Export All Validators
// ============================================================================

export const QUALITY_VALIDATORS = {
  // JSON & Structure
  jsonValid: jsonValidCheck,
  createRequiredFields: createRequiredFieldsCheck,

  // Neutrality & Bias
  neutralLanguage: neutralLanguageCheck,
  noWinnerPicking: noWinnerPickingCheck,

  // Steel-Man & Straw-Man
  noStrawman: noStrawmanCheck,

  // Assumption & Uncertainty
  hasAssumptions: hasAssumptionsCheck,
  preservesUncertainty: preservesUncertaintyCheck,

  // Evidence & Structure
  hasEvidenceClassification: hasEvidenceClassificationCheck,

  // Phase-Specific
  noRebuttalInOpening: noRebuttalInOpeningCheck,
  noNewArguments: noNewArgumentsCheck,

  // Length & Format
  createWordCount: createWordCountCheck,
  professionalTone: professionalToneCheck,

  // Cross-Examination
  isQuestionFormat: isQuestionFormatCheck,
  directAnswer: directAnswerCheck,
} as const;
