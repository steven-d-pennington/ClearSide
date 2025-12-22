# ClearSide Product Requirements Document (PRD)

> Version: 1.0.0
> Last Updated: 2025-12-22

---

## Executive Summary

ClearSide is an AI-powered structured reasoning and debate engine that helps users think clearly about complex, high-stakes questions. Rather than producing single answers, it generates steel-man arguments for and against propositions, moderates disagreements, and surfaces assumptions and uncertainties.

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

ClearSide orchestrates adversarial reasoning and makes internal logic transparent by:
- Generating dual steel-man arguments (for AND against)
- Neutral moderation and synthesis
- Explicit assumption surfacing
- User-driven challenge mechanisms

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

#### US-003: Generate Debate
**As a** user
**I want to** click a button to generate the pro/con debate
**So that** I receive structured arguments on both sides

**Acceptance Criteria:**
- [ ] Generate button is clearly labeled
- [ ] Loading state shows "Analyzing both sides..."
- [ ] Results display within reasonable time (< 30 seconds)
- [ ] Error states are handled gracefully

#### US-004: View Pro Arguments
**As a** user
**I want to** see the strongest arguments FOR the proposition
**So that** I understand the supporting case

**Acceptance Criteria:**
- [ ] Pro arguments are visually distinct (green)
- [ ] Arguments are organized by category
- [ ] Each argument shows confidence level
- [ ] Assumptions are explicitly listed

#### US-005: View Con Arguments
**As a** user
**I want to** see the strongest arguments AGAINST the proposition
**So that** I understand the opposing case

**Acceptance Criteria:**
- [ ] Con arguments are visually distinct (red)
- [ ] Arguments are organized by category
- [ ] Each argument shows confidence level
- [ ] Assumptions are explicitly listed

#### US-006: View Moderator Synthesis
**As a** user
**I want to** see a neutral synthesis of both sides
**So that** I understand areas of agreement/disagreement

**Acceptance Criteria:**
- [ ] Moderator section is visually neutral (gray)
- [ ] Shows areas of agreement
- [ ] Shows core disagreements with root causes
- [ ] Shows assumption conflicts
- [ ] Shows evidence gaps
- [ ] Shows decision hinges
- [ ] Does NOT pick a winner or recommend action

#### US-007: Challenge an Assumption
**As a** user
**I want to** challenge a specific assumption
**So that** I can explore its validity

**Acceptance Criteria:**
- [ ] Challenge actions are clearly visible
- [ ] User can select "Question an assumption"
- [ ] System responds with analysis inline
- [ ] Response classifies as: factual, uncertain, or values-dependent

#### US-008: Request Stronger Counterargument
**As a** user
**I want to** ask for a stronger counterargument
**So that** I can stress-test a position

**Acceptance Criteria:**
- [ ] "Stronger counterargument" action is available
- [ ] System provides enhanced argumentation
- [ ] Response is integrated into the debate view

#### US-009: Inquire About Outcome-Changing Evidence
**As a** user
**I want to** ask what evidence would change the outcome
**So that** I understand the decision hinges

**Acceptance Criteria:**
- [ ] "What evidence would change this?" action is available
- [ ] System identifies key evidence gaps
- [ ] Response highlights dependencies

---

### 2.2 Phase 2 User Stories

#### US-010: Toggle Citations
**As a** user
**I want to** see sources and citations for claims
**So that** I can verify the reasoning

#### US-011: Adjust Value Weights
**As a** user
**I want to** adjust the weight of economic/ethical/social/technical factors
**So that** I can see how priorities affect the debate

#### US-012: Select Debate Personas
**As a** user
**I want to** have the debate conducted by different personas (economist, ethicist, environmentalist)
**So that** I can see different disciplinary perspectives

#### US-013: Save Debate
**As a** user
**I want to** save a debate for later reference
**So that** I can revisit my analysis

#### US-014: Share Debate
**As a** user
**I want to** share a debate via link
**So that** others can see my analysis

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

