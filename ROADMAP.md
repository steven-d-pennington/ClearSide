# ClearSide Product Roadmap

> **AI-Powered Structured Reasoning & Debate Engine**
> *"Think both sides. Decide with clarity."*

---

## Product Vision

ClearSide is a thinking support system that helps users examine complex, high-stakes questions through structured adversarial reasoning. It generates steel-man arguments for and against propositions, moderates disagreements, and surfaces the assumptions and uncertainties that drive debate.

### North Star Metric
**Did the user understand the issue better than when they started?**

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
Core Debate Engine     Enhanced Features    Collaboration        Scale & Growth
│                      │                    │                    │
├─ Topic Intake        ├─ Citations Toggle  ├─ Saved Debates     ├─ API Access
├─ Pro Advocate        ├─ Value Weightings  ├─ Shareable Links   ├─ Enterprise
├─ Con Advocate        ├─ Persona Debates   ├─ User Accounts     ├─ Integrations
├─ Moderator           ├─ Export Options    ├─ Team Workspaces   ├─ Analytics
├─ Challenge Agent     └─ Debate History    └─ Comments          └─ Custom Domains
├─ JSON Schema
├─ MVP UI
└─ Output Formats
```

---

## Phase 1: MVP (Minimum Viable Product)

### Objective
Deliver a functional single-page application where users can input questions, receive structured pro/con debates, and challenge assumptions.

### MVP Feature Breakdown

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| MVP-001 | Single-question input form with optional context | P0 | Backlog | None |
| MVP-002 | Orchestrator Agent (proposition normalization) | P0 | Backlog | MVP-001 |
| MVP-003 | Pro Advocate Agent | P0 | Backlog | MVP-002 |
| MVP-004 | Con Advocate Agent | P0 | Backlog | MVP-002 |
| MVP-005 | Moderator Synthesis Agent | P0 | Backlog | MVP-003, MVP-004 |
| MVP-006 | JSON Schema v1 implementation | P0 | Backlog | None |
| MVP-007 | Structured output (Markdown) | P0 | Backlog | MVP-006 |
| MVP-008 | Structured output (JSON) | P0 | Backlog | MVP-006 |
| MVP-009 | Challenge Agent (basic) | P1 | Backlog | MVP-005 |
| MVP-010 | MVP UI - Input Section | P0 | Backlog | None |
| MVP-011 | MVP UI - Output Display | P0 | Backlog | MVP-006 |
| MVP-012 | MVP UI - Challenge Actions | P1 | Backlog | MVP-009 |
| MVP-013 | Prompt contracts & enforcement | P0 | Backlog | MVP-002 |
| MVP-014 | Schema validation | P0 | Backlog | MVP-006 |
| MVP-015 | Flagship demo implementation | P1 | Backlog | All above |

---

## Phase 2: Enhanced Features

### Objective
Add depth and customization to debates while maintaining neutrality and structured reasoning.

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| P2-001 | Citations toggle with source labeling | P1 | Backlog | MVP Complete |
| P2-002 | Value-weighting sliders (economic, ethical, social, technical) | P2 | Backlog | MVP Complete |
| P2-003 | Persona debates (economist vs ethicist vs environmentalist) | P2 | Backlog | MVP Complete |
| P2-004 | Quick View output format | P1 | Backlog | MVP Complete |
| P2-005 | Structured Report output format | P1 | Backlog | MVP Complete |
| P2-006 | Debate Script output format | P2 | Backlog | MVP Complete |
| P2-007 | Cross-examiner agent | P2 | Backlog | P2-003 |
| P2-008 | Debate history (session-based) | P2 | Backlog | MVP Complete |

---

## Phase 3: Collaboration & Persistence

### Objective
Enable saving, sharing, and collaborative exploration of debates.

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| P3-001 | User account system | P1 | Backlog | Phase 2 Complete |
| P3-002 | Saved debates | P1 | Backlog | P3-001 |
| P3-003 | Shareable debate links | P1 | Backlog | P3-002 |
| P3-004 | Database persistence layer | P0 | Backlog | P3-001 |
| P3-005 | Team workspaces | P2 | Backlog | P3-001 |
| P3-006 | Comments and annotations | P2 | Backlog | P3-002 |

---

## Phase 4: Scale & Enterprise

### Objective
Expand ClearSide for enterprise use cases and third-party integrations.

| ID | Feature | Priority | Status | Dependencies |
|----|---------|----------|--------|--------------|
| P4-001 | Public API | P1 | Backlog | Phase 3 Complete |
| P4-002 | Enterprise SSO | P2 | Backlog | P3-001 |
| P4-003 | Custom branding/domains | P2 | Backlog | P4-001 |
| P4-004 | Usage analytics dashboard | P2 | Backlog | P4-001 |
| P4-005 | Third-party integrations (Slack, Notion, etc.) | P3 | Backlog | P4-001 |

---

## Agent Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INPUT                                      │
│                    Question + Optional Context                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ORCHESTRATOR AGENT                                  │
│  • Normalizes proposition                                                    │
│  • Extracts context (geography, timeframe, domain)                          │
│  • Dispatches to advocates                                                   │
│  • Outputs: proposition section only                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│      PRO ADVOCATE AGENT       │   │      CON ADVOCATE AGENT       │
│  • Steel-man FOR position     │   │  • Steel-man AGAINST position │
│  • Arguments by category      │   │  • Arguments by category      │
│  • Explicit assumptions       │   │  • Explicit assumptions       │
│  • Confidence levels          │   │  • Confidence levels          │
│  • No rebuttals allowed       │   │  • No trivial objections      │
│  • Outputs: pro section only  │   │  • Outputs: con section only  │
└───────────────────────────────┘   └───────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MODERATOR AGENT                                     │
│  • Receives pro and con outputs                                             │
│  • Identifies areas of agreement                                            │
│  • Surfaces core disagreements with root causes                             │
│  • Highlights assumption conflicts                                          │
│  • Notes evidence gaps                                                      │
│  • Defines decision hinges                                                  │
│  • NEVER picks a winner or recommends action                                │
│  • Outputs: moderator section only                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FINAL OUTPUT                                       │
│                    Assembled JSON + Rendered UI                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Optional)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CHALLENGE AGENT (MVP)                                 │
│  • Responds to user-initiated challenges                                    │
│  • Analyzes specific assumptions or claims                                  │
│  • Provides dependency analysis                                             │
│  • Classifies as: factual, uncertain, or values-dependent                   │
│  • Outputs: challenges section only                                         │
└─────────────────────────────────────────────────────────────────────────────┘
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

## Technical Stack Considerations

### Recommended Architecture
- **Frontend**: React/Vue.js or static HTML with serverless functions
- **Backend**: Node.js or Python with LLM orchestration layer
- **Schema Contract**: JSON Schema v1 (versioned)
- **Model Agnostic**: Support multiple LLM providers behind the same interface

### Key Technical Requirements
- Response format enforcement (`response_format: json_schema`)
- Schema validation for all agent outputs
- Automated regression testing against flagship demo
- Version-controlled prompt contracts

---

## Success Metrics

### MVP Success Criteria
- [ ] User can input a question and receive structured pro/con debate
- [ ] All agent outputs conform to JSON schema
- [ ] Flagship demo produces consistent, high-quality reasoning
- [ ] User can challenge at least one assumption and receive inline response
- [ ] Output clearly separates pro, con, and moderator sections

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

---

*ClearSide is a thinking support system, not an opinion generator.*
