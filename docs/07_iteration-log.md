# ClearSide Iteration Log

> This document records every significant change to ClearSide specifications, with version numbers and rationale.

---

## Governance Rules

1. **Never overwrite intent silently** - Always record why a change was made
2. **Preserve prior versions** - Do not delete or overwrite historical reasoning
3. **Increment schema version** - When adding or removing fields
4. **Flag breaking changes** - Update all downstream dependencies
5. **Use flagship demo as benchmark** - Modifications should improve reasoning quality

---

## Version History

### v0.1.0 - Initial Specification (2025-12-22)

**Summary**: Initial product specification created from vision document.

#### Changes Made

| Category | Item | Status |
|----------|------|--------|
| Product Vision | Defined core mission and problem statement | Complete |
| Target Audience | Identified three primary segments | Complete |
| Value Proposition | Differentiated from generic AI tools | Complete |
| Success Metric | Established "understanding improvement" as North Star | Complete |
| Agent Architecture | Defined 5 agent roles and responsibilities | Complete |
| Interaction Flow | Documented MVP user flow | Complete |
| JSON Schema | Created v1.0.0 schema specification | Complete |
| Prompt Contracts | Established enforcement strategy | Complete |
| MVP UX | Specified single-screen layout | Complete |
| Design Principles | Codified 7 guardrails | Complete |
| Flagship Demo | Created AI data center moratorium benchmark | Complete |
| Repository Structure | Defined documentation organization | Complete |

#### Rationale

This initial specification establishes ClearSide as a structured reasoning tool distinct from:
- Generic chatbots (which collapse complexity)
- Pros/cons generators (which lack rigor)
- Decision tools (which focus on process over reasoning)

The adversarial agent architecture ensures balanced argumentation, while the moderator synthesis maintains neutrality.

#### Key Decisions

1. **No final answers**: Moderator never picks winners - preserves user agency
2. **Steel-man requirement**: Forces strongest possible arguments on both sides
3. **Explicit assumptions**: Makes hidden premises visible and challengeable
4. **Single-page MVP**: Minimizes friction, focuses on core value

---

### v0.1.1 - Project Documentation (2025-12-22)

**Summary**: Created comprehensive project tracking and planning documents.

#### Documents Created

| Document | Purpose |
|----------|---------|
| `ROADMAP.md` | Main project roadmap with phase breakdown |
| `docs/KANBAN.md` | Kanban board with detailed task tracking |
| `docs/REQUIREMENTS.md` | Full product requirements document |
| `docs/01_product-vision.md` | Product vision and mission |
| `docs/04_json-schema.md` | Complete JSON schema specification |
| `docs/07_iteration-log.md` | This version history document |

#### Rationale

Comprehensive documentation enables:
- Clear communication of product vision
- Structured development tracking
- Quality benchmarking against flagship demo
- Onboarding for new contributors

---

### v0.1.2 - Interactive Flagship Demo (2025-12-22)

**Summary**: Created single-page interactive demo showcasing the flagship AI Data Center Moratorium debate.

#### Deliverables

| Item | Description |
|------|-------------|
| `demo/index.html` | Complete single-page interactive demo |

#### Features Implemented

| Feature | Description |
|---------|-------------|
| Question Input | Pre-filled with flagship question, editable |
| Context Fields | Geography, timeframe, domain inputs |
| Generate Button | Triggers debate display with loading state |
| Pro Column | Green-themed, full flagship pro arguments |
| Con Column | Red-themed, full flagship con arguments |
| Moderator Column | Gray-themed, synthesis with agreements, disagreements, conflicts |
| Argument Cards | Category, claim, explanation, evidence type, confidence |
| Assumptions Display | Explicit assumptions for each side |
| Weak Points | Known weaknesses acknowledged by each side |
| Evidence Gaps | Missing data identified by moderator |
| Decision Hinges | Key factors that would shift the debate |
| Challenge Panel | Three challenge action buttons |
| Challenge Responses | Interactive responses for assumption queries |

#### Design Decisions

