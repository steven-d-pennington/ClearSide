# Phase 9: Podcast Automation Pipeline

> **Status:** Implemented
> **Tasks:** AUTO-001 through AUTO-007

---

## What It Does

Phase 9 adds **fully automatic podcast publishing** that triggers when conversations complete. The pipeline:

1. **Refines the conversation script** using an LLM
2. **Generates TTS audio** using Gemini
3. **Creates episode metadata** (title, description, tags) via LLM
4. **Updates the RSS feed** for Spotify/Apple Podcasts
5. **Sends email notification** when episode is published

---

## How to Use & Configure

### 1. Environment Variables

Add these to your `backend/.env`:

```bash
# Redis (required for job queue)
REDIS_URL=redis://localhost:6379

# Automation toggle
AUTO_PUBLISH_ENABLED=true

# Notification settings
NOTIFICATION_EMAIL=steve.d.pennington@gmail.com
RESEND_API_KEY=re_...

# Podcast feed URLs
PODCAST_FEED_URL=https://clearside.app/rss/podcast.xml
PODCAST_FEED_BASE_URL=https://clearside.app

# Optional: Enable queue monitoring UI
ENABLE_BULL_BOARD=true
```

### 2. Start Redis

```bash
# Docker (development)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Or add to docker-compose.yml
```

### 3. Run Database Migrations

```bash
cd backend && npm run migrate
```

This creates:
- `published_episodes` - tracks all published podcast episodes
- `podcast_feed_metadata` - show-level RSS configuration
- `automation_config` - global settings (turn limits, modes, etc.)
- `persona_voice_mappings` - maps personas to TTS voices

### 4. How It Works (Automatic Flow)

1. **User completes a conversation** in the UI
2. **Orchestrator detects completion** and queues a job (if `AUTO_PUBLISH_ENABLED=true`)
3. **BullMQ worker** picks up the job and runs the pipeline:
   - Refines script → Generates audio → Creates metadata → Updates RSS → Sends email
4. **Episode appears** in RSS feed within seconds
5. **Spotify indexes** within 1-6 hours

---

## Configuration Options

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/queue/stats` | GET | View job queue statistics |
| `/admin/queue/failed` | GET | List failed jobs |
| `/admin/queue/retry/:jobId` | POST | Retry a failed job |
| `/admin/rss/regenerate` | POST | Force regenerate RSS feed |
| `/admin/queue/ui` | GET | Bull Board monitoring UI (if enabled) |

### Example: Check Queue Stats

```bash
curl http://localhost:3001/admin/queue/stats
```

Response:
```json
{
  "queue": "podcast-publish",
  "counts": {
    "waiting": 0,
    "active": 1,
    "completed": 5,
    "failed": 0,
    "delayed": 0
  }
}
```

### Example: Manually Regenerate RSS Feed

```bash
curl -X POST http://localhost:3001/admin/rss/regenerate
```

---

## Conversation Modes & Turn Limits

| Mode | Default Turns | Use Case |
|------|---------------|----------|
| **Rapid Fire** | 8 | Short episodes (~3-5 min), most reliable with Gemini TTS |
| **Normal** | 16 | In-depth discussions (~10-15 min) |
| **Model Debate** | 12 | AI model comparisons |

**Rapid Fire is recommended** as the default because:
- Shorter TTS segments = fewer timeouts
- Lower cost per episode (~$0.16 vs $0.64)
- More reliable audio generation

---

## Persona Voice Mappings

Each of the 12 podcast personas is assigned a Gemini TTS voice:

| Persona | Default Voice | Characteristics |
|---------|---------------|-----------------|
| James "JB" Buchanan | Charon | Thoughtful, measured (judge) |
| Luna Nakamura | Zephyr | Warm, expressive (artist) |
| Dr. Elena Vance | Kore | Clear, precise (scientist) |
| Marcus Stone | Fenrir | Deep, authoritative (entrepreneur) |
| Rev. Grace Okonkwo | Aoede | Calm, wise (reverend) |
| Captain Alex Petrov | Orus | Measured, disciplined (military) |
| Sofia Chen | Leda | Gentle, caring (advocate) |
| Dr. Hassan El-Amin | Charon | Thoughtful (philosopher) |
| Maya Rivers | Puck | Energetic, clear (journalist) |
| Sen. Victoria Hayes | Kore | Firm, persuasive (politician) |
| Zeke Thornton | Fenrir | Deep, grounded (rancher) |
| Dr. Yuki Tanaka | Aoede | Calm, visionary (futurist) |

### Available Gemini TTS Voices

| Voice | Characteristics | Best For |
|-------|-----------------|----------|
| Zephyr | Warm, friendly | Empathetic personas |
| Puck | Clear, energetic | Narrators, journalists |
| Charon | Thoughtful, measured | Philosophers, judges |
| Kore | Firm, clear (female) | Scientists, politicians |
| Fenrir | Deep, authoritative | Leaders, entrepreneurs |
| Leda | Gentle, nurturing | Advocates, caregivers |
| Orus | Measured, precise | Military, technical |
| Aoede | Neutral, calm | Moderators, futurists |

---

## RSS Feed

Access the podcast RSS feed at:
```
http://localhost:3001/api/rss/podcast.xml
```

Submit this URL to:
- **Spotify for Podcasters** (indexes within 1-6 hours)
- **Apple Podcasts Connect**
- **Google Podcasts**

### Required Podcast Artwork

Before submitting to podcast platforms, create artwork:
- **Size:** 1400x1400 to 3000x3000 pixels
- **Format:** JPEG or PNG
- **Location:** `public/artwork.jpg`

---

## Cost Per Episode

| Component | Cost |
|-----------|------|
| TTS (Rapid Fire) | ~$0.16 |
| TTS (Normal) | ~$0.64 |
| Script refinement | ~$0.02 |
| Metadata generation | ~$0.01 |
| **Total (Rapid Fire)** | **~$0.19** |
| **Total (Normal)** | **~$0.67** |

---

## Pipeline Progress Tracking

The publish worker reports progress at each step:

| Progress | Step |
|----------|------|
| 0% | Job started |
| 5% | Loading conversation session |
| 10% | Loading transcript |
| 15% | Creating export job |
| 30% | Refining script with LLM |
| 70% | Generating TTS audio |
| 75% | Loading participant metadata |
| 80% | Generating episode metadata |
| 85% | Inserting published episode record |
| 90% | Regenerating RSS feed |
| 100% | Sending notification email |

**Total time:** 3-7 minutes per episode (mostly TTS generation)

---

## Troubleshooting

### Job Stuck or Failed?

```bash
# Check failed jobs
curl http://localhost:3001/admin/queue/failed

