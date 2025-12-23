# INFRA-002: Set Up PostgreSQL Database with Schema

**Priority:** P0
**Estimate:** M
**Labels:** `infrastructure`, `backend`, `database`
**Status:** 🟢 TO DO

---

## Context

ClearSide requires a PostgreSQL database to persist debate state, utterances, and user interventions. The schema must support real-time streaming, replay functionality, and efficient querying by debate ID and timestamp.

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Section 4 "Database Schema"
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-208, FR-352, NFR-301

---

## Requirements

### Acceptance Criteria

- [ ] Set up PostgreSQL database (local dev + cloud config)
- [ ] Create `debates` table with JSONB support
- [ ] Create `utterances` table with timestamp indexing
- [ ] Create `user_interventions` table
- [ ] Add foreign key constraints
- [ ] Create indexes for common query patterns
- [ ] Set up database migration system (e.g., Prisma, TypeORM, or raw SQL migrations)
- [ ] Add database connection pool configuration
- [ ] Create seed data for testing
- [ ] Document schema with comments

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-208**: System SHALL maintain debate state persistence in database
- **FR-307**: All interventions SHALL be recorded in transcript with timestamps
- **FR-352**: Transcript SHALL include all utterances, phases, and interventions
- **NFR-301**: Database queries < 100ms

---

## Implementation Guide

### Database Schema

```sql
-- Migration: 001_create_debates_schema.sql

-- debates table
CREATE TABLE debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposition_text TEXT NOT NULL,
  proposition_context JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'initializing',
  current_phase VARCHAR(50),
  current_speaker VARCHAR(20),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_duration_ms BIGINT,
  transcript_json JSONB,
  structured_analysis_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- utterances table
CREATE TABLE utterances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  timestamp_ms BIGINT NOT NULL,
  phase VARCHAR(50) NOT NULL,
  speaker VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_interventions table
CREATE TABLE user_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  timestamp_ms BIGINT NOT NULL,
  intervention_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  directed_to VARCHAR(20),
  response TEXT,
  response_timestamp_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- indexes for performance
CREATE INDEX idx_debates_status ON debates(status);
CREATE INDEX idx_debates_created_at ON debates(created_at DESC);
CREATE INDEX idx_utterances_debate_id ON utterances(debate_id);
CREATE INDEX idx_utterances_debate_timestamp ON utterances(debate_id, timestamp_ms);
CREATE INDEX idx_interventions_debate_id ON user_interventions(debate_id);
CREATE INDEX idx_interventions_debate_timestamp ON user_interventions(debate_id, timestamp_ms);

-- auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_debates_updated_at
  BEFORE UPDATE ON debates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- comments for documentation
COMMENT ON TABLE debates IS 'Stores debate metadata and state';
COMMENT ON COLUMN debates.status IS 'Current debate status: initializing, live, paused, completed, error';
COMMENT ON COLUMN debates.transcript_json IS 'Full transcript following schema v2.0.0';
COMMENT ON TABLE utterances IS 'Chronological record of all debate utterances';
COMMENT ON TABLE user_interventions IS 'User questions, evidence injection, and clarifications';
```

### Connection Setup (Node.js + pg)

```typescript
// src/db/connection.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'clearside',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err);
  process.exit(-1);
});

export default pool;
```

### Repository Pattern Example

```typescript
// src/db/repositories/debate-repository.ts
import pool from '../connection';
import { Debate, DebateStatus } from '../../types';

export class DebateRepository {
  async create(proposition: string, context?: any): Promise<string> {
    const result = await pool.query(
      `INSERT INTO debates (proposition_text, proposition_context, status)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [proposition, context ? JSON.stringify(context) : null, 'initializing']
    );
    return result.rows[0].id;
  }

  async findById(id: string): Promise<Debate | null> {
    const result = await pool.query(
      'SELECT * FROM debates WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async updateStatus(id: string, status: DebateStatus): Promise<void> {
    await pool.query(
      'UPDATE debates SET status = $1 WHERE id = $2',
      [status, id]
    );
  }

  async updatePhase(id: string, phase: string, speaker: string): Promise<void> {
    await pool.query(
      'UPDATE debates SET current_phase = $1, current_speaker = $2 WHERE id = $3',
      [phase, speaker, id]
    );
  }

  async saveTranscript(id: string, transcript: any): Promise<void> {
    await pool.query(
      'UPDATE debates SET transcript_json = $1 WHERE id = $2',
      [JSON.stringify(transcript), id]
    );
  }
}

