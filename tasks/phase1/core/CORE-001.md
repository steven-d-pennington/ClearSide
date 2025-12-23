# CORE-001: Implement Debate State Machine

**Priority:** P0
**Estimate:** L
**Labels:** `core`, `backend`
**Status:** 🟢 TO DO

---

## Context

The Debate State Machine is the orchestration backbone of ClearSide. It manages the 6-phase debate protocol, enforces transition rules, handles pause/resume, and coordinates with agents. This is a critical component that all other agents depend on.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Section 1 "Protocol Structure"
- [Real-Time Architecture](../../../docs/09_real-time-architecture.md) - Section 2.2 "Debate State Machine"
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-201, FR-206, FR-210

---

## Requirements

### Acceptance Criteria

- [ ] Define `DebatePhase` enum with 8 states (6 phases + PAUSED + ERROR)
- [ ] Implement state machine class with transition logic
- [ ] Add phase validation (prevent invalid transitions)
- [ ] Implement pause/resume functionality
- [ ] Persist state to database on each transition
- [ ] Emit events for SSE streaming
- [ ] Track current speaker and phase duration
- [ ] Handle error states gracefully
- [ ] Add state machine visualization/logging
- [ ] Write unit tests for all transitions

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-201**: System SHALL initialize debate state machine with 6 phases
- **FR-206**: System SHALL enforce phase transition rules (automatic progression)
- **FR-210**: System SHALL support pause/resume functionality
- **FR-251**: System SHALL implement 6-phase debate protocol

---

## Implementation Guide

### State Machine Structure

```typescript
// src/types/debate-types.ts
export enum DebatePhase {
  INITIALIZING = 'initializing',
  PHASE_1_OPENING = 'phase_1_opening',
  PHASE_2_CONSTRUCTIVE = 'phase_2_constructive',
  PHASE_3_CROSSEXAM = 'phase_3_crossexam',
  PHASE_4_REBUTTAL = 'phase_4_rebuttal',
  PHASE_5_CLOSING = 'phase_5_closing',
  PHASE_6_SYNTHESIS = 'phase_6_synthesis',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  ERROR = 'error'
}

export enum Speaker {
  PRO = 'pro',
  CON = 'con',
  MODERATOR = 'moderator',
  SYSTEM = 'system'
}

export interface DebateState {
  debateId: string;
  currentPhase: DebatePhase;
  previousPhase?: DebatePhase; // For pause/resume
  currentSpeaker: Speaker;
  phaseStartTime: number;
  totalElapsedMs: number;
  isPaused: boolean;
  pausedAt?: number;
}
```

### State Machine Implementation

