/**
 * Mock Agent Implementations
 *
 * Placeholder agents that return canned responses for testing.
 * These will be replaced with real LLM-powered agents in AGENT-001 to AGENT-004.
 *
 * Mock responses are designed to be recognizable in tests and debugging.
 */

import type { DebatePhase } from '../../types/debate.js';
import type {
  AgentContext,
  BaseAgent,
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
  NormalizedProposition,
} from './types.js';

/**
 * Base mock agent with common functionality
 */
abstract class BaseMockAgent implements BaseAgent {
  protected name: string;
  protected version: string = '0.1.0-mock';

  constructor(name: string) {
    this.name = name;
  }

  async generateResponse(_prompt: string, context: AgentContext): Promise<string> {
    return `[${this.name}] Response to prompt in ${context.currentPhase} for: ${context.proposition}`;
  }

  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      model: 'mock-agent',
      capabilities: ['mock-responses'],
    };
  }
}

/**
 * Mock Pro Advocate Agent
 */
export class MockProAdvocate extends BaseMockAgent implements ProAdvocateAgent {
  constructor() {
    super('MockProAdvocate');
  }

  async generateOpeningStatement(context: AgentContext): Promise<string> {
    return `[Pro Advocate - Opening Statement]\n\nI stand in strong support of the proposition: "${context.proposition}".\n\nThis position is grounded in compelling evidence and sound reasoning that I will present throughout this debate. The benefits of this proposition significantly outweigh any potential drawbacks.`;
  }

  async generateConstructiveArgument(context: AgentContext): Promise<string> {
    const argNum = context.previousUtterances.filter((u) => u.speaker === 'pro_advocate').length + 1;
    return `[Pro Advocate - Constructive Argument ${argNum}]\n\nBuilding on my previous points, I present the following evidence supporting "${context.proposition}":\n\n1. This proposition addresses a critical need in our current situation\n2. The proposed approach has proven effective in similar contexts\n3. Expert consensus supports this direction\n\nThese factors combine to make a compelling case for the affirmative position.`;
  }

  async generateCrossExamQuestion(_context: AgentContext): Promise<string> {
    return `[Pro Advocate - Cross-Examination Question]\n\nGiven the evidence I've presented, can my opponent explain how their position accounts for the clear benefits of this proposition? Specifically, what alternative approach would they propose that achieves the same positive outcomes?`;
  }

  async respondToCrossExam(_question: string, _context: AgentContext): Promise<string> {
    return `[Pro Advocate - Cross-Exam Response]\n\nIn response to the question raised, I would point out that my position is built on verified facts and sound logic. The concerns raised do not outweigh the substantial benefits I've outlined. Let me clarify my stance on the specific point raised...`;
  }

  async generateRebuttal(_context: AgentContext): Promise<string> {
    return `[Pro Advocate - Rebuttal]\n\nMy opponent has raised several objections, but upon closer examination, these concerns are either overstated or can be effectively mitigated. The core strength of my position remains: the proposition offers real, measurable benefits that justify its adoption.`;
  }

  async generateClosingStatement(context: AgentContext): Promise<string> {
    return `[Pro Advocate - Closing Statement]\n\nThroughout this debate, I have demonstrated why "${context.proposition}" deserves your support. The evidence is clear, the reasoning is sound, and the benefits are substantial. I urge you to carefully consider the affirmative case I have presented.`;
  }
}

/**
 * Mock Con Advocate Agent
 */
export class MockConAdvocate extends BaseMockAgent implements ConAdvocateAgent {
  constructor() {
    super('MockConAdvocate');
  }

  async generateOpeningStatement(context: AgentContext): Promise<string> {
    return `[Con Advocate - Opening Statement]\n\nI stand in opposition to the proposition: "${context.proposition}".\n\nWhile this may seem appealing at first glance, a deeper analysis reveals significant flaws and unintended consequences. I will demonstrate why this proposition should not be adopted.`;
  }

  async generateConstructiveArgument(context: AgentContext): Promise<string> {
    const argNum = context.previousUtterances.filter((u) => u.speaker === 'con_advocate').length + 1;
    return `[Con Advocate - Constructive Argument ${argNum}]\n\nContinuing my case against "${context.proposition}", I present the following critical concerns:\n\n1. This proposition fails to account for important contextual factors\n2. Historical precedent suggests this approach leads to negative outcomes\n3. There are superior alternative approaches available\n\nThese issues fundamentally undermine the case for this proposition.`;
  }

  async generateCrossExamQuestion(_context: AgentContext): Promise<string> {
    return `[Con Advocate - Cross-Examination Question]\n\nMy opponent has presented what appears to be a strong case, but I must ask: have they fully considered the potential unintended consequences? What safeguards exist to prevent the negative outcomes I've identified?`;
  }

  async respondToCrossExam(_question: string, _context: AgentContext): Promise<string> {
    return `[Con Advocate - Cross-Exam Response]\n\nThat's an excellent question that highlights a key weakness in the affirmative position. The evidence clearly shows that the concerns I've raised are well-founded and not adequately addressed by the pro side's arguments.`;
  }

