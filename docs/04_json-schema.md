# ClearSide JSON Schema Specification

> Version: 1.0.0

---

## Overview

The ClearSide JSON schema is the contract between AI agents, the UI, and any future API. It:
- Preserves assumptions and uncertainties
- Separates facts from inference
- Maintains explicit uncertainty
- Is versioned for backward-compatible evolution

---

## Schema Version

```json
"schema_version": "1.0.0"
```

---

## Complete Schema Structure

```json
{
  "meta": {
    "schema_version": "1.0.0",
    "generated_at": "2025-01-20T18:42:00Z",
    "model_info": {
      "provider": "string",
      "model": "string"
    },
    "confidence_level": "low | medium | high",
    "notes": "string"
  },
  "proposition": {
    "raw_input": "string",
    "normalized_question": "string",
    "context": {
      "geography": "string",
      "timeframe": "string",
      "domain": "string"
    }
  },
  "pro": {
    "executive_summary": ["string"],
    "arguments": [
      {
        "category": "economic | ethical | technical | social | political | environmental",
        "claim": "string",
        "explanation": "string",
        "evidence_type": "fact | projection | analogy | value_judgment",
        "confidence": "low | medium | high"
      }
    ],
    "assumptions": ["string"],
    "uncertainties": ["string"]
  },
  "con": {
    "executive_summary": ["string"],
    "arguments": [
      {
        "category": "economic | ethical | technical | social | political | environmental",
        "claim": "string",
        "explanation": "string",
        "evidence_type": "fact | projection | analogy | value_judgment",
        "confidence": "low | medium | high"
      }
    ],
    "assumptions": ["string"],
    "uncertainties": ["string"]
  },
  "moderator": {
    "areas_of_agreement": ["string"],
    "core_disagreements": [
      {
        "topic": "string",
        "description": "string",
        "root_cause": "string"
      }
    ],
    "assumption_conflicts": [
      {
        "pro_assumption": "string",
        "con_assumption": "string",
        "conflict_description": "string"
      }
    ],
    "evidence_gaps": ["string"],
    "decision_hinges": ["string"]
  },
  "challenges": {
    "available_actions": [
      "question_assumption",
      "stronger_counterargument",
      "evidence_that_changes_outcome"
    ],
    "responses": [
      {
        "action": "string",
        "target": "string",
        "response": {
          "analysis": ["string"],
          "historical_context": ["string"],
          "classification": "factual | uncertain | values_dependent"
        }
      }
    ]
  }
}
```

---

## Section Details

### Meta Section

