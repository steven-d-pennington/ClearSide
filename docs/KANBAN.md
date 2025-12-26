# ClearSide Kanban Board - Live Debate Theater

> Last Updated: 2025-12-26
> Version: 3.7.0 - Debate History & Replay Feature Added

## 🔧 Recent Changes (2025-12-26)

**NEW: Debate History & Replay Feature:**
- Browse all previous debates at `/history`
- Filter by status (completed, live, paused, failed)
- View/replay any debate at `/debates/:id`
- New endpoint: `GET /api/debates/:id/utterances`
- See `docs/IMPLEMENTATION_NOTES.md` for details

**Docker Containerization:**
- Added full Docker development setup with hot reload
- Created `docker-compose.yml`, Dockerfiles for backend/frontend
- See `docs/IMPLEMENTATION_NOTES.md` for usage instructions

**Critical Fix - Orchestrator Integration:**
- DebateOrchestrator (CORE-002) was implemented but **never wired to routes**
- Fixed: `backend/src/routes/debate-routes.ts` now starts orchestrator on debate creation
- Debates now actually run through all 6 phases with LLM calls

**SSE Event Type Mismatch:**
- Frontend expected different event names than backend sends
- Fixed: Added handlers for `utterance`, `phase_start`, `phase_complete`, `debate_complete`, `error`
- See `docs/IMPLEMENTATION_NOTES.md` for full mapping

---

## 🎯 Quick Start

**For Agents/Developers:** Grab a task from the backlog below and open the linked task file. Each file contains everything you need to complete the task independently.

**Task File Location:** `tasks/phase1/{category}/{TASK-ID}.md` or `tasks/phase2/{category}/{TASK-ID}.md`

Each task file includes:
- Full context and references to relevant documentation
- Detailed acceptance criteria
- Implementation guide with code examples
- Dependencies and validation steps
- Test cases and definition of done

---

## Board Overview

```
╔═══════════════╦═══════════════╦═══════════════╦═══════════════╦═══════════════╗
║   BACKLOG     ║    TO DO      ║  IN PROGRESS  ║    REVIEW     ║     DONE      ║
║   (Planned)   ║  (Ready)      ║  (Active)     ║  (Testing)    ║  (Complete)   ║
╠═══════════════╬═══════════════╬═══════════════╬═══════════════╬═══════════════╣
║               ║               ║               ║               ║               ║
║  Phase 1 & 2  ║  Next Sprint  ║  Current Work ║  QA/Testing   ║  Shipped      ║
║  Features     ║  Items        ║               ║               ║               ║
║               ║               ║               ║               ║               ║
╚═══════════════╩═══════════════╩═══════════════╩═══════════════╩═══════════════╝
```

---

## Legend

- 🔴 **Blocked** - Cannot proceed, dependency issue
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Ready** - Ready to be picked up
- ✅ **Done** - Completed and verified
- 📋 **Backlog** - Planned for future

**Priority Levels:**
- **P0** - Critical blocker, must complete for MVP
- **P1** - High priority, should complete for MVP
- **P2** - Medium priority, nice to have
- **P3** - Low priority, future enhancement

**Estimation Guide:**
- `XS` - Trivial (< 1 hour)
- `S` - Small (1-4 hours)
- `M` - Medium (4-8 hours)
- `L` - Large (1-3 days)
- `XL` - Very large (4+ days)

---

## 📋 PHASE 1: LIVE DEBATE ENGINE

### 🏗️ Infrastructure & Database

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| INFRA-001 | Set Up LLM API Integration Layer | P0 | M | ✅ DONE | [View Task](../tasks/phase1/infrastructure/INFRA-001.md) |
| INFRA-002 | Set Up PostgreSQL Database with Schema | P0 | M | ✅ DONE | [View Task](../tasks/phase1/infrastructure/INFRA-002.md) |
| INFRA-003 | Implement Server-Sent Events (SSE) Layer | P0 | L | ✅ DONE | [View Task](../tasks/phase1/infrastructure/INFRA-003.md) |
| INFRA-004 | Set Up JSON Schema Validation | P0 | S | ✅ DONE | [View Task](../tasks/phase1/infrastructure/INFRA-004.md) |
| INFRA-005 | Set Up Logging & Monitoring | P1 | M | ✅ DONE | [View Task](../tasks/phase1/infrastructure/INFRA-005.md) |

**Dependencies:** INFRA-001 and INFRA-002 can start immediately in parallel

---

