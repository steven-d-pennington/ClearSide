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

---

## 📝 Implementation Notes from DUELOGIC-001 & DUELOGIC-002

> Added by agent completing Sprint 1 on 2026-01-03

### Types to Import

From `backend/src/types/duelogic.ts`:

```typescript
import {
  DuelogicConfig,
  DuelogicChair,
  PhilosophicalChair,
  AccountabilityLevel,
  AggressivenessLevel,
  DebateTone,
  FlowStyle,
  PHILOSOPHICAL_CHAIR_INFO,
  DUELOGIC_PRESETS,
  DUELOGIC_DEFAULTS,
  DUELOGIC_CONSTRAINTS,
  createDuelogicConfig,      // Factory with validation
  validateDuelogicConfig,    // Runtime validator
  isPhilosophicalChair,      // Type guard
} from '../types/duelogic.js';
```

### Repository Functions

From `backend/src/db/repositories/duelogic-repository.ts`:

```typescript
import {
  saveDuelogicConfig,       // Store config in debates.duelogic_config
  getDuelogicConfig,        // Retrieve config from database
  saveChairAssignment,      // Save single chair assignment
  saveAllChairAssignments,  // Batch save all chairs
  getChairAssignments,      // Get all chairs for debate
  getDuelogicDebateStats,   // Summary statistics
} from '../db/repositories/duelogic-repository.js';
```

### Database Schema

Debates table with Duelogic columns:
- `debate_mode`: 'duelogic' for this mode
- `duelogic_config`: JSONB storing full DuelogicConfig

New tables:
- `debate_chairs`: Chair assignments per debate
- `response_evaluations`: Evaluation scores per utterance
- `chair_interruptions`: Logged interruption events

### Zod Validation Constants

Use `DUELOGIC_CONSTRAINTS` for validation limits:
```typescript
const DUELOGIC_CONSTRAINTS = {
  minChairs: 2,
  maxChairs: 6,
  minExchanges: 2,
  maxExchanges: 10,
  minTargetDuration: 5,
  maxTargetDuration: 60,
};
```

### Existing Route Patterns

Check `backend/src/routes/debate-routes.ts` for patterns:
- Express Router setup
- Zod schema validation
- Error handling with appropriate status codes
- SSE integration for real-time updates

### API Response Format

Standard response structure:
```typescript
// Success
{ success: true, debateId: string, config: DuelogicConfig, message: string }

// Error
{ success: false, errors?: ZodError[], message: string }
```

---

## 📝 Implementation Notes from DUELOGIC-003 & DUELOGIC-004

> Added by agent completing Sprint 2 on 2026-01-03

### Agent Creation in Route Handler

```typescript
import { createArbiterAgent, ArbiterAgent } from '../agents/arbiter-agent.js';
import { createChairAgents, getAllChairAgents } from '../agents/chair-agent.js';

// In POST /api/debates/duelogic handler:
const arbiter = createArbiterAgent({ config, debateId, sseManager });
const chairAgents = createChairAgents(config, debateId, sseManager);
```

### Interjection Endpoint

The manual interjection endpoint can use:

```typescript
import { ViolationType } from '../agents/prompts/arbiter-prompts.js';

// ViolationType: 'straw_manning' | 'missing_self_critique' | 'framework_inconsistency' | 'rhetorical_evasion'

// In POST /api/debates/:id/arbiter/interject:
const interjection = await arbiter.generateInterjection(
  violation,      // ViolationType
  targetChair,    // DuelogicChair
  violatingContent
);
```

### Evaluation Endpoint (Optional)

Could add endpoint for manual evaluation:

```typescript
// POST /api/debates/:id/evaluate
const evaluation = await arbiter.evaluateResponse({
  chair: targetChair,
  responseContent,
  debateHistory,
});

// Response includes:
// { adherenceScore, steelManning, selfCritique, frameworkConsistency, intellectualHonesty }
```

### Agent Metadata for Status

```typescript
// In GET /api/debates/:id/duelogic/status:
const arbiterMeta = arbiter.getMetadata();
const chairMetas = getAllChairAgents(chairAgents).map(c => c.getMetadata());
```

---

## 📝 Implementation Notes from DUELOGIC-005

> Added by agent completing Sprint 2 on 2026-01-03

