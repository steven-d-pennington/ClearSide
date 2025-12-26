# ClearSide Implementation Notes

> **Purpose**: This document tracks what has been implemented and where to find it.
> Helps future agents understand the codebase structure without reading every file.
>
> **Last Updated**: 2025-12-26

---

## Completed Implementation Summary

### Phase 1 Progress: 97% Complete (35/36 tasks)

| Category | Tasks Done | Total | Status |
|----------|------------|-------|--------|
| Infrastructure | 5 | 5 | ✅ Complete |
| Core Engine | 5 | 5 | ✅ Complete |
| AI Agents | 5 | 5 | ✅ Complete |
| UI Components | 9 | 9 | ✅ Complete |
| Testing | 4 | 5 | ✅ Complete (Load testing remaining) |
| Configuration | 7 | 7 | ✅ Complete |

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
│   │   ├── migrations/         # SQL migration files
│   │   │   ├── 001_initial_schema.sql
│   │   │   ├── 002_add_flow_mode.sql
│   │   │   └── 003_add_debate_configuration.sql  # ⭐ CONFIG-001
│   │   └── repositories/
│   │       ├── debate-repository.ts
│   │       ├── utterance-repository.ts
│   │       ├── intervention-repository.ts
│   │       └── preset-repository.ts  # ⭐ CONFIG-003
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
│   │   │       ├── prompt-modifiers.ts   # ⭐ CONFIG-004 (brevity/citation)
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
│       ├── configuration.ts    # ⭐ CONFIG-002 (presets, brevity, LLM settings)
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
│   │   │   ├── InputForm.tsx      # Integrates ConfigPanel
│   │   │   ├── CharacterCount.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── ConfigPanel/           # ⭐ CONFIG-007 (debate settings)
│   │   │   ├── ConfigPanel.tsx    # Preset selector + advanced settings
│   │   │   ├── BrevitySlider.tsx  # 1-5 verbosity scale
│   │   │   ├── TemperatureSlider.tsx  # 0-1 LLM temperature
│   │   │   ├── *.module.css
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
│   │   ├── debate.ts              # Debate types (const objects, not enums!)
│   │   └── configuration.ts       # ⭐ Config types (presets, brevity, LLM settings)
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

## Railway Deployment & Auto-Migrations

### Overview

The backend automatically runs database migrations on startup, enabling zero-downtime deployments on Railway.

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/db/runMigrations.ts` | Programmatic migration runner |
| `backend/src/index.ts` | Calls migrations before server start |
| `backend/package.json` | Build script copies SQL files to dist/ |
| `backend/railway.toml` | Railway deployment configuration |

### How It Works

1. **On Build**: TypeScript compiles to `dist/`, then SQL migration files are copied:
   ```json
   "build": "tsc && npm run copy-migrations",
   "copy-migrations": "cp -r src/db/migrations dist/db/"
   ```

2. **On Start**: Server runs migrations before accepting requests:
   ```typescript
   async function start() {
     const migrationResult = await runMigrationsOnStartup();
     if (!migrationResult.success) {
       process.exit(1);  // Fail fast if migrations fail
     }
     server = app.listen(PORT, () => { /* ... */ });
   }
   ```

3. **Migration Safety**:
   - Checks `schema_migrations` table for already-applied migrations
   - Only runs pending migrations
   - Gracefully skips if `DATABASE_URL` not set (for local dev without DB)

### Railway Configuration

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
```

### Troubleshooting

**"Migration failed" with empty error:**
- SQL files weren't copied to `dist/`. Ensure `copy-migrations` script runs.

**DNS resolution errors:**
- Network-restricted environment. Use Railway's internal networking or check firewall.

**Connection errors:**
- Verify `DATABASE_URL` environment variable is set in Railway dashboard.

### Using Timescale Cloud

ClearSide uses Timescale Cloud for PostgreSQL. Connection string format:
```
postgres://tsdbadmin@{host}.tsdb.cloud.timescale.com:{port}/tsdb?sslmode=require
```

Note: Timescale's SQL editor only allows single statements at a time. For initial setup, run each migration statement individually.

---

## Debate History & Replay Feature (Added 2025-12-26)

### Overview

Added ability to browse previous debates and view/replay completed debates.

### New Files Created

**Frontend Components:**
- `frontend/src/components/DebateList/DebateList.tsx` - Lists all debates with filtering
- `frontend/src/components/DebateList/DebateList.module.css` - Styles
- `frontend/src/components/DebateList/index.ts` - Export

