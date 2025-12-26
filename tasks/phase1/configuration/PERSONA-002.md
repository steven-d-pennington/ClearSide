# PERSONA-002: Persona Types and Repository

**Priority:** P0
**Estimate:** M
**Labels:** `personas`, `types`, `backend`
**Status:** 🟢 TO DO

---

## Context

Create TypeScript types for personas and a repository for database operations. Update the database types to include persona references in the Debate interface.

**References:**
- [Configuration Types](./CONFIG-002.md) - Type patterns
- [Persona Migration](./PERSONA-001.md) - Database schema

---

## Requirements

### Acceptance Criteria

- [ ] Add persona types to `configuration.ts`
- [ ] Create `persona-repository.ts` with CRUD operations
- [ ] Update `database.ts` to include persona fields in Debate
- [ ] Update `CreateDebateInput` to accept persona IDs
- [ ] Repository handles null personas correctly
- [ ] All system personas can be listed

---

## Implementation Guide

### Add to Configuration Types

Update `backend/src/types/configuration.ts`:

```typescript
// ============================================================================
// Persona Types
// ============================================================================

/**
 * Persona archetype categories
 */
export type PersonaArchetype =
  | 'academic'
  | 'pragmatic'
  | 'empirical'
  | 'legal'
  | 'economic'
  | 'moral';

/**
 * Persona definition
 */
export interface Persona {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Category/archetype */
  archetype: PersonaArchetype;

  /** Brief description */
  description: string | null;

  /** How this persona argues */
  argumentationStyle: string;

  /** Suggested vocabulary */
  vocabularyHints: string | null;

  /** Topic areas of focus */
  focusAreas: string[];

  /** Rhetorical approach */
  rhetoricalPreferences: string | null;

  /** Text to inject into agent system prompt */
  systemPromptAddition: string;

  /** Emoji avatar */
  avatarEmoji: string | null;

  /** Primary color (hex) */
  colorPrimary: string | null;

  /** Secondary color (hex) */
  colorSecondary: string | null;

  /** Whether this is a system-defined persona */
  isSystemPersona: boolean;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Simplified persona for display/selection
 */
export interface PersonaSummary {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  description: string | null;
  avatarEmoji: string | null;
  colorPrimary: string | null;
}

/**
 * Persona selection for a debate
 */
export interface PersonaSelection {
  proPersonaId: string | null;
  conPersonaId: string | null;
}

/**
 * Archetype display info
 */
export const ARCHETYPE_INFO: Record<PersonaArchetype, { name: string; description: string }> = {
  academic: {
    name: 'Academic',
    description: 'Theoretical and philosophical approach',
  },
  pragmatic: {
    name: 'Pragmatic',
    description: 'Practical and politically-aware approach',
  },
  empirical: {
    name: 'Empirical',
    description: 'Evidence-based and data-driven approach',
  },
  legal: {
    name: 'Legal',
    description: 'Rights-focused and precedent-based approach',
  },
  economic: {
    name: 'Economic',
    description: 'Incentive and trade-off focused approach',
  },
  moral: {
    name: 'Moral',
    description: 'Ethics and values focused approach',
  },
};
```

### Update Database Types

Update `backend/src/types/database.ts`:

```typescript
// Add to Debate interface:
/** Pro advocate persona (null = default) */
proPersonaId: string | null;

/** Con advocate persona (null = default) */
conPersonaId: string | null;

// Add to DebateRow:
pro_persona_id: string | null;
con_persona_id: string | null;

// Update CreateDebateInput:
export interface CreateDebateInput {
  propositionText: string;
  propositionContext?: Record<string, unknown>;
  flowMode?: FlowMode;
  // Configuration fields
  presetMode?: PresetMode;
  brevityLevel?: number;
  llmTemperature?: number;
  maxTokensPerResponse?: number;
  requireCitations?: boolean;
  // Persona fields
  proPersonaId?: string | null;
  conPersonaId?: string | null;
}
```

### Create Persona Repository

Create `backend/src/db/repositories/persona-repository.ts`:

