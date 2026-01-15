/**
 * Persona Memory Service
 *
 * Handles extraction and processing of personality memory from podcast conversations:
 * - Real-time extraction of opinions from utterances (Haiku-based)
 * - Post-session batch processing to update opinion records
 * - Relationship scoring based on agreements/disagreements
 *
 * @module services/persona-memory-service
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import {
  PersonaMemoryRepository,
  createPersonaMemoryRepository,
} from '../db/repositories/persona-memory-repository.js';
import {
  createOpenRouterClient,
  isOpenRouterAvailable,
  type OpenRouterLLMClient,
} from './llm/openrouter-adapter.js';
import type {
  MemoryExtractionResult,
  ExtractedTopic,
  OpinionStance,
  PersonaOpinion,
  PersonaMemoryConfig,
  EvolveOpinionInput,
} from '../types/persona-memory.js';

// Default model for memory extraction (fast and cheap)
const EXTRACTION_MODEL = 'anthropic/claude-haiku-4.5';

// ============================================================================
// Types
// ============================================================================

/** Input for processing a single utterance */
export interface ProcessUtteranceInput {
  personaId: string;
  personaName: string;
  content: string;
  sessionTopic: string;
  sessionId: string;
}

/** Accumulated extraction data for a session */
export interface SessionExtractions {
  personaId: string;
  personaName: string;
  extractions: ExtractedTopic[];
  sessionId: string;
}

/** Input for post-session processing */
export interface PostSessionInput {
  sessionId: string;
  sessionTopic: string;
  participantExtractions: Map<string, SessionExtractions>;
  agreementPairs: Array<{ personaId1: string; personaId2: string }>;
  disagreementPairs: Array<{ personaId1: string; personaId2: string }>;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class PersonaMemoryService {
  private llmClient: OpenRouterLLMClient | null;
  private repository: PersonaMemoryRepository;
  private config: PersonaMemoryConfig | null = null;
  private configLoadedAt: Date | null = null;
  private readonly CONFIG_CACHE_TTL = 60000; // 1 minute

  constructor(pool: Pool) {
    // Use OpenRouter for LLM calls (same as rest of the app)
    this.llmClient = isOpenRouterAvailable()
      ? createOpenRouterClient(EXTRACTION_MODEL)
      : null;

    if (!this.llmClient) {
      logger.warn('OpenRouter not available - memory extraction will be disabled');
    }

    this.repository = createPersonaMemoryRepository(pool);
  }

  // =========================================================================
  // CONFIGURATION
  // =========================================================================

  /**
   * Get memory configuration (cached for performance)
   */
  private async getConfig(): Promise<PersonaMemoryConfig> {
    const now = new Date();
    if (
      this.config &&
      this.configLoadedAt &&
      now.getTime() - this.configLoadedAt.getTime() < this.CONFIG_CACHE_TTL
    ) {
      return this.config;
    }

    this.config = await this.repository.getConfig();
    this.configLoadedAt = now;
    return this.config;
  }

  /**
   * Check if extraction is enabled
   */
  async isExtractionEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.extractionEnabled;
  }

  // =========================================================================
  // REAL-TIME EXTRACTION
  // =========================================================================

