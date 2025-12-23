# INFRA-004: Set Up JSON Schema Validation

**Priority:** P0
**Estimate:** M
**Labels:** `infrastructure`, `backend`, `validation`
**Status:** 🟢 TO DO

---

## Context

ClearSide requires robust JSON Schema validation to ensure all agent outputs conform to the v2.0.0 schema specification. This validation layer is critical for maintaining data integrity, preventing malformed outputs, and enabling reliable UI rendering.

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Section "JSON Schema"
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - SCH-301 to SCH-305
- [Live Debate Protocol](../../../docs/08_live-debate-protocol.md) - Quality Guardrails

---

## Requirements

### Acceptance Criteria

- [ ] Create JSON Schema definition file (v2.0.0)
- [ ] Implement validation library (Ajv or Zod)
- [ ] Validate all agent outputs against schema
- [ ] Validate transcript structure before persistence
- [ ] Reject invalid outputs with clear error messages
- [ ] Log schema violations for debugging
- [ ] Create helper functions for common validation tasks
- [ ] Write unit tests for validation logic
- [ ] Document schema with examples
- [ ] Support schema versioning

### Functional Requirements

From [REQUIREMENTS.MD](../../../docs/REQUIREMENTS.md):
- **SCH-301**: System SHALL validate JSON output against schema
- **SCH-302**: System SHALL reject outputs with missing keys
- **SCH-303**: System SHALL reject outputs with extra fields
- **SCH-304**: System SHALL reject non-JSON text
- **SCH-305**: System SHALL log schema violations
- **FR-351**: System SHALL generate structured JSON transcript (schema v2.0.0)

---

## Implementation Guide

### JSON Schema Definition

```typescript
// src/schemas/debate-transcript-v2.schema.ts
export const DebateTranscriptSchemaV2 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://clearside.com/schemas/debate-transcript/v2.0.0",
  title: "ClearSide Debate Transcript v2.0.0",
  type: "object",
  required: ["meta", "proposition", "transcript"],
  properties: {
    meta: {
      type: "object",
      required: [
        "schema_version",
        "debate_id",
        "generated_at",
        "debate_format",
        "total_duration_seconds",
        "status"
      ],
      properties: {
        schema_version: { type: "string", const: "2.0.0" },
        debate_id: { type: "string", format: "uuid" },
        generated_at: { type: "string", format: "date-time" },
        debate_format: { type: "string", const: "live_theater" },
        total_duration_seconds: { type: "number", minimum: 0 },
        status: {
          type: "string",
          enum: ["live", "paused", "completed", "error"]
        },
        model_info: {
          type: "object",
          properties: {
            orchestrator_model: { type: "string" },
            pro_model: { type: "string" },
            con_model: { type: "string" },
            moderator_model: { type: "string" }
          }
        }
      }
    },
    proposition: {
      type: "object",
      required: ["raw_input", "normalized_question"],
      properties: {
        raw_input: { type: "string", minLength: 1, maxLength: 500 },
        normalized_question: { type: "string", minLength: 1 },
        context: {
          type: "object",
          properties: {
            geography: { type: "string" },
            timeframe: { type: "string" },
            domain: { type: "string" }
          }
        }
      }
    },
    transcript: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "timestamp_ms", "phase", "speaker", "content"],
        properties: {
          id: { type: "string", format: "uuid" },
          timestamp_ms: { type: "number", minimum: 0 },
          phase: {
            type: "string",
            enum: [
              "phase_1_opening",
              "phase_2_constructive",
              "phase_3_crossexam",
              "phase_4_rebuttal",
              "phase_5_closing",
              "phase_6_synthesis"
            ]
          },
          speaker: {
            type: "string",
            enum: ["pro", "con", "moderator", "system"]
          },
          content: { type: "string", minLength: 1 },
          metadata: {
            type: "object",
            properties: {
              argument_category: {
                type: "string",
                enum: ["economic", "ethical", "technical", "social", "political", "environmental"]
              },
              confidence_level: {
                type: "string",
                enum: ["low", "medium", "high"]
              },
              evidence_type: {
                type: "string",
                enum: ["fact", "projection", "analogy", "value_judgment"]
              }
            }
          }
        }
      }
    },
    structured_analysis: {
      type: "object",
      properties: {
        pro: {
          type: "object",
          required: ["executive_summary", "arguments", "assumptions", "uncertainties"],
          properties: {
            executive_summary: { type: "string" },
            arguments: { type: "array", items: { type: "object" } },
            assumptions: { type: "array", items: { type: "string" } },
            uncertainties: { type: "array", items: { type: "string" } }
          }
        },
        con: {
          type: "object",
          required: ["executive_summary", "arguments", "assumptions", "uncertainties"],
          properties: {
            executive_summary: { type: "string" },
            arguments: { type: "array", items: { type: "object" } },
            assumptions: { type: "array", items: { type: "string" } },
            uncertainties: { type: "array", items: { type: "string" } }
          }
        },
        moderator: {
          type: "object",
          required: [
            "areas_of_agreement",
            "core_disagreements",
            "assumption_conflicts",
            "evidence_gaps",
            "decision_hinges"
          ],
          properties: {
            areas_of_agreement: { type: "array", items: { type: "string" } },
            core_disagreements: { type: "array", items: { type: "object" } },
            assumption_conflicts: { type: "array", items: { type: "object" } },
            evidence_gaps: { type: "array", items: { type: "string" } },
            decision_hinges: { type: "array", items: { type: "string" } }
          }
        }
      }
    },
    user_interventions: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "timestamp_ms", "type", "content"],
        properties: {
          id: { type: "string", format: "uuid" },
          timestamp_ms: { type: "number", minimum: 0 },
          type: {
            type: "string",
            enum: ["pause_question", "evidence_injection", "clarification_request"]
          },
          content: { type: "string", minLength: 1 },
          directed_to: {
            type: "string",
            enum: ["pro", "con", "moderator"]
          },
          response: { type: "string" },
          response_timestamp_ms: { type: "number" }
        }
      }
    }
  }
};
```

