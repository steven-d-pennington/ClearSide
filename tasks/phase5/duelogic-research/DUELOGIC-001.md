# DUELOGIC-001: Database Schema & Types for Research System

**Task ID:** DUELOGIC-001
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** None
**Status:** Ready

---

## Context

The Duelogic Research & Automated Episode Generation feature requires database schema to track research configurations, research jobs, research results, and episode proposals. This task establishes the foundation types and database migrations needed for the entire research pipeline.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Duelogic Research & Automated Episode Generation
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Database patterns
- Existing database patterns in `backend/src/db/`

---

## Requirements

### Acceptance Criteria

- [ ] Create TypeScript interfaces for all research system types
- [ ] Create database migration for `research_configs` table
- [ ] Create database migration for `research_jobs` table
- [ ] Create database migration for `research_results` table
- [ ] Create database migration for `episode_proposals` table
- [ ] Create `ResearchRepository` for database operations
- [ ] Create `EpisodeProposalRepository` for proposal management
- [ ] Add research category enum types
- [ ] Include job status tracking (pending, running, completed, failed)
- [ ] Add quality scoring fields (controversy, timeliness, depth)
- [ ] Write unit tests for repository operations

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- Store research configurations with scheduling and categories
- Track research job execution with token usage
- Persist research results with sources and quality scores
- Manage episode proposals with admin workflow states
- Support edit history tracking for modified proposals

---

## Implementation Guide

### TypeScript Types

```typescript
// backend/src/types/duelogic-research.ts

export type ResearchCategory =
  | 'technology_ethics'
  | 'climate_environment'
  | 'politics_governance'
  | 'bioethics_medicine'
  | 'economics_inequality'
  | 'ai_automation'
  | 'social_justice'
  | 'international_relations'
  | 'privacy_surveillance'
  | 'education_culture';

export type ResearchJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'scheduled';

export interface ResearchConfig {
  id: string;
  name: string;
  schedule: string;                    // Cron expression
  enabled: boolean;
  categories: ResearchCategory[];
  perplexityModel: string;             // e.g., "perplexity/sonar-pro"
  maxTopicsPerRun: number;
  minControversyScore: number;         // 0-1, filter boring topics
  searchQueries: string[];             // Custom research prompts
  excludeTopics: string[];             // Topics to avoid
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchJob {
  id: string;
  configId: string;
  status: ResearchJobStatus;
  startedAt?: Date;
  completedAt?: Date;
  topicsDiscovered: number;
  episodesGenerated: number;
  tokensUsed: number;
  error?: string;
  createdAt: Date;
}

export interface ResearchSource {
  url: string;
  title: string;
  domain: string;
  publishedAt?: Date;
  excerpt: string;
  credibilityScore?: number;           // Optional: domain reputation
}

export interface ResearchResult {
  id: string;
  jobId: string;
  topic: string;
  category: ResearchCategory;
  sources: ResearchSource[];
  summary: string;
  controversyScore: number;            // 0-1, how debatable is this?
  timeliness: number;                  // 0-1, how current?
  depth: number;                       // 0-1, enough for episode?
  rawPerplexityResponse: string;
  createdAt: Date;
}

export interface PhilosophicalChair {
  name: string;                        // e.g., "Utilitarian Chair"
  position: string;                    // Main argument
  mustAcknowledge: string;             // Required self-critique
}

export interface EpisodeEdit {
  field: string;
  oldValue: string;
  newValue: string;
  editedAt: Date;
  editedBy: string;
}

export interface EpisodeProposal {
  id: string;
  researchResultId: string;
  status: ProposalStatus;

  // Episode content (matches duelogic-season1-episodes.md format)
  episodeNumber?: number;              // Assigned on approval
  title: string;                       // e.g., "The Algorithm's Gavel"
  subtitle: string;                    // e.g., "Can Code Be Fairer Than Conscience?"
  description: string;                 // Compelling 2-3 sentence hook
  proposition: string;                 // Clear binary debate proposition
  contextForPanel: string;             // Background for AI debaters

  chairs: PhilosophicalChair[];
  keyTensions: string[];

  // Metadata
  generatedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  scheduledFor?: Date;
  adminNotes?: string;

  // Edits tracking
  wasEdited: boolean;
  editHistory?: EpisodeEdit[];
}

// Quality thresholds for filtering research results
export interface QualityThresholds {
  minControversyScore: number;
  minTimeliness: number;
  minDepth: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minControversyScore: 0.65,
  minTimeliness: 0.4,
  minDepth: 0.7,
};

// Research config defaults
export const DEFAULT_RESEARCH_CONFIG: Partial<ResearchConfig> = {
  perplexityModel: 'perplexity/sonar-pro',
  maxTopicsPerRun: 20,
  minControversyScore: 0.6,
  enabled: true,
  categories: [
    'technology_ethics',
    'climate_environment',
    'bioethics_medicine',
    'ai_automation',
    'economics_inequality',
  ],
};
```

