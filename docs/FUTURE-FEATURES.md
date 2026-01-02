# Future Features

This document tracks planned features and ideas for ClearSide. These are not yet scheduled but represent the product roadmap beyond the current MVP.

---

## 1. Model Attribution in UI

**Priority:** P2
**Complexity:** Low
**Status:** IMPLEMENTED

Display which AI model generated each response in the debate UI.

### Requirements
- [x] Show model name/ID alongside each turn in the debate transcript
- [x] Consider showing model info in a subtle way (tooltip, badge, or footnote)
- [x] Useful for comparing model quality when using different models for Pro vs Con

### Implementation Notes
- Model info is stored in utterance metadata (`metadata.model`)
- Both `debate-orchestrator.ts` and `lively-orchestrator.ts` capture model attribution
- Frontend `TurnCard` component displays model badge with tooltip for full model name

---

## 2. Live Debate Join/Leave

**Priority:** P1
**Complexity:** Medium
**Status:** IMPLEMENTED

Allow users to join debates already in progress and leave/rejoin at will.

### Requirements
- [x] **Join in-progress debates**: User can view ongoing debates as a spectator
- [x] **Leave and return**: User can navigate away and return to continue watching
- [x] **State preservation**: Debate continues running server-side while user is away
- [x] **Catch-up mechanism**: Show user what they missed when returning
- [ ] **Multiple viewers**: Consider future support for multiple users watching same debate

### Implementation Notes
- SSE stream endpoint accepts `?lastTurnNumber=N` query param for catch-up
- Backend sends `catchup_start`, `catchup_utterance`, and `catchup_complete` events
- Frontend stores turn count and requests catch-up on reconnection
- UI shows "Catching up..." indicator with progress, then "Welcome back" message

### Technical Approach (Completed)
1. ~~Decouple debate execution from SSE connection lifecycle~~ (already done)
2. ~~Store full debate state in database~~ (already done)
3. [x] On reconnect, stream historical turns then switch to live
4. [x] Add "missed turns" indicator for returning users

---

## 3. Chain of Thought / Reasoning Display

**Priority:** P2
**Complexity:** Medium

Store and optionally display the AI's reasoning process when using extended thinking models.

### Requirements
- **Store reasoning tokens**: When reasoning is enabled, capture the chain-of-thought
- **Optional display**: User can toggle visibility of thinking process
- **Per-turn control**: Show/hide thinking for individual turns
- **Performance consideration**: Reasoning tokens can be verbose; handle storage efficiently

### Implementation Notes
- OpenRouter returns reasoning in response when enabled
- Need schema updates to store reasoning alongside response content
- Frontend needs collapsible "Show thinking" sections
- Consider storing reasoning in separate table for performance

### UI Mockup
```
[Pro Advocate - Claude Sonnet 4]
The economic impact would be significant because...

  [Show thinking] (collapsed by default)
  ┌─────────────────────────────────────────┐
  │ Let me think through the economic       │
  │ implications step by step...            │
  │ 1. First, consider the immediate costs  │
  │ 2. Then the long-term benefits...       │
  └─────────────────────────────────────────┘
```

### Data Model Addition
```typescript
interface DebateTurn {
  // existing fields...
  reasoning?: string;  // Chain of thought (if reasoning enabled)
  reasoningTokens?: number;  // Token count for reasoning
}
```

---

## 4. Admin Interface

**Priority:** P1
**Complexity:** High
**Status:** IMPLEMENTED

Centralized administration interface for managing all aspects of ClearSide.

### Routes
- `/admin` - Dashboard with stats, quick actions, recent debates
- `/admin/debates` - Debate management with filtering, search, bulk actions
- `/admin/exports` - Export center with job tracking and downloads
- `/admin/system` - System monitoring with memory, rate limits, connections
- `/admin/config` - Configuration viewer for presets, personas, providers

### Features Implemented

#### 4.1 Debate Management
- [x] View all debates (active, completed, failed)
- [x] Filter by status
- [x] Search by proposition text
- [x] Stop running debates
- [x] Delete debates (single and bulk)
- [ ] View detailed debate analytics (future)

#### 4.2 Export Center
- [x] Export debates to Markdown
- [x] Export debates to Audio (podcast)
- [x] Track export job status with progress
- [x] Download completed exports
- [ ] PDF export (future)
- [ ] Video export (future)
- [ ] Batch export multiple debates (future)

#### 4.3 System Monitoring
- [x] Real-time dashboard with auto-refresh
- [x] Memory usage (heap, RSS)
- [x] Rate limit status per model
- [x] Active connections and orchestrators
- [x] Uptime and Node.js info
- [ ] Cost tracking per model/debate (future)
- [ ] Error logs viewer (future)

