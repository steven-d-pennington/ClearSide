# DUELOGIC-002: Database Schema Migration

**Priority:** P0
**Estimate:** S (0.5 days)
**Labels:** `database`, `backend`, `duelogic`
**Status:** ✅ DONE
**Depends On:** DUELOGIC-001

---

## Context

The Duelogic debate mode requires database schema extensions to store chair assignments, response evaluations, and interruption logs. This migration adds the necessary tables and columns.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - Database Schema section
- [Existing Migrations](../../../backend/src/db/migrations/) - Migration patterns

---

## Requirements

### Acceptance Criteria

- [ ] Add `debate_mode` column to `debates` table
- [ ] Add `duelogic_config` JSONB column to `debates` table
- [ ] Create `debate_chairs` table for chair assignments
- [ ] Create `response_evaluations` table for adherence tracking
- [ ] Create `chair_interruptions` table for interruption logs
- [ ] Add appropriate indexes for performance
- [ ] Migration is reversible (includes rollback)
- [ ] Test migration on fresh and existing databases

---

## Implementation Guide

### File: `backend/src/db/migrations/010_add_duelogic_mode.sql`

```sql
-- backend/src/db/migrations/010_add_duelogic_mode.sql
-- Duelogic Debate Mode Schema

-- Add duelogic mode to debates
ALTER TABLE debates ADD COLUMN IF NOT EXISTS debate_mode TEXT
  CHECK (debate_mode IN ('formal', 'lively', 'informal', 'duelogic'));

ALTER TABLE debates ADD COLUMN IF NOT EXISTS duelogic_config JSONB;

-- Chair assignments tracking
CREATE TABLE IF NOT EXISTS debate_chairs (
  id SERIAL PRIMARY KEY,
  debate_id TEXT REFERENCES debates(id) ON DELETE CASCADE,
  chair_position TEXT NOT NULL,
  framework TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_display_name TEXT,
  provider_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(debate_id, chair_position)
);

-- Response evaluations for accountability tracking
CREATE TABLE IF NOT EXISTS response_evaluations (
  id SERIAL PRIMARY KEY,
  utterance_id INTEGER REFERENCES utterances(id) ON DELETE CASCADE,
  adherence_score INTEGER CHECK (adherence_score BETWEEN 0 AND 100),
  steel_manning_attempted BOOLEAN,
  steel_manning_quality TEXT CHECK (steel_manning_quality IN ('strong', 'adequate', 'weak', 'absent')),
  self_critique_attempted BOOLEAN,
  self_critique_quality TEXT CHECK (self_critique_quality IN ('strong', 'adequate', 'weak', 'absent')),
  framework_consistent BOOLEAN,
  evaluation_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chair interruptions log
CREATE TABLE IF NOT EXISTS chair_interruptions (
  id SERIAL PRIMARY KEY,
  debate_id TEXT REFERENCES debates(id) ON DELETE CASCADE,
  interrupting_chair TEXT NOT NULL,
  interrupted_chair TEXT NOT NULL,
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN (
    'factual_correction',
    'straw_man_detected',
    'direct_challenge',
    'clarification_needed',
    'strong_agreement',
    'pivotal_point'
  )),
  trigger_content TEXT,
  urgency DECIMAL(3,2) CHECK (urgency BETWEEN 0 AND 1),
  timestamp_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_debate_chairs_debate ON debate_chairs(debate_id);
CREATE INDEX IF NOT EXISTS idx_response_evaluations_utterance ON response_evaluations(utterance_id);
CREATE INDEX IF NOT EXISTS idx_chair_interruptions_debate ON chair_interruptions(debate_id);
CREATE INDEX IF NOT EXISTS idx_debates_mode ON debates(debate_mode);

-- Add comment for documentation
COMMENT ON TABLE debate_chairs IS 'Chair assignments for Duelogic debate mode';
COMMENT ON TABLE response_evaluations IS 'Evaluation of adherence to debate principles (steel-manning, self-critique)';
COMMENT ON TABLE chair_interruptions IS 'Log of chair-to-chair interruptions during debates';
```

