# CORE-002: Debate Orchestrator - Implementation Summary

## Overview
Successfully implemented the Debate Orchestrator, the core orchestration engine that manages the complete lifecycle of debates in the ClearSide system.

## Files Created

### 1. Agent Type Interfaces
**File:** `/home/user/ClearSide/backend/src/services/agents/types.ts` (5.8K)

Defines comprehensive type interfaces for all AI agents:
- `AgentContext` - Context provided to agents during generation
- `NormalizedProposition` - Structured proposition output
- `BaseAgent` - Base interface for all agents
- `ProAdvocateAgent` - Pro advocate interface with methods for all debate phases
- `ConAdvocateAgent` - Con advocate interface with methods for all debate phases
- `ModeratorAgent` - Neutral moderator interface
- `OrchestratorAgent` - Meta-orchestration interface for proposition normalization
- `AgentFactory` - Factory type for creating agent instances

### 2. Mock Agent Implementations
**File:** `/home/user/ClearSide/backend/src/services/agents/mock-agents.ts` (12K)

Mock agents for testing and development:
- `MockProAdvocate` - Returns placeholder pro arguments
- `MockConAdvocate` - Returns placeholder con arguments
- `MockModerator` - Returns placeholder moderation responses
- `MockOrchestrator` - Handles proposition normalization with simple validation
- `mockAgentFactory` - Factory function to create mock agent instances

**Key Features:**
- Recognizable placeholder responses (e.g., "[Pro Advocate - Opening Statement]")
- Proper interface implementation for all agent types
- Smart proposition validation (rejects empty/meaningless propositions)
- Ready to be replaced with real LLM-powered agents in AGENT-001 to AGENT-004

### 3. Orchestrator Type Definitions
**File:** `/home/user/ClearSide/backend/src/types/orchestrator.ts` (7.4K)

Comprehensive types for orchestrator functionality:
- `OrchestratorUtterance` - Extended utterance with runtime metadata
- `OrchestratorIntervention` - User intervention wrapper
- `DebateTranscript` - Complete debate transcript (Schema v2.0.0 compliant)
- `PropositionContext` - Additional context for propositions
- `Turn` - Single speaking turn specification
- `PhaseExecutionPlan` - Ordered turns for a phase
- `OrchestratorConfig` - Configuration options
- `OrchestratorState` - Runtime state tracking

### 4. Turn Manager
**File:** `/home/user/ClearSide/backend/src/services/debate/turn-manager.ts` (7.9K)

Generates turn sequences for each debate phase:
- **Phase 1 (Opening):** Moderator intro → Pro opening → Con opening
- **Phase 2 (Constructive):** Alternating Pro/Con arguments (2 turns each)
- **Phase 3 (Cross-Exam):** Question/response pairs between advocates (3 rounds)
- **Phase 4 (Rebuttal):** Alternating rebuttals (2 turns each)
- **Phase 5 (Closing):** Con closing → Pro closing (Pro gets last word)
- **Phase 6 (Synthesis):** Moderator synthesis only

**Key Methods:**
- `getPhaseExecutionPlan(phase)` - Get turns for a phase
- `getAllDebateTurns()` - Get complete debate turn sequence
- `getTotalTurnCount()` - Count total turns across all phases
- `isValidTurn(phase, speaker, turnNumber)` - Validate turn eligibility

### 5. Debate Orchestrator
**File:** `/home/user/ClearSide/backend/src/services/debate/debate-orchestrator.ts` (24K)

Core orchestration engine managing complete debate lifecycle:

**Main Entry Point:**
```typescript
async startDebate(rawProposition, propositionContext?): Promise<DebateTranscript>
```

**Key Responsibilities:**
1. **Proposition Normalization** - Validate and structure raw user input
2. **Phase Execution** - Execute all 6 debate phases sequentially
3. **Turn Coordination** - Call appropriate agents for each turn
4. **State Management** - Coordinate with state machine for transitions
5. **Persistence** - Validate, save, and broadcast utterances
6. **Error Handling** - Retry logic with exponential backoff
7. **Pause/Resume** - Support user interventions and pausing
8. **Transcript Generation** - Build final structured transcript

**Agent Routing:**
- Routes to correct agent based on speaker and prompt type
- Handles special prompts (opening, constructive, cross-exam, rebuttal, closing, synthesis)
- Builds full context from previous utterances and debate state

