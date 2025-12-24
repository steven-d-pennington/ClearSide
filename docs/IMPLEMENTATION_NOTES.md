# ClearSide Implementation Notes

> **Purpose**: This document tracks what has been implemented and where to find it.
> Helps future agents understand the codebase structure without reading every file.
>
> **Last Updated**: 2025-12-24

---

## Completed Implementation Summary

### Phase 1 Progress: 52% Complete (15/29 tasks)

| Category | Tasks Done | Total | Status |
|----------|------------|-------|--------|
| Infrastructure | 5 | 5 | ✅ Complete |
| Core Engine | 5 | 5 | ✅ Complete |
| AI Agents | 5 | 5 | ✅ Complete |
| UI Components | 0 | 9 | 📋 Not Started |
| Testing | 0 | 5 | 📋 Not Started |

---

## Backend Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── llm.ts              # LLM provider configuration
│   │   ├── debate-protocol.ts  # 6-phase debate timing
│   │   └── phase-turns.ts      # Turn order per phase
│   │
│   ├── db/
│   │   ├── connection.ts       # PostgreSQL connection
│   │   ├── migrate.ts          # Database migrations
│   │   └── repositories/
│   │       ├── debate-repository.ts
│   │       ├── utterance-repository.ts
│   │       └── intervention-repository.ts
│   │
│   ├── routes/
│   │   ├── debate-routes.ts    # /api/debates endpoints
│   │   └── intervention-routes.ts
│   │
│   ├── services/
│   │   ├── agents/             # ⭐ AI Agent System
│   │   │   ├── index.ts        # Central export
│   │   │   ├── types.ts        # Agent interfaces
│   │   │   ├── orchestrator-agent.ts
│   │   │   ├── pro-advocate-agent.ts
│   │   │   ├── con-advocate-agent.ts
│   │   │   ├── moderator-agent.ts
│   │   │   ├── mock-agents.ts  # For testing
│   │   │   └── prompts/        # ⭐ Prompt Library
│   │   │       ├── index.ts    # Unified export
│   │   │       ├── types.ts    # Prompt types
│   │   │       ├── quality-validators.ts
│   │   │       ├── orchestrator-prompts.ts
│   │   │       ├── pro-advocate-prompts.ts
│   │   │       ├── con-advocate-prompts.ts
│   │   │       ├── moderator-prompts.ts
│   │   │       ├── version-control.ts
│   │   │       └── prompt-tester.ts
│   │   │
│   │   ├── debate/
│   │   │   ├── state-machine.ts
│   │   │   ├── debate-orchestrator.ts
│   │   │   └── turn-manager.ts
│   │   │
│   │   ├── intervention/
│   │   │   └── intervention-queue.ts
│   │   │
│   │   ├── llm/
│   │   │   ├── client.ts       # OpenAI/Anthropic client
│   │   │   └── index.ts
│   │   │
│   │   ├── logging/
│   │   │   ├── logger.ts       # Pino logger
│   │   │   └── error-tracker.ts
│   │   │
│   │   ├── sse/
│   │   │   └── sse-manager.ts  # Server-sent events
│   │   │
│   │   ├── transcript/
│   │   │   └── transcript-recorder.ts
│   │   │
│   │   └── validation/
│   │       └── schema-validator.ts
│   │
│   └── types/
│       ├── debate.ts           # DebatePhase, Speaker enums
│       ├── database.ts         # DB entity types
│       ├── llm.ts              # LLM request/response
│       ├── sse.ts              # SSE event types
│       └── orchestrator.ts
```

---

## AI Agent System Details

### Agent Interfaces (`backend/src/services/agents/types.ts`)

```typescript
// All agents implement BaseAgent
interface BaseAgent {
  generateResponse(prompt: string, context: AgentContext): Promise<string>;
  getMetadata(): { name: string; version: string; model?: string };
}

// Specific agent interfaces
interface OrchestratorAgent extends BaseAgent {
  normalizeProposition(rawInput: string, context?: Record<string, unknown>): Promise<NormalizedProposition>;
  validateProposition(proposition: string): Promise<{ valid: boolean; reason?: string }>;
}

interface ProAdvocateAgent extends BaseAgent {
  generateOpeningStatement(context: AgentContext): Promise<string>;
  generateConstructiveArgument(context: AgentContext): Promise<string>;
  generateCrossExamQuestion(context: AgentContext): Promise<string>;
  respondToCrossExam(question: string, context: AgentContext): Promise<string>;
  generateRebuttal(context: AgentContext): Promise<string>;
  generateClosingStatement(context: AgentContext): Promise<string>;
}

