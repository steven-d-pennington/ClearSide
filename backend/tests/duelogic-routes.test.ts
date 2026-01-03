/**
 * Tests for Duelogic API Routes
 *
 * Validates the REST API endpoints for Duelogic debate mode.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import duelogicRoutes from '../src/routes/duelogic-routes.js';

// Mock dependencies
vi.mock('../src/services/sse/index.js', () => ({
  sseManager: {
    broadcastToDebate: vi.fn(),
  },
}));

vi.mock('../src/db/repositories/debate-repository.js', () => ({
  create: vi.fn().mockResolvedValue({
    id: 'duelogic_test_123',
    propositionText: 'Test proposition',
    status: 'pending',
    debateMode: 'duelogic',
  }),
  findById: vi.fn().mockImplementation((id: string) => {
    if (id === 'not-found') return Promise.resolve(null);
    if (id === 'not-duelogic') {
      return Promise.resolve({
        id,
        debateMode: 'turn_based',
        status: 'completed',
      });
    }
    return Promise.resolve({
      id,
      propositionText: 'Test proposition',
      status: 'completed',
      debateMode: 'duelogic',
      createdAt: new Date().toISOString(),
      totalDurationMs: 120000,
    });
  }),
}));

vi.mock('../src/db/repositories/duelogic-repository.js', () => ({
  getDuelogicDebateStats: vi.fn().mockResolvedValue({
    chairCount: 2,
    utteranceCount: 15,
    interruptionCount: 2,
    averageAdherence: 82,
    steelManningRate: 85,
    selfCritiqueRate: 72,
  }),
}));

vi.mock('../src/services/debate/duelogic-orchestrator.js', () => ({
  createDuelogicOrchestrator: vi.fn().mockReturnValue({
    start: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn().mockReturnValue({
      isRunning: true,
      isPaused: false,
      currentSegment: 'exchange',
      utteranceCount: 10,
      exchangeNumber: 3,
      elapsedMs: 60000,
    }),
    getTranscript: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock('../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', duelogicRoutes);
  return app;
}

describe('Duelogic API Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/duelogic/chairs', () => {
    it('should return all philosophical chairs', async () => {
      const response = await request(app).get('/api/duelogic/chairs');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.chairs).toBeDefined();
      expect(response.body.chairs.length).toBe(10);

      // Check structure
      const firstChair = response.body.chairs[0];
      expect(firstChair).toHaveProperty('id');
      expect(firstChair).toHaveProperty('name');
      expect(firstChair).toHaveProperty('description');
      expect(firstChair).toHaveProperty('coreQuestion');
      expect(firstChair).toHaveProperty('strengthsToAcknowledge');
      expect(firstChair).toHaveProperty('blindSpotsToAdmit');
    });

    it('should include all 10 frameworks', async () => {
      const response = await request(app).get('/api/duelogic/chairs');

      const chairIds = response.body.chairs.map((c: any) => c.id);
      expect(chairIds).toContain('utilitarian');
      expect(chairIds).toContain('virtue_ethics');
      expect(chairIds).toContain('deontological');
      expect(chairIds).toContain('pragmatic');
      expect(chairIds).toContain('libertarian');
      expect(chairIds).toContain('communitarian');
      expect(chairIds).toContain('cosmopolitan');
      expect(chairIds).toContain('precautionary');
      expect(chairIds).toContain('autonomy_centered');
      expect(chairIds).toContain('care_ethics');
    });
  });

  describe('GET /api/duelogic/presets', () => {
    it('should return preset matchups', async () => {
      const response = await request(app).get('/api/duelogic/presets');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.presets).toBeDefined();
      expect(response.body.presets.length).toBeGreaterThan(0);

      // Check structure
      const firstPreset = response.body.presets[0];
      expect(firstPreset).toHaveProperty('id');
      expect(firstPreset).toHaveProperty('name');
      expect(firstPreset).toHaveProperty('description');
      expect(firstPreset).toHaveProperty('chairs');
    });
  });

  describe('GET /api/duelogic/models', () => {
    it('should return available models', async () => {
      const response = await request(app).get('/api/duelogic/models');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.models).toBeDefined();
      expect(response.body.models.length).toBeGreaterThan(0);

      // Check structure
      const firstModel = response.body.models[0];
      expect(firstModel).toHaveProperty('id');
      expect(firstModel).toHaveProperty('displayName');
      expect(firstModel).toHaveProperty('provider');
      expect(firstModel).toHaveProperty('capabilities');
    });

    it('should include popular models', async () => {
      const response = await request(app).get('/api/duelogic/models');

      const modelIds = response.body.models.map((m: any) => m.id);
      expect(modelIds).toContain('anthropic/claude-sonnet-4');
      expect(modelIds).toContain('openai/gpt-4o');
    });
  });

  describe('GET /api/duelogic/defaults', () => {
    it('should return default configuration', async () => {
      const response = await request(app).get('/api/duelogic/defaults');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.defaults).toBeDefined();
      expect(response.body.constraints).toBeDefined();

      // Check defaults structure
      expect(response.body.defaults).toHaveProperty('mode');
      expect(response.body.defaults).toHaveProperty('chairs');
      expect(response.body.defaults).toHaveProperty('arbiter');
      expect(response.body.defaults).toHaveProperty('flow');

      // Check constraints
      expect(response.body.constraints).toHaveProperty('minChairs');
      expect(response.body.constraints).toHaveProperty('maxChairs');
      expect(response.body.constraints.minChairs).toBe(2);
      expect(response.body.constraints.maxChairs).toBe(6);
    });
  });

  describe('POST /api/debates/duelogic', () => {
    it('should create debate with valid config', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused for safety research?',
          config: {
            chairs: [
              { position: 'chair_1', framework: 'utilitarian', modelId: 'anthropic/claude-sonnet-4' },
              { position: 'chair_2', framework: 'deontological', modelId: 'openai/gpt-4o' },
            ],
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.debateId).toBeDefined();
      expect(response.body.config).toBeDefined();
      expect(response.body.config.chairs.length).toBe(2);
    });

    it('should use defaults when config not provided', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused for safety research?',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.config.chairs.length).toBe(2);
    });

    it('should reject proposition shorter than 10 characters', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Too short',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should reject invalid chair count (too few)', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused?',
          config: {
            chairs: [
              { position: 'chair_1', framework: 'utilitarian', modelId: 'test' },
            ],
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid chair count (too many)', async () => {
      const chairs = Array.from({ length: 7 }, (_, i) => ({
        position: `chair_${i + 1}`,
        framework: 'utilitarian',
        modelId: 'test',
      }));

      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused?',
          config: { chairs },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid framework', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused?',
          config: {
            chairs: [
              { position: 'chair_1', framework: 'invalid_framework', modelId: 'test' },
              { position: 'chair_2', framework: 'utilitarian', modelId: 'test' },
            ],
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept valid optional config fields', async () => {
      const response = await request(app)
        .post('/api/debates/duelogic')
        .send({
          proposition: 'Should AI development be paused for safety research?',
          propositionContext: 'Context about AI safety concerns',
          config: {
            chairs: [
              { position: 'chair_1', framework: 'utilitarian', modelId: 'test' },
              { position: 'chair_2', framework: 'deontological', modelId: 'test' },
            ],
            tone: 'spirited',
            flow: {
              maxExchanges: 5,
              style: 'structured',
            },
            interruptions: {
              enabled: true,
              allowChairInterruptions: true,
              aggressiveness: 3,
            },
            podcastMode: {
              enabled: true,
              showName: 'Philosophy Debates',
            },
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/debates/:id/duelogic/status', () => {
    it('should return 404 for non-existent debate', async () => {
      const response = await request(app).get('/api/debates/not-found/duelogic/status');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for non-duelogic debate', async () => {
      const response = await request(app).get('/api/debates/not-duelogic/duelogic/status');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not a Duelogic debate');
    });

    it('should return stats for completed debate', async () => {
      const response = await request(app).get('/api/debates/test-debate-123/duelogic/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(false);
      expect(response.body.debate).toBeDefined();
      expect(response.body.stats).toBeDefined();
    });
  });

  describe('POST /api/debates/:id/duelogic/pause', () => {
    it('should return 404 for non-existent debate', async () => {
      const response = await request(app).post('/api/debates/not-found/duelogic/pause');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/debates/:id/duelogic/resume', () => {
    it('should return 404 for non-existent debate', async () => {
      const response = await request(app).post('/api/debates/not-found/duelogic/resume');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/debates/:id/duelogic/stop', () => {
    it('should return 404 for non-existent debate', async () => {
      const response = await request(app)
        .post('/api/debates/not-found/duelogic/stop')
        .send({ reason: 'Test stop' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/debates/:id/arbiter/interject', () => {
    it('should return 404 for non-existent debate', async () => {
      const response = await request(app)
        .post('/api/debates/not-found/arbiter/interject')
        .send({ reason: 'Test interjection' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing reason', async () => {
      const response = await request(app)
        .post('/api/debates/test-debate/arbiter/interject')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
