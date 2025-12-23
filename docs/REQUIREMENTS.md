# ClearSide Product Requirements Document (PRD)

> Version: 2.0.0
> Last Updated: 2025-12-23
> Major Update: Live Debate Theater Architecture

---

## Executive Summary

ClearSide is a **live debate theater** and AI-powered structured reasoning engine that helps users think clearly about complex, high-stakes questions. Users watch AI agents debate in real-time following formal protocols, participate actively through questions and interventions, and export complete debates as text transcripts, audio podcasts, or video content. Rather than producing single answers, ClearSide orchestrates adversarial dialogue that surfaces assumptions, uncertainties, and decision hinges through transparent reasoning.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Stories](#2-user-stories)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Agent Requirements](#5-agent-requirements)
6. [Schema Requirements](#6-schema-requirements)
7. [UI/UX Requirements](#7-uiux-requirements)
8. [Acceptance Criteria](#8-acceptance-criteria)

---

## 1. Product Overview

### 1.1 Problem Statement

Modern decision-making is overwhelmed by opinions but underserved in structured reasoning. Most AI tools:
- Collapse complex questions into single answers
- Hide assumptions and value judgments
- Overstate certainty
- Reward rhetorical dominance over clarity

This leads to:
- Poorly understood trade-offs
- False confidence in AI outputs
- Shallow debate
- Decision fatigue

### 1.2 Solution

ClearSide orchestrates adversarial reasoning through live debate theater by:
- **Real-time debate streaming**: Agents debate following formal protocols with visible turn-taking
- **Dual steel-man arguments**: Pro and Con advocates construct strongest cases (for AND against)
- **User participation**: Pause debates, ask questions, inject evidence, request clarifications
- **Neutral moderation**: Final synthesis without picking winners
- **Explicit assumption surfacing**: All premises made visible and challengeable
- **Hybrid replay model**: Live debates become instantly-replayable artifacts
- **Multi-format export**: Text transcripts, audio podcasts, video debates

### 1.3 Success Metric (North Star)

> **Did the user understand the issue better than when they started?**

ClearSide measures success by clarity and understanding, not clicks or final answers.

### 1.4 Target Audience

| Segment | Description | Example Use Cases |
|---------|-------------|-------------------|
| Civic & Policy Analysts | Policy researchers, government staff, journalists | AI regulation, climate policy, healthcare debates |
| Professional Decision Makers | Engineers, product managers, executives | Build vs buy, architecture decisions, risk assessment |
| Individual Users | People facing major life decisions | Career changes, major purchases, lifestyle choices |

---

## 2. User Stories

### 2.1 MVP User Stories

#### US-001: Submit a Question
**As a** user
**I want to** enter a complex question or claim
**So that** I can explore both sides of the issue

**Acceptance Criteria:**
- [ ] User can type a question up to 500 characters
- [ ] Input field is prominently displayed
- [ ] Clear placeholder text guides users
- [ ] Form validates non-empty input before submission

#### US-002: Provide Context
**As a** user
**I want to** optionally provide context (geography, timeframe, domain)
**So that** the debate is appropriately scoped

**Acceptance Criteria:**
- [ ] Context input is collapsible/optional
- [ ] Context fields include: geography, timeframe, domain
- [ ] Context is reflected in the proposition normalization

#### US-003: Start Live Debate
**As a** user
**I want to** click a button to start a live debate
**So that** I can watch AI agents debate the question in real-time

**Acceptance Criteria:**
- [ ] "Start Debate" button is clearly labeled
- [ ] Debate begins streaming immediately after click
- [ ] Current phase is clearly displayed (e.g., "Opening Statements")
- [ ] Current speaker is visually indicated
- [ ] Utterances appear in real-time as agents speak
- [ ] Estimated time remaining is shown
- [ ] Error states are handled gracefully

#### US-004: Watch Debate Unfold
**As a** user
**I want to** see the debate unfold in real-time with clear speaker identification
**So that** I can follow the argumentation as it develops

**Acceptance Criteria:**
- [ ] Pro Advocate utterances are visually distinct (green/blue theme)
- [ ] Con Advocate utterances are visually distinct (red/orange theme)
- [ ] Moderator utterances are visually neutral (gray theme)
- [ ] Timestamps are visible for each utterance
- [ ] Phase transitions are clearly marked
- [ ] Speaker name/role is displayed with each statement
- [ ] Debate scrolls automatically to show latest content

#### US-005: Navigate Debate Timeline
**As a** user
**I want to** navigate through the debate using a timeline scrubber
**So that** I can jump to specific moments or phases

**Acceptance Criteria:**
- [ ] Timeline scrubber shows full debate duration
- [ ] Phase markers are visible on timeline
- [ ] User can click/drag to jump to any point
- [ ] Current playback position is clearly indicated
- [ ] Hovering shows preview of content at that timestamp
- [ ] Works for both live (completed portion) and replay modes

#### US-006: Pause Debate and Ask Questions
**As a** user
**I want to** pause the debate at any time and ask questions
**So that** I can clarify confusing points or explore specific claims

**Acceptance Criteria:**
- [ ] "Pause" button is prominently accessible during live debate
- [ ] Debate immediately halts when paused
- [ ] Question input field appears
- [ ] User can direct question to specific agent (Pro, Con, or Moderator)
- [ ] Agent responds to question inline
- [ ] User can resume debate after question is answered
- [ ] Intervention is recorded in transcript with timestamp

#### US-007: Request Clarification in Real-Time
**As a** user
**I want to** flag confusing statements and get clarification without pausing
**So that** I can understand complex points without disrupting debate flow

**Acceptance Criteria:**
- [ ] "Request Clarification" button available on each utterance
- [ ] Clarification request is queued and addressed at next phase break
- [ ] Agent provides clarification inline
- [ ] Clarification is marked as such in transcript
- [ ] User is notified when clarification is ready

#### US-008: Inject Evidence or Context
**As a** user
**I want to** introduce new evidence or context during the debate
**So that** agents can incorporate it into their reasoning

**Acceptance Criteria:**
- [ ] "Add Evidence" button is accessible during debate
- [ ] User can provide text evidence/context
- [ ] Evidence is presented to both advocates
- [ ] Agents acknowledge and incorporate (or explain why not)
- [ ] Injection is recorded in transcript

#### US-009: View Complete Transcript
**As a** user
**I want to** view the complete debate transcript with all interventions
**So that** I can review the full discussion

**Acceptance Criteria:**
- [ ] Transcript view is accessible during and after debate
- [ ] Shows all utterances in chronological order
- [ ] Includes timestamps for each statement
- [ ] Marks phase transitions clearly
- [ ] Highlights user interventions
- [ ] Distinguishes speakers with colors/icons
- [ ] Expandable/collapsible by phase

#### US-010: Replay Completed Debate
**As a** user
**I want to** instantly replay a completed debate
**So that** I can review it at my own pace

**Acceptance Criteria:**
- [ ] Completed debates load instantly (no regeneration)
- [ ] Timeline scrubber allows jumping to any point
- [ ] Play/pause controls available
- [ ] Playback speed adjustable (1x, 1.5x, 2x)
- [ ] Can skip to specific phases
- [ ] All interventions preserved in replay

---

### 2.2 Phase 2 User Stories (Media Production)

#### US-011: Export Text Transcript
**As a** user
**I want to** export the debate as a formatted text transcript
**So that** I can read or share it offline

**Acceptance Criteria:**
- [ ] Export button accessible after debate completes
- [ ] Markdown format option available
- [ ] PDF format option available
- [ ] Includes all timestamps and phase markers
- [ ] Includes user interventions
- [ ] Downloadable file with debate title as filename

#### US-012: Export as Audio Podcast
**As a** user
**I want to** export the debate as an MP3 audio file
**So that** I can listen to it like a podcast

**Acceptance Criteria:**
- [ ] "Generate Podcast" button triggers export
- [ ] Each agent has a distinct TTS voice
- [ ] Audio includes chapter markers for phases
- [ ] Background music/transitions between phases
- [ ] User interventions narrated or marked with audio cue
- [ ] Export queue shows progress
- [ ] Download link provided when complete

#### US-013: Export as Video
**As a** user
**I want to** export the debate as a video file
**So that** I can share it on YouTube or social media

**Acceptance Criteria:**
- [ ] "Generate Video" button triggers export
- [ ] Visual debate stage with speaker indicators
- [ ] Subtitles/captions for all dialogue
- [ ] Phase transitions visually marked
- [ ] Evidence/key points highlighted visually
- [ ] Export queue shows progress (videos take longer)
- [ ] Download link provided when complete
- [ ] MP4 format, web-optimized

#### US-014: Save Debate to Library
**As a** user
**I want to** save a debate to my personal library
**So that** I can organize and revisit debates later

**Acceptance Criteria:**
- [ ] "Save to Library" button available (Phase 3)
- [ ] User can add tags/notes
- [ ] Debates organized by date
- [ ] Search/filter capability
- [ ] Quick access to exports

#### US-015: Share Debate Link
**As a** user
**I want to** share a debate via public or private link
**So that** others can view it

**Acceptance Criteria:**
- [ ] "Share" button generates shareable link (Phase 3)
- [ ] Option to make public or private
- [ ] Shared debates are read-only
- [ ] Recipients can replay debate with timeline
- [ ] Embed code available for blogs/websites

---

## 3. Functional Requirements

### 3.1 Topic Intake (FR-100)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-101 | System SHALL accept text input for questions/claims | P0 |
| FR-102 | System SHALL accept optional context (geography, timeframe, domain) | P0 |
| FR-103 | System SHALL normalize input into a neutral proposition | P0 |
| FR-104 | System SHALL extract and store context metadata | P1 |
| FR-105 | System SHALL validate input is non-empty | P0 |
| FR-106 | System SHALL limit input to 500 characters | P1 |

### 3.2 Live Debate Engine (FR-200)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-201 | System SHALL initialize debate state machine with 6 phases | P0 |
| FR-202 | System SHALL manage turn-based dialogue between agents | P0 |
| FR-203 | System SHALL stream debate utterances in real-time via SSE | P0 |
| FR-204 | System SHALL display current phase and speaker at all times | P0 |
| FR-205 | System SHALL track elapsed time and estimate remaining time | P0 |
| FR-206 | System SHALL enforce phase transition rules (automatic progression) | P0 |
| FR-207 | System SHALL record all utterances with precise timestamps | P0 |
| FR-208 | System SHALL maintain debate state persistence in database | P0 |
| FR-209 | System SHALL handle agent failures gracefully with retry logic | P0 |
| FR-210 | System SHALL support pause/resume functionality | P0 |

### 3.3 Debate Protocol (FR-250)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-251 | System SHALL implement 6-phase debate protocol (opening, constructive, cross-exam, rebuttal, closing, synthesis) | P0 |
| FR-252 | Each phase SHALL have defined time allocations per speaker | P0 |
| FR-253 | Cross-examination phase SHALL alternate between Pro and Con | P0 |
| FR-254 | Rebuttal phase SHALL allow agents to address opposing arguments | P0 |
| FR-255 | Moderator synthesis SHALL occur only in final phase | P0 |
| FR-256 | Phase transitions SHALL be marked visually and in transcript | P0 |

### 3.4 User Intervention System (FR-300)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-301 | System SHALL allow users to pause debate at any point | P0 |
| FR-302 | System SHALL accept user questions during pause | P0 |
| FR-303 | System SHALL allow users to direct questions to specific agents | P0 |
| FR-304 | System SHALL queue clarification requests for next phase break | P0 |
| FR-305 | System SHALL allow users to inject evidence/context during debate | P0 |
| FR-306 | Agents SHALL acknowledge and respond to user interventions | P0 |
| FR-307 | All interventions SHALL be recorded in transcript with timestamps | P0 |
| FR-308 | System SHALL resume debate from exact pause point | P0 |

### 3.5 Transcript & Replay (FR-350)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-351 | System SHALL generate structured JSON transcript (schema v2.0.0) | P0 |
| FR-352 | Transcript SHALL include all utterances, phases, and interventions | P0 |
| FR-353 | Completed debates SHALL load instantly without regeneration | P0 |
| FR-354 | System SHALL provide timeline scrubber for navigation | P0 |
| FR-355 | Users SHALL be able to jump to any timestamp or phase | P0 |
| FR-356 | Replay SHALL support playback speed adjustment (1x, 1.5x, 2x) | P0 |
| FR-357 | Timeline SHALL display phase markers visually | P0 |

### 3.6 Argument Structure (FR-400)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-401 | Arguments SHALL be organized by category (economic, ethical, technical, social) | P0 |
| FR-402 | Arguments SHALL include explicit assumptions | P0 |
| FR-403 | Arguments SHALL include evidence type classification | P0 |
| FR-404 | Arguments SHALL include confidence levels | P0 |
| FR-405 | Arguments SHALL include uncertainties | P0 |
| FR-406 | Pro arguments SHALL present steel-man case FOR proposition | P0 |
| FR-407 | Con arguments SHALL present steel-man case AGAINST proposition | P0 |
| FR-408 | All arguments SHALL be steel-man quality (no straw-man) | P0 |

### 3.7 Moderator Synthesis (FR-450)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-451 | Moderator SHALL identify areas of agreement | P0 |
| FR-452 | Moderator SHALL identify core disagreements | P0 |
| FR-453 | Moderator SHALL identify assumption conflicts | P0 |
| FR-454 | Moderator SHALL identify evidence gaps | P0 |
| FR-455 | Moderator SHALL identify decision hinges | P0 |
| FR-456 | Moderator SHALL NOT pick a winner | P0 |
| FR-457 | Moderator SHALL NOT recommend action | P0 |
| FR-458 | Moderator synthesis SHALL occur in final debate phase | P0 |

### 3.8 Export & Media Production (FR-500) - Phase 2

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-501 | System SHALL export transcript as Markdown format | P0 |
| FR-502 | System SHALL export transcript as PDF format | P1 |
| FR-503 | System SHALL integrate TTS API for voice synthesis | P0 |
| FR-504 | Each agent SHALL have distinct TTS voice profile | P0 |
| FR-505 | System SHALL generate MP3 audio with chapter markers | P0 |
| FR-506 | System SHALL generate MP4 video with visual stage | P1 |
| FR-507 | Video SHALL include subtitles/captions | P1 |
| FR-508 | System SHALL implement background export queue | P1 |
| FR-509 | Export progress SHALL be visible to user | P1 |
| FR-510 | Completed exports SHALL be downloadable via link | P0 |
| FR-511 | System SHALL store media files in blob storage (S3/equivalent) | P1 |

---

## 4. Non-Functional Requirements

### 4.1 Performance (NFR-100)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-101 | Live debate total runtime | 25-30 minutes (protocol dependent) |
| NFR-102 | Streaming latency (utterance to UI) | < 500ms |
| NFR-103 | UI responsiveness | < 100ms interaction feedback |
| NFR-104 | Page load time | < 3 seconds |
| NFR-105 | Pause/resume response time | < 1 second |
| NFR-106 | User intervention response time | < 10 seconds |
| NFR-107 | Replay debate load time | < 2 seconds |
| NFR-108 | Timeline scrubber seek time | < 200ms |
| NFR-109 | Text export generation | < 5 seconds |
| NFR-110 | Audio export generation | < 2 minutes (Phase 2) |
| NFR-111 | Video export generation | < 10 minutes (Phase 2) |

### 4.2 Reliability (NFR-200)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-201 | System availability | 99.9% uptime |
| NFR-202 | Error rate | < 1% of requests |
| NFR-203 | Graceful degradation | Yes |
| NFR-204 | Error recovery | Automatic retry with feedback |

### 4.3 Scalability (NFR-300)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-301 | Concurrent users (MVP) | 100 |
| NFR-302 | Concurrent users (Phase 2) | 1,000 |
| NFR-303 | Model agnostic architecture | Yes |

### 4.4 Security (NFR-400)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-401 | Data encryption in transit | TLS 1.3 |
| NFR-402 | Input sanitization | Yes |
| NFR-403 | Rate limiting | Yes |
| NFR-404 | No PII storage (MVP) | Yes |

### 4.5 Usability (NFR-500)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-501 | Mobile responsive | Yes |
| NFR-502 | Accessibility (WCAG) | AA compliance |
| NFR-503 | No onboarding required (MVP) | Yes |
| NFR-504 | No account required (MVP) | Yes |

---

## 5. Agent Requirements

### 5.1 Debate Orchestrator (AGT-100)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-101 | SHALL normalize user question into proposition | P0 |
| AGT-102 | SHALL extract context (geography, timeframe, domain) | P0 |
| AGT-103 | SHALL initialize debate state machine with 6 phases | P0 |
| AGT-104 | SHALL manage turn-taking between Pro and Con advocates | P0 |
| AGT-105 | SHALL enforce phase transition rules | P0 |
| AGT-106 | SHALL coordinate with streaming layer for real-time output | P0 |
| AGT-107 | SHALL manage user intervention queue | P0 |
| AGT-108 | SHALL NOT add arguments or judgments | P0 |

### 5.2 Pro Advocate Agent (AGT-200)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-201 | SHALL construct strongest case FOR proposition | P0 |
| AGT-202 | SHALL participate in turn-based dialogue across all phases | P0 |
| AGT-203 | SHALL deliver opening statement (Phase 1) | P0 |
| AGT-204 | SHALL present constructive arguments by category (Phase 2) | P0 |
| AGT-205 | SHALL ask probing questions in cross-examination (Phase 3) | P0 |
| AGT-206 | SHALL deliver rebuttal to Con arguments (Phase 4) | P0 |
| AGT-207 | SHALL deliver closing statement (Phase 5) | P0 |
| AGT-208 | SHALL list assumptions explicitly in all arguments | P0 |
| AGT-209 | SHALL include evidence type and confidence | P0 |
| AGT-210 | SHALL include uncertainties | P0 |
| AGT-211 | SHALL NOT use straw-man arguments | P0 |
| AGT-212 | SHALL respond to user questions when directed | P0 |
| AGT-213 | SHALL acknowledge and incorporate injected evidence | P0 |

### 5.3 Con Advocate Agent (AGT-300)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-301 | SHALL construct strongest case AGAINST proposition | P0 |
| AGT-302 | SHALL participate in turn-based dialogue across all phases | P0 |
| AGT-303 | SHALL deliver opening statement (Phase 1) | P0 |
| AGT-304 | SHALL present constructive arguments by category (Phase 2) | P0 |
| AGT-305 | SHALL ask probing questions in cross-examination (Phase 3) | P0 |
| AGT-306 | SHALL deliver rebuttal to Pro arguments (Phase 4) | P0 |
| AGT-307 | SHALL deliver closing statement (Phase 5) | P0 |
| AGT-308 | SHALL list assumptions explicitly in all arguments | P0 |
| AGT-309 | SHALL include evidence type and confidence | P0 |
| AGT-310 | SHALL include uncertainties | P0 |
| AGT-311 | SHALL NOT use trivial objections | P0 |
| AGT-312 | SHALL NOT use emotional dismissals | P0 |
| AGT-313 | SHALL treat Pro position as intelligent and serious | P0 |
| AGT-314 | SHALL respond to user questions when directed | P0 |
| AGT-315 | SHALL acknowledge and incorporate injected evidence | P0 |

### 5.4 Moderator Agent (AGT-400)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-401 | SHALL receive complete debate transcript | P0 |
| AGT-402 | SHALL synthesize debate in final phase (Phase 6) only | P0 |
| AGT-403 | SHALL identify areas of agreement | P0 |
| AGT-404 | SHALL identify core disagreements with root causes | P0 |
| AGT-405 | SHALL identify assumption conflicts | P0 |
| AGT-406 | SHALL identify evidence gaps | P0 |
| AGT-407 | SHALL identify decision hinges | P0 |
| AGT-408 | SHALL NOT pick a winner | P0 |
| AGT-409 | SHALL NOT recommend a course of action | P0 |
| AGT-410 | SHALL respond to user questions when directed | P0 |
| AGT-411 | SHALL NOT participate in Phases 1-5 (advocates only) | P0 |

---

## 6. Schema Requirements

### 6.1 General Schema (SCH-100)

| ID | Requirement | Priority |
|----|-------------|----------|
| SCH-101 | Schema SHALL be versioned | P0 |
| SCH-102 | Schema SHALL support backward compatibility | P1 |
| SCH-103 | Schema SHALL preserve assumptions and uncertainties | P0 |
| SCH-104 | Schema SHALL separate facts from inference | P0 |
| SCH-105 | Schema SHALL be UI-safe and diff-friendly | P0 |

### 6.2 Schema Sections v2.0.0 (SCH-200)

| ID | Section | Required Fields | Priority |
|----|---------|-----------------|----------|
| SCH-201 | `meta` | schema_version, debate_id, generated_at, debate_format, total_duration_seconds, status | P0 |
| SCH-202 | `proposition` | raw_input, normalized_question, context | P0 |
| SCH-203 | `transcript` | array of utterances (timestamp, phase, speaker, content, metadata) | P0 |
| SCH-204 | `structured_analysis.pro` | executive_summary, arguments, assumptions, uncertainties (compiled from transcript) | P0 |
| SCH-205 | `structured_analysis.con` | executive_summary, arguments, assumptions, uncertainties (compiled from transcript) | P0 |
| SCH-206 | `structured_analysis.moderator` | areas_of_agreement, core_disagreements, assumption_conflicts, evidence_gaps, decision_hinges | P0 |
| SCH-207 | `user_interventions` | array of interventions (id, timestamp, type, content, response) | P0 |

### 6.3 Validation (SCH-300)

| ID | Requirement | Priority |
|----|-------------|----------|
| SCH-301 | System SHALL validate JSON output against schema | P0 |
| SCH-302 | System SHALL reject outputs with missing keys | P0 |
| SCH-303 | System SHALL reject outputs with extra fields | P0 |
| SCH-304 | System SHALL reject non-JSON text | P0 |
| SCH-305 | System SHALL log schema violations | P1 |

---

## 7. UI/UX Requirements

### 7.1 Layout (UI-100)

| ID | Requirement | Priority |
|----|-------------|----------|
| UI-101 | Single-page layout | P0 |
| UI-102 | Split-screen: Live debate view + intervention panel | P0 |
| UI-103 | Input section collapses after debate starts | P1 |
| UI-104 | Debate view shows chronological utterances | P0 |
| UI-105 | Timeline scrubber at bottom of debate view | P0 |
| UI-106 | Clear visual separation between speakers | P0 |

### 7.2 Components (UI-200)

| ID | Component | Description | Priority |
|----|-----------|-------------|----------|
| UI-201 | Header | Brand name + tagline | P1 |
| UI-202 | Question Input | Large text area | P0 |
| UI-203 | Context Input | Collapsible text area | P1 |
| UI-204 | Start Debate Button | Primary CTA | P0 |
| UI-205 | Live Debate Stream | Scrolling utterance display with timestamps | P0 |
| UI-206 | Phase Indicator | Current phase name and progress | P0 |
| UI-207 | Speaker Indicator | Visual highlight of current speaker | P0 |
| UI-208 | Timeline Scrubber | Seekable timeline with phase markers | P0 |
| UI-209 | Pause Button | Pauses live debate | P0 |
| UI-210 | Intervention Panel | Question input, evidence injection, clarification requests | P0 |
| UI-211 | Transcript View | Expandable full transcript | P0 |
| UI-212 | Export Controls | Buttons for text/audio/video export | P1 |
| UI-213 | Playback Controls | Play/pause/speed for replay mode | P0 |

### 7.3 Design Principles (UI-300)

| ID | Principle | Priority |
|----|-----------|----------|
| UI-301 | Neutral, serious tone (policy tool aesthetic) | P0 |
| UI-302 | No chat bubbles or conversational UI | P0 |
| UI-303 | No gamified or social features | P0 |
| UI-304 | Clarity over rhetoric | P0 |
| UI-305 | Professional, non-chatty language | P0 |

### 7.4 Explicit Non-Goals (UI-400)

| ID | Non-Goal |
|----|----------|
| UI-401 | No user accounts (MVP) |
| UI-402 | No personalization (MVP) |
| UI-403 | No collaboration features (MVP) |
| UI-404 | No chat interface |
| UI-405 | No engagement loops |

---

## 8. Acceptance Criteria

### 8.1 MVP Definition of Done

The MVP is complete when:

- [ ] User can input a question and receive a structured pro/con debate
- [ ] All agent outputs conform to JSON Schema v1
- [ ] Flagship demo produces consistent, high-quality reasoning
- [ ] User can challenge at least one assumption
- [ ] Challenge receives inline response
- [ ] Output clearly separates pro, con, and moderator sections
- [ ] Pro section uses steel-man arguments
- [ ] Con section uses steel-man arguments
- [ ] Moderator section is genuinely neutral
- [ ] Moderator does not pick winner or recommend action
- [ ] Assumptions are explicit and visible
- [ ] Uncertainties are preserved, not collapsed
- [ ] UI is responsive and accessible
- [ ] Error states are handled gracefully

### 8.2 Quality Benchmarks

| Metric | Benchmark |
|--------|-----------|
| Reasoning quality | Matches or exceeds flagship demo |
| Straw-man detection | 0 straw-man arguments in output |
| Neutrality check | Moderator synthesis is genuinely neutral |
| Assumption visibility | 100% of assumptions are explicit |
| Uncertainty preservation | No false certainty in outputs |

### 8.3 Regression Testing

The flagship demo (AI Data Center Moratorium) serves as the canonical benchmark. All changes must:

1. Not degrade reasoning quality vs. flagship demo
2. Maintain explicit assumption listing
3. Preserve uncertainty markers
4. Keep moderator neutrality
5. Pass schema validation

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Steel-man argument | The strongest possible version of an argument |
| Straw-man argument | A weak or misrepresented version of an argument |
| Decision hinge | A key factor that would change the outcome if known |
| Evidence gap | Missing data that affects the strength of arguments |
| Assumption conflict | When pro and con sides rely on contradictory premises |

---

## Appendix B: Reference Documents

| Document | Location |
|----------|----------|
| Product Roadmap | `ROADMAP.md` |
| Kanban Board | `docs/KANBAN.md` |
| JSON Schema | `docs/04_json-schema.md` |
| Flagship Demo | `docs/02_flagship-demo.md` |
| Agent Architecture | `docs/03_agent-architecture.md` |

---

*Document Version: 1.0.0*
*Created: 2025-12-22*