#### 4.4 Configuration Management
- [x] View presets
- [x] View personas
- [x] View TTS providers and availability
- [ ] CRUD operations for presets/personas (future)
- [ ] API key management (future)

### Technical Approach
- New `/admin` route with protected access
- Server-side rendered dashboard or React admin panel
- WebSocket for real-time status updates
- Role-based access control (future: multi-user)

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│ ClearSide Admin                              [User ▼] [⚙]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Active   │  │ Completed│  │ Failed   │  │ Total    │   │
│  │    3     │  │   127    │  │    2     │  │   132    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                             │
│  Active Debates                          [+ New] [Export]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ID    Topic              Phase    Duration  [Actions]│   │
│  │ 42    AI Regulation      4/6      12:34     [■ Stop]│   │
│  │ 43    Climate Policy     2/6      03:21     [■ Stop]│   │
│  │ 44    UBI Debate         1/6      00:45     [■ Stop]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Recent Exports                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Debate    Format    Status      Size     [Actions]  │   │
│  │ #41       PDF       Complete    2.4MB    [⬇ Download]│   │
│  │ #40       Audio     Processing  --       [View]     │   │
│  │ #39       Video     Queued      --       [Cancel]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Reasoning Effort Configuration (In Progress)

**Priority:** P0
**Complexity:** Low
**Status:** Implementing

Add default reasoning level and UI control for extended thinking.

### Requirements
- Default reasoning effort level in debate configuration
- UI slider/selector for reasoning effort
- Effort levels: none, minimal, low, medium, high, xhigh
- Only show control when reasoning-capable models are selected

### Implementation
- [x] Add ReasoningConfig types
- [x] Update OpenRouterLLMClient to use reasoning
- [x] Add supportsReasoning to model API responses
- [x] Display reasoning indicator in model selector
- [ ] Add reasoning effort to DebateModelConfig
- [ ] Add UI control in ConfigPanel
- [ ] Wire up reasoning in buildModelConfig()

---

## 6. Reactive Listening / Cross-Talk Debates

**Priority:** P2
**Complexity:** High
**Status:** Research

Enable more natural debate flow where models can "hear" each other in real-time and interrupt organically, creating true cross-talk dynamics.

### Current Architecture
```
Speaker A streams → Interruption Engine evaluates → May trigger Speaker B
```
The interruption engine is a separate evaluator that decides if B should jump in. A and B don't actually "hear" each other in real-time.

### Proposed Approaches

#### Option A: Reactive Listening (Recommended)
Stream the current speaker's output into the opposing model's context in real-time:
```
Current Speaker (streaming) → UI (for display)
                            → Opposing Model (for reaction evaluation)
                            → Moderator (for fairness/rules)
```

The opposing model receives chunks as they stream and generates a "reaction score." When the score crosses a threshold, they get the floor.

**Pros:** Natural feel, opposing model decides when to interrupt
**Cons:** 1.5x token cost, latency per evaluation, API limitations

#### Option B: Short-Burst Rapid Exchange
Instead of long turns, use very short exchanges (1-2 sentences):
```
Pro: "The economic benefits are clear—"
Con: "But at what cost to workers?"
Pro: "Actually, studies show employment increases—"
Con: "Those studies are funded by industry!"
```

**Pros:** Simple to implement, mimics real debate
**Cons:** Less depth per point, may feel choppy

#### Option C: Parallel Streams with Arbitration
Both models stream simultaneously; an arbitrator decides who "has the floor":
```
┌─────────────┐     ┌─────────────┐
│  Pro Model  │     │  Con Model  │
│  (streaming)│     │  (streaming)│
└──────┬──────┘     └──────┬──────┘
       └───────┬───────────┘
               ▼
        ┌──────────────┐
        │  Arbitrator  │
        └──────────────┘
```

**Pros:** Most natural, true cross-talk
**Cons:** 2-3x token cost, wasted generation, hard to keep coherent

### Technical Challenges
- **Latency**: Evaluating every chunk adds 200-500ms per evaluation
- **API Limitations**: Most LLMs don't support bidirectional streaming
- **Coherence**: Cross-talk can quickly become incoherent
- **Token Waste**: Interrupted outputs mean wasted tokens
- **Audio/TTS**: Overlapping speech is complex for podcast export

### Recommended Path
1. Start with **Short-Burst Exchange** (Option B) as proof of concept
2. Validate user experience and identify issues
3. Graduate to **Reactive Listening** (Option A) if needed

