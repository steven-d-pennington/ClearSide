# CONV-003: Persona Repository and Seed Data

**Task ID:** CONV-003
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-001 (Database Schema), CONV-002 (Types)
**Status:** Ready

---

## Context

This task creates the PersonaRepository for managing the 12 podcast personas. The repository provides CRUD operations and queries for retrieving personas by slug, listing all personas, and searching by topic preferences.

**References:**
- [CONV-001](./CONV-001.md) - Database schema with persona table
- [CONV-002](./CONV-002.md) - TypeScript types
- Existing patterns: `backend/src/db/repositories/research-repository.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `PersonaRepository` class in `backend/src/db/repositories/persona-repository.ts`
- [ ] Implement `findAll()` to list all 12 personas
- [ ] Implement `findBySlug(slug)` to get single persona
- [ ] Implement `findById(id)` to get persona by UUID
- [ ] Implement `findByTopics(topics[])` to find personas interested in specific topics
- [ ] Implement row-to-object mapper with proper type conversion
- [ ] Add unit tests with >90% coverage
- [ ] Verify all 12 personas are retrievable after CONV-001 migration

---

## Implementation Guide

### Repository Implementation

Create file: `backend/src/db/repositories/persona-repository.ts`

```typescript
import { Pool } from 'pg';
import {
  PodcastPersona,
  VoiceCharacteristics,
} from '../../types/conversation.js';

/**
 * Repository for managing podcast personas
 */
export class PersonaRepository {
  constructor(private pool: Pool) {}

  // ========== Query Operations ==========

  /**
   * Get all 12 podcast personas
   */
  async findAll(): Promise<PodcastPersona[]> {
    const result = await this.pool.query(`
      SELECT * FROM podcast_personas
      ORDER BY name ASC
    `);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find persona by URL-friendly slug
   */
  async findBySlug(slug: string): Promise<PodcastPersona | null> {
    const result = await this.pool.query(`
      SELECT * FROM podcast_personas WHERE slug = $1
    `, [slug]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find persona by UUID
   */
  async findById(id: string): Promise<PodcastPersona | null> {
    const result = await this.pool.query(`
      SELECT * FROM podcast_personas WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find personas by multiple slugs (for batch loading)
   */
  async findBySlugs(slugs: string[]): Promise<PodcastPersona[]> {
    if (slugs.length === 0) return [];

    const result = await this.pool.query(`
      SELECT * FROM podcast_personas
      WHERE slug = ANY($1)
      ORDER BY name ASC
    `, [slugs]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find personas by multiple IDs (for batch loading)
   */
  async findByIds(ids: string[]): Promise<PodcastPersona[]> {
    if (ids.length === 0) return [];

    const result = await this.pool.query(`
      SELECT * FROM podcast_personas
      WHERE id = ANY($1)
      ORDER BY name ASC
    `, [ids]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find personas whose preferred topics overlap with given topics
   */
  async findByTopics(topics: string[]): Promise<PodcastPersona[]> {
    if (topics.length === 0) return [];

    const result = await this.pool.query(`
      SELECT * FROM podcast_personas
      WHERE preferred_topics && $1
      ORDER BY
        array_length(
          ARRAY(SELECT unnest(preferred_topics) INTERSECT SELECT unnest($1::text[])),
          1
        ) DESC NULLS LAST,
        name ASC
    `, [topics]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Search personas by name or backstory
   */
  async search(query: string): Promise<PodcastPersona[]> {
    const searchPattern = `%${query}%`;

    const result = await this.pool.query(`
      SELECT * FROM podcast_personas
      WHERE
        name ILIKE $1
        OR backstory ILIKE $1
        OR worldview ILIKE $1
      ORDER BY name ASC
    `, [searchPattern]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get count of personas (should always be 12)
   */
  async count(): Promise<number> {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count FROM podcast_personas
    `);

    return parseInt(result.rows[0].count);
  }

  /**
   * Get all persona slugs (lightweight query)
   */
  async getAllSlugs(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT slug FROM podcast_personas ORDER BY name ASC
    `);

    return result.rows.map(row => row.slug);
  }

  /**
   * Get persona name and emoji only (for dropdowns)
   */
  async getSummaries(): Promise<Array<{ id: string; slug: string; name: string; avatarEmoji: string }>> {
    const result = await this.pool.query(`
      SELECT id, slug, name, avatar_emoji
      FROM podcast_personas
      ORDER BY name ASC
    `);

    return result.rows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      avatarEmoji: row.avatar_emoji,
    }));
  }

  // ========== Row Mapper ==========

  private mapRow(row: any): PodcastPersona {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      avatarEmoji: row.avatar_emoji,
      backstory: row.backstory,
      speakingStyle: row.speaking_style,
      worldview: row.worldview,
      quirks: row.quirks || [],
      voiceCharacteristics: this.parseVoiceCharacteristics(row.voice_characteristics),
      examplePhrases: row.example_phrases || [],
      preferredTopics: row.preferred_topics || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseVoiceCharacteristics(json: any): VoiceCharacteristics {
    if (!json) return {};

    // Handle both string and object
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;

    return {
      pitch: parsed.pitch,
      pace: parsed.pace,
      warmth: parsed.warmth,
      energy: parsed.energy,
      tone: parsed.tone,
      accent: parsed.accent,
    };
  }
}
```

### Unit Tests

Create file: `backend/src/db/repositories/__tests__/persona-repository.test.ts`

```typescript
import { Pool } from 'pg';
import { PersonaRepository } from '../persona-repository';

describe('PersonaRepository', () => {
  let pool: Pool;
  let repo: PersonaRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/clearside_test',
    });
    repo = new PersonaRepository(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('findAll', () => {
    it('should return all 12 personas', async () => {
      const personas = await repo.findAll();
      expect(personas).toHaveLength(12);
    });

    it('should return personas sorted by name', async () => {
      const personas = await repo.findAll();
      const names = personas.map(p => p.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('should have all required fields populated', async () => {
      const personas = await repo.findAll();
      for (const persona of personas) {
        expect(persona.id).toBeDefined();
        expect(persona.slug).toBeDefined();
        expect(persona.name).toBeDefined();
        expect(persona.backstory).toBeDefined();
        expect(persona.speakingStyle).toBeDefined();
        expect(persona.worldview).toBeDefined();
        expect(Array.isArray(persona.quirks)).toBe(true);
        expect(Array.isArray(persona.examplePhrases)).toBe(true);
      }
    });
  });

  describe('findBySlug', () => {
    it('should find professor_clara by slug', async () => {
      const persona = await repo.findBySlug('professor_clara');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Professor Clara Chen');
    });

    it('should find maverick_mike by slug', async () => {
      const persona = await repo.findBySlug('maverick_mike');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Maverick Mike Torres');
    });

    it('should return null for invalid slug', async () => {
      const persona = await repo.findBySlug('nonexistent_persona');
      expect(persona).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find persona by valid UUID', async () => {
      const all = await repo.findAll();
      const first = all[0];

      const found = await repo.findById(first.id);
      expect(found).not.toBeNull();
      expect(found!.slug).toBe(first.slug);
    });

    it('should return null for invalid UUID', async () => {
      const persona = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(persona).toBeNull();
    });
  });

  describe('findBySlugs', () => {
    it('should find multiple personas by slugs', async () => {
      const slugs = ['professor_clara', 'maverick_mike', 'dr_sarah'];
      const personas = await repo.findBySlugs(slugs);
      expect(personas).toHaveLength(3);
    });

    it('should return empty array for empty input', async () => {
      const personas = await repo.findBySlugs([]);
      expect(personas).toHaveLength(0);
    });
  });

  describe('findByTopics', () => {
    it('should find personas interested in technology', async () => {
      const personas = await repo.findByTopics(['technology']);
      expect(personas.length).toBeGreaterThan(0);

      // Priya and Mike should be interested in tech
      const slugs = personas.map(p => p.slug);
      expect(slugs).toContain('priya_sharma');
    });

    it('should find personas interested in ethics', async () => {
      const personas = await repo.findByTopics(['ethics']);
      expect(personas.length).toBeGreaterThan(0);

      // Rabbi David and Professor Clara should be interested
      const slugs = personas.map(p => p.slug);
      expect(slugs).toContain('rabbi_david');
    });

    it('should return empty array for non-matching topics', async () => {
      const personas = await repo.findByTopics(['underwater_basket_weaving']);
      expect(personas).toHaveLength(0);
    });
  });

  describe('search', () => {
    it('should find persona by name', async () => {
      const personas = await repo.search('Clara');
      expect(personas.length).toBeGreaterThan(0);
      expect(personas[0].name).toContain('Clara');
    });

    it('should find persona by backstory keyword', async () => {
      const personas = await repo.search('entrepreneur');
      expect(personas.length).toBeGreaterThan(0);
    });
  });

  describe('count', () => {
    it('should return 12', async () => {
      const count = await repo.count();
      expect(count).toBe(12);
    });
  });

  describe('getSummaries', () => {
    it('should return lightweight persona data', async () => {
      const summaries = await repo.getSummaries();
      expect(summaries).toHaveLength(12);

      for (const summary of summaries) {
        expect(summary.id).toBeDefined();
        expect(summary.slug).toBeDefined();
        expect(summary.name).toBeDefined();
        expect(summary.avatarEmoji).toBeDefined();
      }
    });
  });

  describe('voice characteristics parsing', () => {
    it('should parse voice characteristics correctly', async () => {
      const persona = await repo.findBySlug('professor_clara');
      expect(persona).not.toBeNull();
      expect(persona!.voiceCharacteristics).toBeDefined();
      expect(persona!.voiceCharacteristics.warmth).toBe('high');
    });
  });
});
```

---

## Validation

### How to Test

1. Ensure CONV-001 migration has run (12 personas seeded)

2. Run unit tests:
   ```bash
   cd backend
   npm test -- --grep "PersonaRepository"
   ```

3. Manual verification:
   ```typescript
   const repo = new PersonaRepository(pool);

   // Get all personas
   const all = await repo.findAll();
   console.log(`Found ${all.length} personas`);

   // Find by slug
   const clara = await repo.findBySlug('professor_clara');
   console.log(clara?.name); // "Professor Clara Chen"

   // Find by topics
   const techFolks = await repo.findByTopics(['technology', 'AI']);
   console.log(techFolks.map(p => p.name));
   ```

### Definition of Done

- [ ] `PersonaRepository` class created and exported
- [ ] All query methods implemented
- [ ] Row mapper handles all columns including JSONB
- [ ] Unit tests with >90% coverage
- [ ] All 12 personas retrievable via `findAll()`
- [ ] `findBySlug` works for all persona slugs
- [ ] `findByTopics` returns relevant personas
- [ ] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-003 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
