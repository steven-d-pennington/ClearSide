# ClearSide Kanban Board

> Last Updated: 2025-12-22

---

## Board Overview

```
╔═══════════════╦═══════════════╦═══════════════╦═══════════════╦═══════════════╗
║   BACKLOG     ║    TO DO      ║  IN PROGRESS  ║    REVIEW     ║     DONE      ║
║   (Planned)   ║  (Ready)      ║  (Active)     ║  (Testing)    ║  (Complete)   ║
╠═══════════════╬═══════════════╬═══════════════╬═══════════════╬═══════════════╣
║               ║               ║               ║               ║               ║
║  Phase 2+     ║  Next Sprint  ║  Current Work ║  QA/Testing   ║  Shipped      ║
║  Features     ║  Items        ║               ║               ║               ║
║               ║               ║               ║               ║               ║
╚═══════════════╩═══════════════╩═══════════════╩═══════════════╩═══════════════╝
```

---

## Sprint: MVP Foundation

### Legend
- 🔴 **Blocked** - Cannot proceed, dependency issue
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Ready** - Ready to be picked up
- ✅ **Done** - Completed and verified
- 📋 **Backlog** - Planned for future

---

## BACKLOG 📋

### Infrastructure & Setup
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| INFRA-001 | Set up development environment | P0 | S | `infrastructure` |
| INFRA-002 | Configure CI/CD pipeline | P1 | M | `infrastructure`, `devops` |
| INFRA-003 | Set up testing framework | P0 | S | `infrastructure`, `testing` |
| INFRA-004 | Configure linting and formatting | P2 | S | `infrastructure` |
| INFRA-005 | Set up staging environment | P1 | M | `infrastructure`, `devops` |

### Agent Development
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| AGENT-001 | Design Orchestrator Agent prompt | P0 | M | `agent`, `prompt` |
| AGENT-002 | Implement Orchestrator Agent | P0 | L | `agent`, `backend` |
| AGENT-003 | Design Pro Advocate prompt | P0 | M | `agent`, `prompt` |
| AGENT-004 | Implement Pro Advocate Agent | P0 | L | `agent`, `backend` |
| AGENT-005 | Design Con Advocate prompt | P0 | M | `agent`, `prompt` |
| AGENT-006 | Implement Con Advocate Agent | P0 | L | `agent`, `backend` |
| AGENT-007 | Design Moderator Agent prompt | P0 | M | `agent`, `prompt` |
| AGENT-008 | Implement Moderator Agent | P0 | L | `agent`, `backend` |
| AGENT-009 | Design Challenge Agent prompt | P1 | M | `agent`, `prompt` |
| AGENT-010 | Implement Challenge Agent | P1 | L | `agent`, `backend` |
| AGENT-011 | Agent orchestration layer | P0 | XL | `agent`, `backend`, `core` |
| AGENT-012 | Information isolation between agents | P0 | M | `agent`, `backend` |

### Schema & Validation
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| SCHEMA-001 | Define JSON Schema v1 specification | P0 | M | `schema`, `spec` |
| SCHEMA-002 | Implement schema validation layer | P0 | M | `schema`, `backend` |
| SCHEMA-003 | Create schema test suite | P0 | M | `schema`, `testing` |
| SCHEMA-004 | Document schema contracts | P1 | S | `schema`, `docs` |
| SCHEMA-005 | Version migration strategy | P2 | S | `schema`, `planning` |

### Frontend / UI
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| UI-001 | Design system setup (colors, typography) | P1 | S | `ui`, `design` |
| UI-002 | Header component | P1 | S | `ui`, `frontend` |
| UI-003 | Question input form component | P0 | M | `ui`, `frontend` |
| UI-004 | Optional context input (collapsible) | P1 | S | `ui`, `frontend` |
| UI-005 | Generate button with loading state | P0 | S | `ui`, `frontend` |
| UI-006 | Pro arguments display (green) | P0 | M | `ui`, `frontend` |
| UI-007 | Con arguments display (red) | P0 | M | `ui`, `frontend` |
| UI-008 | Moderator synthesis display (gray) | P0 | M | `ui`, `frontend` |
| UI-009 | Challenge actions panel | P1 | M | `ui`, `frontend` |
| UI-010 | Inline challenge response display | P1 | M | `ui`, `frontend` |
| UI-011 | Loading/analyzing state animation | P1 | S | `ui`, `frontend` |
| UI-012 | Error handling and display | P0 | S | `ui`, `frontend` |
| UI-013 | Responsive layout | P1 | M | `ui`, `frontend` |
| UI-014 | Accessibility compliance | P1 | M | `ui`, `frontend` |

