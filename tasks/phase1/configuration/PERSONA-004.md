# PERSONA-004: API Endpoints for Personas

**Priority:** P0
**Estimate:** S
**Labels:** `personas`, `api`, `backend`
**Status:** 🟢 TO DO

---

## Context

Add API endpoints for listing available personas and update the debate creation endpoint to accept persona selections.

**References:**
- [Debate Routes](../../../backend/src/routes/debate-routes.ts) - Current API implementation
- [Persona Repository](./PERSONA-002.md) - Data access layer

---

## Requirements

### Acceptance Criteria

- [ ] Add `GET /api/personas` endpoint to list all personas
- [ ] Add `GET /api/personas/:id` endpoint to get persona details
- [ ] Update `POST /api/debates` to accept `proPersonaId` and `conPersonaId`
- [ ] Validate persona IDs exist before creating debate
- [ ] Return persona info in debate response

---

## Implementation Guide

### Add Persona Endpoints

Add to `backend/src/routes/debate-routes.ts`:

```typescript
import { personaRepository } from '../db/repositories/persona-repository.js';

/**
 * GET /api/personas
 * List all available personas
 */
router.get('/personas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const personas = await personaRepository.listSystemPersonas();

    res.json({
      personas: personas.map(persona => ({
        id: persona.id,
        name: persona.name,
        archetype: persona.archetype,
        description: persona.description,
        avatarEmoji: persona.avatarEmoji,
        colorPrimary: persona.colorPrimary,
        colorSecondary: persona.colorSecondary,
        argumentationStyle: persona.argumentationStyle,
        focusAreas: persona.focusAreas,
        isSystemPersona: persona.isSystemPersona,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/personas/:id
 * Get a specific persona by ID
 */
router.get('/personas/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const persona = await personaRepository.findById(id);

    if (!persona) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Persona '${id}' not found`,
      });
    }

    res.json({
      id: persona.id,
      name: persona.name,
      archetype: persona.archetype,
      description: persona.description,
      avatarEmoji: persona.avatarEmoji,
      colorPrimary: persona.colorPrimary,
      colorSecondary: persona.colorSecondary,
      argumentationStyle: persona.argumentationStyle,
      vocabularyHints: persona.vocabularyHints,
      focusAreas: persona.focusAreas,
      rhetoricalPreferences: persona.rhetoricalPreferences,
      isSystemPersona: persona.isSystemPersona,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/personas/archetype/:archetype
 * Get personas by archetype
 */
router.get('/personas/archetype/:archetype', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { archetype } = req.params;

    // Validate archetype
    const validArchetypes = ['academic', 'pragmatic', 'empirical', 'legal', 'economic', 'moral'];
    if (!validArchetypes.includes(archetype)) {
      return res.status(400).json({
        error: 'Invalid Archetype',
        message: `Valid archetypes: ${validArchetypes.join(', ')}`,
      });
    }

    const personas = await personaRepository.findByArchetype(archetype as any);

    res.json({
      archetype,
      personas: personas.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        avatarEmoji: p.avatarEmoji,
      })),
    });
  } catch (error) {
    next(error);
  }
});
```

### Update POST /api/debates

```typescript
/**
 * Validate persona IDs
 */
async function validatePersonaIds(
  proPersonaId: string | null | undefined,
  conPersonaId: string | null | undefined
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (proPersonaId) {
    const exists = await personaRepository.exists(proPersonaId);
    if (!exists) {
      errors.push(`Pro persona '${proPersonaId}' not found`);
    }
  }

  if (conPersonaId) {
    const exists = await personaRepository.exists(conPersonaId);
    if (!exists) {
      errors.push(`Con persona '${conPersonaId}' not found`);
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

    // Validate persona IDs
    const personaValidation = await validatePersonaIds(
      req.body.proPersonaId,
      req.body.conPersonaId
    );
    if (!personaValidation.valid) {
      return res.status(400).json({
        error: 'Persona Validation Error',
        message: 'Invalid persona selection',
        details: personaValidation.errors,
      });
    }

    // Build create input
    const input: CreateDebateInput = {
      propositionText: propositionText.trim(),
      propositionContext,
      flowMode: flowMode ?? 'auto',
      // Configuration fields
      presetMode: req.body.presetMode ?? 'balanced',
      brevityLevel: req.body.brevityLevel,
      llmTemperature: req.body.llmTemperature !== undefined
        ? parseFloat(req.body.llmTemperature)
        : undefined,
      maxTokensPerResponse: req.body.maxTokensPerResponse !== undefined
        ? parseInt(req.body.maxTokensPerResponse, 10)
        : undefined,
      requireCitations: req.body.requireCitations,
      // Persona fields
      proPersonaId: req.body.proPersonaId || null,
      conPersonaId: req.body.conPersonaId || null,
    };

    logger.info('Creating debate with configuration and personas', {
      propositionLength: input.propositionText.length,
      flowMode: input.flowMode,
      presetMode: input.presetMode,
      proPersonaId: input.proPersonaId,
      conPersonaId: input.conPersonaId,
    });

    // Create the debate
    const debate = await debateRepository.create(input);

    // Get persona names for response
    let proPersonaName: string | null = null;
    let conPersonaName: string | null = null;

    if (debate.proPersonaId) {
      const proPersona = await personaRepository.findById(debate.proPersonaId);
      proPersonaName = proPersona?.name ?? null;
    }
    if (debate.conPersonaId) {
      const conPersona = await personaRepository.findById(debate.conPersonaId);
      conPersonaName = conPersona?.name ?? null;
    }

    // Start the orchestrator...
    // (existing orchestrator code)

    res.status(201).json({
      id: debate.id,
      status: debate.status,
      flowMode: debate.flowMode,
      presetMode: debate.presetMode,
      brevityLevel: debate.brevityLevel,
      requireCitations: debate.requireCitations,
      // Persona info
      proPersonaId: debate.proPersonaId,
      proPersonaName,
      conPersonaId: debate.conPersonaId,
      conPersonaName,
      createdAt: debate.createdAt,
    });
  } catch (error) {
    next(error);
  }
});
```

### API Documentation

```markdown
## Persona Endpoints

