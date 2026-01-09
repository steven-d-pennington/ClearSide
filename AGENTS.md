# AGENTS.md - AI Agent Guide for ClearSide Development

> **Last Updated:** 2026-01-08
> **Version:** 5.0.0

---

## Quick Start: What to Work On

### Current Priority: Phase 6 - Conversational Podcast Mode

Free-form podcast conversations where 2-6 AI personas discuss topics in a natural, talk show format with a host.

Start with **CONV-001** in `tasks/phase6/conversational-podcast/CONV-001.md`

| Task | Description | Status | File |
|------|-------------|--------|------|
| CONV-001 | Database Migration | Ready | [View](tasks/phase6/conversational-podcast/CONV-001.md) |
| CONV-002 | TypeScript Types | Ready | [View](tasks/phase6/conversational-podcast/CONV-002.md) |
| CONV-003 | Persona Repository | Ready | [View](tasks/phase6/conversational-podcast/CONV-003.md) |
| CONV-004 | Session Repositories | Ready | [View](tasks/phase6/conversational-podcast/CONV-004.md) |
| CONV-005 | PersonaAgent Class | Ready | [View](tasks/phase6/conversational-podcast/CONV-005.md) |
| CONV-006 | ContextBoardService | Ready | [View](tasks/phase6/conversational-podcast/CONV-006.md) |
| CONV-007 | PodcastHostAgent | Ready | [View](tasks/phase6/conversational-podcast/CONV-007.md) |
| CONV-008 | ConversationalOrchestrator | Ready | [View](tasks/phase6/conversational-podcast/CONV-008.md) |

**Critical Path:** CONV-001 → CONV-002 → CONV-005 → CONV-007 → CONV-008 → CONV-019

**Full task list:** 22 tasks (CONV-001 through CONV-022) - See [docs/KANBAN.md](docs/KANBAN.md)

### Key Concepts

- **12 Personas**: Distinct characters with backstories, speaking styles, worldviews
- **Talk Show Host**: Introduces guests, asks probing questions, steers discussion (NOT a debate moderator)
- **Hybrid Flow**: Host steers, but participants can signal desire to speak
- **Context Board**: Real-time whiteboard tracking topics, claims, agreements
- **Native Export**: Podcast export preserves talk show format (not converted to debate)

### Alternative Options

| Option | First Task | Description |
|--------|------------|-------------|
| Duelogic Research | DUELOGIC-001 | Automated research & episode generation |
| PDF Export | EXPORT-002 | Quick win - text export to PDF |
| Video Export | VIDEO-001 | Remotion video framework setup |

**Full task board:** [docs/KANBAN.md](docs/KANBAN.md)

---

## Project Overview

**ClearSide** is a live debate theater and AI-powered structured reasoning engine.

### What It Does
- Live AI debates with Pro and Con advocates following formal protocols
- User participation: pause, question, inject evidence, direct questions
- Export debates as text, audio podcasts, or video content

### North Star
> **Did the user understand the issue better than when they started?**

---

## How to Work on Tasks

### 1. Pick a Task

Open [docs/KANBAN.md](docs/KANBAN.md) and find a task marked **Ready**. Each task file contains everything you need:

- Full context and requirements
- Implementation guide with code examples
- Dependencies and validation steps
- Test cases

### 2. Update Status

When starting:
```markdown
| PODCAST-001 | ... | Ready → In Progress |
```

When done:
```markdown
| PODCAST-001 | ... | In Progress → Done |
```

### 3. Implement

Follow the implementation guide in the task file. Use TodoWrite to track sub-tasks:

```typescript
TodoWrite({
  todos: [
    { content: "Create types", status: "in_progress", activeForm: "Creating types" },
    { content: "Write migration", status: "pending", activeForm: "Writing migration" },
    { content: "Implement repository", status: "pending", activeForm: "Implementing repository" },
    { content: "Write tests", status: "pending", activeForm: "Writing tests" }
  ]
});
```

### 4. Validate

Before marking complete:
- All acceptance criteria met
- Tests passing
- TypeScript strict mode passes
- No regressions

### 5. Commit

