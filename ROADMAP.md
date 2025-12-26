# ClearSide Product Roadmap

> **AI-Powered Structured Reasoning & Debate Engine**
> *"Think both sides. Decide with clarity."*

---

## Product Vision

ClearSide is a **live debate theater** and thinking support system that helps users examine complex, high-stakes questions through real-time structured adversarial reasoning. Users watch AI agents debate in real-time following formal protocols, participate actively through questions and interventions, and export debates as transcripts, podcasts, or videos.

### North Star Metric
**Did the user understand the issue better than when they started?**

### Core Innovation
**Hybrid Live-Replay Model**: Every debate is generated live with full user participation, then becomes an instantly-replayable artifact that can be exported to multiple media formats.

---

## Target Audience

| Segment | Use Cases |
|---------|-----------|
| Civic & Policy Analysis | AI regulation, climate policy, housing, healthcare debates |
| Professional & Technical | Architecture trade-offs, build vs buy, risk vs speed decisions |
| Personal Decisions | Career moves, major purchases, lifestyle choices |

---

## Roadmap Overview

```
Phase 1 (MVP)          Phase 2              Phase 3              Phase 4
─────────────────────────────────────────────────────────────────────────────
Live Debate Engine     Media Production     Collaboration        Scale & Growth
│                      │                    │                    │
├─ Custom Protocol     ├─ Text Transcripts  ├─ Saved Debates     ├─ API Access
├─ Real-Time Stream    ├─ TTS Integration   ├─ Shareable Links   ├─ Enterprise
├─ State Machine       ├─ Audio Podcasts    ├─ User Accounts     ├─ Integrations
├─ User Interventions  ├─ Video Generation  ├─ Embed Codes       ├─ Analytics
├─ Live UI             ├─ Export Queue      ├─ Collections       ├─ Custom Formats
├─ Transcript Schema   └─ Visual Templates  └─ Annotations       └─ Multi-Agent
├─ Timeline Scrubber
└─ Hybrid Replay Mode
```

---

## Phase 1: MVP (Live Debate Engine)

### Objective
Deliver a live debate theater where users watch AI agents debate in real-time, intervene with questions and evidence, and receive structured transcripts with full replay capability.

### Key Innovations
- **Real-time streaming**: Debate unfolds live via Server-Sent Events (SSE)
- **Full user participation**: Pause, question, clarify, inject evidence, direct questions
- **Hybrid replay**: Completed debates load instantly with timeline scrubber
- **Custom protocol**: Optimized for AI agents and digital consumption (25-30 min runtime)

### MVP Feature Breakdown

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| MVP-001 | Single-question input form with optional context | P0 | ✅ Complete | None |
| MVP-002 | Custom ClearSide debate protocol (6 phases) | P0 | ✅ Complete | None |
| MVP-003 | Debate Orchestrator (state machine + turn management) | P0 | ✅ Complete | MVP-002 |
| MVP-004 | Real-time streaming layer (Server-Sent Events) | P0 | ✅ Complete | MVP-003 |
| MVP-005 | Pro Advocate Agent (adapted for turn-based dialogue) | P0 | ✅ Complete | MVP-003 |
| MVP-006 | Con Advocate Agent (adapted for turn-based dialogue) | P0 | ✅ Complete | MVP-003 |
| MVP-007 | Moderator Agent (final synthesis phase) | P0 | ✅ Complete | MVP-005, MVP-006 |
| MVP-008 | User intervention system (pause, question, clarify, inject, direct) | P0 | ✅ Complete | MVP-003 |
| MVP-009 | Transcript Recorder with timestamps | P0 | ✅ Complete | MVP-003 |
| MVP-010 | JSON Schema v2.0.0 (transcript format) | P0 | ✅ Complete | MVP-009 |
| MVP-011 | Live Debate UI - Input Section | P0 | ✅ Complete | None |
| MVP-012 | Live Debate UI - Streaming Debate View | P0 | ✅ Complete | MVP-004 |
| MVP-013 | Live Debate UI - Intervention Panel | P0 | ✅ Complete | MVP-008 |
| MVP-014 | Live Debate UI - Timeline Scrubber | P0 | ✅ Complete | MVP-009 |
| MVP-015 | Hybrid replay mode (instant load of completed debates) | P0 | ✅ Complete | MVP-009 |
| MVP-016 | Database schema (debates, utterances, interventions) | P0 | ✅ Complete | MVP-009 |
| MVP-017 | Phase transition system | P0 | ✅ Complete | MVP-003 |
| MVP-018 | Prompt contracts for turn-based dialogue | P0 | ✅ Complete | MVP-003 |
| MVP-019 | Flagship demo implementation (live format) | P1 | ✅ Complete | All above |