### Database Migration

```sql
-- backend/src/db/migrations/XXX_add_duelogic_research.sql

-- Research configuration table
CREATE TABLE research_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,  -- Cron expression
  enabled BOOLEAN DEFAULT true,
  categories TEXT[] NOT NULL,
  perplexity_model TEXT NOT NULL,
  max_topics_per_run INTEGER DEFAULT 20,
  min_controversy_score REAL DEFAULT 0.6,
  search_queries TEXT[],
  exclude_topics TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Research job executions table
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES research_configs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  topics_discovered INTEGER DEFAULT 0,
  episodes_generated INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_job_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Raw research results table
CREATE TABLE research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES research_jobs(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  category TEXT NOT NULL,
  sources JSONB NOT NULL,
  summary TEXT NOT NULL,
  controversy_score REAL NOT NULL,
  timeliness REAL NOT NULL,
  depth REAL NOT NULL,
  raw_perplexity_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_category CHECK (category IN (
    'technology_ethics', 'climate_environment', 'politics_governance',
    'bioethics_medicine', 'economics_inequality', 'ai_automation',
    'social_justice', 'international_relations', 'privacy_surveillance',
    'education_culture'
  )),
  CONSTRAINT valid_controversy CHECK (controversy_score >= 0 AND controversy_score <= 1),
  CONSTRAINT valid_timeliness CHECK (timeliness >= 0 AND timeliness <= 1),
  CONSTRAINT valid_depth CHECK (depth >= 0 AND depth <= 1)
);

-- Episode proposals table
CREATE TABLE episode_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_result_id UUID REFERENCES research_results(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  episode_number INTEGER,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  description TEXT NOT NULL,
  proposition TEXT NOT NULL,
  context_for_panel TEXT NOT NULL,
  chairs JSONB NOT NULL,
  key_tensions TEXT[] NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  scheduled_for DATE,
  admin_notes TEXT,
  was_edited BOOLEAN DEFAULT false,
  edit_history JSONB,

  CONSTRAINT valid_proposal_status CHECK (status IN ('pending', 'approved', 'rejected', 'scheduled'))
);

-- Indexes for efficient lookups
CREATE INDEX idx_research_jobs_config ON research_jobs(config_id);
CREATE INDEX idx_research_jobs_status ON research_jobs(status);
CREATE INDEX idx_research_results_job ON research_results(job_id);
CREATE INDEX idx_research_results_category ON research_results(category);
CREATE INDEX idx_proposals_status ON episode_proposals(status);
CREATE INDEX idx_proposals_scheduled ON episode_proposals(scheduled_for)
  WHERE status = 'approved' OR status = 'scheduled';
CREATE INDEX idx_proposals_research ON episode_proposals(research_result_id);

-- Trigger for updated_at on research_configs
CREATE TRIGGER update_research_configs_updated_at
  BEFORE UPDATE ON research_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Repository Implementation

```typescript
// backend/src/db/repositories/research-repository.ts

import { Pool } from 'pg';
import {
  ResearchConfig,
  ResearchJob,
  ResearchResult,
  ResearchJobStatus,
  ResearchCategory,
  ResearchSource
} from '../../types/duelogic-research.js';

export class ResearchRepository {
  constructor(private pool: Pool) {}

  // ========== Research Config Operations ==========

