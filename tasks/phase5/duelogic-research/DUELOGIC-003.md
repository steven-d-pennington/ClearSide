# DUELOGIC-003: Episode Generator Service

**Task ID:** DUELOGIC-003
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P0
**Estimated Effort:** L (1-3 days)
**Dependencies:** DUELOGIC-001 (Database Schema), DUELOGIC-002 (Perplexity Integration)
**Status:** Ready

---

## Context

Once the Duelogic Research service discovers topics through Perplexity, the Episode Generator transforms these raw research results into fully-formed episode proposals following the established Duelogic format (as seen in `duelogic-season1-episodes.md`).

The generator uses an LLM (Claude or GPT-4) to craft compelling episode proposals with:
- Provocative titles and subtitles
- Engaging descriptions
- Clear binary propositions
- Two philosophical chairs with positions AND self-critiques
- Key tensions to explore

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Episode Generator
- [duelogic-season1-episodes.md](../../../docs/duelogic-season1-episodes.md) - Episode format reference
- Existing LLM usage patterns in `backend/src/services/`

---

## Requirements

### Acceptance Criteria

- [ ] Create `EpisodeGenerator` class for proposal creation
- [ ] Implement episode prompt template matching Duelogic format
- [ ] Generate philosophical chairs with genuine self-critiques
- [ ] Extract key tensions from research results
- [ ] Validate generated episodes against required structure
- [ ] Score generated proposals for quality
- [ ] Prevent duplicate/similar episodes from being generated
- [ ] Support different LLM models for generation
- [ ] Write unit tests for generator operations

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- Generate episodes matching the exact structure in `duelogic-season1-episodes.md`:
  - Title with provocative subtitle
  - Description (compelling hook)
  - Debate Proposition (clear binary stance)
  - Context for AI Panel
  - Philosophical Chairs (two frameworks with internal challenges)
  - Key Tensions to Explore
- Only propose topics with sufficient depth and genuine controversy
- Avoid regenerating episodes on recently covered topics
- Consider current events (elections, major legislation, anniversaries)

---

## Implementation Guide

### Episode Format Reference

```typescript
// Reference format from duelogic-season1-episodes.md

interface DuelogicEpisode {
  title: string;           // e.g., "The Algorithm's Gavel"
  subtitle: string;        // e.g., "Can Code Be Fairer Than Conscience?"
  description: string;     // 2-3 sentence hook
  proposition: string;     // Clear binary debate proposition
  contextForPanel: string; // Background paragraph for AI debaters

  chairs: [
    {
      name: string;        // e.g., "Utilitarian Chair"
      position: string;    // Main argument
      mustAcknowledge: string; // Required self-critique
    },
    {
      name: string;
      position: string;
      mustAcknowledge: string;
    }
  ];

  keyTensions: string[];   // 4-5 tensions to explore
}
```

### Generator Service Implementation

