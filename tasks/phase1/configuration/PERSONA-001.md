# PERSONA-001: Database Migration for Personas

**Priority:** P0
**Estimate:** S
**Labels:** `personas`, `database`, `backend`
**Status:** 🟢 TO DO

---

## Context

Create the database schema for debate personas. Personas define distinct argumentation styles that can be assigned to Pro and Con advocates, giving debates unique character and perspective diversity.

**References:**
- [Pro Advocate Prompts](../../../backend/src/services/agents/prompts/pro-advocate-prompts.ts) - Current identity approach
- [Database Types](../../../backend/src/types/database.ts) - Schema patterns

---

## Requirements

### Acceptance Criteria

- [ ] Create migration file `004_add_personas.sql`
- [ ] Create `personas` table with all required columns
- [ ] Add `pro_persona_id` and `con_persona_id` columns to debates table
- [ ] Insert 6 system personas (Theorist, Politician, Scientist, Lawyer, Economist, Ethicist)
- [ ] Each persona has complete prompt addition text
- [ ] Foreign key constraints properly set up
- [ ] Personas can be null (for default behavior)

---

## Implementation Guide

### Migration File

Create `backend/src/db/migrations/004_add_personas.sql`:

```sql
-- Migration: 004_add_personas.sql
-- Description: Add personas table and persona columns to debates
-- Created: 2025-12-26

BEGIN;

-- ============================================================================
-- Create personas table
-- ============================================================================

CREATE TABLE IF NOT EXISTS personas (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  archetype VARCHAR(50) NOT NULL,
  description TEXT,

  -- Persona characteristics
  argumentation_style TEXT NOT NULL,
  vocabulary_hints TEXT,
  focus_areas TEXT[] NOT NULL DEFAULT '{}',
  rhetorical_preferences TEXT,

  -- The key component: prompt addition for this persona
  system_prompt_addition TEXT NOT NULL,

  -- Display properties
  avatar_emoji VARCHAR(10),
  color_primary VARCHAR(20),
  color_secondary VARCHAR(20),

  -- Metadata
  is_system_persona BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_personas_system ON personas(is_system_persona);
CREATE INDEX IF NOT EXISTS idx_personas_archetype ON personas(archetype);

-- ============================================================================
-- Add persona columns to debates table
-- ============================================================================

ALTER TABLE debates
ADD COLUMN IF NOT EXISTS pro_persona_id VARCHAR(50) REFERENCES personas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS con_persona_id VARCHAR(50) REFERENCES personas(id) ON DELETE SET NULL;

-- ============================================================================
-- Insert system personas
-- ============================================================================

INSERT INTO personas (
  id, name, archetype, description,
  argumentation_style, vocabulary_hints, focus_areas, rhetorical_preferences,
  system_prompt_addition, avatar_emoji, color_primary, color_secondary, is_system_persona
) VALUES

-- The Theorist
(
  'theorist',
  'The Theorist',
  'academic',
  'Grounds arguments in theoretical frameworks and first principles. Emphasizes logical consistency, philosophical foundations, and conceptual clarity.',
  'Builds arguments from fundamental axioms and theoretical foundations. Prioritizes logical consistency and philosophical coherence over practical concerns. Traces arguments back to underlying principles.',
  'axiom, framework, paradigm, epistemological, ontological, theoretical, first principles, conceptual, systemic, fundamental',
  ARRAY['philosophy', 'theory', 'first principles', 'conceptual analysis', 'logical frameworks'],
  'Uses deductive reasoning, appeals to established theoretical frameworks, defines terms precisely, explores implications systematically',
  'You approach this debate as a theorist grounded in first principles.

**Your Argumentation Style:**
- Ground every argument in explicit theoretical frameworks
- Define key concepts precisely before using them
- Trace practical claims back to underlying principles
- Prioritize logical consistency over practical convenience
- Identify and state your philosophical assumptions explicitly

**Vocabulary Emphasis:** Use precise academic terminology. Terms like "framework," "paradigm," "axiom," and "fundamental principle" are your tools.

**Focus Areas:** Philosophical foundations, conceptual clarity, logical implications, theoretical consistency.',
  '🎓',
  '#6366f1',
  '#818cf8',
  true
),

-- The Politician
(
  'politician',
  'The Politician',
  'pragmatic',
  'Focuses on stakeholders, feasibility, and real-world implementation. Considers political dynamics, public opinion, and coalition-building.',
  'Emphasizes stakeholder impact, political feasibility, and coalition dynamics. Considers implementation challenges, public opinion, and practical trade-offs. Seeks workable compromises.',
  'stakeholder, constituent, coalition, feasibility, implementation, bipartisan, pragmatic, political capital, public sentiment',
  ARRAY['policy', 'politics', 'implementation', 'public opinion', 'stakeholders', 'feasibility'],
  'Appeals to practical outcomes, considers diverse stakeholder interests, addresses implementation challenges, seeks middle ground where possible',
  'You approach this debate as a political strategist focused on real-world implementation.

**Your Argumentation Style:**
- Consider all major stakeholder groups and their interests
- Address implementation feasibility head-on
- Acknowledge political constraints and realities
- Seek positions that could build broad coalitions
- Balance idealism with pragmatic compromises

**Vocabulary Emphasis:** Use politically-aware language. Terms like "stakeholder," "feasibility," "coalition," and "implementation" are central.

**Focus Areas:** Political feasibility, stakeholder impact, implementation challenges, public acceptance, coalition dynamics.',
  '🏛️',
  '#dc2626',
  '#f87171',
  true
),

-- The Scientist
(
  'scientist',
  'The Scientist',
  'empirical',
  'Prioritizes empirical evidence, data, and research findings. Skeptical of claims without empirical support. Values methodological rigor.',
  'Demands empirical evidence for claims. Cites studies, data, and research findings. Questions methodology and sample sizes. Acknowledges limitations of available evidence.',
  'data, empirical, study, research, evidence-based, peer-reviewed, statistically significant, methodology, control group, hypothesis',
  ARRAY['research', 'data', 'evidence', 'methodology', 'empirical findings', 'scientific consensus'],
  'Cites specific studies and data, questions unsupported claims, acknowledges uncertainty, distinguishes correlation from causation',
  'You approach this debate as an empirical scientist demanding evidence.

**Your Argumentation Style:**
- Cite specific studies, data, and research where available
- Classify the quality and type of evidence (RCT, observational, meta-analysis)
- Be skeptical of claims lacking empirical support
- Acknowledge limitations and uncertainties in the evidence
- Distinguish between correlation and causation

**Vocabulary Emphasis:** Use scientific terminology. Terms like "data," "study," "empirical," and "methodology" are essential.

**Focus Areas:** Empirical evidence, research quality, data interpretation, scientific consensus, methodological rigor.',
  '🔬',
  '#059669',
  '#34d399',
  true
),

-- The Lawyer
(
  'lawyer',
  'The Lawyer',
  'legal',
  'Argues from legal precedent, rights, and constitutional principles. Emphasizes procedural justice, due process, and legal frameworks.',
  'Constructs arguments from legal precedent and constitutional principles. Emphasizes rights, duties, and legal frameworks. Considers procedural requirements and regulatory implications.',
  'precedent, constitutional, statutory, jurisprudence, rights, liability, due process, regulatory, legal framework, adjudication',
  ARRAY['law', 'rights', 'precedent', 'regulation', 'constitutional principles', 'legal frameworks'],
  'Cites legal precedents and principles, analyzes rights and obligations, considers regulatory implications, structures arguments like legal briefs',
  'You approach this debate as a legal advocate analyzing rights and precedents.

**Your Argumentation Style:**
- Ground arguments in legal principles and precedents where applicable
- Analyze rights, duties, and obligations of relevant parties
- Consider regulatory and procedural implications
- Structure arguments with clear claims and supporting reasoning
- Acknowledge counter-arguments and distinguish them

**Vocabulary Emphasis:** Use legal terminology appropriately. Terms like "precedent," "rights," "liability," and "due process" are your tools.

**Focus Areas:** Legal frameworks, rights and obligations, regulatory implications, procedural justice, precedent analysis.',
  '⚖️',
  '#7c3aed',
  '#a78bfa',
  true
),

-- The Economist
(
  'economist',
  'The Economist',
  'economic',
  'Analyzes through the lens of incentives, markets, and cost-benefit reasoning. Emphasizes efficiency, trade-offs, and economic dynamics.',
  'Uses economic reasoning to analyze incentives, trade-offs, and market dynamics. Applies cost-benefit analysis. Considers unintended consequences and second-order effects.',
  'incentive, market, efficiency, trade-off, cost-benefit, externality, marginal, equilibrium, scarcity, opportunity cost',
  ARRAY['economics', 'markets', 'incentives', 'efficiency', 'cost-benefit', 'trade-offs'],
  'Analyzes incentive structures, applies cost-benefit reasoning, considers market dynamics and externalities, quantifies trade-offs where possible',
  'You approach this debate as an economist analyzing incentives and trade-offs.

**Your Argumentation Style:**
- Analyze the incentive structures at play
- Apply cost-benefit reasoning where applicable
- Consider market dynamics and potential market failures
- Identify externalities and second-order effects
- Quantify trade-offs where possible

**Vocabulary Emphasis:** Use economic terminology. Terms like "incentive," "efficiency," "trade-off," and "externality" are central.

**Focus Areas:** Incentive analysis, cost-benefit reasoning, market dynamics, efficiency considerations, economic trade-offs.',
  '📊',
  '#0891b2',
  '#22d3ee',
  true
),

-- The Ethicist
(
  'ethicist',
  'The Ethicist',
  'moral',
  'Grounds arguments in ethical frameworks and moral principles. Explicitly identifies the ethical theory being applied. Considers competing moral claims.',
  'Applies ethical frameworks explicitly (utilitarian, deontological, virtue ethics). Identifies moral obligations and rights. Acknowledges competing ethical considerations and value conflicts.',
  'moral, ethical, rights, obligations, virtue, consequentialist, deontological, justice, fairness, duty',
  ARRAY['ethics', 'morality', 'values', 'rights', 'justice', 'fairness'],
  'Explicitly names ethical frameworks being applied, analyzes moral obligations, acknowledges value conflicts, considers multiple ethical perspectives',
  'You approach this debate as a moral philosopher analyzing ethical implications.

**Your Argumentation Style:**
- Explicitly state the ethical framework you are applying (utilitarian, deontological, virtue ethics, etc.)
- Identify moral rights and obligations of relevant parties
- Acknowledge competing ethical considerations
- Consider justice, fairness, and distributional concerns
- Be honest about value conflicts and trade-offs

**Vocabulary Emphasis:** Use ethical terminology. Terms like "moral," "rights," "obligations," and "justice" are central.

**Focus Areas:** Ethical frameworks, moral obligations, rights analysis, value conflicts, justice considerations.',
  '🧭',
  '#db2777',
  '#f472b6',
  true
)

ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================

COMMENT ON TABLE personas IS 'Debate personas defining distinct argumentation styles for advocates';
COMMENT ON COLUMN personas.archetype IS 'Category of persona: academic, pragmatic, empirical, legal, economic, moral';
COMMENT ON COLUMN personas.argumentation_style IS 'Description of how this persona argues';
COMMENT ON COLUMN personas.system_prompt_addition IS 'Text to inject into agent system prompt when using this persona';
COMMENT ON COLUMN personas.focus_areas IS 'Array of topic areas this persona emphasizes';
COMMENT ON COLUMN debates.pro_persona_id IS 'Optional persona for the Pro advocate (null = default behavior)';
COMMENT ON COLUMN debates.con_persona_id IS 'Optional persona for the Con advocate (null = default behavior)';

COMMIT;
```