### Validation Service (Ajv)

```typescript
// src/services/validation/schema-validator.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { DebateTranscriptSchemaV2 } from "../../schemas/debate-transcript-v2.schema";

export class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<string, any> = new Map();

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    });
    addFormats(this.ajv);

    // Register schemas
    this.validators.set("v2.0.0", this.ajv.compile(DebateTranscriptSchemaV2));
  }

  validateTranscript(data: any, version = "2.0.0"): ValidationResult {
    const validator = this.validators.get(`v${version}`);

    if (!validator) {
      return {
        valid: false,
        errors: [`Unknown schema version: ${version}`]
      };
    }

    const valid = validator(data);

    if (!valid) {
      const errors = validator.errors?.map(err => ({
        path: err.instancePath,
        message: err.message || "Unknown error",
        params: err.params
      })) || [];

      // Log schema violations
      console.error("[SchemaValidator] Validation failed:", {
        version,
        errors,
        data: JSON.stringify(data, null, 2)
      });

      return {
        valid: false,
        errors: errors.map(e => `${e.path}: ${e.message}`)
      };
    }

    return { valid: true, errors: [] };
  }

  validateUtterance(utterance: any): ValidationResult {
    const utteranceSchema = {
      type: "object",
      required: ["timestamp_ms", "phase", "speaker", "content"],
      properties: {
        timestamp_ms: { type: "number", minimum: 0 },
        phase: {
          type: "string",
          enum: [
            "phase_1_opening",
            "phase_2_constructive",
            "phase_3_crossexam",
            "phase_4_rebuttal",
            "phase_5_closing",
            "phase_6_synthesis"
          ]
        },
        speaker: {
          type: "string",
          enum: ["pro", "con", "moderator", "system"]
        },
        content: { type: "string", minLength: 1 }
      }
    };

    const validate = this.ajv.compile(utteranceSchema);
    const valid = validate(utterance);

    if (!valid) {
      return {
        valid: false,
        errors: validate.errors?.map(e => `${e.instancePath}: ${e.message}`) || []
      };
    }

    return { valid: true, errors: [] };
  }

  validateIntervention(intervention: any): ValidationResult {
    const interventionSchema = {
      type: "object",
      required: ["timestamp_ms", "type", "content"],
      properties: {
        timestamp_ms: { type: "number", minimum: 0 },
        type: {
          type: "string",
          enum: ["pause_question", "evidence_injection", "clarification_request"]
        },
        content: { type: "string", minLength: 1 },
        directed_to: {
          type: "string",
          enum: ["pro", "con", "moderator"]
        }
      }
    };

    const validate = this.ajv.compile(interventionSchema);
    const valid = validate(intervention);

    if (!valid) {
      return {
        valid: false,
        errors: validate.errors?.map(e => `${e.instancePath}: ${e.message}`) || []
      };
    }

    return { valid: true, errors: [] };
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Singleton instance
export const schemaValidator = new SchemaValidator();
```

### Helper Functions

```typescript
// src/services/validation/validators.ts
import { schemaValidator } from './schema-validator';

export function assertValidTranscript(data: any, version = "2.0.0"): void {
  const result = schemaValidator.validateTranscript(data, version);

  if (!result.valid) {
    throw new SchemaValidationError(
      `Invalid transcript schema: ${result.errors.join(", ")}`,
      result.errors
    );
  }
}

export function assertValidUtterance(utterance: any): void {
  const result = schemaValidator.validateUtterance(utterance);

  if (!result.valid) {
    throw new SchemaValidationError(
      `Invalid utterance: ${result.errors.join(", ")}`,
      result.errors
    );
  }
}

export class SchemaValidationError extends Error {
  constructor(message: string, public errors: string[]) {
    super(message);
    this.name = "SchemaValidationError";
  }
}
```