```typescript
// src/services/debate/state-machine.ts
import { DebatePhase, DebateState, Speaker } from '../../types/debate-types';
import { DebateRepository } from '../../db/repositories/debate-repository';
import { EventEmitter } from 'events';

export class DebateStateMachine extends EventEmitter {
  private state: DebateState;
  private debateRepo: DebateRepository;

  // Valid phase transitions
  private readonly transitions: Map<DebatePhase, DebatePhase[]> = new Map([
    [DebatePhase.INITIALIZING, [DebatePhase.PHASE_1_OPENING, DebatePhase.ERROR]],
    [DebatePhase.PHASE_1_OPENING, [DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PAUSED, DebatePhase.ERROR]],
    [DebatePhase.PHASE_2_CONSTRUCTIVE, [DebatePhase.PHASE_3_CROSSEXAM, DebatePhase.PAUSED, DebatePhase.ERROR]],
    [DebatePhase.PHASE_3_CROSSEXAM, [DebatePhase.PHASE_4_REBUTTAL, DebatePhase.PAUSED, DebatePhase.ERROR]],
    [DebatePhase.PHASE_4_REBUTTAL, [DebatePhase.PHASE_5_CLOSING, DebatePhase.PAUSED, DebatePhase.ERROR]],
    [DebatePhase.PHASE_5_CLOSING, [DebatePhase.PHASE_6_SYNTHESIS, DebatePhase.PAUSED, DebatePhase.ERROR]],
    [DebatePhase.PHASE_6_SYNTHESIS, [DebatePhase.COMPLETED, DebatePhase.ERROR]],
    [DebatePhase.PAUSED, [DebatePhase.PHASE_1_OPENING, DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PHASE_3_CROSSEXAM, DebatePhase.PHASE_4_REBUTTAL, DebatePhase.PHASE_5_CLOSING, DebatePhase.PHASE_6_SYNTHESIS, DebatePhase.ERROR]],
    [DebatePhase.COMPLETED, []],
    [DebatePhase.ERROR, []]
  ]);

  constructor(debateId: string, debateRepo: DebateRepository) {
    super();
    this.debateRepo = debateRepo;
    this.state = {
      debateId,
      currentPhase: DebatePhase.INITIALIZING,
      currentSpeaker: Speaker.SYSTEM,
      phaseStartTime: Date.now(),
      totalElapsedMs: 0,
      isPaused: false
    };
  }

  async initialize(): Promise<void> {
    await this.transition(DebatePhase.PHASE_1_OPENING, Speaker.PRO);
  }

  async transition(toPhase: DebatePhase, nextSpeaker?: Speaker): Promise<void> {
    // Validate transition
    if (!this.isValidTransition(this.state.currentPhase, toPhase)) {
      throw new Error(
        `Invalid transition: ${this.state.currentPhase} → ${toPhase}`
      );
    }

    const previousPhase = this.state.currentPhase;
    const previousSpeaker = this.state.currentSpeaker;
    const now = Date.now();
    const phaseDuration = now - this.state.phaseStartTime;

    // Update state
    this.state.currentPhase = toPhase;
    this.state.currentSpeaker = nextSpeaker || this.state.currentSpeaker;
    this.state.phaseStartTime = now;
    this.state.totalElapsedMs += phaseDuration;

    // Persist to database
    await this.persistState();

    // Emit transition event
    this.emit('phase_transition', {
      from: previousPhase,
      to: toPhase,
      speaker: this.state.currentSpeaker,
      timestamp: now,
      phaseDuration
    });

    console.log(`[StateMachine] Transition: ${previousPhase} → ${toPhase} (${this.state.currentSpeaker})`);
  }

  async pause(): Promise<void> {
    if (this.state.isPaused) {
      throw new Error('Debate is already paused');
    }

    if (this.state.currentPhase === DebatePhase.COMPLETED || this.state.currentPhase === DebatePhase.ERROR) {
      throw new Error('Cannot pause completed or errored debate');
    }

    this.state.previousPhase = this.state.currentPhase;
    this.state.isPaused = true;
    this.state.pausedAt = Date.now();

    await this.transition(DebatePhase.PAUSED);

    this.emit('paused', {
      pausedAt: this.state.pausedAt,
      previousPhase: this.state.previousPhase
    });

    console.log(`[StateMachine] Paused at phase: ${this.state.previousPhase}`);
  }

  async resume(): Promise<void> {
    if (!this.state.isPaused) {
      throw new Error('Debate is not paused');
    }

    if (!this.state.previousPhase) {
      throw new Error('No previous phase to resume to');
    }

    const resumePhase = this.state.previousPhase;
    const pauseDuration = Date.now() - (this.state.pausedAt || 0);

    this.state.isPaused = false;
    this.state.pausedAt = undefined;

    await this.transition(resumePhase);

    this.emit('resumed', {
      resumedPhase: resumePhase,
      pauseDuration
    });

    console.log(`[StateMachine] Resumed to phase: ${resumePhase}`);
  }

  async error(errorMessage: string): Promise<void> {
    const previousPhase = this.state.currentPhase;

    await this.transition(DebatePhase.ERROR);

    this.emit('error', {
      message: errorMessage,
      previousPhase,
      timestamp: Date.now()
    });

    console.error(`[StateMachine] Error: ${errorMessage}`);
  }

  async complete(): Promise<void> {
    if (this.state.currentPhase !== DebatePhase.PHASE_6_SYNTHESIS) {
      throw new Error('Cannot complete debate before synthesis phase');
    }

    await this.transition(DebatePhase.COMPLETED);

    this.emit('completed', {
      totalDuration: this.state.totalElapsedMs,
      timestamp: Date.now()
    });

    console.log(`[StateMachine] Debate completed. Total duration: ${this.state.totalElapsedMs}ms`);
  }

  private isValidTransition(from: DebatePhase, to: DebatePhase): boolean {
    const allowedTransitions = this.transitions.get(from);
    return allowedTransitions ? allowedTransitions.includes(to) : false;
  }

  private async persistState(): Promise<void> {
    await this.debateRepo.updatePhase(
      this.state.debateId,
      this.state.currentPhase,
      this.state.currentSpeaker
    );
  }

  getState(): Readonly<DebateState> {
    return { ...this.state };
  }

  getCurrentPhase(): DebatePhase {
    return this.state.currentPhase;
  }

  getCurrentSpeaker(): Speaker {
    return this.state.currentSpeaker;
  }

  isPaused(): boolean {
    return this.state.isPaused;
  }

  getTotalElapsed(): number {
    return this.state.totalElapsedMs + (Date.now() - this.state.phaseStartTime);
  }
}
```

### Phase Configuration

