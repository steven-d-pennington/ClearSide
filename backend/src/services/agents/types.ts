/**
 * Agent Type Interfaces
 *
 * Defines the contract for all AI agents in the debate system.
 * These interfaces will be implemented by real LLM-powered agents in AGENT-001 to AGENT-004.
 */

import type { DebatePhase, Speaker } from '../../types/debate.js';
import type { Utterance } from '../../types/database.js';
import type { DebateConfiguration, Persona } from '../../types/configuration.js';

/**
 * Agent context - information available to agents when generating responses
 * Provides full debate history and current state
 */
export interface AgentContext {
  /** Unique debate identifier */
  debateId: string;

  /** Current phase of the debate */
  currentPhase: DebatePhase;

  /** Previous utterances in chronological order */
  previousUtterances: Utterance[];

  /** The speaker making this request */
  speaker: Speaker;

  /** Proposition being debated */
  proposition: string;

  /** Additional proposition context */
  propositionContext?: Record<string, unknown>;

  /** Optional: User interventions that need to be addressed */
  pendingInterventions?: Array<{
    id: number;
    type: string;
    content: string;
    directedTo: Speaker | null;
  }>;

  /** Optional: Phase-specific metadata */
  phaseMetadata?: Record<string, unknown>;

  /** Debate configuration settings (brevity, temperature, citations, etc.) */
  configuration?: DebateConfiguration;

  /** Optional persona for this agent (Pro or Con side) */
  persona?: Persona | null;
}

/**
 * Normalized proposition output from orchestrator agent
 */
export interface NormalizedProposition {
  /** Normalized question/proposition text */
  normalized_question: string;

  /** Structured context for the debate */
  context: {
    /** Category/domain of the proposition */
    category?: string;

    /** Time sensitivity if any */
    time_context?: string;

    /** Geographic scope if relevant */
    geographic_scope?: string;

    /** Stakeholders involved */
    stakeholders?: string[];

    /** Key assumptions to make explicit */
    key_assumptions?: string[];

    /** Related background information */
    background?: string;
  };

  /** Confidence score (0-1) */
  confidence?: number;
}

/**
 * Base agent interface
 * All debate agents extend this interface
 */
export interface BaseAgent {
  /**
   * Generate a response based on prompt and context
   * @param prompt - The prompt/instruction for the agent
   * @param context - Full debate context
   * @returns Generated response text
   */
  generateResponse(prompt: string, context: AgentContext): Promise<string>;

  /**
   * Get agent metadata (name, version, model, etc.)
   */
  getMetadata(): {
    name: string;
    version: string;
    model?: string;
    capabilities?: string[];
  };

  /**
   * Get the LLM client for direct streaming access
   * Used by lively orchestrator for real-time token streaming
   */
  getLLMClient(): import('../llm/client.js').LLMClient;
}

/**
 * Pro Advocate Agent
 * Argues in favor of the proposition
 */
export interface ProAdvocateAgent extends BaseAgent {
  /**
   * Generate opening statement supporting the proposition
   */
  generateOpeningStatement(context: AgentContext): Promise<string>;

  /**
   * Generate constructive argument with evidence
   */
  generateConstructiveArgument(context: AgentContext): Promise<string>;

  /**
   * Generate cross-examination question for con advocate
   */
  generateCrossExamQuestion(context: AgentContext): Promise<string>;

  /**
   * Respond to cross-examination question
   */
  respondToCrossExam(question: string, context: AgentContext): Promise<string>;

  /**
   * Generate rebuttal to con advocate's arguments
   */
  generateRebuttal(context: AgentContext): Promise<string>;

  /**
   * Generate closing statement
   */
  generateClosingStatement(context: AgentContext): Promise<string>;
}

/**
 * Con Advocate Agent
 * Argues against the proposition
 */
export interface ConAdvocateAgent extends BaseAgent {
  /**
   * Generate opening statement opposing the proposition
   */
  generateOpeningStatement(context: AgentContext): Promise<string>;

  /**
   * Generate constructive argument with evidence
   */
  generateConstructiveArgument(context: AgentContext): Promise<string>;

  /**
   * Generate cross-examination question for pro advocate
   */
  generateCrossExamQuestion(context: AgentContext): Promise<string>;

  /**
   * Respond to cross-examination question
   */
  respondToCrossExam(question: string, context: AgentContext): Promise<string>;

  /**
   * Generate rebuttal to pro advocate's arguments
   */
  generateRebuttal(context: AgentContext): Promise<string>;

  /**
   * Generate closing statement
   */
  generateClosingStatement(context: AgentContext): Promise<string>;
}

/**
 * Moderator Agent
 * Neutral facilitator and synthesizer
 */
export interface ModeratorAgent extends BaseAgent {
  /**
   * Generate debate introduction
   */
  generateIntroduction(proposition: string, context: AgentContext): Promise<string>;

  /**
   * Generate phase transition announcement
   */
  announcePhaseTransition(
    fromPhase: DebatePhase,
    toPhase: DebatePhase,
    context: AgentContext
  ): Promise<string>;

  /**
   * Generate final synthesis (Phase 6)
   * CRITICAL: Must be neutral, no winner declared
   */
  generateSynthesis(context: AgentContext): Promise<string>;

  /**
   * Process user intervention and generate response
   */
  handleIntervention(interventionContent: string, context: AgentContext): Promise<string>;
}

/**
 * Orchestrator Agent
 * Normalizes propositions and provides meta-orchestration
 */
export interface OrchestratorAgent extends BaseAgent {
  /**
   * Normalize a raw user proposition into structured format
   * Extracts context, identifies ambiguities, and formats for debate
   */
  normalizeProposition(
    rawInput: string,
    additionalContext?: Record<string, unknown>
  ): Promise<NormalizedProposition>;

  /**
   * Validate if a proposition is debatable
   * Returns { valid: boolean, reason?: string }
   */
  validateProposition(proposition: string): Promise<{ valid: boolean; reason?: string }>;
}

/**
 * Agent factory type
 * Used to create agent instances
 */
export type AgentFactory = {
  createProAdvocate: () => ProAdvocateAgent;
  createConAdvocate: () => ConAdvocateAgent;
  createModerator: () => ModeratorAgent;
  createOrchestrator: () => OrchestratorAgent;
};
