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

## 9. Export Podcast Script

**Priority:** P1
**Complexity:** Medium
**Status:** Planned

Use an LLM to refine debate outputs and format them for optimal synthesis with the ElevenLabs Voice API, producing broadcast-quality podcast audio.

### Concept

Debate transcripts aren't directly suitable for TTS—they contain markdown, abrupt transitions, and lack the conversational polish listeners expect. This feature adds an intelligent "script refinement" step that:

1. Transforms raw debate content into natural spoken dialogue
2. Adds podcast-appropriate transitions, intros, and outros
3. Formats output to maximize ElevenLabs voice quality
4. Preserves speaker attribution for multi-voice synthesis

### Requirements

- **LLM Refinement Pipeline**: Use an LLM to polish debate text for audio
- **Speaker Voice Mapping**: Assign distinct ElevenLabs voices to each speaker
- **Format Optimization**: Structure output for ElevenLabs API requirements
- **Batch Processing**: Handle long debates with character limit awareness
- **Preview Mode**: Allow script review before TTS generation
- **Voice Settings Per Speaker**: Different stability/style settings per role

### ElevenLabs API Integration

#### Recommended Models

| Model | Use Case | Character Limit | Latency |
|-------|----------|-----------------|---------|
| `eleven_v3` | Best for emotional debates, multi-speaker | 5,000 | Higher |
| `eleven_multilingual_v2` | Long-form, stable quality | 10,000 | Medium |
| `eleven_turbo_v2_5` | Fast generation, good quality | 40,000 | ~250-300ms |
| `eleven_flash_v2_5` | Budget-friendly, quick preview | 40,000 | ~75ms |

#### Voice Settings Reference

```typescript
interface ElevenLabsVoiceSettings {
  stability: number;        // 0-1: Lower = more expressive, Higher = more consistent
  similarity_boost: number; // 0-1: Voice clarity and similarity to original
  style: number;            // 0-1: Style exaggeration (v2+ models only)
  speed: number;            // 0.5-2.0: Playback speed
  use_speaker_boost: boolean; // Enhanced clarity for speech
}

// Recommended settings by speaker role
const SPEAKER_VOICE_PRESETS: Record<string, ElevenLabsVoiceSettings> = {
  moderator: {
    stability: 0.7,          // Consistent, professional
    similarity_boost: 0.8,
    style: 0.3,
    speed: 1.0,
    use_speaker_boost: true,
  },
  pro_advocate: {
    stability: 0.5,          // More expressive for passionate arguments
    similarity_boost: 0.75,
    style: 0.5,
    speed: 1.0,
    use_speaker_boost: true,
  },
  con_advocate: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.5,
    speed: 1.0,
    use_speaker_boost: true,
  },
  // Duelogic philosophical chairs
  philosophical_chair: {
    stability: 0.6,          // Thoughtful, measured
    similarity_boost: 0.7,
    style: 0.4,
    speed: 0.95,             // Slightly slower for philosophical content
    use_speaker_boost: true,
  },
};
```

#### Text-to-Speech API Request

```typescript
// POST /v1/text-to-speech/{voice_id}
interface ElevenLabsTTSRequest {
  text: string;                    // The refined script segment
  model_id: string;                // e.g., "eleven_multilingual_v2"
  voice_settings?: {
    stability: number;
    similarity_boost: number;
    style?: number;
    speed?: number;
    use_speaker_boost?: boolean;
  };
  pronunciation_dictionary_locators?: Array<{
    pronunciation_dictionary_id: string;
    version_id?: string;
  }>;
  previous_text?: string;          // Context for natural flow
  next_text?: string;              // Context for natural flow
}
```

#### Podcast Project API (Alternative)

For full podcast production, ElevenLabs offers a dedicated Podcast API:

```typescript
// POST /v1/studio/podcasts
interface ElevenLabsPodcastRequest {
  model_id: string;
  mode: {
    type: 'conversation';
    conversation: {
      host_voice_id: string;       // Moderator voice
      guest_voice_id: string;      // For 2-person format
    };
  };
  source: {
    type: 'text';
    text: string;                  // The refined script
  };
}
```

