# Debate State Machine - State Transition Diagram

## State Machine Overview

The debate state machine manages 10 distinct states with strict transition rules to ensure debate integrity.

## State Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DEBATE STATE MACHINE                             │
└─────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │  INITIALIZING   │ (Initial State)
                    └────────┬────────┘
                             │
                             │ initialize()
                             ▼
                    ┌─────────────────┐
                    │ PHASE_1_OPENING │ (4 min)
                    │  Moderator + Pro/Con    │
                    └────────┬────────┘
                             │
                             │ transition()
                             ▼
               ┌─────────────────────────┐
               │ PHASE_2_CONSTRUCTIVE    │ (6 min)
               │  Pro/Con + Moderator    │
               └────────┬────────────────┘
                        │
                        │ transition()
                        ▼
               ┌─────────────────────┐
               │ PHASE_3_CROSSEXAM   │ (6 min)
               │  Pro/Con + Moderator│
               └────────┬────────────┘
                        │
                        │ transition()
                        ▼
               ┌─────────────────────┐
               │ PHASE_4_REBUTTAL    │ (4 min)
               │  Pro/Con + Moderator│
               └────────┬────────────┘
                        │
                        │ transition()
                        ▼
               ┌─────────────────────┐
               │ PHASE_5_CLOSING     │ (4 min)
               │  Pro/Con + Moderator│
               └────────┬────────────┘
                        │
                        │ transition()
                        ▼
               ┌─────────────────────┐
               │ PHASE_6_SYNTHESIS   │ (3 min)
               │  Moderator Only     │
               └────────┬────────────┘
                        │
                        │ complete()
                        ▼
               ┌─────────────────────┐
               │    COMPLETED        │ (Terminal State)
               │                     │
               └─────────────────────┘


                    SPECIAL STATES
                    ──────────────

    ┌─────────────────┐            ┌─────────────────┐
    │     PAUSED      │            │      ERROR      │
    │                 │            │                 │
    │  pause() from   │            │  error() from   │
    │  any active     │            │  any state      │
    │  phase          │            │                 │
    │                 │            │  (Terminal)     │
    │  resume() back  │            └─────────────────┘
    │  to previous    │
    │  phase          │
    └─────────────────┘
