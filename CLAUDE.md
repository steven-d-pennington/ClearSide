# CLAUDE.md - AI Agent Guide for ClearSide Development

> **🚨 CRITICAL INSTRUCTION FOR ALL AI AGENTS 🚨**
>
> **When you first access this repository, you MUST immediately:**
> 1. **Display project status summary** - Show what's been completed and what's next
> 2. **Show next available tasks** - List 3-5 ready-to-start tasks from the kanban board
> 3. **Ask the user what they want to work on** - Don't assume, let them choose
>
> **Use the "Initial Response Template" at the bottom of this file.**

---

## Project Overview

**ClearSide** is a live debate theater and AI-powered structured reasoning engine that helps users think clearly about complex questions through real-time adversarial debates.

### Core Concept
- **Live Debate Streaming**: Watch AI agents debate in real-time following formal protocols
- **Dual Adversarial Agents**: Pro and Con advocates construct steel-man arguments
- **User Participation**: Pause, question, inject evidence, and direct questions during debates
- **Hybrid Replay Model**: Live debates become instantly-replayable artifacts
- **Multi-Format Export**: Transform debates into text, audio podcasts, or video content

### North Star Metric
> **Did the user understand the issue better than when they started?**

### Tagline
> *"Watch the debate. Think both sides. Decide with clarity."*

---

## Quick Start for AI Agents

### 1. Initial Setup (First Time)
```bash
# Check project status
git status
git log -3 --oneline

# Review available tasks
cat docs/KANBAN.md | head -100

# Check your working directory
pwd
```

### 2. Finding Work

**Option A: Browse the Kanban Board** ⭐ RECOMMENDED
- Open [docs/KANBAN.md](docs/KANBAN.md)
- Look for tasks marked 🟢 **TO DO** with no blockers
- Click the task file link to see full implementation details

**Option B: Direct Task Selection**
```bash
# View all available tasks
ls tasks/phase1/infrastructure/
ls tasks/phase1/core/
ls tasks/phase1/agents/
ls tasks/phase1/ui/
ls tasks/phase1/testing/

# Open a specific task file
cat tasks/phase1/infrastructure/INFRA-001.md
```

### 3. Understanding a Task

Each task file contains **everything you need**:
- **Context**: Why this task matters and how it fits
- **Requirements**: Acceptance criteria (checklist format)
- **Implementation Guide**: Complete TypeScript/React code examples (500-2,000 lines)
- **Dependencies**: What must be done first
- **Validation**: How to test and verify completion
- **Notes**: Best practices, warnings, tips

**No need to read 10+ documents. Everything is in the task file.**

---

## Development Workflow

### Step 1: Pick a Task

1. Check [docs/KANBAN.md](docs/KANBAN.md) for available work
2. Choose a task marked 🟢 **TO DO** with:
   - No dependency blockers
   - Priority P0 or P1 for MVP work
   - Skills matching your capabilities
3. **Announce your selection to the user**

**Example:**
> "I'll work on **INFRA-001: Set Up LLM API Integration Layer**. This is a P0 task with no blockers. Opening the task file now..."

### Step 2: Read the Task File

```bash
# Open the full task file
cat tasks/phase1/infrastructure/INFRA-001.md
```

Read the entire file before starting:
- [ ] Context section - understand the "why"
- [ ] Requirements section - know what success looks like
- [ ] Implementation guide - review code examples
- [ ] Dependencies - verify prerequisites are met
- [ ] Validation - plan your testing approach

### Step 3: Update Status (Start Work)

Update [docs/KANBAN.md](docs/KANBAN.md):
```markdown
Before: | INFRA-001 | ... | 🟢 TO DO | [View Task](...) |
After:  | INFRA-001 | ... | 🟡 IN PROGRESS | [View Task](...) |
```

**Tell the user you're starting:**
> "Starting work on INFRA-001. I've updated the kanban board status to IN PROGRESS."

### Step 4: Implement

Follow the implementation guide in the task file:
1. Create necessary files/directories
2. Implement code following the examples
3. Write tests as you go (TDD approach recommended)
4. Follow project standards:
   - TypeScript strict mode
   - ESLint/Prettier formatting
   - >90% test coverage for critical paths