The `meta` section contains metadata about the generated output.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_version` | string | Yes | Version of the schema (e.g., "1.0.0") |
| `generated_at` | ISO 8601 datetime | Yes | Timestamp of generation |
| `model_info` | object | Yes | Information about the model used |
| `model_info.provider` | string | Yes | Provider name (e.g., "openai", "anthropic") |
| `model_info.model` | string | Yes | Model identifier |
| `confidence_level` | enum | Yes | Overall confidence: "low", "medium", "high" |
| `notes` | string | No | Additional notes (e.g., "No citations requested") |

### Proposition Section

The `proposition` section contains the normalized question and context.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `raw_input` | string | Yes | Original user input |
| `normalized_question` | string | Yes | Normalized neutral proposition |
| `context` | object | No | Extracted context |
| `context.geography` | string | No | Geographic scope |
| `context.timeframe` | string | No | Time scope |
| `context.domain` | string | No | Domain/field |

### Pro Section

The `pro` section contains arguments FOR the proposition.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `executive_summary` | string[] | Yes | 3-5 key points |
| `arguments` | Argument[] | Yes | Array of structured arguments |
| `assumptions` | string[] | Yes | Explicit assumptions |
| `uncertainties` | string[] | Yes | Known uncertainties |

### Con Section

The `con` section contains arguments AGAINST the proposition.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `executive_summary` | string[] | Yes | 3-5 key points |
| `arguments` | Argument[] | Yes | Array of structured arguments |
| `assumptions` | string[] | Yes | Explicit assumptions |
| `uncertainties` | string[] | Yes | Known uncertainties |

### Argument Object

Each argument in the `pro.arguments` or `con.arguments` array:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | enum | Yes | Argument category |
| `claim` | string | Yes | The core claim |
| `explanation` | string | Yes | Supporting explanation |
| `evidence_type` | enum | Yes | Type of evidence |
| `confidence` | enum | Yes | Confidence level |

#### Category Values
- `economic` - Economic impacts and considerations
- `ethical` - Moral and ethical considerations
- `technical` - Technical feasibility and implications
- `social` - Social impacts and considerations
- `political` - Political implications
- `environmental` - Environmental impacts

#### Evidence Type Values
- `fact` - Established, verifiable fact
- `projection` - Forecast or prediction
- `analogy` - Historical or comparative analogy
- `value_judgment` - Value-based assessment

#### Confidence Values
- `low` - Significant uncertainty
- `medium` - Moderate certainty
- `high` - High degree of certainty

### Moderator Section

The `moderator` section contains the neutral synthesis.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `areas_of_agreement` | string[] | Yes | Points both sides agree on |
| `core_disagreements` | Disagreement[] | Yes | Key points of contention |
| `assumption_conflicts` | Conflict[] | Yes | Conflicting assumptions |
| `evidence_gaps` | string[] | Yes | Missing evidence |
| `decision_hinges` | string[] | Yes | Factors that would change outcome |

### Disagreement Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | Yes | Disagreement topic |
| `description` | string | Yes | Description of disagreement |
| `root_cause` | string | No | Underlying cause |

### Assumption Conflict Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pro_assumption` | string | Yes | Pro side's assumption |
| `con_assumption` | string | Yes | Con side's assumption |
| `conflict_description` | string | No | Description of conflict |

### Challenges Section

The `challenges` section handles user interactions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `available_actions` | string[] | Yes | List of available challenge types |
| `responses` | Response[] | No | Array of challenge responses |

### Challenge Response Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | Type of challenge |
| `target` | string | Yes | Targeted element |
| `response.analysis` | string[] | Yes | Analysis points |
| `response.historical_context` | string[] | No | Historical context |
| `response.classification` | enum | Yes | Classification type |

#### Classification Values
- `factual` - Can be verified with evidence
- `uncertain` - Cannot be determined with current evidence
- `values_dependent` - Depends on value judgments

---

## Schema Guarantees

1. **Explicit assumptions and uncertainties remain visible** - The system never collapses them
2. **Evidence type and confidence fields classify claims** - As facts, inference, historical analogy, or projection
3. **UI-safe and diff-friendly** - Keys and structure remain stable across versions
4. **Version controlled** - Breaking changes require version increment

---

## Validation Rules

### Required Fields
All required fields must be present. Missing required fields cause validation failure.

### Type Validation
- All string arrays must contain at least one element (except `challenges.responses` which can be empty)
- Enum fields must use defined values only
- Datetime fields must be ISO 8601 format

### Agent Output Rules

| Agent | Can Output | Cannot Output |
|-------|------------|---------------|
| Orchestrator | `proposition` only | `pro`, `con`, `moderator`, `challenges` |
| Pro Advocate | `pro` only | `proposition`, `con`, `moderator`, `challenges` |
| Con Advocate | `con` only | `proposition`, `pro`, `moderator`, `challenges` |
| Moderator | `moderator` only | `proposition`, `pro`, `con`, `challenges` |
| Challenge Agent | `challenges.responses` only | Everything else |

---

## Enforcement Strategy

1. Use `response_format: json_schema` or equivalent to ensure valid JSON
2. Reject outputs with missing keys
3. Reject outputs with extra fields
4. Reject non-JSON text
5. Log schema violations for debugging
6. Version and test prompts to prevent drift

