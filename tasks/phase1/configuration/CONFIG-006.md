# CONFIG-006: API Endpoints for Configuration

**Priority:** P0
**Estimate:** S
**Labels:** `configuration`, `api`, `backend`
**Status:** 🟢 TO DO

---

## Context

Update the API routes to accept configuration parameters when creating debates and add new endpoints for retrieving available presets.

**References:**
- [Debate Routes](../../../backend/src/routes/debate-routes.ts) - Current API implementation
- [Configuration Types](./CONFIG-002.md) - Type definitions

---

## Requirements

### Acceptance Criteria

- [ ] `POST /api/debates` accepts configuration fields
- [ ] Add `GET /api/presets` endpoint to list available presets
- [ ] Add `GET /api/presets/:id` endpoint to get preset details
- [ ] Input validation for configuration fields
- [ ] Error responses for invalid configuration
- [ ] API documentation updated

---

## Implementation Guide

### Update POST /api/debates

Modify `backend/src/routes/debate-routes.ts`:

```typescript
import { presetRepository } from '../db/repositories/preset-repository.js';
import {
  validateConfiguration,
  isPresetMode,
  isBrevityLevel,
  CONFIGURATION_CONSTRAINTS,
  DEFAULT_CONFIGURATION,
} from '../types/configuration.js';

/**
 * Validate configuration input from request body
 */
function validateConfigInput(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate preset mode
  if (body.presetMode !== undefined && !isPresetMode(body.presetMode)) {
    errors.push(`Invalid preset mode: ${body.presetMode}. Valid values: quick, balanced, deep_dive, research, custom`);
  }

  // Validate brevity level
  if (body.brevityLevel !== undefined) {
    if (!isBrevityLevel(body.brevityLevel)) {
      errors.push(`Invalid brevity level: ${body.brevityLevel}. Must be 1-5.`);
    }
  }

  // Validate temperature
  if (body.llmTemperature !== undefined) {
    const temp = parseFloat(body.llmTemperature);
    if (isNaN(temp) || temp < 0 || temp > 1) {
      errors.push(`Invalid temperature: ${body.llmTemperature}. Must be between 0.0 and 1.0.`);
    }
  }

  // Validate max tokens
  if (body.maxTokensPerResponse !== undefined) {
    const tokens = parseInt(body.maxTokensPerResponse, 10);
    const { min, max } = CONFIGURATION_CONSTRAINTS.maxTokensPerResponse;
    if (isNaN(tokens) || tokens < min || tokens > max) {
      errors.push(`Invalid max tokens: ${body.maxTokensPerResponse}. Must be between ${min} and ${max}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Updated POST /debates endpoint
router.post('/debates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { propositionText, propositionContext, flowMode } = req.body;

    // Validate proposition
    if (!propositionText || typeof propositionText !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'propositionText is required and must be a string',
      });
    }

    // Validate configuration fields
    const configValidation = validateConfigInput(req.body);
    if (!configValidation.valid) {
      return res.status(400).json({
        error: 'Configuration Validation Error',
        message: 'Invalid configuration values',
        details: configValidation.errors,
      });
    }

    // If a preset is specified, load its values
    let presetValues = {};
    if (req.body.presetMode && req.body.presetMode !== 'custom') {
      const preset = await presetRepository.findById(req.body.presetMode);
      if (preset) {
        presetValues = {
          brevityLevel: preset.brevityLevel,
          llmTemperature: preset.llmTemperature,
          maxTokensPerResponse: preset.maxTokensPerResponse,
          requireCitations: preset.requireCitations,
        };
      }
    }

    // Build create input with configuration
    const input: CreateDebateInput = {
      propositionText: propositionText.trim(),
      propositionContext,
      flowMode: flowMode ?? 'auto',
      // Configuration fields (custom values override preset values)
      presetMode: req.body.presetMode ?? 'balanced',
      brevityLevel: req.body.brevityLevel ?? presetValues.brevityLevel,
      llmTemperature: req.body.llmTemperature !== undefined
        ? parseFloat(req.body.llmTemperature)
        : presetValues.llmTemperature,
      maxTokensPerResponse: req.body.maxTokensPerResponse !== undefined
        ? parseInt(req.body.maxTokensPerResponse, 10)
        : presetValues.maxTokensPerResponse,
      requireCitations: req.body.requireCitations ?? presetValues.requireCitations,
    };

    logger.info('Creating debate with configuration', {
      propositionLength: input.propositionText.length,
      flowMode: input.flowMode,
      presetMode: input.presetMode,
      brevityLevel: input.brevityLevel,
    });

    // Create the debate
    const debate = await debateRepository.create(input);

    // Start the orchestrator...
    // (existing orchestrator code)

    res.status(201).json({
      id: debate.id,
      status: debate.status,
      flowMode: debate.flowMode,
      presetMode: debate.presetMode,
      brevityLevel: debate.brevityLevel,
      requireCitations: debate.requireCitations,
      createdAt: debate.createdAt,
    });
  } catch (error) {
    next(error);
  }
});
```

### Add GET /api/presets Endpoints

```typescript
/**
 * GET /api/presets
 * List all available presets
 */