### Data Model Addition
```typescript
interface CrossTalkConfig {
  mode: 'sequential' | 'short-burst' | 'reactive' | 'parallel';
  maxSentencesPerBurst?: number;  // For short-burst mode
  reactionThreshold?: number;      // For reactive mode (0-1)
  evaluationFrequency?: 'chunk' | 'sentence' | 'paragraph';
}
```

---

## 7. Human Participation Mode

**Priority:** P1
**Complexity:** Medium
**Status:** Implementing (Core Complete)

Allow a human user to take one side of the debate, arguing against an AI opponent.

### Requirements
- [x] **Side Selection**: User chooses to argue Pro or Con (via InputForm participation mode selector)
- [x] **AI Opponent**: The other side is argued by an AI model
- [x] **Turn-Based Input**: User types their arguments when it's their turn (HumanTurnInput component)
- [x] **Time Limits**: Optional timer for user responses (backend support with frontend display)
- [x] **AI Adaptation**: AI responds to user's actual arguments (human turns included in context)
- [ ] **Coaching Mode**: Optional hints/suggestions for the human player (future enhancement)

### User Experience Flow
```
1. User creates debate with proposition
2. User selects: "I will argue [Pro/Con]"
3. Debate begins with opening statements
4. On user's turn:
   - Timer starts (optional)
   - Rich text editor appears
   - User types and submits their argument
5. AI opponent responds to user's actual points
6. Continue through all phases
7. Moderator provides synthesis as normal
```

### Game Modes

#### Competitive Mode
- Strict time limits
- No hints or suggestions
- AI moderator scores arguments
- Leaderboard potential

#### Practice Mode
- No time limits
- AI provides suggestions ("Consider addressing...")
- Post-turn feedback on argument strength
- Learning-focused

#### Guided Mode
- AI suggests key points to make
- Templates for common argument structures
- Best for beginners

### UI Components Needed
- Side selection screen
- Human input editor with formatting
- Turn timer (optional)
- "Thinking..." indicator while AI responds
- Hint/suggestion panel (for practice mode)

### Technical Considerations
- Modify orchestrator to wait for human input instead of calling LLM
- Add WebSocket or polling for user input submission
- Context building must include user's actual text
- Consider rate limiting to prevent abuse
- Store human turns differently (no model attribution)

### Data Model Addition
```typescript
interface HumanParticipationConfig {
  enabled: boolean;
  humanSide: 'pro' | 'con';
  gameMode: 'competitive' | 'practice' | 'guided';
  timeLimitSeconds?: number;
  allowHints: boolean;
}

interface DebateTurn {
  // existing fields...
  isHumanGenerated: boolean;
  responseTimeMs?: number;  // How long human took to respond
}
```

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│  Debate: Should AI be regulated?                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [AI - Con Advocate]                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Regulation would stifle innovation and put us       │   │
│  │ behind other nations in AI development...           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Your Turn - Pro Advocate]                    ⏱ 2:45      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Type your argument here...                          │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💡 Hint: Consider addressing the innovation point         │
│                                           [Submit Argument] │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Notes (2025-12-30)

**Backend Changes:**
- `HumanParticipationConfig` type added to `types/configuration.ts`
- New SSE events: `awaiting_human_input`, `human_turn_received`, `human_turn_timeout`
- `HumanTurnService` manages pending human input requests with promise-based waiting
- POST `/api/debates/:debateId/human-turn` endpoint for submitting human arguments
- `lively-orchestrator.ts` modified to check `isHumanSpeaker()` and wait for human input

**Frontend Changes:**
- `HumanParticipation` and `HumanSide` types in `types/debate.ts`
- Participation mode selector in `InputForm` (Watch / Argue Pro / Argue Con)
- `HumanTurnInput` component with character count, timer, and Ctrl+Enter submit
- `debate-store.ts` updated with `submitHumanTurn` action and SSE event handlers
- `DebateStream` shows human participation indicator and renders `HumanTurnInput`

**Not Yet Implemented:**
- Competitive/Practice/Guided game modes
- Coaching hints and suggestions
- Post-turn feedback on argument strength
- Leaderboard/scoring

---

## 8. Informal Discussion Mode

**Priority:** P2
**Complexity:** Medium
**Status:** IMPLEMENTED

A freeform discussion mode where multiple AI models converse about a topic without structured debate roles or phases.

### Concept

Unlike the formal debate mode with Pro/Con advocates and a moderator following a 6-phase protocol, Informal Mode is an open-ended conversation between 2+ AI models. There are no assigned positions - models simply discuss and explore a topic together.

