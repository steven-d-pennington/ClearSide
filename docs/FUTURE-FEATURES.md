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

*Last Updated: 2025-12-29*
