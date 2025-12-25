# ClearSide Implementation Notes

> **Purpose**: This document tracks what has been implemented and where to find it.
> Helps future agents understand the codebase structure without reading every file.
>
> **Last Updated**: 2025-12-25

---

## Completed Implementation Summary

### Phase 1 Progress: 97% Complete (28/29 tasks)

| Category | Tasks Done | Total | Status |
|----------|------------|-------|--------|
| Infrastructure | 5 | 5 | ✅ Complete |
| Core Engine | 5 | 5 | ✅ Complete |
| AI Agents | 5 | 5 | ✅ Complete |
| UI Components | 9 | 9 | ✅ Complete |
| Testing | 4 | 5 | ✅ Complete (Load testing remaining) |

### Phase 2 Progress: 6% Complete (1/16 tasks)

| Category | Tasks Done | Total | Status |
|----------|------------|-------|--------|
| Text Export | 1 | 2 | 🟡 In Progress |
| Audio Export | 0 | 4 | 📋 Backlog |
| Video Export | 0 | 4 | 📋 Backlog |
| Queue & Storage | 0 | 4 | 📋 Backlog |
| Export UI | 0 | 2 | 📋 Backlog |

### Test Coverage Summary

| Category | Tests | Files |
|----------|-------|-------|
| Unit Tests (Frontend) | 166 | 9 |
| Integration Tests | 20 | 1 |
| E2E Tests (Playwright) | 40+ | 4 |
| Accessibility Tests | 111 | 3 |
| Agent Quality Tests | 101 | 4 |
| Export Tests | 40 | 1 |
| **Total** | **~480+** | **22** |

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
│   │   ├── DebateStream/          # Live debate display (UI-002)
│   │   │   ├── DebateStream.tsx   # Main container + auto-scroll
│   │   │   ├── PhaseIndicator.tsx # 6-phase progress (UI-007)
│   │   │   ├── SpeakerBadge.tsx   # Pro/Con/Moderator (UI-008)
│   │   │   ├── TurnCard.tsx       # Completed turns
│   │   │   ├── StreamingTurn.tsx  # Active streaming turn
│   │   │   └── index.ts
│   │   │
│   │   ├── TimelineScrubber/      # Phase navigation (UI-003)
│   │   │   ├── TimelineScrubber.tsx  # Interactive 6-phase timeline
│   │   │   ├── TimelinePhase.tsx     # Individual phase indicator
│   │   │   ├── ProgressBar.tsx       # Visual progress bar
│   │   │   └── *.module.css
│   │   │
│   │   ├── InterventionPanel/     # User interventions (UI-004)
│   │   │   ├── InterventionPanel.tsx # Main panel + modal
│   │   │   ├── InterventionForm.tsx  # Submission form
│   │   │   ├── InterventionCard.tsx  # Display submitted interventions
│   │   │   └── *.module.css
│   │   │
│   │   └── Layout/                # App layout (UI-005)
│   │       ├── AppLayout.tsx      # Main app shell
│   │       ├── Header.tsx         # Sticky header
│   │       ├── Navigation.tsx     # Desktop nav
│   │       ├── MobileMenu.tsx     # Slide-out mobile nav
│   │       ├── Footer.tsx
│   │       ├── SkipLink.tsx       # Accessibility skip link
│   │       └── *.module.css
│   │
│   ├── hooks/
│   │   └── useMediaQuery.ts       # Responsive design hook
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
- Integration tests: `frontend/src/__tests__/integration/`
- Run tests: `cd frontend && npm run test:run`
- Run coverage: `cd frontend && npm run test:coverage`

**Backend:**
- Mock agents: `backend/src/services/agents/mock-agents.ts`
- Prompt tester: `backend/src/services/agents/prompts/prompt-tester.ts`
- Quality validators: `backend/src/services/agents/prompts/quality-validators.ts`

---

## Integration Testing Notes (Added from TEST-002)

### SSE Mock Utility

**Important:** `sseMock.cleanup()` only clears SSE-specific state (listeners, eventSource).
It does NOT call `vi.unstubAllGlobals()` - this preserves other mocks like `fetch`.

Use `sseMock.fullCleanup()` only when you need to remove ALL global stubs.

### Fetch Mocking Pattern

```typescript
// At top of test file - mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// In beforeEach - reset mock state
beforeEach(() => {
  vi.clearAllMocks();
  useDebateStore.getState()._reset();
});

// In tests - set up responses
mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({ id: 'debate-123', status: 'initializing' }),
});
```

### Store Internal Methods for Testing

The debate store exposes internal methods prefixed with `_` for testing:

```typescript
const {
  _handleSSEMessage,   // Process SSE events directly
  _appendTurnChunk,    // Add streaming content
  _completeTurn,       // Finalize a turn
  _setConnectionStatus,// Update connection state
  _setError,           // Set error state
  _reset               // Reset to initial state
} = useDebateStore.getState();
```

### Integration Test Coverage (TEST-002)

Location: `frontend/src/__tests__/integration/debateFlow.test.tsx`

Covers:
- Debate start flow with SSE connection
- SSE message handling (phase transitions, turn streaming, completion)
- Intervention submission and addressing
- Pause/resume functionality
- Error handling
- State selectors (`selectIsDebateActive`, `selectPendingInterventions`)
- Full debate flow simulation