```bash
git add .
git commit -m "feat(podcast): implement database schema for podcast export

- Added podcast_export_jobs table
- Created TypeScript types for podcast export
- Implemented PodcastExportRepository
- Unit tests with >90% coverage

Closes PODCAST-001

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Project Structure

```
ClearSide/
├── CLAUDE.md                 # Main guide for Claude Code
├── AGENTS.md                 # This file - your guide
├── docs/
│   ├── KANBAN.md             # Task board - CHECK THIS FIRST
│   ├── FUTURE-FEATURES.md    # Feature specifications
│   └── REQUIREMENTS.md       # Product requirements
├── tasks/
│   ├── phase1/               # MVP tasks (complete)
│   ├── phase2/               # Media export tasks
│   ├── phase4/               # Podcast export tasks (complete)
│   │   └── podcast-export/
│   ├── phase5/               # Duelogic Research tasks (complete)
│   │   └── duelogic-research/
│   └── phase6/               # Conversational Podcast (CURRENT)
│       └── conversational-podcast/
│           ├── CONV-001.md      # Database Migration
│           ├── CONV-002.md      # TypeScript Types
│           ├── CONV-003.md      # Persona Repository
│           ├── CONV-004.md      # Session Repositories
│           ├── CONV-005.md      # PersonaAgent Class
│           ├── CONV-006.md      # ContextBoardService
│           ├── CONV-007.md      # PodcastHostAgent
│           ├── CONV-008.md      # ConversationalOrchestrator
│           ├── CONV-009.md      # Persona and Session Routes
│           ├── CONV-010.md      # Control and Streaming Routes
│           ├── CONV-011.md      # SSE Manager Integration
│           ├── CONV-012.md      # ConversationConfigModal
│           ├── CONV-013.md      # ConversationViewer
│           ├── CONV-014.md      # TranscriptPanel
│           ├── CONV-015.md      # ContextBoardPanel
│           ├── CONV-016.md      # ControlBar
│           ├── CONV-017.md      # Entry from Proposals
│           ├── CONV-018.md      # Entry from Main Screen
│           ├── CONV-019.md      # Podcast Export (Native)
│           ├── CONV-020.md      # RAG Integration
│           ├── CONV-021.md      # Vector Indexing
│           └── CONV-022.md      # Testing & Refinement
├── backend/                  # Node.js/TypeScript backend
└── frontend/                 # React/Vite frontend
```

---

## Design Principles

1. **Single-responsibility agents** - Each agent has one job; no agent wins
2. **No final answers** - Preserve disagreement and uncertainty
3. **Explicit assumptions** - Every argument lists its premises
4. **Evidence classification** - Facts vs projections vs analogies vs values
5. **Uncertainty preservation** - No false certainty
6. **User autonomy** - Users can challenge everything
7. **Neutral tone** - Professional, non-chatty; clarity over rhetoric

### Code Quality Standards

- TypeScript strict mode
- Test coverage >90% for critical paths
- No straw-man arguments in agent prompts
- Moderator agent NEVER picks a winner

---

## Key Documentation

| Document | Purpose |
|----------|---------|
| [docs/KANBAN.md](docs/KANBAN.md) | Task status and dependencies |
| [docs/FUTURE-FEATURES.md](docs/FUTURE-FEATURES.md) | Feature specifications |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Product requirements |
| [docs/08_live-debate-protocol.md](docs/08_live-debate-protocol.md) | 6-phase debate format |
| [docs/09_real-time-architecture.md](docs/09_real-time-architecture.md) | Technical architecture |

---

## Project Status

### Complete
- Phase 1: Live Debate Engine (36/36 tasks)
- Phase 2 Audio: ElevenLabs TTS, podcast generation
- Phase 4: Podcast Export Pipeline (6/6 tasks)
- Phase 5: Duelogic Research & RAG Integration (7/7 tasks)
- Informal Discussion Mode
- Human Participation Mode

### In Progress
- Phase 6: Conversational Podcast Mode (0/22 tasks)

### Planned
- Phase 2 Video: Remotion video export
- Phase 3: OpenRouter multi-LLM debates

---

## User Preferences

- **GitHub:** steven-d-pennington
- **Email:** steve.d.pennington@gmail.com
- Always use subagents if appropriate
- Check for running dev servers before starting new ones

---

## Remember

- **Ask, don't assume** - Check with the user before starting work
- **Update KANBAN.md** - Keep task status current
- **Follow task files** - They contain everything you need
- **Test thoroughly** - >90% coverage for critical paths
- **Be transparent** - Tell the user what you're doing and why

---

**ClearSide is a thinking support system, not an opinion generator.**

Every feature should help users understand issues better - not tell them what to think.
