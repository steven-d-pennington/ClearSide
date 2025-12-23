# CORE-003: Implement Turn Management System

**Priority:** P0
**Estimate:** M
**Labels:** `core`, `backend`
**Status:** 🟢 TO DO

---

## Context

The Turn Management System defines and enforces the turn-based structure of each debate phase. It determines which agent speaks when, with what prompt, and for how long. This component ensures the debate follows the formal protocol specified in the Live Debate Protocol document.

**References:**
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Complete phase structure
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-202, FR-251-256
- [Real-Time Architecture](../../../docs/09_real-time-architecture.md) - Component Responsibilities

---

## Requirements

### Acceptance Criteria

- [ ] Define phase turn structures for all 6 phases
- [ ] Implement turn queue system
- [ ] Add speaker tracking (Pro/Con/Moderator)
- [ ] Enforce time limits per turn (guidance, not hard limits)
- [ ] Handle turn completion and auto-advance
- [ ] Support getting next turn in sequence
- [ ] Support getting all turns for a phase
- [ ] Document turn structure with examples

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-202**: System SHALL manage turn-based dialogue between agents
- **FR-251**: Implement 6-phase debate protocol
- **FR-252**: Each phase SHALL have defined time allocations per speaker
- **FR-253**: Cross-examination SHALL alternate between Pro and Con
- **FR-254**: Rebuttal phase SHALL allow agents to address opposing arguments

---

## Implementation Guide

### Phase Turn Configurations

```typescript
// src/config/phase-turns.ts
import { DebatePhase, Speaker } from '../types/debate-types';

export interface TurnConfig {
  speaker: Speaker;
  promptType: string;
  durationSeconds: number;
  metadata?: {
    round?: number;
    category?: 'economic' | 'ethical' | 'practical';
    questionType?: 'probe' | 'clarify' | 'challenge';
  };
}

export const PHASE_TURN_CONFIGS: Record<DebatePhase, TurnConfig[]> = {
  [DebatePhase.PHASE_1_OPENING]: [
    {
      speaker: Speaker.PRO,
      promptType: 'opening_statement',
      durationSeconds: 120,
      metadata: {}
    },
    {
      speaker: Speaker.CON,
      promptType: 'opening_statement',
      durationSeconds: 120,
      metadata: {}
    }
  ],

  [DebatePhase.PHASE_2_CONSTRUCTIVE]: [
    // Round 1: Economic/Technical
    {
      speaker: Speaker.PRO,
      promptType: 'constructive_economic',
      durationSeconds: 120,
      metadata: { round: 1, category: 'economic' }
    },
    {
      speaker: Speaker.CON,
      promptType: 'constructive_economic',
      durationSeconds: 120,
      metadata: { round: 1, category: 'economic' }
    },
    // Round 2: Ethical/Social
    {
      speaker: Speaker.PRO,
      promptType: 'constructive_ethical',
      durationSeconds: 120,
      metadata: { round: 2, category: 'ethical' }
    },
    {
      speaker: Speaker.CON,
      promptType: 'constructive_ethical',
      durationSeconds: 120,
      metadata: { round: 2, category: 'ethical' }
    },
    // Round 3: Practical
    {
      speaker: Speaker.PRO,
      promptType: 'constructive_practical',
      durationSeconds: 120,
      metadata: { round: 3, category: 'practical' }
    },
    {
      speaker: Speaker.CON,
      promptType: 'constructive_practical',
      durationSeconds: 120,
      metadata: { round: 3, category: 'practical' }
    }
  ],

  [DebatePhase.PHASE_3_CROSSEXAM]: [
    {
      speaker: Speaker.PRO,
      promptType: 'cross_exam_question',
      durationSeconds: 180,
      metadata: { questionType: 'probe' }
    },
    {
      speaker: Speaker.CON,
      promptType: 'cross_exam_question',
      durationSeconds: 180,
      metadata: { questionType: 'probe' }
    }
  ],

  [DebatePhase.PHASE_4_REBUTTAL]: [
    {
      speaker: Speaker.CON,
      promptType: 'rebuttal',
      durationSeconds: 120,
      metadata: {}
    },
    {
      speaker: Speaker.PRO,
      promptType: 'rebuttal',
      durationSeconds: 120,
      metadata: {}
    }
  ],

  [DebatePhase.PHASE_5_CLOSING]: [
    {
      speaker: Speaker.CON,
      promptType: 'closing_statement',
      durationSeconds: 120,
      metadata: {}
    },
    {
      speaker: Speaker.PRO,
      promptType: 'closing_statement',
      durationSeconds: 120,
      metadata: {}
    }
  ],

  [DebatePhase.PHASE_6_SYNTHESIS]: [
    {
      speaker: Speaker.MODERATOR,
      promptType: 'synthesis',
      durationSeconds: 180,
      metadata: {}
    }
  ],

  // Special phases
  [DebatePhase.INITIALIZING]: [],
  [DebatePhase.COMPLETED]: [],
  [DebatePhase.PAUSED]: [],
  [DebatePhase.ERROR]: []
};
```

