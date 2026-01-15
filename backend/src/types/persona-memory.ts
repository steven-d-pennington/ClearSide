/**
 * Persona Memory System Type Definitions
 *
 * Supports persistent personality memory for podcast personas with:
 * - Core values (immutable personality anchors)
 * - Opinions (malleable stances on topics with evolution tracking)
 * - Relationships (inter-persona dynamics)
 * - Config (admin settings)
 */

// ============================================================================
// Enums
// ============================================================================

/** Types of core values that define a persona's identity */
export type CoreValueType = 'belief' | 'principle' | 'red_line' | 'passion';

/** Possible stances a persona can have on a topic */
export type OpinionStance = 'supports' | 'opposes' | 'neutral' | 'mixed' | 'evolving';

/** Types of relationships between personas */
export type RelationshipDynamicType = 'allies' | 'rivals' | 'respectful_opponents' | 'mentors' | 'foils';

// ============================================================================
// Core Values (Immutable)
// ============================================================================

/**
 * A core value that defines a persona's identity
 * These are immutable and never auto-change - only admin can modify
 */
export interface PersonaCoreValue {
  id: string;
  personaId: string;
  valueType: CoreValueType;
  description: string;
  priority: number;
  createdAt: Date;
}

/**
 * Database row for persona_core_values table
 */
export interface PersonaCoreValueRow {
  id: string;
  persona_id: string;
  value_type: string;
  description: string;
  priority: number;
  created_at: Date;
}

/**
 * Input for creating a new core value
 */
export interface CreateCoreValueInput {
  personaId: string;
  valueType: CoreValueType;
  description: string;
  priority?: number;
}

/**
 * Input for updating a core value
 */
export interface UpdateCoreValueInput {
  valueType?: CoreValueType;
  description?: string;
  priority?: number;
}

// ============================================================================
// Opinions (Malleable)
// ============================================================================

/**
 * A single evolution history entry tracking how an opinion changed
 */
export interface OpinionEvolutionEntry {
  date: string;
  oldStance: OpinionStance;
  newStance: OpinionStance;
  oldStrength: number;
  newStrength: number;
  reason: string;
  sessionId?: string;
}

/**
 * A persona's opinion on a topic
 * These can evolve over time based on conversations
 */
export interface PersonaOpinion {
  id: string;
  personaId: string;

  // Topic identification
  topicKey: string;           // Normalized slug: 'ai_regulation', 'climate_policy'
  topicDisplay?: string;      // Display name: "AI Regulation"

  // Current stance
  stance: OpinionStance;
  stanceStrength: number;     // 0-1
  summary: string;            // Brief summary of position
  keyArguments: string[];     // Main points they make on this topic

  // Evolution tracking
  canEvolve: boolean;         // Admin can lock certain opinions
  evolutionHistory: OpinionEvolutionEntry[];

  // Metadata
  firstDiscussedAt?: Date;
  lastDiscussedAt?: Date;
  discussionCount: number;
  sourceSessionIds: string[];
  adminCurated: boolean;      // Was this seeded/edited by admin?

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for persona_opinions table
 */
export interface PersonaOpinionRow {
  id: string;
  persona_id: string;
  topic_key: string;
  topic_display?: string;
  stance: string;
  stance_strength: number;
  summary: string;
  key_arguments: string[];
  can_evolve: boolean;
  evolution_history: OpinionEvolutionEntry[];
  first_discussed_at?: Date;
  last_discussed_at?: Date;
  discussion_count: number;
  source_session_ids: string[];
  admin_curated: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new opinion
 */
export interface CreateOpinionInput {
  personaId: string;
  topicKey: string;
  topicDisplay?: string;
  stance: OpinionStance;
  stanceStrength?: number;
  summary: string;
  keyArguments?: string[];
  canEvolve?: boolean;
  adminCurated?: boolean;
}

/**
 * Input for updating an opinion
 */
export interface UpdateOpinionInput {
  topicDisplay?: string;
  stance?: OpinionStance;
  stanceStrength?: number;
  summary?: string;
  keyArguments?: string[];
  canEvolve?: boolean;
  adminCurated?: boolean;
}

/**
 * Input for evolving an opinion (used by the memory service)
 */
export interface EvolveOpinionInput {
  newStance: OpinionStance;
  newStrength: number;
  reason: string;
  sessionId?: string;
}

// ============================================================================
// Relationships
// ============================================================================

/**
 * A relationship between two personas
 * Tracks how they interact and their dynamics
 */
export interface PersonaRelationship {
  id: string;
  personaId: string;
  otherPersonaId: string;