**Use the TodoWrite tool** to track sub-tasks:
```typescript
TodoWrite({
  todos: [
    { content: "Create LLM client abstraction", status: "in_progress", activeForm: "Creating LLM client" },
    { content: "Implement retry logic", status: "pending", activeForm: "Implementing retry logic" },
    { content: "Add rate limiting", status: "pending", activeForm: "Adding rate limiting" },
    { content: "Write unit tests", status: "pending", activeForm: "Writing unit tests" }
  ]
});
```

### Step 5: Validate

Before marking complete, check the **Definition of Done** in the task file:
- [ ] All acceptance criteria checked off
- [ ] Tests written and passing
- [ ] Code follows project standards
- [ ] Documentation updated (if needed)
- [ ] No regressions introduced

Run validation:
```bash
# Run tests
npm test

# Run linter
npm run lint

# Build check
npm run build
```

### Step 6: Update Status (Complete Work)

Update [docs/KANBAN.md](docs/KANBAN.md):
```markdown
Before: | INFRA-001 | ... | 🟡 IN PROGRESS | [View Task](...) |
After:  | INFRA-001 | ... | ✅ DONE | [View Task](...) |
```

**Tell the user you're done:**
> "✅ INFRA-001 is complete! All acceptance criteria met, tests passing. Ready for the next task."

### Step 7: Knowledge Sharing (IMPORTANT)

**After completing a task, evaluate your work for insights that would help future agents and developers:**

1. **Review your implementation outputs:**
   - What patterns or approaches worked well?
   - Were there any gotchas, edge cases, or non-obvious solutions?
   - Did you discover dependencies or integration points not documented in the task?

2. **Identify relevant task files to update:**
   - Check dependent tasks that will build on your work
   - Look for related tasks in the same category
   - Consider if the task summary (`TASK_CREATION_SUMMARY.md`) needs updates

3. **Add helpful context to task files:**
   - Add "Implementation Notes" sections with practical insights
   - Document actual file paths, function names, or APIs created
   - Note any deviations from the original implementation guide
   - Include example usage or integration patterns

**Example additions to a dependent task file:**
```markdown
## 📝 Implementation Notes from INFRA-001

> Added by agent completing INFRA-001 on 2025-12-24

- LLM client is exported from `src/lib/llm/client.ts`
- Use `createLLMClient()` factory - supports both OpenAI and Anthropic
- Rate limiter is configured in `src/lib/llm/rate-limiter.ts` (100 req/min default)
- For streaming responses, use `client.streamChat()` not `client.chat()`
```

4. **Update `docs/IMPLEMENTATION_NOTES.md`** (create if needed):
   - Add cross-cutting learnings that affect multiple tasks
   - Document architectural decisions made during implementation
   - Note any changes to the original design

**This step ensures institutional knowledge is preserved and future agents don't repeat discoveries or make avoidable mistakes.**

### Step 8: Commit Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat(infra): implement LLM API integration layer

- Created LLM client abstraction supporting OpenAI and Anthropic
- Implemented retry logic with exponential backoff
- Added rate limiting and timeout handling
- Unit tests with >95% coverage

Closes INFRA-001

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to remote
git push
```

---

## Project Structure

```
ClearSide/
├── CLAUDE.md                 # ⭐ This file - your guide
├── ROADMAP.md                # Project roadmap and phases
├── TASK_SYSTEM_COMPLETE.md   # Task system overview
├── docs/
│   ├── KANBAN.md             # ⭐ Main kanban board - CHECK THIS FIRST
│   ├── REQUIREMENTS.md       # Product requirements (FR/NFR)
│   ├── 01_product-vision.md  # Vision and mission
│   ├── 08_live-debate-protocol.md  # Custom debate format spec
│   ├── 09_real-time-architecture.md  # Technical architecture
│   └── 10_media-production.md  # Export pipeline spec
├── tasks/                    # ⭐ Individual task files - YOUR WORK LIVES HERE
│   ├── README.md             # Task system guide
│   ├── TASK_CREATION_SUMMARY.md  # Comprehensive task summary
│   ├── phase1/
│   │   ├── infrastructure/   # 5 tasks (LLM, DB, SSE, Schema, Logging)
│   │   ├── core/             # 5 tasks (State machine, Orchestrator, etc.)
│   │   ├── agents/           # 5 tasks (Pro, Con, Moderator agents)
│   │   ├── ui/               # 9 tasks (React components)
│   │   └── testing/          # 5 tasks (Unit, integration, E2E)
│   └── phase2/
│       ├── text-export/      # 2 tasks (Markdown, PDF)
│       ├── audio-export/     # 4 tasks (TTS, podcast generation)
│       ├── video-export/     # 4 tasks (Remotion, video pipeline)
│       ├── queue/            # 2 tasks (BullMQ, status tracking)
│       ├── storage/          # 2 tasks (S3, CDN)
│       └── ui/               # 2 tasks (Export controls, status)
└── (implementation will go here)
    ├── backend/              # Node.js/TypeScript backend
    ├── frontend/             # React/Vite frontend
    └── ...