  async createConfig(config: Omit<ResearchConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResearchConfig> {
    const result = await this.pool.query(`
      INSERT INTO research_configs (
        name, schedule, enabled, categories, perplexity_model,
        max_topics_per_run, min_controversy_score, search_queries, exclude_topics
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      config.name,
      config.schedule,
      config.enabled,
      config.categories,
      config.perplexityModel,
      config.maxTopicsPerRun,
      config.minControversyScore,
      config.searchQueries,
      config.excludeTopics
    ]);

    return this.mapConfigRow(result.rows[0]);
  }

  async findConfigById(id: string): Promise<ResearchConfig | null> {
    const result = await this.pool.query(`
      SELECT * FROM research_configs WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapConfigRow(result.rows[0]) : null;
  }

  async findAllConfigs(): Promise<ResearchConfig[]> {
    const result = await this.pool.query(`
      SELECT * FROM research_configs ORDER BY created_at DESC
    `);

    return result.rows.map(row => this.mapConfigRow(row));
  }

  async findEnabledConfigs(): Promise<ResearchConfig[]> {
    const result = await this.pool.query(`
      SELECT * FROM research_configs WHERE enabled = true ORDER BY created_at DESC
    `);

    return result.rows.map(row => this.mapConfigRow(row));
  }

  async updateConfig(id: string, updates: Partial<ResearchConfig>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.schedule !== undefined) {
      fields.push(`schedule = $${paramIndex++}`);
      values.push(updates.schedule);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }
    if (updates.categories !== undefined) {
      fields.push(`categories = $${paramIndex++}`);
      values.push(updates.categories);
    }
    if (updates.perplexityModel !== undefined) {
      fields.push(`perplexity_model = $${paramIndex++}`);
      values.push(updates.perplexityModel);
    }
    if (updates.maxTopicsPerRun !== undefined) {
      fields.push(`max_topics_per_run = $${paramIndex++}`);
      values.push(updates.maxTopicsPerRun);
    }
    if (updates.minControversyScore !== undefined) {
      fields.push(`min_controversy_score = $${paramIndex++}`);
      values.push(updates.minControversyScore);
    }
    if (updates.searchQueries !== undefined) {
      fields.push(`search_queries = $${paramIndex++}`);
      values.push(updates.searchQueries);
    }
    if (updates.excludeTopics !== undefined) {
      fields.push(`exclude_topics = $${paramIndex++}`);
      values.push(updates.excludeTopics);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.pool.query(`
      UPDATE research_configs SET ${fields.join(', ')} WHERE id = $${paramIndex}
    `, values);
  }

  async deleteConfig(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM research_configs WHERE id = $1`, [id]);
  }

  // ========== Research Job Operations ==========

  async createJob(configId: string): Promise<ResearchJob> {
    const result = await this.pool.query(`
      INSERT INTO research_jobs (config_id)
      VALUES ($1)
      RETURNING *
    `, [configId]);

    return this.mapJobRow(result.rows[0]);
  }

  async findJobById(id: string): Promise<ResearchJob | null> {
    const result = await this.pool.query(`
      SELECT * FROM research_jobs WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapJobRow(result.rows[0]) : null;
  }

  async findJobsByConfigId(configId: string): Promise<ResearchJob[]> {
    const result = await this.pool.query(`
      SELECT * FROM research_jobs WHERE config_id = $1 ORDER BY created_at DESC
    `, [configId]);

    return result.rows.map(row => this.mapJobRow(row));
  }

  async findRecentJobs(limit: number = 10): Promise<ResearchJob[]> {
    const result = await this.pool.query(`
      SELECT * FROM research_jobs ORDER BY created_at DESC LIMIT $1
    `, [limit]);

    return result.rows.map(row => this.mapJobRow(row));
  }

  async startJob(id: string): Promise<void> {
    await this.pool.query(`
      UPDATE research_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1
    `, [id]);
  }

  async completeJob(
    id: string,
    topicsDiscovered: number,
    episodesGenerated: number,
    tokensUsed: number
  ): Promise<void> {
    await this.pool.query(`
      UPDATE research_jobs
      SET status = 'completed', completed_at = NOW(),
          topics_discovered = $1, episodes_generated = $2, tokens_used = $3
      WHERE id = $4
    `, [topicsDiscovered, episodesGenerated, tokensUsed, id]);
  }

  async failJob(id: string, error: string): Promise<void> {
    await this.pool.query(`
      UPDATE research_jobs
      SET status = 'failed', completed_at = NOW(), error = $1
      WHERE id = $2
    `, [error, id]);
  }

  // ========== Research Result Operations ==========

  async createResult(result: Omit<ResearchResult, 'id' | 'createdAt'>): Promise<ResearchResult> {
    const dbResult = await this.pool.query(`
      INSERT INTO research_results (
        job_id, topic, category, sources, summary,
        controversy_score, timeliness, depth, raw_perplexity_response
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      result.jobId,
      result.topic,
      result.category,
      JSON.stringify(result.sources),
      result.summary,
      result.controversyScore,
      result.timeliness,
      result.depth,
      result.rawPerplexityResponse
    ]);

    return this.mapResultRow(dbResult.rows[0]);
  }

  async findResultById(id: string): Promise<ResearchResult | null> {
    const result = await this.pool.query(`
      SELECT * FROM research_results WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapResultRow(result.rows[0]) : null;
  }

  async findResultsByJobId(jobId: string): Promise<ResearchResult[]> {
    const result = await this.pool.query(`
      SELECT * FROM research_results WHERE job_id = $1 ORDER BY created_at DESC
    `, [jobId]);

    return result.rows.map(row => this.mapResultRow(row));
  }

  async findHighQualityResults(minControversy: number, minDepth: number): Promise<ResearchResult[]> {
    const result = await this.pool.query(`
      SELECT * FROM research_results
      WHERE controversy_score >= $1 AND depth >= $2
      ORDER BY controversy_score DESC, depth DESC
    `, [minControversy, minDepth]);

    return result.rows.map(row => this.mapResultRow(row));
  }

  // ========== Row Mappers ==========

  private mapConfigRow(row: any): ResearchConfig {
    return {
      id: row.id,
      name: row.name,
      schedule: row.schedule,
      enabled: row.enabled,
      categories: row.categories,
      perplexityModel: row.perplexity_model,
      maxTopicsPerRun: row.max_topics_per_run,
      minControversyScore: row.min_controversy_score,
      searchQueries: row.search_queries || [],
      excludeTopics: row.exclude_topics || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapJobRow(row: any): ResearchJob {
    return {
      id: row.id,
      configId: row.config_id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      topicsDiscovered: row.topics_discovered,
      episodesGenerated: row.episodes_generated,
      tokensUsed: row.tokens_used,
      error: row.error,
      createdAt: row.created_at,
    };
  }

  private mapResultRow(row: any): ResearchResult {
    return {
      id: row.id,
      jobId: row.job_id,
      topic: row.topic,
      category: row.category,
      sources: row.sources,
      summary: row.summary,
      controversyScore: row.controversy_score,
      timeliness: row.timeliness,
      depth: row.depth,
      rawPerplexityResponse: row.raw_perplexity_response,
      createdAt: row.created_at,
    };
  }
}
```

```typescript
// backend/src/db/repositories/episode-proposal-repository.ts

import { Pool } from 'pg';
import {
  EpisodeProposal,
  ProposalStatus,
  PhilosophicalChair,
  EpisodeEdit
} from '../../types/duelogic-research.js';

export class EpisodeProposalRepository {
  constructor(private pool: Pool) {}

  async create(proposal: Omit<EpisodeProposal, 'id' | 'generatedAt' | 'wasEdited'>): Promise<EpisodeProposal> {
    const result = await this.pool.query(`
      INSERT INTO episode_proposals (
        research_result_id, status, title, subtitle, description,
        proposition, context_for_panel, chairs, key_tensions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      proposal.researchResultId,
      proposal.status || 'pending',
      proposal.title,
      proposal.subtitle,
      proposal.description,
      proposal.proposition,
      proposal.contextForPanel,
      JSON.stringify(proposal.chairs),
      proposal.keyTensions
    ]);

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<EpisodeProposal | null> {
    const result = await this.pool.query(`
      SELECT * FROM episode_proposals WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByStatus(status: ProposalStatus): Promise<EpisodeProposal[]> {
    const result = await this.pool.query(`
      SELECT * FROM episode_proposals WHERE status = $1 ORDER BY generated_at DESC
    `, [status]);

    return result.rows.map(row => this.mapRow(row));
  }

  async findPending(): Promise<EpisodeProposal[]> {
    return this.findByStatus('pending');
  }

  async findApproved(): Promise<EpisodeProposal[]> {
    const result = await this.pool.query(`
      SELECT * FROM episode_proposals
      WHERE status IN ('approved', 'scheduled')
      ORDER BY scheduled_for ASC NULLS LAST, generated_at DESC
    `);

    return result.rows.map(row => this.mapRow(row));
  }

  async approve(id: string, reviewedBy: string, episodeNumber?: number): Promise<void> {
    await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1, episode_number = $2
      WHERE id = $3
    `, [reviewedBy, episodeNumber, id]);
  }

  async reject(id: string, reviewedBy: string, adminNotes?: string): Promise<void> {
    await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1, admin_notes = $2
      WHERE id = $3
    `, [reviewedBy, adminNotes, id]);
  }

  async schedule(id: string, scheduledFor: Date): Promise<void> {
    await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'scheduled', scheduled_for = $1
      WHERE id = $2
    `, [scheduledFor, id]);
  }

  async updateContent(
    id: string,
    updates: Partial<Pick<EpisodeProposal, 'title' | 'subtitle' | 'description' | 'proposition' | 'contextForPanel' | 'chairs' | 'keyTensions'>>,
    editedBy: string
  ): Promise<void> {
    // First, get current values for edit history
    const current = await this.findById(id);
    if (!current) throw new Error(`Proposal ${id} not found`);

    const editHistory: EpisodeEdit[] = current.editHistory || [];
    const now = new Date();

    // Track changes
    for (const [key, newValue] of Object.entries(updates)) {
      const oldValue = (current as any)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        editHistory.push({
          field: key,
          oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue),
          newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue),
          editedAt: now,
          editedBy,
        });
      }
    }

    const fields: string[] = ['was_edited = true', 'edit_history = $1'];
    const values: any[] = [JSON.stringify(editHistory)];
    let paramIndex = 2;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.subtitle !== undefined) {
      fields.push(`subtitle = $${paramIndex++}`);
      values.push(updates.subtitle);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.proposition !== undefined) {
      fields.push(`proposition = $${paramIndex++}`);
      values.push(updates.proposition);
    }
    if (updates.contextForPanel !== undefined) {
      fields.push(`context_for_panel = $${paramIndex++}`);
      values.push(updates.contextForPanel);
    }
    if (updates.chairs !== undefined) {
      fields.push(`chairs = $${paramIndex++}`);
      values.push(JSON.stringify(updates.chairs));
    }
    if (updates.keyTensions !== undefined) {
      fields.push(`key_tensions = $${paramIndex++}`);
      values.push(updates.keyTensions);
    }

    values.push(id);
    await this.pool.query(`
      UPDATE episode_proposals SET ${fields.join(', ')} WHERE id = $${paramIndex}
    `, values);
  }

  async setAdminNotes(id: string, notes: string): Promise<void> {
    await this.pool.query(`
      UPDATE episode_proposals SET admin_notes = $1 WHERE id = $2
    `, [notes, id]);
  }

  async bulkApprove(ids: string[], reviewedBy: string): Promise<void> {
    await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
      WHERE id = ANY($2)
    `, [reviewedBy, ids]);
  }

  async bulkReject(ids: string[], reviewedBy: string): Promise<void> {
    await this.pool.query(`
      UPDATE episode_proposals
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1
      WHERE id = ANY($2)
    `, [reviewedBy, ids]);
  }

  async getNextEpisodeNumber(): Promise<number> {
    const result = await this.pool.query(`
      SELECT COALESCE(MAX(episode_number), 0) + 1 as next_number
      FROM episode_proposals
      WHERE episode_number IS NOT NULL
    `);

    return result.rows[0].next_number;
  }

  async getStats(): Promise<{ pending: number; approved: number; rejected: number; scheduled: number }> {
    const result = await this.pool.query(`
      SELECT status, COUNT(*) as count
      FROM episode_proposals
      GROUP BY status
    `);

    const stats = { pending: 0, approved: 0, rejected: 0, scheduled: 0 };
    for (const row of result.rows) {
      stats[row.status as keyof typeof stats] = parseInt(row.count);
    }
    return stats;
  }

  private mapRow(row: any): EpisodeProposal {
    return {
      id: row.id,
      researchResultId: row.research_result_id,
      status: row.status,
      episodeNumber: row.episode_number,
      title: row.title,
      subtitle: row.subtitle,
      description: row.description,
      proposition: row.proposition,
      contextForPanel: row.context_for_panel,
      chairs: row.chairs,
      keyTensions: row.key_tensions,
      generatedAt: row.generated_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      scheduledFor: row.scheduled_for,
      adminNotes: row.admin_notes,
      wasEdited: row.was_edited,
      editHistory: row.edit_history,
    };
  }
}
```

---

## Validation

### How to Test

1. Run the database migration and verify tables are created
2. Create unit tests for the repository operations:
   - Create, read, update, delete research configs
   - Create and manage research jobs
   - Store and retrieve research results
   - Create and manage episode proposals
   - Test bulk operations for proposals
   - Test edit history tracking
3. Test JSONB serialization/deserialization of sources, chairs, edit_history
4. Verify foreign key constraints work correctly
5. Test quality score constraints (0-1 range)

### Definition of Done

- [ ] All TypeScript types are defined and exported
- [ ] Database migration creates all tables and indexes
- [ ] ResearchRepository implements full CRUD operations
- [ ] EpisodeProposalRepository implements workflow operations
- [ ] Unit tests pass with >90% coverage
- [ ] Types match the specification in FUTURE-FEATURES.md Section 10
- [ ] Edit history tracking works correctly
- [ ] Bulk operations work correctly

---

## Notes

- The `research_configs` table uses TEXT[] for arrays instead of JSONB for simpler querying
- Research results store raw Perplexity response for debugging and potential reprocessing
- Episode proposals track full edit history for audit purposes
- Consider adding full-text search indexes on topic/title fields later
- The scheduled_for field uses DATE, not TIMESTAMPTZ, as episodes are typically scheduled by day

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