# Retry a specific job
curl -X POST http://localhost:3001/admin/queue/retry/<jobId>
```

### RSS Feed Not Updating?

```bash
curl -X POST http://localhost:3001/admin/rss/regenerate
```

### Queue Not Processing?

Check that:
1. Redis is running: `docker ps | grep redis`
2. Worker is started (it initializes with the backend)
3. `AUTO_PUBLISH_ENABLED=true` in `.env`

### Email Notifications Not Sending?

1. Verify `RESEND_API_KEY` is set
2. Check that `NOTIFICATION_EMAIL` is configured
3. Email failures don't block the pipeline - check logs for errors

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Conversation Completes                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Orchestrator (AUTO_PUBLISH_ENABLED?)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BullMQ Job Queue (Redis)                      │
│                    └── auto-publish-conversation                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Publish Worker                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Script Refiner│→ │  TTS Engine  │→ │  Metadata    │          │
│  │  (Gemini)    │  │  (Gemini)    │  │  Generator   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  RSS Feed    │  │  Database    │  │   Email      │          │
│  │  Generator   │  │  (Episodes)  │  │  (Resend)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Spotify/Apple Podcasts Index RSS Feed               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Task Files

| Task | Description | File |
|------|-------------|------|
| AUTO-001 | Job Queue Infrastructure & Database Schema | [AUTO-001.md](automation/AUTO-001.md) |
| AUTO-002 | Metadata Generation Service | [AUTO-002.md](automation/AUTO-002.md) |
| AUTO-003 | RSS Feed Generation Service | [AUTO-003.md](automation/AUTO-003.md) |
| AUTO-004 | Publish Worker & Orchestration | [AUTO-004.md](automation/AUTO-004.md) |
| AUTO-005 | Notification Service | [AUTO-005.md](automation/AUTO-005.md) |
| AUTO-006 | Hook Orchestrator & Admin Tools | [AUTO-006.md](automation/AUTO-006.md) |
| AUTO-007 | Admin Configuration UI | [AUTO-007.md](automation/AUTO-007.md) |

---

## Summary

Phase 9 transforms ClearSide into an **automated podcast factory**:
- Complete a conversation → episode automatically published
- RSS feed auto-updates → Spotify indexes within hours
- Email notification sent on completion
- Configurable turn limits and voice mappings
- Full monitoring via admin endpoints and Bull Board UI