### Configuration System (Added 2025-12-26)

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| CONFIG-001 | Database migration for configuration fields | P1 | ✅ Complete | MVP Complete |
| CONFIG-002 | Backend configuration types | P1 | ✅ Complete | CONFIG-001 |
| CONFIG-003 | Preset repository (quick, balanced, deep_dive, research) | P1 | ✅ Complete | CONFIG-001 |
| CONFIG-004 | Prompt modifiers (brevity, citations) | P1 | ✅ Complete | CONFIG-002 |
| CONFIG-005 | Agent configuration integration | P1 | ✅ Complete | CONFIG-004 |
| CONFIG-006 | API endpoints for presets and config | P1 | ✅ Complete | CONFIG-003 |
| CONFIG-007 | Frontend ConfigPanel component | P1 | ✅ Complete | CONFIG-006 |

---

## 🎯 What's Next: Development Priorities

### Immediate Priority: Phase 2 Media Production

The MVP is complete. The next focus is enabling debate export to shareable formats.

**Recommended order:**

1. **P2-003: TTS Integration** (P0) - ElevenLabs/PlayHT API for voice synthesis
   - Enables audio export pipeline
   - No blockers - can start immediately

2. **P2-004: Voice Profiles** (P0) - Distinct voices for Pro/Con/Moderator
   - Depends on P2-003
   - Critical for podcast quality

3. **P2-005: Audio Podcast Generator** (P0) - MP3 with chapter markers
   - Depends on P2-003, P2-004
   - Deliverable: Downloadable podcast episodes

4. **P2-002: PDF Export** (P1) - Formatted PDF transcripts
   - Uses existing Markdown exporter
   - Quick win, adds value

### Secondary Priority: Persona System

Extends configuration with argumentation styles (from plan file):

| Task | Description | Status |
|------|-------------|--------|
| PERSONA-001 | Database migration for personas table | 📋 Planned |
| PERSONA-002 | Persona types and repository | 📋 Planned |
| PERSONA-003 | Parameterize agent identity prompts | 📋 Planned |
| PERSONA-004 | API endpoints for personas | 📋 Planned |
| PERSONA-005 | Frontend PersonaSelector component | 📋 Planned |

**Personas planned:** Theorist, Politician, Scientist, Lawyer, Economist, Ethicist

### Future Phases

| Phase | Focus | Key Features |
|-------|-------|--------------|
| Phase 3 | Collaboration | User accounts, shareable links, collections |
| Phase 4 | Scale | Public API, multi-agent debates, enterprise |

---

## Phase 2: Media Production Pipeline

### Objective
Transform live debate transcripts into shareable media: text, audio, and video formats for consumption and distribution.

### Key Features
- **Text exports**: Markdown and PDF transcripts with timestamps
- **Audio podcasts**: MP3 with distinct TTS voices, chapter markers
- **Video debates**: MP4 with visual stage, subtitles, evidence overlays
- **Background processing**: Async export queue for long-running tasks

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| P2-001 | Text transcript export (Markdown format) | P0 | ✅ Complete | MVP Complete |
| P2-002 | Text transcript export (PDF format) | P1 | Backlog | P2-001 |
| P2-003 | TTS voice integration (ElevenLabs/PlayHT API) | P0 | Backlog | MVP Complete |
| P2-004 | Voice profile mapping (distinct voices per agent) | P0 | Backlog | P2-003 |
| P2-005 | Audio podcast generator (MP3 with chapter markers) | P0 | Backlog | P2-003, P2-004 |
| P2-006 | Video generation pipeline (Remotion + FFmpeg) | P1 | Backlog | P2-003 |
| P2-007 | Visual debate stage templates | P1 | Backlog | P2-006 |
| P2-008 | Subtitle/caption generation | P1 | Backlog | P2-006 |
| P2-009 | Evidence visualization overlays | P2 | Backlog | P2-006 |
| P2-010 | Export queue system (background job processing) | P1 | Backlog | P2-001 |
| P2-011 | Export status tracking UI | P1 | Backlog | P2-010 |
| P2-012 | Storage integration (S3/blob storage for media files) | P1 | Backlog | P2-005, P2-006 |
| P2-013 | Download/share UI for exported media | P0 | Backlog | P2-010 |

---

## Phase 3: Collaboration & Sharing