### Script Refinement Pipeline

#### Step 1: Raw Debate → Refined Script

The LLM transforms debate turns into spoken dialogue:

```typescript
interface ScriptRefinementPrompt {
  systemPrompt: `You are a podcast script editor. Transform debate transcripts
    into natural spoken dialogue suitable for text-to-speech synthesis.

    Guidelines:
    - Remove markdown formatting (**, *, #, etc.)
    - Convert bullet points to flowing sentences
    - Add natural transitions between speakers ("And now, let's hear from...")
    - Insert pause markers [pause] for dramatic effect
    - Expand abbreviations (e.g., AI → "A.I." or "artificial intelligence")
    - Add speaker introductions at the start
    - Include a brief intro and outro
    - Break long paragraphs into digestible segments
    - Preserve the intellectual content and arguments
    - Keep each segment under 5,000 characters for TTS processing`;

  userPrompt: string; // The raw debate transcript
}
```

#### Step 2: Script Segmentation

Break refined script into TTS-compatible chunks:

```typescript
interface PodcastSegment {
  index: number;
  speaker: 'moderator' | 'pro_advocate' | 'con_advocate' | string;
  voiceId: string;                 // ElevenLabs voice ID
  text: string;                    // Max 5,000-10,000 chars depending on model
  voiceSettings: ElevenLabsVoiceSettings;
  previousText?: string;           // For context continuity
  nextText?: string;
}

interface RefinedPodcastScript {
  title: string;
  duration_estimate_seconds: number;
  segments: PodcastSegment[];
  intro: PodcastSegment;
  outro: PodcastSegment;
}
```

#### Step 3: Voice Assignment

```typescript
interface VoiceAssignment {
  speakerId: string;
  voiceId: string;                 // ElevenLabs voice ID
  voiceName: string;               // e.g., "Rachel", "Josh"
  settings: ElevenLabsVoiceSettings;
}

const DEFAULT_VOICE_ASSIGNMENTS: Record<string, string> = {
  moderator: 'EXAVITQu4vr4xnSDxMaL',     // "Bella" - professional, clear
  pro_advocate: 'pNInz6obpgDQGcFmaJgB',  // "Adam" - confident, engaging
  con_advocate: 'yoZ06aMxZJJ28mfd3POQ',  // "Sam" - articulate, measured
  narrator: 'ThT5KcBeYPX3keUQqHPh',       // "Nicole" - warm, inviting
};
```

### Data Model

```typescript
interface PodcastExportConfig {
  // Script refinement
  refinementModel: string;           // LLM for script polish (e.g., "gpt-4o")
  includeIntro: boolean;
  includeOutro: boolean;
  addTransitions: boolean;

  // ElevenLabs settings
  elevenLabsModel: 'eleven_v3' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5';
  outputFormat: 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_44100';

  // Voice assignments
  voiceAssignments: Record<string, VoiceAssignment>;

  // Advanced
  useCustomPronunciation: boolean;
  pronunciationDictionaryId?: string;
  normalizeVolume: boolean;
}

interface PodcastExportJob {
  id: string;
  debateId: string;
  status: 'pending' | 'refining' | 'generating' | 'complete' | 'error';
  config: PodcastExportConfig;

  // Progress tracking
  refinedScript?: RefinedPodcastScript;
  currentSegment?: number;
  totalSegments?: number;

  // Output
  audioUrl?: string;
  durationSeconds?: number;
  characterCount?: number;
  estimatedCost?: number;
}
```

### UI Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Export to Podcast                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Configure Voices                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Moderator    [▼ Bella - Professional    ]  [⚙ Settings]│    │
│  │ Pro Advocate [▼ Adam - Confident        ]  [⚙ Settings]│    │
│  │ Con Advocate [▼ Sam - Articulate        ]  [⚙ Settings]│    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Step 2: Script Options                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [✓] Add podcast intro & outro                       │    │
│  │ [✓] Add speaker transitions                         │    │
│  │ [✓] Polish for natural speech                       │    │
│  │ [ ] Use custom pronunciation dictionary             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Step 3: Quality Settings                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Model:  [▼ Eleven Multilingual v2 - Recommended   ] │    │
│  │ Format: [▼ MP3 44.1kHz 128kbps                    ] │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Estimated: ~12 minutes | ~45,000 characters | ~$2.25       │
│                                                              │
│                    [Preview Script]  [Generate Podcast]      │
└─────────────────────────────────────────────────────────────┘
```

### Script Preview Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Refined Podcast Script                          [Edit] [✕] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🎙 INTRO (Narrator)                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Welcome to ClearSide Debates. Today we're exploring │    │
│  │ whether A.I. data centers should be subject to a    │    │
│  │ moratorium. Let's hear from both sides...           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  👤 MODERATOR                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Good afternoon. Our proposition today asks whether  │    │
│  │ the rapid expansion of A.I. data centers should be  │    │
│  │ paused. We'll begin with opening statements...      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  🟢 PRO ADVOCATE (Adam)                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [pause] Thank you. The environmental impact of A.I. │    │
│  │ infrastructure demands immediate attention...        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│                              [Approve & Generate] [Edit More]│
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Backend: Script Refinement Service**
   - Create `PodcastScriptRefiner` class using LLM
   - Handle debate mode differences (turn-based, lively, duelogic, informal)
   - Segment output for TTS character limits
   - Add intro/outro generation

2. **Backend: ElevenLabs Integration**
   - Create `ElevenLabsClient` wrapper
   - Implement TTS generation with retries
   - Handle voice settings per speaker
   - Support streaming for long content
   - Track character usage for cost estimation

3. **Database: Export Jobs**
   - Add `podcast_export_jobs` table
   - Store refined scripts for preview/editing
   - Track generation progress

4. **Frontend: Export UI**
   - Voice assignment interface
   - Script preview/edit modal
   - Progress tracking during generation
   - Cost estimation display

5. **Admin: Voice Management**
   - Configure default voice assignments
   - Preview voices
   - Manage pronunciation dictionaries

### API Endpoints

```typescript
// Generate refined script (preview before TTS)
POST /api/exports/podcast/refine
{
  debateId: string;
  config: Partial<PodcastExportConfig>;
}
// Returns: RefinedPodcastScript

// Update refined script
PUT /api/exports/podcast/:jobId/script
{
  segments: PodcastSegment[];
}

// Start TTS generation
POST /api/exports/podcast/generate
{
  debateId: string;
  script?: RefinedPodcastScript;  // Optional: use pre-refined script
  config: PodcastExportConfig;
}
// Returns: PodcastExportJob

// Get job status
GET /api/exports/podcast/:jobId

// Download completed podcast
GET /api/exports/podcast/:jobId/download
```

### Cost Considerations

ElevenLabs pricing is per character. Estimated costs for a typical debate:

| Debate Length | Characters | Cost (Starter) | Cost (Creator) |
|---------------|------------|----------------|----------------|
| Short (10 min audio) | ~15,000 | ~$1.50 | ~$0.75 |
| Medium (20 min audio) | ~30,000 | ~$3.00 | ~$1.50 |
| Long (45 min audio) | ~70,000 | ~$7.00 | ~$3.50 |

*Prices based on ElevenLabs 2024 rates; verify current pricing*

### Technical Notes

- **Character Limits**: Segment scripts to stay under model limits (5K-40K depending on model)
- **Context Continuity**: Use `previous_text` and `next_text` params for natural flow between segments
- **Pronunciation**: Consider custom dictionaries for technical terms, proper nouns
- **Rate Limiting**: ElevenLabs has rate limits; implement queuing for large exports
- **Caching**: Cache refined scripts to avoid re-LLM-processing on regeneration

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

*Last Updated: 2026-01-03*