**Pages:**
- `frontend/src/pages/HomePage.tsx` - Main page with input form
- `frontend/src/pages/HistoryPage.tsx` - Debate history with filters
- `frontend/src/pages/DebateViewPage.tsx` - View/replay individual debate
- `frontend/src/pages/index.ts` - Export

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | HomePage | Start new debate or view current debate |
| `/history` | HistoryPage | Browse all debates with status filters |
| `/debates/:debateId` | DebateViewPage | View/replay specific debate |

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/debates` | List all debates with filtering |
| `GET /api/debates/:id` | Get debate details |
| `GET /api/debates/:id/utterances` | Get all utterances for replay (NEW) |
| `GET /api/debates/:id/stream` | SSE for live debates |

### New Backend Endpoint

Added `GET /api/debates/:debateId/utterances` in `backend/src/routes/debate-routes.ts`:

```typescript
router.get('/debates/:debateId/utterances', async (req, res) => {
  const { debateId } = req.params;
  const utterances = await utteranceRepository.findByDebateId(debateId);
  res.json({ debateId, utterances, count: utterances.length });
});
```

### How It Works

1. **Browse History**: Navigate to `/history` to see all debates
2. **Filter by Status**: Filter by completed, live, paused, or failed
3. **Click to View**: Click any debate to view it at `/debates/:id`
4. **Live vs Completed**:
   - Live debates: Connect to SSE stream for real-time updates
   - Completed debates: Load all utterances at once for replay

### DebateList Component Usage

```tsx
import { DebateList } from '@/components/DebateList';

// Show all debates
<DebateList />

// Filter by status
<DebateList statusFilter="completed" />

// Limit results
<DebateList limit={10} />

// Compact view
<DebateList compact />
```

### Integration with Existing DebateStream

The DebateViewPage loads debate data and populates the Zustand store, then renders the existing `DebateStream` component. This ensures consistent UI whether viewing live or replaying completed debates.

---

## Docker Containerization for Local Development (Added 2025-12-26)

### Overview

Full Docker setup for local development with hot reload support on Windows.

### Files Created

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Orchestrates db, backend, frontend services |
| `backend/Dockerfile.dev` | Node 20 Alpine with tsx watch |
| `frontend/Dockerfile.dev` | Node 20 Alpine with Vite dev server |
| `backend/.dockerignore` | Excludes node_modules, dist, etc. |
| `frontend/.dockerignore` | Excludes node_modules, dist, etc. |
| `.env.docker.example` | Template for LLM API keys |
| `package.json` (root) | Docker convenience scripts |

### Usage

```bash
# First time setup
copy .env.docker.example .env.docker
# Edit .env.docker with your OPENAI_API_KEY

# Start all services
npm run docker:up:build

# Daily use
npm run docker:up

# View logs
npm run docker:logs

# Access
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
# Database: localhost:5432
```

### Key Configuration Details

**Docker Compose Services:**
- `db`: PostgreSQL 15-alpine with health check
- `backend`: Express/Node with tsx watch for hot reload
- `frontend`: Vite dev server with HMR

**Hot Reload on Windows:**
- `CHOKIDAR_USEPOLLING=true` enables file watching in Docker
- Source code mounted with `:cached` for performance
- Named volumes for `node_modules` to avoid Windows path conflicts

**Vite Proxy Configuration:**
- `VITE_API_URL=""` (empty) - uses relative URLs like `/api/debates`
- `VITE_PROXY_TARGET=http://backend:3001` - Docker service networking
- Vite proxies `/api/*` requests to backend container

**Database Connection:**
- `DATABASE_URL=postgresql://postgres:clearside_dev_password@db:5432/clearside?sslmode=disable`
- Note: `?sslmode=disable` required for Docker internal networking

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `OPENAI_API_KEY variable is not set` | Use `--env-file .env.docker` flag (already in npm scripts) |
| `net::ERR_NAME_NOT_RESOLVED` for backend:3001 | Set `VITE_API_URL=""` for relative URLs |
| SSL connection errors | Add `?sslmode=disable` to DATABASE_URL |
| Hot reload not working | Restart container: `npm run docker:down && npm run docker:up` |

---

## Debate Orchestrator Integration (Added 2025-12-26)

### Background

The DebateOrchestrator class (CORE-002) was implemented but **never wired to the routes**. This caused debates to be created in the database but never actually run - the frontend showed "Setting up debate" indefinitely.

### The Fix

Modified `backend/src/routes/debate-routes.ts` to start the orchestrator after creating a debate:

