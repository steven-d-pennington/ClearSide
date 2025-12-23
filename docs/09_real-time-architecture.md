# ClearSide Real-Time Architecture Specification

> Version: 1.0.0
> Last Updated: 2025-12-23
> Status: Draft

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Debate State Machine](#debate-state-machine)
4. [Streaming Layer](#streaming-layer)
5. [Database Schema](#database-schema)
6. [API Specification](#api-specification)
7. [Frontend Architecture](#frontend-architecture)
8. [Performance Considerations](#performance-considerations)

---

## Overview

### Architectural Goals

| Goal | Implementation |
|------|----------------|
| **Real-time streaming** | Server-Sent Events (SSE) for utterance delivery |
| **State persistence** | PostgreSQL with JSON columns for flexibility |
| **Hybrid replay** | Instant load from database, no regeneration |
| **User interventions** | REST API + state machine coordination |
| **Scalability** | Stateless backend, horizontal scaling |
| **Fault tolerance** | Graceful degradation, automatic retry |

### Technology Stack Recommendation

**Backend:**
- **Runtime**: Node.js (TypeScript) or Python (FastAPI)
- **Framework**: Express.js / Fastify (Node) or FastAPI (Python)
- **Database**: PostgreSQL 14+
- **Streaming**: Server-Sent Events (SSE) via native HTTP
- **LLM Integration**: OpenAI SDK / Anthropic SDK
- **Job Queue**: BullMQ (Node) or Celery (Python) - Phase 2

**Frontend:**
- **Framework**: React 18+ with TypeScript
- **State Management**: Zustand or Redux Toolkit
- **Styling**: Tailwind CSS
- **Streaming**: EventSource API (native browser)
- **Build**: Vite

**Infrastructure:**
- **Hosting**: Vercel / Railway / Render (MVP), AWS/GCP (scale)
- **Database**: Supabase / Neon / RDS PostgreSQL
- **Storage**: S3-compatible (Phase 2 - media files)
- **CDN**: CloudFlare (for static assets)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │   React    │  │  EventSource │  │  Intervention      │     │
│  │   UI       │◄─┤  (SSE Client)│  │  REST API Client   │     │
│  └────────────┘  └──────────────┘  └────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
            │              ▲                     │
            │              │ SSE Stream          │ POST/PUT
            ▼              │                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API GATEWAY / BACKEND                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Express/FastAPI Server                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│           │                    │                    │            │
│           ▼                    ▼                    ▼            │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐   │
│  │   SSE        │   │  Debate          │   │  Intervention│   │
│  │   Manager    │   │  Orchestrator    │   │  Handler     │   │
│  └──────────────┘   └──────────────────┘   └──────────────┘   │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                ▼                                 │
│                    ┌──────────────────────┐                     │
│                    │  State Machine       │                     │
│                    │  (6 Phase FSM)       │                     │
│                    └──────────────────────┘                     │
│                                │                                 │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 ▼
         ┌───────────────────────┴────────────────────────┐
         │                                                  │
         ▼                                                  ▼
┌──────────────────┐                            ┌──────────────────┐
│   PostgreSQL     │                            │   LLM APIs       │
│   Database       │                            │  (OpenAI/Claude) │
│                  │                            │                  │
│  • debates       │                            │  • Pro Agent     │
│  • utterances    │                            │  • Con Agent     │
│  • interventions │                            │  • Moderator     │
└──────────────────┘                            └──────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **API Gateway** | Route requests, auth (Phase 3), rate limiting |
| **SSE Manager** | Maintain SSE connections, push utterances to clients |
| **Debate Orchestrator** | Manage debate lifecycle, coordinate agents, enforce protocol |
| **State Machine** | Track debate phase, manage transitions, validate state |
| **Intervention Handler** | Process user inputs, pause/resume, route to agents |
| **Transcript Recorder** | Persist utterances, build JSON transcript, compile analysis |
| **Agent Coordinator** | Call LLM APIs, enforce prompt contracts, retry logic |
| **Database** | Persist debates, utterances, interventions, user sessions (Phase 3) |

---

## Debate State Machine

### States (Phases)

```
                    ┌─────────────────┐
                    │   INITIALIZING  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     PHASE_1     │
                    │  (Opening)      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     PHASE_2     │
                    │  (Constructive) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     PHASE_3     │
                    │ (Cross-Exam)    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     PHASE_4     │
                    │   (Rebuttal)    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     PHASE_5     │
                    │   (Closing)     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     PHASE_6     │
                    │  (Synthesis)    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    COMPLETED    │
                    └─────────────────┘

     PAUSED state can occur from any phase
     (returns to previous phase on resume)
```

### State Machine Implementation

**TypeScript Example:**

```typescript
enum DebatePhase {
  INITIALIZING = 'initializing',
  PHASE_1_OPENING = 'phase_1_opening',
  PHASE_2_CONSTRUCTIVE = 'phase_2_constructive',
  PHASE_3_CROSSEXAM = 'phase_3_crossexam',
  PHASE_4_REBUTTAL = 'phase_4_rebuttal',
  PHASE_5_CLOSING = 'phase_5_closing',
  PHASE_6_SYNTHESIS = 'phase_6_synthesis',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  ERROR = 'error'
}

interface DebateState {
  debateId: string;
  currentPhase: DebatePhase;
  previousPhase?: DebatePhase; // For resume after pause
  currentSpeaker: 'pro' | 'con' | 'moderator' | null;
  turnNumber: number;
  elapsedTimeMs: number;
  interventionQueue: Intervention[];
  lastUtteranceId: string | null;
}

class DebateStateMachine {
  private state: DebateState;

  async transition(toPhase: DebatePhase): Promise<void> {
    // Validate transition is legal
    if (!this.isValidTransition(this.state.currentPhase, toPhase)) {
      throw new Error(`Invalid transition: ${this.state.currentPhase} → ${toPhase}`);
    }

    // Update state
    const previousPhase = this.state.currentPhase;
    this.state.currentPhase = toPhase;

    // Persist to database
    await this.persistState();

    // Emit event for SSE
    this.emit('phase_transition', {
      from: previousPhase,
      to: toPhase,
      timestamp: Date.now()
    });
  }

  async pause(): Promise<void> {
    this.state.previousPhase = this.state.currentPhase;
    this.state.currentPhase = DebatePhase.PAUSED;
    await this.persistState();
  }

  async resume(): Promise<void> {
    if (this.state.currentPhase !== DebatePhase.PAUSED) {
      throw new Error('Cannot resume - debate not paused');
    }
    this.state.currentPhase = this.state.previousPhase!;
    this.state.previousPhase = undefined;
    await this.persistState();
  }

  private isValidTransition(from: DebatePhase, to: DebatePhase): boolean {
    // Define allowed transitions
    const transitions: Record<DebatePhase, DebatePhase[]> = {
      [DebatePhase.INITIALIZING]: [DebatePhase.PHASE_1_OPENING],
      [DebatePhase.PHASE_1_OPENING]: [DebatePhase.PHASE_2_CONSTRUCTIVE, DebatePhase.PAUSED],
      [DebatePhase.PHASE_2_CONSTRUCTIVE]: [DebatePhase.PHASE_3_CROSSEXAM, DebatePhase.PAUSED],
      // ... etc
    };

    return transitions[from]?.includes(to) ?? false;
  }
}
```

### Turn Management

**Each phase has specific turn structure:**

```typescript
interface PhaseTurnStructure {
  phase: DebatePhase;
  turns: {
    speaker: 'pro' | 'con' | 'moderator';
    durationSeconds: number;
    prompt: string; // Prompt template for this turn
  }[];
}

const PHASE_STRUCTURES: PhaseTurnStructure[] = [
  {
    phase: DebatePhase.PHASE_1_OPENING,
    turns: [
      { speaker: 'pro', durationSeconds: 120, prompt: 'PHASE_1_PRO_OPENING' },
      { speaker: 'con', durationSeconds: 120, prompt: 'PHASE_1_CON_OPENING' }
    ]
  },
  {
    phase: DebatePhase.PHASE_2_CONSTRUCTIVE,
    turns: [
      { speaker: 'pro', durationSeconds: 120, prompt: 'PHASE_2_PRO_ECONOMIC' },
      { speaker: 'con', durationSeconds: 120, prompt: 'PHASE_2_CON_ECONOMIC' },
      { speaker: 'pro', durationSeconds: 120, prompt: 'PHASE_2_PRO_ETHICAL' },
      { speaker: 'con', durationSeconds: 120, prompt: 'PHASE_2_CON_ETHICAL' },
      { speaker: 'pro', durationSeconds: 120, prompt: 'PHASE_2_PRO_PRACTICAL' },
      { speaker: 'con', durationSeconds: 120, prompt: 'PHASE_2_CON_PRACTICAL' }
    ]
  },
  // ... etc
];
```

---

## Streaming Layer

### Why Server-Sent Events (SSE)?

| Consideration | SSE | WebSocket |
|---------------|-----|-----------|
| **Direction** | Server → Client (one-way) | Bidirectional |
| **Complexity** | Simple HTTP | More complex protocol |
| **Reconnection** | Automatic | Manual implementation |
| **Compatibility** | Native browser support | Requires library |
| **Use case fit** | Perfect for debate streaming | Overkill (we use REST for user input) |

**Decision: Use SSE for debate streaming + REST API for user interventions**

### SSE Implementation

**Backend (Node.js/Express):**

```typescript
app.get('/api/debates/:debateId/stream', async (req, res) => {
  const { debateId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection success
  res.write(`data: ${JSON.stringify({ type: 'connected', debateId })}\n\n`);

  // Register client for this debate
  const clientId = registerSSEClient(debateId, res);

  // If debate already has utterances (replay mode), send them
  const existingUtterances = await getDebateUtterances(debateId);
  if (existingUtterances.length > 0) {
    for (const utterance of existingUtterances) {
      res.write(`data: ${JSON.stringify({
        type: 'utterance',
        payload: utterance
      })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({
      type: 'debate_complete'
    })}\n\n`);
  }

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 15000); // Every 15 seconds

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSSEClient(clientId);
  });
});

// Function to broadcast utterance to all clients watching this debate
function broadcastUtterance(debateId: string, utterance: Utterance) {
  const clients = getClientsForDebate(debateId);
  const message = `data: ${JSON.stringify({
    type: 'utterance',
    payload: utterance
  })}\n\n`;

  clients.forEach(client => {
    client.res.write(message);
  });
}

// Function to broadcast phase transition
function broadcastPhaseTransition(debateId: string, transition: PhaseTransition) {
  const clients = getClientsForDebate(debateId);
  const message = `data: ${JSON.stringify({
    type: 'phase_transition',
    payload: transition
  })}\n\n`;

  clients.forEach(client => {
    client.res.write(message);
  });
}
```

**Frontend (React):**

```typescript
function useDebateStream(debateId: string) {
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [currentPhase, setCurrentPhase] = useState<DebatePhase | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/debates/${debateId}/stream`);

    eventSource.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'connected':
          console.log('Connected to debate stream');
          break;

        case 'utterance':
          setUtterances(prev => [...prev, message.payload]);
          break;

        case 'phase_transition':
          setCurrentPhase(message.payload.to);
          break;

        case 'debate_complete':
          setIsComplete(true);
          break;
      }
    });

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      // EventSource automatically reconnects
    };

    return () => {
      eventSource.close();
    };
  }, [debateId]);

  return { utterances, currentPhase, isComplete };
}
```

### SSE Message Types

| Event Type | Payload | Purpose |
|------------|---------|---------|
| `connected` | `{ debateId }` | Confirm connection established |
| `utterance` | `{ Utterance }` | New agent speech delivered |
| `phase_transition` | `{ from, to, timestamp }` | Phase changed |
| `intervention_acknowledged` | `{ interventionId }` | User intervention received |
| `intervention_response` | `{ interventionId, response }` | Agent responded to user |
| `debate_paused` | `{ timestamp, reason }` | Debate paused |
| `debate_resumed` | `{ timestamp }` | Debate resumed |
| `debate_complete` | `{ totalDuration, utteranceCount }` | Debate finished |
| `error` | `{ code, message }` | Error occurred |

---

## Database Schema

### PostgreSQL Schema

```sql
-- debates table
CREATE TABLE debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposition_text TEXT NOT NULL,
  proposition_normalized TEXT,
  context JSONB, -- { geography, timeframe, domain }

  status VARCHAR(50) NOT NULL DEFAULT 'initializing',
  -- Status: initializing, in_progress, paused, completed, error

  current_phase VARCHAR(50),
  -- Phase: phase_1_opening, phase_2_constructive, etc.

  current_speaker VARCHAR(20),
  -- Speaker: pro, con, moderator, null

  turn_number INTEGER DEFAULT 0,
  elapsed_time_ms BIGINT DEFAULT 0,

  debate_format VARCHAR(50) DEFAULT 'clearside-v1',
  total_duration_seconds INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Full transcript JSON (generated on completion)
  transcript_json JSONB,

  -- Compiled structured analysis (generated on completion)
  structured_analysis JSONB
);