```typescript
// backend/src/services/research/episode-generator.ts

import { OpenRouterLLMClient } from '../llm/openrouter-client.js';
import { EpisodeProposalRepository } from '../../db/repositories/episode-proposal-repository.js';
import { ResearchResult, EpisodeProposal, PhilosophicalChair } from '../../types/duelogic-research.js';
import { logger } from '../../utils/logger.js';

interface GeneratorConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  similarityThreshold: number; // 0-1, reject if too similar to existing
}

const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  model: 'anthropic/claude-sonnet-4',
  temperature: 0.8,
  maxTokens: 4000,
  similarityThreshold: 0.7,
};

interface GeneratedEpisode {
  title: string;
  subtitle: string;
  description: string;
  proposition: string;
  contextForPanel: string;
  chairs: PhilosophicalChair[];
  keyTensions: string[];
  qualityScore: number;
}

export class EpisodeGenerator {
  private config: GeneratorConfig;

  constructor(
    private llmClient: OpenRouterLLMClient,
    private proposalRepo: EpisodeProposalRepository,
    config?: Partial<GeneratorConfig>
  ) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
  }

  /**
   * Generate episode proposal from research result
   */
  async generateProposal(research: ResearchResult): Promise<EpisodeProposal | null> {
    // Check for existing similar episodes
    const existingProposals = await this.proposalRepo.findByStatus('approved');
    const pendingProposals = await this.proposalRepo.findByStatus('pending');
    const allProposals = [...existingProposals, ...pendingProposals];

    // Skip if too similar to existing
    if (await this.isTooSimilar(research.topic, allProposals)) {
      logger.info(`Skipping topic "${research.topic}" - too similar to existing proposal`);
      return null;
    }

    // Generate the episode
    const generated = await this.callLLMForEpisode(research);

    if (!generated || !this.validateEpisodeStructure(generated)) {
      logger.warn(`Failed to generate valid episode for topic: ${research.topic}`);
      return null;
    }

    // Create the proposal in database
    const proposal = await this.proposalRepo.create({
      researchResultId: research.id,
      status: 'pending',
      title: generated.title,
      subtitle: generated.subtitle,
      description: generated.description,
      proposition: generated.proposition,
      contextForPanel: generated.contextForPanel,
      chairs: generated.chairs,
      keyTensions: generated.keyTensions,
    });

    logger.info(`Generated episode proposal: ${generated.title}`);
    return proposal;
  }

  /**
   * Generate proposals for multiple research results
   */
  async generateProposals(
    results: ResearchResult[],
    maxProposals: number = 10
  ): Promise<EpisodeProposal[]> {
    const proposals: EpisodeProposal[] = [];

    // Sort by quality scores (controversy * depth * timeliness)
    const sorted = [...results].sort((a, b) => {
      const scoreA = a.controversyScore * a.depth * a.timeliness;
      const scoreB = b.controversyScore * b.depth * b.timeliness;
      return scoreB - scoreA;
    });

    for (const result of sorted) {
      if (proposals.length >= maxProposals) break;

      try {
        const proposal = await this.generateProposal(result);
        if (proposal) {
          proposals.push(proposal);
        }
      } catch (error) {
        logger.error(`Failed to generate proposal for ${result.topic}:`, error);
      }
    }

    return proposals;
  }

  /**
   * Call LLM to generate episode content
   */
  private async callLLMForEpisode(research: ResearchResult): Promise<GeneratedEpisode | null> {
    const prompt = this.buildGenerationPrompt(research);

    try {
      const response = await this.llmClient.generate({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      return this.parseEpisodeResponse(response.content);
    } catch (error) {
      logger.error('LLM generation failed:', error);
      return null;
    }
  }

  /**
   * System prompt for episode generation
   */
  private getSystemPrompt(): string {
    return `You are an episode writer for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to transform research findings into compelling episode proposals that will spark genuine intellectual debate.

Style guidelines:
- Titles should be evocative and slightly provocative (e.g., "The Algorithm's Gavel", "The Immortality Gap")
- Subtitles pose the core question in engaging form (e.g., "Can Code Be Fairer Than Conscience?")
- Descriptions hook the listener with stakes and tension (2-3 sentences)
- Propositions are clear binary statements that reasonable people can disagree on
- Philosophical chairs represent genuinely different frameworks, not strawmen
- Each chair MUST acknowledge a real weakness in their position
- Key tensions highlight the most interesting friction points

Match the tone of these example titles:
- "The Algorithm's Gavel: Can Code Be Fairer Than Conscience?"
- "The Consent Dilemma: Who Decides What's Best for a Child's Future Self?"
- "The Immortality Gap: Should We Cure Death If Only the Rich Survive?"
- "The Deepfake Defense: When Synthetic Evidence Meets Real Justice"

Return your response as valid JSON.`;
  }

  /**
   * Build the generation prompt from research
   */
  private buildGenerationPrompt(research: ResearchResult): string {
    const sourceSummaries = research.sources
      .slice(0, 5)
      .map(s => `- ${s.title} (${s.domain}): "${s.excerpt}"`)
      .join('\n');

    return `Based on the following research, generate a Duelogic episode proposal.

RESEARCH TOPIC: ${research.topic}
CATEGORY: ${research.category}
CONTROVERSY SCORE: ${(research.controversyScore * 100).toFixed(0)}%
DEPTH SCORE: ${(research.depth * 100).toFixed(0)}%

SUMMARY:
${research.summary}

KEY SOURCES:
${sourceSummaries}