// ConAdvocateAgent mirrors ProAdvocateAgent structure
// ModeratorAgent has: generateIntroduction, announcePhaseTransition, generateSynthesis, handleIntervention
```

### Using Agents

```typescript
import {
  OrchestratorAgent,
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent
} from './services/agents/index.js';
import { createLLMClient } from './services/llm/client.js';

const llmClient = createLLMClient();

// Create agents
const orchestrator = new OrchestratorAgent(llmClient);
const proAdvocate = new ProAdvocateAgent(llmClient);
const conAdvocate = new ConAdvocateAgent(llmClient);
const moderator = new ModeratorAgent(llmClient);

// Example: Normalize a proposition
const normalized = await orchestrator.normalizeProposition("AI is dangerous");
// Returns: { normalized_question, context, confidence }

// Example: Generate Pro opening
const opening = await proAdvocate.generateOpeningStatement({
  debateId: 'debate-123',
  currentPhase: DebatePhase.PHASE_1_OPENING,
  previousUtterances: [],
  speaker: Speaker.PRO,
  proposition: normalized.normalized_question,
  propositionContext: normalized.context,
});
```

### Prompt Library (`backend/src/services/agents/prompts/`)

```typescript
import {
  // Pro prompts
  PRO_ADVOCATE_PROMPTS,
  PRO_PROMPT_BUILDERS,

  // Con prompts
  CON_ADVOCATE_PROMPTS,
  CON_PROMPT_BUILDERS,

  // Moderator prompts
  MODERATOR_PROMPTS,
  MODERATOR_PROMPT_BUILDERS,

  // Quality validators
  QUALITY_VALIDATORS,
  noStrawmanCheck,
  noWinnerPickingCheck,

  // Unified library
  PROMPT_LIBRARY,
  getPrompt,
  getAllPromptTemplates,
} from './services/agents/prompts/index.js';
```

---

## Debate Protocol (6 Phases)

From `docs/08_live-debate-protocol.md`:

| Phase | Duration | Pro | Con | Moderator |
|-------|----------|-----|-----|-----------|
| 1. Opening | 4 min | 2 min | 2 min | - |
| 2. Constructive | 12 min | 6 min | 6 min | - |
| 3. Cross-Exam | 6 min | 3 min asking | 3 min asking | - |
| 4. Rebuttal | 4 min | 2 min | 2 min | - |
| 5. Closing | 4 min | 2 min | 2 min | - |
| 6. Synthesis | 3 min | - | - | 3 min |

**Total Runtime**: ~27 minutes (+ interventions)

---

## SSE Event Types

From `backend/src/types/sse.ts`:

```typescript
type SSEEventType =
  | 'debate:started'
  | 'phase:changed'
  | 'utterance:started'
  | 'utterance:chunk'
  | 'utterance:completed'
  | 'intervention:queued'
  | 'intervention:processed'
  | 'debate:completed'
  | 'error';
```

---

## Database Schema

Key tables (PostgreSQL):

- `debates` - Main debate records
- `utterances` - All agent outputs (Pro, Con, Moderator)
- `interventions` - User questions/challenges

See `backend/prisma/schema.prisma` for full schema.

---

## Key Design Principles

1. **Steel-man arguments** - No straw-manning, treat opposing view as intelligent
2. **Explicit assumptions** - Every argument states its premises
3. **Preserve uncertainty** - No false confidence
4. **Moderator neutrality** - NEVER picks a winner
5. **Evidence classification** - Fact, Projection, Analogy, Value

---

## For Future Agents: Quick Reference

### If working on UI tasks:

- SSE manager: `backend/src/services/sse/sse-manager.ts`
- Event types: `backend/src/types/sse.ts`
- Debate state: Use Zustand, subscribe to SSE events
- Agent outputs come as `utterance:chunk` events during streaming

### If working on Testing tasks:

- Mock agents: `backend/src/services/agents/mock-agents.ts`
- Prompt tester: `backend/src/services/agents/prompts/prompt-tester.ts`
- Quality validators: `backend/src/services/agents/prompts/quality-validators.ts`

### If working on Export tasks (Phase 2):

- Transcript recorder: `backend/src/services/transcript/transcript-recorder.ts`
- Full debate transcript available after Phase 6 completion

---

## Commits Reference

| Commit | Description |
|--------|-------------|
| `ea6cd46` | AGENT-005: Comprehensive prompt template library |
| `7db4ae9` | AGENT-001 to AGENT-004: All debate agents |

---

*This document should be updated as new features are implemented.*
