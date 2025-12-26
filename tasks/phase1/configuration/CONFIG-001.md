# CONFIG-001: Database Migration for Debate Configuration

**Priority:** P0
**Estimate:** S
**Labels:** `configuration`, `database`, `backend`
**Status:** 🟢 TO DO

---

## Context

ClearSide needs to support configurable debate settings including preset modes (Quick, Balanced, Deep Dive, Research) and per-debate parameters (brevity level, LLM temperature, max tokens, citation requirements). This task creates the database schema to store these configuration options.

**References:**
- [Database Types](../../../backend/src/types/database.ts) - Current debate schema
- [Real-Time Architecture](../../../docs/09_real-time-architecture.md) - System design

---

## Requirements

### Acceptance Criteria

- [ ] Create migration file `003_add_debate_configuration.sql`
- [ ] Add `preset_mode` column to debates table (VARCHAR with enum check)
- [ ] Add `brevity_level` column (INTEGER 1-5)
- [ ] Add `llm_temperature` column (DECIMAL 0.0-1.0)
- [ ] Add `max_tokens_per_response` column (INTEGER)
- [ ] Add `require_citations` column (BOOLEAN)
- [ ] Create `debate_presets` table for preset definitions
- [ ] Insert 4 system presets (quick, balanced, deep_dive, research)
- [ ] All new columns have sensible defaults for backward compatibility
- [ ] Migration runs successfully against existing database

### Functional Requirements

- **FR-CONFIG-001**: Debates must support preset selection
- **FR-CONFIG-002**: Users can customize LLM parameters per debate
- **NFR-001**: Backward compatible - existing debates continue working

---

## Implementation Guide

### Migration File

Create `backend/src/db/migrations/003_add_debate_configuration.sql`:

```sql
-- Migration: 003_add_debate_configuration.sql
-- Description: Add configuration columns to debates table and create presets table
-- Created: 2025-12-26

BEGIN;

-- ============================================================================
-- Add configuration columns to debates table
-- ============================================================================

-- Preset mode selection
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS preset_mode VARCHAR(20) NOT NULL DEFAULT 'balanced'
  CHECK (preset_mode IN ('quick', 'balanced', 'deep_dive', 'research', 'custom'));

-- Brevity level (1 = very detailed, 5 = very concise)
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS brevity_level INTEGER NOT NULL DEFAULT 3
  CHECK (brevity_level >= 1 AND brevity_level <= 5);

-- LLM temperature setting (0.0 = deterministic, 1.0 = creative)
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS llm_temperature DECIMAL(3,2) NOT NULL DEFAULT 0.70
  CHECK (llm_temperature >= 0.00 AND llm_temperature <= 1.00);

-- Maximum tokens per agent response
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS max_tokens_per_response INTEGER NOT NULL DEFAULT 1024
  CHECK (max_tokens_per_response >= 100 AND max_tokens_per_response <= 8000);

-- Whether citations/evidence is required for claims
ALTER TABLE debates
ADD COLUMN IF NOT EXISTS require_citations BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- Create debate_presets table for preset definitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS debate_presets (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  brevity_level INTEGER NOT NULL CHECK (brevity_level >= 1 AND brevity_level <= 5),
  llm_temperature DECIMAL(3,2) NOT NULL CHECK (llm_temperature >= 0.00 AND llm_temperature <= 1.00),
  max_tokens_per_response INTEGER NOT NULL CHECK (max_tokens_per_response >= 100 AND max_tokens_per_response <= 8000),
  require_citations BOOLEAN NOT NULL DEFAULT false,
  is_system_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_debate_presets_system ON debate_presets(is_system_preset);

-- ============================================================================
-- Insert system presets
-- ============================================================================

INSERT INTO debate_presets (id, name, description, brevity_level, llm_temperature, max_tokens_per_response, require_citations, is_system_preset)
VALUES
  ('quick', 'Quick Mode', 'Fast, concise responses for rapid analysis. Best for simple propositions or time-limited exploration.', 5, 0.50, 512, false, true),
  ('balanced', 'Balanced', 'Default balanced settings. Good mix of depth and brevity for most debates.', 3, 0.70, 1024, false, true),
  ('deep_dive', 'Deep Dive', 'Thorough, comprehensive analysis with detailed arguments. Best for complex topics requiring nuanced exploration.', 1, 0.70, 2048, false, true),
  ('research', 'Research Mode', 'Academic rigor with required citations. All claims must include evidence classification.', 2, 0.60, 2048, true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================

COMMENT ON COLUMN debates.preset_mode IS 'Selected preset mode or custom for user-configured settings';
COMMENT ON COLUMN debates.brevity_level IS 'Response brevity: 1=very detailed, 3=balanced, 5=very concise';
COMMENT ON COLUMN debates.llm_temperature IS 'LLM temperature: 0.0=deterministic, 1.0=creative';
COMMENT ON COLUMN debates.max_tokens_per_response IS 'Maximum tokens per agent response (100-8000)';
COMMENT ON COLUMN debates.require_citations IS 'Whether agents must provide citations for claims';

COMMENT ON TABLE debate_presets IS 'Predefined debate configuration presets';
COMMENT ON COLUMN debate_presets.is_system_preset IS 'System presets cannot be modified or deleted by users';

COMMIT;
```

