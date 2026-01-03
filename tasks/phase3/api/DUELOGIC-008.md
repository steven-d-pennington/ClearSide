# DUELOGIC-008: API Routes

**Priority:** P0
**Estimate:** S (1 day)
**Labels:** `api`, `backend`, `duelogic`
**Status:** 🟢 TO DO
**Depends On:** DUELOGIC-001, DUELOGIC-002, DUELOGIC-007

---

## Context

API routes expose the Duelogic functionality to the frontend, allowing creation of Duelogic debates, fetching configuration options, and managing debate state.

**References:**
- [Master Duelogic Spec](../../DUELOGIC-001.md) - API Endpoints section
- [Existing Routes](../../../backend/src/routes/) - Route patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create `backend/src/routes/duelogic-routes.ts`
- [ ] POST `/api/debates/duelogic` - Create new Duelogic debate
- [ ] GET `/api/duelogic/chairs` - List philosophical chairs
- [ ] GET `/api/duelogic/presets` - List preset matchups
- [ ] GET `/api/duelogic/models` - List available models
- [ ] POST `/api/debates/:id/arbiter/interject` - Manual interjection
- [ ] Input validation with Zod schemas
- [ ] Error handling with appropriate status codes
- [ ] Register routes in main router
- [ ] Write API tests

---

## Implementation Guide

### File: `backend/src/routes/duelogic-routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { LLMClient } from '../llm/openrouter-adapter';
import { SSEManager } from '../sse/sse-manager';
import {
  DuelogicConfig,
  DuelogicChair,
  PHILOSOPHICAL_CHAIR_INFO,
  DUELOGIC_PRESETS,
  DUELOGIC_DEFAULTS,
  DUELOGIC_CONSTRAINTS,
  PhilosophicalChair
} from '../types/duelogic';
import { DuelogicOrchestrator } from '../services/debate/duelogic-orchestrator';
import { DuelogicRepository } from '../db/repositories/duelogic-repository';
import { generateId } from '../utils/id';

// Validation schemas
const PhilosophicalChairSchema = z.enum([
  'utilitarian', 'virtue_ethics', 'deontological', 'pragmatic',
  'libertarian', 'communitarian', 'cosmopolitan', 'precautionary',
  'autonomy_centered', 'care_ethics'
]);

const DuelogicChairSchema = z.object({
  position: z.string(),
  framework: PhilosophicalChairSchema,
  modelId: z.string(),
  modelDisplayName: z.string().optional(),
  providerName: z.string().optional(),
  persona: z.string().optional(),
});