  // Relationship dynamics
  rapportScore: number;       // 0-1: 0=hostile, 0.5=neutral, 1=close allies
  dynamicType?: RelationshipDynamicType;
  commonGround: string[];     // Topics they agree on
  frictionPoints: string[];   // Topics they clash on
  notableExchanges: string[]; // Memorable past interactions

  // Metadata
  interactionCount: number;
  lastInteractionAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for persona_relationships table
 */
export interface PersonaRelationshipRow {
  id: string;
  persona_id: string;
  other_persona_id: string;
  rapport_score: number;
  dynamic_type?: string;
  common_ground: string[];
  friction_points: string[];
  notable_exchanges: string[];
  interaction_count: number;
  last_interaction_at?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a new relationship
 */
export interface CreateRelationshipInput {
  personaId: string;
  otherPersonaId: string;
  rapportScore?: number;
  dynamicType?: RelationshipDynamicType;
  commonGround?: string[];
  frictionPoints?: string[];
  notableExchanges?: string[];
}

/**
 * Input for updating a relationship
 */
export interface UpdateRelationshipInput {
  rapportScore?: number;
  dynamicType?: RelationshipDynamicType;
  commonGround?: string[];
  frictionPoints?: string[];
  notableExchanges?: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Global configuration for persona memory system
 * Single row table with admin settings
 */
export interface PersonaMemoryConfig {
  id: number;

  // Extraction settings
  extractionModel: string;
  extractionEnabled: boolean;

  // Evolution settings
  autoEvolutionEnabled: boolean;
  evolutionThreshold: number;   // 0-1: Minimum stance strength to shift opinion

