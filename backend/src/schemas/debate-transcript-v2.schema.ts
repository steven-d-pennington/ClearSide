/**
 * JSON Schema for Debate Transcript v2.0.0
 *
 * This schema defines the complete structure for debate transcripts in ClearSide.
 * It validates all agent outputs, user interventions, and debate metadata.
 *
 * @see docs/09_real-time-architecture.md for architecture details
 */

/**
 * Debate phases in the 6-phase protocol
 */
export enum DebatePhase {
  PHASE_1_OPENING = 'phase_1_opening',
  PHASE_2_CONSTRUCTIVE = 'phase_2_constructive',
  PHASE_3_CROSSEXAM = 'phase_3_crossexam',
  PHASE_4_REBUTTAL = 'phase_4_rebuttal',
  PHASE_5_CLOSING = 'phase_5_closing',
  PHASE_6_SYNTHESIS = 'phase_6_synthesis',
}

/**
 * Speaker types in the debate
 */
export enum Speaker {
  PRO = 'pro',
  CON = 'con',
  MODERATOR = 'moderator',
  SYSTEM = 'system',
}

/**
 * Debate status values
 */
export enum DebateStatus {
  LIVE = 'live',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * Intervention types
 */
export enum InterventionType {
  QUESTION = 'question',
  CHALLENGE = 'challenge',
  EVIDENCE = 'evidence',
  PAUSE = 'pause',
  RESUME = 'resume',
}

/**
 * Metadata for debate transcript
 */
export interface DebateMeta {
  schema_version: string;
  debate_id: string;
  generated_at: string; // ISO 8601 timestamp
  debate_format: string;
  total_duration_seconds: number;
  status: DebateStatus;
}

/**
 * Proposition being debated
 */
export interface Proposition {
  raw_input: string;
  normalized_question: string;
  context?: string;
}

/**
 * Single utterance in the debate
 */
export interface Utterance {
  id: string;
  timestamp_ms: number;
  phase: DebatePhase;
  speaker: Speaker;
  content: string;
  metadata?: {
    tokens?: number;
    model?: string;
    response_time_ms?: number;
    [key: string]: unknown;
  };
}

/**
 * User intervention during debate
 */
export interface UserIntervention {
  id: string;
  timestamp_ms: number;
  phase: DebatePhase;
  type: InterventionType;
  content: string;
  metadata?: {
    [key: string]: unknown;
  };
}

/**
 * Structured analysis section (Pro, Con, or Moderator)
 */
export interface AnalysisSection {
  key_arguments?: string[];
  evidence_cited?: string[];
  assumptions?: string[];
  uncertainties?: string[];
  [key: string]: unknown;
}

/**
 * Complete structured analysis
 */
export interface StructuredAnalysis {
  pro?: AnalysisSection;
  con?: AnalysisSection;
  moderator?: AnalysisSection;
}

/**
 * Complete debate transcript
 */
export interface DebateTranscript {
  meta: DebateMeta;
  proposition: Proposition;
  transcript: Utterance[];
  structured_analysis?: StructuredAnalysis;
  user_interventions?: UserIntervention[];
}

/**
 * JSON Schema for DebateMeta
 */
export const debateMetaSchema = {
  type: 'object',
  properties: {
    schema_version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    debate_id: { type: 'string', minLength: 1 },
    generated_at: { type: 'string', format: 'date-time' },
    debate_format: { type: 'string', minLength: 1 },
    total_duration_seconds: { type: 'number', minimum: 0 },
    status: {
      type: 'string',
      enum: [
        DebateStatus.LIVE,
        DebateStatus.PAUSED,
        DebateStatus.COMPLETED,
        DebateStatus.ERROR,
      ],
    },
  },
  required: [
    'schema_version',
    'debate_id',
    'generated_at',
    'debate_format',
    'total_duration_seconds',
    'status',
  ],
  additionalProperties: false,
};

/**
 * JSON Schema for Proposition
 */
export const propositionSchema = {
  type: 'object',
  properties: {
    raw_input: { type: 'string', minLength: 1 },
    normalized_question: { type: 'string', minLength: 1 },
    context: { type: 'string', nullable: true },
  },
  required: ['raw_input', 'normalized_question'],
  additionalProperties: false,
};

/**
 * JSON Schema for Utterance
 */
export const utteranceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    timestamp_ms: { type: 'number', minimum: 0 },
    phase: {
      type: 'string',
      enum: [
        DebatePhase.PHASE_1_OPENING,
        DebatePhase.PHASE_2_CONSTRUCTIVE,
        DebatePhase.PHASE_3_CROSSEXAM,
        DebatePhase.PHASE_4_REBUTTAL,
        DebatePhase.PHASE_5_CLOSING,
        DebatePhase.PHASE_6_SYNTHESIS,
      ],
    },
    speaker: {
      type: 'string',
      enum: [Speaker.PRO, Speaker.CON, Speaker.MODERATOR, Speaker.SYSTEM],
    },
    content: { type: 'string', minLength: 1 },
    metadata: {
      type: 'object',
      properties: {
        tokens: { type: 'number', nullable: true },
        model: { type: 'string', nullable: true },
        response_time_ms: { type: 'number', nullable: true },
      },
      required: [],
      nullable: true,
      additionalProperties: true,
    } as any,
  },
  required: ['id', 'timestamp_ms', 'phase', 'speaker', 'content'],
  additionalProperties: false,
};