### Requirements
- **No roles**: Participants are just "Model A", "Model B", etc. - not advocates for positions
- **No phases**: Conversation flows naturally without opening/constructive/rebuttal structure
- **No moderator**: The conversation is self-directed
- **Multi-model support**: Support 2+ models discussing together
- **Topic flexibility**: Any topic, question, or prompt - not just binary propositions
- **Turn-based or flowing**: Could be strict turn-taking or more organic (see Cross-Talk feature)

### Use Cases
- Exploring nuanced topics that don't fit a binary pro/con frame
- Brainstorming sessions between multiple AI "perspectives"
- Educational discussions where models build on each other's ideas
- Comparing how different models approach the same topic
- Casual exploration of philosophical or open-ended questions

### Example Topics
- "What makes a good life?"
- "Discuss the implications of quantum computing"
- "Explore the relationship between art and technology"
- "What should humanity prioritize in the next 50 years?"

### Technical Approach

#### New Discussion Configuration
```typescript
interface InformalDiscussionConfig {
  mode: 'informal';
  topic: string;
  participants: Array<{
    name: string;      // e.g., "Participant A" or custom name
    modelId: string;   // e.g., "anthropic/claude-sonnet-4"
    persona?: string;  // Optional persona/perspective
  }>;
  turnOrder: 'round-robin' | 'dynamic';  // Who speaks next
  maxTurns?: number;           // Optional limit
  maxTokensPerTurn?: number;   // Keep responses conversational
}
```

#### Simplified Orchestrator
- No phase progression logic
- No interruption engine (unless in "dynamic" turn order)
- Simple turn-based generation
- Each model receives full conversation history

#### UI Changes
- Different input form for informal mode (just topic + model selection)
- Participant list instead of Pro/Con setup
- Simpler transcript view without phase markers
- No moderator synthesis at the end (or optional summary)

### Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│  Discussion: What makes a good life?                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Claude Sonnet]                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ That's a profound question. I think it depends on   │    │
│  │ what we mean by "good" - are we talking about       │    │
│  │ happiness, meaning, virtue, or something else?      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [GPT-4]                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Great point. I'd argue those aren't mutually        │    │
│  │ exclusive. Aristotle's concept of eudaimonia        │    │
│  │ encompasses all of those aspects...                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  [Gemini]                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Building on that, modern psychology research on     │    │
│  │ well-being seems to support a multi-dimensional     │    │
│  │ view. PERMA theory, for example...                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps
1. Add `InformalDiscussionConfig` type
2. Create `InformalOrchestrator` (simplified version of `LivelyOrchestrator`)
3. Update `/api/debates/start` to accept informal mode
4. Create frontend form for informal discussions
5. Update `DebateStream` to render informal transcripts
6. Add export support for informal discussions

### Relationship to Other Features
- Could leverage **Team Debates** infrastructure (multiple participants)
- Compatible with **Cross-Talk** for more organic turn-taking
- Could use **Chain of Thought** display for transparency
- **Human Participation** could join as one of the discussants

### Implementation Notes (2026-01-01)

**Backend (Already Complete):**
- `InformalOrchestrator` (791 lines) in `backend/src/services/debate/informal-orchestrator.ts`
- `EndDetector` for AI-based end detection in `backend/src/services/debate/end-detector.ts`
- Database schema in migration `009_add_informal_discussion.sql`
- `InformalRepository` for persistence in `backend/src/db/repositories/informal-repository.ts`
- Types in `backend/src/types/informal.ts`

**Frontend (Now Complete):**
- `DebateMode` type updated to include `'informal'` in `frontend/src/types/lively.ts`
- `InformalSettingsInput` types in `frontend/src/types/informal.ts`
- `DebateModeSelector` now shows "Informal Discussion" option with description
- `InformalSettings` component for participant configuration (2-4 participants, model selection, personas)
- `InputForm` hides irrelevant controls (Participation Mode, Model Selector, Persona Selector) when informal mode is selected
- Button text changes to "Start Discussion" for informal mode

**API Integration:**
- `debate-store.ts` sends `informalSettings` when `debateMode === 'informal'`
- `debate-routes.ts` accepts `informalSettings` and starts `InformalOrchestrator`

---

## Future Considerations

### Multi-User Support
- User accounts and authentication
- Personal debate history
- Shared debates with collaborators

### Team Debates
- Multiple advocates per side
- Panel-style debates with 3+ positions
- Expert witnesses

### Interactive Modes
- Real-time user voting on arguments
- Audience participation
- Q&A sessions with advocates

### Integration
- API for external applications
- Embed debates in other websites
- Slack/Discord integration

### Analytics
- Argument quality scoring
- Debate outcome predictions
- Topic sentiment analysis

---

*Last Updated: 2026-01-01*