```typescript
// src/config/debate-protocol.ts
export const PHASE_CONFIG = {
  [DebatePhase.PHASE_1_OPENING]: {
    name: 'Opening Statements',
    durationMs: 240000, // 4 minutes
    speakers: [Speaker.PRO, Speaker.CON],
    turnsPerSpeaker: 1,
    description: 'Each advocate presents their opening position'
  },
  [DebatePhase.PHASE_2_CONSTRUCTIVE]: {
    name: 'Constructive Rounds',
    durationMs: 360000, // 6 minutes
    speakers: [Speaker.PRO, Speaker.CON],
    turnsPerSpeaker: 3, // Economic, Ethical, Practical
    description: 'Build arguments across three categories'
  },
  [DebatePhase.PHASE_3_CROSSEXAM]: {
    name: 'Cross-Examination',
    durationMs: 360000, // 6 minutes
    speakers: [Speaker.PRO, Speaker.CON],
    turnsPerSpeaker: 1,
    description: 'Question opposing arguments'
  },
  [DebatePhase.PHASE_4_REBUTTAL]: {
    name: 'Rebuttal Round',
    durationMs: 240000, // 4 minutes
    speakers: [Speaker.CON, Speaker.PRO],
    turnsPerSpeaker: 1,
    description: 'Address opposing arguments'
  },
  [DebatePhase.PHASE_5_CLOSING]: {
    name: 'Closing Statements',
    durationMs: 240000, // 4 minutes
    speakers: [Speaker.CON, Speaker.PRO],
    turnsPerSpeaker: 1,
    description: 'Final summaries'
  },
  [DebatePhase.PHASE_6_SYNTHESIS]: {
    name: 'Moderator Synthesis',
    durationMs: 180000, // 3 minutes
    speakers: [Speaker.MODERATOR],
    turnsPerSpeaker: 1,
    description: 'Neutral analysis and decision hinges'
  }
};
```

---

## Dependencies

- **INFRA-002**: Database repository for persisting state

---

## Validation

### Unit Tests

```typescript
// tests/state-machine.test.ts
import { DebateStateMachine } from '../src/services/debate/state-machine';
import { DebatePhase, Speaker } from '../src/types/debate-types';

describe('DebateStateMachine', () => {
  let stateMachine: DebateStateMachine;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      updatePhase: jest.fn()
    };
    stateMachine = new DebateStateMachine('test-id', mockRepo);
  });

  it('should initialize to PHASE_1_OPENING', async () => {
    await stateMachine.initialize();
    expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PHASE_1_OPENING);
  });

  it('should transition through valid phases', async () => {
    await stateMachine.initialize();
    await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE, Speaker.PRO);
    expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PHASE_2_CONSTRUCTIVE);
  });

  it('should reject invalid transitions', async () => {
    await stateMachine.initialize();
    await expect(
      stateMachine.transition(DebatePhase.PHASE_6_SYNTHESIS)
    ).rejects.toThrow('Invalid transition');
  });

  it('should pause and resume correctly', async () => {
    await stateMachine.initialize();
    await stateMachine.pause();
    expect(stateMachine.isPaused()).toBe(true);
    expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PAUSED);

    await stateMachine.resume();
    expect(stateMachine.isPaused()).toBe(false);
    expect(stateMachine.getCurrentPhase()).toBe(DebatePhase.PHASE_1_OPENING);
  });

  it('should emit events on transitions', async () => {
    const spy = jest.fn();
    stateMachine.on('phase_transition', spy);

    await stateMachine.initialize();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      to: DebatePhase.PHASE_1_OPENING
    }));
  });

  it('should track total elapsed time', async () => {
    await stateMachine.initialize();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(stateMachine.getTotalElapsed()).toBeGreaterThan(90);
  });
});
```

### Definition of Done

- [ ] All 8 debate phases defined in enum
- [ ] State machine class implemented with transition logic
- [ ] Pause/resume functionality works correctly
- [ ] Invalid transitions are rejected
- [ ] State persisted to database on each transition
- [ ] Events emitted for phase transitions, pause, resume, complete, error
- [ ] Unit tests cover all transition paths
- [ ] Unit tests achieve >95% coverage
- [ ] Integration test with mock database repository
- [ ] Documentation includes state diagram

---

## Notes

- Use EventEmitter pattern for loose coupling with SSE manager
- Consider adding state machine visualization tool for debugging
- Phase durations are guidelines; actual runtime depends on LLM latency
- PAUSED state preserves `previousPhase` for exact resumption
- ERROR state is terminal; requires creating new debate
- Consider adding metrics: transition count, average phase duration

---

**Estimated Time:** 10-12 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
