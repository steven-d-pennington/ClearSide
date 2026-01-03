# Phase 3: Duelogic Debate Mode - Kanban Board

> Last Updated: 2026-01-03
> Version: 1.1.0 - Post-MVP Enhancements
> Total Tasks: 12
> Estimated Duration: ~22 days

---

## Overview

Phase 3 implements the **Duelogic Debate Mode** - a philosophical debate format featuring:
- 2-6 "Chairs" representing philosophical frameworks
- Mandatory steel-manning and self-critique
- Arbiter-hosted podcast-style presentation
- Chair-to-chair interruptions for dynamic debates

---

## Sprint Overview

| Sprint | Focus | Tasks | Duration |
|--------|-------|-------|----------|
| Sprint 1 | Foundation | DUELOGIC-001, DUELOGIC-002 | ~1.5 days |
| Sprint 2 | Agents | DUELOGIC-003, DUELOGIC-004, DUELOGIC-005 | ~5.5 days |
| Sprint 3 | Orchestration | DUELOGIC-006, DUELOGIC-007 | ~5 days |
| Sprint 4 | API & UI | DUELOGIC-008, DUELOGIC-009 | ~3.5 days |
| Sprint 5 | Testing | DUELOGIC-010 | ~2 days |
| Sprint 6 | Enhancements | DUELOGIC-011, DUELOGIC-012 | ~5 days |

---

## Task Board

### Sprint 1: Foundation (1.5 days)

| Task ID | Task Name | Priority | Estimate | Status | Dependencies | Task File |
|---------|-----------|----------|----------|--------|--------------|-----------|
| DUELOGIC-001 | Types & Configuration | P0 | S | ✅ DONE | None | [View](./types/DUELOGIC-001.md) |
| DUELOGIC-002 | Database Schema | P0 | S | ✅ DONE | DUELOGIC-001 | [View](./database/DUELOGIC-002.md) |

**Sprint 1 Deliverables:**
- All TypeScript types for Duelogic mode
- Philosophical chair definitions with blind spots
- Database tables for chairs, evaluations, interruptions
- Default configuration and presets

---

### Sprint 2: Agents (5.5 days)

| Task ID | Task Name | Priority | Estimate | Status | Dependencies | Task File |
|---------|-----------|----------|----------|--------|--------------|-----------|
| DUELOGIC-003 | Arbiter Agent & Prompts | P0 | M | ✅ DONE | DUELOGIC-001, 002 | [View](./agents/DUELOGIC-003.md) |
| DUELOGIC-004 | Chair Agent & Prompts | P0 | M | ✅ DONE | DUELOGIC-001 | [View](./agents/DUELOGIC-004.md) |
| DUELOGIC-005 | Response Evaluator | P0 | M | ✅ DONE | DUELOGIC-001, 003 | [View](./orchestrator/DUELOGIC-005.md) |

**Sprint 2 Deliverables:**
- Arbiter with podcast-style intro/outro generation
- Arbiter interjection for principle violations
- Chair agents for all 10 philosophical frameworks
- Steel-manning and self-critique detection
- Response evaluation scoring system

---

### Sprint 3: Orchestration (5 days)

| Task ID | Task Name | Priority | Estimate | Status | Dependencies | Task File |
|---------|-----------|----------|----------|--------|--------------|-----------|
| DUELOGIC-006 | Chair Interruption Engine | P1 | M | ✅ DONE | DUELOGIC-001, 004 | [View](./orchestrator/DUELOGIC-006.md) |
| DUELOGIC-007 | Duelogic Orchestrator | P0 | L | ✅ DONE | DUELOGIC-001 to 006 | [View](./orchestrator/DUELOGIC-007.md) |

**Sprint 3 Deliverables:**
- Chair-to-chair interruption system
- 6 interrupt reason types with openers
- Aggressiveness and cooldown settings
- Full 4-segment debate orchestration
- Pause/resume/stop controls
- SSE event broadcasting

---

### Sprint 4: API & UI (3.5 days)

| Task ID | Task Name | Priority | Estimate | Status | Dependencies | Task File |
|---------|-----------|----------|----------|--------|--------------|-----------|
| DUELOGIC-008 | API Routes | P0 | S | ✅ DONE | DUELOGIC-001, 002, 007 | [View](./api/DUELOGIC-008.md) |
| DUELOGIC-009 | Frontend Config UI | P1 | L | ✅ DONE | DUELOGIC-008 | [View](./ui/DUELOGIC-009.md) |

**Sprint 4 Deliverables:**
- REST API endpoints for Duelogic debates
- Chair and preset listing endpoints
- Model selection endpoint
- Frontend configuration panel
- Chair selector with framework info
- Preset matchup quick-start
- Interruption and tone settings

---

### Sprint 5: Testing & Tuning (2 days)

| Task ID | Task Name | Priority | Estimate | Status | Dependencies | Task File |
|---------|-----------|----------|----------|--------|--------------|-----------|
| DUELOGIC-010 | Testing & Tuning | P1 | M | 🟢 TO DO | All previous | [View](./testing/DUELOGIC-010.md) |

**Sprint 5 Deliverables:**
- Unit tests with >80% coverage
- Integration tests for orchestrator
- E2E tests for full debate flow
- Prompt quality verification
- Sample debate runs
- Performance benchmarks
- Tuning documentation