  // Performance settings
  maxOpinionsInPrompt: number;
  maxContextTokens: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for persona_memory_config table
 */
export interface PersonaMemoryConfigRow {
  id: number;
  extraction_model: string;
  extraction_enabled: boolean;
  auto_evolution_enabled: boolean;
  evolution_threshold: number;
  max_opinions_in_prompt: number;
  max_context_tokens: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for updating memory configuration
 */
export interface UpdateMemoryConfigInput {
  extractionModel?: string;
  extractionEnabled?: boolean;
  autoEvolutionEnabled?: boolean;
  evolutionThreshold?: number;
  maxOpinionsInPrompt?: number;
  maxContextTokens?: number;
}

// ============================================================================
// Memory Context (for prompt injection)
// ============================================================================

/**
 * Memory context assembled for a persona in a conversation
 * Used to inject personality memory into system prompts
 */
export interface PersonaMemoryContext {
  coreValues: PersonaCoreValue[];
  relevantOpinions: PersonaOpinion[];
  relationships: PersonaRelationshipWithNames[];
  personalityNotes?: string;  // Admin-curated guidance
}

/**
 * Relationship with persona names included for prompt generation
 */
export interface PersonaRelationshipWithNames extends PersonaRelationship {
  personaName: string;
  otherPersonaName: string;
}

// ============================================================================
// Extraction Types (for memory service)
// ============================================================================

/**
 * Result of extracting memory data from an utterance
 */
export interface MemoryExtractionResult {
  isSubstantive: boolean;     // Was this worth extracting from?
  topics: ExtractedTopic[];
  emotionalUndertone?: string;
}

/**
 * A topic extracted from an utterance
 */
export interface ExtractedTopic {
  topicKey: string;
  topicDisplay: string;
  stance: OpinionStance;
  stanceStrength: number;
  keyArgument?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/** Check if value is a valid CoreValueType */
export function isCoreValueType(value: unknown): value is CoreValueType {
  return (
    typeof value === 'string' &&
    ['belief', 'principle', 'red_line', 'passion'].includes(value)
  );
}

/** Check if value is a valid OpinionStance */
export function isOpinionStance(value: unknown): value is OpinionStance {
  return (
    typeof value === 'string' &&
    ['supports', 'opposes', 'neutral', 'mixed', 'evolving'].includes(value)
  );
}

/** Check if value is a valid RelationshipDynamicType */
export function isRelationshipDynamicType(value: unknown): value is RelationshipDynamicType {
  return (
    typeof value === 'string' &&
    ['allies', 'rivals', 'respectful_opponents', 'mentors', 'foils'].includes(value)
  );
}

// ============================================================================
// Constants
// ============================================================================

/** Constraints for persona memory */
export const PERSONA_MEMORY_CONSTRAINTS = {
  maxCoreValues: 10,
  maxOpinions: 100,
  maxRelationships: 50,
  maxKeyArguments: 5,
  maxNotableExchanges: 10,
  minStanceStrength: 0,
  maxStanceStrength: 1,
  minRapportScore: 0,
  maxRapportScore: 1,
} as const;

/** Default configuration values */
export const DEFAULT_MEMORY_CONFIG: Partial<PersonaMemoryConfig> = {
  extractionModel: 'claude-3-haiku-20240307',
  extractionEnabled: true,
  autoEvolutionEnabled: true,
  evolutionThreshold: 0.7,
  maxOpinionsInPrompt: 5,
  maxContextTokens: 500,
};

// ============================================================================
// Row Mappers
// ============================================================================

/**
 * Map database row to PersonaCoreValue
 */
export function mapCoreValueRow(row: PersonaCoreValueRow): PersonaCoreValue {
  return {
    id: row.id,
    personaId: row.persona_id,
    valueType: row.value_type as CoreValueType,
    description: row.description,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

/**
 * Map database row to PersonaOpinion
 */
export function mapOpinionRow(row: PersonaOpinionRow): PersonaOpinion {
  return {
    id: row.id,
    personaId: row.persona_id,
    topicKey: row.topic_key,
    topicDisplay: row.topic_display,
    stance: row.stance as OpinionStance,
    stanceStrength: row.stance_strength,
    summary: row.summary,
    keyArguments: row.key_arguments || [],
    canEvolve: row.can_evolve,
    evolutionHistory: row.evolution_history || [],
    firstDiscussedAt: row.first_discussed_at,
    lastDiscussedAt: row.last_discussed_at,
    discussionCount: row.discussion_count,
    sourceSessionIds: row.source_session_ids || [],
    adminCurated: row.admin_curated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map database row to PersonaRelationship
 */
export function mapRelationshipRow(row: PersonaRelationshipRow): PersonaRelationship {
  return {
    id: row.id,
    personaId: row.persona_id,
    otherPersonaId: row.other_persona_id,
    rapportScore: row.rapport_score,
    dynamicType: row.dynamic_type as RelationshipDynamicType | undefined,
    commonGround: row.common_ground || [],
    frictionPoints: row.friction_points || [],
    notableExchanges: row.notable_exchanges || [],
    interactionCount: row.interaction_count,
    lastInteractionAt: row.last_interaction_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map database row to PersonaMemoryConfig
 */
export function mapMemoryConfigRow(row: PersonaMemoryConfigRow): PersonaMemoryConfig {
  return {
    id: row.id,
    extractionModel: row.extraction_model,
    extractionEnabled: row.extraction_enabled,
    autoEvolutionEnabled: row.auto_evolution_enabled,
    evolutionThreshold: row.evolution_threshold,
    maxOpinionsInPrompt: row.max_opinions_in_prompt,
    maxContextTokens: row.max_context_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