Generate an episode with this exact JSON structure:
{
  "title": "Short evocative title (2-4 words)",
  "subtitle": "Question form subtitle that poses the core dilemma",
  "description": "2-3 sentence hook that draws the listener in with stakes and relevance",
  "proposition": "Clear binary statement that reasonable people can disagree on. Format: 'X should/should not Y because Z'",
  "contextForPanel": "Paragraph providing background for AI debaters - key facts, current state of debate, relevant history",
  "chairs": [
    {
      "name": "First philosophical framework (e.g., 'Utilitarian Chair', 'Rights-Based Chair')",
      "position": "Their main argument in 2-3 sentences",
      "mustAcknowledge": "A genuine weakness or tension in their position they must address"
    },
    {
      "name": "Second philosophical framework",
      "position": "Their main argument in 2-3 sentences",
      "mustAcknowledge": "A genuine weakness or tension in their position they must address"
    }
  ],
  "keyTensions": [
    "First tension point to explore",
    "Second tension point",
    "Third tension point",
    "Fourth tension point",
    "Fifth tension point (optional)"
  ],
  "qualityScore": 0.0-1.0
}

The qualityScore should reflect how well this topic fits Duelogic's mission of genuine intellectual debate (not outrage bait or one-sided issues).`;
  }

  /**
   * Parse LLM response into structured episode
   */
  private parseEpisodeResponse(content: string): GeneratedEpisode | null {
    try {
      // Extract JSON from response
      let jsonStr = content;

      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      return {
        title: parsed.title,
        subtitle: parsed.subtitle,
        description: parsed.description,
        proposition: parsed.proposition,
        contextForPanel: parsed.contextForPanel || parsed.context_for_panel,
        chairs: this.parseChairs(parsed.chairs),
        keyTensions: parsed.keyTensions || parsed.key_tensions || [],
        qualityScore: parsed.qualityScore || parsed.quality_score || 0.7,
      };
    } catch (error) {
      logger.error('Failed to parse episode response:', error);
      return null;
    }
  }

  /**
   * Parse and validate philosophical chairs
   */
  private parseChairs(chairs: any[]): PhilosophicalChair[] {
    if (!Array.isArray(chairs) || chairs.length < 2) {
      throw new Error('Episode must have at least 2 philosophical chairs');
    }

    return chairs.slice(0, 2).map(chair => ({
      name: chair.name,
      position: chair.position,
      mustAcknowledge: chair.mustAcknowledge || chair.must_acknowledge,
    }));
  }

  /**
   * Validate generated episode has required structure
   */
  private validateEpisodeStructure(episode: GeneratedEpisode): boolean {
    if (!episode.title || episode.title.length < 3) {
      logger.warn('Episode missing valid title');
      return false;
    }

    if (!episode.subtitle || episode.subtitle.length < 10) {
      logger.warn('Episode missing valid subtitle');
      return false;
    }

    if (!episode.description || episode.description.length < 50) {
      logger.warn('Episode description too short');
      return false;
    }

    if (!episode.proposition || episode.proposition.length < 20) {
      logger.warn('Episode proposition too short');
      return false;
    }

    if (!episode.chairs || episode.chairs.length < 2) {
      logger.warn('Episode needs at least 2 philosophical chairs');
      return false;
    }

    for (const chair of episode.chairs) {
      if (!chair.name || !chair.position || !chair.mustAcknowledge) {
        logger.warn('Chair missing required fields');
        return false;
      }
    }

    if (!episode.keyTensions || episode.keyTensions.length < 3) {
      logger.warn('Episode needs at least 3 key tensions');
      return false;
    }

    return true;
  }

  /**
   * Check if a topic is too similar to existing proposals
   */
  private async isTooSimilar(
    topic: string,
    existingProposals: EpisodeProposal[]
  ): Promise<boolean> {
    const topicWords = this.extractKeywords(topic);

    for (const proposal of existingProposals) {
      const proposalWords = this.extractKeywords(proposal.title + ' ' + proposal.proposition);

      const overlap = this.calculateWordOverlap(topicWords, proposalWords);

      if (overlap > this.config.similarityThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'of', 'to', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'or', 'and', 'but', 'if',
      'then', 'else', 'when', 'up', 'out', 'about', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between', 'under',
      'again', 'further', 'once', 'here', 'there', 'where', 'why', 'how',
      'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
      'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    ]);

    return new Set(
      text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
    );
  }

  /**
   * Calculate word overlap between two sets
   */
  private calculateWordOverlap(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
```

### Batch Processing

```typescript
// backend/src/services/research/episode-batch-processor.ts

import { EpisodeGenerator } from './episode-generator.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import { ResearchResult, EpisodeProposal } from '../../types/duelogic-research.js';
import { logger } from '../../utils/logger.js';

interface BatchResult {
  totalProcessed: number;
  proposalsGenerated: number;
  errors: number;
  proposals: EpisodeProposal[];
}

export class EpisodeBatchProcessor {
  constructor(
    private generator: EpisodeGenerator,
    private researchRepo: ResearchRepository
  ) {}

  /**
   * Process all high-quality research results from a job
   */
  async processJob(jobId: string, maxEpisodes: number = 15): Promise<BatchResult> {
    const results = await this.researchRepo.findResultsByJobId(jobId);

    return this.processResults(results, maxEpisodes);
  }

  /**
   * Process a batch of research results
   */
  async processResults(
    results: ResearchResult[],
    maxEpisodes: number = 15
  ): Promise<BatchResult> {
    const batch: BatchResult = {
      totalProcessed: 0,
      proposalsGenerated: 0,
      errors: 0,
      proposals: [],
    };

    // Sort by combined quality score
    const sorted = [...results].sort((a, b) => {
      const scoreA = a.controversyScore * a.depth * a.timeliness;
      const scoreB = b.controversyScore * b.depth * b.timeliness;
      return scoreB - scoreA;
    });

    for (const result of sorted) {
      if (batch.proposalsGenerated >= maxEpisodes) break;

      batch.totalProcessed++;

      try {
        const proposal = await this.generator.generateProposal(result);

        if (proposal) {
          batch.proposalsGenerated++;
          batch.proposals.push(proposal);
          logger.info(`Generated: ${proposal.title}`);
        }
      } catch (error) {
        batch.errors++;
        logger.error(`Failed to process ${result.topic}:`, error);
      }

      // Small delay to avoid rate limiting
      await this.delay(1000);
    }

    return batch;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Validation

### How to Test

1. **Unit Tests:**
   - Test prompt generation
   - Test response parsing with various formats
   - Test episode structure validation
   - Test similarity detection
   - Test keyword extraction

2. **Integration Tests:**
   - Test full generation flow with mock LLM
   - Test database persistence
   - Test duplicate prevention

3. **Quality Tests:**
   - Generate 10 episodes from test research
   - Manually review for quality and format compliance
   - Verify chairs have genuine self-critiques
   - Check propositions are binary and debatable

### Test Examples

```typescript
describe('EpisodeGenerator', () => {
  describe('validateEpisodeStructure', () => {
    it('should reject episodes with missing chairs', () => {
      const episode = createTestEpisode({ chairs: [] });
      expect(generator.validateEpisodeStructure(episode)).toBe(false);
    });

    it('should reject chairs without mustAcknowledge', () => {
      const episode = createTestEpisode({
        chairs: [
          { name: 'Chair 1', position: 'Position', mustAcknowledge: '' }
        ]
      });
      expect(generator.validateEpisodeStructure(episode)).toBe(false);
    });

    it('should accept well-formed episodes', () => {
      const episode = createValidTestEpisode();
      expect(generator.validateEpisodeStructure(episode)).toBe(true);
    });
  });

  describe('isTooSimilar', () => {
    it('should detect similar topics', async () => {
      const existing = [
        createProposal({ title: 'AI Hiring Ethics', proposition: 'Should AI be used in hiring?' })
      ];

      const isSimilar = await generator.isTooSimilar(
        'Using AI for recruitment decisions',
        existing
      );

      expect(isSimilar).toBe(true);
    });

    it('should allow dissimilar topics', async () => {
      const existing = [
        createProposal({ title: 'Climate Policy', proposition: 'Carbon taxes are effective' })
      ];

      const isSimilar = await generator.isTooSimilar(
        'AI in healthcare diagnosis',
        existing
      );

      expect(isSimilar).toBe(false);
    });
  });
});
```

### Definition of Done

- [ ] EpisodeGenerator class implemented
- [ ] Generation prompt produces quality episodes
- [ ] All episodes validated against required structure
- [ ] Philosophical chairs include genuine self-critiques
- [ ] Duplicate/similar topic detection works
- [ ] Batch processing with rate limiting works
- [ ] Unit tests pass with >90% coverage
- [ ] Generated episodes match Duelogic format

---

## Notes

- Use Claude or GPT-4 for generation (not Perplexity) - they're better at creative structured output
- Temperature 0.8 encourages creative but coherent titles
- Consider adding feedback loop where rejected proposals inform future generation
- The `mustAcknowledge` field is critical - it prevents strawman arguments
- May want to cache generated proposals to avoid re-generation on retry

---

**Estimated Time:** 1-3 days
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