CREATE INDEX idx_debates_status ON debates(status);
CREATE INDEX idx_debates_created_at ON debates(created_at DESC);

-- utterances table (for efficient querying and streaming)
CREATE TABLE utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  timestamp_ms BIGINT NOT NULL, -- Milliseconds from debate start
  phase VARCHAR(50) NOT NULL,
  speaker VARCHAR(20) NOT NULL, -- pro, con, moderator, user
  utterance_type VARCHAR(50) NOT NULL,
  -- Types: speech, cross_exam_question, cross_exam_answer,
  --        rebuttal, clarification, intervention_response

  content TEXT NOT NULL,

  -- Metadata (e.g., arguments introduced, assumptions stated)
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_utterances_debate_id ON utterances(debate_id);
CREATE INDEX idx_utterances_timestamp ON utterances(debate_id, timestamp_ms);
CREATE INDEX idx_utterances_speaker ON utterances(debate_id, speaker);

-- user_interventions table
CREATE TABLE user_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,

  timestamp_ms BIGINT NOT NULL,
  intervention_type VARCHAR(50) NOT NULL,
  -- Types: pause_question, clarification_request, evidence_injection, direct_question

  content TEXT NOT NULL,
  directed_to VARCHAR(20), -- pro, con, moderator (for direct questions)

  response TEXT,
  response_timestamp_ms BIGINT,

  injected_at_phase VARCHAR(50),

  created_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP
);