/**
 * JSON Schema for UserIntervention
 */
export const userInterventionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    timestamp_ms: { type: 'number', minimum: 0 },
    phase: {
      type: 'string',
      enum: [
        DebatePhase.PHASE_1_OPENING,
        DebatePhase.PHASE_2_CONSTRUCTIVE,
        DebatePhase.PHASE_3_CROSSEXAM,
        DebatePhase.PHASE_4_REBUTTAL,
        DebatePhase.PHASE_5_CLOSING,
        DebatePhase.PHASE_6_SYNTHESIS,
      ],
    },
    type: {
      type: 'string',
      enum: [
        InterventionType.QUESTION,
        InterventionType.CHALLENGE,
        InterventionType.EVIDENCE,
        InterventionType.PAUSE,
        InterventionType.RESUME,
      ],
    },
    content: { type: 'string', minLength: 1 },
    metadata: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: true,
    },
  },
  required: ['id', 'timestamp_ms', 'phase', 'type', 'content'],
  additionalProperties: false,
};

/**
 * JSON Schema for AnalysisSection
 */
export const analysisSectionSchema = {
  type: 'object',
  properties: {
    key_arguments: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    } as any,
    evidence_cited: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    } as any,
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    } as any,
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    } as any,
  },
  required: [],
  additionalProperties: true,
};

/**
 * JSON Schema for StructuredAnalysis
 */
export const structuredAnalysisSchema = {
  type: 'object',
  properties: {
    pro: { ...analysisSectionSchema, nullable: true },
    con: { ...analysisSectionSchema, nullable: true },
    moderator: { ...analysisSectionSchema, nullable: true },
  },
  required: [],
  additionalProperties: false,
};

/**
 * Complete JSON Schema for DebateTranscript v2.0.0
 */
export const debateTranscriptSchema = {
  type: 'object',
  properties: {
    meta: debateMetaSchema,
    proposition: propositionSchema,
    transcript: {
      type: 'array',
      items: utteranceSchema,
    },
    structured_analysis: { ...structuredAnalysisSchema, nullable: true },
    user_interventions: {
      type: 'array',
      items: userInterventionSchema,
      nullable: true,
    },
  },
  required: ['meta', 'proposition', 'transcript'],
  additionalProperties: false,
};

/**
 * Schema version constant
 */
export const SCHEMA_VERSION = '2.0.0';

/**
 * Schema registry for version management
 */
export const SCHEMA_REGISTRY = {
  '2.0.0': debateTranscriptSchema,
} as const;

export type SchemaVersion = keyof typeof SCHEMA_REGISTRY;
