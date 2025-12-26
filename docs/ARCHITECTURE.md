# ClearSide Architecture Overview

> **Version**: 1.0.0
> **Last Updated**: 2025-12-26
> **Status**: MVP Complete

---

## System Overview

ClearSide is a live debate theater with real-time AI agent orchestration. The system enables users to watch structured debates unfold in real-time, participate through interventions, and export debates to multiple formats.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│  React 18 + Vite + TypeScript                                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ InputForm   │ │DebateStream │ │ ConfigPanel │ │ InterventionPanel      ││
│  │ + validation│ │ + TurnCards │ │ + presets   │ │ + pause/question       ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────────┘│
│                                    │                                        │
│                           Zustand Store (SSE)                               │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ Server-Sent Events
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND API                                     │
│  Node.js + Express + TypeScript                                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐
│  │  Routes: /api/debates, /api/presets, /api/interventions, /api/exports   │
│  └──────────────────────────────────────────────────────────────────────────┘
│                                     │                                        │
│  ┌──────────────────────────────────┼───────────────────────────────────────┐
│  │                    DEBATE ORCHESTRATOR                                   │
│  │  • State Machine (6 phases)                                              │
│  │  • Turn Manager                                                          │
│  │  • Intervention Queue                                                    │
│  │  • Transcript Recorder                                                   │
│  └──────────────────────────────────┼───────────────────────────────────────┘
│                                     │                                        │
│  ┌──────────────────────────────────┼───────────────────────────────────────┐
│  │                      AI AGENTS                                           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │  │Orchestrator│  │Pro Advocate│  │Con Advocate│  │ Moderator  │         │
│  │  │(normalize) │  │(steel-man) │  │(steel-man) │  │ (synthesis)│         │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘         │
│  └──────────────────────────────────┼───────────────────────────────────────┘
│                                     │                                        │
│  ┌──────────────────────────────────┼───────────────────────────────────────┐
│  │  SERVICES: LLM Client │ SSE Manager │ Schema Validator │ Logger         │
│  └──────────────────────────────────┼───────────────────────────────────────┘
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
        ┌───────────────────────┐           ┌───────────────────────┐
        │    PostgreSQL DB      │           │    OpenAI API         │
        │  (Timescale Cloud)    │           │  (LLM Provider)       │
        │  • debates            │           │                       │
        │  • utterances         │           │  Supports:            │
        │  • interventions      │           │  • OpenAI GPT-4       │
        │  • debate_presets     │           │  • Anthropic Claude   │
        └───────────────────────┘           └───────────────────────┘
```

---

## Component Architecture

### Frontend Layer

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **InputForm** | Proposition entry | Validation, context, paste handling |
| **ConfigPanel** | Debate settings | Presets, brevity, temperature, citations |
| **DebateStream** | Live debate view | Auto-scroll, streaming, turn cards |
| **InterventionPanel** | User participation | Pause, questions, evidence injection |
| **TimelineScrubber** | Navigation | Phase markers, seek, progress |
| **Layout** | App shell | Header, navigation, responsive |

**State Management**: Zustand with SSE integration
- Centralized debate state
- Real-time event handling
- Optimistic UI updates

### Backend Layer

| Service | Purpose | Key Features |
|---------|---------|--------------|
| **DebateOrchestrator** | Coordination | Phase transitions, agent invocation |
| **DebateStateMachine** | State management | 6-phase lifecycle, validation |
| **TurnManager** | Dialogue control | Turn-taking, timing, ordering |
| **InterventionQueue** | User input | Pause handling, question routing |
| **TranscriptRecorder** | Persistence | Utterances, timestamps, metadata |
| **SSEManager** | Real-time | Event broadcasting, connection management |

### AI Agent Layer

| Agent | Role | Outputs |
|-------|------|---------|
| **OrchestratorAgent** | Proposition normalization | Normalized question, context |
| **ProAdvocateAgent** | Steel-man FOR position | Arguments, evidence, assumptions |
| **ConAdvocateAgent** | Steel-man AGAINST position | Counter-arguments, evidence |
| **ModeratorAgent** | Neutral synthesis | Agreements, hinges, gaps |

---

## Data Flow

### 1. Debate Initiation

```
User Input → InputForm → API (POST /debates) → Database
                                    ↓
                         DebateOrchestrator.startDebate()
                                    ↓
                         OrchestratorAgent.normalize()
                                    ↓
                              SSE: debate_started
```

### 2. Turn Execution

```
Orchestrator → TurnManager.getNextTurn()
                    ↓
              Agent.generate{Phase}Response()
                    ↓
              LLM API (with config modifiers)
                    ↓
              TranscriptRecorder.record()
                    ↓
              SSE: utterance
                    ↓
              Frontend: new TurnCard
```

### 3. User Intervention

```
User: Pause → API (POST /interventions)
                    ↓
              InterventionQueue.add()
                    ↓
              Agent.respondToIntervention()
                    ↓
              SSE: intervention_response
                    ↓
              User: Resume → Continue debate
```

---

## Database Schema

### Core Tables

```sql
debates
├── id (UUID, PK)
├── proposition_text
├── proposition_context (JSONB)
├── status (initializing | live | paused | completed | failed)
├── current_phase
├── flow_mode (auto | step)
├── preset_mode
├── brevity_level
├── llm_temperature
├── max_tokens_per_response
├── require_citations
├── created_at
└── updated_at

utterances
├── id (UUID, PK)
├── debate_id (FK)
├── phase
├── speaker (PRO | CON | MODERATOR)
├── content
├── timestamp_ms
├── metadata (JSONB)
└── created_at

interventions
├── id (UUID, PK)
├── debate_id (FK)
├── type (pause | question | clarify | inject | direct)
├── content
├── directed_to
├── status (pending | addressed)
├── response
└── created_at

debate_presets
├── id (VARCHAR, PK)
├── name
├── description
├── brevity_level
├── llm_temperature
├── max_tokens_per_response
├── require_citations
└── is_system_preset
```

---

## Real-Time Communication

### SSE Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ debateId }` | SSE connection established |
| `debate_started` | `{ debateId, proposition }` | Debate initialized |
| `phase_start` | `{ phase, speaker }` | New phase begins |
| `utterance` | `{ phase, speaker, content }` | Agent turn complete |
| `phase_complete` | `{ phase }` | Phase ends |
| `intervention_response` | `{ interventionId, response }` | User question answered |
| `debate_complete` | `{ debateId }` | Debate finished |
| `error` | `{ message }` | Error occurred |

### Connection Flow

```
Frontend                          Backend
   │                                 │
   ├── new EventSource(/stream) ───>│
   │                                 │
   │<─── event: connected ──────────┤
   │                                 │
   │<─── event: debate_started ─────┤
   │                                 │
   │<─── event: utterance ──────────┤ (repeated)
   │                                 │
   │<─── event: phase_start ────────┤ (6 times)
   │                                 │
   │<─── event: debate_complete ────┤
   │                                 │
   └─── close() ───────────────────>│
```

---

## Configuration System

### Preset Modes

| Preset | Brevity | Temperature | Tokens | Citations |
|--------|---------|-------------|--------|-----------|
| Quick | 5 (concise) | 0.5 | 512 | No |
| Balanced | 3 (moderate) | 0.7 | 1024 | No |
| Deep Dive | 1 (detailed) | 0.7 | 2048 | No |
| Research | 2 (thorough) | 0.6 | 2048 | Yes |
| Custom | User-defined | User-defined | User-defined | User-defined |

### Prompt Modifiers

Configuration is applied to agent prompts via modifiers:

```typescript
// Brevity instructions
BREVITY_INSTRUCTIONS[level] → appended to system prompt

// Citation requirements
if (requireCitations) {
  prompt += CITATION_INSTRUCTIONS.required;
}
```

---

## Deployment Architecture

### Production

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Frontend)                        │
│  • Static React build                                           │
│  • CDN-cached assets                                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ API Calls
┌─────────────────────────────────────────────────────────────────┐
│                       Railway (Backend)                          │
│  • Node.js container                                            │
│  • Auto-migrations on startup                                   │
│  • Health check: /health                                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ PostgreSQL
┌─────────────────────────────────────────────────────────────────┐
│                    Timescale Cloud (Database)                    │
│  • Managed PostgreSQL                                           │
│  • SSL required                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Local Development

```
docker-compose up
├── db:       PostgreSQL 15 (port 5432)
├── backend:  Node.js with tsx watch (port 3001)
└── frontend: Vite dev server (port 5173)
```

---

## Security Considerations

| Layer | Measure |
|-------|---------|
| Transport | TLS 1.3 encryption |
| Input | Validation on all user input |
| API | Rate limiting |
| Database | Parameterized queries |
| LLM | No PII in prompts |
| SSE | Per-debate connection isolation |

---

## Testing Strategy

| Level | Framework | Coverage |
|-------|-----------|----------|
| Unit | Vitest | Components, utils, stores |
| Integration | Vitest | API flows, SSE handling |
| E2E | Playwright | User journeys |
| Accessibility | axe-core | WCAG AA compliance |
| Agent Quality | Custom | Steel-man, neutrality |

**Total**: 480+ tests across 22 files

---

## Future Architecture (Phase 2+)

### Media Production Pipeline

```
Debate → Markdown Export → PDF Generator
                        → TTS Engine → Audio (MP3)
                        → Remotion → Video (MP4)
                                   ↓
                            Background Queue (BullMQ)
                                   ↓
                            Blob Storage (S3)
                                   ↓
                            CDN Delivery
```

### Persona System

```
debates
└── pro_persona_id (FK) → personas
└── con_persona_id (FK) → personas

personas
├── id
├── name (e.g., "The Theorist")
├── archetype
├── argumentation_style
└── system_prompt_addition
```

---

## Key Design Decisions

1. **Per-debate orchestrator instances**: Clean lifecycle, isolated state
2. **Fire-and-forget execution**: HTTP returns immediately; debate runs async
3. **SSE over WebSockets**: Simpler, sufficient for one-way streaming
4. **Zustand over Redux**: Lighter, built-in SSE handling
5. **const objects over enums**: TypeScript `erasableSyntaxOnly` compatibility
6. **CSS Modules**: Scoped styles without runtime cost
7. **Auto-migrations**: Zero-downtime deployments

---

*For implementation details, see [IMPLEMENTATION_NOTES.md](./IMPLEMENTATION_NOTES.md)*