**Total Tests:** 383 across 15 test files (includes 101 agent validation tests from TEST-005)

### Agent Output Validation (TEST-005)

Location: `backend/tests/agents/` and `backend/src/utils/validation/`

**Validation Utilities:**
- `backend/src/utils/validation/qualityChecks.ts` - Steel-man quality assessment
- `backend/src/utils/validation/neutralityChecks.ts` - Moderator neutrality checks

**Test Coverage (101 tests):**
1. **Schema Validation (19 tests)** - `schemaValidation.test.ts`
   - Complete debate transcript validation
   - Utterance validation (phase, speaker, content)
   - Proposition validation
   - Structured analysis validation
   - Schema version support

2. **Steel-Man Quality (23 tests)** - `steelmanQuality.test.ts`
   - Straw-man argument detection
   - Evidence requirement validation
   - Explicit assumption checks
   - Quality scoring (0-1 scale)
   - Diverse evidence type rewards
   - Steel-man indicator recognition

3. **Moderator Neutrality (27 tests)** - `neutrality.test.ts`
   - Biased language detection (clearly, obviously, etc.)
   - Winner-picking phrase detection
   - Recommendation language detection
   - Neutral synthesis validation
   - Structural balance checks

4. **Uncertainty Preservation (32 tests)** - `uncertaintyPreservation.test.ts`
   - False certainty detection in projections
   - Inappropriate confidence level flagging
   - Appropriate uncertainty language validation
   - Differentiation between facts vs projections
   - Value judgment absolute language detection

**Key Design Principles Enforced:**
- Steel-man arguments (no straw-manning)
- Explicit assumptions for all projections
- Preserve uncertainty (no false confidence)
- Moderator neutrality (NEVER picks winners)
- Evidence classification (fact, projection, analogy, value)

### E2E Testing (TEST-003)

Location: `frontend/e2e/`

**Configuration:** `frontend/playwright.config.ts`

**Page Object Models:**
- `frontend/e2e/pages/HomePage.ts` - Input form interactions
- `frontend/e2e/pages/DebatePage.ts` - Debate stream interactions

**Test Suites (40+ tests):**
1. `debateFlow.spec.ts` - 19 tests for main user journey
2. `responsive.spec.ts` - 15 tests for mobile/tablet/desktop
3. `visual.spec.ts` - 15+ tests for visual regression
4. `interventionFlow.spec.ts` - 12+ tests for user interventions

**Run E2E Tests:**
```bash
cd frontend
npm run e2e          # Run all tests
npm run e2e:ui       # Interactive UI mode
npm run e2e:headed   # See browser actions
```

### Accessibility Testing

Location: `frontend/src/__tests__/a11y/`

**Test Files (111 tests):**
- `colorContrast.test.ts` - 60 tests for WCAG color contrast
- `components.a11y.test.tsx` - 28 tests for component accessibility
- `keyboard.test.tsx` - 23 tests for keyboard navigation

**Utilities:**
- `frontend/src/utils/a11y/colorContrast.ts` - WCAG contrast calculation utilities

**Key Findings Documented:**
- `frontend/src/__tests__/a11y/ACCESSIBILITY_FINDINGS.md` - Accessibility audit results
- 4 color contrast issues identified (tertiary text, pro button, moderator button, challenge button)

---

## Phase 2: Export System

### Markdown Export (EXPORT-001) ✅

Location: `backend/src/services/export/`

**Files:**
- `backend/src/services/export/types.ts` - Export interfaces
- `backend/src/services/export/markdownExporter.ts` - MarkdownExporter class
- `backend/src/services/export/index.ts` - Barrel export
- `backend/src/routes/export-routes.ts` - API endpoints

**API Endpoints:**
```bash
GET /api/exports/:debateId/markdown        # Generate Markdown
GET /api/exports/:debateId/markdown?download=true  # Download as file
GET /api/exports/:debateId/preview         # Preview export metadata
```

**Export Options:**
```typescript
interface MarkdownExportOptions {
  includeMetadata?: boolean;      // Default: true
  includeProposition?: boolean;   // Default: true
  includePro?: boolean;           // Default: true
  includeCon?: boolean;           // Default: true
  includeModerator?: boolean;     // Default: true
  includeChallenges?: boolean;    // Default: false
  includeTranscript?: boolean;    // Default: false
}
```

**Tests:** 40 tests in `backend/tests/export/markdownExporter.test.ts`

### For Future Export Tasks (EXPORT-002, AUDIO-*, VIDEO-*):

- Reuse `DebateTranscript` structure from `backend/src/types/`
- Follow same API pattern: `GET /api/exports/:debateId/{format}`
- Use `ExportResult` interface for consistent return types
- Markdown exporter provides clean text for TTS conversion
- Phase information preserved for chapter markers
- Speaker labels ready for voice mapping

---

## Commits Reference

| Commit | Description |
|--------|-------------|
| `20b43bc` | TEST-002: Integration tests for debate flow (20 tests) |
| `a042161` | UI-003/004/005: TimelineScrubber, InterventionPanel, Layout (68 tests) |
| `866bc39` | UI-001/002/006/007/008/009 + TEST-001: Frontend components & test suite |
| `ea6cd46` | AGENT-005: Comprehensive prompt template library |
| `7db4ae9` | AGENT-001 to AGENT-004: All debate agents |

---

*This document should be updated as new features are implemented.*