### 🎛️ Core Debate Engine

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| CORE-001 | Implement Debate State Machine | P0 | L | ✅ DONE | [View Task](../tasks/phase1/core/CORE-001.md) |
| CORE-002 | Implement Debate Orchestrator | P0 | XL | ✅ DONE | [View Task](../tasks/phase1/core/CORE-002.md) |
| CORE-003 | Implement Turn Management System | P0 | L | ✅ DONE | [View Task](../tasks/phase1/core/CORE-003.md) |
| CORE-004 | Implement User Intervention Queue | P0 | M | ✅ DONE | [View Task](../tasks/phase1/core/CORE-004.md) |
| CORE-005 | Implement Transcript Recorder | P0 | M | ✅ DONE | [View Task](../tasks/phase1/core/CORE-005.md) |

**Dependencies:**
- CORE-001 depends on INFRA-002 (database)
- CORE-002 depends on CORE-001, INFRA-001, INFRA-003
- CORE-003 depends on CORE-001
- CORE-004 depends on CORE-002
- CORE-005 depends on CORE-002

---

### 🤖 AI Agents

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| AGENT-001 | Implement Orchestrator Agent (Proposition Normalization) | P0 | M | ✅ DONE | [View Task](../tasks/phase1/agents/AGENT-001.md) |
| AGENT-002 | Implement Pro Advocate Agent | P0 | XL | ✅ DONE | [View Task](../tasks/phase1/agents/AGENT-002.md) |
| AGENT-003 | Implement Con Advocate Agent | P0 | XL | ✅ DONE | [View Task](../tasks/phase1/agents/AGENT-003.md) |
| AGENT-004 | Implement Moderator Agent | P0 | L | ✅ DONE | [View Task](../tasks/phase1/agents/AGENT-004.md) |
| AGENT-005 | Create Agent Prompt Templates | P0 | L | ✅ DONE | [View Task](../tasks/phase1/agents/AGENT-005.md) |

**Dependencies:**
- AGENT-001 depends on INFRA-001
- AGENT-002, AGENT-003 depend on AGENT-005, CORE-002
- AGENT-004 depends on AGENT-005, CORE-005

---

### 🎨 Frontend UI Components

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| UI-001 | Create Input Section Component | P0 | S | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-001) |
| UI-002 | Create Live Debate Stream Component | P0 | L | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-002) |
| UI-003 | Create Timeline Scrubber Component | P0 | M | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-003) |
| UI-004 | Create Intervention Panel Component | P0 | M | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-004) |
| UI-005 | Create Responsive Layout & Navigation | P0 | S | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-005) |
| UI-006 | Implement Debate State Management (Zustand) | P0 | M | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-006) |
| UI-007 | Create Phase Indicator Component | P0 | S | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-007) |
| UI-008 | Create Speaker Indicator Component | P0 | XS | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-008) |
| UI-009 | Implement Auto-scroll for Live Stream | P0 | S | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#ui-009) |

**Dependencies:**
- UI-001 can start immediately
- UI-002 depends on INFRA-003 (SSE), UI-006
- UI-003, UI-004, UI-005, UI-007, UI-008 depend on UI-006
- UI-009 depends on UI-002

---

### 🧪 Testing & Quality Assurance

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| TEST-001 | Create Unit Test Suite | P0 | M | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#test-001) |
| TEST-002 | Create Integration Tests for Debate Flow | P0 | L | ✅ DONE | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#test-002) |
| TEST-003 | End-to-End Testing with Playwright | P1 | L | ✅ DONE | [View Task](../tasks/phase1/testing/TEST-003.md) |
| TEST-004 | Load Test SSE Streaming | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#test-004) |
| TEST-005 | Agent Output Validation & Quality Testing | P0 | L | ✅ DONE | [View Task](../tasks/phase1/testing/TEST-005.md) |

**Dependencies:**
- TEST-001 can run in parallel with development
- TEST-002 depends on all CORE tasks
- TEST-003 depends on all AGENT tasks
- TEST-004 depends on INFRA-003
- TEST-005 depends on CORE-004, UI-004

---

## 📋 PHASE 2: MEDIA PRODUCTION PIPELINE

### 📄 Text Export

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| EXPORT-001 | Implement Markdown Transcript Export | P0 | S | ✅ DONE | [View Task](../tasks/phase2/text-export/EXPORT-001.md) |
| EXPORT-002 | Implement PDF Transcript Export | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#export-002) |

**Dependencies:** CORE-005 (Transcript Recorder)

---

