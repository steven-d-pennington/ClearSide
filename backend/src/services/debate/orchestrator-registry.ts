/**
 * Orchestrator Registry
 *
 * Stores references to running debate orchestrators so they can be
 * accessed for pause/resume/stop operations.
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'OrchestratorRegistry' });

/**
 * Common interface for stoppable orchestrators
 * Both DebateOrchestrator and LivelyDebateOrchestrator implement this
 */
export interface StoppableOrchestrator {
  stop(reason?: string): Promise<void> | void;
  isStopped?(): boolean;
}

/**
 * Registry to store running orchestrators by debate ID
 */
class OrchestratorRegistry {
  private orchestrators: Map<string, StoppableOrchestrator> = new Map();

  /**
   * Register an orchestrator for a debate
   */
  register(debateId: string, orchestrator: StoppableOrchestrator): void {
    logger.info({ debateId }, 'Registering orchestrator');
    this.orchestrators.set(debateId, orchestrator);
  }

  /**
   * Unregister an orchestrator when debate completes
   */
  unregister(debateId: string): void {
    logger.info({ debateId }, 'Unregistering orchestrator');
    this.orchestrators.delete(debateId);
  }

  /**
   * Get an orchestrator by debate ID
   */
  get(debateId: string): StoppableOrchestrator | undefined {
    return this.orchestrators.get(debateId);
  }

  /**
   * Check if an orchestrator is registered for a debate
   */
  has(debateId: string): boolean {
    return this.orchestrators.has(debateId);
  }

  /**
   * Get the count of running orchestrators
   */
  getCount(): number {
    return this.orchestrators.size;
  }

  /**
   * Get all running debate IDs
   */
  getRunningDebateIds(): string[] {
    return Array.from(this.orchestrators.keys());
  }
}

// Singleton instance
export const orchestratorRegistry = new OrchestratorRegistry();
