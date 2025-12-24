# ClearSide Implementation Notes

> **Purpose**: This document tracks what has been implemented and where to find it.
> Helps future agents understand the codebase structure without reading every file.
>
> **Last Updated**: 2025-12-24

---

## Completed Implementation Summary

### Phase 1 Progress: 72% Complete (21/29 tasks)

| Category | Tasks Done | Total | Status |
|----------|------------|-------|--------|
| Infrastructure | 5 | 5 | ✅ Complete |
| Core Engine | 5 | 5 | ✅ Complete |
| AI Agents | 5 | 5 | ✅ Complete |
| UI Components | 6 | 9 | 🟡 In Progress |
| Testing | 1 | 5 | 🟡 In Progress |

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

## Frontend Structure (Added 2025-12-24)

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                    # ⭐ Design System
│   │   │   ├── Button/            # Primary, secondary, ghost, danger
│   │   │   ├── Input/             # With label, error support
│   │   │   ├── Textarea/          # Multiline with auto-resize
│   │   │   ├── Modal/             # Portal-based dialog
│   │   │   ├── Badge/             # Status labels
│   │   │   ├── Alert/             # Info, success, warning, error
│   │   │   ├── Card/              # Container component
│   │   │   └── index.ts           # Unified export
│   │   │
│   │   ├── InputForm/             # Proposition input (UI-001)
│   │   │   ├── InputForm.tsx
│   │   │   ├── CharacterCount.tsx
│   │   │   └── index.ts
│   │   │
│   │   └── DebateStream/          # Live debate display (UI-002)
│   │       ├── DebateStream.tsx   # Main container + auto-scroll
│   │       ├── PhaseIndicator.tsx # 6-phase progress (UI-007)
│   │       ├── SpeakerBadge.tsx   # Pro/Con/Moderator (UI-008)
│   │       ├── TurnCard.tsx       # Completed turns
│   │       ├── StreamingTurn.tsx  # Active streaming turn
│   │       └── index.ts
│   │
│   ├── stores/
│   │   └── debate-store.ts        # ⭐ Zustand state + SSE
│   │
│   ├── styles/
│   │   └── tokens.css             # ⭐ CSS design tokens
│   │
│   ├── types/
│   │   └── debate.ts              # Debate types (const objects, not enums!)
│   │
│   ├── utils/
│   │   └── validation.ts          # Form validation
│   │
│   ├── test-utils/
│   │   ├── index.tsx              # Custom render with providers
│   │   ├── sseMock.ts             # EventSource mock
│   │   └── customMatchers.ts      # Vitest matchers
│   │
│   └── setupTests.ts              # Vitest setup
```

### Critical: TypeScript Enum Restriction

**`erasableSyntaxOnly: true`** is enabled - enums are NOT allowed!

```typescript
// ❌ DON'T USE
enum DebatePhase { PHASE_1 = 'PHASE_1' }

// ✅ USE CONST OBJECTS
export const DebatePhase = {
  PHASE_1_OPENING: 'PHASE_1_OPENING',
} as const;
export type DebatePhase = (typeof DebatePhase)[keyof typeof DebatePhase];
```

### Design Tokens Location

All CSS variables in `src/styles/tokens.css`:
- Colors: `--color-primary`, `--color-pro`, `--color-con`, `--color-moderator`
- Spacing: `--spacing-xs` through `--spacing-2xl`
- Typography: `--font-size-*`, `--font-weight-*`
- Other: `--radius-*`, `--shadow-*`, `--transition-*`

### Zustand Store Usage

```typescript
import { useDebateStore } from '@/stores/debate-store';

// In components - select specific state for performance
const debate = useDebateStore((state) => state.debate);
const { startDebate, pauseDebate } = useDebateStore.getState();

// Available selectors
import { selectIsDebateActive, selectPendingInterventions } from '@/stores/debate-store';
```

### Testing with Vitest (NOT Jest!)

The task files mention Jest, but we use **Vitest**:

```typescript
import { describe, it, expect, vi } from 'vitest';  // NOT @jest/globals
import { render, screen } from '@/test-utils';       // Custom render with providers
```

**EventSource Mock Pattern** (class-based, not function):

```typescript
let mockInstance: MockEventSource;
class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  close = vi.fn();
  constructor(_url: string) { mockInstance = this; }
}
vi.stubGlobal('EventSource', MockEventSource);
```

---

## For Future Agents: Quick Reference

### If working on UI tasks:

- **Frontend components**: `frontend/src/components/`
- **Zustand store**: `frontend/src/stores/debate-store.ts` (already handles SSE!)
- **Design tokens**: `frontend/src/styles/tokens.css`
- **Existing UI components**: Button, Input, Textarea, Modal, Badge, Alert, Card
- **Types**: `frontend/src/types/debate.ts` (use const objects, not enums!)
- **Backend SSE manager**: `backend/src/services/sse/sse-manager.ts`
- **SSE event types**: `backend/src/types/sse.ts`

### If working on Testing tasks:

**Frontend (Vitest - NOT Jest!):**
- Test utilities: `frontend/src/test-utils/index.tsx`
- SSE mock: `frontend/src/test-utils/sseMock.ts`
- Custom matchers: `frontend/src/test-utils/customMatchers.ts`
- Run tests: `cd frontend && npm run test:run`
- Run coverage: `cd frontend && npm run test:coverage`

**Backend:**
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
| `866bc39` | UI-001/002/006/007/008/009 + TEST-001: Frontend components & test suite |
| `ea6cd46` | AGENT-005: Comprehensive prompt template library |
| `7db4ae9` | AGENT-001 to AGENT-004: All debate agents |

---

*This document should be updated as new features are implemented.*
