# PODCAST-001: Database Schema & Types for Podcast Export

**Task ID:** PODCAST-001
**Phase:** Phase 4
**Category:** Podcast Export
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** AUDIO-001 (ElevenLabs TTS basic integration)
**Status:** DONE

---

## Context

The podcast export feature requires database schema to track export jobs, store refined scripts, and manage voice assignments. This task establishes the foundation types and database migrations needed for the entire podcast export pipeline.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 9: Export Podcast Script
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Database patterns
- Existing export infrastructure in `backend/src/services/export/`

---

## Requirements

### Acceptance Criteria

- [x] Create TypeScript interfaces for all podcast export types
- [x] Create database migration for `podcast_export_jobs` table
- [x] Create database migration for `podcast_scripts` table (stores refined scripts)
- [x] Create `PodcastExportRepository` for database operations
- [x] Add voice assignment types with ElevenLabs voice IDs
- [x] Include job status tracking (pending, refining, generating, complete, error)
- [x] Add cost estimation tracking fields
- [x] Write unit tests for repository operations

### Functional Requirements

From FUTURE-FEATURES.md Section 9:
- Store refined scripts for preview/editing before TTS generation
- Track generation progress with segment-level granularity
- Support voice assignments per speaker role
- Enable cost estimation display

---

## Implementation Guide

### TypeScript Types

```typescript
// backend/src/types/podcast-export.ts

export type PodcastJobStatus = 'pending' | 'refining' | 'generating' | 'complete' | 'error';

export type ElevenLabsModel =
  | 'eleven_v3'
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

export type AudioOutputFormat =
  | 'mp3_44100_128'
  | 'mp3_22050_32'
  | 'pcm_44100';

export interface ElevenLabsVoiceSettings {
  stability: number;        // 0-1: Lower = more expressive
  similarity_boost: number; // 0-1: Voice clarity
  style: number;            // 0-1: Style exaggeration
  speed: number;            // 0.5-2.0: Playback speed
  use_speaker_boost: boolean;
}

export interface VoiceAssignment {
  speakerId: string;         // 'moderator', 'pro_advocate', 'con_advocate', etc.
  voiceId: string;           // ElevenLabs voice ID
  voiceName: string;         // Display name (e.g., "Rachel", "Josh")
  settings: ElevenLabsVoiceSettings;
}

export interface PodcastSegment {
  index: number;
  speaker: string;           // Speaker identifier
  voiceId: string;           // ElevenLabs voice ID
  text: string;              // Max 5,000-10,000 chars
  voiceSettings: ElevenLabsVoiceSettings;
  previousText?: string;     // Context for natural flow
  nextText?: string;
  audioUrl?: string;         // Generated audio URL
  durationSeconds?: number;
}

export interface RefinedPodcastScript {
  title: string;
  totalCharacters: number;
  durationEstimateSeconds: number;
  segments: PodcastSegment[];
  intro?: PodcastSegment;
  outro?: PodcastSegment;
  createdAt: Date;
  updatedAt: Date;
}

export interface PodcastExportConfig {
  // Script refinement options
  refinementModel: string;        // LLM for script polish (e.g., "gpt-4o")
  includeIntro: boolean;
  includeOutro: boolean;
  addTransitions: boolean;

  // ElevenLabs settings
  elevenLabsModel: ElevenLabsModel;
  outputFormat: AudioOutputFormat;

  // Voice assignments per speaker
  voiceAssignments: Record<string, VoiceAssignment>;

  // Advanced options
  useCustomPronunciation: boolean;
  pronunciationDictionaryId?: string;
  normalizeVolume: boolean;
}

export interface PodcastExportJob {
  id: string;
  debateId: string;
  status: PodcastJobStatus;
  config: PodcastExportConfig;

  // Progress tracking
  refinedScript?: RefinedPodcastScript;
  currentSegment?: number;
  totalSegments?: number;
  progressPercent: number;

  // Output
  audioUrl?: string;
  durationSeconds?: number;
  characterCount?: number;
  estimatedCostCents?: number;
  actualCostCents?: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

// Default voice assignments for debate roles
export const DEFAULT_VOICE_ASSIGNMENTS: Record<string, VoiceAssignment> = {
  moderator: {
    speakerId: 'moderator',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',  // "Bella" - professional
    voiceName: 'Bella',
    settings: {
      stability: 0.7,
      similarity_boost: 0.8,
      style: 0.3,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  pro_advocate: {
    speakerId: 'pro_advocate',
    voiceId: 'pNInz6obpgDQGcFmaJgB',  // "Adam" - confident
    voiceName: 'Adam',
    settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  con_advocate: {
    speakerId: 'con_advocate',
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',  // "Sam" - articulate
    voiceName: 'Sam',
    settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
  narrator: {
    speakerId: 'narrator',
    voiceId: 'ThT5KcBeYPX3keUQqHPh',  // "Nicole" - warm
    voiceName: 'Nicole',
    settings: {
      stability: 0.6,
      similarity_boost: 0.7,
      style: 0.4,
      speed: 1.0,
      use_speaker_boost: true,
    },
  },
};
```

### Database Migration