CREATE INDEX idx_interventions_debate_id ON user_interventions(debate_id);
CREATE INDEX idx_interventions_timestamp ON user_interventions(debate_id, timestamp_ms);

-- Future: user_sessions table (Phase 3)
-- Future: saved_debates table (Phase 3)
```

### JSON Schema (transcript_json field)

**Matches schema v2.0.0 from REQUIREMENTS.md:**

```json
{
  "meta": {
    "schema_version": "2.0.0",
    "debate_id": "uuid",
    "generated_at": "ISO timestamp",
    "debate_format": "clearside-v1",
    "total_duration_seconds": 1847,
    "status": "completed",
    "model_info": {
      "pro": "claude-3-5-sonnet-20241022",
      "con": "claude-3-5-sonnet-20241022",
      "moderator": "claude-3-5-sonnet-20241022"
    }
  },
  "proposition": {
    "raw_input": "Should we ban AI data centers?",
    "normalized_question": "Should the United States impose a moratorium on new AI data centers?",
    "context": {
      "geography": "United States",
      "timeframe": "2025-2030",
      "domain": "Technology policy"
    }
  },
  "transcript": [
    {
      "timestamp": 0.0,
      "phase": "phase_1_opening",
      "speaker": "pro",
      "utterance_type": "speech",
      "content": "I argue FOR a moratorium...",
      "metadata": {
        "arguments_introduced": ["arg-1", "arg-2"],
        "assumptions_stated": ["assumption-1"]
      }
    }
    // ... more utterances
  ],
  "structured_analysis": {
    "pro": {
      "executive_summary": "...",
      "arguments": [ /* compiled from transcript */ ],
      "assumptions": [ /* ... */ ],
      "uncertainties": [ /* ... */ ]
    },
    "con": { /* ... */ },
    "moderator": { /* ... */ }
  },
  "user_interventions": [
    {
      "id": "intervention-1",
      "timestamp": 245.3,
      "type": "pause_question",
      "content": "Can you clarify what you mean by grid strain?",
      "directed_to": "pro",
      "response": "By grid strain I mean...",
      "injected_at_phase": "phase_2_constructive"
    }
  ]
}
```

---

## API Specification

### REST API Endpoints

#### **POST /api/debates**
Create new debate

**Request:**
```json
{
  "proposition": "Should the US impose a moratorium on AI data centers?",
  "context": {
    "geography": "United States",
    "timeframe": "2025-2030",
    "domain": "Technology policy"
  }
}
```

**Response (201):**
```json
{
  "debateId": "uuid",
  "status": "initializing",
  "streamUrl": "/api/debates/{debateId}/stream"
}
```

---

#### **GET /api/debates/:debateId**
Get debate details

**Response (200):**
```json
{
  "id": "uuid",
  "proposition": "...",
  "status": "in_progress",
  "currentPhase": "phase_2_constructive",
  "currentSpeaker": "pro",
  "elapsedTimeMs": 456000,
  "createdAt": "ISO timestamp"
}
```

---

#### **GET /api/debates/:debateId/stream**
SSE stream for real-time updates

**Response:** SSE stream (see Streaming Layer section)

---

#### **POST /api/debates/:debateId/pause**
Pause live debate

**Response (200):**
```json
{
  "status": "paused",
  "pausedAt": 456000,
  "pausedAtPhase": "phase_2_constructive"
}
```

---

#### **POST /api/debates/:debateId/resume**
Resume paused debate

**Response (200):**
```json
{
  "status": "in_progress",
  "resumedAt": 467000,
  "currentPhase": "phase_2_constructive"
}
```

---

#### **POST /api/debates/:debateId/interventions**
Submit user intervention

**Request:**
```json
{
  "type": "pause_question",
  "content": "Can you clarify what you mean by grid strain?",
  "directedTo": "pro"
}
```

**Response (201):**
```json
{
  "interventionId": "uuid",
  "status": "processing",
  "estimatedResponseTime": 10
}
```

---

#### **GET /api/debates/:debateId/transcript**
Get complete transcript (JSON)

**Response (200):**
```json
{
  // Full transcript JSON (see schema above)
}
```

---

#### **GET /api/debates/:debateId/utterances**
Get utterances (paginated, for large transcripts)

**Query params:**
- `offset`: number (default 0)
- `limit`: number (default 100)
- `speaker`: pro | con | moderator (optional filter)
- `phase`: string (optional filter)

**Response (200):**
```json
{
  "utterances": [/* ... */],
  "total": 245,
  "offset": 0,
  "limit": 100
}
```

---

## Frontend Architecture

### Component Hierarchy

```
<App>
  ├─ <Header>
  │   └─ Logo, Tagline
  │
  ├─ <DebateInput> (shown before debate starts)
  │   ├─ <QuestionInput>
  │   ├─ <ContextInput>
  │   └─ <StartButton>
  │
  ├─ <LiveDebateView> (shown during/after debate)
  │   ├─ <PhaseIndicator>
  │   ├─ <DebateStream>
  │   │   └─ <Utterance> (repeated)
  │   ├─ <TimelineScrubber>
  │   └─ <InterventionPanel>
  │       ├─ <PauseButton>
  │       ├─ <QuestionInput>
  │       ├─ <EvidenceInput>
  │       └─ <ClarificationRequest>
  │
  ├─ <TranscriptView> (expandable)
  │   └─ <TranscriptUtterance> (repeated, grouped by phase)
  │
  └─ <ExportControls> (Phase 2)
      ├─ <ExportTextButton>
      ├─ <ExportAudioButton>
      └─ <ExportVideoButton>
