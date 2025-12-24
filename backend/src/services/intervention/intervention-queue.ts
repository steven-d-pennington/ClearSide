/**
 * User Intervention Queue Service
 *
 * Manages user interventions during debates: pause/resume, questions to agents,
 * evidence injection, and clarification requests. Coordinates with the state machine
 * to pause debates, route questions to appropriate agents, and resume seamlessly.
 *
 * Responsibilities:
 * - Accept and validate intervention requests
 * - Queue interventions for processing
 * - Track intervention status (queued, processing, completed, failed)
 * - Persist all interventions to database
 * - Route interventions to correct agents
 * - Stream intervention responses via SSE
 */

import pino from 'pino';
import * as interventionRepo from '../../db/repositories/intervention-repository.js';
import { schemaValidator } from '../validation/schema-validator.js';
import type {
  InterventionType,
  Speaker,
  CreateInterventionInput,
  UserIntervention
} from '../../types/database.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'intervention-queue',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Intervention status tracking
 * Extends database interventions with runtime status
 */
export enum InterventionStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Intervention with status tracking
 * Combines database intervention with runtime status
 */
export interface QueuedIntervention {
  /** Database intervention record */
  intervention: UserIntervention;

  /** Current processing status */
  status: InterventionStatus;

  /** Error message if failed */
  error?: string;
}

/**
 * Intervention Queue input (before database persistence)
 */
export interface AddInterventionInput {
  debateId: string;
  timestampMs: number;
  interventionType: InterventionType;
  content: string;
  directedTo?: Speaker | null;
}

/**
 * User Intervention Queue
 *
 * Manages in-memory queue of interventions and coordinates with database.
 * Provides status tracking and filtering for different intervention types.
 */
export class InterventionQueue {
  private queue: Map<string, QueuedIntervention[]> = new Map();

  /**
   * Add a new intervention to the queue
   *
   * @param input - Intervention input data
   * @returns Database ID of the created intervention
   */
  async addIntervention(input: AddInterventionInput): Promise<number> {
    logger.debug({ input }, 'Adding intervention to queue');

    try {
      // Validate intervention content
      const validationData = {
        timestamp_ms: input.timestampMs,
        intervention_type: input.interventionType,
        content: input.content,
        directed_to: input.directedTo || null,
        response: null,
        response_timestamp_ms: null,
      };

      const validation = schemaValidator.validateIntervention(validationData);
      if (!validation.valid) {
        const errors = validation.errors?.map((e) => e.message).join(', ') || 'Unknown validation error';
        throw new Error(`Invalid intervention: ${errors}`);
      }

      // Create intervention in database
      const createInput: CreateInterventionInput = {
        debateId: input.debateId,
        timestampMs: input.timestampMs,
        interventionType: input.interventionType,
        content: input.content,
        directedTo: input.directedTo || null,
      };

      const intervention = await interventionRepo.create(createInput);

      // Add to in-memory queue
      if (!this.queue.has(input.debateId)) {
        this.queue.set(input.debateId, []);
      }

      const queued: QueuedIntervention = {
        intervention,
        status: InterventionStatus.QUEUED,
      };

      this.queue.get(input.debateId)!.push(queued);

      logger.info(
        {
          debateId: input.debateId,
          interventionId: intervention.id,
          type: input.interventionType,
          directedTo: input.directedTo,
        },
        'Intervention added to queue'
      );

      return intervention.id;
    } catch (error) {
      logger.error({ error, input }, 'Failed to add intervention');
      throw error;
    }
  }

  /**
   * Get all queued (unprocessed) interventions for a debate
   *
   * @param debateId - Debate identifier
   * @returns Array of queued interventions
   */
  getQueuedInterventions(debateId: string): QueuedIntervention[] {
    const interventions = this.queue.get(debateId) || [];
    return interventions.filter((i) => i.status === InterventionStatus.QUEUED);
  }

  /**
   * Get clarification requests specifically (queued for next phase break)
   *
   * @param debateId - Debate identifier
   * @returns Array of queued clarification requests
   */
  getClarificationRequests(debateId: string): QueuedIntervention[] {
    const interventions = this.queue.get(debateId) || [];
    return interventions.filter(
      (i) =>
        i.intervention.interventionType === 'clarification_request' &&
        i.status === InterventionStatus.QUEUED
    );
  }

  /**
   * Get interventions by type
   *
   * @param debateId - Debate identifier
   * @param type - Intervention type to filter by
   * @returns Array of interventions of the specified type
   */
  getByType(debateId: string, type: InterventionType): QueuedIntervention[] {
    const interventions = this.queue.get(debateId) || [];
    return interventions.filter((i) => i.intervention.interventionType === type);
  }