### Rollback Script (Optional)

Create `backend/src/db/migrations/003_add_debate_configuration_rollback.sql`:

```sql
-- Rollback for 003_add_debate_configuration.sql

BEGIN;

ALTER TABLE debates DROP COLUMN IF EXISTS preset_mode;
ALTER TABLE debates DROP COLUMN IF EXISTS brevity_level;
ALTER TABLE debates DROP COLUMN IF EXISTS llm_temperature;
ALTER TABLE debates DROP COLUMN IF EXISTS max_tokens_per_response;
ALTER TABLE debates DROP COLUMN IF EXISTS require_citations;

DROP TABLE IF EXISTS debate_presets;

COMMIT;
```

---

## Dependencies

**Task Dependencies:**
- INFRA-002: PostgreSQL Database (must be set up) ✅ DONE

---

## Validation

### How to Test

1. Start the database:
   ```bash
   docker-compose up -d db
   ```

2. Run the migration:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside < backend/src/db/migrations/003_add_debate_configuration.sql
   ```

3. Verify columns exist:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside -c "\d debates"
   ```

4. Verify presets inserted:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside -c "SELECT * FROM debate_presets"
   ```

5. Test default values work:
   ```sql
   INSERT INTO debates (id, proposition_text) VALUES (gen_random_uuid(), 'Test proposition');
   SELECT preset_mode, brevity_level, llm_temperature, max_tokens_per_response, require_citations
   FROM debates ORDER BY created_at DESC LIMIT 1;
   -- Should show: balanced, 3, 0.70, 1024, false
   ```

### Expected Output

```
 preset_mode | brevity_level | llm_temperature | max_tokens_per_response | require_citations
-------------+---------------+-----------------+-------------------------+-------------------
 balanced    |             3 |            0.70 |                    1024 | f
```

### Definition of Done

- [ ] Migration file created at `backend/src/db/migrations/003_add_debate_configuration.sql`
- [ ] Migration runs without errors
- [ ] All 5 new columns added to debates table
- [ ] debate_presets table created with 4 system presets
- [ ] Existing debates continue to work (backward compatible)
- [ ] Rollback script created (optional but recommended)

---

## Notes

### Preset Mode Rationale

| Preset | Brevity | Temperature | Tokens | Citations | Use Case |
|--------|---------|-------------|--------|-----------|----------|
| Quick | 5 (concise) | 0.5 (focused) | 512 | No | Fast exploration |
| Balanced | 3 (moderate) | 0.7 (default) | 1024 | No | General use |
| Deep Dive | 1 (detailed) | 0.7 (default) | 2048 | No | Complex topics |
| Research | 2 (detailed) | 0.6 (precise) | 2048 | Yes | Academic rigor |

### Temperature Explanation

- **0.0-0.3**: Very deterministic, consistent outputs
- **0.4-0.6**: Balanced creativity with consistency
- **0.7**: Default - good balance for debates
- **0.8-1.0**: More creative, but may introduce inconsistency

### Brevity Level Mapping

1. **Very Detailed**: 500-600 words, comprehensive analysis
2. **Detailed**: 400-500 words, thorough coverage
3. **Balanced**: 300-400 words (current default)
4. **Concise**: 200-300 words, focused points
5. **Very Concise**: 150-200 words, bullet points encouraged

---

**Estimated Time:** 2 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
