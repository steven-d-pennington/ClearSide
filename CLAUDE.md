# CLAUDE.md - Project Guide for AI Assistants

> This document provides context, instructions, and references for AI assistants working on the ClearSide project.

---

## Project Overview

**ClearSide** is an AI-powered structured reasoning and debate engine that helps users think clearly about complex, high-stakes questions.

### Core Concept
- Generates **steel-man arguments** for AND against propositions
- Uses **dual adversarial agents** (Pro Advocate, Con Advocate)
- Provides **neutral moderator synthesis** without picking winners
- Surfaces **explicit assumptions and uncertainties**
- Enables **user challenges** to explore reasoning deeper

### North Star Metric
> **Did the user understand the issue better than when they started?**

### Tagline
> *"Think both sides. Decide with clarity."*

---

## Document Reference Guide

### Primary Documents

| Document | Purpose | When to Reference |
|----------|---------|-------------------|
| `ROADMAP.md` | Master project roadmap, phase overview, agent architecture diagram | Understanding project scope, checking phase priorities |
| `docs/KANBAN.md` | Detailed task tracking, sprint planning, dependencies | Finding specific tasks, checking blockers, updating progress |
| `docs/REQUIREMENTS.md` | Full PRD, user stories, acceptance criteria | Implementing features, validating completeness |

### Specification Documents

| Document | Purpose | When to Reference |
|----------|---------|-------------------|
| `docs/01_product-vision.md` | Mission, target audience, design philosophy | Understanding "why", ensuring alignment with vision |
| `docs/04_json-schema.md` | JSON Schema v1.0.0 specification | Implementing agents, validating outputs, API work |
| `docs/07_iteration-log.md` | Version history, change governance | Recording changes, understanding evolution |

### Source Material

| Document | Purpose |
|----------|---------|
| `Product document creation.pdf` | Original product specification (source of truth) |

---

## Progress Tracking Instructions

### How to Track Progress

1. **Always check `docs/KANBAN.md` first** when starting work
   - Find relevant tasks in the appropriate section
   - Check task dependencies before starting
   - Note any blockers

2. **Update task status** when working:
   - Move tasks from `BACKLOG` → `TO DO` → `IN PROGRESS` → `REVIEW` → `DONE`
   - Add completion dates
   - Note any blockers encountered

3. **Use the TodoWrite tool** during sessions to track immediate work

4. **Update `docs/07_iteration-log.md`** for significant changes:
   - New features implemented
   - Schema changes
   - Breaking changes
   - Architectural decisions

### Task Status Definitions

| Status | Meaning |
|--------|---------|
| 📋 BACKLOG | Planned for future |
| 🟢 TO DO | Ready to be picked up |
| 🟡 IN PROGRESS | Currently being worked on |
| 🔍 REVIEW | Awaiting review/testing |
| ✅ DONE | Completed and verified |
| 🔴 BLOCKED | Cannot proceed |

### Priority Definitions

| Priority | Meaning |
|----------|---------|
| P0 | Critical - Must have for MVP, blocks other work |
| P1 | High - Important for MVP, should be done |
| P2 | Medium - Nice to have, can defer |
| P3 | Low - Future consideration |

---

## Development Guidelines

### Before Starting Any Task

1. **Read the relevant requirements** in `docs/REQUIREMENTS.md`
2. **Check dependencies** in `docs/KANBAN.md`
3. **Review the schema** in `docs/04_json-schema.md` if touching data structures
4. **Understand the agent architecture** in `ROADMAP.md`

### Agent Development Rules

When implementing or modifying agents, remember these **hard rules**:

| Agent | Can Output | Cannot Do |
|-------|------------|-----------|
| **Orchestrator** | `proposition` section only | Add arguments, make judgments |
| **Pro Advocate** | `pro` section only | Rebut con, use straw-man, hedge |
| **Con Advocate** | `con` section only | Trivial objections, emotional dismissals |
| **Moderator** | `moderator` section only | Pick winner, recommend action |
| **Challenge Agent** | `challenges.responses` only | Regenerate full debate |

### Design Principles (Always Follow)

1. **Single-responsibility agents** - Each agent has one job
2. **No final answers** - Never decide or recommend
3. **Explicit assumptions** - Every argument lists premises
4. **Evidence classification** - Facts vs projections vs analogies vs values
5. **Uncertainty preservation** - No false certainty
6. **User autonomy** - Users can challenge everything
7. **Neutral tone** - Professional, non-chatty; clarity over rhetoric

### Code Quality Standards

- Validate all agent outputs against JSON Schema v1.0.0
- Log schema violations for debugging
- Test against flagship demo benchmark
- No straw-man arguments in output
- Moderator must be genuinely neutral

---

## Quick Reference

### MVP Features (Phase 1)

