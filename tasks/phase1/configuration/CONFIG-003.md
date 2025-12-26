# CONFIG-003: Update Debate Repository for Configuration

**Priority:** P0
**Estimate:** M
**Labels:** `configuration`, `database`, `backend`
**Status:** 🟢 TO DO

---

## Context

Update the debate repository to handle the new configuration fields when creating, reading, and updating debates. Also create a new preset repository for managing debate presets.

**References:**
- [Debate Repository](../../../backend/src/db/repositories/debate-repository.ts) - Current implementation
- [Configuration Types](./CONFIG-002.md) - Type definitions

---

## Requirements

### Acceptance Criteria

- [ ] Update `debate-repository.ts` to include new config fields in create/read/update
- [ ] Update `mapRowToDebate()` to map new columns
- [ ] Create `preset-repository.ts` for preset CRUD operations
- [ ] Presets can be listed (system presets only for now)
- [ ] Presets can be looked up by ID
- [ ] Default values applied when config fields not provided

---

## Implementation Guide

### Update: `backend/src/db/repositories/debate-repository.ts`

```typescript
// Add import at top
import type { PresetMode } from '../../types/configuration.js';
import { DEFAULT_CONFIGURATION } from '../../types/configuration.js';

// Update mapRowToDebate function to include new fields:
function mapRowToDebate(row: DebateRow): Debate {
  return {
    id: row.id,
    propositionText: row.proposition_text,
    propositionContext: row.proposition_context as Record<string, unknown>,
    status: row.status,
    currentPhase: row.current_phase,
    currentSpeaker: row.current_speaker,
    flowMode: row.flow_mode,
    isAwaitingContinue: row.is_awaiting_continue,
    // NEW: Configuration fields
    presetMode: row.preset_mode as PresetMode,
    brevityLevel: row.brevity_level,
    llmTemperature: parseFloat(row.llm_temperature?.toString() ?? '0.7'),
    maxTokensPerResponse: row.max_tokens_per_response,
    requireCitations: row.require_citations,
    // Existing fields continue...
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalDurationMs: row.total_duration_ms,
    transcriptJson: row.transcript_json as Record<string, unknown> | null,
    structuredAnalysisJson: row.structured_analysis_json as Record<string, unknown> | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Update create function:
export async function create(input: CreateDebateInput): Promise<Debate> {
  const id = crypto.randomUUID();
  const now = new Date();

  // Apply defaults for config fields
  const presetMode = input.presetMode ?? DEFAULT_CONFIGURATION.presetMode;
  const brevityLevel = input.brevityLevel ?? DEFAULT_CONFIGURATION.brevityLevel;
  const llmTemperature = input.llmTemperature ?? DEFAULT_CONFIGURATION.llmSettings.temperature;
  const maxTokensPerResponse = input.maxTokensPerResponse ?? DEFAULT_CONFIGURATION.llmSettings.maxTokensPerResponse;
  const requireCitations = input.requireCitations ?? DEFAULT_CONFIGURATION.requireCitations;

  const query = `
    INSERT INTO debates (
      id,
      proposition_text,
      proposition_context,
      status,
      current_phase,
      current_speaker,
      flow_mode,
      is_awaiting_continue,
      preset_mode,
      brevity_level,
      llm_temperature,
      max_tokens_per_response,
      require_citations,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    ) RETURNING *
  `;

  const values = [
    id,
    input.propositionText,
    JSON.stringify(input.propositionContext ?? {}),
    'initializing',
    'opening_statements',
    'moderator',
    input.flowMode ?? 'auto',
    input.flowMode === 'step',
    presetMode,
    brevityLevel,
    llmTemperature,
    maxTokensPerResponse,
    requireCitations,
    now,
    now,
  ];

  const result = await pool.query(query, values);
  return mapRowToDebate(result.rows[0]);
}
```

### New File: `backend/src/db/repositories/preset-repository.ts`

```typescript
/**
 * Preset Repository
 *
 * Handles database operations for debate presets.
 */

import { pool } from '../connection.js';
import type { DebatePreset, PresetMode } from '../../types/configuration.js';

/**
 * Raw database row for debate_presets table
 */
interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  brevity_level: number;
  llm_temperature: string; // DECIMAL comes as string
  max_tokens_per_response: number;
  require_citations: boolean;
  is_system_preset: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map database row to DebatePreset
 */
function mapRowToPreset(row: PresetRow): DebatePreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    brevityLevel: row.brevity_level as 1 | 2 | 3 | 4 | 5,
    llmTemperature: parseFloat(row.llm_temperature),
    maxTokensPerResponse: row.max_tokens_per_response,
    requireCitations: row.require_citations,
    isSystemPreset: row.is_system_preset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all system presets
 */
export async function listSystemPresets(): Promise<DebatePreset[]> {
  const query = `
    SELECT * FROM debate_presets
    WHERE is_system_preset = true
    ORDER BY
      CASE id
        WHEN 'quick' THEN 1
        WHEN 'balanced' THEN 2
        WHEN 'deep_dive' THEN 3
        WHEN 'research' THEN 4
        ELSE 5
      END
  `;

  const result = await pool.query(query);
  return result.rows.map(mapRowToPreset);
}

/**
 * Get all presets (system and user-created)
 */
export async function listAll(): Promise<DebatePreset[]> {
  const query = `
    SELECT * FROM debate_presets
    ORDER BY is_system_preset DESC, name ASC
  `;

  const result = await pool.query(query);
  return result.rows.map(mapRowToPreset);
}

/**
 * Get a preset by ID
 */
export async function findById(id: string): Promise<DebatePreset | null> {
  const query = `SELECT * FROM debate_presets WHERE id = $1`;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPreset(result.rows[0]);
}

/**
 * Check if a preset exists
 */
export async function exists(id: string): Promise<boolean> {
  const query = `SELECT 1 FROM debate_presets WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows.length > 0;
}

