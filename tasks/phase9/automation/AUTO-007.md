# AUTO-007: Admin Configuration UI for Podcast Automation

**Task ID:** AUTO-007
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** AUTO-001, AUTO-006
**Status:** Ready

---

## Context

The podcast automation pipeline needs an admin interface for configuring key settings:
- **Persona-to-voice mapping**: Assign specific Gemini TTS voices to each podcast persona so the same voice is used consistently
- **Turn limits**: Control how many turns conversations can have before auto-completing
- **Default conversation mode**: Set "Rapid Fire" as default (shorter segments that work better with Gemini TTS)
- **Automation enable/disable**: Toggle automatic publishing on/off

**References:**
- Gemini TTS voices: `backend/src/services/audio/gemini-tts-service.ts`
- Podcast personas: `backend/src/db/repositories/podcast-persona-repository.ts`
- Admin routes from AUTO-006
- Database schema from AUTO-001

---

## Requirements

### Acceptance Criteria

- [ ] Create database migration for `automation_config` table
- [ ] Create database migration for `persona_voice_mappings` table
- [ ] Create `AutomationConfigRepository` for config persistence
- [ ] Create API endpoints for config CRUD operations
- [ ] Create frontend AdminAutomationConfigPage component
- [ ] Persona dropdown with voice assignment for each
- [ ] Turn limit slider/input (default: 8 for rapid fire)
- [ ] Default mode selector (Normal, Rapid Fire, Model Debate)
- [ ] Enable/disable automation toggle
- [ ] Persist settings to database (not environment variables)
- [ ] Test: Settings persist across server restarts

### Functional Requirements

**Persona Voice Mapping:**
- Each of the 12 podcast personas can be assigned a Gemini voice
- Available voices: Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede
- Default mapping provided but can be customized
- Voice preview button (optional enhancement)

**Turn Limits:**
- Configurable max turns per conversation
- Rapid Fire default: 8 turns (shorter episodes)
- Normal mode default: 16 turns
- Model Debate default: 12 turns
- Setting applies to auto-created conversations

**Default Conversation Mode:**
- Options: normal, rapid_fire, model_debate
- Default: rapid_fire (recommended for Gemini TTS reliability)
- Affects new conversations created through automation

**Automation Settings:**
- Enable/disable auto-publish globally
- Email notification recipient
- RSS feed base URL configuration

---

## Implementation

### 1. Database Migration: Automation Config

**File:** `backend/src/db/migrations/032_add_automation_config.sql`

```sql
-- Migration 032: Add Automation Config Table
-- Stores global automation pipeline configuration (single row)

CREATE TABLE IF NOT EXISTS automation_config (
  id SERIAL PRIMARY KEY,

  -- Automation control
  auto_publish_enabled BOOLEAN DEFAULT true,
  notification_email VARCHAR(255),

  -- Default conversation settings
  default_conversation_mode VARCHAR(50) DEFAULT 'rapid_fire'
    CHECK (default_conversation_mode IN ('normal', 'rapid_fire', 'model_debate')),

  -- Turn limits by mode
  turn_limit_normal INTEGER DEFAULT 16,
  turn_limit_rapid_fire INTEGER DEFAULT 8,
  turn_limit_model_debate INTEGER DEFAULT 12,

  -- TTS settings
  default_tts_provider VARCHAR(50) DEFAULT 'gemini',

  -- Feed settings
  rss_base_url TEXT DEFAULT 'https://clearside.app',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Single row constraint (only one config allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_automation_config ON automation_config((true));

-- Create updated_at trigger
CREATE TRIGGER update_automation_config_updated_at
  BEFORE UPDATE ON automation_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default configuration
INSERT INTO automation_config (
  auto_publish_enabled,
  notification_email,
  default_conversation_mode,
  turn_limit_rapid_fire
) VALUES (
  true,
  'steve.d.pennington@gmail.com',
  'rapid_fire',
  8
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE automation_config IS 'Global configuration for podcast automation pipeline (single row)';
```

### 2. Database Migration: Persona Voice Mappings