### Response Evaluator for Manual Evaluation Endpoint

Add optional evaluation endpoint using ResponseEvaluator:

```typescript
import { createResponseEvaluator } from '../services/debate/response-evaluator.js';

// POST /api/debates/:id/evaluate (optional endpoint)
router.post('/debates/:id/evaluate', async (req, res) => {
  const { chairPosition, responseContent, previousSpeakerPosition, previousContent } = req.body;

  const config = await getDuelogicConfig(req.params.id);
  const evaluator = createResponseEvaluator(config, req.params.id);

  const chair = config.chairs.find(c => c.position === chairPosition);
  const previousSpeaker = config.chairs.find(c => c.position === previousSpeakerPosition);

  const result = await evaluator.evaluate({
    chair,
    responseContent,
    debateHistory: '',  // Or fetch from DB
    previousSpeaker,
    previousContent,
  });

  res.json({
    success: true,
    evaluation: result.evaluation,
    method: result.method,
    durationMs: result.durationMs,
  });
});
```

### Debate Stats with Evaluation Metrics

Enhance status endpoint with evaluation statistics:

```typescript
import { getEvaluationsForDebate, getDuelogicDebateStats } from '../db/repositories/duelogic-repository.js';

// GET /api/debates/:id/duelogic/stats
router.get('/debates/:id/duelogic/stats', async (req, res) => {
  const stats = await getDuelogicDebateStats(req.params.id);

  res.json({
    success: true,
    stats: {
      chairCount: stats.chairCount,
      utteranceCount: stats.utteranceCount,
      interruptionCount: stats.interruptionCount,
      averageAdherence: stats.averageAdherence,
      steelManningRate: stats.steelManningRate,
      selfCritiqueRate: stats.selfCritiqueRate,
    }
  });
});
```

### Evaluation Response Format

When returning evaluation data from API:

```typescript
interface EvaluationResponse {
  adherenceScore: number;  // 0-100
  steelManning: {
    attempted: boolean;
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    notes?: string;
  };
  selfCritique: {
    attempted: boolean;
    quality: 'strong' | 'adequate' | 'weak' | 'absent';
    notes?: string;
  };
  frameworkConsistency: {
    consistent: boolean;
    violations?: string[];
  };
  intellectualHonesty: {
    score: 'high' | 'medium' | 'low';
    issues?: string[];
  };
  requiresInterjection: boolean;
  interjectionReason?: string;
}
```

---

## 📝 Implementation Notes from DUELOGIC-006

> Added by agent completing Sprint 3 on 2026-01-03

### Interruption Statistics Endpoint

Add endpoint for interrupt statistics using ChairInterruptionEngine:

```typescript
import { getInterruptionsByDebate, getInterruptionCountsByReason } from '../db/repositories/duelogic-repository.js';

// GET /api/debates/:id/duelogic/interruptions
router.get('/debates/:id/duelogic/interruptions', async (req, res) => {
  const interruptions = await getInterruptionsByDebate(req.params.id);

  res.json({
    success: true,
    interruptions: interruptions.map(i => ({
      interrupter: i.interruptingChair,
      interrupted: i.interruptedChair,
      reason: i.triggerReason,
      content: i.interruptionContent,
      urgency: i.urgency,
      timestamp: i.timestampMs,
    })),
    count: interruptions.length,
  });
});
```

### Interruption Counts by Reason

```typescript
// GET /api/debates/:id/duelogic/interruptions/stats
router.get('/debates/:id/duelogic/interruptions/stats', async (req, res) => {
  const [byReason, byChair] = await Promise.all([
    getInterruptionCountsByReason(req.params.id),
    getInterruptionCountsByChair(req.params.id),
  ]);

  res.json({
    success: true,
    stats: {
      byReason: Object.fromEntries(byReason),
      byChair: {
        made: Object.fromEntries(byChair.made),
        received: Object.fromEntries(byChair.received),
      },
    },
  });
});
```

### Interrupt Reason Types

When returning interrupt data, use these standard reason types:

```typescript
type ChairInterruptReason =
  | 'factual_correction'     // Correcting a misrepresentation
  | 'straw_man_detected'     // Attacking weak version
  | 'direct_challenge'       // Pushback on claim
  | 'clarification_needed'   // Requesting clarity
  | 'strong_agreement'       // Amplifying good point
  | 'pivotal_point';         // Core disagreement moment
```

