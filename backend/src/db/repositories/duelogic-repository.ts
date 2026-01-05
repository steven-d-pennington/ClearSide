/**
 * Duelogic Mode Repository
 * Database operations for Duelogic debates: chairs, evaluations, and interruptions
 */

import { pool } from '../connection.js';
import type {
  DuelogicChair,
  DuelogicConfig,
  ResponseEvaluation,
  ChairInterruptCandidate,
  ChairInterruptReason,
  PhilosophicalChair,
  QualityLevel,
  HonestyScore,
} from '../../types/duelogic.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ module: 'duelogic-repository' });

// ============================================================================
// Chair Assignments
// ============================================================================

/**
 * Save a chair assignment for a Duelogic debate
 */
export async function saveChairAssignment(
  debateId: string,
  chair: DuelogicChair
): Promise<void> {
  await pool.query(
    `INSERT INTO debate_chairs (
      debate_id, chair_position, framework, model_id, model_display_name, provider_name, persona
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (debate_id, chair_position)
    DO UPDATE SET
      framework = EXCLUDED.framework,
      model_id = EXCLUDED.model_id,
      model_display_name = EXCLUDED.model_display_name,
      provider_name = EXCLUDED.provider_name,
      persona = EXCLUDED.persona`,
    [
      debateId,
      chair.position,
      chair.framework,
      chair.modelId,
      chair.modelDisplayName || null,
      chair.providerName || null,
      chair.persona || null,
    ]
  );

  logger.debug({ debateId, chair: chair.position }, 'Saved chair assignment');
}

/**
 * Save all chair assignments for a debate
 */
export async function saveAllChairAssignments(
  debateId: string,
  chairs: DuelogicChair[]
): Promise<void> {
  for (const chair of chairs) {
    await saveChairAssignment(debateId, chair);
  }
  logger.info({ debateId, chairCount: chairs.length }, 'Saved all chair assignments');
}

/**
 * Get chair assignments for a debate
 */
export async function getChairAssignments(
  debateId: string
): Promise<DuelogicChair[]> {
  const result = await pool.query(
    `SELECT
      chair_position as position,
      framework,
      model_id as "modelId",
      model_display_name as "modelDisplayName",
      provider_name as "providerName",
      persona
    FROM debate_chairs
    WHERE debate_id = $1
    ORDER BY chair_position`,
    [debateId]
  );

  return result.rows.map(row => ({
    position: row.position,
    framework: row.framework as PhilosophicalChair,
    modelId: row.modelId,
    modelDisplayName: row.modelDisplayName || undefined,
    providerName: row.providerName || undefined,
    persona: row.persona || undefined,
  }));
}

/**
 * Get a specific chair by position
 */
export async function getChairByPosition(
  debateId: string,
  position: string
): Promise<DuelogicChair | null> {
  const result = await pool.query(
    `SELECT
      chair_position as position,
      framework,
      model_id as "modelId",
      model_display_name as "modelDisplayName",
      provider_name as "providerName",
      persona
    FROM debate_chairs
    WHERE debate_id = $1 AND chair_position = $2`,
    [debateId, position]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    position: row.position,
    framework: row.framework as PhilosophicalChair,
    modelId: row.modelId,
    modelDisplayName: row.modelDisplayName || undefined,
    providerName: row.providerName || undefined,
    persona: row.persona || undefined,
  };
}

// ============================================================================
// Response Evaluations
// ============================================================================

/**
 * Save a response evaluation
 */
export async function saveResponseEvaluation(
  utteranceId: number,
  evaluation: ResponseEvaluation
): Promise<number> {
  const result = await pool.query(
    `INSERT INTO response_evaluations (
      utterance_id,
      adherence_score,
      steel_manning_attempted,
      steel_manning_quality,
      steel_manning_notes,
      self_critique_attempted,
      self_critique_quality,
      self_critique_notes,
      framework_consistent,
      framework_violations,
      intellectual_honesty_score,
      intellectual_honesty_issues,
      requires_interjection,
      interjection_reason,
      evaluation_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id`,
    [
      utteranceId,
      evaluation.adherenceScore,
      evaluation.steelManning.attempted,
      evaluation.steelManning.quality,
      evaluation.steelManning.notes || null,
      evaluation.selfCritique.attempted,
      evaluation.selfCritique.quality,
      evaluation.selfCritique.notes || null,
      evaluation.frameworkConsistency.consistent,
      evaluation.frameworkConsistency.violations || null,
      evaluation.intellectualHonesty.score,
      evaluation.intellectualHonesty.issues || null,
      evaluation.requiresInterjection,
      evaluation.interjectionReason || null,
      JSON.stringify(evaluation),
    ]
  );

  logger.debug({ utteranceId, score: evaluation.adherenceScore }, 'Saved response evaluation');
  return result.rows[0].id;
}

/**
 * Get evaluation for an utterance
 */