```sql
-- backend/src/db/migrations/XXX_add_podcast_export.sql

-- Podcast export jobs table
CREATE TABLE podcast_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Configuration (stored as JSONB)
  config JSONB NOT NULL,

  -- Refined script (stored as JSONB)
  refined_script JSONB,

  -- Progress tracking
  current_segment INTEGER,
  total_segments INTEGER,
  progress_percent INTEGER DEFAULT 0,

  -- Output
  audio_url TEXT,
  duration_seconds INTEGER,
  character_count INTEGER,
  estimated_cost_cents INTEGER,
  actual_cost_cents INTEGER,

  -- Metadata
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'refining', 'generating', 'complete', 'error')),
  CONSTRAINT valid_progress CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

-- Index for efficient lookups
CREATE INDEX idx_podcast_jobs_debate ON podcast_export_jobs(debate_id);
CREATE INDEX idx_podcast_jobs_status ON podcast_export_jobs(status);
CREATE INDEX idx_podcast_jobs_created ON podcast_export_jobs(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_podcast_jobs_updated_at
  BEFORE UPDATE ON podcast_export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Repository Implementation

```typescript
// backend/src/db/repositories/podcast-export-repository.ts

import { Pool } from 'pg';
import {
  PodcastExportJob,
  PodcastExportConfig,
  RefinedPodcastScript,
  PodcastJobStatus
} from '../../types/podcast-export.js';

export class PodcastExportRepository {
  constructor(private pool: Pool) {}

  async create(debateId: string, config: PodcastExportConfig): Promise<PodcastExportJob> {
    const result = await this.pool.query(`
      INSERT INTO podcast_export_jobs (debate_id, config)
      VALUES ($1, $2)
      RETURNING *
    `, [debateId, JSON.stringify(config)]);

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<PodcastExportJob | null> {
    const result = await this.pool.query(`
      SELECT * FROM podcast_export_jobs WHERE id = $1
    `, [id]);

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByDebateId(debateId: string): Promise<PodcastExportJob[]> {
    const result = await this.pool.query(`
      SELECT * FROM podcast_export_jobs
      WHERE debate_id = $1
      ORDER BY created_at DESC
    `, [debateId]);

    return result.rows.map(row => this.mapRow(row));
  }

  async updateStatus(
    id: string,
    status: PodcastJobStatus,
    errorMessage?: string
  ): Promise<void> {
    const completedAt = status === 'complete' || status === 'error'
      ? new Date()
      : null;

    await this.pool.query(`
      UPDATE podcast_export_jobs
      SET status = $1, error_message = $2, completed_at = $3, updated_at = NOW()
      WHERE id = $4
    `, [status, errorMessage, completedAt, id]);
  }

  async updateProgress(
    id: string,
    currentSegment: number,
    totalSegments: number
  ): Promise<void> {
    const progressPercent = Math.round((currentSegment / totalSegments) * 100);

    await this.pool.query(`
      UPDATE podcast_export_jobs
      SET current_segment = $1, total_segments = $2, progress_percent = $3, updated_at = NOW()
      WHERE id = $4
    `, [currentSegment, totalSegments, progressPercent, id]);
  }

  async saveRefinedScript(id: string, script: RefinedPodcastScript): Promise<void> {
    const totalSegments = script.segments.length +
      (script.intro ? 1 : 0) +
      (script.outro ? 1 : 0);

    await this.pool.query(`
      UPDATE podcast_export_jobs
      SET refined_script = $1, total_segments = $2, updated_at = NOW()
      WHERE id = $3
    `, [JSON.stringify(script), totalSegments, id]);
  }

  async completeJob(
    id: string,
    audioUrl: string,
    durationSeconds: number,
    characterCount: number,
    actualCostCents: number
  ): Promise<void> {
    await this.pool.query(`
      UPDATE podcast_export_jobs
      SET
        status = 'complete',
        audio_url = $1,
        duration_seconds = $2,
        character_count = $3,
        actual_cost_cents = $4,
        progress_percent = 100,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $5
    `, [audioUrl, durationSeconds, characterCount, actualCostCents, id]);
  }

  private mapRow(row: any): PodcastExportJob {
    return {
      id: row.id,
      debateId: row.debate_id,
      status: row.status,
      config: row.config,
      refinedScript: row.refined_script,
      currentSegment: row.current_segment,
      totalSegments: row.total_segments,
      progressPercent: row.progress_percent,
      audioUrl: row.audio_url,
      durationSeconds: row.duration_seconds,
      characterCount: row.character_count,
      estimatedCostCents: row.estimated_cost_cents,
      actualCostCents: row.actual_cost_cents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    };
  }
}
```

---

## Validation

### How to Test

1. Run the database migration and verify tables are created
2. Create unit tests for the repository operations:
   - Create a new podcast export job
   - Update job status transitions
   - Save and retrieve refined scripts
   - Update progress tracking
3. Test JSONB serialization/deserialization of config and script
4. Verify foreign key constraint with debates table

### Definition of Done

- [x] All TypeScript types are defined and exported
- [x] Database migration creates tables and indexes
- [x] Repository implements CRUD operations
- [x] Unit tests pass with >90% coverage
- [x] Types match the specification in FUTURE-FEATURES.md
- [x] Default voice assignments are configured

---

## Notes

- ElevenLabs voice IDs are placeholders - verify with actual API
- Cost estimation formula: ~$0.15 per 1,000 characters for ElevenLabs Creator tier
- Consider adding a separate table for voice library if custom voices are added later
- The refined_script JSONB column allows flexible schema evolution

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