**File:** `backend/src/db/migrations/033_add_persona_voice_mappings.sql`

```sql
-- Migration 033: Add Persona Voice Mappings Table
-- Maps podcast personas to specific TTS voices for consistent audio generation

CREATE TABLE IF NOT EXISTS persona_voice_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES podcast_personas(id) ON DELETE CASCADE,
  persona_slug VARCHAR(100) NOT NULL,

  -- Voice configuration
  voice_id VARCHAR(50) NOT NULL DEFAULT 'Puck',
  voice_provider VARCHAR(50) NOT NULL DEFAULT 'gemini',

  -- Preview audio (optional, cached)
  preview_audio_url TEXT,
  preview_generated_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(persona_id),
  UNIQUE(persona_slug)
);

-- Create updated_at trigger
CREATE TRIGGER update_persona_voice_mappings_updated_at
  BEFORE UPDATE ON persona_voice_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_persona_voice_persona ON persona_voice_mappings(persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_voice_slug ON persona_voice_mappings(persona_slug);

-- Insert default voice mappings for all 12 personas
-- Voices chosen to match persona characteristics:
-- - Kore: Firm, clear female (good for assertive personas)
-- - Charon: Thoughtful male (good for analytical personas)
-- - Aoede: Neutral, calm (good for moderators/hosts)
-- - Puck: Clear narrator (good for energetic personas)
-- - Zephyr: Warm, friendly (good for empathetic personas)
-- - Fenrir: Deep, authoritative (good for leader personas)
-- - Leda: Gentle, nurturing (good for caring personas)
-- - Orus: Measured, precise (good for detail-oriented personas)

INSERT INTO persona_voice_mappings (persona_id, persona_slug, voice_id)
SELECT id, slug,
  CASE slug
    -- Map voices based on persona characteristics
    WHEN 'james-jb-buchanan' THEN 'Charon'      -- Judge: thoughtful, measured
    WHEN 'luna-nakamura' THEN 'Zephyr'          -- Artist: warm, expressive
    WHEN 'dr-elena-vance' THEN 'Kore'           -- Scientist: clear, precise
    WHEN 'marcus-stone' THEN 'Fenrir'           -- Entrepreneur: authoritative
    WHEN 'reverend-grace-okonkwo' THEN 'Aoede'  -- Reverend: calm, wise
    WHEN 'captain-alex-petrov' THEN 'Orus'      -- Military: measured, disciplined
    WHEN 'sofia-chen' THEN 'Leda'               -- Advocate: gentle, caring
    WHEN 'dr-hassan-el-amin' THEN 'Charon'      -- Philosopher: thoughtful
    WHEN 'maya-rivers' THEN 'Puck'              -- Journalist: energetic, clear
    WHEN 'senator-victoria-hayes' THEN 'Kore'   -- Politician: firm, persuasive
    WHEN 'zeke-thornton' THEN 'Fenrir'          -- Rancher: deep, grounded
    WHEN 'dr-yuki-tanaka' THEN 'Aoede'          -- Futurist: calm, visionary
    ELSE 'Puck'  -- Default fallback
  END
FROM podcast_personas
ON CONFLICT (persona_slug) DO NOTHING;

COMMENT ON TABLE persona_voice_mappings IS 'Maps podcast personas to TTS voices for consistent audio generation';
```

### 3. Automation Config Repository

**File:** `backend/src/db/repositories/automation-config-repository.ts` (new)