```typescript
import { DebateOrchestrator, DebateStateMachine, turnManager } from '../services/debate/index.js';
import { defaultLLMClient } from '../services/llm/index.js';
import {
  ProAdvocateAgent,
  ConAdvocateAgent,
  ModeratorAgent,
  OrchestratorAgent,
} from '../services/agents/index.js';
import { schemaValidator } from '../services/validation/index.js';

async function startDebateOrchestrator(
  debateId: string,
  propositionText: string,
  propositionContext?: Record<string, unknown>
): Promise<void> {
  // Create per-debate instances
  const stateMachine = new DebateStateMachine(debateId);
  const agents = {
    pro: new ProAdvocateAgent(defaultLLMClient),
    con: new ConAdvocateAgent(defaultLLMClient),
    moderator: new ModeratorAgent(defaultLLMClient),
    orchestrator: new OrchestratorAgent(defaultLLMClient),
  };

  const orchestrator = new DebateOrchestrator(
    debateId,
    stateMachine,
    turnManager,
    sseManager,
    schemaValidator,
    agents,
    { validateUtterances: true, broadcastEvents: true, autoSaveTranscript: true }
  );

  await orchestrator.startDebate(propositionText, propositionContext);
}

// In POST /debates handler:
router.post('/debates', async (req, res) => {
  // ... create debate in DB ...
  res.status(201).json(debate);

  // Fire-and-forget: Start orchestrator in background
  startDebateOrchestrator(debate.id, input.propositionText, input.propositionContext)
    .catch((error) => logger.error({ debateId: debate.id, error }, 'Orchestrator error'));
});
```

### Key Design Decisions

1. **Fire-and-forget pattern**: HTTP response returns immediately (201); orchestrator runs in background
2. **Per-debate instances**: Each debate gets its own state machine, agents, and orchestrator
3. **Error broadcasting**: On failure, error event is broadcast to SSE clients
4. **Database status update**: On failure, debate status updated to 'failed'

### Dependencies for Orchestrator

- `DebateStateMachine` - Manages phase transitions
- `turnManager` - Coordinates turn-taking between agents
- `sseManager` - Broadcasts events to connected clients
- `schemaValidator` - Validates agent outputs
- `defaultLLMClient` - OpenAI/Anthropic client instance
- 4 Agent classes: Pro, Con, Moderator, Orchestrator

---

## SSE Event Type Mapping (Added 2025-12-26)

### Problem

Backend and frontend used **different event names** for the same concepts:

| Backend Sends | Frontend Expected |
|---------------|-------------------|
| `utterance` | `turn_complete` |
| `phase_start` | `phase_transition` |
| `phase_complete` | _(not handled)_ |
| `debate_complete` | `debate_completed` |
| `error` | `debate_error` |

### The Fix

Updated `frontend/src/stores/debate-store.ts` to handle backend event names:

```typescript
case 'utterance': {
  const data = message.data as {
    debateId: string;
    phase: string;
    speaker: string;
    content: string;
    timestampMs: number;
    metadata?: Record<string, unknown>;
  };

  // Direct cast - backend sends same enum values as frontend
  const phase = Object.values(DebatePhase).includes(data.phase as DebatePhase)
    ? data.phase as DebatePhase
    : DebatePhase.PHASE_1_OPENING;

  const speaker = Object.values(Speaker).includes(data.speaker as Speaker)
    ? data.speaker as Speaker
    : Speaker.MODERATOR;

  const newTurn: DebateTurn = {
    id: `${data.debateId}-${data.timestampMs}`,
    debateId: data.debateId,
    phase,
    speaker,
    content: data.content,
    turnNumber: get().debate?.turns.length ?? 0,
    timestamp: new Date(message.timestamp),
  };

  set((state) => ({
    debate: state.debate ? {
      ...state.debate,
      status: 'live',
      currentPhase: newTurn.phase,
      currentSpeaker: newTurn.speaker,
      turns: [...state.debate.turns, newTurn],
    } : null,
  }));
  break;
}
```

Also added handlers for:
- `phase_start` - Updates current phase
- `phase_complete` - Logs completion
- `debate_complete` - Marks debate complete
- `error` - Sets error state
- `intervention_response` - Updates intervention status

### Updated Type Definitions

`frontend/src/types/debate.ts` now includes:

```typescript
export type SSEEventType =
  | 'connected'
  | 'debate_started'
  | 'phase_transition'
  | 'phase_start'        // Backend sends this
  | 'phase_complete'     // Backend sends this
  | 'turn_start'
  | 'turn_chunk'
  | 'turn_complete'
  | 'utterance'          // Backend sends this for each agent response
  | 'intervention_received'
  | 'intervention_addressed'
  | 'intervention_response'  // Backend sends this
  | 'debate_paused'
  | 'debate_resumed'
  | 'debate_completed'
  | 'debate_complete'    // Backend sends this (without 'd')
  | 'debate_error'
  | 'error'              // Backend sends this
  | 'heartbeat';
```

