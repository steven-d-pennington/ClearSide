/**
 * Reaction Inserter Service
 *
 * Analyzes podcast segments to identify optimal insertion points
 * for reaction audio clips (cross-talk). Creates a timeline of
 * where reactions should be placed to sound natural.
 */

import pino from 'pino';
import type { PodcastSegment } from '../../types/podcast-export.js';
import type {
  ReactionInsertionPoint,
  ReactionMixInstruction,
  ReactionInsertionConfig,
} from '../../types/reactions.js';
import { DEFAULT_REACTION_CONFIG as DEFAULT_CONFIG } from '../../types/reactions.js';
import type { ReactionLibrary } from './reaction-library.js';

const logger = pino({
  name: 'reaction-inserter',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Patterns that suggest a strong statement worth reacting to (agreement category)
 */
const STRONG_STATEMENT_PATTERNS = [
  // Definitive statements
  /\bis\s+(?:clearly|obviously|definitely|certainly|absolutely)\b/i,
  /\bthe\s+(?:key|critical|essential|fundamental)\s+(?:point|issue|thing)\b/i,
  /\bthat's\s+(?:exactly|precisely)\b/i,
  /\bno\s+(?:doubt|question)\b/i,

  // Statistics and evidence
  /\b\d+\s*%/,  // Percentages
  /\bstudies\s+(?:show|indicate|suggest)\b/i,
  /\bdata\s+(?:shows|indicates|suggests)\b/i,
  /\baccording\s+to\b/i,

  // Strong opinions
  /\bi\s+(?:firmly|strongly)\s+believe\b/i,
  /\bthe\s+(?:real|actual)\s+(?:problem|issue)\b/i,
  /\bhere's\s+(?:the\s+)?(?:thing|deal)\b/i,

  // Agreements/Disagreements
  /\bi\s+(?:completely|totally)\s+agree\b/i,
  /\bthat's\s+(?:a\s+)?(?:great|excellent|good)\s+point\b/i,
];

/**
 * Patterns that suggest a rhetorical question (interest category)
 */
const QUESTION_PATTERNS = [
  /\?$/,  // Ends with question mark
  /\bisn't\s+(?:it|that)\b.*\?/i,
  /\bdon't\s+you\s+(?:think|agree)\b/i,
  /\bwhat\s+(?:if|about)\b/i,
  /\bhow\s+(?:can|could|would)\b/i,
];

/**
 * Patterns that suggest a controversial/debatable claim (challenge or skepticism category)
 */
const CONTROVERSIAL_PATTERNS = [
  /\bsome\s+(?:people|experts)\s+(?:say|think|believe|argue)\b/i,
  /\bcontroversial\b/i,
  /\bdebatable\b/i,
  /\bthe\s+(?:problem|issue)\s+(?:is|with)\b/i,
  /\bi\s+(?:would|might)\s+(?:push\s+back|disagree|argue)\b/i,
  /\bbut\s+(?:here's|that's)\s+(?:the|where)\b/i,
  /\bthat's\s+(?:a\s+)?(?:big|bold|strong)\s+claim\b/i,
  /\bnot\s+(?:necessarily|always|everyone)\b/i,
  /\bactually,?\s+(?:i\s+think|that's\s+not)\b/i,
  /\bwait,?\s+(?:but|no|hold)\b/i,
];

/**
 * Patterns that suggest surprising/unexpected information (surprise category)
 */
const SURPRISE_PATTERNS = [
  /\b(?:surprisingly|shockingly|remarkably|incredibly)\b/i,
  /\bmost\s+people\s+don't\s+(?:know|realize)\b/i,
  /\bwhat's\s+(?:really|actually)\s+(?:interesting|surprising)\b/i,
  /\bget\s+this\b/i,
  /\bhere's\s+the\s+(?:crazy|wild|surprising)\s+(?:thing|part)\b/i,
  /\byou\s+won't\s+believe\b/i,
  /\bturns\s+out\b/i,
  /\bplot\s+twist\b/i,
];

/**
 * Patterns that suggest humor/amusement (amusement category)
 */
const AMUSEMENT_PATTERNS = [
  /\bhaha\b/i,
  /\blol\b/i,
  /\bjust\s+kidding\b/i,
  /\bi'm\s+joking\b/i,
  /\bthat's\s+(?:hilarious|funny)\b/i,
  /\bironic(?:ally)?\b/i,
  /\bthe\s+irony\b/i,
];

/**
 * Reaction Inserter Service
 *
 * Analyzes podcast segments and determines where to insert
 * reaction audio for natural-sounding cross-talk.
 */
export class ReactionInserter {
  private readonly config: ReactionInsertionConfig;

  constructor(config: Partial<ReactionInsertionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    logger.info({
      reactionsPerMinute: this.config.reactionsPerMinute,
      minimumGapMs: this.config.minimumGapMs,
    }, 'Reaction inserter initialized');
  }

  /**
   * Analyze segments and identify insertion points for reactions
   *
   * @param segments - Podcast segments with timing info
   * @param segmentDurationsMs - Duration of each segment in milliseconds
   * @returns List of insertion points
   */
  identifyInsertionPoints(
    segments: PodcastSegment[],
    segmentDurationsMs: number[]
  ): ReactionInsertionPoint[] {
    if (!this.config.enabled || segments.length === 0) {
      return [];
    }

    // Calculate total duration and target reaction count
    const totalDurationMs = segmentDurationsMs.reduce((sum, d) => sum + d, 0);
    const totalDurationMinutes = totalDurationMs / 60000;
    const targetReactionCount = Math.round(totalDurationMinutes * this.config.reactionsPerMinute);

    logger.debug({
      totalDurationMs,
      totalDurationMinutes,
      targetReactionCount,
    }, 'Calculating insertion points');

    // Build cumulative timing map
    const segmentStartTimes: number[] = [];
    let cumulative = 0;
    for (const duration of segmentDurationsMs) {
      segmentStartTimes.push(cumulative);
      cumulative += duration;
    }

    // Find candidate insertion points based on content analysis
    const candidates: ReactionInsertionPoint[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      const segmentStart = segmentStartTimes[i] || 0;
      const segmentDuration = segmentDurationsMs[i] || 0;

      // Analyze the segment text for reaction-worthy moments
      const analysis = this.analyzeSegment(segment, segmentStart, segmentDuration, i);
      candidates.push(...analysis);
    }

    // Sort by potential value and select best candidates
    // Spread them evenly across the podcast
    const selected = this.selectInsertionPoints(
      candidates,
      targetReactionCount,
      totalDurationMs
    );

    logger.info({
      candidateCount: candidates.length,
      selectedCount: selected.length,
      targetCount: targetReactionCount,
    }, 'Insertion points identified');

    return selected;
  }

  /**
   * Analyze a single segment for potential reaction points
   */
  private analyzeSegment(
    segment: PodcastSegment,
    segmentStartMs: number,
    segmentDurationMs: number,
    segmentIndex: number
  ): ReactionInsertionPoint[] {
    const points: ReactionInsertionPoint[] = [];
    const text = segment.text;

    // Split into sentences for more granular analysis
    const sentences = text.split(/(?<=[.!?])\s+/);
    const avgSentenceMs = segmentDurationMs / Math.max(sentences.length, 1);

    let sentenceOffsetMs = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      if (!sentence) continue;

      // Estimate when this sentence ends
      const sentenceEndMs = segmentStartMs + sentenceOffsetMs + avgSentenceMs;

      // Check for humor/amusement (highest priority - should get laughs)
      const isAmusing = AMUSEMENT_PATTERNS.some(p => p.test(sentence));
      if (isAmusing) {
        points.push({
          insertAtMs: sentenceEndMs - 100,
          triggerType: 'strong_statement',
          duringSegmentIndex: segmentIndex,
          suggestedCategory: 'amusement',
          excludeVoiceIds: [segment.voiceId],
          contextSnippet: sentence.substring(0, 50),
        });
        sentenceOffsetMs += avgSentenceMs;
        continue; // Don't double-tag the same sentence
      }

      // Check for surprising information
      const isSurprising = SURPRISE_PATTERNS.some(p => p.test(sentence));
      if (isSurprising) {
        points.push({
          insertAtMs: sentenceEndMs - 150,
          triggerType: 'strong_statement',
          duringSegmentIndex: segmentIndex,
          suggestedCategory: 'surprise',
          excludeVoiceIds: [segment.voiceId],
          contextSnippet: sentence.substring(0, 50),
        });
        sentenceOffsetMs += avgSentenceMs;
        continue;
      }

      // Check for controversial/debatable claims (get challenge or skepticism)
      const isControversial = CONTROVERSIAL_PATTERNS.some(p => p.test(sentence));
      if (isControversial) {
        // Randomly choose between challenge and skepticism for variety
        const category = Math.random() > 0.5 ? 'challenge' : 'skepticism';
        points.push({
          insertAtMs: sentenceEndMs - 200,
          triggerType: 'strong_statement',
          duringSegmentIndex: segmentIndex,
          suggestedCategory: category,
          excludeVoiceIds: [segment.voiceId],
          contextSnippet: sentence.substring(0, 50),
        });
        sentenceOffsetMs += avgSentenceMs;
        continue;
      }

      // Check for strong statements (agreement)
      const isStrongStatement = STRONG_STATEMENT_PATTERNS.some(p => p.test(sentence));
      if (isStrongStatement) {
        points.push({
          insertAtMs: sentenceEndMs - 200, // Insert near end of statement
          triggerType: 'strong_statement',
          duringSegmentIndex: segmentIndex,
          suggestedCategory: 'agreement',
          excludeVoiceIds: [segment.voiceId],
          contextSnippet: sentence.substring(0, 50),
        });
        sentenceOffsetMs += avgSentenceMs;
        continue;
      }

      // Check for questions (might get "hmm" or "interesting" reactions)
      const isQuestion = QUESTION_PATTERNS.some(p => p.test(sentence));
      if (isQuestion) {
        points.push({
          insertAtMs: sentenceEndMs - 100,
          triggerType: 'question',
          duringSegmentIndex: segmentIndex,
          suggestedCategory: 'interest',
          excludeVoiceIds: [segment.voiceId],
          contextSnippet: sentence.substring(0, 50),
        });
      }

      sentenceOffsetMs += avgSentenceMs;
    }

    // Also add interval-based points for segments without strong content
    // (ensures some reaction coverage even in neutral segments)
    if (points.length === 0 && segmentDurationMs > 5000) {
      // Add a potential point mid-segment with varied categories
      const intervalCategories: Array<'acknowledgment' | 'interest' | 'agreement'> =
        ['acknowledgment', 'interest', 'agreement'];
      const randomCategory = intervalCategories[Math.floor(Math.random() * intervalCategories.length)] || 'acknowledgment';

      points.push({
        insertAtMs: segmentStartMs + segmentDurationMs * 0.6,
        triggerType: 'interval',
        duringSegmentIndex: segmentIndex,
        suggestedCategory: randomCategory,
        excludeVoiceIds: [segment.voiceId],
      });
    }

    return points;
  }

  /**
   * Select the best insertion points from candidates
   * ensuring proper spacing and distribution
   */
  private selectInsertionPoints(
    candidates: ReactionInsertionPoint[],
    targetCount: number,
    totalDurationMs: number
  ): ReactionInsertionPoint[] {
    if (candidates.length === 0 || targetCount === 0) {
      return [];
    }

    // Sort by time
    const sorted = [...candidates].sort((a, b) => a.insertAtMs - b.insertAtMs);

    // Prioritize content-based triggers over interval triggers
    const prioritized = sorted.sort((a, b) => {
      const priorityA = a.triggerType === 'interval' ? 0 : 1;
      const priorityB = b.triggerType === 'interval' ? 0 : 1;
      if (priorityA !== priorityB) return priorityB - priorityA;
      return a.insertAtMs - b.insertAtMs;
    });

    // Select points with minimum gap enforcement
    const selected: ReactionInsertionPoint[] = [];
    let lastInsertTime = -this.config.minimumGapMs; // Allow first reaction immediately

    for (const candidate of prioritized) {
      if (selected.length >= targetCount) break;

      // Check minimum gap
      if (candidate.insertAtMs - lastInsertTime >= this.config.minimumGapMs) {
        // Also ensure we're not too close to the end
        if (candidate.insertAtMs < totalDurationMs - 2000) {
          selected.push(candidate);
          lastInsertTime = candidate.insertAtMs;
        }
      }
    }

    // Re-sort by time for final output
    return selected.sort((a, b) => a.insertAtMs - b.insertAtMs);
  }

  /**
   * Create mix instructions from insertion points using the reaction library
   *
   * @param insertionPoints - Points where reactions should be inserted
   * @param reactionLibrary - Library to get reaction clips from
   * @param availableVoiceIds - Voice IDs that have reactions available
   * @returns Mix instructions ready for audio processing
   */
  async createMixInstructions(
    insertionPoints: ReactionInsertionPoint[],
    reactionLibrary: ReactionLibrary,
    availableVoiceIds: string[]
  ): Promise<ReactionMixInstruction[]> {
    const instructions: ReactionMixInstruction[] = [];

    for (const point of insertionPoints) {
      // Find a voice that's not excluded
      const eligibleVoices = availableVoiceIds.filter(
        v => !point.excludeVoiceIds.includes(v)
      );

      if (eligibleVoices.length === 0) {
        logger.warn({ point }, 'No eligible voices for reaction point');
        continue;
      }

      // Pick a random eligible voice
      const voiceId = eligibleVoices[Math.floor(Math.random() * eligibleVoices.length)];
      if (!voiceId) continue;

      // Get a reaction clip
      const clip = await reactionLibrary.getReaction(voiceId, point.suggestedCategory);
      if (!clip) {
        logger.warn({ voiceId, category: point.suggestedCategory }, 'No reaction clip found');
        continue;
      }

      instructions.push({
        audioPath: clip.audioPath,
        insertAtMs: point.insertAtMs,
        volume: this.config.reactionVolume,
        voiceId: clip.voiceId,
        phrase: clip.phrase.text,
      });
    }

    logger.info({
      requestedPoints: insertionPoints.length,
      createdInstructions: instructions.length,
    }, 'Mix instructions created');

    return instructions;
  }

  /**
   * Get current configuration
   */
  getConfig(): ReactionInsertionConfig {
    return { ...this.config };
  }
}

/**
 * Create a new reaction inserter instance
 */
export function createReactionInserter(
  config?: Partial<ReactionInsertionConfig>
): ReactionInserter {
  return new ReactionInserter(config);
}