### SSE Events for Interrupts

When orchestrator triggers an interrupt, broadcast:

```typescript
{
  type: 'chair_interrupt',
  data: {
    interrupter: 'chair_1',
    interrupted: 'chair_2',
    reason: 'straw_man_detected',
    opener: "Hold on, you're attacking a position I never took—",
    urgency: 0.85,
  }
}
```

---

## 📝 Implementation Notes from DUELOGIC-007

> Added by agent completing Sprint 3 on 2026-01-03

### DuelogicOrchestrator Integration

The orchestrator is at `backend/src/services/debate/duelogic-orchestrator.ts`:

```typescript
import {
  DuelogicOrchestrator,
  createDuelogicOrchestrator,
  type DuelogicOrchestratorOptions,
  type DuelogicOrchestratorStatus,
} from '../services/debate/duelogic-orchestrator.js';
```

### Creating Orchestrator in Route Handler

```typescript
// POST /api/debates/duelogic
const orchestratorOptions: DuelogicOrchestratorOptions = {
  debateId,
  proposition: parsed.proposition,
  propositionContext: parsed.propositionContext,
  config,               // Full DuelogicConfig
  sseManager,           // Inject the SSE manager
};

const orchestrator = createDuelogicOrchestrator(orchestratorOptions);

// Store in active orchestrators map for pause/resume/stop
activeOrchestrators.set(debateId, orchestrator);

// Start in background (non-blocking)
orchestrator.start().catch(err => {
  logger.error({ err, debateId }, 'Debate failed');
  activeOrchestrators.delete(debateId);
});
```

### Orchestrator Control Methods

Use for pause/resume/stop endpoints:

```typescript
// GET status
const status: DuelogicOrchestratorStatus = orchestrator.getStatus();
// Returns: { isRunning, isPaused, currentSegment, utteranceCount, exchangeNumber, elapsedMs }

// POST /api/debates/:id/pause
orchestrator.pause();

// POST /api/debates/:id/resume
orchestrator.resume();

// POST /api/debates/:id/stop
orchestrator.stop('User requested stop');

// Get transcript
const transcript = orchestrator.getTranscript();
```

### SSE Events Broadcast by Orchestrator

The orchestrator broadcasts these events via `sseManager.broadcastToDebate()`:

```typescript
// Debate lifecycle
'duelogic_debate_started'  // { debateId, proposition, chairs, config }
'debate_paused'            // { debateId, pausedAt, segment, exchangeNumber }
'debate_resumed'           // { debateId, resumedAt, segment, exchangeNumber }
'debate_stopped'           // { debateId, stoppedAt, reason, segment, utteranceCount }
'debate_complete'          // { debateId, completedAt, stats }
'error'                    // { debateId, message, timestamp }

// Segment lifecycle
'segment_start'            // { segment, timestamp }
'segment_complete'         // { segment, timestamp }
'exchange_complete'        // { exchangeNumber, maxExchanges }

// Speaker events
'speaker_started'          // { speaker, framework, segment, exchangeNumber? }
'utterance'                // { speaker, segment, content, timestampMs, evaluation?, isInterruption? }

// Interventions
'chair_interrupt'          // { interrupter, interrupted, reason, opener, urgency }
'arbiter_interjection'     // { chair, violation, adherenceScore }
```

### Stats Returned on Completion

```typescript
interface DebateStats {
  durationMs: number;
  utteranceCount: number;
  interruptionCount: number;
  chairStats: Record<string, {
    averageAdherence: number;
    steelManningRate: number;
    selfCritiqueRate: number;
    utteranceCount: number;
    interruptionsMade: number;
  }>;
}
```

### Active Orchestrator Map Pattern

```typescript
// Keep track of running orchestrators
const activeOrchestrators = new Map<string, DuelogicOrchestrator>();

// In stop handler
router.post('/debates/:id/stop', (req, res) => {
  const orchestrator = activeOrchestrators.get(req.params.id);
  if (!orchestrator) {
    return res.status(404).json({ success: false, message: 'Debate not found' });
  }
  orchestrator.stop();
  activeOrchestrators.delete(req.params.id);  // Clean up
  res.json({ success: true, message: 'Debate stopped' });
});
```