### File: `backend/src/db/migrations/010_add_duelogic_mode.down.sql`

```sql
-- Rollback migration
DROP INDEX IF EXISTS idx_debates_mode;
DROP INDEX IF EXISTS idx_chair_interruptions_debate;
DROP INDEX IF EXISTS idx_response_evaluations_utterance;
DROP INDEX IF EXISTS idx_debate_chairs_debate;

DROP TABLE IF EXISTS chair_interruptions;
DROP TABLE IF EXISTS response_evaluations;
DROP TABLE IF EXISTS debate_chairs;

ALTER TABLE debates DROP COLUMN IF EXISTS duelogic_config;
ALTER TABLE debates DROP COLUMN IF EXISTS debate_mode;
```

### Repository Updates

Add to `backend/src/db/repositories/duelogic-repository.ts`:

```typescript
import { Pool } from 'pg';
import { DuelogicChair, ResponseEvaluation, ChairInterruptCandidate } from '../../types/duelogic';

export class DuelogicRepository {
  constructor(private pool: Pool) {}

  async saveChairAssignment(debateId: string, chair: DuelogicChair): Promise<void> {
    await this.pool.query(
      `INSERT INTO debate_chairs
       (debate_id, chair_position, framework, model_id, model_display_name, provider_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (debate_id, chair_position)
       DO UPDATE SET framework = $3, model_id = $4, model_display_name = $5, provider_name = $6`,
      [debateId, chair.position, chair.framework, chair.modelId, chair.modelDisplayName, chair.providerName]
    );
  }

  async getChairAssignments(debateId: string): Promise<DuelogicChair[]> {
    const result = await this.pool.query(
      `SELECT chair_position as position, framework, model_id as "modelId",
              model_display_name as "modelDisplayName", provider_name as "providerName"
       FROM debate_chairs WHERE debate_id = $1 ORDER BY chair_position`,
      [debateId]
    );
    return result.rows;
  }

  async saveResponseEvaluation(utteranceId: number, evaluation: ResponseEvaluation): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO response_evaluations
       (utterance_id, adherence_score, steel_manning_attempted, steel_manning_quality,
        self_critique_attempted, self_critique_quality, framework_consistent, evaluation_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        utteranceId,
        evaluation.adherenceScore,
        evaluation.steelManning.attempted,
        evaluation.steelManning.quality,
        evaluation.selfCritique.attempted,
        evaluation.selfCritique.quality,
        evaluation.frameworkConsistency.consistent,
        JSON.stringify(evaluation)
      ]
    );
    return result.rows[0].id;
  }

  async saveChairInterruption(
    debateId: string,
    interrupt: ChairInterruptCandidate,
    timestampMs: number
  ): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO chair_interruptions
       (debate_id, interrupting_chair, interrupted_chair, trigger_reason, trigger_content, urgency, timestamp_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        debateId,
        interrupt.interruptingChair.position,
        interrupt.interruptedChair.position,
        interrupt.triggerReason,
        interrupt.triggerContent,
        interrupt.urgency,
        timestampMs
      ]
    );
    return result.rows[0].id;
  }

  async getInterruptionsByDebate(debateId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM chair_interruptions WHERE debate_id = $1 ORDER BY timestamp_ms`,
      [debateId]
    );
    return result.rows;
  }
}
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration (for type imports)

---

## Validation

```bash
# Run migration
cd backend && npm run db:migrate

# Verify tables exist
psql $DATABASE_URL -c "\d debate_chairs"
psql $DATABASE_URL -c "\d response_evaluations"
psql $DATABASE_URL -c "\d chair_interruptions"

# Test rollback
cd backend && npm run db:migrate:down
```

---

## Definition of Done

- [ ] Migration runs successfully
- [ ] All tables created with correct schema
- [ ] Indexes are in place
- [ ] Rollback works correctly
- [ ] Repository CRUD operations work
- [ ] No breaking changes to existing data