### 3.2 Debate Generation (FR-200)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-201 | System SHALL generate Pro Advocate arguments | P0 |
| FR-202 | System SHALL generate Con Advocate arguments | P0 |
| FR-203 | Pro and Con agents SHALL NOT see each other's output | P0 |
| FR-204 | System SHALL generate Moderator synthesis | P0 |
| FR-205 | Moderator SHALL receive both Pro and Con outputs | P0 |
| FR-206 | System SHALL assemble final JSON output | P0 |
| FR-207 | System SHALL render output in UI | P0 |

### 3.3 Argument Structure (FR-300)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-301 | Arguments SHALL be organized by category (economic, ethical, technical, social) | P0 |
| FR-302 | Arguments SHALL include explicit assumptions | P0 |
| FR-303 | Arguments SHALL include evidence type classification | P0 |
| FR-304 | Arguments SHALL include confidence levels | P0 |
| FR-305 | Arguments SHALL include uncertainties | P0 |
| FR-306 | Pro arguments SHALL NOT rebut Con arguments | P0 |
| FR-307 | Con arguments SHALL NOT use trivial objections | P0 |
| FR-308 | All arguments SHALL be steel-man quality | P0 |

### 3.4 Moderator Synthesis (FR-400)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-401 | Moderator SHALL identify areas of agreement | P0 |
| FR-402 | Moderator SHALL identify core disagreements | P0 |
| FR-403 | Moderator SHALL identify assumption conflicts | P0 |
| FR-404 | Moderator SHALL identify evidence gaps | P0 |
| FR-405 | Moderator SHALL identify decision hinges | P0 |
| FR-406 | Moderator SHALL NOT pick a winner | P0 |
| FR-407 | Moderator SHALL NOT recommend action | P0 |

### 3.5 Challenge System (FR-500)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-501 | System SHALL allow users to challenge assumptions | P1 |
| FR-502 | System SHALL allow users to request stronger counterarguments | P1 |
| FR-503 | System SHALL allow users to inquire about outcome-changing evidence | P1 |
| FR-504 | Challenge responses SHALL analyze targeted element | P1 |
| FR-505 | Challenge responses SHALL provide dependency analysis | P1 |
| FR-506 | Challenge responses SHALL classify as factual/uncertain/values-dependent | P1 |
| FR-507 | Challenge responses SHALL be displayed inline | P1 |

### 3.6 Output Formats (FR-600)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-601 | System SHALL output structured JSON | P0 |
| FR-602 | System SHALL render Markdown output | P0 |
| FR-603 | JSON output SHALL conform to schema v1 | P0 |
| FR-604 | System SHOULD support Quick View format (Phase 2) | P1 |
| FR-605 | System SHOULD support Structured Report format (Phase 2) | P1 |
| FR-606 | System SHOULD support Debate Script format (Phase 2) | P2 |

---

## 4. Non-Functional Requirements

### 4.1 Performance (NFR-100)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-101 | Debate generation time | < 30 seconds |
| NFR-102 | UI responsiveness | < 100ms interaction feedback |
| NFR-103 | Page load time | < 3 seconds |
| NFR-104 | Challenge response time | < 10 seconds |

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

### 5.1 Orchestrator Agent (AGT-100)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-101 | SHALL normalize user question into proposition | P0 |
| AGT-102 | SHALL extract context (geography, timeframe, domain) | P0 |
| AGT-103 | SHALL dispatch to Pro and Con advocates | P0 |
| AGT-104 | SHALL NOT add arguments or judgments | P0 |
| AGT-105 | SHALL output only the `proposition` section | P0 |

### 5.2 Pro Advocate Agent (AGT-200)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-201 | SHALL construct strongest case FOR proposition | P0 |
| AGT-202 | SHALL organize arguments by category | P0 |
| AGT-203 | SHALL list assumptions explicitly | P0 |
| AGT-204 | SHALL include evidence type and confidence | P0 |
| AGT-205 | SHALL include uncertainties | P0 |
| AGT-206 | SHALL NOT use straw-man arguments | P0 |
| AGT-207 | SHALL NOT include rebuttals to Con | P0 |
| AGT-208 | SHALL NOT soften or hedge | P0 |
| AGT-209 | SHALL output only the `pro` section | P0 |