---

## Configuration System (Added 2025-12-26)

### Overview

Added a comprehensive debate configuration system enabling customizable debate behavior through preset modes, LLM settings, brevity levels, and citation requirements.

**Tasks Completed:** CONFIG-001 through CONFIG-007

### Database Schema (CONFIG-001)

Migration: `backend/src/db/migrations/003_add_debate_configuration.sql`

**New columns on `debates` table:**
```sql
ALTER TABLE debates
ADD COLUMN preset_mode VARCHAR(20) DEFAULT 'balanced',
ADD COLUMN brevity_level INTEGER DEFAULT 3 CHECK (brevity_level BETWEEN 1 AND 5),
ADD COLUMN llm_temperature DECIMAL(2,1) DEFAULT 0.7 CHECK (llm_temperature BETWEEN 0.0 AND 1.0),
ADD COLUMN max_tokens_per_response INTEGER DEFAULT 1024,
ADD COLUMN require_citations BOOLEAN DEFAULT false;
```

**New `debate_presets` table:**
```sql
CREATE TABLE debate_presets (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  brevity_level INTEGER NOT NULL,
  llm_temperature DECIMAL(2,1) NOT NULL,
  max_tokens_per_response INTEGER NOT NULL,
  require_citations BOOLEAN NOT NULL,
  is_system_preset BOOLEAN DEFAULT true
);
```

**System Presets:**
| ID | Name | Brevity | Temp | Tokens | Citations |
|----|------|---------|------|--------|-----------|
| `quick` | Quick Mode | 5 | 0.5 | 512 | No |
| `balanced` | Balanced | 3 | 0.7 | 1024 | No |
| `deep_dive` | Deep Dive | 1 | 0.7 | 2048 | No |
| `research` | Research | 2 | 0.6 | 2048 | Yes |

### Backend Types (CONFIG-002)

Location: `backend/src/types/configuration.ts`

```typescript
// Preset modes (const object pattern for erasableSyntaxOnly)
export const PRESET_MODES = {
  QUICK: 'quick',
  BALANCED: 'balanced',
  DEEP_DIVE: 'deep_dive',
  RESEARCH: 'research',
  CUSTOM: 'custom',
} as const;
export type PresetMode = (typeof PRESET_MODES)[keyof typeof PRESET_MODES];

// Type guards
export function isPresetMode(value: unknown): value is PresetMode;
export function isBrevityLevel(value: unknown): value is BrevityLevel;

// Brevity levels (1-5 scale)
export type BrevityLevel = 1 | 2 | 3 | 4 | 5;

// Database entity
export interface DebatePreset {
  id: string;
  name: string;
  description: string | null;
  brevityLevel: BrevityLevel;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
  isSystemPreset: boolean;
}

// Default configuration
export const DEFAULT_CONFIG = {
  presetMode: PRESET_MODES.BALANCED,
  brevityLevel: 3 as BrevityLevel,
  llmTemperature: 0.7,
  maxTokensPerResponse: 1024,
  requireCitations: false,
};
```

### Preset Repository (CONFIG-003)

Location: `backend/src/db/repositories/preset-repository.ts`

```typescript
import * as presetRepository from './preset-repository.js';

// Get all presets
const presets = await presetRepository.findAll();

// Get by ID
const preset = await presetRepository.findById('balanced');

// Get system presets only
const systemPresets = await presetRepository.findSystemPresets();
```

### Prompt Modifiers (CONFIG-004)

Location: `backend/src/services/agents/prompts/prompt-modifiers.ts`

```typescript
// Brevity instructions appended to agent prompts
export const BREVITY_INSTRUCTIONS: Record<BrevityLevel, string> = {
  1: 'Be comprehensive and detailed. Aim for 500-600 words with full explanations.',
  2: 'Be thorough but focused. Aim for 400-500 words.',
  3: 'Balance depth with conciseness. Aim for 300-400 words.',  // Default
  4: 'Be concise and direct. Aim for 200-300 words.',
  5: 'Be highly concise. Aim for 150-200 words. Use bullet points.',
};

// Citation requirements
export const CITATION_INSTRUCTIONS = {
  required: 'ALL factual claims MUST include citations. Use [FACT], [STUDY], or [EXPERT] tags.',
  optional: 'Include evidence and citations where available to strengthen arguments.',
};

// Apply modifiers to prompts
export function applyPromptModifiers(
  basePrompt: string,
  config: DebateConfiguration
): string;
```