### Objective
Enable saving, sharing, and collaborative exploration of debates across teams and communities.

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| P3-001 | User account system | P1 | Backlog | Phase 2 Complete |
| P3-002 | Debate library (save/organize completed debates) | P1 | Backlog | P3-001 |
| P3-003 | Shareable debate links (public/private) | P0 | Backlog | P3-002 |
| P3-004 | Embed codes for blogs/websites | P1 | Backlog | P3-003 |
| P3-005 | Collections and tagging system | P2 | Backlog | P3-002 |
| P3-006 | Comments and annotations on saved debates | P2 | Backlog | P3-002 |
| P3-007 | Team workspaces | P2 | Backlog | P3-001 |
| P3-008 | Collaborative viewing (watch debates together) | P2 | Backlog | P3-007 |
| P3-009 | Debate forking (start from existing debate, modify) | P2 | Backlog | P3-002 |

---

## Phase 4: Scale & Advanced Features

### Objective
Expand ClearSide for enterprise use cases, advanced debate formats, and third-party integrations.

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| P4-001 | Public API | P1 | Backlog | Phase 3 Complete |
| P4-002 | Multi-agent debates (3v3 with domain specialists) | P1 | Backlog | MVP Complete |
| P4-003 | Custom debate format builder | P2 | Backlog | MVP Complete |
| P4-004 | Live audience participation (voting, questions) | P2 | Backlog | MVP Complete |
| P4-005 | Enterprise SSO | P2 | Backlog | P3-001 |
| P4-006 | Custom branding/domains | P2 | Backlog | P4-001 |
| P4-007 | Usage analytics dashboard | P2 | Backlog | P4-001 |
| P4-008 | Third-party integrations (Slack, Notion, etc.) | P3 | Backlog | P4-001 |
| P4-009 | Citation toggle with source verification | P2 | Backlog | MVP Complete |
| P4-010 | Value weighting system (economic/ethical/social priority) | P2 | Backlog | MVP Complete |

---

## Live Debate Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INPUT                                      │
│                    Question + Optional Context                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEBATE ORCHESTRATOR                                 │
│  • Normalizes proposition                                                    │
│  • Initializes debate state machine (6 phases)                              │
│  • Manages turn-based dialogue                                              │
│  • Handles user interventions queue                                         │
│  • Coordinates streaming to UI                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   PRO ADVOCATE      │  │   CON ADVOCATE      │  │    MODERATOR        │
│   • Turn-based      │  │   • Turn-based      │  │    • Final phase    │
│   • Steel-man       │  │   • Steel-man       │  │    • Synthesis      │
│   • Cross-exam      │  │   • Cross-exam      │  │    • No winner      │
│   • Rebuttals       │  │   • Rebuttals       │  │    • Hinges         │
│   • Clarifications  │  │   • Clarifications  │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSCRIPT RECORDER                                   │
│  • Records every utterance with timestamp                                   │
│  • Tracks phase transitions                                                 │
│  • Logs user interventions                                                  │
│  • Generates structured JSON transcript                                     │
│  • Compiles final structured analysis                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  STREAMING LAYER    │  │  USER INTERVENTION  │  │  REPLAY SYSTEM      │
│  (Server-Sent       │  │  • Pause debate     │  │  • Instant load     │
│   Events)           │  │  • Ask questions    │  │  • Timeline scrub   │
│  • Push utterances  │  │  • Inject evidence  │  │  • Jump to phase    │
│  • Phase updates    │  │  • Direct queries   │  │  • Export ready     │
│  • Live to UI       │  │  • Clarifications   │  │                     │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LIVE DEBATE UI                                  │
│  [Streaming View] [Intervention Panel] [Timeline Scrubber] [Export]         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Debate Protocol Phases (Custom ClearSide Format)

```
Phase 1: OPENING STATEMENTS (4 min)
  ├─ Pro Advocate: 2 min opening
  └─ Con Advocate: 2 min opening

Phase 2: CONSTRUCTIVE ROUNDS (6 min)
  ├─ Round 1: Economic/Technical (2 min each)
  ├─ Round 2: Ethical/Social (2 min each)
  └─ Round 3: Practical Implications (2 min each)

Phase 3: CROSS-EXAMINATION (6 min)
  ├─ Pro questions Con (3 min)
  └─ Con questions Pro (3 min)

Phase 4: REBUTTAL ROUND (4 min)
  ├─ Con rebuts Pro (2 min)
  └─ Pro rebuts Con (2 min)

Phase 5: CLOSING STATEMENTS (4 min)
  ├─ Con closing (2 min)
  └─ Pro closing (2 min)

Phase 6: MODERATOR SYNTHESIS (3 min)
  └─ Neutral analysis, hinges, evidence gaps

Total Runtime: ~27 minutes (+ user interventions)

USER INTERVENTIONS: Can occur at ANY time
  • Pause and ask questions
  • Request clarifications
  • Inject new evidence/context
  • Direct questions to specific agents
```

