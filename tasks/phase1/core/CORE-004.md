# CORE-004: Implement User Intervention Queue

**Priority:** P0
**Estimate:** M
**Labels:** `core`, `backend`
**Status:** 🟢 TO DO

---

## Context

The User Intervention Queue manages user interactions during debates: pause/resume, questions to agents, evidence injection, and clarification requests. This system must coordinate with the state machine to pause debates, route questions to appropriate agents, and resume seamlessly.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Section 6 "User Intervention Points"
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-300 series (User Intervention System)
- [Real-Time Architecture](../../../docs/09_real-time-architecture.md) - Intervention Handler

---

## Requirements

### Acceptance Criteria

- [ ] Accept pause/resume requests
- [ ] Accept user questions directed to specific agents
- [ ] Accept evidence injection requests
- [ ] Queue clarification requests for phase breaks
- [ ] Route interventions to correct agents
- [ ] Track intervention status (queued, processing, completed)
- [ ] Persist all interventions to database
- [ ] Stream intervention responses via SSE
- [ ] Prevent duplicate intervention processing

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-301**: Allow users to pause debate at any point
- **FR-302**: Accept user questions during pause
- **FR-303**: Allow directing questions to specific agents
- **FR-304**: Queue clarification requests for next phase break
- **FR-305**: Allow evidence injection during debate
- **FR-306**: Agents SHALL respond to interventions
- **FR-307**: All interventions SHALL be recorded with timestamps
- **FR-308**: Resume from exact pause point

---

## Implementation Guide

```typescript
// src/services/intervention/intervention-queue.ts
import { InterventionRepository } from '../../db/repositories/intervention-repository';
import { schemaValidator } from '../validation/schema-validator';
import { loggers } from '../logging/log-helpers';

export enum InterventionType {
  PAUSE_QUESTION = 'pause_question',
  EVIDENCE_INJECTION = 'evidence_injection',
  CLARIFICATION_REQUEST = 'clarification_request'
}

export enum InterventionStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface Intervention {
  id: string;
  debateId: string;
  timestamp: number;
  type: InterventionType;
  content: string;
  directedTo?: 'pro' | 'con' | 'moderator';
  status: InterventionStatus;
  response?: string;
  responseTimestamp?: number;
  error?: string;
}

export class InterventionQueue {
  private queue: Map<string, Intervention[]> = new Map();
  private interventionRepo: InterventionRepository;

  constructor(interventionRepo: InterventionRepository) {
    this.interventionRepo = interventionRepo;
  }

  async addIntervention(intervention: Omit<Intervention, 'id' | 'status'>): Promise<string> {
    // Validate intervention
    const validation = schemaValidator.validateIntervention(intervention);
    if (!validation.valid) {
      throw new Error(`Invalid intervention: ${validation.errors.join(', ')}`);
    }

    // Generate ID
    const id = this.generateId();

    const fullIntervention: Intervention = {
      ...intervention,
      id,
      status: InterventionStatus.QUEUED
    };

    // Add to in-memory queue
    if (!this.queue.has(intervention.debateId)) {
      this.queue.set(intervention.debateId, []);
    }
    this.queue.get(intervention.debateId)!.push(fullIntervention);

    // Persist to database
    await this.interventionRepo.create(
      intervention.debateId,
      intervention.timestamp,
      intervention.type,
      intervention.content,
      intervention.directedTo
    );

    loggers.userIntervention(
      intervention.debateId,
      intervention.type,
      intervention.directedTo
    );

    return id;
  }

  getQueuedInterventions(debateId: string): Intervention[] {
    const interventions = this.queue.get(debateId) || [];
    return interventions.filter(i => i.status === InterventionStatus.QUEUED);
  }

  getClarificationRequests(debateId: string): Intervention[] {
    const interventions = this.queue.get(debateId) || [];
    return interventions.filter(
      i => i.type === InterventionType.CLARIFICATION_REQUEST &&
           i.status === InterventionStatus.QUEUED
    );
  }

  async markProcessing(interventionId: string): Promise<void> {
    const intervention = this.findIntervention(interventionId);
    if (intervention) {
      intervention.status = InterventionStatus.PROCESSING;
    }
  }

  async markCompleted(
    interventionId: string,
    response: string,
    responseTimestamp: number
  ): Promise<void> {
    const intervention = this.findIntervention(interventionId);

    if (intervention) {
      intervention.status = InterventionStatus.COMPLETED;
      intervention.response = response;
      intervention.responseTimestamp = responseTimestamp;

      // Update database
      await this.interventionRepo.updateResponse(
        interventionId,
        response,
        responseTimestamp
      );
    }
  }

  async markFailed(interventionId: string, error: string): Promise<void> {
    const intervention = this.findIntervention(interventionId);

    if (intervention) {
      intervention.status = InterventionStatus.FAILED;
      intervention.error = error;
    }
  }

  getIntervention(interventionId: string): Intervention | null {
    return this.findIntervention(interventionId);
  }

  getAllInterventions(debateId: string): Intervention[] {
    return this.queue.get(debateId) || [];
  }

  clearQueue(debateId: string): void {
    this.queue.delete(debateId);
  }

  private findIntervention(interventionId: string): Intervention | null {
    for (const interventions of this.queue.values()) {
      const found = interventions.find(i => i.id === interventionId);
      if (found) return found;
    }
    return null;
  }

  private generateId(): string {
    return `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### API Endpoints