### Agent Configuration (CONFIG-005)

All agents now accept configuration in their context:

```typescript
// In pro-advocate-agent.ts, con-advocate-agent.ts, moderator-agent.ts
const context: AgentContext = {
  debateId,
  currentPhase,
  previousUtterances,
  speaker,
  proposition,
  propositionContext,
  // New configuration fields:
  config: {
    brevityLevel: 3,
    llmTemperature: 0.7,
    maxTokensPerResponse: 1024,
    requireCitations: false,
  },
};

const response = await proAdvocate.generateOpeningStatement(context);
```

The orchestrator loads config from the database and passes it to agents:

```typescript
// debate-orchestrator.ts
private async loadConfiguration(): Promise<DebateConfiguration> {
  const debate = await debateRepository.findById(this.debateId);
  return {
    brevityLevel: debate.brevityLevel,
    llmTemperature: debate.llmTemperature,
    maxTokensPerResponse: debate.maxTokensPerResponse,
    requireCitations: debate.requireCitations,
  };
}
```

### API Endpoints (CONFIG-006)

**Updated `POST /api/debates`:**
```typescript
// Request body now accepts configuration
{
  propositionText: string;
  propositionContext?: Record<string, unknown>;
  flowMode?: 'auto' | 'step';
  // New config fields:
  presetMode?: 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom';
  brevityLevel?: 1 | 2 | 3 | 4 | 5;
  llmTemperature?: number;  // 0.0 - 1.0
  maxTokensPerResponse?: number;  // 256 - 4096
  requireCitations?: boolean;
}
```

**New `GET /api/presets`:**
```bash
GET /api/presets          # List all presets
GET /api/presets/:id      # Get specific preset
```

### Frontend ConfigPanel (CONFIG-007)

Location: `frontend/src/components/ConfigPanel/`

**Usage:**
```tsx
import { ConfigPanel } from '@/components/ConfigPanel';
import { DEFAULT_CONFIGURATION, type DebateConfiguration } from '@/types/configuration';

function InputForm() {
  const [config, setConfig] = useState<DebateConfiguration>(DEFAULT_CONFIGURATION);

  return (
    <ConfigPanel
      configuration={config}
      onChange={setConfig}
      disabled={isLoading}
    />
  );
}
```

**ConfigPanel Features:**
- Preset selector with 4 system presets + Custom
- Collapsible "Advanced Settings" section
- BrevitySlider (1-5) with descriptive labels
- TemperatureSlider (0-1) with Focused/Creative labels
- Max tokens input
- Citations toggle

**Frontend Types:**
```typescript
// frontend/src/types/configuration.ts
export type PresetMode = 'quick' | 'balanced' | 'deep_dive' | 'research' | 'custom';
export type BrevityLevel = 1 | 2 | 3 | 4 | 5;

export interface DebateConfiguration {
  presetMode: PresetMode;
  brevityLevel: BrevityLevel;
  llmSettings: {
    temperature: number;
    maxTokensPerResponse: number;
  };
  requireCitations: boolean;
}

export const DEFAULT_CONFIGURATION: DebateConfiguration = {
  presetMode: 'balanced',
  brevityLevel: 3,
  llmSettings: { temperature: 0.7, maxTokensPerResponse: 1024 },
  requireCitations: false,
};
```

### Zustand Store Updates

The debate store now accepts configuration in `startDebate`:

```typescript
// frontend/src/stores/debate-store.ts
interface StartDebateOptions {
  flowMode?: FlowMode;
  presetMode?: PresetMode;
  brevityLevel?: BrevityLevel;
  llmTemperature?: number;
  maxTokensPerResponse?: number;
  requireCitations?: boolean;
}

const { startDebate } = useDebateStore();

// Usage with configuration
await startDebate('Should AI development be paused?', {
  flowMode: 'auto',
  presetMode: 'research',
  brevityLevel: 2,
  llmTemperature: 0.6,
  maxTokensPerResponse: 2048,
  requireCitations: true,
});
```

### Full Configuration Flow

1. User selects preset or customizes settings in ConfigPanel
2. InputForm includes config in startDebate call
3. Frontend sends config to `POST /api/debates`
4. Backend validates config and creates debate with settings
5. DebateOrchestrator loads config from database
6. Agents receive config in context and apply modifiers
7. Prompt modifiers adjust response length and citation requirements

---

*This document should be updated as new features are implemented.*
