/**
 * Persona Memory System Type Definitions (Frontend)
 *
 * Matches backend types for API communication.
 */

// ============================================================================
// Enums
// ============================================================================

export type CoreValueType = 'belief' | 'principle' | 'red_line' | 'passion';
export type OpinionStance = 'supports' | 'opposes' | 'neutral' | 'mixed' | 'evolving';
export type RelationshipDynamicType = 'allies' | 'rivals' | 'respectful_opponents' | 'mentors' | 'foils';

// ============================================================================
// Core Values
// ============================================================================

export interface PersonaCoreValue {
  id: string;
  personaId: string;
  valueType: CoreValueType;
  description: string;
  priority: number;
  createdAt: string;
}

export interface CreateCoreValueInput {
  personaId: string;
  valueType: CoreValueType;
  description: string;
  priority?: number;
}

export interface UpdateCoreValueInput {
  valueType?: CoreValueType;
  description?: string;
  priority?: number;
}

// ============================================================================
// Opinions
// ============================================================================

export interface OpinionEvolutionEntry {
  date: string;
  oldStance: OpinionStance;
  newStance: OpinionStance;
  oldStrength: number;
  newStrength: number;
  reason: string;
  sessionId?: string;
}

export interface PersonaOpinion {
  id: string;
  personaId: string;
  topicKey: string;
  topicDisplay?: string;
  stance: OpinionStance;
  stanceStrength: number;
  summary: string;
  keyArguments: string[];
  canEvolve: boolean;
  evolutionHistory: OpinionEvolutionEntry[];
  firstDiscussedAt?: string;
  lastDiscussedAt?: string;
  discussionCount: number;
  sourceSessionIds: string[];
  adminCurated: boolean;
  createdAt: string;
  updatedAt: string;
}

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

export interface UpdateOpinionInput {
  topicDisplay?: string;
  stance?: OpinionStance;
  stanceStrength?: number;
  summary?: string;
  keyArguments?: string[];
  canEvolve?: boolean;
  adminCurated?: boolean;
}

// ============================================================================
// Relationships
// ============================================================================

export interface PersonaRelationship {
  id: string;
  personaId: string;
  otherPersonaId: string;
  rapportScore: number;
  dynamicType?: RelationshipDynamicType;
  commonGround: string[];
  frictionPoints: string[];
  notableExchanges: string[];
  interactionCount: number;
  lastInteractionAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaRelationshipWithNames extends PersonaRelationship {
  personaName: string;
  otherPersonaName: string;
}

export interface CreateRelationshipInput {
  personaId: string;
  otherPersonaId: string;
  rapportScore?: number;
  dynamicType?: RelationshipDynamicType;
  commonGround?: string[];
  frictionPoints?: string[];
  notableExchanges?: string[];
}

export interface UpdateRelationshipInput {
  rapportScore?: number;
  dynamicType?: RelationshipDynamicType;
  commonGround?: string[];
  frictionPoints?: string[];
  notableExchanges?: string[];
}

// ============================================================================
// Display Helpers
// ============================================================================

export const VALUE_TYPE_LABELS: Record<CoreValueType, string> = {
  belief: 'Belief',
  principle: 'Principle',
  red_line: 'Red Line',
  passion: 'Passion',
};

export const VALUE_TYPE_DESCRIPTIONS: Record<CoreValueType, string> = {
  belief: 'A fundamental belief this persona holds',
  principle: 'A guiding principle they live by',
  red_line: 'Something they will never compromise on',
  passion: 'A topic or cause they deeply care about',
};

export const STANCE_LABELS: Record<OpinionStance, string> = {
  supports: 'Supports',
  opposes: 'Opposes',
  neutral: 'Neutral',
  mixed: 'Mixed',
  evolving: 'Evolving',
};

export const STANCE_COLORS: Record<OpinionStance, string> = {
  supports: '#2d6a4f',
  opposes: '#9e2a2b',
  neutral: '#64748b',
  mixed: '#c9a227',
  evolving: '#5c4d7d',
};

export const DYNAMIC_TYPE_LABELS: Record<RelationshipDynamicType, string> = {
  allies: 'Allies',
  rivals: 'Rivals',
  respectful_opponents: 'Respectful Opponents',
  mentors: 'Mentor/Mentee',
  foils: 'Foils',
};

export const DYNAMIC_TYPE_DESCRIPTIONS: Record<RelationshipDynamicType, string> = {
  allies: 'Generally agree and support each other',
  rivals: 'Competitive relationship with frequent disagreements',
  respectful_opponents: 'Disagree on key issues but respect each other',
  mentors: 'One guides or teaches the other',
  foils: 'Contrasting personalities that highlight differences',
};
