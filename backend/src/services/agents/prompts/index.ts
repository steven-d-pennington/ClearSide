/**
 * Prompt Library - Main Export
 *
 * Centralized export for all prompt templates, builders, validators,
 * and testing infrastructure for the ClearSide debate platform.
 */

// Types
export type {
  AgentType,
  PromptType,
  QualityCheck,
  QualityCheckResult,
  PromptTemplate,
  PromptExample,
  PromptTestCase,
  TestCaseResult,
  PromptTestResult,
  VersionDiff,
  PromptRegistryEntry,
  ConstructiveRound,
  CrossExamRole,
  PromptBuilderContext,
} from './types.js';

// Quality Validators
export {
  QUALITY_VALIDATORS,
  jsonValidCheck,
  neutralLanguageCheck,
  noWinnerPickingCheck,
  noStrawmanCheck,
  hasAssumptionsCheck,
  preservesUncertaintyCheck,
  hasEvidenceClassificationCheck,
  noRebuttalInOpeningCheck,
  noNewArgumentsCheck,
  professionalToneCheck,
  isQuestionFormatCheck,
  directAnswerCheck,
  createRequiredFieldsCheck,
  createWordCountCheck,
} from './quality-validators.js';

// Orchestrator Prompts (existing)
export {
  ORCHESTRATOR_SYSTEM_PROMPT,
  buildOrchestratorPrompt,
  NORMALIZATION_EXAMPLES,
} from './orchestrator-prompts.js';

// Pro Advocate Prompts
export {
  PRO_ADVOCATE_PROMPTS,
  PRO_PROMPT_BUILDERS,
  ProOpeningPrompt,
  ProConstructiveEconomicPrompt,
  ProConstructiveEthicalPrompt,
  ProConstructivePracticalPrompt,
  ProCrossExamQuestionerPrompt,
  ProCrossExamRespondentPrompt,
  ProRebuttalPrompt,
  ProClosingPrompt,
  ProInterventionPrompt,
  buildProOpeningUserPrompt,
  buildProConstructiveUserPrompt,
  buildProCrossExamUserPrompt,
  buildProRebuttalUserPrompt,
  buildProClosingUserPrompt,
} from './pro-advocate-prompts.js';

// Con Advocate Prompts
export {
  CON_ADVOCATE_PROMPTS,
  CON_PROMPT_BUILDERS,
  ConOpeningPrompt,
  ConConstructiveEconomicPrompt,
  ConConstructiveEthicalPrompt,
  ConConstructivePracticalPrompt,
  ConCrossExamQuestionerPrompt,
  ConCrossExamRespondentPrompt,
  ConRebuttalPrompt,
  ConClosingPrompt,
  ConInterventionPrompt,
  buildConOpeningUserPrompt,
  buildConConstructiveUserPrompt,
  buildConCrossExamUserPrompt,
  buildConRebuttalUserPrompt,
  buildConClosingUserPrompt,
} from './con-advocate-prompts.js';

// Moderator Prompts
export {
  MODERATOR_PROMPTS,
  MODERATOR_PROMPT_BUILDERS,
  ModeratorIntroductionPrompt,
  ModeratorPhaseTransitionPrompt,
  ModeratorSynthesisPrompt,
  ModeratorInterventionPrompt,
  buildModeratorIntroUserPrompt,
  buildModeratorTransitionUserPrompt,
  buildModeratorSynthesisUserPrompt,
  buildModeratorInterventionUserPrompt,
} from './moderator-prompts.js';

// Version Control
export {
  PromptVersionControl,
  PromptRegistry,
  promptRegistry,
  loadPromptsIntoRegistry,
} from './version-control.js';

// Testing Framework
export {
  PromptTester,
  MockLLMClient,
  COMMON_TEST_CASES,
  createPromptTester,
  type PromptTesterConfig,
} from './prompt-tester.js';

// ============================================================================
// Combined Prompt Library Export
// ============================================================================

import { PRO_ADVOCATE_PROMPTS } from './pro-advocate-prompts.js';
import { CON_ADVOCATE_PROMPTS } from './con-advocate-prompts.js';
import { MODERATOR_PROMPTS } from './moderator-prompts.js';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './orchestrator-prompts.js';
import type { PromptTemplate } from './types.js';
import { DebatePhase } from '../../../types/debate.js';

/**
 * Complete prompt library organized by agent and phase
 */
export const PROMPT_LIBRARY = {
  orchestrator: {
    normalization: {
      system: ORCHESTRATOR_SYSTEM_PROMPT,
    },
  },

  pro: {
    opening: PRO_ADVOCATE_PROMPTS.opening,
    constructive: PRO_ADVOCATE_PROMPTS.constructive,
    crossExam: PRO_ADVOCATE_PROMPTS.crossExam,
    rebuttal: PRO_ADVOCATE_PROMPTS.rebuttal,
    closing: PRO_ADVOCATE_PROMPTS.closing,
    intervention: PRO_ADVOCATE_PROMPTS.intervention,
  },

  con: {
    opening: CON_ADVOCATE_PROMPTS.opening,
    constructive: CON_ADVOCATE_PROMPTS.constructive,
    crossExam: CON_ADVOCATE_PROMPTS.crossExam,
    rebuttal: CON_ADVOCATE_PROMPTS.rebuttal,
    closing: CON_ADVOCATE_PROMPTS.closing,
    intervention: CON_ADVOCATE_PROMPTS.intervention,
  },

  moderator: {
    introduction: MODERATOR_PROMPTS.introduction,
    transition: MODERATOR_PROMPTS.transition,
    synthesis: MODERATOR_PROMPTS.synthesis,
    intervention: MODERATOR_PROMPTS.intervention,
  },
} as const;