```

### State Management Strategy

**Use Zustand (lightweight alternative to Redux):**

```typescript
import create from 'zustand';

interface DebateStore {
  // Debate data
  debateId: string | null;
  proposition: string;
  utterances: Utterance[];
  currentPhase: DebatePhase | null;
  currentSpeaker: string | null;
  isLive: boolean;
  isComplete: boolean;
  isPaused: boolean;

  // UI state
  isTranscriptExpanded: boolean;
  currentTimestamp: number; // For timeline scrubber
  playbackSpeed: number;

  // Actions
  setDebateId: (id: string) => void;
  addUtterance: (utterance: Utterance) => void;
  setPhase: (phase: DebatePhase) => void;
  pause: () => void;
  resume: () => void;
  seekToTimestamp: (timestamp: number) => void;
}

const useDebateStore = create<DebateStore>((set) => ({
  debateId: null,
  proposition: '',
  utterances: [],
  currentPhase: null,
  currentSpeaker: null,
  isLive: false,
  isComplete: false,
  isPaused: false,
  isTranscriptExpanded: false,
  currentTimestamp: 0,
  playbackSpeed: 1.0,

  setDebateId: (id) => set({ debateId: id }),
  addUtterance: (utterance) =>
    set((state) => ({ utterances: [...state.utterances, utterance] })),
  setPhase: (phase) => set({ currentPhase: phase }),
  pause: () => set({ isPaused: true }),
  resume: () => set({ isPaused: false }),
  seekToTimestamp: (timestamp) => set({ currentTimestamp: timestamp })
}));
```

---

## Performance Considerations

### Streaming Performance

| Consideration | Solution |
|---------------|----------|
| **Latency** | Target < 500ms utterance delivery |
| **Connection stability** | SSE auto-reconnects, replay missed messages |
| **Memory usage** | Limit client-side utterance buffer (paginate transcript view) |
| **Bandwidth** | Compress SSE messages with gzip (server config) |

### Database Performance

| Operation | Optimization |
|-----------|--------------|
| **Insert utterances** | Batch insert every 5 utterances (not real-time critical) |
| **Query transcript** | Index on (debate_id, timestamp_ms) |
| **Load replay** | Single query for all utterances, client-side pagination |
| **Search debates** | Full-text search index on proposition_text (Phase 3) |

### LLM API Performance

| Challenge | Solution |
|-----------|----------|
| **Response time variability** | Show "thinking" indicator, stream token-by-token if possible |
| **Rate limits** | Implement retry with exponential backoff |
| **Cost optimization** | Use Haiku for quick responses, Sonnet for debate quality |
| **Parallel calls** | Pro and Con can generate in parallel in some phases |

### Scaling Strategy (Future)

**Phase 1 (MVP):**
- Single Node.js instance
- Managed PostgreSQL (Supabase/Neon)
- 100 concurrent users target

**Phase 2-3 (Growth):**
- Horizontal scaling: Multiple Node instances behind load balancer
- Redis for SSE client tracking (shared state across instances)
- Connection pooling for PostgreSQL
- 1,000+ concurrent users

**Phase 4 (Scale):**
- Kubernetes deployment
- Read replicas for database
- CDN for static assets and completed debate transcripts
- WebSocket fallback option for networks blocking SSE

---

## Appendix A: Debate Orchestration Flow

### Complete Debate Lifecycle

```
1. User submits proposition
   ↓