---

### Sprint 6: Enhancements (5 days)

| Task ID | Task Name | Priority | Estimate | Status | Dependencies | Task File |
|---------|-----------|----------|----------|--------|--------------|-----------|
| DUELOGIC-011 | Allowed Sources | P1 | M | 🟢 TO DO | DUELOGIC-001, 008, 009 | [View](./features/DUELOGIC-011.md) |
| DUELOGIC-012 | Web Search Integration | P1 | L | 🟢 TO DO | DUELOGIC-011 | [View](./features/DUELOGIC-012.md) |

**Sprint 6 Deliverables:**
- User-defined allowed source URLs/domains
- Default generic web search with optional restrictions
- Source enforcement levels (strict/moderate/advisory)
- Citation tracking in chair arguments
- Frontend SourcesSettings component
- Web search via Tavily/Serper APIs
- Tool calling integration for LLM search
- Search results as context for arguments

---

## Quick Reference

### Status Legend

| Status | Meaning |
|--------|---------|
| 🟢 TO DO | Ready to start |
| 🟡 IN PROGRESS | Currently being worked on |
| 🔴 BLOCKED | Waiting on dependency |
| ✅ DONE | Completed |

### Priority Legend

| Priority | Meaning |
|----------|---------|
| P0 | Critical - MVP blocker |
| P1 | High - Important for quality |
| P2 | Medium - Nice to have |

### Estimate Legend

| Size | Duration |
|------|----------|
| S | 0.5-1 day |
| M | 1-2 days |
| L | 2-3 days |
| XL | 3-5 days |

---

## Dependency Graph

```
DUELOGIC-001 (Types)
    ├── DUELOGIC-002 (Database)
    │       └── DUELOGIC-003 (Arbiter) ──┐
    ├── DUELOGIC-003 (Arbiter)           │
    │       └── DUELOGIC-005 (Evaluator) ├── DUELOGIC-007 (Orchestrator)
    ├── DUELOGIC-004 (Chair) ────────────┤       │
    │       └── DUELOGIC-006 (Interrupt) ┘       │
    └───────────────────────────────────────────→ DUELOGIC-008 (API) ──┐
                                                        │               │
                                                  DUELOGIC-009 (UI) ────┼── DUELOGIC-011 (Allowed Sources)
                                                        │               │         │
                                                  DUELOGIC-010 (Testing)┘   DUELOGIC-012 (Web Search)
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Steel-Manning Rate | >80% | ResponseEvaluator tracking |
| Self-Critique Rate | >70% | ResponseEvaluator tracking |
| Framework Consistency | >90% | Violation count |
| Uncertainty Preserved | Subjective | User survey |
| Test Coverage | >80% | Jest coverage report |

---

## Getting Started

### For Agents/Developers

1. **Pick a task** from the current sprint marked 🟢 TO DO
2. **Check dependencies** are complete (marked ✅ DONE)
3. **Read the task file** - contains full implementation guide
4. **Update status** to 🟡 IN PROGRESS when starting
5. **Mark ✅ DONE** when all acceptance criteria met

### Task File Location

```
tasks/phase3/
├── types/
│   └── DUELOGIC-001.md
├── database/
│   └── DUELOGIC-002.md
├── agents/
│   ├── DUELOGIC-003.md
│   └── DUELOGIC-004.md
├── orchestrator/
│   ├── DUELOGIC-005.md
│   ├── DUELOGIC-006.md
│   └── DUELOGIC-007.md
├── api/
│   └── DUELOGIC-008.md
├── ui/
│   └── DUELOGIC-009.md
├── testing/
│   └── DUELOGIC-010.md
└── features/
    ├── DUELOGIC-011.md
    └── DUELOGIC-012.md
```

---

## Implementation Notes

### Master Specification

The comprehensive Duelogic specification is at:
- [tasks/DUELOGIC-001.md](../DUELOGIC-001.md)

This contains the complete design including:
- Full type definitions
- Prompt contracts
- Philosophical chair info
- Example arbiter scripts
- API specifications

### Philosophical Frameworks

10 frameworks available as chairs:
1. **Utilitarian** - Greatest good for greatest number
2. **Virtue Ethics** - Character and human flourishing
3. **Deontological** - Duty and moral rules
4. **Pragmatic** - What actually works
5. **Libertarian** - Individual liberty
6. **Communitarian** - Community bonds
7. **Cosmopolitan** - Universal human rights
8. **Precautionary** - Risk aversion
9. **Autonomy-Centered** - Self-determination
10. **Care Ethics** - Relationships and care

### Key Design Decisions

1. **Minimum 2 chairs, maximum 6** - Balances complexity with debate quality
2. **Arbiter as podcast host** - Creates engaging, production-ready format
3. **Mandatory obligations** - Steel-manning and self-critique enforced
4. **3 accountability levels** - Relaxed, moderate, strict
5. **5 aggressiveness levels** - Controls interruption frequency

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Master Spec](../DUELOGIC-001.md) | Complete Duelogic specification |
| [Phase 1 Kanban](../../docs/KANBAN.md) | MVP task tracking |
| [Requirements](../../docs/REQUIREMENTS.md) | Functional requirements |
| [Architecture](../../docs/09_real-time-architecture.md) | System architecture |

---

*Created: 2026-01-03*
*Phase 3 Planning Complete*