### Turn Manager Class

```typescript
// src/services/debate/turn-manager.ts
import { DebatePhase, Speaker } from '../../types/debate-types';
import { PHASE_TURN_CONFIGS, TurnConfig } from '../../config/phase-turns';

export class TurnManager {
  private currentPhase: DebatePhase = DebatePhase.INITIALIZING;
  private currentTurnIndex: number = 0;
  private turnStartTime: number = 0;

  setPhase(phase: DebatePhase): void {
    this.currentPhase = phase;
    this.currentTurnIndex = 0;
  }

  getTurnsForPhase(phase: DebatePhase): TurnConfig[] {
    const turns = PHASE_TURN_CONFIGS[phase];

    if (!turns) {
      throw new Error(`No turn configuration found for phase: ${phase}`);
    }

    return turns;
  }

  getCurrentTurn(): TurnConfig | null {
    const turns = this.getTurnsForPhase(this.currentPhase);

    if (this.currentTurnIndex >= turns.length) {
      return null; // Phase complete
    }

    return turns[this.currentTurnIndex];
  }

  getNextTurn(): TurnConfig | null {
    const turns = this.getTurnsForPhase(this.currentPhase);

    if (this.currentTurnIndex + 1 >= turns.length) {
      return null; // No more turns in this phase
    }

    return turns[this.currentTurnIndex + 1];
  }

  advanceTurn(): void {
    this.currentTurnIndex++;
    this.turnStartTime = Date.now();
  }

  isPhaseComplete(): boolean {
    const turns = this.getTurnsForPhase(this.currentPhase);
    return this.currentTurnIndex >= turns.length;
  }

  getTurnProgress(): TurnProgress {
    const turns = this.getTurnsForPhase(this.currentPhase);
    const currentTurn = this.getCurrentTurn();

    return {
      currentTurnIndex: this.currentTurnIndex,
      totalTurns: turns.length,
      currentTurn,
      isComplete: this.isPhaseComplete()
    };
  }

  getTurnElapsedTime(): number {
    if (this.turnStartTime === 0) return 0;
    return Date.now() - this.turnStartTime;
  }

  getEstimatedPhaseRemainingTime(): number {
    const turns = this.getTurnsForPhase(this.currentPhase);
    const remainingTurns = turns.slice(this.currentTurnIndex);

    return remainingTurns.reduce((total, turn) => total + turn.durationSeconds * 1000, 0);
  }

  reset(): void {
    this.currentPhase = DebatePhase.INITIALIZING;
    this.currentTurnIndex = 0;
    this.turnStartTime = 0;
  }
}

export interface TurnProgress {
  currentTurnIndex: number;
  totalTurns: number;
  currentTurn: TurnConfig | null;
  isComplete: boolean;
}
```

### Usage in Debate Orchestrator

```typescript
// In debate-orchestrator.ts
private async executePhase(phase: DebatePhase): Promise<void> {
  this.turnManager.setPhase(phase);

  while (!this.turnManager.isPhaseComplete()) {
    const turn = this.turnManager.getCurrentTurn();

    if (!turn) break;

    await this.executeTurn(turn);
    this.turnManager.advanceTurn();
  }
}
```

---

## Dependencies

**None** - This is a configuration and coordination layer

---

## Validation

### Unit Tests