  /**
   * Get interventions directed to a specific speaker
   *
   * @param debateId - Debate identifier
   * @param speaker - Target speaker
   * @returns Array of interventions directed to the speaker
   */
  getByDirectedTo(debateId: string, speaker: Speaker): QueuedIntervention[] {
    const interventions = this.queue.get(debateId) || [];
    return interventions.filter((i) => i.intervention.directedTo === speaker);
  }

  /**
   * Mark an intervention as currently being processed
   *
   * @param interventionId - Intervention database ID
   */
  async markProcessing(interventionId: number): Promise<void> {
    const queued = this.findQueuedIntervention(interventionId);

    if (queued) {
      queued.status = InterventionStatus.PROCESSING;
      logger.debug({ interventionId }, 'Intervention marked as processing');
    } else {
      logger.warn({ interventionId }, 'Intervention not found in queue for markProcessing');
    }
  }

  /**
   * Mark an intervention as completed with a response
   *
   * @param interventionId - Intervention database ID
   * @param response - Agent's response text
   * @param responseTimestampMs - Timestamp when response was generated
   */
  async markCompleted(
    interventionId: number,
    response: string,
    responseTimestampMs: number
  ): Promise<void> {
    const queued = this.findQueuedIntervention(interventionId);

    if (queued) {
      queued.status = InterventionStatus.COMPLETED;

      // Update database with response
      await interventionRepo.addResponse(interventionId, response, responseTimestampMs);

      // Update in-memory intervention
      queued.intervention.response = response;
      queued.intervention.responseTimestampMs = responseTimestampMs;

      logger.info(
        { interventionId, responseLength: response.length },
        'Intervention marked as completed'
      );
    } else {
      logger.warn({ interventionId }, 'Intervention not found in queue for markCompleted');
    }
  }

  /**
   * Mark an intervention as failed
   *
   * @param interventionId - Intervention database ID
   * @param error - Error message
   */
  async markFailed(interventionId: number, error: string): Promise<void> {
    const queued = this.findQueuedIntervention(interventionId);

    if (queued) {
      queued.status = InterventionStatus.FAILED;
      queued.error = error;

      logger.warn({ interventionId, error }, 'Intervention marked as failed');
    } else {
      logger.warn({ interventionId }, 'Intervention not found in queue for markFailed');
    }
  }

  /**
   * Get a specific intervention by ID
   *
   * @param interventionId - Intervention database ID
   * @returns Queued intervention or null if not found
   */
  getIntervention(interventionId: number): QueuedIntervention | null {
    return this.findQueuedIntervention(interventionId);
  }

  /**
   * Get all interventions for a debate (regardless of status)
   *
   * @param debateId - Debate identifier
   * @returns Array of all interventions
   */
  getAllInterventions(debateId: string): QueuedIntervention[] {
    return this.queue.get(debateId) || [];
  }

  /**
   * Get count of unanswered interventions for a debate
   *
   * @param debateId - Debate identifier
   * @returns Count of unanswered interventions
   */
  async getUnansweredCount(debateId: string): Promise<number> {
    return interventionRepo.countUnanswered(debateId);
  }

  /**
   * Clear all interventions for a debate from the queue
   * (Does not delete from database)
   *
   * @param debateId - Debate identifier
   */
  clearQueue(debateId: string): void {
    this.queue.delete(debateId);
    logger.info({ debateId }, 'Intervention queue cleared');
  }

  /**
   * Load interventions from database into queue
   * Used when reconnecting to an existing debate
   *
   * @param debateId - Debate identifier
   */
  async loadFromDatabase(debateId: string): Promise<void> {
    logger.debug({ debateId }, 'Loading interventions from database');

    try {
      const interventions = await interventionRepo.findByDebateId(debateId);

      if (!this.queue.has(debateId)) {
        this.queue.set(debateId, []);
      }

      const queuedList = this.queue.get(debateId)!;
      queuedList.length = 0; // Clear existing

      for (const intervention of interventions) {
        // Determine status based on whether intervention has a response
        const status = intervention.response
          ? InterventionStatus.COMPLETED
          : InterventionStatus.QUEUED;

        queuedList.push({
          intervention,
          status,
        });
      }

      logger.info(
        { debateId, count: interventions.length },
        'Interventions loaded from database'
      );
    } catch (error) {
      logger.error({ debateId, error }, 'Failed to load interventions from database');
      throw error;
    }
  }

  /**
   * Find a queued intervention by ID across all debates
   *
   * @param interventionId - Intervention database ID
   * @returns Queued intervention or null if not found
   */
  private findQueuedIntervention(interventionId: number): QueuedIntervention | null {
    for (const interventions of this.queue.values()) {
      const found = interventions.find((i) => i.intervention.id === interventionId);
      if (found) {
        return found;
      }
    }
    return null;
  }
}

/**
 * Singleton instance of InterventionQueue
 */
export const interventionQueue = new InterventionQueue();