/**
 * Get configuration values for a preset (for applying to debates)
 */
export async function getPresetConfiguration(presetId: PresetMode): Promise<{
  brevityLevel: number;
  llmTemperature: number;
  maxTokensPerResponse: number;
  requireCitations: boolean;
} | null> {
  const preset = await findById(presetId);
  if (!preset) return null;

  return {
    brevityLevel: preset.brevityLevel,
    llmTemperature: preset.llmTemperature,
    maxTokensPerResponse: preset.maxTokensPerResponse,
    requireCitations: preset.requireCitations,
  };
}

// Export all functions as named exports
export const presetRepository = {
  listSystemPresets,
  listAll,
  findById,
  exists,
  getPresetConfiguration,
};

export default presetRepository;
```

### Export from Index

Update `backend/src/db/repositories/index.ts`:

```typescript
export * from './debate-repository.js';
export * from './utterance-repository.js';
export * from './intervention-repository.js';
export * from './preset-repository.js';  // Add this line
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-001: Database migration (tables must exist)
- CONFIG-002: Configuration types (types must be defined)

---

## Validation

### Unit Tests

```typescript
// backend/src/db/repositories/__tests__/preset-repository.test.ts
import { presetRepository } from '../preset-repository.js';

describe('Preset Repository', () => {
  describe('listSystemPresets', () => {
    it('returns all 4 system presets in correct order', async () => {
      const presets = await presetRepository.listSystemPresets();

      expect(presets).toHaveLength(4);
      expect(presets[0].id).toBe('quick');
      expect(presets[1].id).toBe('balanced');
      expect(presets[2].id).toBe('deep_dive');
      expect(presets[3].id).toBe('research');
    });

    it('all presets have isSystemPreset = true', async () => {
      const presets = await presetRepository.listSystemPresets();
      expect(presets.every(p => p.isSystemPreset)).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns preset for valid ID', async () => {
      const preset = await presetRepository.findById('balanced');

      expect(preset).not.toBeNull();
      expect(preset!.id).toBe('balanced');
      expect(preset!.brevityLevel).toBe(3);
    });

    it('returns null for invalid ID', async () => {
      const preset = await presetRepository.findById('nonexistent');
      expect(preset).toBeNull();
    });
  });

  describe('getPresetConfiguration', () => {
    it('returns configuration values for preset', async () => {
      const config = await presetRepository.getPresetConfiguration('research');

      expect(config).not.toBeNull();
      expect(config!.requireCitations).toBe(true);
      expect(config!.brevityLevel).toBe(2);
    });
  });
});
```

### Integration Test

```typescript
// Test creating a debate with configuration
import * as debateRepository from '../debate-repository.js';

describe('Debate Repository with Configuration', () => {
  it('creates debate with default config when not specified', async () => {
    const debate = await debateRepository.create({
      propositionText: 'Test proposition',
    });

    expect(debate.presetMode).toBe('balanced');
    expect(debate.brevityLevel).toBe(3);
    expect(debate.llmTemperature).toBe(0.7);
    expect(debate.maxTokensPerResponse).toBe(1024);
    expect(debate.requireCitations).toBe(false);
  });

  it('creates debate with custom config', async () => {
    const debate = await debateRepository.create({
      propositionText: 'Test proposition',
      presetMode: 'research',
      brevityLevel: 2,
      llmTemperature: 0.6,
      maxTokensPerResponse: 2048,
      requireCitations: true,
    });

    expect(debate.presetMode).toBe('research');
    expect(debate.brevityLevel).toBe(2);
    expect(debate.requireCitations).toBe(true);
  });
});
```

### Definition of Done

- [ ] `debate-repository.ts` updated with config field handling
- [ ] `mapRowToDebate` includes all new fields
- [ ] `create` function handles optional config fields with defaults
- [ ] `preset-repository.ts` created with all CRUD functions
- [ ] Repository exports updated
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing

---

## Notes

- DECIMAL values from PostgreSQL come as strings, must be parsed with `parseFloat()`
- Preset order is enforced in the query for consistent UI display
- Future: May add user-created preset support (requires auth)

---

**Estimated Time:** 4 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
