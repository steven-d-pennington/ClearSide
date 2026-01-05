# CLAUDE.md - AI Agent Guide for ClearSide Development

> **Last Updated:** 2026-01-03
> **Version:** 4.0.0

---

## Quick Start: What to Work On

### Current Priority: Phase 4 - Podcast Export Pipeline

Start with **PODCAST-001** in `tasks/phase4/podcast-export/PODCAST-001.md`

| Task | Description | Status | File |
|------|-------------|--------|------|
| PODCAST-001 | Database Schema & Types | Ready | [View](tasks/phase4/podcast-export/PODCAST-001.md) |
| PODCAST-002 | Script Refinement Service | Ready | [View](tasks/phase4/podcast-export/PODCAST-002.md) |
| PODCAST-003 | ElevenLabs TTS Client | Ready | [View](tasks/phase4/podcast-export/PODCAST-003.md) |
| PODCAST-004 | Script Preview & Edit API | Ready | [View](tasks/phase4/podcast-export/PODCAST-004.md) |
| PODCAST-005 | Podcast Generation Pipeline | Ready | [View](tasks/phase4/podcast-export/PODCAST-005.md) |
| PODCAST-006 | Frontend Podcast Export UI | Ready | [View](tasks/phase4/podcast-export/PODCAST-006.md) |

### Alternative Options

| Option | First Task | Description |
|--------|------------|-------------|
| PDF Export | EXPORT-002 | Quick win - text export to PDF |
| Video Export | VIDEO-001 | Remotion video framework setup |
| Multi-LLM | OPENROUTER-001 | Let users choose LLMs per agent |

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
├── CLAUDE.md                 # This file - your guide
├── docs/
│   ├── KANBAN.md             # Task board - CHECK THIS FIRST
│   ├── FUTURE-FEATURES.md    # Feature specifications
│   └── REQUIREMENTS.md       # Product requirements
├── tasks/
│   ├── phase1/               # MVP tasks (complete)
│   ├── phase2/               # Media export tasks
│   └── phase4/               # Podcast export tasks (NEW)
│       └── podcast-export/
│           ├── PODCAST-001.md
│           ├── PODCAST-002.md
│           ├── PODCAST-003.md
│           ├── PODCAST-004.md
│           ├── PODCAST-005.md
│           └── PODCAST-006.md
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
- Informal Discussion Mode
- Human Participation Mode

### In Progress
- Phase 4: Podcast Export Pipeline (0/6 tasks)

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