  async generateRebuttal(_context: AgentContext): Promise<string> {
    return `[Con Advocate - Rebuttal]\n\nMy opponent's arguments, while initially persuasive, crumble under scrutiny. The benefits they tout are either exaggerated or achievable through better means. The risks I've identified remain unaddressed and constitute compelling reasons to reject this proposition.`;
  }

  async generateClosingStatement(context: AgentContext): Promise<string> {
    return `[Con Advocate - Closing Statement]\n\nI have shown throughout this debate why "${context.proposition}" is fundamentally flawed. The risks are real, the benefits are questionable, and better alternatives exist. I strongly urge rejection of this proposition.`;
  }
}

/**
 * Mock Moderator Agent
 */
export class MockModerator extends BaseMockAgent implements ModeratorAgent {
  constructor() {
    super('MockModerator');
  }

  async generateIntroduction(proposition: string, _context: AgentContext): Promise<string> {
    return `[Moderator - Introduction]\n\nWelcome to this structured debate on the proposition: "${proposition}".\n\nToday, we will hear arguments both in favor and in opposition to this proposition. Our Pro Advocate will present the case for adoption, while our Con Advocate will present the case against.\n\nThis debate will proceed through six phases, ensuring both sides receive equal opportunity to present their positions. Let us begin.`;
  }

  async announcePhaseTransition(
    fromPhase: DebatePhase,
    toPhase: DebatePhase,
    _context: AgentContext
  ): Promise<string> {
    const phaseNames: Record<DebatePhase, string> = {
      INITIALIZING: 'Initialization',
      PHASE_1_OPENING: 'Opening Statements',
      PHASE_2_CONSTRUCTIVE: 'Constructive Arguments',
      PHASE_3_CROSSEXAM: 'Cross-Examination',
      PHASE_4_REBUTTAL: 'Rebuttals',
      PHASE_5_CLOSING: 'Closing Statements',
      PHASE_6_SYNTHESIS: 'Synthesis',
      COMPLETED: 'Completed',
      PAUSED: 'Paused',
      ERROR: 'Error',
    };

    return `[Moderator - Phase Transition]\n\nWe have concluded ${phaseNames[fromPhase]}. We now move to ${phaseNames[toPhase]}.`;
  }

  async generateSynthesis(context: AgentContext): Promise<string> {
    return `[Moderator - Synthesis]\n\nWe have heard compelling arguments from both sides regarding "${context.proposition}".\n\nThe Pro Advocate presented evidence emphasizing the benefits and necessity of this proposition. They highlighted positive outcomes and expert support.\n\nThe Con Advocate raised important concerns about risks and unintended consequences. They pointed to alternative approaches and historical precedent.\n\nBoth positions contain valid points worthy of consideration. The key areas of disagreement center on risk assessment and the evaluation of alternatives. Significant uncertainty remains regarding implementation challenges and long-term effects.\n\nI encourage you to reflect on both perspectives as you form your own conclusion.`;
  }

  async handleIntervention(interventionContent: string, _context: AgentContext): Promise<string> {
    return `[Moderator - Intervention Response]\n\nThank you for your question: "${interventionContent}"\n\nThis is an important point that deserves clarification. Let me address this directly and ensure we maintain the integrity of both positions in this debate.`;
  }
}

/**
 * Mock Orchestrator Agent
 */
export class MockOrchestrator extends BaseMockAgent implements OrchestratorAgent {
  constructor() {
    super('MockOrchestrator');
  }

  async normalizeProposition(
    rawInput: string,
    additionalContext?: Record<string, unknown>
  ): Promise<NormalizedProposition> {
    // Simple normalization for mock
    const normalized = rawInput.trim().endsWith('?')
      ? rawInput.trim()
      : `Should we: ${rawInput.trim()}?`;

    return {
      normalized_question: normalized,
      context: {
        category: 'general',
        time_context: 'current',
        geographic_scope: 'general',
        stakeholders: ['general public'],
        key_assumptions: ['Standard debate assumptions apply'],
        background: additionalContext?.background as string | undefined || 'No additional background provided',
      },
      confidence: 0.9,
    };
  }

  async validateProposition(proposition: string): Promise<{ valid: boolean; reason?: string }> {
    // Simple validation - reject empty or very short propositions
    const trimmed = proposition.trim();

    // Check for empty or too short
    if (!trimmed || trimmed.length < 10) {
      return {
        valid: false,
        reason: 'Proposition is too short or empty. Please provide a meaningful proposition.',
      };
    }

    // Check for propositions that are just formatting with no content
    // E.g., "Should we: ?" or similar patterns
    const withoutCommonPrefixes = trimmed
      .replace(/^(should we:|is it true that|do you think)/i, '')
      .replace(/\?$/g, '')
      .trim();

    if (withoutCommonPrefixes.length < 3) {
      return {
        valid: false,
        reason: 'Proposition lacks meaningful content. Please provide a substantive question.',
      };
    }

    return { valid: true };
  }
}

/**
 * Mock Agent Factory
 * Creates instances of mock agents for testing
 */
export const mockAgentFactory = {
  createProAdvocate: (): ProAdvocateAgent => new MockProAdvocate(),
  createConAdvocate: (): ConAdvocateAgent => new MockConAdvocate(),
  createModerator: (): ModeratorAgent => new MockModerator(),
  createOrchestrator: (): OrchestratorAgent => new MockOrchestrator(),
};