### Prompt Engineering
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| PROMPT-001 | Global system prompt design | P0 | M | `prompt`, `core` |
| PROMPT-002 | Orchestrator prompt template | P0 | M | `prompt` |
| PROMPT-003 | Pro Advocate prompt template | P0 | M | `prompt` |
| PROMPT-004 | Con Advocate prompt template | P0 | M | `prompt` |
| PROMPT-005 | Moderator prompt template | P0 | M | `prompt` |
| PROMPT-006 | Challenge prompt template | P1 | M | `prompt` |
| PROMPT-007 | Prompt testing framework | P0 | L | `prompt`, `testing` |
| PROMPT-008 | Prompt version control system | P1 | M | `prompt`, `infrastructure` |

### Testing & Quality
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| TEST-001 | Unit test setup | P0 | S | `testing` |
| TEST-002 | Integration test setup | P0 | M | `testing` |
| TEST-003 | Flagship demo regression test | P0 | L | `testing`, `quality` |
| TEST-004 | Schema compliance tests | P0 | M | `testing`, `schema` |
| TEST-005 | Agent output quality tests | P1 | L | `testing`, `quality` |
| TEST-006 | E2E test suite | P1 | L | `testing` |
| TEST-007 | Performance benchmarks | P2 | M | `testing`, `performance` |

### Documentation
| Task ID | Task | Priority | Estimate | Labels |
|---------|------|----------|----------|--------|
| DOC-001 | Product vision document | P1 | S | `docs` |
| DOC-002 | Flagship demo documentation | P1 | M | `docs` |
| DOC-003 | Agent architecture documentation | P1 | M | `docs` |
| DOC-004 | JSON schema documentation | P1 | M | `docs` |
| DOC-005 | Prompt contracts documentation | P1 | M | `docs` |
| DOC-006 | MVP UX specification | P1 | M | `docs` |
| DOC-007 | API documentation (future) | P2 | L | `docs` |
| DOC-008 | Developer setup guide | P1 | S | `docs` |

---

## TO DO 🟢

*Items ready for the next sprint*

| Task ID | Task | Priority | Assignee | Notes |
|---------|------|----------|----------|-------|
| INFRA-001 | Set up development environment | P0 | - | First priority |
| SCHEMA-001 | Define JSON Schema v1 specification | P0 | - | Foundation for all agents |
| PROMPT-001 | Global system prompt design | P0 | - | Required before agents |
| DOC-001 | Product vision document | P1 | - | From spec PDF |

---

## IN PROGRESS 🟡

*Currently being worked on*

| Task ID | Task | Started | Assignee | Blockers |
|---------|------|---------|----------|----------|
| - | - | - | - | - |

---

## REVIEW 🔍

*Awaiting review or testing*

| Task ID | Task | Reviewer | Status | Notes |
|---------|------|----------|--------|-------|
| DEMO-001 | Interactive flagship demo | - | Ready for review | Single-page HTML demo with full AI Data Center Moratorium debate |

---

## DONE ✅

*Completed items*

| Task ID | Task | Completed | Verified By |
|---------|------|-----------|-------------|
| PLAN-001 | Create product roadmap | 2025-12-22 | - |
| PLAN-002 | Create kanban board | 2025-12-22 | - |

---

## Phase 2 Backlog (Future)

### Enhanced Output Features
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P2-OUT-001 | Quick View output format | P1 | `output`, `feature` |
| P2-OUT-002 | Structured Report format | P1 | `output`, `feature` |
| P2-OUT-003 | Debate Script format | P2 | `output`, `feature` |
| P2-OUT-004 | Export to PDF | P2 | `output`, `feature` |
| P2-OUT-005 | Export to Markdown file | P2 | `output`, `feature` |

### Citations & Sources
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P2-CIT-001 | Citations toggle UI | P1 | `feature`, `ui` |
| P2-CIT-002 | Source labeling system | P1 | `feature`, `backend` |
| P2-CIT-003 | Confidence indicators with references | P2 | `feature` |

### Value Weighting
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P2-VAL-001 | Value slider component | P2 | `feature`, `ui` |
| P2-VAL-002 | Re-weighting logic | P2 | `feature`, `backend` |
| P2-VAL-003 | Economic factor weighting | P2 | `feature` |
| P2-VAL-004 | Ethical factor weighting | P2 | `feature` |
| P2-VAL-005 | Social factor weighting | P2 | `feature` |
| P2-VAL-006 | Technical factor weighting | P2 | `feature` |