  /**
   * Extract opinion data from a single utterance
   *
   * Uses Claude Haiku for fast, cheap extraction during conversation.
   * Returns structured topic/stance data for later batch processing.
   */
  async extractFromUtterance(input: ProcessUtteranceInput): Promise<MemoryExtractionResult> {
    // Skip if OpenRouter not available
    if (!this.llmClient) {
      return { isSubstantive: false, topics: [] };
    }

    const config = await this.getConfig();

    if (!config.extractionEnabled) {
      return { isSubstantive: false, topics: [] };
    }

    const prompt = `Analyze this podcast statement and extract opinion/stance information.

SPEAKER: ${input.personaName}
STATEMENT: "${input.content}"
DISCUSSION TOPIC: ${input.sessionTopic}

Extract the following as JSON:
{
  "isSubstantive": boolean,  // Does this express a meaningful opinion or position?
  "topics": [
    {
      "topicKey": "snake_case_topic",  // e.g., "ai_regulation", "climate_policy"
      "topicDisplay": "Human Readable Topic",
      "stance": "supports|opposes|neutral|mixed|evolving",
      "stanceStrength": 0.0-1.0,  // How strongly they hold this view
      "keyArgument": "Main point they made"  // Optional, only if clearly stated
    }
  ],
  "emotionalUndertone": "passionate|measured|skeptical|dismissive|curious"  // Optional
}

Guidelines:
- isSubstantive: False for greetings, filler, simple acknowledgments, questions without opinion
- topicKey: Normalize to snake_case, be consistent (e.g., "artificial_intelligence" not "ai")
- stance: What position do they take? "evolving" if they're exploring/uncertain
- stanceStrength: 0.3=mild preference, 0.5=moderate, 0.7=strong, 0.9=emphatic
- keyArgument: Only include if they make a clear argument, not just state position

Return ONLY valid JSON, no other text.`;

    try {
      // Use OpenRouter client (same as rest of the app)
      const responseText = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.2, maxTokens: 500 }
      );

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn({ response: responseText }, 'No JSON found in extraction response');
        return { isSubstantive: false, topics: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize topics
      const topics: ExtractedTopic[] = (parsed.topics || [])
        .filter((t: unknown): t is Record<string, unknown> =>
          typeof t === 'object' && t !== null && 'topicKey' in t
        )
        .map((t: Record<string, unknown>): ExtractedTopic => ({
          topicKey: this.normalizeTopicKey(String(t.topicKey || '')),
          topicDisplay: String(t.topicDisplay || t.topicKey || ''),
          stance: this.validateStance(t.stance),
          stanceStrength: this.clampStrength(t.stanceStrength),
          keyArgument: typeof t.keyArgument === 'string' ? t.keyArgument : undefined,
        }));

      const result: MemoryExtractionResult = {
        isSubstantive: !!parsed.isSubstantive && topics.length > 0,
        topics,
        emotionalUndertone: typeof parsed.emotionalUndertone === 'string'
          ? parsed.emotionalUndertone
          : undefined,
      };

      logger.debug({
        personaId: input.personaId,
        isSubstantive: result.isSubstantive,
        topicCount: topics.length,
      }, 'Extracted memory data from utterance');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        error: errorMessage,
        errorName: error instanceof Error ? error.name : 'Unknown',
        personaId: input.personaId
      }, 'Failed to extract memory from utterance');
      return { isSubstantive: false, topics: [] };
    }
  }

  // =========================================================================
  // POST-SESSION PROCESSING
  // =========================================================================

  /**
   * Process all accumulated extractions after session completes
   *
   * This is called once at the end of a conversation to:
   * 1. Batch update/create opinion records
   * 2. Track opinion evolution with history
   * 3. Update relationship scores based on agreement patterns
   */
  async processSessionMemory(input: PostSessionInput): Promise<void> {
    const config = await this.getConfig();

    if (!config.autoEvolutionEnabled) {
      logger.info({ sessionId: input.sessionId }, 'Auto-evolution disabled, skipping post-session processing');
      return;
    }

    logger.info({
      sessionId: input.sessionId,
      participantCount: input.participantExtractions.size,
      agreementCount: input.agreementPairs.length,
      disagreementCount: input.disagreementPairs.length,
    }, 'Starting post-session memory processing');

    // Process each participant's extractions
    for (const [personaId, sessionData] of input.participantExtractions) {
      await this.processPersonaExtractions(
        personaId,
        sessionData,
        input.sessionId,
        config.evolutionThreshold
      );
    }

    // Update relationship scores
    await this.updateRelationships(input);

    logger.info({ sessionId: input.sessionId }, 'Post-session memory processing complete');
  }

  /**
   * Process extractions for a single persona
   */
  private async processPersonaExtractions(
    personaId: string,
    sessionData: SessionExtractions,
    sessionId: string,
    evolutionThreshold: number
  ): Promise<void> {
    // Aggregate extractions by topic
    const topicAggregates = this.aggregateByTopic(sessionData.extractions);

    for (const [topicKey, aggregate] of topicAggregates) {
      try {
        // Check for existing opinion
        const existingOpinion = await this.repository.getOpinionByTopic(personaId, topicKey);

        if (existingOpinion) {
          // Update existing opinion
          await this.updateExistingOpinion(
            existingOpinion,
            aggregate,
            sessionId,
            evolutionThreshold
          );
        } else {
          // Create new opinion
          await this.createNewOpinion(personaId, topicKey, aggregate, sessionId);
        }
      } catch (error) {
        logger.error({
          error,
          personaId,
          topicKey,
        }, 'Failed to process opinion extraction');
      }
    }
  }

  /**
   * Aggregate multiple extractions for the same topic
   */
  private aggregateByTopic(
    extractions: ExtractedTopic[]
  ): Map<string, AggregatedExtraction> {
    const aggregates = new Map<string, AggregatedExtraction>();

    for (const extraction of extractions) {
      const existing = aggregates.get(extraction.topicKey);

      if (existing) {
        // Merge: take strongest stance, accumulate arguments
        existing.stanceStrengths.push(extraction.stanceStrength);
        if (extraction.keyArgument) {
          existing.keyArguments.push(extraction.keyArgument);
        }
        // Update stance if this one is stronger
        if (extraction.stanceStrength > existing.dominantStrength) {
          existing.dominantStance = extraction.stance;
          existing.dominantStrength = extraction.stanceStrength;
        }
        existing.topicDisplay = extraction.topicDisplay;
        existing.count++;
      } else {
        aggregates.set(extraction.topicKey, {
          topicKey: extraction.topicKey,
          topicDisplay: extraction.topicDisplay,
          dominantStance: extraction.stance,
          dominantStrength: extraction.stanceStrength,
          stanceStrengths: [extraction.stanceStrength],
          keyArguments: extraction.keyArgument ? [extraction.keyArgument] : [],
          count: 1,
        });
      }
    }

    return aggregates;
  }

  /**
   * Update an existing opinion with new extraction data
   */
  private async updateExistingOpinion(
    existing: PersonaOpinion,
    aggregate: AggregatedExtraction,
    sessionId: string,
    evolutionThreshold: number
  ): Promise<void> {
    // Check if opinion can evolve
    if (!existing.canEvolve) {
      logger.debug({
        opinionId: existing.id,
        topicKey: existing.topicKey,
      }, 'Opinion is locked, skipping evolution');

      // Still update discussion metadata
      await this.repository.updateOpinion(existing.id, {
        // Don't change stance, just track discussion
      });
      // Increment discussion count via raw query would be better, but this works
      return;
    }

    // Calculate average strength from session
    const avgStrength =
      aggregate.stanceStrengths.reduce((a, b) => a + b, 0) / aggregate.stanceStrengths.length;

    // Check if stance should evolve
    const stanceChanged = aggregate.dominantStance !== existing.stance;
    const strengthSignificant = avgStrength >= evolutionThreshold;

    if (stanceChanged && strengthSignificant) {
      // Evolve the opinion
      const evolveInput: EvolveOpinionInput = {
        newStance: aggregate.dominantStance,
        newStrength: aggregate.dominantStrength,
        reason: aggregate.keyArguments.length > 0
          ? `Session discussion: ${aggregate.keyArguments[0]}`
          : 'Stance shifted during discussion',
        sessionId,
      };

      await this.repository.evolveOpinion(existing.id, evolveInput);

      logger.info({
        opinionId: existing.id,
        topicKey: existing.topicKey,
        oldStance: existing.stance,
        newStance: aggregate.dominantStance,
      }, 'Opinion evolved based on session discussion');
    } else {
      // Update without evolving stance
      const newKeyArgs = [...new Set([...existing.keyArguments, ...aggregate.keyArguments])].slice(0, 5);

      await this.repository.updateOpinion(existing.id, {
        stanceStrength: Math.max(existing.stanceStrength, avgStrength),
        keyArguments: newKeyArgs,
      });
    }
  }

  /**
   * Create a new opinion from extraction data
   */
  private async createNewOpinion(
    personaId: string,
    topicKey: string,
    aggregate: AggregatedExtraction,
    _sessionId: string
  ): Promise<void> {
    const firstArg = aggregate.keyArguments[0];
    await this.repository.createOpinion({
      personaId,
      topicKey,
      topicDisplay: aggregate.topicDisplay,
      stance: aggregate.dominantStance,
      stanceStrength: aggregate.dominantStrength,
      summary: firstArg || 'Position expressed during discussion',
      keyArguments: aggregate.keyArguments.slice(0, 5),
      canEvolve: true,
      adminCurated: false,
    });

    logger.info({
      personaId,
      topicKey,
      stance: aggregate.dominantStance,
    }, 'Created new opinion from session extraction');
  }

  /**
   * Update relationship scores based on session agreements/disagreements
   */
  private async updateRelationships(input: PostSessionInput): Promise<void> {
    // Track net agreement/disagreement per pair
    const pairScores = new Map<string, number>();

    for (const { personaId1, personaId2 } of input.agreementPairs) {
      const key = this.pairKey(personaId1, personaId2);
      pairScores.set(key, (pairScores.get(key) || 0) + 0.02); // Small positive bump
    }

    for (const { personaId1, personaId2 } of input.disagreementPairs) {
      const key = this.pairKey(personaId1, personaId2);
      pairScores.set(key, (pairScores.get(key) || 0) - 0.01); // Smaller negative bump
    }

    // Apply score changes
    for (const [key, delta] of pairScores) {
      const parts = key.split('|');
      const id1 = parts[0];
      const id2 = parts[1];

      if (!id1 || !id2) continue;

      try {
        // Get or create relationship in both directions
        const rel1 = await this.repository.getRelationship(id1, id2);
        const rel2 = await this.repository.getRelationship(id2, id1);

        if (rel1) {
          const newScore = Math.max(0, Math.min(1, rel1.rapportScore + delta));
          await this.repository.updateRelationship(rel1.id, { rapportScore: newScore });
        }

        if (rel2) {
          const newScore = Math.max(0, Math.min(1, rel2.rapportScore + delta));
          await this.repository.updateRelationship(rel2.id, { rapportScore: newScore });
        }
      } catch (error) {
        logger.warn({ error, id1, id2 }, 'Failed to update relationship score');
      }
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Normalize topic key to snake_case
   */
  private normalizeTopicKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 100);
  }

  /**
   * Validate and normalize stance value
   */
  private validateStance(value: unknown): OpinionStance {
    const validStances: OpinionStance[] = ['supports', 'opposes', 'neutral', 'mixed', 'evolving'];
    if (typeof value === 'string' && validStances.includes(value as OpinionStance)) {
      return value as OpinionStance;
    }
    return 'neutral';
  }

  /**
   * Clamp strength to valid range
   */
  private clampStrength(value: unknown): number {
    if (typeof value !== 'number') return 0.5;
    return Math.max(0, Math.min(1, value));
  }

  /**
   * Create consistent pair key for relationship tracking
   */
  private pairKey(id1: string, id2: string): string {
    return [id1, id2].sort().join('|');
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface AggregatedExtraction {
  topicKey: string;
  topicDisplay: string;
  dominantStance: OpinionStance;
  dominantStrength: number;
  stanceStrengths: number[];
  keyArguments: string[];
  count: number;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a PersonaMemoryService instance
 */
export function createPersonaMemoryService(pool: Pool): PersonaMemoryService {
  return new PersonaMemoryService(pool);
}