const CreateDuelogicDebateSchema = z.object({
  proposition: z.string().min(10, 'Proposition must be at least 10 characters'),
  propositionContext: z.string().optional(),
  config: z.object({
    chairs: z.array(DuelogicChairSchema)
      .min(DUELOGIC_CONSTRAINTS.minChairs, `Minimum ${DUELOGIC_CONSTRAINTS.minChairs} chairs required`)
      .max(DUELOGIC_CONSTRAINTS.maxChairs, `Maximum ${DUELOGIC_CONSTRAINTS.maxChairs} chairs allowed`)
      .optional(),
    arbiter: z.object({
      modelId: z.string(),
      modelDisplayName: z.string().optional(),
      accountabilityLevel: z.enum(['relaxed', 'moderate', 'strict']).optional(),
    }).optional(),
    flow: z.object({
      style: z.enum(['structured', 'conversational']).optional(),
      maxExchanges: z.number()
        .min(DUELOGIC_CONSTRAINTS.minExchanges)
        .max(DUELOGIC_CONSTRAINTS.maxExchanges)
        .optional(),
      targetDurationMinutes: z.number().min(5).max(120).optional(),
    }).optional(),
    interruptions: z.object({
      enabled: z.boolean().optional(),
      allowChairInterruptions: z.boolean().optional(),
      allowArbiterInterruptions: z.boolean().optional(),
      aggressiveness: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
      cooldownSeconds: z.number().min(0).max(300).optional(),
    }).optional(),
    tone: z.enum(['respectful', 'spirited', 'heated']).optional(),
    podcastMode: z.object({
      enabled: z.boolean().optional(),
      showName: z.string().optional(),
      episodeNumber: z.number().optional(),
      includeCallToAction: z.boolean().optional(),
    }).optional(),
    mandates: z.object({
      requireSteelManning: z.boolean().optional(),
      requireSelfCritique: z.boolean().optional(),
      arbiterCanInterject: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

const ManualInterjectionSchema = z.object({
  reason: z.string().min(1),
  targetChair: z.string().optional(),
});

export function createDuelogicRoutes(
  llmClient: LLMClient,
  sseManager: SSEManager,
  pool: Pool
): Router {
  const router = Router();
  const repository = new DuelogicRepository(pool);
  const activeOrchestrators = new Map<string, DuelogicOrchestrator>();

  /**
   * POST /api/debates/duelogic
   * Create a new Duelogic debate
   */
  router.post('/debates/duelogic', async (req: Request, res: Response) => {
    try {
      const parsed = CreateDuelogicDebateSchema.parse(req.body);

      const debateId = generateId('duelogic');

      // Merge with defaults
      const config: DuelogicConfig = {
        ...DUELOGIC_DEFAULTS,
        ...parsed.config,
        mode: 'duelogic',
        chairs: parsed.config?.chairs || DUELOGIC_DEFAULTS.chairs,
        arbiter: {
          ...DUELOGIC_DEFAULTS.arbiter,
          ...parsed.config?.arbiter,
        },
        flow: {
          ...DUELOGIC_DEFAULTS.flow,
          ...parsed.config?.flow,
        },
        interruptions: {
          ...DUELOGIC_DEFAULTS.interruptions,
          ...parsed.config?.interruptions,
        },
        podcastMode: {
          ...DUELOGIC_DEFAULTS.podcastMode,
          ...parsed.config?.podcastMode,
        },
        mandates: {
          ...DUELOGIC_DEFAULTS.mandates,
          ...parsed.config?.mandates,
        },
      };

      // Save debate to database
      await pool.query(
        `INSERT INTO debates (id, proposition, proposition_context, status, debate_mode, duelogic_config, created_at)
         VALUES ($1, $2, $3, 'pending', 'duelogic', $4, NOW())`,
        [debateId, parsed.proposition, parsed.propositionContext, JSON.stringify(config)]
      );

      // Create orchestrator
      const orchestrator = new DuelogicOrchestrator({
        llmClient,
        sseManager,
        pool,
        debateId,
        proposition: parsed.proposition,
        propositionContext: parsed.propositionContext,
        config,
      });

      activeOrchestrators.set(debateId, orchestrator);

      // Start debate in background
      orchestrator.start().catch(err => {
        console.error(`Debate ${debateId} failed:`, err);
      });

      res.status(201).json({
        success: true,
        debateId,
        config,
        message: 'Duelogic debate created and starting',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          errors: error.errors,
        });
      } else {
        console.error('Error creating Duelogic debate:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to create debate',
        });
      }
    }
  });

  /**
   * GET /api/duelogic/chairs
   * List available philosophical chairs with descriptions
   */
  router.get('/duelogic/chairs', (_req: Request, res: Response) => {
    const chairs = Object.entries(PHILOSOPHICAL_CHAIR_INFO).map(([id, info]) => ({
      id,
      ...info,
    }));

    res.json({
      success: true,
      chairs,
    });
  });

  /**
   * GET /api/duelogic/presets
   * List preset chair matchups
   */
  router.get('/duelogic/presets', (_req: Request, res: Response) => {
    const presets = Object.entries(DUELOGIC_PRESETS).map(([id, preset]) => ({
      id,
      ...preset,
    }));

    res.json({
      success: true,
      presets,
    });
  });

  /**
   * GET /api/duelogic/models
   * List available models with display names and providers
   */
  router.get('/duelogic/models', async (_req: Request, res: Response) => {
    // TODO: Fetch from OpenRouter API
    const models = [
      {
        id: 'anthropic/claude-sonnet-4',
        displayName: 'Claude Sonnet 4',
        provider: 'Anthropic',
        capabilities: ['fast', 'intelligent', 'nuanced'],
      },
      {
        id: 'anthropic/claude-opus-4',
        displayName: 'Claude Opus 4',
        provider: 'Anthropic',
        capabilities: ['flagship', 'deep-reasoning'],
      },
      {
        id: 'openai/gpt-4o',
        displayName: 'GPT-4o',
        provider: 'OpenAI',
        capabilities: ['multimodal', 'fast'],
      },
      {
        id: 'x-ai/grok-3',
        displayName: 'Grok 3',
        provider: 'xAI',
        capabilities: ['unfiltered', 'witty'],
      },
      {
        id: 'google/gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        provider: 'Google',
        capabilities: ['fast', 'efficient'],
      },
      {
        id: 'meta-llama/llama-3.3-70b',
        displayName: 'Llama 3.3 70B',
        provider: 'Meta',
        capabilities: ['open-source', 'cost-effective'],
      },
    ];

    res.json({
      success: true,
      models,
    });
  });

  /**
   * POST /api/debates/:id/arbiter/interject
   * Manually trigger arbiter interjection
   */
  router.post('/debates/:id/arbiter/interject', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const parsed = ManualInterjectionSchema.parse(req.body);

      const orchestrator = activeOrchestrators.get(id);
      if (!orchestrator) {
        return res.status(404).json({
          success: false,
          message: 'Debate not found or not active',
        });
      }

      // TODO: Implement manual interjection in orchestrator
      // For now, return success
      res.json({
        success: true,
        message: 'Interjection queued',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to trigger interjection',
        });
      }
    }
  });

  /**
   * GET /api/debates/:id/duelogic/status
   * Get Duelogic debate status and stats
   */
  router.get('/debates/:id/duelogic/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const orchestrator = activeOrchestrators.get(id);
      if (orchestrator) {
        return res.json({
          success: true,
          ...orchestrator.getStatus(),
          active: true,
        });
      }

      // Check database for completed debate
      const result = await pool.query(
        `SELECT d.*,
                (SELECT COUNT(*) FROM utterances u WHERE u.debate_id = d.id) as utterance_count,
                (SELECT COUNT(*) FROM debate_chairs dc WHERE dc.debate_id = d.id) as chair_count
         FROM debates d WHERE d.id = $1 AND d.debate_mode = 'duelogic'`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Duelogic debate not found',
        });
      }

      res.json({
        success: true,
        debate: result.rows[0],
        active: false,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get debate status',
      });
    }
  });

  /**
   * POST /api/debates/:id/pause
   * Pause an active Duelogic debate
   */
  router.post('/debates/:id/pause', (req: Request, res: Response) => {
    const orchestrator = activeOrchestrators.get(req.params.id);
    if (!orchestrator) {
      return res.status(404).json({ success: false, message: 'Debate not found' });
    }
    orchestrator.pause();
    res.json({ success: true, message: 'Debate paused' });
  });

  /**
   * POST /api/debates/:id/resume
   * Resume a paused Duelogic debate
   */
  router.post('/debates/:id/resume', (req: Request, res: Response) => {
    const orchestrator = activeOrchestrators.get(req.params.id);
    if (!orchestrator) {
      return res.status(404).json({ success: false, message: 'Debate not found' });
    }
    orchestrator.resume();
    res.json({ success: true, message: 'Debate resumed' });
  });

  /**
   * POST /api/debates/:id/stop
   * Stop an active Duelogic debate
   */
  router.post('/debates/:id/stop', (req: Request, res: Response) => {
    const orchestrator = activeOrchestrators.get(req.params.id);
    if (!orchestrator) {
      return res.status(404).json({ success: false, message: 'Debate not found' });
    }
    orchestrator.stop();
    activeOrchestrators.delete(req.params.id);
    res.json({ success: true, message: 'Debate stopped' });
  });

  return router;
}
```

### Register Routes

Add to `backend/src/routes/index.ts`:

```typescript
import { createDuelogicRoutes } from './duelogic-routes';