- [ ] Single-question input form with optional context
- [ ] Orchestrator Agent (proposition normalization)
- [ ] Pro Advocate Agent (steel-man FOR)
- [ ] Con Advocate Agent (steel-man AGAINST)
- [ ] Moderator Synthesis Agent
- [ ] JSON Schema v1 implementation
- [ ] Structured output (Markdown + JSON)
- [ ] Challenge Agent (basic)
- [ ] MVP UI (input, output, challenge actions)
- [ ] Prompt contracts & enforcement
- [ ] Schema validation
- [ ] Flagship demo implementation

### Key Schema Sections

```
{
  "meta": { ... },           // Metadata, version, model info
  "proposition": { ... },    // Normalized question + context
  "pro": { ... },            // FOR arguments, assumptions, uncertainties
  "con": { ... },            // AGAINST arguments, assumptions, uncertainties
  "moderator": { ... },      // Synthesis, agreements, disagreements, hinges
  "challenges": { ... }      // User challenges and responses
}
```

### Agent Flow (MVP)

```
User Input
    │
    ▼
Orchestrator ──► Normalizes proposition
    │
    ├──► Pro Advocate ──┐
    │                   │
    └──► Con Advocate ──┤
                        │
                        ▼
                   Moderator ──► Synthesis
                        │
                        ▼
                   Final Output
                        │
                        ▼ (optional)
                   Challenge Agent
```

### Argument Categories

- `economic` - Economic impacts
- `ethical` - Moral considerations
- `technical` - Technical feasibility
- `social` - Social impacts
- `political` - Political implications
- `environmental` - Environmental impacts

### Evidence Types

- `fact` - Verifiable fact
- `projection` - Forecast/prediction
- `analogy` - Historical comparison
- `value_judgment` - Value-based assessment

### Confidence Levels

- `low` - Significant uncertainty
- `medium` - Moderate certainty
- `high` - High certainty

---

## Commit Guidelines

When committing changes to this project:

1. **Use descriptive commit messages** that explain the "why"
2. **Reference task IDs** from the kanban board when applicable
3. **Update documentation** if behavior changes
4. **Update iteration log** for significant changes

### Commit Message Format

```
<type>: <short description>

<longer description if needed>

Task: <TASK-ID>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Testing Requirements

### Flagship Demo Benchmark

The AI Data Center Moratorium debate serves as the quality benchmark. All changes must:

1. Not degrade reasoning quality vs. flagship demo
2. Maintain explicit assumption listing
3. Preserve uncertainty markers
4. Keep moderator neutrality
5. Pass schema validation

### Quality Checklist

Before marking any feature complete:

- [ ] Arguments are steel-man quality (no straw-man)
- [ ] Assumptions are explicit and visible
- [ ] Uncertainties are preserved (not collapsed)
- [ ] Moderator is genuinely neutral
- [ ] Output conforms to JSON Schema v1.0.0
- [ ] No false certainty in outputs

---

## Common Tasks

### Adding a New Feature

1. Check `docs/REQUIREMENTS.md` for acceptance criteria
2. Find/create task in `docs/KANBAN.md`
3. Implement following design principles
4. Validate against schema
5. Test against flagship demo
6. Update documentation
7. Log in `docs/07_iteration-log.md`

### Modifying the Schema

1. Check current schema in `docs/04_json-schema.md`
2. Determine version impact (patch/minor/major)
3. Update schema documentation
4. Update all affected agents
5. Run validation tests
6. Log breaking changes in iteration log

### Updating Agent Prompts

1. Review prompt contracts in source PDF (pages 6-7)
2. Ensure agent stays within its designated output section
3. Maintain steel-man quality requirements
4. Test against flagship demo
5. Version control the prompts

---

## File Structure

```
ClearSide/
├── CLAUDE.md                 # This file - AI assistant guide
├── ROADMAP.md                # Main project roadmap
├── LICENSE
├── .gitignore
├── Product document creation.pdf  # Original specification
└── docs/
    ├── KANBAN.md             # Kanban board & task tracking
    ├── REQUIREMENTS.md       # Full PRD & acceptance criteria
    ├── 01_product-vision.md  # Vision & mission
    ├── 04_json-schema.md     # JSON Schema specification
    └── 07_iteration-log.md   # Version history
```

---

## Questions to Ask Before Implementing

1. **Does this align with the product vision?** (Check `docs/01_product-vision.md`)
2. **What are the acceptance criteria?** (Check `docs/REQUIREMENTS.md`)
3. **Are there dependencies?** (Check `docs/KANBAN.md`)
4. **Does this affect the schema?** (Check `docs/04_json-schema.md`)
5. **How does this impact the flagship demo?** (Benchmark quality)
6. **Does this preserve neutrality and uncertainty?** (Core principles)

---

## Remember

> **ClearSide is a thinking support system, not an opinion generator.**

Every feature, every line of code, every prompt should serve the goal of helping users **understand issues better** - not telling them what to think.

---

*Last Updated: 2025-12-22*
