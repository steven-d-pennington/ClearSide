/**
 * Transcript Recorder Service
 *
 * Records debate utterances and interventions, compiles complete transcripts,
 * and extracts structured analysis for replay and export features.
 *
 * Responsibilities:
 * - Record utterances with timestamps
 * - Record user interventions with timestamps
 * - Track phase transitions
 * - Compile final transcript JSON
 * - Generate structured analysis from utterances
 * - Validate against schema v2.0.0
 * - Support transcript retrieval for replay
 *
 * @see tasks/phase1/core/CORE-005.md
 */

import pino from 'pino';
import type { SchemaValidator } from '../validation/schema-validator.js';
import type {
  Debate,
  Utterance,
  UserIntervention,
  CreateUtteranceInput,
  CreateInterventionInput,
  DebatePhase,
  Speaker,
} from '../../types/database.js';
import * as debateRepo from '../../db/repositories/debate-repository.js';
import * as utteranceRepo from '../../db/repositories/utterance-repository.js';
import * as interventionRepo from '../../db/repositories/intervention-repository.js';

/**
 * Logger instance
 */
const logger = pino({
  name: 'transcript-recorder',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Transcript metadata
 */
export interface TranscriptMeta {
  schema_version: string;
  debate_id: string;
  generated_at: string;
  debate_format: string;
  total_duration_seconds: number;
  status: string;
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
 * Transcript utterance format (matches schema v2.0.0)
 */
export interface TranscriptUtterance {
  id: string;
  timestamp_ms: number;
  phase: string; // Schema phase format (e.g., 'phase_1_opening')
  speaker: string; // Schema speaker format (e.g., 'pro', 'con')
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Transcript intervention format (matches schema v2.0.0)
 */
export interface TranscriptIntervention {
  id: string;
  timestamp_ms: number;
  phase: string; // Schema phase format
  type: string; // Schema intervention type
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Structured analysis for one side (Pro or Con)
 */
export interface SideAnalysis {
  executive_summary: string;
  arguments: Array<{
    content: string;
    category: string;
    evidence_type: string;
    confidence_level: string;
  }>;
  assumptions: string[];
  uncertainties: string[];
}

/**
 * Moderator synthesis
 */
export interface ModeratorSynthesis {
  areas_of_agreement: Array<{ topic: string; description: string }>;
  core_disagreements: Array<{ topic: string; description: string }>;
  assumption_conflicts: Array<{ pro_assumes: string; con_assumes: string }>;
  evidence_gaps: string[];
  decision_hinges: string[];
}

/**
 * Complete structured analysis
 */
export interface StructuredAnalysis {
  pro: SideAnalysis;
  con: SideAnalysis;
  moderator: ModeratorSynthesis;
}

/**
 * Complete debate transcript
 */
export interface DebateTranscript {
  meta: TranscriptMeta;
  proposition: Proposition;
  transcript: TranscriptUtterance[];
  structured_analysis: StructuredAnalysis;
  user_interventions: TranscriptIntervention[];
}

/**
 * Transcript Recorder Class
 *
 * Records and compiles debate transcripts with structured analysis
 */
export class TranscriptRecorder {
  constructor(private schemaValidator: SchemaValidator) {
    logger.info('Transcript recorder initialized');
  }

  /**
   * Record a single utterance to the database
   *
   * @param utterance - Utterance data to record
   * @returns The persisted utterance
   */
  async recordUtterance(utterance: CreateUtteranceInput): Promise<Utterance> {
    logger.debug({ debateId: utterance.debateId, speaker: utterance.speaker }, 'Recording utterance');

    try {
      // Validate utterance structure (optional, for early detection)
      const validation = this.schemaValidator.validateUtterance({
        id: 'temp',
        timestamp_ms: utterance.timestampMs,
        phase: utterance.phase,
        speaker: utterance.speaker,
        content: utterance.content,
        metadata: utterance.metadata || {},
      });

      if (!validation.valid) {
        logger.warn({ validation, utterance }, 'Utterance validation failed');
        // Continue anyway, but log warnings
      }

      // Persist to database
      const persisted = await utteranceRepo.create(utterance);

      logger.info(
        { id: persisted.id, debateId: utterance.debateId, speaker: utterance.speaker },
        'Utterance recorded successfully'
      );

      return persisted;
    } catch (error) {
      logger.error({ error, utterance }, 'Failed to record utterance');
      throw new Error(
        `Failed to record utterance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Record a user intervention to the database
   *
   * @param intervention - Intervention data to record
   * @returns The persisted intervention
   */
  async recordIntervention(
    intervention: CreateInterventionInput
  ): Promise<UserIntervention> {
    logger.debug(
      { debateId: intervention.debateId, type: intervention.interventionType },
      'Recording intervention'
    );

    try {
      // Persist to database
      const persisted = await interventionRepo.create(intervention);

      logger.info(
        { id: persisted.id, debateId: intervention.debateId, type: intervention.interventionType },
        'Intervention recorded successfully'
      );

      return persisted;
    } catch (error) {
      logger.error({ error, intervention }, 'Failed to record intervention');
      throw new Error(
        `Failed to record intervention: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Add a response to an existing intervention
   *
   * @param interventionId - ID of the intervention
   * @param response - Response text
   * @param responseTimestampMs - Timestamp of the response
   * @returns Updated intervention
   */
  async addInterventionResponse(
    interventionId: number,
    response: string,
    responseTimestampMs: number
  ): Promise<UserIntervention | null> {
    logger.debug({ interventionId }, 'Adding intervention response');

    try {
      const updated = await interventionRepo.addResponse(
        interventionId,
        response,
        responseTimestampMs
      );

      logger.info({ interventionId }, 'Intervention response added');
      return updated;
    } catch (error) {
      logger.error({ error, interventionId }, 'Failed to add intervention response');
      throw error;
    }
  }

  /**
   * Compile complete transcript from database records
   *
   * @param debateId - ID of the debate
   * @returns Complete transcript with structured analysis
   */
  async compileTranscript(debateId: string): Promise<DebateTranscript> {
    logger.info({ debateId }, 'Compiling transcript');

    try {
      // Fetch all required data
      const debate = await debateRepo.findById(debateId);
      if (!debate) {
        throw new Error(`Debate not found: ${debateId}`);
      }

      const utterances = await utteranceRepo.findByDebateId(debateId);
      const interventions = await interventionRepo.findByDebateId(debateId);

      // Build transcript
      const transcript: DebateTranscript = {
        meta: this.buildMeta(debate, utterances, interventions),
        proposition: this.buildProposition(debate),
        transcript: this.buildTranscriptUtterances(utterances),
        structured_analysis: this.buildStructuredAnalysis(utterances),
        user_interventions: this.buildInterventions(interventions),
      };

      // Validate against schema v2.0.0
      const validation = this.schemaValidator.validateTranscript(transcript, '2.0.0');

      if (!validation.valid) {
        logger.error(
          { debateId, errors: validation.errors },
          'Compiled transcript failed validation'
        );
        throw new Error(
          `Transcript validation failed: ${validation.errors?.map((e) => e.message).join(', ')}`
        );
      }

      logger.info({ debateId, utteranceCount: utterances.length }, 'Transcript compiled successfully');

      return transcript;
    } catch (error) {
      logger.error({ error, debateId }, 'Failed to compile transcript');
      throw new Error(
        `Failed to compile transcript: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Save compiled transcript to database
   *
   * @param debateId - ID of the debate
   * @param transcript - Compiled transcript
   */
  async saveTranscript(debateId: string, transcript: DebateTranscript): Promise<void> {
    logger.info({ debateId }, 'Saving transcript to database');

    try {
      await debateRepo.saveTranscript(debateId, transcript as unknown as Record<string, unknown>);
      logger.info({ debateId }, 'Transcript saved successfully');
    } catch (error) {
      logger.error({ error, debateId }, 'Failed to save transcript');
      throw new Error(
        `Failed to save transcript: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load transcript from database for replay
   *
   * @param debateId - ID of the debate
   * @returns Transcript if exists, null otherwise
   */
  async loadTranscript(debateId: string): Promise<DebateTranscript | null> {
    logger.debug({ debateId }, 'Loading transcript');

    try {
      const debate = await debateRepo.findById(debateId);

      if (!debate || !debate.transcriptJson) {
        logger.debug({ debateId }, 'No transcript found');
        return null;
      }

      // Normalize transcript format if needed (handle legacy format)
      const rawTranscript = debate.transcriptJson as Record<string, unknown>;
      const normalized = this.normalizeTranscriptFormat(rawTranscript, debate);

      logger.info({ debateId }, 'Transcript loaded successfully');
      return normalized;
    } catch (error) {
      logger.error({ error, debateId }, 'Failed to load transcript');
      throw new Error(
        `Failed to load transcript: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Normalize transcript format to match v2.0.0 schema
   * Handles legacy formats that used different field structures
   */
  private normalizeTranscriptFormat(
    raw: Record<string, unknown>,
    debate: Debate
  ): DebateTranscript {
    // Check if already in v2.0.0 format (has proposition.normalized_question)
    const rawProposition = raw.proposition as Record<string, unknown> | undefined;
    if (rawProposition && typeof rawProposition.normalized_question === 'string') {
      return raw as unknown as DebateTranscript;
    }

    // Legacy format: meta.proposition is a string, utterances instead of transcript
    const meta = raw.meta as Record<string, unknown> | undefined;
    const legacyProposition = meta?.proposition as string | undefined;

    // Build normalized transcript
    const normalizedTranscript: DebateTranscript = {
      meta: {
        schema_version: '2.0.0',
        debate_id: debate.id,
        generated_at: new Date().toISOString(),
        debate_format: 'live_theater',
        total_duration_seconds: Math.floor((debate.totalDurationMs || 0) / 1000),
        status: debate.status,
      },
      proposition: {
        raw_input: debate.propositionText,
        normalized_question: legacyProposition || debate.propositionText,
        context: debate.propositionContext ? JSON.stringify(debate.propositionContext) : undefined,
      },
      transcript: this.normalizeUtterances(raw.utterances as unknown[]),
      structured_analysis: this.buildEmptyStructuredAnalysis(),
      user_interventions: this.normalizeInterventions(raw.interventions as unknown[]),
    };

    return normalizedTranscript;
  }

  /**
   * Normalize utterances from legacy format
   */
  private normalizeUtterances(utterances: unknown[] | undefined): TranscriptUtterance[] {
    if (!utterances || !Array.isArray(utterances)) {
      return [];
    }

    return utterances.map((u: unknown) => {
      const utt = u as Record<string, unknown>;
      return {
        id: String(utt.id || ''),
        timestamp_ms: (utt.timestamp_ms as number) || (utt.timestampMs as number) || 0,
        phase: this.mapPhaseToSchema((utt.phase as DebatePhase) || 'opening_statements'),
        speaker: this.mapSpeakerToSchema((utt.speaker as string) || 'moderator'),
        content: (utt.content as string) || '',
        metadata: utt.metadata as Record<string, unknown> | undefined,
      };
    });
  }

  /**
   * Normalize interventions from legacy format
   */
  private normalizeInterventions(interventions: unknown[] | undefined): TranscriptIntervention[] {
    if (!interventions || !Array.isArray(interventions)) {
      return [];
    }

    return interventions.map((i: unknown) => {
      const int = i as Record<string, unknown>;
      return {
        id: String(int.id || ''),
        timestamp_ms: (int.timestamp_ms as number) || (int.timestampMs as number) || 0,
        phase: 'phase_1_opening', // Placeholder - legacy format doesn't track phase
        type: ((int.intervention_type as string) || (int.type as string) || 'question'),
        content: (int.content as string) || '',
        directed_to: (int.directed_to as string) || (int.directedTo as string) || 'moderator',
        response: int.response as string | undefined,
        response_timestamp_ms: (int.response_timestamp_ms as number) || (int.responseTimestampMs as number) || undefined,
      };
    });
  }

  /**
   * Build empty structured analysis for legacy transcripts
   */
  private buildEmptyStructuredAnalysis(): StructuredAnalysis {
    return {
      pro: { executive_summary: 'Legacy transcript - no analysis available', arguments: [], assumptions: [], uncertainties: [] },
      con: { executive_summary: 'Legacy transcript - no analysis available', arguments: [], assumptions: [], uncertainties: [] },
      moderator: { areas_of_agreement: [], core_disagreements: [], assumption_conflicts: [], evidence_gaps: [], decision_hinges: [] },
    };
  }

  /**
   * Build transcript metadata
   */
  private buildMeta(
    debate: Debate,
    _utterances: Utterance[],
    _interventions: UserIntervention[]
  ): TranscriptMeta {
    const totalDurationMs = debate.totalDurationMs || 0;

    return {
      schema_version: '2.0.0',
      debate_id: debate.id,
      generated_at: new Date().toISOString(),
      debate_format: 'live_theater',
      total_duration_seconds: Math.floor(totalDurationMs / 1000),
      status: debate.status,
    };
  }

  /**
   * Build proposition section
   */
  private buildProposition(debate: Debate): Proposition {
    return {
      raw_input: debate.propositionText,
      normalized_question: debate.propositionText,
      context: JSON.stringify(debate.propositionContext || {}),
    };
  }

  /**
   * Build transcript utterances array
   */
  private buildTranscriptUtterances(utterances: Utterance[]): TranscriptUtterance[] {
    return utterances.map((u) => ({
      id: u.id.toString(), // Convert to string for schema
      timestamp_ms: u.timestampMs,
      phase: this.mapPhaseToSchema(u.phase),
      speaker: this.mapSpeakerToSchema(u.speaker),
      content: u.content,
      metadata: u.metadata,
    }));
  }

  /**
   * Map database phase to schema phase
   */
  private mapPhaseToSchema(dbPhase: DebatePhase): string {
    const phaseMap: Record<DebatePhase, string> = {
      opening_statements: 'phase_1_opening',
      evidence_presentation: 'phase_2_constructive',
      clarifying_questions: 'phase_3_crossexam',
      rebuttals: 'phase_4_rebuttal',
      closing_statements: 'phase_5_closing',
      synthesis: 'phase_6_synthesis',
    };
    return phaseMap[dbPhase] || dbPhase;
  }

  /**
   * Map database speaker to schema speaker
   */
  private mapSpeakerToSchema(dbSpeaker: Speaker | string): string {
    const speakerMap: Record<string, string> = {
      pro_advocate: 'pro',
      con_advocate: 'con',
      moderator: 'moderator',
      user: 'system',
      // Handle legacy formats that might use different keys
      PRO: 'pro',
      CON: 'con',
      MODERATOR: 'moderator',
      USER: 'system',
    };
    return speakerMap[dbSpeaker] || String(dbSpeaker);
  }

  /**
   * Build interventions array
   */
  private buildInterventions(interventions: UserIntervention[]): TranscriptIntervention[] {
    return interventions.map((i) => ({
      id: i.id.toString(), // Convert to string for schema
      timestamp_ms: i.timestampMs,
      phase: 'phase_1_opening', // Placeholder - interventions don't track phase in DB
      type: this.mapInterventionTypeToSchema(i.interventionType),
      content: i.content,
      metadata: {
        directed_to: i.directedTo ? this.mapSpeakerToSchema(i.directedTo as Speaker) : undefined,
        response: i.response || undefined,
        response_timestamp_ms: i.responseTimestampMs || undefined,
      },
    }));
  }

  /**
   * Map database intervention type to schema type
   */
  private mapInterventionTypeToSchema(dbType: string): string {
    const typeMap: Record<string, string> = {
      question: 'question',
      challenge: 'challenge',
      evidence_injection: 'evidence',
      pause_request: 'pause',
      clarification_request: 'resume',
    };
    return typeMap[dbType] || dbType;
  }

  /**
   * Build structured analysis from all utterances
   *
   * Extracts key arguments, assumptions, and uncertainties from the debate
   */
  private buildStructuredAnalysis(utterances: Utterance[]): StructuredAnalysis {
    logger.debug('Building structured analysis');

    // Separate utterances by speaker
    const proUtterances = utterances.filter((u) => u.speaker === 'pro_advocate');
    const conUtterances = utterances.filter((u) => u.speaker === 'con_advocate');
    const modUtterances = utterances.filter((u) => u.speaker === 'moderator');

    return {
      pro: this.buildSideAnalysis(proUtterances, 'pro'),
      con: this.buildSideAnalysis(conUtterances, 'con'),
      moderator: this.buildModeratorSynthesis(modUtterances),
    };
  }

  /**
   * Build analysis for one side (Pro or Con)
   */
  private buildSideAnalysis(utterances: Utterance[], _side: 'pro' | 'con'): SideAnalysis {
    return {
      executive_summary: this.extractExecutiveSummary(utterances),
      arguments: this.extractArguments(utterances),
      assumptions: this.extractAssumptions(utterances),
      uncertainties: this.extractUncertainties(utterances),
    };
  }

  /**
   * Extract executive summary from opening statement
   */
  private extractExecutiveSummary(utterances: Utterance[]): string {
    // Find opening statement
    const opening = utterances.find((u) => u.phase === 'opening_statements');

    if (opening) {
      // Return first 500 characters as summary
      return opening.content.substring(0, 500).trim() + (opening.content.length > 500 ? '...' : '');
    }

    return 'No summary available';
  }

  /**
   * Extract structured arguments from constructive phase
   */
  private extractArguments(
    utterances: Utterance[]
  ): Array<{
    content: string;
    category: string;
    evidence_type: string;
    confidence_level: string;
  }> {
    // Find constructive arguments
    const constructive = utterances.filter(
      (u) => u.phase === 'evidence_presentation' || u.phase === 'rebuttals'
    );

    return constructive.map((u) => ({
      content: u.content,
      category: (u.metadata?.argument_category as string) || 'general',
      evidence_type: (u.metadata?.evidence_type as string) || 'logical',
      confidence_level: (u.metadata?.confidence_level as string) || 'medium',
    }));
  }

  /**
   * Extract assumptions from utterances using heuristics
   *
   * Looks for keywords like "assuming", "if we assume", "given that", etc.
   */
  private extractAssumptions(utterances: Utterance[]): string[] {
    const assumptions: string[] = [];
    const regex = /\b(assuming|if we assume|given that|based on the assumption|presumes?)\b/gi;

    for (const utterance of utterances) {
      const content = utterance.content;
      const matches = content.match(regex);

      if (matches) {
        // Split into sentences
        const sentences = content.split(/[.!?]+/).map((s) => s.trim());

        for (const sentence of sentences) {
          if (regex.test(sentence) && sentence.length > 10) {
            assumptions.push(sentence);
          }
        }
      }
    }

    // Deduplicate and limit to top 10
    return [...new Set(assumptions)].slice(0, 10);
  }

  /**
   * Extract uncertainties from utterances using heuristics
   *
   * Looks for keywords like "uncertain", "unclear", "might", "could", etc.
   */
  private extractUncertainties(utterances: Utterance[]): string[] {
    const uncertainties: string[] = [];

    for (const utterance of utterances) {
      // Check metadata for low confidence
      if (utterance.metadata?.confidence_level === 'low') {
        const excerpt = utterance.content.substring(0, 200).trim() + (utterance.content.length > 200 ? '...' : '');
        uncertainties.push(excerpt);
      }

      // Look for uncertainty markers
      const regex = /\b(uncertain|unclear|unknown|may|might|could|possibly|perhaps|probably)\b/gi;
      if (regex.test(utterance.content)) {
        const excerpt = utterance.content.substring(0, 200).trim() + (utterance.content.length > 200 ? '...' : '');
        uncertainties.push(excerpt);
      }
    }

    // Deduplicate and limit to top 10
    return [...new Set(uncertainties)].slice(0, 10);
  }

  /**
   * Build moderator synthesis from synthesis phase utterances
   */
  private buildModeratorSynthesis(utterances: Utterance[]): ModeratorSynthesis {
    // Find synthesis phase utterance
    const synthesis = utterances.find((u) => u.phase === 'synthesis');

    if (synthesis) {
      // Try to parse as structured JSON
      try {
        const parsed = JSON.parse(synthesis.content);
        if (this.isValidModeratorSynthesis(parsed)) {
          return parsed;
        }
      } catch {
        // Not JSON, continue to fallback
      }
    }

    // Fallback: return empty structure
    return {
      areas_of_agreement: [],
      core_disagreements: [],
      assumption_conflicts: [],
      evidence_gaps: [],
      decision_hinges: [],
    };
  }

  /**
   * Type guard for moderator synthesis
   */
  private isValidModeratorSynthesis(obj: unknown): obj is ModeratorSynthesis {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const synthesis = obj as Record<string, unknown>;

    return (
      Array.isArray(synthesis.areas_of_agreement) &&
      Array.isArray(synthesis.core_disagreements) &&
      Array.isArray(synthesis.assumption_conflicts) &&
      Array.isArray(synthesis.evidence_gaps) &&
      Array.isArray(synthesis.decision_hinges)
    );
  }
}

/**
 * Create a new TranscriptRecorder instance
 */
export function createTranscriptRecorder(schemaValidator: SchemaValidator): TranscriptRecorder {
  return new TranscriptRecorder(schemaValidator);
}
