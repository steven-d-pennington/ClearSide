/**
 * Agent Services Barrel Export
 *
 * Central export point for all agent-related services and types
 */

// Agent type interfaces
export type {
  AgentContext,
  NormalizedProposition,
  BaseAgent,
  ProAdvocateAgent as IProAdvocateAgent,
  ConAdvocateAgent as IConAdvocateAgent,
  ModeratorAgent as IModeratorAgent,
  OrchestratorAgent as IOrchestratorAgent,
  AgentFactory,
} from './types.js';

// Mock agent implementations
export {
  MockProAdvocate,
  MockConAdvocate,
  MockModerator,
  MockOrchestrator,
  mockAgentFactory,
} from './mock-agents.js';

// Real agent implementations
export { OrchestratorAgent } from './orchestrator-agent.js';
export type { PropositionContext } from './orchestrator-agent.js';
export { ProAdvocateAgent } from './pro-advocate-agent.js';
export { ConAdvocateAgent } from './con-advocate-agent.js';
export { ModeratorAgent } from './moderator-agent.js';

// Prompt templates
export {
  ORCHESTRATOR_SYSTEM_PROMPT,
  buildOrchestratorPrompt,
  NORMALIZATION_EXAMPLES,
} from './prompts/orchestrator-prompts.js';