```typescript
/**
 * Persona Repository
 *
 * Handles database operations for debate personas.
 */

import { pool } from '../connection.js';
import type { Persona, PersonaSummary, PersonaArchetype } from '../../types/configuration.js';

/**
 * Raw database row for personas table
 */
interface PersonaRow {
  id: string;
  name: string;
  archetype: string;
  description: string | null;
  argumentation_style: string;
  vocabulary_hints: string | null;
  focus_areas: string[];
  rhetorical_preferences: string | null;
  system_prompt_addition: string;
  avatar_emoji: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  is_system_persona: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map database row to Persona
 */
function mapRowToPersona(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype as PersonaArchetype,
    description: row.description,
    argumentationStyle: row.argumentation_style,
    vocabularyHints: row.vocabulary_hints,
    focusAreas: row.focus_areas ?? [],
    rhetoricalPreferences: row.rhetorical_preferences,
    systemPromptAddition: row.system_prompt_addition,
    avatarEmoji: row.avatar_emoji,
    colorPrimary: row.color_primary,
    colorSecondary: row.color_secondary,
    isSystemPersona: row.is_system_persona,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map row to PersonaSummary (for listings)
 */
function mapRowToSummary(row: PersonaRow): PersonaSummary {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype as PersonaArchetype,
    description: row.description,
    avatarEmoji: row.avatar_emoji,
    colorPrimary: row.color_primary,
  };
}

/**
 * Get all system personas
 */
export async function listSystemPersonas(): Promise<Persona[]> {
  const query = `
    SELECT * FROM personas
    WHERE is_system_persona = true
    ORDER BY
      CASE archetype
        WHEN 'academic' THEN 1
        WHEN 'pragmatic' THEN 2
        WHEN 'empirical' THEN 3
        WHEN 'legal' THEN 4
        WHEN 'economic' THEN 5
        WHEN 'moral' THEN 6
        ELSE 7
      END
  `;

  const result = await pool.query(query);
  return result.rows.map(mapRowToPersona);
}

/**
 * Get persona summaries for selection UI
 */
export async function listPersonaSummaries(): Promise<PersonaSummary[]> {
  const query = `
    SELECT id, name, archetype, description, avatar_emoji, color_primary
    FROM personas
    WHERE is_system_persona = true
    ORDER BY name
  `;

  const result = await pool.query(query);
  return result.rows.map(mapRowToSummary);
}

/**
 * Get all personas
 */
export async function listAll(): Promise<Persona[]> {
  const query = `
    SELECT * FROM personas
    ORDER BY is_system_persona DESC, name ASC
  `;

  const result = await pool.query(query);
  return result.rows.map(mapRowToPersona);
}

/**
 * Get a persona by ID
 */
export async function findById(id: string): Promise<Persona | null> {
  const query = `SELECT * FROM personas WHERE id = $1`;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToPersona(result.rows[0]);
}

/**
 * Get personas by archetype
 */
export async function findByArchetype(archetype: PersonaArchetype): Promise<Persona[]> {
  const query = `
    SELECT * FROM personas
    WHERE archetype = $1
    ORDER BY name
  `;

  const result = await pool.query(query, [archetype]);
  return result.rows.map(mapRowToPersona);
}

/**
 * Check if a persona exists
 */
export async function exists(id: string): Promise<boolean> {
  const query = `SELECT 1 FROM personas WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows.length > 0;
}

/**
 * Get the system prompt addition for a persona
 * Returns null if persona doesn't exist
 */
export async function getSystemPromptAddition(id: string): Promise<string | null> {
  const query = `SELECT system_prompt_addition FROM personas WHERE id = $1`;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].system_prompt_addition;
}

/**
 * Get personas for both sides of a debate (handles null)
 */
export async function getDebatePersonas(
  proPersonaId: string | null,
  conPersonaId: string | null
): Promise<{ pro: Persona | null; con: Persona | null }> {
  const pro = proPersonaId ? await findById(proPersonaId) : null;
  const con = conPersonaId ? await findById(conPersonaId) : null;
  return { pro, con };
}

// Export as object for easier mocking
export const personaRepository = {
  listSystemPersonas,
  listPersonaSummaries,
  listAll,
  findById,
  findByArchetype,
  exists,
  getSystemPromptAddition,
  getDebatePersonas,
};