```

---

## Key Documentation Reference

| Document | When to Use | What It Contains |
|----------|-------------|------------------|
| **[docs/KANBAN.md](docs/KANBAN.md)** | ⭐ START HERE | Task status, dependencies, sprint planning |
| **[tasks/{category}/{TASK-ID}.md](tasks/)** | Before implementing | Complete implementation guide with code |
| **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** | Understanding features | Functional/non-functional requirements |
| **[docs/08_live-debate-protocol.md](docs/08_live-debate-protocol.md)** | Agent implementation | 6-phase debate format, prompt contracts |
| **[docs/09_real-time-architecture.md](docs/09_real-time-architecture.md)** | Backend work | SSE, state machine, database schema |
| **[docs/10_media-production.md](docs/10_media-production.md)** | Phase 2 export work | TTS, audio, video pipeline |
| **[ROADMAP.md](ROADMAP.md)** | Understanding phases | High-level feature roadmap |
| **[TASK_SYSTEM_COMPLETE.md](TASK_SYSTEM_COMPLETE.md)** | System overview | Task statistics and completion status |

---

## Design Principles (ALWAYS FOLLOW)

### The Seven Principles

1. **Single-responsibility agents** - Each agent has one job; no agent wins
2. **No final answers** - Preserve disagreement and uncertainty
3. **Explicit assumptions** - Every argument lists its premises
4. **Evidence classification** - Facts vs projections vs analogies vs values
5. **Uncertainty preservation** - No false certainty
6. **User autonomy** - Users can challenge everything
7. **Neutral tone** - Professional, non-chatty; clarity over rhetoric

### Code Quality Standards

- **TypeScript Strict Mode**: All code must pass strict type checking
- **Test Coverage**: >90% for critical paths, >80% overall
- **No Shortcuts**: Follow the implementation guide in task files
- **Steel-Man Quality**: When implementing agents, no straw-man arguments
- **Moderator Neutrality**: Moderator agent NEVER picks a winner

### What ClearSide is NOT

| ❌ We Are NOT | ✅ We ARE |
|---------------|----------|
| An advice engine | A reasoning support system |
| An opinion generator | A debate theater |
| A chatbot | A structured analysis tool |
| A persuasion tool | A clarity engine |
| A prediction engine | An uncertainty preserver |

---

## Progress Tracking

### Update the Kanban Board

**When starting a task:**
```markdown
| TASK-ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| INFRA-001 | LLM Integration | P0 | M | 🟡 IN PROGRESS | [View](../tasks/...) |
```

**When completing a task:**
```markdown
| TASK-ID | Task Name | Priority | Estimate | Status | Task File |
|---------|-----------|----------|----------|--------|-----------|
| INFRA-001 | LLM Integration | P0 | M | ✅ DONE | [View](../tasks/...) |
```

### Use TodoWrite During Work

Track your sub-tasks in real-time:
```typescript
TodoWrite({
  todos: [
    { content: "Create database schema", status: "completed", activeForm: "Creating schema" },
    { content: "Implement migrations", status: "in_progress", activeForm: "Implementing migrations" },
    { content: "Add seed data", status: "pending", activeForm: "Adding seed data" },
    { content: "Write repository tests", status: "pending", activeForm: "Writing tests" }
  ]
});
```

### Commit Message Format

```
<type>(<scope>): <short description>