1. **Static HTML**: Single file, no build process, easy to deploy and share
2. **Pre-populated Demo**: Shows flagship debate immediately for instant value
3. **Three-column Layout**: Visual separation of Pro/Con/Moderator per spec
4. **Professional Aesthetic**: Policy-tool styling, no chat bubbles or gamification
5. **Interactive Challenges**: Demonstrates challenge agent concept with canned responses
6. **Mobile Responsive**: Grid collapses to single column on smaller screens

#### Rationale

The interactive demo serves as:
- Quality benchmark for reasoning display
- Visual reference for UI implementation
- Stakeholder demonstration tool
- Test case for CSS and layout decisions

---

### v0.2.0 - Live Debate Architecture (2025-12-23)

**Summary**: Major architectural expansion from static demo to real-time live debate system.

#### Key Changes

| Category | Change | Rationale |
|----------|--------|-----------|
| Architecture | Switched to Server-Sent Events (SSE) for real-time streaming | Enables live debate experience with progressive content delivery |
| Debate Protocol | Custom 6-phase ClearSide format | Optimized for AI agents and digital consumption (25-30 min runtime) |
| User Participation | Added intervention system (pause, question, clarify, inject) | Maintains user agency during live debates |
| Replay System | Hybrid live-replay model | Debates are generated live, then instantly replayable |
| Orchestration | Turn-based state machine | Coordinates multi-agent dialogue with phase transitions |

#### Breaking Changes
- Removed static three-column layout in favor of streaming timeline
- JSON Schema updated to v2.0.0 for turn-based utterances

---

### v0.3.0 - Backend Infrastructure (2025-12-24)

**Summary**: Complete backend implementation with agents, database, and orchestration.

#### Deliverables

| Task | Description | Status |
|------|-------------|--------|
| INFRA-001 | LLM API integration layer (OpenAI/Anthropic) | ✅ Complete |
| INFRA-002 | PostgreSQL database with migrations | ✅ Complete |
| INFRA-003 | SSE streaming manager | ✅ Complete |
| INFRA-004 | Schema validation layer | ✅ Complete |
| INFRA-005 | Pino logging system | ✅ Complete |
| CORE-001 | Debate state machine | ✅ Complete |
| CORE-002 | Debate orchestrator | ✅ Complete |
| CORE-003 | Turn manager | ✅ Complete |
| CORE-004 | Intervention queue | ✅ Complete |
| CORE-005 | Transcript recorder | ✅ Complete |
| AGENT-001 | Orchestrator agent (proposition normalization) | ✅ Complete |
| AGENT-002 | Pro Advocate agent | ✅ Complete |
| AGENT-003 | Con Advocate agent | ✅ Complete |
| AGENT-004 | Moderator agent | ✅ Complete |
| AGENT-005 | Prompt template library | ✅ Complete |

#### Key Decisions

1. **Per-debate orchestrators**: Each debate gets isolated state machine for clean lifecycle
2. **Fire-and-forget execution**: HTTP response returns immediately; orchestrator runs async
3. **Prompt modifiers**: Brevity and citation instructions injectable into agent prompts

---

### v0.4.0 - Frontend Implementation (2025-12-24)

**Summary**: Complete React frontend with design system and state management.

#### Deliverables

| Task | Description | Status |
|------|-------------|--------|
| UI-001 | Input form with validation | ✅ Complete |
| UI-002 | Live debate stream component | ✅ Complete |
| UI-003 | Timeline scrubber | ✅ Complete |
| UI-004 | Intervention panel | ✅ Complete |
| UI-005 | App layout with navigation | ✅ Complete |
| UI-006 | Zustand state management + SSE | ✅ Complete |
| UI-007 | Phase indicator | ✅ Complete |
| UI-008 | Speaker badges | ✅ Complete |
| UI-009 | Design system (Button, Input, Modal, etc.) | ✅ Complete |

#### Design System

- CSS variables for colors, spacing, typography (`tokens.css`)
- Component library: Button, Input, Textarea, Modal, Badge, Alert, Card
- Dark-mode ready architecture
- Mobile-first responsive design