export default personaRepository;
```

### Update Debate Repository

Update `backend/src/db/repositories/debate-repository.ts` to handle persona fields:

```typescript
// In mapRowToDebate:
proPersonaId: row.pro_persona_id,
conPersonaId: row.con_persona_id,

// In create function:
const query = `
  INSERT INTO debates (
    -- ... existing columns ...
    pro_persona_id,
    con_persona_id,
    created_at,
    updated_at
  ) VALUES (
    -- ... existing values ...
    $16, $17, $18, $19
  ) RETURNING *
`;

const values = [
  // ... existing values ...
  input.proPersonaId ?? null,
  input.conPersonaId ?? null,
  now,
  now,
];
```

### Export from Index

Update `backend/src/db/repositories/index.ts`:

```typescript
export * from './persona-repository.js';
```

---

## Dependencies

**Task Dependencies:**
- PERSONA-001: Database migration (table must exist)
- CONFIG-002: Configuration types (for persona types location)

---

## Validation

### Unit Tests

```typescript
// backend/src/db/repositories/__tests__/persona-repository.test.ts

import { personaRepository } from '../persona-repository.js';

describe('Persona Repository', () => {
  describe('listSystemPersonas', () => {
    it('returns all 6 system personas', async () => {
      const personas = await personaRepository.listSystemPersonas();

      expect(personas).toHaveLength(6);
      expect(personas.every(p => p.isSystemPersona)).toBe(true);
    });

    it('returns personas in archetype order', async () => {
      const personas = await personaRepository.listSystemPersonas();

      expect(personas[0].archetype).toBe('academic');
      expect(personas[1].archetype).toBe('pragmatic');
    });
  });

  describe('findById', () => {
    it('returns persona for valid ID', async () => {
      const persona = await personaRepository.findById('theorist');

      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('The Theorist');
      expect(persona!.archetype).toBe('academic');
    });

    it('includes full systemPromptAddition', async () => {
      const persona = await personaRepository.findById('scientist');

      expect(persona!.systemPromptAddition).toContain('empirical');
      expect(persona!.systemPromptAddition).toContain('data');
    });

    it('returns null for invalid ID', async () => {
      const persona = await personaRepository.findById('nonexistent');
      expect(persona).toBeNull();
    });
  });

  describe('listPersonaSummaries', () => {
    it('returns summaries for selection UI', async () => {
      const summaries = await personaRepository.listPersonaSummaries();

      expect(summaries).toHaveLength(6);
      expect(summaries[0]).toHaveProperty('id');
      expect(summaries[0]).toHaveProperty('name');
      expect(summaries[0]).toHaveProperty('avatarEmoji');
      // Should NOT have full prompt
      expect(summaries[0]).not.toHaveProperty('systemPromptAddition');
    });
  });

  describe('getDebatePersonas', () => {
    it('returns both personas when both provided', async () => {
      const { pro, con } = await personaRepository.getDebatePersonas('theorist', 'scientist');

      expect(pro).not.toBeNull();
      expect(con).not.toBeNull();
      expect(pro!.id).toBe('theorist');
      expect(con!.id).toBe('scientist');
    });

    it('handles null persona IDs', async () => {
      const { pro, con } = await personaRepository.getDebatePersonas(null, 'lawyer');

      expect(pro).toBeNull();
      expect(con).not.toBeNull();
    });
  });
});
```

### Definition of Done

- [ ] Persona types added to configuration.ts
- [ ] PersonaArchetype type defined
- [ ] Persona and PersonaSummary interfaces complete
- [ ] persona-repository.ts created with all operations
- [ ] database.ts updated with persona fields
- [ ] CreateDebateInput accepts persona IDs
- [ ] Repository exports updated
- [ ] Unit tests written and passing

---

## Notes

### Null Handling

Personas are optional. When `proPersonaId` or `conPersonaId` is null:
- Repository returns null
- Agent uses default identity
- UI shows "Default" option

### Summary vs Full Persona

- `listPersonaSummaries()` - lightweight for selection UI
- `listSystemPersonas()` / `findById()` - full data including prompt addition

---

**Estimated Time:** 4 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