// In the router setup
app.use('/api', createDuelogicRoutes(llmClient, sseManager, pool));
```

---

## Dependencies

- DUELOGIC-001: Types & Configuration
- DUELOGIC-002: Database Schema
- DUELOGIC-007: Duelogic Orchestrator

---

## Validation

```bash
# API tests
npm run test -- --grep "duelogic routes"

# Manual testing
curl -X POST http://localhost:3001/api/debates/duelogic \
  -H "Content-Type: application/json" \
  -d '{"proposition": "Should AI development be paused?"}'
```

---

## Test Cases

```typescript
describe('Duelogic API Routes', () => {
  describe('POST /api/debates/duelogic', () => {
    it('creates debate with valid config', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused?',
          config: {
            chairs: [
              { position: 'chair_1', framework: 'utilitarian', modelId: 'test' },
              { position: 'chair_2', framework: 'virtue_ethics', modelId: 'test' },
            ]
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.debateId).toBeDefined();
    });

    it('rejects invalid chair count', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Test',
          config: {
            chairs: [{ position: 'chair_1', framework: 'utilitarian', modelId: 'test' }]
          }
        });

      expect(response.status).toBe(400);
    });

    it('uses defaults when config not provided', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({ proposition: 'Should AI development be paused?' });

      expect(response.status).toBe(201);
      expect(response.body.config.chairs.length).toBe(2);
    });
  });

  describe('GET /api/duelogic/chairs', () => {
    it('returns all philosophical chairs', async () => {
      const response = await request(app).get('/api/duelogic/chairs');

      expect(response.status).toBe(200);
      expect(response.body.chairs.length).toBe(10);
      expect(response.body.chairs[0]).toHaveProperty('id');
      expect(response.body.chairs[0]).toHaveProperty('name');
      expect(response.body.chairs[0]).toHaveProperty('blindSpotsToAdmit');
    });
  });

  describe('GET /api/duelogic/presets', () => {
    it('returns preset matchups', async () => {
      const response = await request(app).get('/api/duelogic/presets');

      expect(response.status).toBe(200);
      expect(response.body.presets.length).toBeGreaterThan(0);
      expect(response.body.presets[0]).toHaveProperty('chairs');
    });
  });
});
```

---

## Definition of Done

- [ ] All endpoints implemented and working
- [ ] Input validation with helpful error messages
- [ ] Debates saved to database correctly
- [ ] SSE events sent after debate creation
- [ ] Pause/resume/stop controls work
- [ ] API tests pass
- [ ] Routes registered in main router