### GET /api/personas

Returns all available debate personas.

**Response:**
```json
{
  "personas": [
    {
      "id": "theorist",
      "name": "The Theorist",
      "archetype": "academic",
      "description": "Grounds arguments in theoretical frameworks...",
      "avatarEmoji": "🎓",
      "colorPrimary": "#6366f1",
      "colorSecondary": "#818cf8",
      "argumentationStyle": "Builds arguments from axioms...",
      "focusAreas": ["philosophy", "theory", "first principles"],
      "isSystemPersona": true
    },
    ...
  ]
}
```

### GET /api/personas/:id

Returns details for a specific persona.

**Response:**
```json
{
  "id": "scientist",
  "name": "The Scientist",
  "archetype": "empirical",
  "description": "Prioritizes empirical evidence...",
  "avatarEmoji": "🔬",
  "colorPrimary": "#059669",
  "argumentationStyle": "Demands empirical evidence...",
  "vocabularyHints": "data, empirical, study...",
  "focusAreas": ["research", "data", "evidence"],
  "rhetoricalPreferences": "Cites specific studies...",
  "isSystemPersona": true
}
```

### POST /api/debates (Updated)

Create a new debate with optional persona selection.

**Request Body:**
```json
{
  "propositionText": "Should AI be regulated?",
  "flowMode": "auto",
  "presetMode": "balanced",
  "proPersonaId": "theorist",
  "conPersonaId": "economist"
}
```

**Persona Fields (optional):**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| proPersonaId | string | null | Persona ID for Pro advocate |
| conPersonaId | string | null | Persona ID for Con advocate |

**Response includes:**
```json
{
  "id": "debate-123",
  "proPersonaId": "theorist",
  "proPersonaName": "The Theorist",
  "conPersonaId": "economist",
  "conPersonaName": "The Economist",
  ...
}
```
```

---

## Dependencies

**Task Dependencies:**
- PERSONA-002: Persona repository (to validate and fetch personas)
- CONFIG-006: Configuration API endpoints (same route file)

---

## Validation

### API Tests

```typescript
// backend/src/routes/__tests__/persona-routes.test.ts

describe('GET /api/personas', () => {
  it('returns all system personas', async () => {
    const response = await request(app).get('/api/personas');

    expect(response.status).toBe(200);
    expect(response.body.personas).toHaveLength(6);

    const theorist = response.body.personas.find((p: any) => p.id === 'theorist');
    expect(theorist).toBeDefined();
    expect(theorist.name).toBe('The Theorist');
    expect(theorist.avatarEmoji).toBe('🎓');
  });
});

describe('GET /api/personas/:id', () => {
  it('returns persona details', async () => {
    const response = await request(app).get('/api/personas/scientist');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe('scientist');
    expect(response.body.archetype).toBe('empirical');
    expect(response.body.focusAreas).toContain('research');
  });

  it('returns 404 for unknown persona', async () => {
    const response = await request(app).get('/api/personas/unknown');

    expect(response.status).toBe(404);
  });
});

describe('POST /api/debates with personas', () => {
  it('creates debate with valid personas', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({
        propositionText: 'Test proposition',
        proPersonaId: 'theorist',
        conPersonaId: 'economist',
      });

    expect(response.status).toBe(201);
    expect(response.body.proPersonaId).toBe('theorist');
    expect(response.body.proPersonaName).toBe('The Theorist');
    expect(response.body.conPersonaId).toBe('economist');
    expect(response.body.conPersonaName).toBe('The Economist');
  });

  it('creates debate with one persona', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({
        propositionText: 'Test proposition',
        proPersonaId: 'lawyer',
      });

    expect(response.status).toBe(201);
    expect(response.body.proPersonaId).toBe('lawyer');
    expect(response.body.conPersonaId).toBeNull();
  });

  it('creates debate with no personas (default)', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({ propositionText: 'Test proposition' });

    expect(response.status).toBe(201);
    expect(response.body.proPersonaId).toBeNull();
    expect(response.body.conPersonaId).toBeNull();
  });

  it('returns 400 for invalid persona ID', async () => {
    const response = await request(app)
      .post('/api/debates')
      .send({
        propositionText: 'Test proposition',
        proPersonaId: 'nonexistent',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Persona Validation Error');
  });
});
```

### Definition of Done

- [ ] GET /api/personas endpoint returns all personas
- [ ] GET /api/personas/:id returns single persona
- [ ] POST /api/debates accepts persona IDs
- [ ] Invalid persona IDs return 400 error
- [ ] Debate response includes persona names
- [ ] API tests written and passing
- [ ] API documentation updated

---

## Notes

### Persona Validation

Personas are validated before debate creation to:
1. Provide clear error messages
2. Prevent invalid foreign key references
3. Allow null (both personas optional)

### Response Enrichment

The debate creation response includes `proPersonaName` and `conPersonaName` so the frontend doesn't need an extra API call to display persona info.

---

**Estimated Time:** 2 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