**Error Recovery:**
- Configurable retry attempts (default: 3)
- Retry delay with backoff (default: 1000ms)
- Graceful degradation on failures
- Comprehensive error logging

**Configuration Options:**
```typescript
{
  maxRetries: 3,              // Agent call retry attempts
  retryDelayMs: 1000,         // Delay between retries
  agentTimeoutMs: 30000,      // Agent call timeout
  validateUtterances: true,   // Validate before persist
  broadcastEvents: true,      // SSE broadcasting
  autoSaveTranscript: true,   // Periodic saves
  autoSaveIntervalMs: 60000   // Save interval
}
```

### 6. Barrel Exports
**File:** `/home/user/ClearSide/backend/src/services/agents/index.ts` (480 bytes)

Central export point for all agent-related services and types.

**Updated:** `/home/user/ClearSide/backend/src/services/debate/index.ts` (353 bytes)

Added exports for `TurnManager`, `turnManager`, and `DebateOrchestrator`.

### 7. Integration Tests
**File:** `/home/user/ClearSide/backend/tests/debate-orchestrator.test.ts` (17 test suites)

Comprehensive test coverage:

✅ **Proposition Normalization** (3 tests)
- Normalize raw propositions
- Reject invalid propositions
- Include proposition context

✅ **Turn Execution** (2 tests)
- Execute single turns successfully
- Build agent context correctly

✅ **Agent Routing** (3 tests)
- Route to Pro Advocate
- Route to Con Advocate
- Route to Moderator

✅ **Error Handling and Retry** (2 tests)
- Retry on agent failure
- Throw after max retries

✅ **Pause and Resume** (2 tests)
- Pause debate
- Resume debate

✅ **Transcript Generation** (2 tests)
- Build final transcript
- Include agent metadata

✅ **Intervention Handling** (2 tests)
- Handle user interventions
- Pause on pause_request

✅ **Recording Utterances** (1 test)
- Validate utterances before persisting

**Test Results:**
```
Test Files  1 passed (1)
Tests       17 passed (17)
Duration    1.73s
```

## Orchestrator Flow Summary

### Debate Execution Flow

```
1. startDebate(rawProposition)
   ├─ Normalize proposition (via orchestrator agent)
   ├─ Validate proposition
   ├─ Initialize state machine → PHASE_1_OPENING
   ├─ Mark debate as started in database
   │
   ├─ executeAllPhases(proposition)
   │  ├─ For each phase (1-6):
   │  │  ├─ Check if paused (wait if needed)
   │  │  ├─ executePhase(phase, proposition)
   │  │  │  ├─ Get turn plan from TurnManager
   │  │  │  ├─ Broadcast phase_start event
   │  │  │  ├─ For each turn:
   │  │  │  │  ├─ Check if paused
   │  │  │  │  ├─ executeTurn(turn, proposition)
   │  │  │  │  │  ├─ buildAgentContext(speaker)
   │  │  │  │  │  ├─ callAgent(speaker, promptType, context)
   │  │  │  │  │  │  ├─ Retry logic (max 3 attempts)
   │  │  │  │  │  │  ├─ Route to correct agent
   │  │  │  │  │  │  └─ Return generated content
   │  │  │  │  │  ├─ Create OrchestratorUtterance
   │  │  │  │  │  └─ recordUtterance(utterance)
   │  │  │  │  │     ├─ Validate with schema validator
   │  │  │  │  │     ├─ Persist to database
   │  │  │  │  │     └─ Broadcast via SSE
   │  │  │  └─ Broadcast phase_complete event
   │  │  └─ Transition to next phase
   │  └─ All phases complete
   │
   └─ completeDebate()
      ├─ Transition state machine to COMPLETED
      ├─ buildFinalTranscript()
      │  ├─ Fetch all utterances
      │  ├─ Fetch all interventions
      │  ├─ Build phase summaries
      │  └─ Construct transcript (Schema v2.0.0)
      ├─ Save transcript to database
      ├─ Mark debate as complete
      ├─ Broadcast debate_complete event
      └─ Return DebateTranscript
```

### Agent Routing Example

```
Turn: { speaker: Speaker.PRO, promptType: "opening_statement" }

callAgent(Speaker.PRO, "opening_statement", context)
  └─ callAgentInternal(Speaker.PRO, "opening_statement", context)
     └─ callProAdvocate("opening_statement", context)
        └─ agents.pro.generateOpeningStatement(context)
           └─ MockProAdvocate.generateOpeningStatement(context)
              └─ "[Pro Advocate - Opening Statement]\n\nI stand in strong support..."
```