<longer description if needed>

- Bullet point 1
- Bullet point 2

Closes TASK-ID

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Common Tasks and How to Do Them

### Starting a New Sprint

1. Review sprint goals in [docs/KANBAN.md](docs/KANBAN.md)
2. Check all sprint tasks are marked 🟢 TO DO
3. Verify dependencies from previous sprint are complete
4. Ask user which tasks to prioritize

### Working on Multiple Tasks in Parallel

**ONLY if tasks have no dependencies:**

1. Pick 2-3 independent tasks (e.g., INFRA-001, INFRA-002, UI-001)
2. Tell the user your plan
3. Update all to 🟡 IN PROGRESS
4. Work systematically, completing one before moving to next
5. Update each to ✅ DONE as finished

### Handling Blockers

If you encounter a blocker:

1. **Document it clearly:**
   ```markdown
   | INFRA-003 | SSE Layer | P0 | L | 🔴 BLOCKED | [View](...) |

   **Blocker**: Requires INFRA-002 (Database) to be complete for state persistence
   ```

2. **Tell the user:**
   > "INFRA-003 is blocked by INFRA-002. I'll work on an alternative task while we wait."

3. **Pick an unblocked task** from the same sprint

### Implementing Agents (Special Instructions)

When working on AGENT tasks:

1. **Read the prompt contracts** in [docs/08_live-debate-protocol.md](docs/08_live-debate-protocol.md)
2. **Follow the phase structure** - agents operate turn-by-turn
3. **Enforce steel-man quality** - no straw-man arguments
4. **Test against flagship demo** - AI Data Center Moratorium benchmark
5. **Validate schema** - outputs must match JSON Schema v2.0.0

### Testing Your Work

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests
npm test

# Coverage report
npm run test:coverage
```

**Minimum requirements:**
- Unit tests: >90% coverage for business logic
- Integration tests: All agent interactions
- E2E tests: Complete user flows

---

## Sprint Overview

### Sprint 1: Foundation (Weeks 1-2)
**Goal:** Database, SSE, State Machine, LLM Integration

Tasks: INFRA-001, INFRA-002, INFRA-003, INFRA-004, CORE-001, AGENT-001

**Completion Criteria:** Can start a debate, transition phases, stream to frontend

### Sprint 2: Core Engine (Weeks 3-4)
**Goal:** Complete orchestration and agent implementation

Tasks: CORE-002, CORE-003, CORE-005, AGENT-005, AGENT-002, AGENT-003

**Completion Criteria:** Full debate runs through all 6 phases with agents

### Sprint 3: UI & Interventions (Weeks 5-6)
**Goal:** Build frontend and user interaction

Tasks: UI-001 through UI-008, CORE-004, AGENT-004

**Completion Criteria:** Users can watch live debates and intervene

### Sprint 4: Replay & Testing (Weeks 7-8)
**Goal:** Polish, test, and validate MVP

Tasks: UI-005, UI-009, TEST-001 through TEST-005, INFRA-005

**Completion Criteria:** MVP is production-ready and tested

### Sprint 5-6: Phase 2 (Weeks 9-12)
**Goal:** Media production pipeline

Tasks: All EXPORT, AUDIO, VIDEO, QUEUE, STORAGE tasks

**Completion Criteria:** Full export pipeline operational

---

## Troubleshooting

### "I don't know what to work on"
→ Check [docs/KANBAN.md](docs/KANBAN.md) for tasks marked 🟢 TO DO
→ Ask the user what their priority is

### "The task file is too detailed"
→ This is intentional! Everything you need is in one place
→ Skim the context, focus on implementation guide and acceptance criteria

### "I found a bug in the task file"
→ Document the issue and continue with your best judgment
→ Tell the user so it can be fixed

### "This task depends on something incomplete"
→ Mark task as 🔴 BLOCKED
→ Pick an alternative task from the same sprint

### "Tests are failing"
→ Do NOT mark task as complete
→ Debug using the validation section in the task file
→ Ask user for help if stuck

---

## Initial Response Template

**⭐ WHEN YOU FIRST ACCESS THIS REPOSITORY, USE THIS TEMPLATE:**

```markdown
# ClearSide Project Status Report