### 🎙️ Audio Export

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| AUDIO-001 | Integrate ElevenLabs TTS API | P0 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#audio-001) |
| AUDIO-002 | Create Voice Profile Mapping | P0 | S | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#audio-002) |
| AUDIO-003 | Implement Audio Podcast Generator (MP3) | P0 | L | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#audio-003) |
| AUDIO-004 | Add Chapter Markers to Audio | P1 | S | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#audio-004) |

**Dependencies:**
- AUDIO-001 can start immediately
- AUDIO-002 depends on AUDIO-001
- AUDIO-003 depends on AUDIO-002, CORE-005
- AUDIO-004 depends on AUDIO-003

---

### 🎬 Video Export

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| VIDEO-001 | Set Up Remotion Video Framework | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#video-001) |
| VIDEO-002 | Create Visual Debate Stage Template | P1 | L | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#video-002) |
| VIDEO-003 | Implement Subtitle Generation | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#video-003) |
| VIDEO-004 | Implement Video Rendering Pipeline | P1 | XL | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#video-004) |

**Dependencies:**
- VIDEO-001 can start immediately
- VIDEO-002 depends on VIDEO-001
- VIDEO-003 depends on VIDEO-001, AUDIO-002
- VIDEO-004 depends on VIDEO-002, VIDEO-003

---

### ⚙️ Queue & Storage

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| QUEUE-001 | Implement Export Queue (BullMQ) | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#queue-001) |
| QUEUE-002 | Create Export Status Tracking | P1 | S | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#queue-002) |
| STORAGE-001 | Set Up S3/Blob Storage Integration | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#storage-001) |
| STORAGE-002 | Implement CDN Delivery | P1 | S | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#storage-002) |

**Dependencies:**
- QUEUE-001 can start immediately
- QUEUE-002 depends on QUEUE-001
- STORAGE-001 can start immediately
- STORAGE-002 depends on STORAGE-001

---

### 🎨 Export UI