### Persona Debates
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P2-PER-001 | Economist persona prompt | P2 | `persona`, `prompt` |
| P2-PER-002 | Ethicist persona prompt | P2 | `persona`, `prompt` |
| P2-PER-003 | Environmentalist persona prompt | P2 | `persona`, `prompt` |
| P2-PER-004 | Persona selection UI | P2 | `persona`, `ui` |
| P2-PER-005 | Multi-persona debate mode | P3 | `persona`, `feature` |

---

## Phase 3 Backlog (Future)

### User Accounts & Persistence
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P3-AUTH-001 | User authentication system | P1 | `auth`, `backend` |
| P3-AUTH-002 | User registration flow | P1 | `auth`, `frontend` |
| P3-AUTH-003 | Password reset flow | P1 | `auth` |
| P3-AUTH-004 | Session management | P1 | `auth`, `backend` |

### Saved Debates
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P3-SAVE-001 | Database schema for debates | P1 | `database`, `backend` |
| P3-SAVE-002 | Save debate API | P1 | `api`, `backend` |
| P3-SAVE-003 | Load saved debate API | P1 | `api`, `backend` |
| P3-SAVE-004 | Saved debates list UI | P1 | `ui`, `frontend` |
| P3-SAVE-005 | Delete saved debate | P2 | `feature` |

### Sharing
| Task ID | Task | Priority | Labels |
|---------|------|----------|--------|
| P3-SHARE-001 | Generate shareable link | P1 | `feature`, `backend` |
| P3-SHARE-002 | Public debate view page | P1 | `feature`, `frontend` |
| P3-SHARE-003 | Link expiration settings | P2 | `feature` |
| P3-SHARE-004 | Social sharing metadata | P2 | `feature`, `seo` |

---

## Estimation Guide

| Size | Description | Typical Duration |
|------|-------------|------------------|
| XS | Trivial change, config update | < 1 hour |
| S | Small, well-defined task | 1-4 hours |
| M | Medium complexity, some unknowns | 4-16 hours |
| L | Large, multiple components | 2-4 days |
| XL | Very large, significant complexity | 1-2 weeks |

---

## Priority Definitions

| Priority | Description |
|----------|-------------|
| P0 | **Critical** - Must have for MVP, blocks other work |
| P1 | **High** - Important for MVP, should be done |
| P2 | **Medium** - Nice to have for MVP, can defer |
| P3 | **Low** - Future consideration |

---

## Labels Reference

| Label | Description |
|-------|-------------|
| `agent` | Related to AI agents |
| `api` | API development |
| `auth` | Authentication/authorization |
| `backend` | Server-side development |
| `core` | Core functionality |
| `database` | Database work |
| `design` | UI/UX design |
| `devops` | DevOps/infrastructure |
| `docs` | Documentation |
| `feature` | New feature |
| `frontend` | Client-side development |
| `infrastructure` | Project infrastructure |
| `persona` | Persona debates feature |
| `planning` | Planning/architecture |
| `prompt` | Prompt engineering |
| `quality` | Quality assurance |
| `schema` | JSON schema |
| `seo` | Search engine optimization |
| `spec` | Specification |
| `testing` | Testing |
| `ui` | User interface |

---

## Sprint Velocity Tracking

| Sprint | Planned | Completed | Velocity |
|--------|---------|-----------|----------|
| Sprint 1 | - | - | - |
| Sprint 2 | - | - | - |
| Sprint 3 | - | - | - |

---

## Blockers & Dependencies

### Current Blockers
*None*

### Key Dependencies
```
SCHEMA-001 ──┬──► AGENT-002 (Orchestrator)
             ├──► AGENT-004 (Pro Advocate)
             ├──► AGENT-006 (Con Advocate)
             └──► AGENT-008 (Moderator)

PROMPT-001 ──┬──► PROMPT-002 (Orchestrator prompt)
             ├──► PROMPT-003 (Pro prompt)
             ├──► PROMPT-004 (Con prompt)
             └──► PROMPT-005 (Moderator prompt)

AGENT-002 ──► AGENT-004 ──┐
                          ├──► AGENT-008 ──► AGENT-010
AGENT-002 ──► AGENT-006 ──┘

UI-003 (Input) ──► UI-005 (Button) ──► UI-006/007/008 (Display)
```

---

*Updated: 2025-12-22*
