# ClearSide

> **Watch the debate. Think both sides. Decide with clarity.**

ClearSide is a live debate theater and AI-powered structured reasoning engine that helps you think clearly about complex questions through real-time adversarial debates.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

---

## 🎯 What is ClearSide?

ClearSide closes the gap in modern decision-making by orchestrating **live adversarial debates** you can watch, participate in, and export as shareable media.

### Core Features

- **🎭 Live Debate Streaming**: Watch AI agents debate in real-time following formal protocols
- **⚖️ Dual Adversarial Agents**: Pro and Con advocates construct steel-man arguments simultaneously
- **🎤 User Participation**: Pause, question, inject evidence, and redirect debates at any time
- **🧑‍⚖️ Neutral Moderation**: A moderator synthesizes the debate without choosing a winner
- **🔄 Hybrid Replay Model**: Live debates become instantly-replayable artifacts with timeline navigation
- **📦 Multi-Format Export**: Transform debates into text transcripts, audio podcasts, or video content
- **⚙️ Configurable Depth**: Presets from Quick to Research mode with customizable brevity and creativity
- **🎯 Lively Debate Mode**: Dynamic interruption-enabled debates with real-time cross-talk and interjections
- **🎭 Persona System**: 6 distinct argumentation archetypes (Theorist, Pragmatist, Skeptic, Advocate, Analyst, Synthesizer)
- **🌐 OpenRouter Integration**: Multi-model debates with automatic or manual model pairing across 100+ LLMs

### What Makes ClearSide Different

| Generic AI | ClearSide |
|------------|-----------|
| Static response | Live debate streaming |
| Single answer | Pro AND Con in real-time |
| Hidden assumptions | Explicit and challengeable |
| Overstated certainty | Preserved uncertainties |
| Passive recipient | Active participant |
| One-sided risk | Adversarial balance |
| One-time answer | Replayable artifact + media export |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **PostgreSQL** >= 14
- **Docker** (optional, for containerized development)
- **API Key** for OpenAI or Anthropic

### Option 1: Docker (Recommended for Local Development)

```bash
# Clone the repository
git clone https://github.com/steven-d-pennington/ClearSide.git
cd ClearSide

# Copy and configure environment files
cp .env.docker.example .env.docker
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit .env.docker and backend/.env with your API keys
# Set LLM_PROVIDER (openai or anthropic)
# Set OPENAI_API_KEY or ANTHROPIC_API_KEY

# Start all services
npm run docker:up

# Backend will be available at http://localhost:3001
# Frontend will be available at http://localhost:5173
# PostgreSQL will be available at localhost:5432
```

**Docker Commands:**
```bash
npm run docker:up            # Start services
npm run docker:down          # Stop services
npm run docker:logs          # View all logs
npm run docker:logs:backend  # View backend logs only
npm run docker:logs:frontend # View frontend logs only
npm run docker:shell:backend # Access backend shell
npm run docker:shell:db      # Access PostgreSQL shell
```

### Option 2: Manual Setup

#### Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and API credentials

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Set VITE_API_URL to your backend URL (default: http://localhost:3001)

# Start development server
npm run dev
```

### Verify Installation

1. Open [http://localhost:5173](http://localhost:5173) in your browser
2. Enter a question like: "Should cities impose a moratorium on new AI data centers?"
3. Configure your debate:
   - **Preset**: Try "Deep Dive" for comprehensive analysis
   - **Mode**: Select "Lively" for interruption-enabled debate
   - **Personas**: Assign "The Theorist" (Pro) vs "The Pragmatist" (Con)
   - **Models**: Enable OpenRouter multi-model (if configured)
4. Click "Start Debate" and watch the live debate unfold
5. Try pausing and asking a clarifying question
6. Export as Markdown or Audio when complete

---

## 📖 How It Works

ClearSide offers two debate modes to match your needs:

### Debate Modes

#### 🎙️ Turn-Based Mode (Classic)
Structured, formal debates following the traditional 6-phase protocol with clear turn-taking.

#### ⚡ Lively Debate Mode (Experimental)
**The world's first AI interruption-enabled debate system.**

Experience debates that feel like live podcast recordings:
- **Real-Time Interruptions**: Agents can interrupt each other based on relevance and contradiction detection
- **Dynamic Pacing**: Choose from Slow, Medium, Fast, or Frantic pacing modes
- **Intelligent Triggers**: Interruptions fire when opposing agent detects contradictions or weak arguments
- **Safe Boundaries**: Interrupts happen at sentence breaks for natural flow
- **Podcast-Ready Audio**: TTS export preserves interruptions with realistic cross-talk timing
- **Configurable Aggression**: Control interrupt frequency (1-5) and cooldown periods

**How Lively Mode Works:**
1. Agents stream responses token-by-token in real-time
2. Interruption engine evaluates opposing agent's content every 250-2000ms (pacing-dependent)
3. When relevance score exceeds threshold, interrupt is scheduled at next safe boundary
4. Interrupted agent yields mid-sentence with truncated utterance
5. Interrupter fires brief interjection (1-2 sentences)
6. Original speaker may resume or yield floor
7. TTS export creates podcast-style audio with realistic overlap

**Perfect for:** Heated policy debates, adversarial analysis, podcast-style content

---

### The 6-Phase ClearSide Debate Protocol (Turn-Based)

1. **📝 Proposition Normalization** - Orchestrator clarifies the question and scope
2. **🎯 Opening Statements** - Pro and Con agents present their core positions
3. **🔄 Dialectical Exchange** - 3 rounds of direct argumentation and rebuttals
4. **🔍 Evidence Deep Dive** - Examination of key facts, projections, and analogies
5. **❓ User Q&A** - Direct responses to user interventions and clarifications
6. **📊 Moderator Synthesis** - Neutral summary highlighting decision hinges (no winner declared)

### Agent Roles

| Agent | Purpose | Behavior |
|-------|---------|----------|
| **Orchestrator** | Normalizes propositions | Clarifies scope, defines terms, identifies context |
| **Pro Advocate** | Argues FOR the proposition | Steel-man quality, explicit assumptions, cites evidence |
| **Con Advocate** | Argues AGAINST the proposition | Steel-man quality, explicit assumptions, cites evidence |
| **Moderator** | Synthesizes the debate | Neutral, no winner, highlights uncertainties and decision hinges |

### User Interventions

During any phase, users can:
- **⏸️ Pause** - Stop the debate to reflect
- **❓ Ask Question** - Request clarification on a specific point
- **📎 Inject Evidence** - Add facts or sources to the debate
- **🔄 Request Clarification** - Ask an agent to elaborate on their reasoning

---

## 🏗️ Architecture

### Tech Stack

**Backend:**
- Node.js + TypeScript
- Express.js
- PostgreSQL with migrations
- Server-Sent Events (SSE) for real-time streaming
- OpenAI / Anthropic / OpenRouter SDK
- Multi-provider TTS (ElevenLabs, PlayHT, OpenAI)
- Pino structured logging
- Real-time interruption engine

**Frontend:**
- React 19 + TypeScript
- Vite build system
- Zustand state management
- TanStack Query for API
- React Router for navigation

**Testing:**
- Vitest (480+ tests)
- Playwright (E2E)
- Accessibility testing (WCAG)
- Agent quality validation

### Project Structure

```
ClearSide/
├── backend/               # Node.js/TypeScript API
│   ├── src/
│   │   ├── agents/       # AI agent implementations
│   │   ├── db/           # Database migrations & repositories
│   │   ├── core/         # State machine, orchestrator, turn manager
│   │   ├── services/     # LLM, SSE, logging, export
│   │   └── api/          # Express routes
│   └── tests/            # Unit + integration tests
├── frontend/             # React/Vite UI
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── features/     # Feature modules
│   │   ├── stores/       # Zustand state
│   │   └── api/          # API clients
│   └── e2e/              # Playwright tests
├── docs/                 # Product documentation
├── tasks/                # Development task files
└── docker-compose.yml    # Docker development environment
```

---

## 🧪 Testing

### Run All Tests

```bash
# Backend tests
cd backend
npm test                  # Run unit + integration tests
npm run test:coverage     # With coverage report

# Frontend tests
cd frontend
npm run test:run          # Run component tests
npm run e2e               # Run E2E tests
npm run test:coverage     # With coverage report
```

### Test Coverage

- **480+ total tests** across backend and frontend
- **>90% coverage** for critical business logic
- **Unit tests**: Component logic, state management, utilities
- **Integration tests**: Debate flow, agent interactions, API endpoints
- **E2E tests**: Complete user flows with Playwright
- **Accessibility tests**: WCAG 2.1 AA compliance
- **Agent quality tests**: Steel-man validation, moderator neutrality

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | AI agent development guide |
| [ROADMAP.md](ROADMAP.md) | Product roadmap and phases |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/01_product-vision.md](docs/01_product-vision.md) | Vision and mission |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | Functional requirements |
| [docs/08_live-debate-protocol.md](docs/08_live-debate-protocol.md) | 6-phase debate protocol |
| [docs/09_real-time-architecture.md](docs/09_real-time-architecture.md) | Technical architecture |
| [docs/10_media-production.md](docs/10_media-production.md) | Export pipeline specification |
| [docs/KANBAN.md](docs/KANBAN.md) | Task board and sprint planning |
| [backend/STATE_MACHINE_DIAGRAM.md](backend/STATE_MACHINE_DIAGRAM.md) | State machine flow visualization |

---

## 🎨 Configuration Options

ClearSide supports extensive customization:

### Debate Modes

- **Turn-Based** (Classic) - Formal structured debate with clear turn-taking
- **Lively Mode** - Dynamic interruption-enabled debates with cross-talk and interjections
  - 4 pacing modes: Slow, Medium, Fast, Frantic
  - Configurable aggression levels (1-5)
  - Relevance-based interruption triggers
  - Realistic podcast-style audio generation

### Preset Modes

- **Quick** - Fast overview (brevity 2, GPT-4o-mini)
- **Balanced** - Standard depth (brevity 3, GPT-4)
- **Deep Dive** - Comprehensive analysis (brevity 4, higher temperature)
- **Research** - Maximum detail (brevity 5, citations required)
- **Custom** - Full control over all settings

### Persona System (6 Archetypes)

Assign distinct argumentation styles to Pro and Con agents:

| Persona | Style | Focus |
|---------|-------|-------|
| **🎓 The Theorist** | Abstract, principle-based | First principles, conceptual frameworks |
| **🔧 The Pragmatist** | Practical, implementation-focused | Real-world feasibility, trade-offs |
| **🔬 The Skeptic** | Questioning, evidence-demanding | Scrutinizing claims, demanding rigor |
| **💼 The Advocate** | Passionate, value-driven | Moral imperatives, stakeholder impact |
| **📊 The Analyst** | Data-driven, quantitative | Numbers, models, measurable outcomes |
| **🌐 The Synthesizer** | Integrative, big-picture | Connections, systems thinking |

### OpenRouter Multi-Model Debates

Use different LLMs for Pro and Con agents:

- **Auto-Pairing**: Automatic model selection based on cost threshold
  - Frontier tier: GPT-4, Claude Opus ($5+/1M tokens)
  - Mid-tier: GPT-4o-mini, Claude Sonnet ($0.50-$5/1M)
  - Budget: Llama, Mistral (<$0.50/1M)
  - Free: Selected free models
- **Manual Pairing**: Choose specific models from 100+ options
- **Cost Estimation**: Real-time cost predictions per debate

### Configurable Parameters

- **Brevity Level** (1-5) - Controls response length
- **LLM Temperature** (0.0-1.0) - Creativity vs consistency
- **Citation Requirements** - Enforce evidence in arguments
- **Flow Mode** - Auto (continuous) or Step (pause between turns)
- **LLM Provider** - OpenAI, Anthropic, or OpenRouter
- **Model Selection** - Choose from available models or enable multi-model debates

---

## 🚢 Deployment

### Environment Variables

**Backend Required:**
```bash
# LLM Provider (choose one or use OpenRouter for multi-model)
LLM_PROVIDER=openai                    # or anthropic or openrouter
OPENAI_API_KEY=sk-...                  # Your OpenAI API key
# ANTHROPIC_API_KEY=sk-ant-...         # OR your Anthropic API key
# OPENROUTER_API_KEY=sk-or-...         # OR your OpenRouter API key

# Database
DATABASE_URL=postgresql://...          # PostgreSQL connection

# TTS Providers (optional - for podcast/audio export)
# ELEVENLABS_API_KEY=...               # ElevenLabs TTS (premium voices)
# GOOGLE_AI_API_KEY=...                # Gemini TTS (cost-effective)
# GEMINI_API_KEY=...                   # Alternative name for Gemini

# Vector Database for RAG (optional - for Duelogic research features)
VECTOR_DB_PROVIDER=pinecone          # Currently only Pinecone supported
PINECONE_API_KEY=...                 # Pinecone API key
PINECONE_INDEX_NAME=...              # Pinecone index name (e.g., duelogic-research)
FETCH_FULL_ARTICLES=false            # Set true to fetch full article content for RAG

# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://your-frontend.com # CORS configuration
```

**Frontend Required:**
```bash
VITE_API_URL=https://your-backend.com  # Backend API URL
```

### Production Deployment

ClearSide can be deployed to:
- **Railway** (backend + database)
- **Vercel** (frontend)
- **Render** (full-stack)
- **Fly.io** (full-stack)

Database migrations run automatically on backend startup. See [backend/.env.example](backend/.env.example) for all configuration options.

---

## 🤝 Contributing

### Development Workflow

1. **Pick a task** from [docs/KANBAN.md](docs/KANBAN.md)
2. **Read the task file** in `tasks/` directory for complete implementation guide
3. **Update status** to "IN PROGRESS"
4. **Implement with tests** (>90% coverage for critical paths)
5. **Validate** using task acceptance criteria
6. **Mark complete** and commit

### Code Quality Standards

- TypeScript strict mode
- ESLint + Prettier formatting
- >90% test coverage for critical paths
- All tests passing before commit
- Steel-man quality for agent implementations

### Commit Message Format

```
<type>(<scope>): <description>

<longer description if needed>

- Detail 1
- Detail 2

Closes TASK-ID
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## 🎯 Current Status

**Version:** 1.0.0 (MVP Complete)

### ✅ Phase 1 Complete (36/36 tasks)

- **Infrastructure**: LLM API, PostgreSQL, SSE streaming, schema validation, logging
- **Core Engine**: State machine, orchestrator, turn manager, interventions, transcript
- **AI Agents**: All 4 agents with steel-man prompts
- **UI Components**: Complete React interface with design system
- **Testing**: 480+ tests with >90% coverage
- **Configuration**: Presets, brevity, LLM settings, flow modes

### ✅ Phase 2 Complete (Media Production)

- ✅ Markdown export with debate structure
- ✅ Audio export: Multi-provider TTS (ElevenLabs, PlayHT, OpenAI)
- ✅ Podcast generation with voice profiles
- ✅ Lively mode TTS with interruption awareness
- ✅ Export panel UI with format selection

### ✅ Recent Additions (Phase 2.5)

- ✅ **Lively Debate Mode**: Interruption-enabled debates with dynamic pacing
- ✅ **Persona System**: 6 argumentation archetypes
- ✅ **OpenRouter Integration**: Multi-model debates with 100+ LLM options
- ✅ **Debate History**: Browse and replay completed debates

### 🔮 Phase 3+ Planned

- PDF export with professional formatting
- Video export: Remotion pipeline with avatars
- Team debates (3v3 agents)
- API access for developers
- Analytics and insights
- Advanced Lively features: Real-time sentiment analysis, auto-highlights

---

## 🌟 Key Innovations

ClearSide introduces several first-of-their-kind features in AI debate systems:

### 1. Lively Debate Mode
**First AI interruption-enabled debate system** that creates natural, dynamic conversations with:
- Real-time relevance and contradiction detection
- Safe boundary interruption (sentence-aware)
- Configurable pacing modes (Slow → Frantic)
- Podcast-style audio export with preserved interruptions

### 2. Persona System
**6 distinct argumentation archetypes** that transform debate dynamics:
- Each persona has unique vocabulary, rhetorical style, and focus areas
- System prompt modifications ensure authentic personality differences
- Mix and match personas for Pro vs Con (e.g., Theorist vs Pragmatist)

### 3. OpenRouter Multi-Model Debates
**Pit different LLMs against each other** in the same debate:
- Auto-pairing with cost optimization
- 100+ models across all major providers
- Real-time cost estimation
- Tier-based smart matching (Frontier vs Mid-tier vs Budget)

### 4. Hybrid Live-Replay Model
**Every debate is both live AND replayable:**
- Watch debates unfold in real-time with full participation
- Instantly replay any completed debate with timeline scrubbing
- Export to text, audio, or video formats
- Phase-based navigation

### 5. Steel-Man Quality Enforcement
**No straw-man arguments allowed:**
- Agents must construct strongest possible opposing arguments
- Moderator neutrality validation (never picks a winner)
- Explicit assumption surfacing in every claim
- Uncertainty preservation (no false confidence)

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- [OpenAI](https://openai.com/) / [Anthropic](https://anthropic.com/) - LLM providers
- [React](https://react.dev/) - UI framework
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Vite](https://vitejs.dev/) - Build tool
- [Vitest](https://vitest.dev/) - Testing framework
- [Playwright](https://playwright.dev/) - E2E testing

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/steven-d-pennington/ClearSide/issues)
- **Documentation**: [docs/](docs/)
- **Email**: steve.d.pennington@gmail.com

---

**ClearSide: Where AI debates live, so you can think clearly.**

*Think better. Decide smarter. With clarity.*