2. POST /api/debates → Create debate record (status: initializing)
   ↓
3. Client connects to GET /api/debates/{id}/stream (SSE)
   ↓
4. Orchestrator normalizes proposition → Store in DB
   ↓
5. Transition to PHASE_1_OPENING
   ↓
6. Generate Pro opening → Stream to client → Store utterance
   ↓
7. Generate Con opening → Stream to client → Store utterance
   ↓
8. Transition to PHASE_2_CONSTRUCTIVE
   ↓
9. Loop through 3 rounds (Economic, Ethical, Practical)
   For each round:
     - Generate Pro argument → Stream → Store
     - Generate Con argument → Stream → Store
   ↓
10. Transition to PHASE_3_CROSSEXAM
   ↓
11. Generate Pro questions → Stream → Store
    Generate Con answers → Stream → Store
    Generate Con questions → Stream → Store
    Generate Pro answers → Stream → Store
   ↓
12. Transition to PHASE_4_REBUTTAL
   ↓
13. Generate Con rebuttal → Stream → Store
    Generate Pro rebuttal → Stream → Store
   ↓
14. Transition to PHASE_5_CLOSING
   ↓
15. Generate Con closing → Stream → Store
    Generate Pro closing → Stream → Store
   ↓
16. Transition to PHASE_6_SYNTHESIS
   ↓