export class UtteranceRepository {
  async create(
    debateId: string,
    timestampMs: number,
    phase: string,
    speaker: string,
    content: string,
    metadata?: any
  ): Promise<string> {
    const result = await pool.query(
      `INSERT INTO utterances (debate_id, timestamp_ms, phase, speaker, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [debateId, timestampMs, phase, speaker, content, metadata ? JSON.stringify(metadata) : null]
    );
    return result.rows[0].id;
  }

  async findByDebateId(debateId: string): Promise<any[]> {
    const result = await pool.query(
      'SELECT * FROM utterances WHERE debate_id = $1 ORDER BY timestamp_ms ASC',
      [debateId]
    );
    return result.rows;
  }
}
```

### Environment Configuration

```bash
# .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clearside
DB_USER=postgres
DB_PASSWORD=your_secure_password

# For cloud (example with Supabase/Neon)
DATABASE_URL=postgresql://user:password@host:5432/clearside?sslmode=require
```

### Seed Data for Testing

```sql
-- seeds/001_sample_debates.sql
INSERT INTO debates (id, proposition_text, status, current_phase)
VALUES
  ('550e8400-e29b-41d4-a716-446655440000', 'Should AI data centers be subject to a moratorium?', 'completed', 'phase_6_synthesis'),
  ('550e8400-e29b-41d4-a716-446655440001', 'Should remote work be the default for tech companies?', 'live', 'phase_2_constructive');

INSERT INTO utterances (debate_id, timestamp_ms, phase, speaker, content)
VALUES
  ('550e8400-e29b-41d4-a716-446655440000', 0, 'phase_1_opening', 'pro', 'Opening statement FOR the proposition...'),
  ('550e8400-e29b-41d4-a716-446655440000', 120000, 'phase_1_opening', 'con', 'Opening statement AGAINST the proposition...');
```

---

## Dependencies

**None** - This is a foundational task

---

## Validation

### How to Test

1. **Local Setup:**
   ```bash
   # Start PostgreSQL locally
   docker run --name clearside-db -e POSTGRES_PASSWORD=test -p 5432:5432 -d postgres:15

   # Run migrations
   npm run db:migrate

   # Seed test data
   npm run db:seed
   ```

2. **Query Tests:**
   ```typescript
   // Test debate creation
   const debateRepo = new DebateRepository();
   const id = await debateRepo.create('Test proposition');
   console.log('Created debate:', id);

   // Test utterance insertion
   const utteranceRepo = new UtteranceRepository();
   await utteranceRepo.create(id, 0, 'phase_1_opening', 'pro', 'Test content');

   // Test retrieval
   const debate = await debateRepo.findById(id);
   const utterances = await utteranceRepo.findByDebateId(id);
   console.log('Retrieved:', { debate, utterances });
   ```

3. **Performance Tests:**
   - Insert 1000 utterances for a debate
   - Query by debate_id - should be <50ms
   - Query with timestamp range - should be <100ms

### Definition of Done

- [ ] PostgreSQL database is running locally
- [ ] All three tables created with correct schema
- [ ] Foreign key constraints enforced
- [ ] Indexes created for performance
- [ ] Migration system set up and working
- [ ] Connection pool configured
- [ ] Repository classes created and tested
- [ ] Seed data loads successfully
- [ ] Query performance meets <100ms target
- [ ] Schema documented with comments

---

## Notes

- Use **UUID v4** for debate IDs (shareable, unique)
- Use **BIGINT** for timestamps (milliseconds since epoch for precision)
- Use **JSONB** for flexible schema evolution (transcript format may change)
- Consider partitioning `utterances` table if debates grow very large
- Add database backup strategy (pg_dump for dev, automated backups for prod)
- Use connection pooling to avoid exhausting database connections
- Consider read replicas for scaling (Phase 3+)

---

**Estimated Time:** 4-6 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