### Rollback Script

Create `backend/src/db/migrations/004_add_personas_rollback.sql`:

```sql
-- Rollback for 004_add_personas.sql

BEGIN;

ALTER TABLE debates DROP COLUMN IF EXISTS pro_persona_id;
ALTER TABLE debates DROP COLUMN IF EXISTS con_persona_id;

DROP TABLE IF EXISTS personas;

COMMIT;
```

---

## Dependencies

**Task Dependencies:**
- CONFIG-001: Database migration 003 (should run first to establish config columns)

---

## Validation

### How to Test

1. Run the migration:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside < backend/src/db/migrations/004_add_personas.sql
   ```

2. Verify personas table:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside -c "\d personas"
   ```

3. Verify personas inserted:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside -c "SELECT id, name, archetype FROM personas"
   ```

4. Verify debates columns added:
   ```bash
   docker exec -i clearside-db psql -U clearside -d clearside -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'debates' AND column_name LIKE '%persona%'"
   ```

### Expected Output

```
    id    |      name       | archetype
----------+-----------------+-----------
 theorist | The Theorist    | academic
 politician | The Politician | pragmatic
 scientist | The Scientist  | empirical
 lawyer   | The Lawyer      | legal
 economist | The Economist  | economic
 ethicist | The Ethicist   | moral
```

### Definition of Done

- [ ] Migration file created
- [ ] personas table created with all columns
- [ ] 6 system personas inserted with complete prompt additions
- [ ] debates table has pro_persona_id and con_persona_id columns
- [ ] Foreign key constraints working (ON DELETE SET NULL)
- [ ] Rollback script created

---

## Notes

### Persona Prompt Integration

The `system_prompt_addition` field contains text that will be injected into the agent's system prompt when that persona is active. It includes:
- Argumentation style guidance
- Vocabulary emphasis
- Focus areas

### Null Persona Behavior

When `pro_persona_id` or `con_persona_id` is NULL, the agent uses its default identity (the current `PRO_IDENTITY` / `CON_IDENTITY` constants).

### Persona Design Philosophy

Each persona:
1. Has a distinct **archetype** (academic, pragmatic, empirical, legal, economic, moral)
2. Emphasizes specific **focus areas**
3. Uses characteristic **vocabulary**
4. Follows a defined **argumentation style**

This creates meaningful variety without compromising debate quality.

---

**Estimated Time:** 2 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-26
**Updated:** 2025-12-26