```typescript
// src/api/routes/intervention-routes.ts
import express from 'express';
import { InterventionQueue } from '../../services/intervention/intervention-queue';

const router = express.Router();

// Pause debate
router.post('/debates/:debateId/pause', async (req, res) => {
  const { debateId } = req.params;

  try {
    await orchestrator.pause(debateId);
    res.json({ status: 'paused' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Resume debate
router.post('/debates/:debateId/resume', async (req, res) => {
  const { debateId } = req.params;

  try {
    await orchestrator.resume(debateId);
    res.json({ status: 'resumed' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Submit intervention
router.post('/debates/:debateId/interventions', async (req, res) => {
  const { debateId } = req.params;
  const { type, content, directedTo } = req.body;

  try {
    const interventionId = await interventionQueue.addIntervention({
      debateId,
      timestamp: Date.now(),
      type,
      content,
      directedTo
    });

    res.json({
      interventionId,
      status: 'queued'
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Get intervention status
router.get('/interventions/:interventionId', async (req, res) => {
  const { interventionId } = req.params;

  const intervention = interventionQueue.getIntervention(interventionId);

  if (!intervention) {
    return res.status(404).json({ error: 'Intervention not found' });
  }

  res.json(intervention);
});

export default router;
```

---

## Dependencies

- **CORE-001**: Debate State Machine (for pause/resume)
- **INFRA-002**: Database (for persistence)
- **INFRA-004**: Schema Validation

---

## Validation

### Unit Tests

```typescript
// tests/intervention-queue.test.ts
import { InterventionQueue, InterventionType } from '../src/services/intervention/intervention-queue';

describe('InterventionQueue', () => {
  let queue: InterventionQueue;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      updateResponse: jest.fn()
    };
    queue = new InterventionQueue(mockRepo);
  });

  it('should add intervention to queue', async () => {
    const id = await queue.addIntervention({
      debateId: 'test-debate',
      timestamp: 1000,
      type: InterventionType.PAUSE_QUESTION,
      content: 'Can you clarify?',
      directedTo: 'pro'
    });

    expect(id).toBeTruthy();
    expect(mockRepo.create).toHaveBeenCalled();
  });

  it('should retrieve queued interventions', async () => {
    await queue.addIntervention({
      debateId: 'test-debate',
      timestamp: 1000,
      type: InterventionType.PAUSE_QUESTION,
      content: 'Question 1',
      directedTo: 'pro'
    });

    const queued = queue.getQueuedInterventions('test-debate');
    expect(queued).toHaveLength(1);
  });

  it('should mark intervention as completed', async () => {
    const id = await queue.addIntervention({
      debateId: 'test-debate',
      timestamp: 1000,
      type: InterventionType.PAUSE_QUESTION,
      content: 'Question',
      directedTo: 'pro'
    });

    await queue.markCompleted(id, 'Answer', 2000);

    const intervention = queue.getIntervention(id);
    expect(intervention?.status).toBe('completed');
    expect(intervention?.response).toBe('Answer');
  });

  it('should filter clarification requests', async () => {
    await queue.addIntervention({
      debateId: 'test-debate',
      timestamp: 1000,
      type: InterventionType.CLARIFICATION_REQUEST,
      content: 'Clarify this',
      directedTo: 'pro'
    });

    await queue.addIntervention({
      debateId: 'test-debate',
      timestamp: 2000,
      type: InterventionType.PAUSE_QUESTION,
      content: 'Different type',
      directedTo: 'con'
    });

    const clarifications = queue.getClarificationRequests('test-debate');
    expect(clarifications).toHaveLength(1);
    expect(clarifications[0].type).toBe(InterventionType.CLARIFICATION_REQUEST);
  });
});
```

### Definition of Done

- [ ] Intervention queue accepts all intervention types
- [ ] Interventions validated before queuing
- [ ] Interventions persisted to database
- [ ] Status tracking works (queued, processing, completed, failed)
- [ ] Clarification requests can be filtered
- [ ] API endpoints work for pause, resume, submit
- [ ] Unit tests achieve >90% coverage
- [ ] Integration test with orchestrator works

---

## Notes

- Pause/resume must coordinate with state machine
- Clarification requests queued until next phase break
- Pause questions processed immediately
- Evidence injections presented to both advocates
- Consider rate limiting interventions per user
- Add timeout for intervention processing
- Stream intervention responses via SSE for real-time feedback

---

**Estimated Time:** 6-8 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