/**
 * Get all prompt templates as a flat array
 */
export function getAllPromptTemplates(): PromptTemplate[] {
  const templates: PromptTemplate[] = [];

  // Pro prompts
  templates.push(PRO_ADVOCATE_PROMPTS.opening);
  templates.push(PRO_ADVOCATE_PROMPTS.constructive.economic);
  templates.push(PRO_ADVOCATE_PROMPTS.constructive.ethical);
  templates.push(PRO_ADVOCATE_PROMPTS.constructive.practical);
  templates.push(PRO_ADVOCATE_PROMPTS.crossExam.questioner);
  templates.push(PRO_ADVOCATE_PROMPTS.crossExam.respondent);
  templates.push(PRO_ADVOCATE_PROMPTS.rebuttal);
  templates.push(PRO_ADVOCATE_PROMPTS.closing);
  templates.push(PRO_ADVOCATE_PROMPTS.intervention);

  // Con prompts
  templates.push(CON_ADVOCATE_PROMPTS.opening);
  templates.push(CON_ADVOCATE_PROMPTS.constructive.economic);
  templates.push(CON_ADVOCATE_PROMPTS.constructive.ethical);
  templates.push(CON_ADVOCATE_PROMPTS.constructive.practical);
  templates.push(CON_ADVOCATE_PROMPTS.crossExam.questioner);
  templates.push(CON_ADVOCATE_PROMPTS.crossExam.respondent);
  templates.push(CON_ADVOCATE_PROMPTS.rebuttal);
  templates.push(CON_ADVOCATE_PROMPTS.closing);
  templates.push(CON_ADVOCATE_PROMPTS.intervention);

  // Moderator prompts
  templates.push(MODERATOR_PROMPTS.introduction);
  templates.push(MODERATOR_PROMPTS.transition);
  templates.push(MODERATOR_PROMPTS.synthesis);
  templates.push(MODERATOR_PROMPTS.intervention);

  return templates;
}

/**
 * Get prompt for a specific agent, phase, and purpose
 */
export function getPrompt(
  agent: 'pro' | 'con' | 'moderator',
  phase: DebatePhase | 'intervention' | 'introduction' | 'transition',
  variant?: 'economic' | 'ethical' | 'practical' | 'questioner' | 'respondent'
): PromptTemplate | null {
  const library = PROMPT_LIBRARY[agent];
  if (!library) return null;

  // Handle special phases
  if (phase === 'intervention') {
    return library.intervention || null;
  }

  if (agent === 'moderator') {
    if (phase === 'introduction') return MODERATOR_PROMPTS.introduction;
    if (phase === 'transition') return MODERATOR_PROMPTS.transition;
    if (phase === DebatePhase.PHASE_6_SYNTHESIS) return MODERATOR_PROMPTS.synthesis;
    return null;
  }

  // Map DebatePhase to prompt key
  const phaseMap: Record<DebatePhase, string> = {
    [DebatePhase.INITIALIZING]: '',
    [DebatePhase.PHASE_1_OPENING]: 'opening',
    [DebatePhase.PHASE_2_CONSTRUCTIVE]: 'constructive',
    [DebatePhase.PHASE_3_CROSSEXAM]: 'crossExam',
    [DebatePhase.PHASE_4_REBUTTAL]: 'rebuttal',
    [DebatePhase.PHASE_5_CLOSING]: 'closing',
    [DebatePhase.PHASE_6_SYNTHESIS]: '',
    [DebatePhase.COMPLETED]: '',
    [DebatePhase.PAUSED]: '',
    [DebatePhase.ERROR]: '',
  };

  const phaseKey = phaseMap[phase as DebatePhase];
  if (!phaseKey) return null;

  const phasePrompts = library[phaseKey as keyof typeof library];
  if (!phasePrompts) return null;

  // Handle variants for constructive and crossExam phases
  if (variant && typeof phasePrompts === 'object' && 'economic' in phasePrompts) {
    const variantPrompt = phasePrompts[variant as keyof typeof phasePrompts];
    if (variantPrompt && typeof variantPrompt === 'object' && 'id' in variantPrompt) {
      return variantPrompt as PromptTemplate;
    }
    return null;
  }

  if (variant && typeof phasePrompts === 'object' && 'questioner' in phasePrompts) {
    const variantPrompt = phasePrompts[variant as keyof typeof phasePrompts];
    if (variantPrompt && typeof variantPrompt === 'object' && 'id' in variantPrompt) {
      return variantPrompt as PromptTemplate;
    }
    return null;
  }

  // Return the prompt if it's a PromptTemplate
  if ('id' in phasePrompts && 'template' in phasePrompts) {
    return phasePrompts as unknown as PromptTemplate;
  }

  return null;
}

/**
 * Prompt library statistics
 */
export function getPromptLibraryStats(): {
  totalPrompts: number;
  byAgent: Record<string, number>;
  byPhase: Record<string, number>;
  versions: string[];
} {
  const templates = getAllPromptTemplates();

  const byAgent: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  const versions = new Set<string>();

  for (const template of templates) {
    byAgent[template.agent] = (byAgent[template.agent] || 0) + 1;

    const phase = template.phase?.toString() || 'unknown';
    byPhase[phase] = (byPhase[phase] || 0) + 1;

    versions.add(template.version);
  }

  return {
    totalPrompts: templates.length,
    byAgent,
    byPhase,
    versions: Array.from(versions),
  };
}