```typescript
/**
 * Automation Config Repository
 *
 * Manages the global automation configuration settings.
 * Single-row table pattern - always returns one config.
 */

import type { Pool } from 'pg';
import pino from 'pino';

const logger = pino({
  name: 'automation-config-repository',
  level: process.env.LOG_LEVEL || 'info',
});

export interface AutomationConfig {
  id: number;
  autoPublishEnabled: boolean;
  notificationEmail: string | null;
  defaultConversationMode: 'normal' | 'rapid_fire' | 'model_debate';
  turnLimitNormal: number;
  turnLimitRapidFire: number;
  turnLimitModelDebate: number;
  defaultTtsProvider: string;
  rssBaseUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonaVoiceMapping {
  id: string;
  personaId: string;
  personaSlug: string;
  voiceId: string;
  voiceProvider: string;
  previewAudioUrl: string | null;
  previewGeneratedAt: Date | null;
}

export interface UpdateAutomationConfigInput {
  autoPublishEnabled?: boolean;
  notificationEmail?: string | null;
  defaultConversationMode?: 'normal' | 'rapid_fire' | 'model_debate';
  turnLimitNormal?: number;
  turnLimitRapidFire?: number;
  turnLimitModelDebate?: number;
  defaultTtsProvider?: string;
  rssBaseUrl?: string;
}

export class AutomationConfigRepository {
  constructor(private pool: Pool) {}

  /**
   * Get the automation configuration (single row)
   */
  async getConfig(): Promise<AutomationConfig> {
    const result = await this.pool.query(`
      SELECT * FROM automation_config LIMIT 1
    `);

    if (result.rows.length === 0) {
      // Create default config if none exists
      return this.createDefaultConfig();
    }

    return this.mapConfigRow(result.rows[0]);
  }

  /**
   * Update automation configuration
   */
  async updateConfig(input: UpdateAutomationConfigInput): Promise<AutomationConfig> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.autoPublishEnabled !== undefined) {
      setClauses.push(`auto_publish_enabled = $${paramIndex++}`);
      values.push(input.autoPublishEnabled);
    }
    if (input.notificationEmail !== undefined) {
      setClauses.push(`notification_email = $${paramIndex++}`);
      values.push(input.notificationEmail);
    }
    if (input.defaultConversationMode !== undefined) {
      setClauses.push(`default_conversation_mode = $${paramIndex++}`);
      values.push(input.defaultConversationMode);
    }
    if (input.turnLimitNormal !== undefined) {
      setClauses.push(`turn_limit_normal = $${paramIndex++}`);
      values.push(input.turnLimitNormal);
    }
    if (input.turnLimitRapidFire !== undefined) {
      setClauses.push(`turn_limit_rapid_fire = $${paramIndex++}`);
      values.push(input.turnLimitRapidFire);
    }
    if (input.turnLimitModelDebate !== undefined) {
      setClauses.push(`turn_limit_model_debate = $${paramIndex++}`);
      values.push(input.turnLimitModelDebate);
    }
    if (input.defaultTtsProvider !== undefined) {
      setClauses.push(`default_tts_provider = $${paramIndex++}`);
      values.push(input.defaultTtsProvider);
    }
    if (input.rssBaseUrl !== undefined) {
      setClauses.push(`rss_base_url = $${paramIndex++}`);
      values.push(input.rssBaseUrl);
    }

    if (setClauses.length === 0) {
      return this.getConfig();
    }

    setClauses.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE automation_config
      SET ${setClauses.join(', ')}
      RETURNING *
    `, values);

    logger.info({ updated: setClauses.length }, 'Automation config updated');
    return this.mapConfigRow(result.rows[0]);
  }

  /**
   * Get all persona voice mappings
   */
  async getVoiceMappings(): Promise<PersonaVoiceMapping[]> {
    const result = await this.pool.query(`
      SELECT pvm.*, pp.name as persona_name
      FROM persona_voice_mappings pvm
      JOIN podcast_personas pp ON pvm.persona_id = pp.id
      ORDER BY pp.name ASC
    `);

    return result.rows.map(row => this.mapVoiceMappingRow(row));
  }

  /**
   * Update voice mapping for a persona
   */
  async updateVoiceMapping(
    personaSlug: string,
    voiceId: string,
    voiceProvider: string = 'gemini'
  ): Promise<PersonaVoiceMapping> {
    const result = await this.pool.query(`
      UPDATE persona_voice_mappings
      SET voice_id = $1, voice_provider = $2, updated_at = NOW()
      WHERE persona_slug = $3
      RETURNING *
    `, [voiceId, voiceProvider, personaSlug]);

    if (result.rows.length === 0) {
      throw new Error(`Persona voice mapping not found: ${personaSlug}`);
    }

    logger.info({ personaSlug, voiceId }, 'Voice mapping updated');
    return this.mapVoiceMappingRow(result.rows[0]);
  }

  /**
   * Get voice ID for a specific persona
   */
  async getVoiceForPersona(personaSlug: string): Promise<string> {
    const result = await this.pool.query(`
      SELECT voice_id FROM persona_voice_mappings WHERE persona_slug = $1
    `, [personaSlug]);

    return result.rows[0]?.voice_id || 'Puck'; // Default fallback
  }

  /**
   * Get turn limit for a conversation mode
   */
  async getTurnLimit(mode: 'normal' | 'rapid_fire' | 'model_debate'): Promise<number> {
    const config = await this.getConfig();
    switch (mode) {
      case 'rapid_fire':
        return config.turnLimitRapidFire;
      case 'model_debate':
        return config.turnLimitModelDebate;
      default:
        return config.turnLimitNormal;
    }
  }

  // ========== Private Helpers ==========

  private async createDefaultConfig(): Promise<AutomationConfig> {
    const result = await this.pool.query(`
      INSERT INTO automation_config (
        auto_publish_enabled,
        notification_email,
        default_conversation_mode,
        turn_limit_rapid_fire
      ) VALUES (true, 'steve.d.pennington@gmail.com', 'rapid_fire', 8)
      RETURNING *
    `);

    return this.mapConfigRow(result.rows[0]);
  }

  private mapConfigRow(row: any): AutomationConfig {
    return {
      id: row.id,
      autoPublishEnabled: row.auto_publish_enabled,
      notificationEmail: row.notification_email,
      defaultConversationMode: row.default_conversation_mode,
      turnLimitNormal: row.turn_limit_normal,
      turnLimitRapidFire: row.turn_limit_rapid_fire,
      turnLimitModelDebate: row.turn_limit_model_debate,
      defaultTtsProvider: row.default_tts_provider,
      rssBaseUrl: row.rss_base_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapVoiceMappingRow(row: any): PersonaVoiceMapping {
    return {
      id: row.id,
      personaId: row.persona_id,
      personaSlug: row.persona_slug,
      voiceId: row.voice_id,
      voiceProvider: row.voice_provider,
      previewAudioUrl: row.preview_audio_url,
      previewGeneratedAt: row.preview_generated_at,
    };
  }
}

export function createAutomationConfigRepository(pool: Pool): AutomationConfigRepository {
  return new AutomationConfigRepository(pool);
}
```

### 4. API Routes for Automation Config

**File:** `backend/src/routes/automation-config-routes.ts` (new)

```typescript
/**
 * Automation Config Routes
 *
 * Admin endpoints for managing podcast automation configuration.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db/index.js';
import { createAutomationConfigRepository } from '../db/repositories/automation-config-repository.js';
import pino from 'pino';

const logger = pino({
  name: 'automation-config-routes',
  level: process.env.LOG_LEVEL || 'info',
});

// Available Gemini TTS voices
const AVAILABLE_VOICES = [
  { id: 'Zephyr', name: 'Zephyr', description: 'Warm, friendly voice' },
  { id: 'Puck', name: 'Puck', description: 'Clear narrator voice' },
  { id: 'Charon', name: 'Charon', description: 'Thoughtful male voice' },
  { id: 'Kore', name: 'Kore', description: 'Firm, clear female voice' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Deep, authoritative voice' },
  { id: 'Leda', name: 'Leda', description: 'Gentle, nurturing voice' },
  { id: 'Orus', name: 'Orus', description: 'Measured, precise voice' },
  { id: 'Aoede', name: 'Aoede', description: 'Neutral, calm voice' },
];

export function createAutomationConfigRoutes(): Router {
  const router = Router();
  const configRepo = createAutomationConfigRepository(pool);

  /**
   * GET /admin/automation/config
   * Get current automation configuration
   */
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const config = await configRepo.getConfig();
      res.json({ success: true, config });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get automation config');
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  /**
   * PUT /admin/automation/config
   * Update automation configuration
   */
  router.put('/config', async (req: Request, res: Response) => {
    try {
      const config = await configRepo.updateConfig(req.body);
      res.json({ success: true, config });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to update automation config');
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  /**
   * GET /admin/automation/voices
   * Get available TTS voices
   */
  router.get('/voices', async (req: Request, res: Response) => {
    res.json({ success: true, voices: AVAILABLE_VOICES });
  });

  /**
   * GET /admin/automation/voice-mappings
   * Get all persona voice mappings
   */
  router.get('/voice-mappings', async (req: Request, res: Response) => {
    try {
      const mappings = await configRepo.getVoiceMappings();
      res.json({ success: true, mappings });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get voice mappings');
      res.status(500).json({ error: 'Failed to get voice mappings' });
    }
  });

  /**
   * PUT /admin/automation/voice-mappings/:personaSlug
   * Update voice mapping for a persona
   */
  router.put('/voice-mappings/:personaSlug', async (req: Request, res: Response) => {
    try {
      const { personaSlug } = req.params;
      const { voiceId, voiceProvider } = req.body;

      if (!voiceId) {
        res.status(400).json({ error: 'voiceId is required' });
        return;
      }

      // Validate voice ID
      if (!AVAILABLE_VOICES.find(v => v.id === voiceId)) {
        res.status(400).json({ error: `Invalid voiceId: ${voiceId}` });
        return;
      }

      const mapping = await configRepo.updateVoiceMapping(
        personaSlug,
        voiceId,
        voiceProvider || 'gemini'
      );

      res.json({ success: true, mapping });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to update voice mapping');
      res.status(500).json({ error: 'Failed to update voice mapping' });
    }
  });

  return router;
}
```

### 5. Register Routes

**File:** `backend/src/index.ts` (modify)

Add automation config routes:

```typescript
import { createAutomationConfigRoutes } from './routes/automation-config-routes.js';

// ... existing routes ...

// Register automation config routes (admin section)
app.use('/admin/automation', createAutomationConfigRoutes());
```

### 6. Frontend: Admin Automation Config Page

**File:** `frontend/src/pages/AdminAutomationConfigPage.tsx` (new)

```tsx
/**
 * Admin Automation Config Page
 *
 * Configure podcast automation settings:
 * - Enable/disable auto-publish
 * - Set default conversation mode
 * - Configure turn limits
 * - Map personas to voices
 */

import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import './AdminAutomationConfigPage.css';

interface AutomationConfig {
  autoPublishEnabled: boolean;
  notificationEmail: string | null;
  defaultConversationMode: 'normal' | 'rapid_fire' | 'model_debate';
  turnLimitNormal: number;
  turnLimitRapidFire: number;
  turnLimitModelDebate: number;
  defaultTtsProvider: string;
  rssBaseUrl: string;
}

interface VoiceOption {
  id: string;
  name: string;
  description: string;
}

interface PersonaVoiceMapping {
  personaSlug: string;
  personaName?: string;
  voiceId: string;
}

export const AdminAutomationConfigPage: React.FC = () => {
  const [config, setConfig] = useState<AutomationConfig | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceMappings, setVoiceMappings] = useState<PersonaVoiceMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configRes, voicesRes, mappingsRes] = await Promise.all([
        api.get('/admin/automation/config'),
        api.get('/admin/automation/voices'),
        api.get('/admin/automation/voice-mappings'),
      ]);

      setConfig(configRes.data.config);
      setVoices(voicesRes.data.voices);
      setVoiceMappings(mappingsRes.data.mappings);
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      await api.put('/admin/automation/config', config);
      setSuccessMessage('Configuration saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateVoiceMapping = async (personaSlug: string, voiceId: string) => {
    try {
      await api.put(`/admin/automation/voice-mappings/${personaSlug}`, { voiceId });

      setVoiceMappings(prev =>
        prev.map(m => (m.personaSlug === personaSlug ? { ...m, voiceId } : m))
      );

      setSuccessMessage(`Voice updated for ${personaSlug}`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update voice mapping');
    }
  };

  if (loading) {
    return <div className="admin-page loading">Loading configuration...</div>;
  }

  if (!config) {
    return <div className="admin-page error">Failed to load configuration</div>;
  }

  return (
    <div className="admin-automation-config">
      <h1>Podcast Automation Configuration</h1>

      {error && <div className="alert error">{error}</div>}
      {successMessage && <div className="alert success">{successMessage}</div>}

      {/* General Settings */}
      <section className="config-section">
        <h2>General Settings</h2>

        <div className="form-group">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.autoPublishEnabled}
              onChange={e => setConfig({ ...config, autoPublishEnabled: e.target.checked })}
            />
            <span>Enable Auto-Publish</span>
          </label>
          <p className="help-text">
            Automatically publish podcasts when conversations complete
          </p>
        </div>

        <div className="form-group">
          <label>Notification Email</label>
          <input
            type="email"
            value={config.notificationEmail || ''}
            onChange={e => setConfig({ ...config, notificationEmail: e.target.value })}
            placeholder="email@example.com"
          />
        </div>

        <div className="form-group">
          <label>RSS Base URL</label>
          <input
            type="url"
            value={config.rssBaseUrl || ''}
            onChange={e => setConfig({ ...config, rssBaseUrl: e.target.value })}
            placeholder="https://clearside.app"
          />
        </div>
      </section>

      {/* Default Conversation Mode */}
      <section className="config-section">
        <h2>Default Conversation Mode</h2>
        <p className="help-text">
          Rapid Fire is recommended for Gemini TTS (shorter segments, more reliable)
        </p>

        <div className="mode-selector">
          {(['rapid_fire', 'normal', 'model_debate'] as const).map(mode => (
            <label key={mode} className="mode-option">
              <input
                type="radio"
                name="conversationMode"
                value={mode}
                checked={config.defaultConversationMode === mode}
                onChange={() => setConfig({ ...config, defaultConversationMode: mode })}
              />
              <span className="mode-label">
                {mode === 'rapid_fire' && '⚡ Rapid Fire (Recommended)'}
                {mode === 'normal' && '💬 Normal'}
                {mode === 'model_debate' && '🤖 Model Debate'}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Turn Limits */}
      <section className="config-section">
        <h2>Turn Limits</h2>
        <p className="help-text">Maximum turns per conversation by mode</p>

        <div className="turn-limits-grid">
          <div className="form-group">
            <label>Rapid Fire</label>
            <input
              type="number"
              min="4"
              max="20"
              value={config.turnLimitRapidFire}
              onChange={e => setConfig({ ...config, turnLimitRapidFire: parseInt(e.target.value) || 8 })}
            />
            <span className="unit">turns</span>
          </div>

          <div className="form-group">
            <label>Normal</label>
            <input
              type="number"
              min="8"
              max="40"
              value={config.turnLimitNormal}
              onChange={e => setConfig({ ...config, turnLimitNormal: parseInt(e.target.value) || 16 })}
            />
            <span className="unit">turns</span>
          </div>

          <div className="form-group">
            <label>Model Debate</label>
            <input
              type="number"
              min="6"
              max="30"
              value={config.turnLimitModelDebate}
              onChange={e => setConfig({ ...config, turnLimitModelDebate: parseInt(e.target.value) || 12 })}
            />
            <span className="unit">turns</span>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="actions">
        <button
          className="btn primary"
          onClick={saveConfig}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Persona Voice Mappings */}
      <section className="config-section voice-mappings">
        <h2>Persona Voice Mappings</h2>
        <p className="help-text">
          Assign a consistent TTS voice to each podcast persona
        </p>

        <div className="voice-mappings-grid">
          {voiceMappings.map(mapping => (
            <div key={mapping.personaSlug} className="voice-mapping-row">
              <span className="persona-name">
                {mapping.personaSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <select
                value={mapping.voiceId}
                onChange={e => updateVoiceMapping(mapping.personaSlug, e.target.value)}
              >
                {voices.map(voice => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} - {voice.description}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminAutomationConfigPage;
```

### 7. Frontend CSS

**File:** `frontend/src/pages/AdminAutomationConfigPage.css` (new)

```css
.admin-automation-config {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.admin-automation-config h1 {
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.config-section {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.config-section h2 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.help-text {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input[type="text"],
.form-group input[type="email"],
.form-group input[type="url"],
.form-group input[type="number"] {
  width: 100%;
  max-width: 400px;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 1rem;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
}

.mode-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.mode-option:has(input:checked) {
  border-color: var(--accent-color);
  background: var(--accent-color-light);
}

.turn-limits-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.turn-limits-grid .form-group {
  display: flex;
  flex-direction: column;
}

.turn-limits-grid input {
  width: 80px;
}

.unit {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin-left: 0.5rem;
}

.voice-mappings-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.voice-mapping-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--bg-primary);
  border-radius: 6px;
}

.voice-mapping-row .persona-name {
  font-weight: 500;
  min-width: 200px;
}

.voice-mapping-row select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  min-width: 250px;
}

.actions {
  margin-top: 1.5rem;
}

.btn.primary {
  background: var(--accent-color);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-color-dark);
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alert {
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.alert.error {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.alert.success {
  background: #d1fae5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
```

---

## Testing

### Test 1: Load Configuration

```bash
curl http://localhost:3001/admin/automation/config
```

### Test 2: Update Configuration

```bash
curl -X PUT http://localhost:3001/admin/automation/config \
  -H "Content-Type: application/json" \
  -d '{
    "autoPublishEnabled": true,
    "defaultConversationMode": "rapid_fire",
    "turnLimitRapidFire": 8
  }'
```

### Test 3: Update Voice Mapping

```bash
curl -X PUT http://localhost:3001/admin/automation/voice-mappings/james-jb-buchanan \
  -H "Content-Type: application/json" \
  -d '{"voiceId": "Fenrir"}'
```

### Test 4: Frontend Integration

1. Navigate to `/admin/automation`
2. Toggle auto-publish on/off
3. Change default mode to Rapid Fire
4. Adjust turn limits
5. Change voice for a persona
6. Save and verify persistence

---

## Definition of Done

- [ ] Migration 032 creates `automation_config` table
- [ ] Migration 033 creates `persona_voice_mappings` table
- [ ] `AutomationConfigRepository` implemented
- [ ] API routes for config and voice mappings
- [ ] Frontend admin page functional
- [ ] Persona voice dropdown works
- [ ] Turn limits configurable
- [ ] Default mode selector works
- [ ] Settings persist to database
- [ ] Settings used by automation pipeline

---

## Integration with Automation Pipeline

Update `AUTO-004` (publish-worker.ts) to use config from database:

```typescript
// In handleAutoPublish():
const configRepo = createAutomationConfigRepository(pool);
const config = await configRepo.getConfig();

// Use config.defaultConversationMode
// Use config.getTurnLimit(mode) for conversation creation
// Use configRepo.getVoiceForPersona(slug) for TTS
```

---

## Notes

**Available Gemini TTS Voices:**
| Voice | Characteristics | Best For |
|-------|-----------------|----------|
| Zephyr | Warm, friendly | Empathetic personas |
| Puck | Clear, energetic | Narrators, journalists |
| Charon | Thoughtful, measured | Philosophers, judges |
| Kore | Firm, clear (female) | Scientists, politicians |
| Fenrir | Deep, authoritative | Leaders, entrepreneurs |
| Leda | Gentle, nurturing | Advocates, caregivers |
| Orus | Measured, precise | Military, technical |
| Aoede | Neutral, calm | Moderators, futurists |

**Rapid Fire Benefits:**
- Shorter TTS segments (less timeout risk)
- ~8 turns = ~3-5 minute episodes
- More reliable Gemini TTS generation
- Lower cost per episode
