# Future Features

This document tracks planned features and ideas for ClearSide. These are not yet scheduled but represent the product roadmap beyond the current MVP.

---

## 1. Model Attribution in UI

**Priority:** P2
**Complexity:** Low

Display which AI model generated each response in the debate UI.

### Requirements
- Show model name/ID alongside each turn in the debate transcript
- Consider showing model info in a subtle way (tooltip, badge, or footnote)
- Useful for comparing model quality when using different models for Pro vs Con

### Implementation Notes
- Model info is already returned in LLM responses (`model` field)
- Need to store model ID with each turn in debate transcript
- Frontend needs to display model attribution per turn

---

## 2. Live Debate Join/Leave

**Priority:** P1
**Complexity:** Medium

Allow users to join debates already in progress and leave/rejoin at will.

### Requirements
- **Join in-progress debates**: User can view ongoing debates as a spectator
- **Leave and return**: User can navigate away and return to continue watching
- **State preservation**: Debate continues running server-side while user is away
- **Catch-up mechanism**: Show user what they missed when returning
- **Multiple viewers**: Consider future support for multiple users watching same debate

### Implementation Notes
- Current architecture uses SSE which naturally supports reconnection
- Need to track debate progress independently of client connection
- Consider adding "debate session" concept separate from user session
- May need debate checkpointing for efficient catch-up

### Technical Approach
1. Decouple debate execution from SSE connection lifecycle
2. Store full debate state in database (already partially done)
3. On reconnect, stream historical turns then switch to live
4. Add "time since last seen" indicator for returning users

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

Centralized administration interface for managing all aspects of ClearSide.

### Features

#### 4.1 Debate Management
- View all debates (active, completed, failed)
- Filter by status, date, topic, models used
- Stop/pause running debates
- Delete debates
- View detailed debate analytics

#### 4.2 Export Center
- Export debates to multiple formats from one place:
  - Markdown
  - PDF
  - Audio (podcast)
  - Video
- Batch export multiple debates
- Track export job status
- Download completed exports

#### 4.3 System Monitoring
- Real-time debate activity dashboard
- Model usage statistics
- Cost tracking per model/debate
- Rate limit status across models
- Error logs and debugging info

#### 4.4 Configuration Management
- Manage presets (CRUD)
- Manage personas (CRUD)
- System settings
- API key management

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