```

## Transition Rules

### Valid Transitions

| From State            | To State(s)                                  | Method        |
|-----------------------|----------------------------------------------|---------------|
| INITIALIZING          | PHASE_1_OPENING, ERROR                       | initialize()  |
| PHASE_1_OPENING       | PHASE_2_CONSTRUCTIVE, PAUSED, ERROR          | transition()  |
| PHASE_2_CONSTRUCTIVE  | PHASE_3_CROSSEXAM, PAUSED, ERROR             | transition()  |
| PHASE_3_CROSSEXAM     | PHASE_4_REBUTTAL, PAUSED, ERROR              | transition()  |
| PHASE_4_REBUTTAL      | PHASE_5_CLOSING, PAUSED, ERROR               | transition()  |
| PHASE_5_CLOSING       | PHASE_6_SYNTHESIS, PAUSED, ERROR             | transition()  |
| PHASE_6_SYNTHESIS     | COMPLETED, ERROR                             | complete()    |
| PAUSED                | (previousPhase), ERROR                       | resume()      |
| COMPLETED             | (none - terminal)                            | -             |
| ERROR                 | (none - terminal)                            | -             |

### Special Rules

1. **Sequential Progression**: Debate phases must progress sequentially (no skipping)
2. **No Backward Transitions**: Cannot go back to a previous phase
3. **Pause from Anywhere**: Any active phase can be paused
4. **Resume to Previous**: Resume always goes back to the phase that was paused
5. **Error from Anywhere**: Any state can transition to ERROR
6. **Terminal States**: COMPLETED and ERROR cannot transition to any other state
7. **Pause Time Exclusion**: Time spent in PAUSED state is NOT counted in totalElapsedMs

## Phase Configuration

| Phase                | Duration | Speakers              | Turns/Speaker | Description                          |
|----------------------|----------|-----------------------|---------------|--------------------------------------|
| PHASE_1_OPENING      | 4 min    | PRO, CON, MODERATOR   | 1             | Initial opening statements           |
| PHASE_2_CONSTRUCTIVE | 6 min    | PRO, CON, MODERATOR   | 2             | Main argument construction           |
| PHASE_3_CROSSEXAM    | 6 min    | PRO, CON, MODERATOR   | 3             | Direct questioning phase             |
| PHASE_4_REBUTTAL     | 4 min    | PRO, CON, MODERATOR   | 2             | Respond to challenges                |
| PHASE_5_CLOSING      | 4 min    | PRO, CON, MODERATOR   | 1             | Final summary statements             |
| PHASE_6_SYNTHESIS    | 3 min    | MODERATOR             | 1             | Neutral synthesis (no winner picked) |

**Total Debate Duration**: 27 minutes (excluding pause time)

## Events Emitted

The state machine emits the following events via EventEmitter:

### phase_transition
```typescript
{
  debateId: string;
  fromPhase: DebatePhase;
  toPhase: DebatePhase;
  speaker: Speaker;
  timestamp: Date;
  phaseElapsedMs: number;
  totalElapsedMs: number;
}
```

### paused
```typescript
(debateId: string, phase: DebatePhase) => void
```

### resumed
```typescript
(debateId: string, phase: DebatePhase) => void
```

### completed
```typescript
(debateId: string, totalElapsedMs: number) => void
```

### error
```typescript
(debateId: string, error: string) => void
```

## State Persistence

All state transitions are persisted to the PostgreSQL database using the debate repository:

- **Status Mapping**: State machine phases map to database statuses
  - INITIALIZING → 'initializing'
  - PHASE_X → 'live'
  - PAUSED → 'paused'
  - COMPLETED → 'completed'
  - ERROR → 'error'

- **Phase Mapping**: State machine phases map to database phases
  - PHASE_1_OPENING → 'opening_statements'
  - PHASE_2_CONSTRUCTIVE → 'evidence_presentation'
  - PHASE_3_CROSSEXAM → 'clarifying_questions'
  - PHASE_4_REBUTTAL → 'rebuttals'
  - PHASE_5_CLOSING → 'closing_statements'
  - PHASE_6_SYNTHESIS → 'synthesis'

- **Speaker Mapping**: State machine speakers map to database speakers
  - PRO → 'pro_advocate'
  - CON → 'con_advocate'
  - MODERATOR → 'moderator'
  - SYSTEM → 'moderator' (for database compatibility)

## Usage Example

```typescript
import { DebateStateMachine } from './services/debate/state-machine.js';

// Create state machine
const stateMachine = new DebateStateMachine('debate-123');

// Listen to events
stateMachine.on('phase_transition', (event) => {
  console.log(`Transitioned from ${event.fromPhase} to ${event.toPhase}`);
});

// Initialize debate
await stateMachine.initialize(); // → PHASE_1_OPENING

// Progress through phases
await stateMachine.transition(DebatePhase.PHASE_2_CONSTRUCTIVE);
await stateMachine.transition(DebatePhase.PHASE_3_CROSSEXAM);

// Pause debate
await stateMachine.pause(); // → PAUSED

// Resume debate
await stateMachine.resume(); // → PHASE_3_CROSSEXAM (continues from where paused)

// Continue
await stateMachine.transition(DebatePhase.PHASE_4_REBUTTAL);
await stateMachine.transition(DebatePhase.PHASE_5_CLOSING);
await stateMachine.transition(DebatePhase.PHASE_6_SYNTHESIS);

// Complete
await stateMachine.complete(); // → COMPLETED

// Check state
const state = stateMachine.getState();
console.log(`Total elapsed: ${state.totalElapsedMs}ms`);
```

## Test Coverage

47 comprehensive tests covering:
- ✅ Initialization
- ✅ Valid sequential transitions
- ✅ Invalid transition rejection
- ✅ Pause/resume functionality
- ✅ Error state handling
- ✅ Event emission
- ✅ Time tracking (excluding pause time)
- ✅ State persistence
- ✅ All getter methods
- ✅ Database error handling
