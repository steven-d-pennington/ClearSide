/**
 * Prompt Template Type Definitions
 *
 * Core types for the prompt library system including templates,
 * versioning, quality checks, and testing infrastructure.
 */

import type { DebatePhase, Speaker } from '../../../types/debate.js';

/**
 * Agent types that have prompts
 */
export type AgentType = 'orchestrator' | 'pro' | 'con' | 'moderator';

/**
 * Prompt type - system vs user
 */
export type PromptType = 'system' | 'user';

/**
 * Quality check result
 */
export interface QualityCheckResult {
  passed: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Quality check definition
 */
export interface QualityCheck {
  /** Unique name for the check */
  name: string;

  /** Human-readable description */
  description: string;

  /** Severity: error = must pass, warning = should pass */
  severity: 'error' | 'warning';

  /** Validator function */
  validator: (output: string, context?: Record<string, unknown>) => QualityCheckResult;
}

/**
 * Example input/output for a prompt
 */
export interface PromptExample {
  /** Example name/description */
  name: string;

  /** Input variables */
  input: Record<string, unknown>;

  /** Expected output pattern or example */
  expectedOutput: string;

  /** Quality score achieved (0-1) */
  qualityScore: number;
}

/**
 * Prompt template interface
 */
export interface PromptTemplate {
  /** Unique identifier: {agent}-{phase}-{type}-v{version} */
  id: string;

  /** Semantic version */
  version: string;

  /** Which agent uses this prompt */
  agent: AgentType;

  /** Which debate phase (if applicable) */
  phase?: DebatePhase | 'all' | 'intervention';

  /** System or user prompt */
  type: PromptType;

  /** The actual prompt template text */
  template: string;

  /** Variables that can be substituted in the template */
  variables: string[];

  /** Expected output format description */
  outputFormat?: 'text' | 'json' | 'structured';

  /** Quality checks for outputs */
  qualityChecks: QualityCheck[];

  /** Example inputs and outputs */
  examples?: PromptExample[];

  /** Prompt metadata */
  metadata: {
    /** Creation date */
    createdAt: string;

    /** Last update date */
    updatedAt: string;

    /** Author or source */
    author?: string;

    /** Change notes */
    changelog?: string[];

    /** Tags for categorization */
    tags?: string[];
  };
}

/**
 * Prompt test case
 */
export interface PromptTestCase {
  /** Test name */
  name: string;

  /** Input to provide */
  input: string;

  /** Variables to substitute */
  variables?: Record<string, string>;

  /** Expected quality checks to pass */
  expectedQualities: string[];

  /** Optional: specific patterns expected in output */
  expectedPatterns?: RegExp[];

  /** Optional: patterns that should NOT appear */
  forbiddenPatterns?: RegExp[];
}

/**
 * Individual test case result
 */
export interface TestCaseResult {
  /** Test case name */
  testCase: string;

  /** Whether all checks passed */
  passed: boolean;

  /** Generated output */
  output: string;

  /** Quality check results */
  qualityChecks: Array<{
    name: string;
    result: QualityCheckResult;
  }>;

  /** Latency in milliseconds */
  latencyMs: number;

  /** Tokens used */
  tokensUsed: number;
}

/**
 * Complete prompt test result
 */
export interface PromptTestResult {
  /** Prompt ID that was tested */
  promptId: string;

  /** Total tests run */
  totalTests: number;

  /** Tests passed */
  passed: number;

  /** Tests failed */
  failed: number;

  /** Pass rate (0-1) */
  passRate: number;

  /** Average latency in milliseconds */
  averageLatencyMs: number;

  /** Total tokens consumed */
  totalTokensUsed: number;

  /** Individual results */
  results: TestCaseResult[];

  /** Test run timestamp */
  timestamp: string;
}

/**
 * Version diff between prompts
 */
export interface VersionDiff {
  /** Added lines/sections */
  added: string[];

  /** Removed lines/sections */
  removed: string[];

  /** Modified sections */
  modified: Array<{
    before: string;
    after: string;
  }>;

  /** Breaking changes detected */
  breaking: boolean;

  /** Summary of changes */
  summary: string;
}

/**
 * Prompt registry entry
 */
export interface PromptRegistryEntry {
  /** Latest version */
  latest: PromptTemplate;

  /** All versions */
  versions: PromptTemplate[];

  /** Deprecation info if deprecated */
  deprecated?: {
    since: string;
    replacement?: string;
    reason: string;
  };
}

/**
 * Constructive argument round type
 */
export type ConstructiveRound = 'economic_technical' | 'ethical_social' | 'practical';

/**
 * Cross-examination role
 */
export type CrossExamRole = 'questioner' | 'respondent';

/**
 * Prompt builder context for dynamic prompts
 */
export interface PromptBuilderContext {
  /** The proposition being debated */
  proposition: string;

  /** Proposition context */
  propositionContext?: {
    category?: string;
    timeContext?: string;
    geographicScope?: string;
    stakeholders?: string[];
    keyAssumptions?: string[];
    background?: string;
  };

  /** Current phase */
  phase?: DebatePhase;

  /** Current speaker */
  speaker?: Speaker;

  /** Previous utterances summary */
  previousUtterances?: string;

  /** Constructive round (for phase 2) */
  constructiveRound?: ConstructiveRound;

  /** Cross-exam role (for phase 3) */
  crossExamRole?: CrossExamRole;

  /** Opponent's arguments to address (for rebuttals) */
  opponentArguments?: string;

  /** User intervention content */
  interventionContent?: string;

  /** Full debate transcript (for moderator synthesis) */
  fullTranscript?: string;

  /** Additional context */
  additionalContext?: Record<string, unknown>;
}