### 5.3 Con Advocate Agent (AGT-300)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-301 | SHALL construct strongest case AGAINST proposition | P0 |
| AGT-302 | SHALL organize arguments by category | P0 |
| AGT-303 | SHALL list assumptions explicitly | P0 |
| AGT-304 | SHALL include evidence type and confidence | P0 |
| AGT-305 | SHALL include uncertainties | P0 |
| AGT-306 | SHALL NOT use trivial objections | P0 |
| AGT-307 | SHALL NOT use emotional dismissals | P0 |
| AGT-308 | SHALL treat Pro position as intelligent and serious | P0 |
| AGT-309 | SHALL output only the `con` section | P0 |

### 5.4 Moderator Agent (AGT-400)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-401 | SHALL receive Pro and Con outputs | P0 |
| AGT-402 | SHALL identify areas of agreement | P0 |
| AGT-403 | SHALL identify core disagreements with root causes | P0 |
| AGT-404 | SHALL identify assumption conflicts | P0 |
| AGT-405 | SHALL identify evidence gaps | P0 |
| AGT-406 | SHALL identify decision hinges | P0 |
| AGT-407 | SHALL NOT pick a winner | P0 |
| AGT-408 | SHALL NOT recommend a course of action | P0 |
| AGT-409 | SHALL output only the `moderator` section | P0 |

### 5.5 Challenge Agent (AGT-500)

| ID | Requirement | Priority |
|----|-------------|----------|
| AGT-501 | SHALL respond to user-initiated challenges | P1 |
| AGT-502 | SHALL analyze specific assumption or claim | P1 |
| AGT-503 | SHALL provide dependency analysis | P1 |
| AGT-504 | SHALL provide historical context | P1 |
| AGT-505 | SHALL classify as factual/uncertain/values-dependent | P1 |
| AGT-506 | SHALL NOT regenerate full debate | P1 |
| AGT-507 | SHALL output only `challenges.responses` element | P1 |

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

### 6.2 Schema Sections (SCH-200)

| ID | Section | Required Fields | Priority |
|----|---------|-----------------|----------|
| SCH-201 | `meta` | schema_version, generated_at, model_info, confidence_level | P0 |
| SCH-202 | `proposition` | raw_input, normalized_question, context | P0 |
| SCH-203 | `pro` | executive_summary, arguments, assumptions, uncertainties | P0 |
| SCH-204 | `con` | executive_summary, arguments, assumptions, uncertainties | P0 |
| SCH-205 | `moderator` | areas_of_agreement, core_disagreements, assumption_conflicts, evidence_gaps, decision_hinges | P0 |
| SCH-206 | `challenges` | available_actions, responses | P1 |

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
| UI-102 | No scrolling until output appears | P1 |
| UI-103 | Input and output visible together | P0 |
| UI-104 | Three-column output (Pro, Con, Moderator) | P0 |
| UI-105 | Clear visual separation between sections | P0 |

### 7.2 Components (UI-200)

| ID | Component | Description | Priority |
|----|-----------|-------------|----------|
| UI-201 | Header | Brand name + tagline | P1 |
| UI-202 | Question Input | Large text area | P0 |
| UI-203 | Context Input | Collapsible text area | P1 |
| UI-204 | Generate Button | Primary CTA | P0 |
| UI-205 | Loading State | "Analyzing both sides..." | P0 |
| UI-206 | Pro Section | Green, arguments + assumptions | P0 |
| UI-207 | Con Section | Red, arguments + assumptions | P0 |
| UI-208 | Moderator Section | Gray, synthesis + hinges | P0 |
| UI-209 | Challenge Panel | Action buttons | P1 |
| UI-210 | Challenge Response | Inline display | P1 |

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