---

## Migration Strategy

### Version Incrementing Rules

| Change Type | Version Change | Example |
|-------------|----------------|---------|
| Bug fix / clarification | Patch (1.0.x) | Typo in description |
| New optional field | Minor (1.x.0) | Add `context.stakeholders` |
| New required field | Major (x.0.0) | Add required `pro.citations` |
| Remove field | Major (x.0.0) | Remove `meta.notes` |
| Change field type | Major (x.0.0) | String to array |

### Backward Compatibility

- Minor versions are backward compatible
- Major versions may require migration
- Clients should check `schema_version` before parsing

---

## Example Output

```json
{
  "meta": {
    "schema_version": "1.0.0",
    "generated_at": "2025-01-20T18:42:00Z",
    "model_info": {
      "provider": "openai",
      "model": "gpt-4"
    },
    "confidence_level": "medium",
    "notes": "No citations requested"
  },
  "proposition": {
    "raw_input": "Should we adopt microservices architecture?",
    "normalized_question": "Should the organization adopt a microservices architecture for its software systems?",
    "context": {
      "geography": "Global",
      "timeframe": "2025-2027",
      "domain": "Software Architecture"
    }
  },
  "pro": {
    "executive_summary": [
      "Microservices enable independent scaling of components",
      "Teams can deploy and iterate faster",
      "Technology diversity allows best-tool-for-job selection"
    ],
    "arguments": [
      {
        "category": "technical",
        "claim": "Independent scalability improves resource efficiency",
        "explanation": "Each service can be scaled based on its specific load requirements, rather than scaling the entire application.",
        "evidence_type": "fact",
        "confidence": "high"
      }
    ],
    "assumptions": [
      "The organization has sufficient DevOps maturity",
      "Teams can handle distributed system complexity"
    ],
    "uncertainties": [
      "Actual cost savings depend on usage patterns",
      "Team adaptation time is variable"
    ]
  },
  "con": {
    "executive_summary": [
      "Distributed systems introduce operational complexity",
      "Network latency affects performance",
      "Debugging across services is challenging"
    ],
    "arguments": [
      {
        "category": "technical",
        "claim": "Distributed system complexity increases operational burden",
        "explanation": "Managing multiple services requires sophisticated monitoring, logging, and orchestration infrastructure.",
        "evidence_type": "fact",
        "confidence": "high"
      }
    ],
    "assumptions": [
      "Current monolith is maintainable",
      "Team has limited distributed systems experience"
    ],
    "uncertainties": [
      "True complexity cost emerges over time",
      "Tool ecosystem continues evolving"
    ]
  },
  "moderator": {
    "areas_of_agreement": [
      "Both sides acknowledge significant organizational change is required",
      "Both recognize trade-offs between flexibility and complexity"
    ],
    "core_disagreements": [
      {
        "topic": "Complexity management",
        "description": "Pro sees complexity as manageable with modern tools; Con sees it as inherently problematic",
        "root_cause": "Different assessments of team capability and tool maturity"
      }
    ],
    "assumption_conflicts": [
      {
        "pro_assumption": "Organization has sufficient DevOps maturity",
        "con_assumption": "Team has limited distributed systems experience",
        "conflict_description": "Directly contradictory assessments of team readiness"
      }
    ],
    "evidence_gaps": [
      "Current system performance benchmarks",
      "Team distributed systems experience assessment",
      "Projected growth requirements"
    ],
    "decision_hinges": [
      "Does the team have proven distributed systems experience?",
      "What are the actual scaling requirements for the next 2 years?",
      "Is the current monolith actually impeding development velocity?"
    ]
  },
  "challenges": {
    "available_actions": [
      "question_assumption",
      "stronger_counterargument",
      "evidence_that_changes_outcome"
    ],
    "responses": []
  }
}
```

---

*Schema Version: 1.0.0*
*Document Updated: 2025-12-22*