export async function getEvaluationByUtteranceId(
  utteranceId: number
): Promise<ResponseEvaluation | null> {
  const result = await pool.query(
    `SELECT * FROM response_evaluations WHERE utterance_id = $1`,
    [utteranceId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToEvaluation(result.rows[0]);
}

/**
 * Get all evaluations for a debate
 */
export async function getEvaluationsForDebate(
  debateId: string
): Promise<Array<{ utteranceId: number; speaker: string; evaluation: ResponseEvaluation }>> {
  const result = await pool.query(
    `SELECT re.*, u.speaker
    FROM response_evaluations re
    JOIN utterances u ON re.utterance_id = u.id
    WHERE u.debate_id = $1
    ORDER BY u.timestamp_ms`,
    [debateId]
  );

  return result.rows.map(row => ({
    utteranceId: row.utterance_id,
    speaker: row.speaker,
    evaluation: mapRowToEvaluation(row),
  }));
}

/**
 * Get evaluations grouped by chair position
 */
export async function getEvaluationsByChair(
  debateId: string
): Promise<Map<string, ResponseEvaluation[]>> {
  const result = await pool.query(
    `SELECT re.*, u.speaker
    FROM response_evaluations re
    JOIN utterances u ON re.utterance_id = u.id
    WHERE u.debate_id = $1
    ORDER BY u.speaker, u.timestamp_ms`,
    [debateId]
  );

  const byChair = new Map<string, ResponseEvaluation[]>();

  for (const row of result.rows) {
    const speaker = row.speaker;
    if (!byChair.has(speaker)) {
      byChair.set(speaker, []);
    }
    byChair.get(speaker)!.push(mapRowToEvaluation(row));
  }

  return byChair;
}

/**
 * Calculate average adherence score for a chair
 */
export async function getChairAverageAdherence(
  debateId: string,
  chairPosition: string
): Promise<number | null> {
  const result = await pool.query(
    `SELECT AVG(re.adherence_score)::INTEGER as avg_score
    FROM response_evaluations re
    JOIN utterances u ON re.utterance_id = u.id
    WHERE u.debate_id = $1 AND u.speaker = $2`,
    [debateId, chairPosition]
  );

  return result.rows[0]?.avg_score || null;
}

// ============================================================================
// Chair Interruptions
// ============================================================================

/**
 * Save a chair interruption
 */
export async function saveChairInterruption(
  debateId: string,
  interrupt: ChairInterruptCandidate,
  timestampMs: number,
  interruptionContent?: string
): Promise<number> {
  const result = await pool.query(
    `INSERT INTO chair_interruptions (
      debate_id,
      interrupting_chair,
      interrupted_chair,
      trigger_reason,
      trigger_content,
      urgency,
      timestamp_ms,
      interruption_content
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      debateId,
      interrupt.interruptingChair.position,
      interrupt.interruptedChair.position,
      interrupt.triggerReason,
      interrupt.triggerContent,
      interrupt.urgency,
      timestampMs,
      interruptionContent || null,
    ]
  );

  logger.info({
    debateId,
    interrupter: interrupt.interruptingChair.position,
    interrupted: interrupt.interruptedChair.position,
    reason: interrupt.triggerReason,
  }, 'Saved chair interruption');

  return result.rows[0].id;
}

/**
 * Mark an interruption as having received a response
 */
export async function markInterruptionResponded(
  interruptionId: number
): Promise<void> {
  await pool.query(
    `UPDATE chair_interruptions SET response_given = TRUE WHERE id = $1`,
    [interruptionId]
  );
}

/**
 * Get all interruptions for a debate
 */
export async function getInterruptionsByDebate(
  debateId: string
): Promise<Array<{
  id: number;
  interruptingChair: string;
  interruptedChair: string;
  triggerReason: ChairInterruptReason;
  triggerContent: string | null;
  urgency: number | null;
  timestampMs: number;
  interruptionContent: string | null;
  responseGiven: boolean;
  createdAt: Date;
}>> {
  const result = await pool.query(
    `SELECT
      id,
      interrupting_chair,
      interrupted_chair,
      trigger_reason,
      trigger_content,
      urgency,
      timestamp_ms,
      interruption_content,
      response_given,
      created_at
    FROM chair_interruptions
    WHERE debate_id = $1
    ORDER BY timestamp_ms`,
    [debateId]
  );

  return result.rows.map(row => ({
    id: row.id,
    interruptingChair: row.interrupting_chair,
    interruptedChair: row.interrupted_chair,
    triggerReason: row.trigger_reason as ChairInterruptReason,
    triggerContent: row.trigger_content,
    urgency: row.urgency ? parseFloat(row.urgency) : null,
    timestampMs: row.timestamp_ms,
    interruptionContent: row.interruption_content,
    responseGiven: row.response_given,
    createdAt: row.created_at,
  }));
}

/**
 * Get interruption count by reason
 */
export async function getInterruptionCountsByReason(
  debateId: string
): Promise<Map<ChairInterruptReason, number>> {
  const result = await pool.query(
    `SELECT trigger_reason, COUNT(*) as count
    FROM chair_interruptions
    WHERE debate_id = $1
    GROUP BY trigger_reason`,
    [debateId]
  );

  const counts = new Map<ChairInterruptReason, number>();
  for (const row of result.rows) {
    counts.set(row.trigger_reason as ChairInterruptReason, parseInt(row.count));
  }
  return counts;
}

/**
 * Get interruption count by chair
 */
export async function getInterruptionCountsByChair(
  debateId: string
): Promise<{
  made: Map<string, number>;
  received: Map<string, number>;
}> {
  const madeResult = await pool.query(
    `SELECT interrupting_chair, COUNT(*) as count
    FROM chair_interruptions
    WHERE debate_id = $1
    GROUP BY interrupting_chair`,
    [debateId]
  );

  const receivedResult = await pool.query(
    `SELECT interrupted_chair, COUNT(*) as count
    FROM chair_interruptions
    WHERE debate_id = $1
    GROUP BY interrupted_chair`,
    [debateId]
  );

  const made = new Map<string, number>();
  for (const row of madeResult.rows) {
    made.set(row.interrupting_chair, parseInt(row.count));
  }

  const received = new Map<string, number>();
  for (const row of receivedResult.rows) {
    received.set(row.interrupted_chair, parseInt(row.count));
  }

  return { made, received };
}

// ============================================================================
// Duelogic Config Storage
// ============================================================================

/**
 * Save Duelogic config to debate record
 */
export async function saveDuelogicConfig(
  debateId: string,
  config: DuelogicConfig
): Promise<void> {
  await pool.query(
    `UPDATE debates
    SET debate_mode = 'duelogic', duelogic_config = $2
    WHERE id = $1`,
    [debateId, JSON.stringify(config)]
  );
  logger.debug({ debateId }, 'Saved Duelogic config');
}

/**
 * Get Duelogic config from debate record
 */
export async function getDuelogicConfig(
  debateId: string
): Promise<DuelogicConfig | null> {
  const result = await pool.query(
    `SELECT duelogic_config FROM debates WHERE id = $1 AND debate_mode = 'duelogic'`,
    [debateId]
  );

  if (result.rows.length === 0 || !result.rows[0].duelogic_config) {
    return null;
  }

  return result.rows[0].duelogic_config as DuelogicConfig;
}

// ============================================================================
// Aggregate Queries
// ============================================================================

/**
 * Get full debate statistics for a Duelogic debate
 */
export async function getDuelogicDebateStats(debateId: string): Promise<{
  chairCount: number;
  utteranceCount: number;
  interruptionCount: number;
  averageAdherence: number | null;
  steelManningRate: number | null;
  selfCritiqueRate: number | null;
}> {
  const result = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM debate_chairs WHERE debate_id = $1) as chair_count,
      (SELECT COUNT(*) FROM utterances WHERE debate_id = $1) as utterance_count,
      (SELECT COUNT(*) FROM chair_interruptions WHERE debate_id = $1) as interruption_count,
      (
        SELECT AVG(adherence_score)::INTEGER
        FROM response_evaluations re
        JOIN utterances u ON re.utterance_id = u.id
        WHERE u.debate_id = $1
      ) as avg_adherence,
      (
        SELECT COUNT(CASE WHEN steel_manning_attempted THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) * 100
        FROM response_evaluations re
        JOIN utterances u ON re.utterance_id = u.id
        WHERE u.debate_id = $1
      ) as steel_manning_rate,
      (
        SELECT COUNT(CASE WHEN self_critique_attempted THEN 1 END)::FLOAT / NULLIF(COUNT(*), 0) * 100
        FROM response_evaluations re
        JOIN utterances u ON re.utterance_id = u.id
        WHERE u.debate_id = $1
      ) as self_critique_rate`,
    [debateId]
  );

  const row = result.rows[0];
  return {
    chairCount: parseInt(row.chair_count) || 0,
    utteranceCount: parseInt(row.utterance_count) || 0,
    interruptionCount: parseInt(row.interruption_count) || 0,
    averageAdherence: row.avg_adherence ? parseInt(row.avg_adherence) : null,
    steelManningRate: row.steel_manning_rate ? parseFloat(row.steel_manning_rate) : null,
    selfCritiqueRate: row.self_critique_rate ? parseFloat(row.self_critique_rate) : null,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapRowToEvaluation(row: any): ResponseEvaluation {
  return {
    adherenceScore: row.adherence_score,
    steelManning: {
      attempted: row.steel_manning_attempted,
      quality: row.steel_manning_quality as QualityLevel,
      notes: row.steel_manning_notes || undefined,
    },
    selfCritique: {
      attempted: row.self_critique_attempted,
      quality: row.self_critique_quality as QualityLevel,
      notes: row.self_critique_notes || undefined,
    },
    frameworkConsistency: {
      consistent: row.framework_consistent,
      violations: row.framework_violations || undefined,
    },
    intellectualHonesty: {
      score: row.intellectual_honesty_score as HonestyScore,
      issues: row.intellectual_honesty_issues || undefined,
    },
    requiresInterjection: row.requires_interjection,
    interjectionReason: row.interjection_reason || undefined,
  };
}
