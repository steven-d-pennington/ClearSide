# ClearSide Live Debate Protocol Specification

> Version: 1.0.0
> Last Updated: 2025-12-23
> Status: Draft

---

## Table of Contents

1. [Overview](#overview)
2. [Protocol Philosophy](#protocol-philosophy)
3. [Phase Structure](#phase-structure)
4. [Speaker Rules](#speaker-rules)
5. [Time Allocations](#time-allocations)
6. [User Intervention Points](#user-intervention-points)
7. [Prompt Contracts](#prompt-contracts)
8. [Quality Guardrails](#quality-guardrails)

---

## Overview

### Purpose

The ClearSide Live Debate Protocol is a custom format designed specifically for AI agents conducting adversarial reasoning in real-time. Unlike traditional debate formats (Lincoln-Douglas, Oxford, etc.), this protocol optimizes for:

- **Digital consumption**: Ideal 25-30 minute runtime for online audiences
- **AI agent capabilities**: Structured turns that leverage LLM strengths
- **User participation**: Natural intervention points without disrupting flow
- **Steel-man quality**: Phases designed to prevent straw-man arguments
- **Replayability**: Clear structure for timeline navigation

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Adversarial balance** | Equal time for Pro and Con in every phase |
| **Progressive depth** | Opening → Constructive → Cross-exam → Rebuttal → Closing |
| **No winner selection** | Moderator synthesizes without judging |
| **Explicit assumptions** | Every argument must state its premises |
| **Uncertainty preservation** | Agents acknowledge unknowns, not collapse them |
| **User autonomy** | Intervention allowed at any point |

---

## Protocol Philosophy

### Why Not Use Existing Formats?

| Format | Why Not Suitable |
|--------|------------------|
| **Lincoln-Douglas** | Too long (~45 min), designed for values debate, limited cross-exam |
| **Oxford-style** | Requires team coordination, audience voting (picks winner) |
| **Policy Debate** | Extremely technical, too fast-paced, jargon-heavy |
| **Public Forum** | Shorter but less structured, allows interruptions |

### ClearSide's Custom Approach

**Optimized for AI + Digital:**
- 6 distinct phases with clear transitions
- ~27 minute runtime (optimal for attention span)
- Built-in pause points for user intervention
- Category-based argumentation (economic, ethical, technical, social)
- Explicit cross-examination phase (unlike some formats)
- Neutral synthesis instead of winner declaration

---

## Phase Structure

### Phase 1: Opening Statements (4 minutes)

**Purpose:** Establish core positions and preview key arguments

**Structure:**
```
├─ Pro Advocate: 2 minutes
│  • State position clearly
│  • Preview 2-3 strongest arguments
│  • State key assumptions
│  • No rebuttals (Con hasn't spoken yet)
│
└─ Con Advocate: 2 minutes
   • State opposing position clearly
   • Preview 2-3 strongest counterarguments
   • State key assumptions
   • No direct rebuttals to Pro (parallel construction)
```

**Guardrails:**
- Neither side may reference or rebut the other (they speak in sequence, not response)
- Must preview arguments without full development
- Must state position without hedging or equivocation
- Assumptions must be explicit, not buried

**User Intervention:** Can pause after either opening or between them

---

### Phase 2: Constructive Rounds (6 minutes)

**Purpose:** Develop full arguments organized by category

**Structure:**
```
Round 1: Economic/Technical Arguments (2 min each)
├─ Pro Advocate: Economic/technical case FOR
└─ Con Advocate: Economic/technical case AGAINST

Round 2: Ethical/Social Arguments (2 min each)
├─ Pro Advocate: Ethical/social case FOR
└─ Con Advocate: Ethical/social case AGAINST

Round 3: Practical Implications (2 min each)
├─ Pro Advocate: Practical benefits/feasibility
└─ Con Advocate: Practical risks/obstacles
```

**Guardrails:**
- Arguments must fit stated category (no mixing economic with ethical)
- Must include evidence type classification (fact, projection, analogy, value)
- Must include confidence levels (low, medium, high)
- Must list assumptions for each argument
- Must acknowledge uncertainties (no false certainty)
- Still no direct rebuttals (building parallel cases)

**User Intervention:** Can pause between rounds or after any speaker

---

### Phase 3: Cross-Examination (6 minutes)

**Purpose:** Probe assumptions, test logic, reveal weaknesses

**Structure:**
```
├─ Pro questions Con: 3 minutes
│  • Pro asks probing questions
│  • Con must answer directly
│  • Pro can ask follow-ups
│  • Goal: Expose weak assumptions or contradictions
│
└─ Con questions Pro: 3 minutes
   • Con asks probing questions
   • Pro must answer directly
   • Con can ask follow-ups
   • Goal: Expose weak assumptions or contradictions
```

**Question Guidelines:**
- Questions must be genuine (not rhetorical speeches)
- Respondent must answer question asked (no evasion)
- Questions should target assumptions, evidence, or logic
- Follow-ups allowed to drill deeper
- Questioner may not make new arguments during cross-exam

**Response Guidelines:**
- Must answer question directly (no filibustering)
- May acknowledge uncertainty instead of fabricating answers
- May challenge question's premises if genuinely unclear
- Should be concise (cross-exam is Q&A, not monologue)

**User Intervention:** Can pause after either cross-exam or during breaks

---

### Phase 4: Rebuttal Round (4 minutes)

**Purpose:** Address opposing arguments directly

**Structure:**
```
├─ Con rebuts Pro: 2 minutes
│  • Address Pro's strongest arguments
│  • Explain why they fail or are outweighed
│  • No new arguments (only rebuttals)
│
└─ Pro rebuts Con: 2 minutes
   • Address Con's strongest arguments
   • Explain why they fail or are outweighed
   • No new arguments (only rebuttals)
```

**Rebuttal Rules:**
- Must engage with actual arguments made (no straw-manning)
- Focus on strongest opposing points (steel-man opposition)
- Explain *why* argument fails, not just assert it does
- May reference cross-exam revelations
- No new constructive arguments (Phase 2 is over)

**User Intervention:** Can pause between rebuttals or after each

---

### Phase 5: Closing Statements (4 minutes)

**Purpose:** Synthesize position and crystallize core disagreements

**Structure:**
```
├─ Con closing: 2 minutes
│  • Summarize core case AGAINST
│  • Highlight key assumptions in disagreement
│  • Emphasize evidence gaps or uncertainties
│  • No new arguments
│
└─ Pro closing: 2 minutes
   • Summarize core case FOR
   • Highlight key assumptions in disagreement
   • Emphasize evidence gaps or uncertainties
   • No new arguments
```

**Closing Guidelines:**
- Summarize, don't repeat verbatim
- Focus on "why we disagree" not "why I'm right"
- Acknowledge strongest opposing points
- Highlight decision hinges (what would change your mind)
- End with uncertainty preservation (no false confidence)

**User Intervention:** Can pause after either closing

---

### Phase 6: Moderator Synthesis (3 minutes)

**Purpose:** Neutral analysis of debate without picking winner

**Structure:**
```
Moderator delivers:
├─ Areas of Agreement
│  • Points both sides concede
│  • Shared factual foundations
│
├─ Core Disagreements
│  • Root causes of disagreement
│  • Assumption conflicts
│
├─ Evidence Gaps
│  • Missing data that would resolve disputes
│  • Uncertainties acknowledged by both sides
│
└─ Decision Hinges
   • What evidence would change the outcome
   • Key dependencies in reasoning
```

**Moderator Constraints:**
- **MUST NOT** pick a winner or recommend action
- **MUST NOT** introduce new arguments
- **MUST** remain genuinely neutral
- **MUST** identify decision hinges (not decide them)
- **MUST** preserve uncertainty (no false resolution)

**User Intervention:** Can pause to ask moderator questions

---

## Speaker Rules

### Turn-Taking Protocol

| Rule | Enforcement |
|------|-------------|
| **Strict sequencing** | Orchestrator enforces turn order, no interruptions |
| **Time limits enforced** | Agents must conclude within allocated time |
| **No interruptions** | Agents cannot speak out of turn |
| **Complete thoughts** | Orchestrator allows full sentences, not word-by-word |

### Speech Content Rules

**Pro Advocate:**
- Must argue FOR proposition in all phases
- May not soften or hedge core position
- Must steel-man own position (strongest case)
- May acknowledge uncertainties but must maintain advocacy role

**Con Advocate:**
- Must argue AGAINST proposition in all phases
- May not use trivial objections or emotional dismissals
- Must steel-man own position (strongest case AGAINST)
- Must treat Pro position as intelligent (no condescension)

**Moderator:**
- Speaks only in Phase 6 (synthesis)
- May respond to user questions directed to them
- Must remain neutral (no advocacy)
- May not pick winner or recommend action

### Responding to User Interventions

**When user pauses debate:**
- Debate immediately halts mid-phase
- Targeted agent responds to user question
- Agent may ask for clarification if question unclear
- Response must be concise and direct
- Debate resumes from exact pause point

**When user injects evidence:**
- Both advocates receive the evidence
- Agents acknowledge in next turn
- Agents incorporate or explain why not relevant
- Injection recorded in transcript

**When user requests clarification:**
- Request queued for next phase break
- Relevant agent provides clarification
- Debate continues normally
- Clarification appears inline in transcript

---

## Time Allocations

### Total Runtime: ~27 minutes (base)

| Phase | Pro Time | Con Time | Total |
|-------|----------|----------|-------|
| 1. Opening Statements | 2 min | 2 min | 4 min |
| 2. Constructive Rounds | 6 min | 6 min | 12 min |
| 3. Cross-Examination | 3 min (asking) | 3 min (asking) | 6 min |
| 4. Rebuttal Round | 2 min | 2 min | 4 min |
| 5. Closing Statements | 2 min | 2 min | 4 min |
| 6. Moderator Synthesis | — | — | 3 min |
| **TOTAL** | **15 min** | **15 min** | **~27 min** |

**Note:** User interventions add time. Estimate +5-10 minutes for typical session with interventions.

### Time Enforcement Strategy

**Soft Limits (Preferred):**
- Orchestrator signals when time is 80% elapsed
- Agent receives "wrap up" signal
- Agent concludes thought naturally
- Allows completion of sentence/idea

**Hard Limits (Fallback):**
- If agent exceeds 120% of allocated time
- Orchestrator forcibly transitions to next phase
- Transcript notes truncation
- Rare occurrence if agents follow prompts

---

## User Intervention Points

### Types of Interventions

| Intervention Type | When Allowed | Processing |
|-------------------|--------------|------------|
| **Pause & Question** | Any time during live debate | Immediate halt, agent responds, resume |
| **Request Clarification** | Any time | Queued for next phase break, agent clarifies inline |
| **Inject Evidence** | Any time | Presented to advocates, acknowledged in next turn |
| **Direct Question** | Any time | Routed to specified agent (Pro/Con/Moderator) |

### Intervention Handling Workflow

```
User triggers intervention
        │
        ▼
Debate state saved (exact timestamp, current speaker, position)
        │
        ▼
Intervention type identified
        │
        ├─ Pause Question ────────► Debate halts
        │                           Agent responds
        │                           User confirms resume
        │                           Debate continues from saved state
        │
        ├─ Clarification Request ─► Added to queue
        │                           Debate continues
        │                           Addressed at next phase break
        │                           Clarification appears inline
        │
        ├─ Evidence Injection ─────► Evidence presented to advocates
        │                           Debate continues
        │                           Acknowledged in next turn
        │
        └─ Direct Question ────────► Routed to specified agent
                                    Agent responds
                                    Debate continues
```

### Best Practices for Interventions

**For Users:**
- Pause for urgent clarifications or fundamental confusions
- Use clarification requests for minor questions
- Inject evidence when new context emerges
- Direct questions to test specific agent's reasoning

**For System:**
- Preserve debate state perfectly across interventions
- Make interventions feel natural, not disruptive
- Record all interventions in transcript with context
- Allow unlimited interventions (user autonomy)

---

## Prompt Contracts

### Orchestrator Prompt Contract

**Responsibilities:**
- Normalize proposition into neutral question
- Initialize 6-phase state machine
- Enforce turn-taking and time limits
- Manage user intervention queue
- Coordinate streaming to UI
- Transition between phases automatically

**Constraints:**
- May NOT add arguments or opinions
- May NOT skip phases
- May NOT editorialize transitions

**Output Format:**
- Phase announcements
- Turn assignments
- Intervention acknowledgments
- Transition markers

---

### Pro Advocate Prompt Contract

**Identity:**
```
You are the Pro Advocate in a structured debate. Your role is to construct
the STRONGEST possible case FOR the proposition. You are not trying to "win"
but to help the user understand the best arguments supporting this position.

You will participate across multiple phases:
- Opening statement
- Constructive arguments (by category)
- Cross-examination (asking and answering)
- Rebuttals
- Closing statement
```

**Phase-Specific Instructions:**

**Phase 1 - Opening:**
```
Deliver a 2-minute opening statement:
- State your position clearly (FOR the proposition)
- Preview 2-3 of your strongest arguments
- State your key assumptions explicitly
- Do NOT rebut Con (they haven't spoken yet)
- No hedging or softening your position
```

**Phase 2 - Constructive:**
```
In each round, deliver arguments in the specified category:
Round 1: Economic/Technical
Round 2: Ethical/Social
Round 3: Practical Implications

For each argument:
- Organize by category (stay on topic)
- Include evidence type (fact/projection/analogy/value)
- Include confidence level (low/medium/high)
- List assumptions explicitly
- Acknowledge uncertainties honestly
- No rebuttals to Con (build parallel case)
```

**Phase 3 - Cross-Examination:**
```
When questioning Con (3 minutes):
- Ask probing questions targeting assumptions/evidence/logic
- Ask genuine questions, not rhetorical speeches
- Follow up to drill deeper on answers
- Expose weak assumptions or contradictions
- Do NOT make new arguments during questioning

When answering Pro's questions:
- Answer directly, no evasion
- Be concise (this is Q&A, not monologue)
- Acknowledge uncertainty if you don't know
- May challenge question's premise if unclear
```

**Phase 4 - Rebuttal:**
```
Address Con's strongest arguments (2 minutes):
- Engage with actual arguments made (steel-man them)
- Explain WHY they fail or are outweighed
- Reference cross-exam revelations if relevant
- No new constructive arguments
- No straw-manning
```

**Phase 5 - Closing:**
```
Synthesize your case (2 minutes):
- Summarize core case FOR (don't repeat verbatim)
- Highlight key assumptions in disagreement
- Emphasize evidence gaps or uncertainties
- Acknowledge Con's strongest points
- Identify decision hinges (what would change your mind)
- No new arguments
- End with preserved uncertainty
```

**Responding to User Interventions:**
```
When user asks you a question:
- Pause your current speech
- Answer their question directly and concisely
- Return to debate flow
```

**Constraints:**
- NEVER soften or hedge your core advocacy
- NEVER use straw-man versions of Con's arguments
- NEVER pretend certainty where there is none
- ALWAYS state assumptions explicitly
- ALWAYS treat Con's position as intelligent

---

### Con Advocate Prompt Contract

**Identity:**
```
You are the Con Advocate in a structured debate. Your role is to construct
the STRONGEST possible case AGAINST the proposition. You are not trying to
"win" but to help the user understand the best arguments opposing this position.

You will participate across multiple phases:
- Opening statement
- Constructive arguments (by category)
- Cross-examination (asking and answering)
- Rebuttals
- Closing statement
```

**Phase-Specific Instructions:**
[Mirror Pro Advocate structure, but with AGAINST framing]

**Special Constraints:**
- NEVER use trivial objections
- NEVER use emotional dismissals or condescension
- NEVER treat Pro's position as stupid or naive
- ALWAYS assume Pro's position is held by intelligent people
- ALWAYS engage substantively with strongest form of Pro's case

---

### Moderator Prompt Contract

**Identity:**
```
You are the Moderator in a structured debate. Your role is to synthesize
the debate in Phase 6 WITHOUT picking a winner or recommending action.

You will receive the complete debate transcript and deliver a neutral analysis.
```

**Phase 6 - Synthesis:**
```
Deliver a 3-minute neutral synthesis covering:

1. Areas of Agreement
   - What both sides concede
   - Shared factual foundations

2. Core Disagreements
   - Root causes of disagreement (not surface-level)
   - Assumption conflicts

3. Evidence Gaps
   - Missing data that would resolve disputes
   - Uncertainties acknowledged by both sides

4. Decision Hinges
   - What evidence would change the outcome
   - Key dependencies in reasoning
```

**CRITICAL Constraints:**
- You MUST NOT pick a winner
- You MUST NOT recommend a course of action
- You MUST NOT introduce new arguments
- You MUST remain genuinely neutral
- You MUST preserve uncertainty (no false resolution)
- You MUST identify decision hinges (not decide them)

**Good Synthesis Example:**
```
"Both sides agree that [X] is true. They disagree on [Y] because Pro assumes
[A] while Con assumes [B]. If we had data showing [Z], it would resolve this
disagreement. The decision hinges on whether [condition]."
```

**Bad Synthesis Example (DO NOT DO THIS):**
```
"Pro's arguments are stronger because..." ❌ PICKING WINNER
"I recommend we..." ❌ RECOMMENDING ACTION
"The answer is clearly..." ❌ FALSE RESOLUTION
```

---

## Quality Guardrails

### Steel-Man Quality Checks

**Before allowing agent output:**
1. ✅ Arguments engage with strongest form of opposition?
2. ✅ No straw-man misrepresentations?
3. ✅ Assumptions explicitly stated?
4. ✅ Uncertainties preserved, not collapsed?
5. ✅ Evidence types classified?
6. ✅ Confidence levels appropriate?

### Neutrality Checks (Moderator)

**Before allowing moderator synthesis:**
1. ✅ No winner picked or implied?
2. ✅ No action recommended?
3. ✅ Both sides treated fairly?
4. ✅ Decision hinges identified, not decided?
5. ✅ Uncertainty preserved?

### Protocol Violation Detection

| Violation | Detection | Response |
|-----------|-----------|----------|
| **Straw-manning** | Check if rebuttal engages actual argument | Reject output, regenerate |
| **New arguments in wrong phase** | Check phase vs content type | Reject output, remind of phase rules |
| **Time limit exceeded** | Monitor token count/time estimate | Soft/hard limit enforcement |
| **Moderator bias** | Check for winner-picking language | Reject output, regenerate |
| **Missing assumptions** | Check argument structure | Reject output, require explicit assumptions |

---

## Appendix A: Sample Debate Flow

### Example: "Should the US impose a moratorium on new AI data centers?"

**Phase 1: Opening Statements**

*Pro Advocate (2 min):*
> "I argue FOR a moratorium on new AI data centers. My key arguments are: (1) Energy grid strain threatens reliability, (2) Environmental costs outweigh current benefits, (3) Time to develop better standards. My key assumptions: exponential AI growth continues, current grid infrastructure insufficient, alternative solutions feasible."

*Con Advocate (2 min):*
> "I argue AGAINST a moratorium on new AI data centers. My key arguments are: (1) Economic competitiveness requires continued buildout, (2) Energy concerns solvable with renewables, (3) Moratoria stifle innovation unnecessarily. My key assumptions: AI advancement critical for economy, private sector can solve energy issues, regulatory delay harmful."

**Phase 2: Constructive Rounds**

*Round 1 - Economic/Technical (4 min):*
- Pro: [Economic costs of grid upgrades, technical energy demands]
- Con: [Economic benefits of AI infrastructure, technical solutions to energy]

*Round 2 - Ethical/Social (4 min):*
- Pro: [Equity concerns, community impacts]
- Con: [Innovation ethics, global competitiveness]

*Round 3 - Practical (4 min):*
- Pro: [Implementation feasibility, precedent for moratoria]
- Con: [Practical barriers to moratorium, enforcement challenges]

**Phase 3: Cross-Examination**

*Pro questions Con (3 min):*
> "You assume private sector will solve energy issues. What evidence supports this timeline being fast enough?"

*Con questions Pro (3 min):*
> "Your moratorium assumes time helps. What if competitors abroad continue building? How does delay help then?"

**Phase 4: Rebuttals**

*Con rebuts Pro (2 min):*
> "Pro's energy concerns are valid but overstated. Grid upgrades can parallel DC growth..."

*Pro rebuts Con (2 min):*
> "Con's competitiveness argument assumes AI dominance requires physical DCs in US..."

**Phase 5: Closing Statements**

*Con (2 min):*
> "We disagree fundamentally on whether markets or regulation solve energy issues faster..."

*Pro (2 min):*
> "The core hinge: can infrastructure adaptation keep pace with AI growth..."

**Phase 6: Moderator Synthesis**

> "Both sides agree AI growth is significant and energy use is rising. They disagree on whether private markets or regulatory pause better addresses infrastructure gap. Key evidence gap: timeline for grid upgrades vs DC demand growth. Decision hinge: if data showed grid adaptation rate exceeds 90% of DC growth rate, Pro's case weakens significantly."

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-23 | Initial protocol specification |

---

*This protocol is designed to maximize clarity, not to pick winners.*