| Task ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| EXPORT-UI-001 | Create Export Controls Component | P0 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#export-ui-001) |
| EXPORT-UI-002 | Create Export Status Dashboard | P1 | M | 📋 BACKLOG | [See Summary](../tasks/TASK_CREATION_SUMMARY.md#export-ui-002) |

**Dependencies:**
- EXPORT-UI-001 depends on EXPORT-001, AUDIO-003
- EXPORT-UI-002 depends on QUEUE-002

---

## 🗓️ Sprint Planning

### Sprint 1: Foundation (Weeks 1-2)
**Goal:** Database, SSE, State Machine, LLM Integration

- [ ] INFRA-001: LLM API Integration
- [ ] INFRA-002: PostgreSQL Database
- [ ] INFRA-003: SSE Layer
- [ ] INFRA-004: JSON Schema Validation
- [ ] CORE-001: Debate State Machine
- [ ] AGENT-001: Orchestrator Agent

**Completion Criteria:** Can start a debate, transition phases, stream to frontend

---

### Sprint 2: Core Engine (Weeks 3-4)
**Goal:** Complete orchestration and agent implementation

- [ ] CORE-002: Debate Orchestrator
- [ ] CORE-003: Turn Management
- [ ] CORE-005: Transcript Recorder
- [ ] AGENT-005: Prompt Templates
- [ ] AGENT-002: Pro Advocate Agent
- [ ] AGENT-003: Con Advocate Agent

**Completion Criteria:** Full debate runs through all 6 phases with agents

---

### Sprint 3: UI & Interventions (Weeks 5-6)
**Goal:** Build frontend and user interaction

- [ ] UI-001: Input Section
- [ ] UI-002: Live Debate Stream
- [ ] UI-003: Timeline Scrubber
- [ ] UI-004: Intervention Panel
- [ ] UI-006: State Management
- [ ] UI-007: Phase Indicator
- [ ] UI-008: Speaker Indicator
- [ ] CORE-004: Intervention Queue
- [ ] AGENT-004: Moderator Agent

**Completion Criteria:** Users can watch live debates and intervene

---

### Sprint 4: Replay & Testing (Weeks 7-8)
**Goal:** Polish, test, and validate MVP

- [x] UI-005: Playback Controls (previously completed)
- [x] UI-009: Auto-scroll (previously completed)
- [x] TEST-001: Unit Tests
- [x] TEST-002: Integration Tests
- [x] TEST-003: E2E Testing (Playwright) - 40+ tests, flagship demo coverage
- [ ] TEST-004: Load Testing SSE
- [x] TEST-005: Agent Output Validation - 101 quality tests
- [x] INFRA-005: Logging & Monitoring (previously completed)
- [x] Accessibility Testing - 111 tests added (axe-core, color contrast, keyboard nav)

**Completion Criteria:** MVP is production-ready and tested

---

### Sprint 5: Media Production - Text & Audio (Weeks 9-10)
**Goal:** Enable transcript and podcast export

- [x] EXPORT-001: Markdown Export - 40 tests, API endpoints, full formatting
- [ ] EXPORT-002: PDF Export
- [ ] AUDIO-001: ElevenLabs Integration
- [ ] AUDIO-002: Voice Mapping
- [ ] AUDIO-003: Podcast Generator
- [ ] AUDIO-004: Chapter Markers
- [ ] QUEUE-001: Export Queue
- [ ] QUEUE-002: Status Tracking
- [ ] STORAGE-001: S3 Integration
- [ ] EXPORT-UI-001: Export Controls

**Completion Criteria:** Users can export debates as text and audio

---

### Sprint 6: Video & Polish (Weeks 11-12)
**Goal:** Add video export and finalize Phase 2

- [ ] VIDEO-001: Remotion Setup
- [ ] VIDEO-002: Visual Stage
- [ ] VIDEO-003: Subtitle Generation
- [ ] VIDEO-004: Video Pipeline
- [ ] STORAGE-002: CDN Delivery
- [ ] EXPORT-UI-002: Status Dashboard

**Completion Criteria:** Full media production pipeline operational

---

## 📊 Dependencies Graph (Critical Path)

```
INFRA-001 (LLM) ─────┬──> AGENT-001 (Orchestrator)
                     │
INFRA-002 (DB) ──────┼──> CORE-001 (State Machine)
                     │              │
INFRA-003 (SSE) ─────┤              ├──> CORE-002 (Orchestrator) ──> AGENT-002/003
                     │              │                               │
INFRA-004 (Schema) ──┘              │                               │
                                    │                               ├──> CORE-005 (Transcript)
                                    └──> CORE-003 (Turn Mgmt) ──────┤
                                                                    │
                                    CORE-004 (Interventions) <──────┘
                                           │
                                           ├──> UI-002 (Stream)
                                           ├──> UI-004 (Interventions)
                                           │
                                           └──> TEST-002 (Integration)
                                                     │
                                                     └──> TEST-003 (Flagship Demo)
                                                              │
                                                              └──> PHASE 1 COMPLETE
                                                                        │
                                                                        ├──> EXPORT-001 (Markdown)
                                                                        ├──> AUDIO-003 (Podcast)
                                                                        └──> VIDEO-004 (Video)
```

**Critical Path:** INFRA-002 → CORE-001 → CORE-002 → AGENT-002/003 → CORE-005 → TEST-003

---

## 💰 Cost Estimates

### MVP (Phase 1)
- **Development Time:** 8-10 weeks (1-2 engineers)
- **LLM API Costs:** ~$5-15 per debate (GPT-4 or Claude Sonnet)
- **Infrastructure:** ~$50-100/month (PostgreSQL, hosting)

### Phase 2 (Media Production)
- **Development Time:** 4 weeks (1 engineer)
- **Text Export:** Negligible cost
- **Audio Export (MP3):** ~$4.50 per 27-min debate (ElevenLabs)
- **Video Export (MP4):** ~$18.65 per 27-min debate (ElevenLabs + Remotion)
- **Storage:** ~$0.50/month per 100 debates (S3 + CDN)

**Recommendation:** Launch Phase 1 complete, then Phase 2 with Text + Audio only. Defer video to post-MVP based on user demand.

---

## 📝 Notes

### Task File System
- **Completed Task Files:** 11 comprehensive files created for Infrastructure and Core Engine tasks
- **Remaining Tasks:** 34 tasks fully specified in `tasks/TASK_CREATION_SUMMARY.md`
- **Format:** Each task file follows standardized template with context, requirements, implementation guide, tests, and validation

### How to Use This Board
1. Pick a task marked 🟢 TO DO with no blockers
2. Open the linked task file for complete implementation details
3. Update task status when starting work (🟡 IN PROGRESS)
4. Submit for review when complete (📝 REVIEW)
5. Mark done after validation (✅ DONE)

### Quality Standards
- All code must pass TypeScript strict mode
- Unit test coverage >90% for critical paths
- Integration tests for all agent interactions
- Load testing for SSE with 50+ concurrent clients
- E2E tests for all user flows

---

**Version History:**
- v1.0.0 (2025-12-22): Initial kanban with generic tasks
- v2.0.0 (2025-12-23): Complete task breakdown with detailed specs
- v3.0.0 (2025-12-23): Individual task file system with comprehensive guides

---

*For detailed implementation guidance, see individual task files in `tasks/` directory.*