---

## Design Principles & Guardrails

| Principle | Description |
|-----------|-------------|
| **Single-responsibility agents** | Each agent has one job; no agent is allowed to win the argument |
| **No final answers** | ClearSide never decides or recommends; it preserves disagreement and uncertainty |
| **Explicit assumptions** | Every argument lists its premises so users can challenge them |
| **Evidence classification** | Arguments distinguish between facts, projections, analogies, and value judgments |
| **Uncertainty preservation** | No false certainty; unknowns are surfaced as decision hinges |
| **User autonomy** | The user can challenge any element and explore deeper reasoning |
| **Neutral tone** | Professional, non-chatty language; clarity over rhetoric |

---

## Technical Stack (Implemented)

### Current Architecture
- **Frontend**: React 18 + Vite + TypeScript
  - State management: Zustand
  - Styling: CSS Modules + design tokens
  - Testing: Vitest + Playwright
- **Backend**: Node.js + Express + TypeScript
  - Database: PostgreSQL (Timescale Cloud in production)
  - Real-time: Server-Sent Events (SSE)
  - LLM: OpenAI API (Claude-compatible)
- **Infrastructure**:
  - Development: Docker Compose (db, backend, frontend)
  - Production: Railway (backend) + Vercel-ready (frontend)
  - Auto-migrations on startup
- **Schema Contract**: JSON Schema v2.0.0 (versioned)
- **Model Agnostic**: Abstracted LLM client supports OpenAI/Anthropic

### Key Technical Patterns
- `erasableSyntaxOnly: true` - const objects instead of enums
- Per-debate orchestrator instances with isolated state machines
- Fire-and-forget debate execution (HTTP returns immediately)
- Class-based EventSource mocking for tests

---

## Success Metrics

### MVP Success Criteria
- [x] User can input a question and receive structured pro/con debate
- [x] All agent outputs conform to JSON schema
- [x] Flagship demo produces consistent, high-quality reasoning
- [x] User can challenge at least one assumption and receive inline response
- [x] Output clearly separates pro, con, and moderator sections

### Quality Benchmarks
- Reasoning quality matches or exceeds flagship demo
- No straw-man arguments in advocate outputs
- Moderator synthesis is genuinely neutral
- Assumptions are explicit and challengeable
- Uncertainty is preserved, not collapsed

---

## Document Index

| Document | Purpose |
|----------|---------|
| `ROADMAP.md` | This file - main project tracking and roadmap |
| `docs/KANBAN.md` | Kanban board with detailed task tracking |
| `docs/01_product-vision.md` | Product vision and problem definition |
| `docs/02_flagship-demo.md` | Canonical demo debate and quality benchmark |
| `docs/03_agent-architecture.md` | Detailed agent design and flow |
| `docs/04_json-schema.md` | Full JSON schema specification |
| `docs/05_prompt-contracts.md` | Prompt to schema mapping and enforcement |
| `docs/06_mvp-ux.md` | MVP UI specification and wireframes |
| `docs/07_iteration-log.md` | Version history and change rationale |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-12-22 | Initial roadmap creation from product specification |
| 0.2.0 | 2025-12-23 | Major expansion: Live Debate Theater architecture |
|       |            | • Added real-time streaming debate engine |
|       |            | • Added user intervention system |
|       |            | • Added hybrid live-replay model |
|       |            | • Added media production pipeline (Phase 2) |
|       |            | • Restructured phases around live debate flow |
| 1.0.0 | 2025-12-26 | **MVP Complete** |
|       |            | • All Phase 1 features implemented and tested |
|       |            | • 480+ tests across unit, integration, E2E, accessibility |
|       |            | • Docker containerization for local development |
|       |            | • Debate history and replay feature |
|       |            | • Markdown export (Phase 2 started) |
|       |            | • Configuration system (presets, brevity, LLM settings) |
|       |            | • Flow mode (auto/step) for debate pacing |
|       |            | • Production deployment on Railway + Timescale Cloud |

---

*ClearSide is a thinking support system, not an opinion generator.*
