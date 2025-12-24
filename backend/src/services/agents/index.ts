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
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
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