router.get('/presets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const presets = await presetRepository.listSystemPresets();

    res.json({
      presets: presets.map(preset => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        brevityLevel: preset.brevityLevel,
        llmTemperature: preset.llmTemperature,
        maxTokensPerResponse: preset.maxTokensPerResponse,
        requireCitations: preset.requireCitations,
        isSystemPreset: preset.isSystemPreset,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/presets/:id
 * Get a specific preset by ID
 */
router.get('/presets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const preset = await presetRepository.findById(id);

    if (!preset) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Preset '${id}' not found`,
      });
    }

    res.json({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      brevityLevel: preset.brevityLevel,
      llmTemperature: preset.llmTemperature,
      maxTokensPerResponse: preset.maxTokensPerResponse,
      requireCitations: preset.requireCitations,
      isSystemPreset: preset.isSystemPreset,
    });
  } catch (error) {
    next(error);
  }
});
```

### API Documentation

Add to API docs:

```markdown
## Configuration Endpoints

### GET /api/presets

Returns available debate presets.

**Response:**
```json
{
  "presets": [
    {
      "id": "quick",
      "name": "Quick Mode",
      "description": "Fast, concise responses for rapid analysis",
      "brevityLevel": 5,
      "llmTemperature": 0.5,
      "maxTokensPerResponse": 512,
      "requireCitations": false,
      "isSystemPreset": true
    },
    ...
  ]
}
```

### POST /api/debates (Updated)

Create a new debate with optional configuration.

**Request Body:**
```json
{
  "propositionText": "Should AI be regulated?",
  "propositionContext": { "category": "technology" },
  "flowMode": "auto",
  "presetMode": "research",
  "brevityLevel": 2,
  "llmTemperature": 0.6,
  "maxTokensPerResponse": 2048,
  "requireCitations": true
}
```

**Configuration Fields (all optional):**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| presetMode | string | "balanced" | quick, balanced, deep_dive, research, custom |
| brevityLevel | number | 3 | 1-5, where 1=detailed, 5=concise |
| llmTemperature | number | 0.7 | 0.0-1.0 |
| maxTokensPerResponse | number | 1024 | 100-8000 |
| requireCitations | boolean | false | Require evidence tags |

**Note:** When presetMode is set (not "custom"), preset values are used as defaults. Individual fields can still override preset values.
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-002: Configuration types
- CONFIG-003: Preset repository

---

## Validation

### API Tests

```typescript
// backend/src/routes/__tests__/debate-routes.test.ts

describe('POST /api/debates with configuration', () => {
  it('creates debate with default configuration', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({ propositionText: 'Test proposition' });

    expect(response.status).toBe(201);
    expect(response.body.presetMode).toBe('balanced');
    expect(response.body.brevityLevel).toBe(3);
  });

  it('creates debate with preset configuration', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({
        propositionText: 'Test proposition',
        presetMode: 'research',
      });

    expect(response.status).toBe(201);
    expect(response.body.presetMode).toBe('research');
    expect(response.body.requireCitations).toBe(true);
  });

  it('creates debate with custom configuration', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({
        propositionText: 'Test proposition',
        presetMode: 'custom',
        brevityLevel: 4,
        llmTemperature: 0.5,
        maxTokensPerResponse: 512,
        requireCitations: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.brevityLevel).toBe(4);
  });

  it('returns 400 for invalid configuration', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({
        propositionText: 'Test',
        brevityLevel: 10, // Invalid
        llmTemperature: 2.0, // Invalid
      });

    expect(response.status).toBe(400);
    expect(response.body.details).toHaveLength(2);
  });
});

describe('GET /api/presets', () => {
  it('returns all system presets', async () => {
    const response = await request(app).get('/api/presets');

    expect(response.status).toBe(200);
    expect(response.body.presets).toHaveLength(4);
    expect(response.body.presets[0].id).toBe('quick');
  });
});

describe('GET /api/presets/:id', () => {
  it('returns preset by ID', async () => {
    const response = await request(app).get('/api/presets/research');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('research');
    expect(response.body.requireCitations).toBe(true);
  });

  it('returns 404 for unknown preset', async () => {
    const response = await request(app).get('/api/presets/unknown');

    expect(response.status).toBe(404);
  });
});
```

### Definition of Done

- [ ] POST /api/debates accepts configuration fields
- [ ] Configuration validation implemented
- [ ] Preset values applied when presetMode specified
- [ ] GET /api/presets endpoint working
- [ ] GET /api/presets/:id endpoint working
- [ ] Error handling for invalid config
- [ ] API tests written and passing
- [ ] API documentation updated

---

## Notes

### Preset Override Behavior

When `presetMode` is specified:
1. Preset values are loaded as defaults
2. Individual fields in the request override preset values
3. This allows "Research mode but with higher temperature"

### Validation Order

1. Required fields validated first (propositionText)
2. Configuration fields validated second
3. Preset lookup happens after validation
4. Final values computed with overrides

---

**Estimated Time:** 2 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
