# Environment Variables

## Backend (`backend/.env`)

```env
# LLM Configuration
LLM_PROVIDER=openai
LLM_DEFAULT_MODEL=gpt-5
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=3
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-v1-...

# Text-to-Speech
ELEVENLABS_API_KEY=sk_...
GOOGLE_AI_API_KEY=AIza...
GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_CLOUD_TTS_BUCKET=clearside-tts-output
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Podcast Automation
REDIS_URL=redis://localhost:6379
AUTO_PUBLISH_ENABLED=true
ENABLE_BULL_BOARD=true
PODCAST_FEED_URL=https://clearside.app/rss/podcast.xml
PODCAST_FEED_BASE_URL=https://clearside.app
PODCAST_ARTWORK_URL=https://clearside.app/artwork.jpg
NOTIFICATION_EMAIL=steve.d.pennington@gmail.com
RESEND_API_KEY=re_...

# Vector Database (RAG)
VECTOR_DB_PROVIDER=pinecone
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=duelogic-research
FETCH_FULL_ARTICLES=true

# External APIs
LISTEN_NOTES_API_KEY=...

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clearside
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

## Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3001
```

## Docker (`.env` in project root)

Used by `docker-compose.yml`. Contains the same keys as `backend/.env` plus any Docker-specific overrides.

```env
# Same as backend/.env, plus:
LOG_LEVEL=debug
```

## Notes

- `GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON` is the full JSON service account key (single line, escaped)
- For production, set `DATABASE_URL` instead of individual DB_* variables
- When running with Docker, the database is configured automatically via docker-compose