#### Key Decisions

1. **erasableSyntaxOnly: true** - Using const objects instead of enums for TypeScript
2. **Zustand over Redux** - Simpler state management with built-in SSE handling
3. **CSS Modules** - Scoped styles without runtime overhead

---

### v0.5.0 - Testing Suite (2025-12-24-25)

**Summary**: Comprehensive testing coverage across all layers.

#### Test Coverage

| Category | Tests | Files |
|----------|-------|-------|
| Unit Tests (Frontend) | 166 | 9 |
| Integration Tests | 20 | 1 |
| E2E Tests (Playwright) | 40+ | 4 |
| Accessibility Tests | 111 | 3 |
| Agent Quality Tests | 101 | 4 |
| Export Tests | 40 | 1 |
| **Total** | **~480+** | **22** |

#### Quality Validation

- Steel-man quality checks (no straw-manning)
- Moderator neutrality validation (no winner-picking)
- Uncertainty preservation (no false certainty)
- Schema validation for all agent outputs

---

### v0.6.0 - Deployment & DevOps (2025-12-25)

**Summary**: Production deployment and local development containerization.

#### Infrastructure

| Component | Technology |
|-----------|------------|
| Database | Timescale Cloud (PostgreSQL) |
| Backend | Railway (Node.js) |
| Frontend | Vercel-ready (static) |
| Local Dev | Docker Compose |

#### Key Features

- Auto-migrations on server startup
- Health check endpoints
- CORS configuration for cross-origin SSE
- Environment-based configuration

---

### v0.7.0 - Debate History & Replay (2025-12-26)

**Summary**: Browse and replay completed debates.

#### New Features

| Feature | Description |
|---------|-------------|
| History page | `/history` - Browse all debates with filtering |
| Debate view | `/debates/:id` - View/replay individual debates |
| Status filters | Filter by completed, live, paused, failed |
| SSE type mapping | Fixed backend/frontend event name mismatches |

#### API Additions

- `GET /api/debates` - List debates with filtering
- `GET /api/debates/:id/utterances` - Get all utterances for replay

---

### v1.0.0 - MVP Complete (2025-12-26)

**Summary**: Full MVP release with configuration system.

#### Configuration System (CONFIG-001 through CONFIG-007)

| Feature | Description |
|---------|-------------|
| Preset modes | Quick, Balanced, Deep Dive, Research, Custom |
| Brevity levels | 1-5 scale controlling response length |
| LLM temperature | 0.0-1.0 for creativity vs consistency |
| Citation requirements | Optional enforcement of source citations |
| Flow mode | Auto (continuous) vs Step (pause between turns) |

#### Database Changes

- New columns on `debates`: preset_mode, brevity_level, llm_temperature, max_tokens_per_response, require_citations
- New table: `debate_presets` for system and custom presets

#### Frontend Changes

- ConfigPanel component with preset selector
- BrevitySlider (1-5 scale)
- TemperatureSlider (0-1 scale)
- Advanced settings collapsible section

#### Key Metrics Achieved

- [x] User can input question and receive structured debate
- [x] All agent outputs conform to JSON schema
- [x] User can intervene with questions and challenges
- [x] Output clearly separates pro, con, and moderator
- [x] 480+ automated tests passing
- [x] Production deployment operational

---

## Change Request Template

When proposing changes, use this template:

```markdown
## Change Request: [Title]

**Version**: v[x.y.z]
**Date**: YYYY-MM-DD
**Author**: [Name]

### Summary
Brief description of the change.

### Motivation
Why is this change needed?

### Impact
- Schema changes: Yes/No
- Breaking changes: Yes/No
- Affected components: [List]

### Proposed Changes
1. Change 1
2. Change 2

### Benchmark Impact
How does this affect the flagship demo?

### Rollback Plan
How to revert if issues arise?
```

---

## Breaking Change History

*No breaking changes recorded yet.*

---

## Deprecation Notices

*No deprecations yet.*

---

## Migration Guides

*No migrations required yet.*

---

*Last Updated: 2025-12-26*