### Usage Example

```typescript
// In debate orchestrator
import { assertValidUtterance, assertValidTranscript } from './validation/validators';

async function recordUtterance(utterance: any): Promise<void> {
  // Validate before persistence
  assertValidUtterance(utterance);

  await utteranceRepo.create(utterance);
  await sseManager.broadcast(debateId, 'utterance', utterance);
}

async function finalizeDebate(debateId: string): Promise<void> {
  const transcript = await buildTranscript(debateId);

  // Validate complete transcript
  assertValidTranscript(transcript);

  await debateRepo.saveTranscript(debateId, transcript);
}
```

---

## Dependencies

**None** - This is a foundational task

---

## Validation

### Unit Tests

```typescript
// tests/schema-validator.test.ts
import { schemaValidator } from '../src/services/validation/schema-validator';
import { DebateTranscriptSchemaV2 } from '../src/schemas/debate-transcript-v2.schema';

describe('SchemaValidator', () => {
  describe('validateTranscript', () => {
    it('should accept valid transcript', () => {
      const validTranscript = {
        meta: {
          schema_version: "2.0.0",
          debate_id: "550e8400-e29b-41d4-a716-446655440000",
          generated_at: "2025-12-23T10:00:00Z",
          debate_format: "live_theater",
          total_duration_seconds: 1620,
          status: "completed"
        },
        proposition: {
          raw_input: "Should AI data centers have a moratorium?",
          normalized_question: "Should the US impose a moratorium on AI data centers?"
        },
        transcript: []
      };

      const result = schemaValidator.validateTranscript(validTranscript);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject transcript with missing required fields', () => {
      const invalidTranscript = {
        meta: {
          schema_version: "2.0.0"
          // Missing other required fields
        }
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject transcript with invalid status', () => {
      const invalidTranscript = {
        meta: {
          schema_version: "2.0.0",
          debate_id: "550e8400-e29b-41d4-a716-446655440000",
          generated_at: "2025-12-23T10:00:00Z",
          debate_format: "live_theater",
          total_duration_seconds: 1620,
          status: "invalid_status" // Invalid enum value
        },
        proposition: {
          raw_input: "Test",
          normalized_question: "Test?"
        },
        transcript: []
      };

      const result = schemaValidator.validateTranscript(invalidTranscript);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateUtterance', () => {
    it('should accept valid utterance', () => {
      const validUtterance = {
        timestamp_ms: 1000,
        phase: "phase_1_opening",
        speaker: "pro",
        content: "I argue FOR the proposition..."
      };

      const result = schemaValidator.validateUtterance(validUtterance);
      expect(result.valid).toBe(true);
    });

    it('should reject utterance with invalid speaker', () => {
      const invalidUtterance = {
        timestamp_ms: 1000,
        phase: "phase_1_opening",
        speaker: "invalid_speaker",
        content: "Test"
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
    });

    it('should reject utterance with empty content', () => {
      const invalidUtterance = {
        timestamp_ms: 1000,
        phase: "phase_1_opening",
        speaker: "pro",
        content: ""
      };

      const result = schemaValidator.validateUtterance(invalidUtterance);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateIntervention', () => {
    it('should accept valid intervention', () => {
      const validIntervention = {
        timestamp_ms: 5000,
        type: "pause_question",
        content: "Can you clarify?",
        directed_to: "pro"
      };

      const result = schemaValidator.validateIntervention(validIntervention);
      expect(result.valid).toBe(true);
    });

    it('should reject intervention with invalid type', () => {
      const invalidIntervention = {
        timestamp_ms: 5000,
        type: "invalid_type",
        content: "Test"
      };

      const result = schemaValidator.validateIntervention(invalidIntervention);
      expect(result.valid).toBe(false);
    });
  });
});
```

### Definition of Done

- [ ] JSON Schema v2.0.0 defined and documented
- [ ] Ajv validation library integrated
- [ ] SchemaValidator class implemented
- [ ] Helper functions for common validations created
- [ ] Transcript validation works correctly
- [ ] Utterance validation works correctly
- [ ] Intervention validation works correctly
- [ ] Schema violations logged with full context
- [ ] Unit tests achieve >95% coverage
- [ ] Documentation includes schema examples

---

## Notes

- Use Ajv for performance; it's one of the fastest validators
- Enable `allErrors: true` to get complete validation feedback
- Log full data on validation failure for debugging
- Consider adding custom error messages for better UX
- Schema versioning allows future evolution without breaking changes
- Validation should happen at system boundaries (API input, DB persistence, agent output)
- Consider adding schema documentation generation (e.g., JSON Schema to markdown)

---

**Estimated Time:** 6-8 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
