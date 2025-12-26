# Changelog

All notable changes to ClearSide are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-12-26

### Added

**Configuration System**
- Preset modes: Quick, Balanced, Deep Dive, Research, Custom
- Brevity levels (1-5) controlling response length
- LLM temperature slider (0.0-1.0) for creativity vs consistency
- Citation requirement toggle for evidence enforcement
- Flow mode: Auto (continuous) vs Step (pause between turns)
- ConfigPanel UI component with collapsible advanced settings
- Database migration for configuration fields
- Preset repository for system and custom presets
- API endpoints: `GET /presets`, `GET /presets/:id`

**Debate History & Replay**
- History page at `/history` to browse all debates
- Status filtering (completed, live, paused, failed)
- Individual debate view at `/debates/:id`
- Replay functionality for completed debates
- `GET /api/debates/:id/utterances` endpoint

**Docker Development Environment**
- Docker Compose setup for local development
- Hot reload support on Windows with Chokidar polling
- PostgreSQL container with health checks
- Backend and frontend dev containers

### Fixed

- SSE event type mapping between backend and frontend
- Phase/speaker handling for undefined values in UI
- Orchestrator not starting after debate creation

### Changed

- Updated debate-store to handle backend SSE event names
- Extended Debate interface with configuration fields

---

## [0.7.0] - 2025-12-26

### Added

- DebateList component for browsing debates
- HistoryPage with status filters
- DebateViewPage for individual debate viewing
- Navigation links between pages
- `GET /api/debates/:id/utterances` API endpoint

---

## [0.6.0] - 2025-12-25

### Added

**Production Deployment**
- Railway deployment configuration
- Auto-migrations on server startup
- Health check endpoint at `/health`
- Timescale Cloud PostgreSQL integration

**Local Development**
- Docker Compose configuration
- Environment variable templates
- Hot reload for backend and frontend

### Changed

- Database migrations run programmatically on startup
- Build process copies SQL migration files to dist/

---

## [0.5.0] - 2025-12-24-25

### Added

**Testing Suite (480+ tests)**
- Unit tests for frontend components (166 tests)
- Integration tests for debate flow (20 tests)
- E2E tests with Playwright (40+ tests)
- Accessibility tests for WCAG compliance (111 tests)
- Agent quality validation tests (101 tests)
- Export tests for Markdown generation (40 tests)

**Quality Validators**
- Steel-man quality checks
- Moderator neutrality validation
- Uncertainty preservation checks
- Schema validation for agent outputs

**Markdown Export (Phase 2 Start)**
- MarkdownExporter service
- Export API endpoints
- Configurable export options

---

## [0.4.0] - 2025-12-24

### Added

**Frontend UI Components**
- InputForm with validation and character count
- DebateStream with auto-scroll and streaming
- PhaseIndicator for 6-phase progress
- SpeakerBadge for Pro/Con/Moderator identification
- TurnCard for completed turns
- StreamingTurn for active content
- TimelineScrubber for phase navigation
- InterventionPanel for user participation
- AppLayout with responsive navigation

**Design System**
- CSS design tokens (colors, spacing, typography)
- Button, Input, Textarea, Modal, Badge, Alert, Card components
- Mobile-first responsive design
- Dark-mode ready architecture

**State Management**
- Zustand store for debate state
- SSE connection handling
- Intervention queue management

### Changed

- TypeScript configuration: `erasableSyntaxOnly: true`
- Using const objects instead of enums

---

## [0.3.0] - 2025-12-24

### Added

**Backend Infrastructure**
- LLM API integration (OpenAI/Anthropic)
- PostgreSQL database with migrations
- SSE streaming manager
- Schema validation layer
- Pino structured logging

**Core Engine**
- DebateStateMachine for phase transitions
- DebateOrchestrator for coordination
- TurnManager for agent dialogue
- InterventionQueue for user participation
- TranscriptRecorder for persistence

**AI Agents**
- OrchestratorAgent for proposition normalization
- ProAdvocateAgent with steel-man argumentation
- ConAdvocateAgent with steel-man opposition
- ModeratorAgent for neutral synthesis
- Comprehensive prompt template library

---

## [0.2.0] - 2025-12-23

### Added

**Live Debate Architecture**
- Real-time SSE streaming infrastructure
- Custom 6-phase ClearSide debate protocol
- User intervention system (pause, question, clarify, inject)
- Hybrid live-replay model
- Turn-based state machine

**Documentation**
- Live debate protocol specification
- Real-time architecture documentation
- Media production pipeline design

### Changed

- Shifted from static analysis to live debate streaming
- Updated JSON Schema to v2.0.0 for utterance-based model

### Breaking Changes

- Removed static three-column layout
- New transcript format with turn-based structure

---

## [0.1.2] - 2025-12-22

### Added

- Interactive flagship demo (`demo/index.html`)
- Pre-populated AI Data Center Moratorium debate
- Three-column layout (Pro/Con/Moderator)
- Challenge panel with interactive responses

---

## [0.1.1] - 2025-12-22

### Added

- Project documentation structure
- ROADMAP.md with phase breakdown
- KANBAN.md for task tracking
- REQUIREMENTS.md for product specs
- Product vision documentation
- JSON schema specification
- Iteration log

---

## [0.1.0] - 2025-12-22

### Added

- Initial product specification
- Agent architecture design (5 roles)
- JSON Schema v1.0.0
- Prompt contracts specification
- MVP UX specification
- Flagship demo benchmark
- Seven design principles

---

## Types of Changes

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes
