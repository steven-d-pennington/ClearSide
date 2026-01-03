# DUELOGIC-011: Allowed Sources Feature

> **Status:** 🟢 TO DO
> **Priority:** P1 (High - Important for quality)
> **Estimate:** M (1-2 days)
> **Dependencies:** DUELOGIC-001, DUELOGIC-008, DUELOGIC-009
> **Sprint:** Phase 3 - Post-MVP Enhancement

---

## Overview

Implement an "Allowed Sources" feature that enables users to specify URLs that LLMs can use as sources for their arguments during debates. By default, generic web search is allowed, but when specific sources are defined, chairs can only search and cite from those approved sources.

### Use Cases

1. **Academic Debates**: Restrict sources to peer-reviewed journals or specific research papers
2. **Legal Debates**: Limit to official legal databases and case law
3. **Corporate Policy**: Constrain to internal documentation and approved external sources
4. **Fact-Checking**: Ensure only verified news sources are used
5. **Educational**: Use only course materials or textbook sources

---

## Requirements

### Functional Requirements

- [ ] Users can specify a list of allowed source URLs/domains
- [ ] Default behavior allows generic web search when no sources specified
- [ ] When sources are specified, LLMs must only cite from those sources
- [ ] Source validation on input (valid URL format)
- [ ] Support for domain-level restrictions (e.g., `*.edu`, `arxiv.org`)
- [ ] Optional: Source categories/tags for organization
- [ ] Citations in arguments must include source attribution

### Configuration Options

```typescript
interface AllowedSourcesConfig {
  /** If true, any web source is allowed. If false, only specified sources */
  allowGenericWebSearch: boolean;

  /** List of allowed source URLs/domains */
  allowedSources: AllowedSource[];

  /** Require citations for factual claims */
  requireCitations: boolean;

  /** How strictly to enforce source restrictions */
  enforcementLevel: 'strict' | 'moderate' | 'advisory';
}

interface AllowedSource {
  /** URL or domain pattern (e.g., "arxiv.org", "*.edu", "https://example.com/paper.pdf") */
  pattern: string;

  /** Display name for the source */
  name?: string;

  /** Category for organization */
  category?: 'academic' | 'news' | 'legal' | 'official' | 'custom';

  /** Optional description */
  description?: string;
}
```

### Enforcement Levels

| Level | Behavior |
|-------|----------|
| **strict** | LLM must only use allowed sources; arguments without proper citations are flagged by Arbiter |
| **moderate** | LLM prioritizes allowed sources but may reference general knowledge; Arbiter notes when sources differ |
| **advisory** | LLM is encouraged to use allowed sources but not restricted; sources shown as suggestions |

---

## Implementation Guide

### 1. Type Definitions

**File:** `backend/src/types/duelogic.ts`

Add to existing types:

```typescript
/**
 * Allowed source configuration for debates
 */
export interface AllowedSource {
  /** Unique identifier */
  id: string;

  /** URL pattern (exact URL, domain, or wildcard) */
  pattern: string;

  /** Display name */
  name: string;

  /** Source category */
  category: 'academic' | 'news' | 'legal' | 'official' | 'custom';

  /** Optional description */
  description?: string;
}

export interface AllowedSourcesConfig {
  /** Allow any web source (default: true) */
  allowGenericWebSearch: boolean;

  /** Specific allowed sources (only used if allowGenericWebSearch is false) */
  sources: AllowedSource[];

  /** Require citations for factual claims */
  requireCitations: boolean;

  /** Enforcement level */
  enforcementLevel: 'strict' | 'moderate' | 'advisory';
}

/**
 * Citation in an argument
 */
export interface Citation {
  /** Source URL */
  url: string;

  /** Source title/name */
  title: string;

  /** Relevant quote or summary */
  excerpt?: string;

  /** Where in the argument this citation applies */
  referenceId: string;
}
```

Update `DuelogicConfig`:

```typescript
export interface DuelogicConfig {
  mode: 'duelogic';
  chairs: DuelogicChair[];
  arbiter: ArbiterConfig;
  flow: DuelogicFlowSettings;
  interruptions: InterruptionConfig;
  accountability: AccountabilitySettings;
  podcastMode: PodcastModeSettings;

  /** NEW: Source restrictions */
  sources: AllowedSourcesConfig;
}
```

### 2. Database Schema

**File:** `backend/src/db/migrations/012_add_allowed_sources.sql`

```sql
-- Allowed sources for debates
CREATE TABLE IF NOT EXISTS debate_allowed_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'custom',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source configuration settings
ALTER TABLE debates ADD COLUMN IF NOT EXISTS
    allow_generic_web_search BOOLEAN DEFAULT TRUE;

ALTER TABLE debates ADD COLUMN IF NOT EXISTS
    require_citations BOOLEAN DEFAULT FALSE;

ALTER TABLE debates ADD COLUMN IF NOT EXISTS
    source_enforcement TEXT DEFAULT 'advisory';

-- Citations in utterances
CREATE TABLE IF NOT EXISTS utterance_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utterance_id UUID NOT NULL REFERENCES duelogic_utterances(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    reference_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_debate_allowed_sources_debate
    ON debate_allowed_sources(debate_id);
CREATE INDEX IF NOT EXISTS idx_utterance_citations_utterance
    ON utterance_citations(utterance_id);
```

### 3. Repository Functions

**File:** `backend/src/db/repositories/sources-repository.ts`

```typescript
import { pool } from '../connection.js';
import type { AllowedSource, Citation } from '../../types/duelogic.js';

/**
 * Add allowed sources for a debate
 */
export async function addAllowedSources(
  debateId: string,
  sources: AllowedSource[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const source of sources) {
      await client.query(
        `INSERT INTO debate_allowed_sources
         (debate_id, pattern, name, category, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [debateId, source.pattern, source.name, source.category, source.description]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get allowed sources for a debate
 */
export async function getAllowedSources(debateId: string): Promise<AllowedSource[]> {
  const result = await pool.query(
    `SELECT id, pattern, name, category, description
     FROM debate_allowed_sources
     WHERE debate_id = $1
     ORDER BY category, name`,
    [debateId]
  );

  return result.rows;
}

/**
 * Check if a URL matches allowed sources
 */
export function isSourceAllowed(
  url: string,
  allowedSources: AllowedSource[],
  allowGenericWebSearch: boolean
): boolean {
  // If generic search is allowed and no specific sources, allow all
  if (allowGenericWebSearch && allowedSources.length === 0) {
    return true;
  }

  // Check against allowed patterns
  for (const source of allowedSources) {
    if (matchesPattern(url, source.pattern)) {
      return true;
    }
  }

  // If generic search is allowed, allow even if not in sources
  return allowGenericWebSearch;
}

/**
 * Match URL against pattern (supports wildcards)
 */
function matchesPattern(url: string, pattern: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Exact match
    if (pattern === hostname || pattern === url) {
      return true;
    }

    // Wildcard domain match (*.edu)
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return hostname.endsWith(suffix);
    }

    // Domain contains match
    if (hostname.includes(pattern)) {
      return true;
    }

    // URL starts with pattern
    if (url.startsWith(pattern)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Save citations for an utterance
 */
export async function saveCitations(
  utteranceId: string,
  citations: Citation[]
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const citation of citations) {
      await client.query(
        `INSERT INTO utterance_citations
         (utterance_id, url, title, excerpt, reference_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [utteranceId, citation.url, citation.title, citation.excerpt, citation.referenceId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 4. Chair Agent Prompt Updates

**File:** `backend/src/prompts/chair-prompts.ts`

Add source restriction context to chair prompts:

```typescript
function buildSourceRestrictionContext(config: AllowedSourcesConfig): string {
  if (config.allowGenericWebSearch && config.sources.length === 0) {
    return `
## Source Usage
You may use general web search and cite any credible sources for your arguments.
${config.requireCitations ? 'You MUST include citations for all factual claims.' : ''}
`;
  }

  const sourceList = config.sources
    .map(s => `- ${s.name} (${s.pattern})${s.description ? `: ${s.description}` : ''}`)
    .join('\n');

  const enforcementText = {
    strict: 'You MUST ONLY use the following sources. Arguments citing other sources will be flagged.',
    moderate: 'You SHOULD prioritize the following sources, but may reference general knowledge when necessary.',
    advisory: 'You are ENCOURAGED to use the following sources when relevant.',
  }[config.enforcementLevel];

  return `
## Source Restrictions
${enforcementText}

### Allowed Sources:
${sourceList}

${config.requireCitations ? '### Citation Requirement\nYou MUST include citations for all factual claims in the format: [Source Title](URL)' : ''}
`;
}
```

### 5. API Endpoints

**File:** `backend/src/routes/duelogic-routes.ts`

Add source management endpoints:

```typescript
// Add allowed sources to a debate
router.post('/debates/:id/sources', async (req, res) => {
  const { id } = req.params;
  const { sources } = req.body;

  try {
    await addAllowedSources(id, sources);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add sources' });
  }
});

// Get allowed sources for a debate
router.get('/debates/:id/sources', async (req, res) => {
  const { id } = req.params;

  try {
    const sources = await getAllowedSources(id);
    res.json({ success: true, sources });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get sources' });
  }
});

// Validate a source URL
router.post('/sources/validate', (req, res) => {
  const { url, allowedSources, allowGenericWebSearch } = req.body;

  const isAllowed = isSourceAllowed(url, allowedSources, allowGenericWebSearch);
  res.json({ success: true, isAllowed });
});
```

### 6. Frontend Components

**File:** `frontend/src/components/DuelogicConfig/SourcesSettings.tsx`

```tsx
import React, { useState } from 'react';
import styles from './DuelogicConfig.module.css';
import type { AllowedSource, AllowedSourcesConfig } from './duelogic-config.types';

interface SourcesSettingsProps {
  config: AllowedSourcesConfig;
  onChange: (config: AllowedSourcesConfig) => void;
}

export function SourcesSettings({ config, onChange }: SourcesSettingsProps) {
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceName, setNewSourceName] = useState('');

  const addSource = () => {
    if (!newSourceUrl.trim()) return;

    const newSource: AllowedSource = {
      id: crypto.randomUUID(),
      pattern: newSourceUrl.trim(),
      name: newSourceName.trim() || newSourceUrl.trim(),
      category: 'custom',
    };

    onChange({
      ...config,
      sources: [...config.sources, newSource],
    });

    setNewSourceUrl('');
    setNewSourceName('');
  };

  const removeSource = (id: string) => {
    onChange({
      ...config,
      sources: config.sources.filter(s => s.id !== id),
    });
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Source Restrictions</h3>

      <div className={styles.checkboxGroup}>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.allowGenericWebSearch}
            onChange={(e) => onChange({
              ...config,
              allowGenericWebSearch: e.target.checked,
            })}
          />
          <span>Allow generic web search</span>
        </label>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={config.requireCitations}
            onChange={(e) => onChange({
              ...config,
              requireCitations: e.target.checked,
            })}
          />
          <span>Require citations for factual claims</span>
        </label>
      </div>

      {!config.allowGenericWebSearch && (
        <>
          <div className={styles.enforcementLevel}>
            <label>Enforcement Level</label>
            <select
              value={config.enforcementLevel}
              onChange={(e) => onChange({
                ...config,
                enforcementLevel: e.target.value as 'strict' | 'moderate' | 'advisory',
              })}
            >
              <option value="strict">Strict - Only allowed sources</option>
              <option value="moderate">Moderate - Prioritize allowed sources</option>
              <option value="advisory">Advisory - Suggest allowed sources</option>
            </select>
          </div>

          <div className={styles.sourceList}>
            <h4>Allowed Sources</h4>
            {config.sources.map((source) => (
              <div key={source.id} className={styles.sourceItem}>
                <span className={styles.sourceName}>{source.name}</span>
                <span className={styles.sourcePattern}>{source.pattern}</span>
                <button
                  type="button"
                  onClick={() => removeSource(source.id)}
                  className={styles.removeButton}
                >
                  Remove
                </button>
              </div>
            ))}

            {config.sources.length === 0 && (
              <p className={styles.emptyMessage}>
                No sources defined. Add URLs or domains below.
              </p>
            )}
          </div>

          <div className={styles.addSource}>
            <input
              type="text"
              placeholder="URL or domain (e.g., arxiv.org, *.edu)"
              value={newSourceUrl}
              onChange={(e) => setNewSourceUrl(e.target.value)}
              className={styles.input}
            />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              className={styles.input}
            />
            <button
              type="button"
              onClick={addSource}
              disabled={!newSourceUrl.trim()}
              className={styles.addButton}
            >
              Add Source
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] Type definitions for AllowedSourcesConfig added to duelogic types
- [ ] Database migration creates allowed_sources and citations tables
- [ ] Repository functions for source management implemented
- [ ] Chair prompts include source restriction context
- [ ] API endpoints for source CRUD operations working
- [ ] Frontend SourcesSettings component created
- [ ] Integration with DuelogicConfigPanel complete
- [ ] Sources passed to orchestrator and included in chair context
- [ ] Unit tests for source matching logic (wildcards, domains)
- [ ] E2E test for debate with restricted sources

---

## Testing

### Unit Tests

```typescript
describe('Source Matching', () => {
  it('should match exact domain', () => {
    expect(isSourceAllowed('https://arxiv.org/paper',
      [{ pattern: 'arxiv.org', ... }], false)).toBe(true);
  });

  it('should match wildcard domain', () => {
    expect(isSourceAllowed('https://mit.edu/research',
      [{ pattern: '*.edu', ... }], false)).toBe(true);
  });

  it('should reject non-matching domain', () => {
    expect(isSourceAllowed('https://reddit.com',
      [{ pattern: 'arxiv.org', ... }], false)).toBe(false);
  });

  it('should allow any source when generic search enabled', () => {
    expect(isSourceAllowed('https://anything.com', [], true)).toBe(true);
  });
});
```

---

## Notes

- Consider caching source validation results for performance
- Future enhancement: Preset source lists (academic, news, legal)
- Future enhancement: Source quality scoring
- Consider rate limiting for source fetching to avoid abuse

---

*Created: 2026-01-03*
*Task ID: DUELOGIC-011*