17. Compile full transcript for moderator
    Generate moderator synthesis → Stream → Store
   ↓
18. Compile structured_analysis from transcript
    Store in debates.transcript_json
   ↓
19. Mark debate status: completed
   ↓
20. Send 'debate_complete' SSE message
```

### User Intervention Handling

```
User triggers intervention (any time)
   ↓
POST /api/debates/{id}/interventions
   ↓
Orchestrator pauses debate (if pause_question type)
   ↓
Save debate state (phase, speaker, position)
   ↓
Route intervention to target agent
   ↓
Generate agent response
   ↓
Stream response to client
   ↓
Store intervention + response in DB
   ↓
Resume debate from saved state (if paused)
   ↓
Continue debate flow
```

---

## Appendix B: Error Handling

### Error Types & Recovery

| Error | Recovery Strategy |
|-------|-------------------|
| **LLM API timeout** | Retry up to 3 times with exponential backoff, then mark debate as error state |
| **LLM API rate limit** | Wait + retry with exponential backoff, show user estimate |
| **Database connection lost** | Retry query, buffer utterances in memory, reconnect |
| **SSE client disconnect** | Auto-reconnect (browser handles), replay missed messages |
| **Invalid LLM output** | Regenerate with stricter prompt, log violation |
| **State machine violation** | Log error, attempt recovery to last valid state |

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-23 | Initial architecture specification |

---

*This architecture enables real-time debate streaming with full user participation.*