### Turn Manager Output Example

**Phase 1 (Opening Statements):**
```typescript
{
  phase: DebatePhase.PHASE_1_OPENING,
  turns: [
    { turnNumber: 1, speaker: MODERATOR, promptType: 'introduction' },
    { turnNumber: 2, speaker: PRO, promptType: 'opening_statement' },
    { turnNumber: 3, speaker: CON, promptType: 'opening_statement' }
  ],
  metadata: {
    name: 'Opening Statements',
    expectedDurationMs: 240000,
    allowedSpeakers: [MODERATOR, PRO, CON]
  }
}
```

## Dependencies

The orchestrator integrates with:
- `DebateStateMachine` - Phase transitions and state management
- `TurnManager` - Turn sequence generation
- `SSEManager` - Real-time event broadcasting
- `SchemaValidator` - Utterance validation
- Agent interfaces - Pro, Con, Moderator, Orchestrator agents
- Database repositories - Debate, Utterance, Intervention persistence

## Usage Example

```typescript
import { DebateOrchestrator } from './services/debate/debate-orchestrator.js';
import { DebateStateMachine } from './services/debate/state-machine.js';
import { TurnManager } from './services/debate/turn-manager.js';
import { sseManager } from './services/sse/sse-manager.js';
import { schemaValidator } from './services/validation/schema-validator.js';
import { mockAgentFactory } from './services/agents/mock-agents.js';

// Create debate in database
const debate = await debateRepo.create({
  propositionText: 'Raw user input...',
  propositionContext: { background: '...' }
});

// Initialize components
const stateMachine = new DebateStateMachine(debate.id);
const turnManager = new TurnManager();
const agents = {
  pro: mockAgentFactory.createProAdvocate(),
  con: mockAgentFactory.createConAdvocate(),
  moderator: mockAgentFactory.createModerator(),
  orchestrator: mockAgentFactory.createOrchestrator()
};

// Create orchestrator
const orchestrator = new DebateOrchestrator(
  debate.id,
  stateMachine,
  turnManager,
  sseManager,
  schemaValidator,
  agents
);

// Start debate
const transcript = await orchestrator.startDebate(
  'AI data centers should be subject to a moratorium',
  { background: 'Environmental concerns...' }
);

console.log(`Debate completed with ${transcript.utterances.length} utterances`);
```

## Next Steps

### Ready for Integration
The orchestrator is ready to be used with real LLM-powered agents. When AGENT-001 to AGENT-004 are implemented, simply replace the mock agents:

```typescript
const agents = {
  pro: new RealProAdvocateAgent(llmClient),
  con: new RealConAdvocateAgent(llmClient),
  moderator: new RealModeratorAgent(llmClient),
  orchestrator: new RealOrchestratorAgent(llmClient)
};
```

### Upcoming Tasks
- **AGENT-001:** Implement Orchestrator Agent (LLM-powered proposition normalization)
- **AGENT-002:** Implement Pro Advocate Agent (LLM-powered pro arguments)
- **AGENT-003:** Implement Con Advocate Agent (LLM-powered con arguments)
- **AGENT-004:** Implement Moderator Agent (LLM-powered moderation)
- **UI-001 to UI-009:** Build frontend components to consume orchestrator output

## Testing

Run tests:
```bash
cd backend
npm test -- debate-orchestrator.test.ts
```

All 17 tests pass successfully:
- ✅ Proposition normalization
- ✅ Turn execution
- ✅ Agent routing
- ✅ Error handling with retry
- ✅ Pause/resume functionality
- ✅ Transcript generation
- ✅ Intervention handling
- ✅ Utterance validation and persistence

## Completion Status

✅ **CORE-002: Debate Orchestrator - COMPLETE**

All requirements met:
- ✅ Agent interfaces defined
- ✅ Mock agents implemented
- ✅ Turn manager created
- ✅ Debate orchestrator implemented
- ✅ Error handling with retry logic
- ✅ Pause/resume support
- ✅ Intervention handling
- ✅ Transcript generation
- ✅ Schema validation integration
- ✅ SSE broadcasting integration
- ✅ Database persistence integration
- ✅ Comprehensive test coverage

---

**Implementation Date:** December 23, 2025
**Test Status:** 17/17 tests passing
**Total Lines of Code:** ~1,500 lines (excluding tests)
**Test Coverage:** 17 comprehensive integration tests