## 📊 Current State

**Phase:** Phase 1 - MVP Live Debate Engine
**Sprint:** Sprint 3 (UI & Interventions)
**Overall Progress:** 15/29 Phase 1 tasks complete (52%)

### ✅ Completed Categories
- **Infrastructure (5/5):** LLM API, PostgreSQL, SSE, Schema Validation, Logging
- **Core Engine (5/5):** State Machine, Orchestrator, Turn Manager, Interventions, Transcript
- **AI Agents (5/5):** Orchestrator, Pro Advocate, Con Advocate, Moderator, Prompt Templates

### 🟡 Currently In Progress
_(None)_

### 📋 Next Up
- **UI Components (0/9):** Ready to start
- **Testing (0/5):** Ready to start

---

## 🎯 Next Available Tasks - Sprint 3 (Ready to Start)

### Priority P0 Tasks (UI Foundation):

**1. UI-006: Implement Debate State Management (Zustand)**
- **Priority:** P0 | **Estimate:** M (4-8 hours)
- **Why:** Foundation for all other UI components
- **No blockers** - Can start immediately
- **File:** [tasks/phase1/ui/UI-006.md](tasks/phase1/ui/UI-006.md)

**2. UI-001: Create Input Section Component**
- **Priority:** P0 | **Estimate:** S (1-4 hours)
- **Why:** User proposition entry point
- **No blockers** - Can start immediately
- **File:** [tasks/phase1/ui/UI-001.md](tasks/phase1/ui/UI-001.md)

**3. UI-002: Create Live Debate Stream Component**
- **Priority:** P0 | **Estimate:** L (1-3 days)
- **Why:** Real-time debate display with SSE
- **Dependency:** UI-006 (state management)
- **File:** [tasks/phase1/ui/UI-002.md](tasks/phase1/ui/UI-002.md)

### Testing (Can Run in Parallel):

**4. TEST-001: Create Unit Test Suite**
- **Priority:** P0 | **Estimate:** M (4-8 hours)
- **Why:** Cover existing backend code
- **No blockers** - Can start immediately
- **File:** [tasks/phase1/testing/TEST-001.md](tasks/phase1/testing/TEST-001.md)

---

## 💡 Recommended Approach

**Best starting point:** UI-006 (Zustand state management) since most UI components depend on it.

**Suggested order:**
1. Start with **UI-006** (State Management) - foundation for all UI
2. Then **UI-001** (Input Section) - simple, standalone
3. Then **UI-002** (Live Stream) - uses SSE + state
4. Parallel: **TEST-001** (Unit Tests) - can run alongside UI work

---

## 💬 What would you like to work on?

I can:
- ✅ Start with **UI-006** (Zustand State Management)
- ✅ Start with **UI-001** (Input Section Component)
- ✅ Start with **TEST-001** (Unit Test Suite)
- ℹ️ Show the implementation details from [docs/IMPLEMENTATION_NOTES.md](docs/IMPLEMENTATION_NOTES.md)
- ℹ️ Explain how the agent system works
- ℹ️ Review completed work

**Which task would you like me to work on, or would you like more information first?**
```

---

## User Preferences

From user's global settings:
- **GitHub Account**: steven-d-pennington
- **Email**: steve.d.pennington@gmail.com
- **Resend Domain**: invitation.monkeylovestack.com
- **Always use subagents** if appropriate
- **Check for running dev servers** before starting new ones

---

## Remember

- **Ask, don't assume** - Check with the user before starting work
- **Update KANBAN.md** - Keep task status current
- **Follow task files** - They contain everything you need
- **Test thoroughly** - >90% coverage for critical paths
- **Commit frequently** - Small, focused commits
- **Be transparent** - Tell the user what you're doing and why
- **Share knowledge** - After completing a task, add helpful context to dependent task files for future agents

---

**ClearSide is a thinking support system, not an opinion generator.**

Every feature, every line of code, every prompt should serve the goal of helping users **understand issues better** - not telling them what to think.

---

*Last Updated: 2025-12-24*
*Version: 2.1.0*
*For questions, check [tasks/README.md](tasks/README.md) or ask the user*