```typescript
// tests/turn-manager.test.ts
import { TurnManager } from '../src/services/debate/turn-manager';
import { DebatePhase, Speaker } from '../src/types/debate-types';

describe('TurnManager', () => {
  let turnManager: TurnManager;

  beforeEach(() => {
    turnManager = new TurnManager();
  });

  describe('Phase 1: Opening Statements', () => {
    it('should return 2 turns for Phase 1', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_1_OPENING);
      expect(turns).toHaveLength(2);
      expect(turns[0].speaker).toBe(Speaker.PRO);
      expect(turns[1].speaker).toBe(Speaker.CON);
    });

    it('should advance through turns correctly', () => {
      turnManager.setPhase(DebatePhase.PHASE_1_OPENING);

      const turn1 = turnManager.getCurrentTurn();
      expect(turn1?.speaker).toBe(Speaker.PRO);

      turnManager.advanceTurn();

      const turn2 = turnManager.getCurrentTurn();
      expect(turn2?.speaker).toBe(Speaker.CON);
    });

    it('should detect phase completion', () => {
      turnManager.setPhase(DebatePhase.PHASE_1_OPENING);

      expect(turnManager.isPhaseComplete()).toBe(false);

      turnManager.advanceTurn();
      expect(turnManager.isPhaseComplete()).toBe(false);

      turnManager.advanceTurn();
      expect(turnManager.isPhaseComplete()).toBe(true);
    });
  });

  describe('Phase 2: Constructive Rounds', () => {
    it('should return 6 turns for Phase 2 (3 rounds)', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_2_CONSTRUCTIVE);
      expect(turns).toHaveLength(6);
    });

    it('should alternate speakers within each round', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_2_CONSTRUCTIVE);

      expect(turns[0].speaker).toBe(Speaker.PRO);
      expect(turns[1].speaker).toBe(Speaker.CON);
      expect(turns[2].speaker).toBe(Speaker.PRO);
      expect(turns[3].speaker).toBe(Speaker.CON);
    });

    it('should have correct round metadata', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_2_CONSTRUCTIVE);

      expect(turns[0].metadata?.round).toBe(1);
      expect(turns[0].metadata?.category).toBe('economic');

      expect(turns[2].metadata?.round).toBe(2);
      expect(turns[2].metadata?.category).toBe('ethical');

      expect(turns[4].metadata?.round).toBe(3);
      expect(turns[4].metadata?.category).toBe('practical');
    });
  });

  describe('Phase 3: Cross-Examination', () => {
    it('should return 2 turns for Phase 3', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_3_CROSSEXAM);
      expect(turns).toHaveLength(2);
    });

    it('should have Pro question Con first', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_3_CROSSEXAM);
      expect(turns[0].speaker).toBe(Speaker.PRO);
      expect(turns[1].speaker).toBe(Speaker.CON);
    });
  });

  describe('Phase 4: Rebuttal', () => {
    it('should have Con speak first in rebuttal phase', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_4_REBUTTAL);
      expect(turns[0].speaker).toBe(Speaker.CON);
      expect(turns[1].speaker).toBe(Speaker.PRO);
    });
  });

  describe('Phase 6: Synthesis', () => {
    it('should have only Moderator in synthesis phase', () => {
      const turns = turnManager.getTurnsForPhase(DebatePhase.PHASE_6_SYNTHESIS);
      expect(turns).toHaveLength(1);
      expect(turns[0].speaker).toBe(Speaker.MODERATOR);
    });
  });

  describe('Turn Progress', () => {
    it('should track turn progress correctly', () => {
      turnManager.setPhase(DebatePhase.PHASE_1_OPENING);

      let progress = turnManager.getTurnProgress();
      expect(progress.currentTurnIndex).toBe(0);
      expect(progress.totalTurns).toBe(2);
      expect(progress.isComplete).toBe(false);

      turnManager.advanceTurn();
      progress = turnManager.getTurnProgress();
      expect(progress.currentTurnIndex).toBe(1);

      turnManager.advanceTurn();
      progress = turnManager.getTurnProgress();
      expect(progress.isComplete).toBe(true);
    });
  });

  describe('Time Estimation', () => {
    it('should estimate remaining phase time', () => {
      turnManager.setPhase(DebatePhase.PHASE_1_OPENING);

      const remainingTime = turnManager.getEstimatedPhaseRemainingTime();
      // 2 turns × 120 seconds each = 240 seconds = 240000 ms
      expect(remainingTime).toBe(240000);

      turnManager.advanceTurn();
      const remainingAfterOneTurn = turnManager.getEstimatedPhaseRemainingTime();
      // 1 turn × 120 seconds = 120000 ms
      expect(remainingAfterOneTurn).toBe(120000);
    });
  });
});
```

### Definition of Done

- [ ] Phase turn configurations defined for all 6 phases
- [ ] Turn manager implements queue logic
- [ ] Speaker tracking works correctly
- [ ] Turn advancement works
- [ ] Phase completion detection works
- [ ] Progress tracking works
- [ ] Time estimation works
- [ ] Unit tests achieve 100% coverage
- [ ] Documentation includes all prompt types

---

## Notes

- Turn durations are **guidance** for agents, not hard limits
- Actual duration depends on LLM latency
- Cross-exam phase alternates questioner role
- Rebuttal phase reverses order (Con first for fairness)
- Synthesis phase has only Moderator
- Consider adding turn timeout warnings in UI
- Prompt types map to agent prompt templates

---

**Estimated Time:** 4-6 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
