# DUELOGIC-002: Perplexity Integration via OpenRouter

**Task ID:** DUELOGIC-002
**Phase:** Phase 5
**Category:** Duelogic Research
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** DUELOGIC-001 (Database Schema & Types)
**Status:** Ready

---

## Context

The Duelogic Research system uses Perplexity models through OpenRouter for real-time web research. Perplexity's models (sonar-pro, sonar-reasoning-pro) excel at searching the web and returning structured, cited information about current events and trending topics.

This task creates the integration layer that queries Perplexity to discover controversial topics suitable for Duelogic episodes.

**References:**
- [FUTURE-FEATURES.md](../../../docs/FUTURE-FEATURES.md) - Section 10: Duelogic Research & Automated Episode Generation
- [OpenRouter API Documentation](https://openrouter.ai/docs)
- Existing LLM client at `backend/src/services/llm/openrouter-client.ts`

---

## Requirements

### Acceptance Criteria

- [ ] Create `DuelogicResearchService` class for topic discovery
- [ ] Add Perplexity model support to OpenRouter client (if not already present)
- [ ] Implement citation extraction from Perplexity responses
- [ ] Build research prompts for each category
- [ ] Parse structured topic data from Perplexity responses
- [ ] Score topics for controversy, timeliness, and depth
- [ ] Filter topics based on quality thresholds
- [ ] Handle rate limiting and errors gracefully
- [ ] Track token usage for cost monitoring
- [ ] Write unit tests for service operations

### Functional Requirements

From FUTURE-FEATURES.md Section 10:
- Use Perplexity models via OpenRouter for real-time web research
- Discover trending moral/ethical debates from news, social media, academic sources
- Gather relevant articles, studies, statistics, and expert opinions
- Support multiple focus areas (tech ethics, climate, politics, bioethics, etc.)
- Enable citations that debate agents can use during episodes

---

## Implementation Guide

### Perplexity Model Configuration

```typescript
// backend/src/services/research/perplexity-config.ts

export interface PerplexityConfig {
  model: string;
  fallbackModel: string;
  searchRecencyFilter: 'day' | 'week' | 'month' | 'year';
  returnCitations: boolean;
  maxTokens: number;
  temperature: number;
}

export const DEFAULT_PERPLEXITY_CONFIG: PerplexityConfig = {
  model: 'perplexity/sonar-pro',
  fallbackModel: 'perplexity/sonar',
  searchRecencyFilter: 'week',
  returnCitations: true,
  maxTokens: 4000,
  temperature: 0.7,
};

// Perplexity models available via OpenRouter
export const PERPLEXITY_MODELS = {
  'sonar-pro': 'perplexity/sonar-pro',
  'sonar-reasoning-pro': 'perplexity/sonar-reasoning-pro',
  'sonar': 'perplexity/sonar',
  'sonar-reasoning': 'perplexity/sonar-reasoning',
} as const;
```

### Category Research Prompts

```typescript
// backend/src/services/research/category-prompts.ts

import { ResearchCategory } from '../../types/duelogic-research.js';

export interface CategoryPrompt {
  category: ResearchCategory;
  systemPrompt: string;
  searchPrompt: string;
}

export const CATEGORY_PROMPTS: Record<ResearchCategory, CategoryPrompt> = {
  technology_ethics: {
    category: 'technology_ethics',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current, genuinely debatable topics in technology ethics that would make compelling episodes.

Focus on topics with:
- Clear binary tension (not just "it's complicated")
- Current relevance (recent news, ongoing debates)
- Philosophical depth (can sustain 45-60 min debate)
- Multiple valid perspectives (not strawman vs. reason)
- Strong emotional and intellectual stakes

Return findings in a structured JSON format.`,
    searchPrompt: `Search for current debates about AI ethics, algorithm accountability, tech regulation, digital rights, automation's impact on society, and tech company responsibility.

Focus on:
- Recent news stories sparking controversy
- New technology deployments raising ethical concerns
- Regulatory battles and policy debates
- Academic papers challenging conventional wisdom
- Public backlash against tech practices

Find topics where reasonable people genuinely disagree.`,
  },

  climate_environment: {
    category: 'climate_environment',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current, genuinely debatable environmental topics that would make compelling episodes.

Focus on topics with:
- Clear policy or moral tension
- Current relevance (recent events, policy decisions)
- Philosophical depth beyond "climate change is real"
- Multiple valid stakeholder perspectives
- Trade-offs between competing values (growth vs. environment, etc.)`,
    searchPrompt: `Search for current environmental debates: climate policy conflicts, environmental justice issues, resource allocation controversies, technology vs. nature tensions, energy transition debates.

Focus on:
- Policy debates with genuine trade-offs
- Environmental justice issues affecting communities
- Conflicts between economic and environmental goals
- New scientific findings challenging assumptions
- International climate negotiations and disputes`,
  },

  politics_governance: {
    category: 'politics_governance',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current, genuinely debatable political and governance topics suitable for philosophical debate (not partisan point-scoring).

Focus on topics with:
- Genuine moral tension (not just partisan disagreement)
- Questions about governance philosophy
- Institutional design debates
- Balance of power questions
- Individual rights vs. collective good`,
    searchPrompt: `Search for current debates about governance philosophy, institutional design, democratic reforms, the balance between liberty and security, federalism, and the role of government.

Avoid purely partisan topics. Focus on:
- Constitutional interpretation debates
- Reform proposals for democratic institutions
- Tensions between majority rule and minority rights
- Global governance challenges
- Questions about political legitimacy`,
  },

  bioethics_medicine: {
    category: 'bioethics_medicine',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current, genuinely debatable bioethics topics that would make compelling episodes.

Focus on topics with:
- Clear moral tension
- Current medical or biotechnology advances
- Questions about autonomy, consent, and justice
- Life and death stakes (but handled thoughtfully)
- Competing medical ethics frameworks`,
    searchPrompt: `Search for current bioethics debates: medical autonomy, end-of-life decisions, genetic engineering ethics, healthcare allocation, clinical trial ethics, and biotechnology governance.

Focus on:
- New medical technologies raising ethical questions
- Healthcare policy debates with moral dimensions
- Consent and autonomy controversies
- Resource allocation during scarcity
- Research ethics disputes`,
  },

  economics_inequality: {
    category: 'economics_inequality',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current, genuinely debatable economic and inequality topics suitable for philosophical debate.

Focus on topics with:
- Clear tension between competing values (efficiency vs. equity, etc.)
- Current policy relevance
- Philosophical depth about justice and fairness
- Multiple legitimate perspectives
- Real stakes for affected populations`,
    searchPrompt: `Search for current debates about economic inequality, wealth redistribution, labor rights, corporate responsibility, universal basic income, and economic justice.

Focus on:
- Policy proposals with genuine trade-offs
- New research on inequality impacts
- Corporate ethics controversies
- Labor and automation debates
- Global economic justice issues`,
  },

  ai_automation: {
    category: 'ai_automation',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current, genuinely debatable AI and automation topics that would make compelling episodes.

Focus on topics with:
- Clear tension about AI development direction
- Current deployment decisions raising concerns
- Questions about human agency and control
- Competing visions of AI's role in society
- Near-term practical stakes`,
    searchPrompt: `Search for current debates about AI development, automation's impact on work, AI governance, algorithmic decision-making, AI in warfare, and artificial general intelligence risks.

Focus on:
- Recent AI deployments sparking controversy
- Regulatory proposals and industry responses
- AI safety debates and alignment concerns
- Automation and employment tensions
- AI in creative and professional domains`,
  },

  social_justice: {
    category: 'social_justice',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current social justice topics suitable for thoughtful philosophical debate (not partisan outrage).

Focus on topics with:
- Genuine moral complexity
- Multiple legitimate perspectives within the movement
- Questions about strategy, tactics, and priorities
- Tension between different justice frameworks
- Real-world policy implications`,
    searchPrompt: `Search for current social justice debates that have genuine complexity: internal movement debates, strategy disagreements, prioritization questions, and tensions between different approaches to justice.

Avoid simple progressive vs. conservative framing. Focus on:
- Debates within social movements about tactics
- Tensions between different marginalized groups
- Questions about incremental vs. radical change
- Debates about institutional vs. cultural approaches
- Disagreements about definitions and frameworks`,
  },

  international_relations: {
    category: 'international_relations',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current international relations topics suitable for ethical debate.

Focus on topics with:
- Clear moral dimensions beyond realpolitik
- Questions about intervention and sovereignty
- Global justice and responsibility debates
- Tensions between national and global interests
- Historical context that illuminates current debates`,
    searchPrompt: `Search for current debates about international intervention, global governance, humanitarian responsibility, sanctions and their ethics, international law, and global cooperation.

Focus on:
- Humanitarian intervention debates
- Sanctions policy and civilian impact
- Climate and environmental treaties
- Global health cooperation
- Human rights enforcement questions`,
  },

  privacy_surveillance: {
    category: 'privacy_surveillance',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current privacy and surveillance topics suitable for philosophical debate.

Focus on topics with:
- Clear tension between privacy and other values
- Current technology deployments
- Questions about consent and transparency
- Government vs. corporate surveillance debates
- Individual vs. collective interests`,
    searchPrompt: `Search for current debates about digital privacy, government surveillance, corporate data collection, biometric tracking, and the right to anonymity.

Focus on:
- New surveillance technologies and their deployment
- Data privacy regulations and enforcement
- Corporate data practices controversies
- Government access to encrypted communications
- Facial recognition and biometric debates`,
  },

  education_culture: {
    category: 'education_culture',
    systemPrompt: `You are a research assistant for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to identify current education and cultural topics suitable for thoughtful debate.

Focus on topics with:
- Genuine disagreement about values and methods
- Current policy relevance
- Questions about cultural transmission
- Tension between tradition and innovation
- Multiple legitimate stakeholder perspectives`,
    searchPrompt: `Search for current debates about educational philosophy, curriculum controversies, academic freedom, cultural preservation vs. change, and the purpose of education.

Focus on:
- Debates about what should be taught
- Questions about educational methods
- Academic freedom and institutional governance
- Cultural change and generational conflict
- Technology's role in education`,
  },
};
```

### Research Service Implementation

```typescript
// backend/src/services/research/duelogic-research-service.ts

import { OpenRouterLLMClient } from '../llm/openrouter-client.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import {
  ResearchConfig,
  ResearchResult,
  ResearchCategory,
  ResearchSource,
  QualityThresholds,
  DEFAULT_QUALITY_THRESHOLDS
} from '../../types/duelogic-research.js';
import { CATEGORY_PROMPTS } from './category-prompts.js';
import { DEFAULT_PERPLEXITY_CONFIG, PerplexityConfig } from './perplexity-config.js';
import { logger } from '../../utils/logger.js';

interface DiscoveredTopic {
  topic: string;
  summary: string;
  sources: ResearchSource[];
  controversyScore: number;
  timeliness: number;
  depth: number;
}

interface PerplexityResponse {
  content: string;
  citations?: string[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DuelogicResearchService {
  private perplexityConfig: PerplexityConfig;
  private qualityThresholds: QualityThresholds;

  constructor(
    private llmClient: OpenRouterLLMClient,
    private researchRepo: ResearchRepository,
    config?: Partial<PerplexityConfig>,
    thresholds?: Partial<QualityThresholds>
  ) {
    this.perplexityConfig = { ...DEFAULT_PERPLEXITY_CONFIG, ...config };
    this.qualityThresholds = { ...DEFAULT_QUALITY_THRESHOLDS, ...thresholds };
  }

  /**
   * Discover topics across all categories specified in the research config
   */
  async discoverTopics(
    config: ResearchConfig,
    jobId: string
  ): Promise<ResearchResult[]> {
    const results: ResearchResult[] = [];
    let totalTokensUsed = 0;

    for (const category of config.categories) {
      try {
        const categoryTopics = await this.discoverCategoryTopics(
          category,
          config.maxTopicsPerRun,
          config.excludeTopics
        );

        totalTokensUsed += categoryTopics.tokensUsed;

        // Filter by quality thresholds
        const qualityTopics = categoryTopics.topics.filter(
          topic =>
            topic.controversyScore >= config.minControversyScore &&
            topic.timeliness >= this.qualityThresholds.minTimeliness &&
            topic.depth >= this.qualityThresholds.minDepth
        );

        // Store results in database
        for (const topic of qualityTopics) {
          const result = await this.researchRepo.createResult({
            jobId,
            topic: topic.topic,
            category,
            sources: topic.sources,
            summary: topic.summary,
            controversyScore: topic.controversyScore,
            timeliness: topic.timeliness,
            depth: topic.depth,
            rawPerplexityResponse: categoryTopics.rawResponse,
          });

          results.push(result);
        }

        logger.info(`Discovered ${qualityTopics.length} quality topics for ${category}`);

      } catch (error) {
        logger.error(`Failed to discover topics for ${category}:`, error);
        // Continue with other categories even if one fails
      }
    }

    return results;
  }

  /**
   * Discover topics for a specific category
   */
  private async discoverCategoryTopics(
    category: ResearchCategory,
    maxTopics: number,
    excludeTopics: string[]
  ): Promise<{
    topics: DiscoveredTopic[];
    tokensUsed: number;
    rawResponse: string;
  }> {
    const prompt = CATEGORY_PROMPTS[category];
    if (!prompt) {
      throw new Error(`Unknown research category: ${category}`);
    }

    const excludeClause = excludeTopics.length > 0
      ? `\n\nExclude topics similar to: ${excludeTopics.join(', ')}`
      : '';

    const response = await this.queryPerplexity(
      prompt.systemPrompt,
      `${prompt.searchPrompt}${excludeClause}

Return your findings as a JSON array with this structure:
{
  "topics": [
    {
      "topic": "The main topic/question being debated",
      "summary": "2-3 sentence summary of the debate and why it matters",
      "sources": [
        {
          "url": "source URL",
          "title": "article/source title",
          "domain": "domain name",
          "publishedAt": "publication date if known",
          "excerpt": "key quote or finding"
        }
      ],
      "controversyScore": 0.0-1.0,  // How genuinely debatable is this?
      "timeliness": 0.0-1.0,        // How current/relevant is this?
      "depth": 0.0-1.0              // Enough substance for a 45-min debate?
    }
  ]
}

Find up to ${maxTopics} topics. Quality over quantity - only include genuinely debatable topics.`
    );

    const parsed = this.parseTopicsResponse(response.content, category);

    return {
      topics: parsed,
      tokensUsed: response.usage?.total_tokens || 0,
      rawResponse: response.content,
    };
  }

  /**
   * Query Perplexity via OpenRouter
   */
  private async queryPerplexity(
    systemPrompt: string,
    userPrompt: string
  ): Promise<PerplexityResponse> {
    try {
      const response = await this.llmClient.generate({
        model: this.perplexityConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.perplexityConfig.temperature,
        max_tokens: this.perplexityConfig.maxTokens,
        // Perplexity-specific options via OpenRouter
        extra_body: {
          return_citations: this.perplexityConfig.returnCitations,
          search_recency_filter: this.perplexityConfig.searchRecencyFilter,
        },
      });

      return {
        content: response.content,
        citations: response.citations, // OpenRouter passes through Perplexity citations
        usage: response.usage,
      };
    } catch (error: any) {
      // Try fallback model if primary fails
      if (this.perplexityConfig.fallbackModel) {
        logger.warn(`Primary Perplexity model failed, trying fallback: ${error.message}`);

        const response = await this.llmClient.generate({
          model: this.perplexityConfig.fallbackModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: this.perplexityConfig.temperature,
          max_tokens: this.perplexityConfig.maxTokens,
        });

        return {
          content: response.content,
          usage: response.usage,
        };
      }

      throw error;
    }
  }

  /**
   * Parse the JSON response from Perplexity into structured topics
   */
  private parseTopicsResponse(
    content: string,
    category: ResearchCategory
  ): DiscoveredTopic[] {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      let jsonStr = content;

      // Try to extract JSON from code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      const topics = parsed.topics || parsed;

      if (!Array.isArray(topics)) {
        logger.warn(`Unexpected response format for ${category}:`, content.slice(0, 200));
        return [];
      }

      return topics.map((topic: any) => ({
        topic: topic.topic || topic.title || '',
        summary: topic.summary || topic.description || '',
        sources: this.parseSources(topic.sources || []),
        controversyScore: this.clampScore(topic.controversyScore || topic.controversy_score || 0.5),
        timeliness: this.clampScore(topic.timeliness || 0.5),
        depth: this.clampScore(topic.depth || 0.5),
      }));

    } catch (error) {
      logger.error(`Failed to parse Perplexity response for ${category}:`, error);
      return [];
    }
  }

  /**
   * Parse and validate source objects
   */
  private parseSources(sources: any[]): ResearchSource[] {
    if (!Array.isArray(sources)) return [];

    return sources
      .filter(s => s && typeof s === 'object')
      .map(source => ({
        url: source.url || '',
        title: source.title || '',
        domain: source.domain || this.extractDomain(source.url || ''),
        publishedAt: source.publishedAt ? new Date(source.publishedAt) : undefined,
        excerpt: source.excerpt || source.quote || '',
        credibilityScore: source.credibilityScore,
      }))
      .filter(s => s.url && s.title);
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  /**
   * Clamp score to 0-1 range
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get token usage estimate for a research run
   */
  estimateTokenUsage(config: ResearchConfig): number {
    // Rough estimate: ~3000 tokens per category (prompt + response)
    return config.categories.length * 3000;
  }

  /**
   * Get cost estimate for a research run (in cents)
   */
  estimateCost(config: ResearchConfig): number {
    const tokens = this.estimateTokenUsage(config);
    // Perplexity sonar-pro: ~$0.003 per 1K tokens (approximate)
    return Math.ceil((tokens / 1000) * 0.3);
  }
}
```

### Update OpenRouter Client (if needed)

```typescript
// Add to backend/src/services/llm/openrouter-client.ts

interface OpenRouterGenerateOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  extra_body?: {
    return_citations?: boolean;
    search_recency_filter?: string;
    [key: string]: any;
  };
}

// In the generate method, pass extra_body to OpenRouter:
async generate(options: OpenRouterGenerateOptions): Promise<LLMResponse> {
  const requestBody: any = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4096,
  };

  // Pass through Perplexity-specific options
  if (options.extra_body) {
    Object.assign(requestBody, options.extra_body);
  }

  // ... rest of the method
}
```

---

## Validation

### How to Test

1. **Unit Tests:**
   - Test category prompt generation
   - Test response parsing with various formats
   - Test quality score filtering
   - Test source extraction and validation
   - Test domain extraction from URLs
   - Test error handling and fallback

2. **Integration Tests:**
   - Test actual Perplexity API calls (mock or sandbox)
   - Test full topic discovery flow
   - Test database persistence of results
   - Test token usage tracking

3. **Manual Testing:**
   - Run discovery for a single category
   - Verify sources are real and recent
   - Check quality scores are reasonable
   - Confirm topics are genuinely debatable

### Test Examples

```typescript
// backend/tests/duelogic-research-service.test.ts

describe('DuelogicResearchService', () => {
  describe('parseTopicsResponse', () => {
    it('should parse valid JSON response', () => {
      const response = `{
        "topics": [{
          "topic": "Should AI be used in hiring?",
          "summary": "Growing debate about algorithmic bias in recruitment",
          "sources": [{"url": "https://example.com", "title": "AI Hiring Study"}],
          "controversyScore": 0.85,
          "timeliness": 0.9,
          "depth": 0.75
        }]
      }`;

      const topics = service.parseTopicsResponse(response, 'ai_automation');

      expect(topics).toHaveLength(1);
      expect(topics[0].topic).toBe('Should AI be used in hiring?');
      expect(topics[0].controversyScore).toBe(0.85);
    });

    it('should extract JSON from markdown code blocks', () => {
      const response = '```json\n{"topics": []}\n```';
      const topics = service.parseTopicsResponse(response, 'ai_automation');
      expect(topics).toEqual([]);
    });

    it('should handle malformed responses gracefully', () => {
      const response = 'Not valid JSON at all';
      const topics = service.parseTopicsResponse(response, 'ai_automation');
      expect(topics).toEqual([]);
    });
  });

  describe('discoverCategoryTopics', () => {
    it('should filter topics by quality thresholds', async () => {
      // Mock Perplexity response with mixed quality topics
      mockLLMClient.generate.mockResolvedValue({
        content: JSON.stringify({
          topics: [
            { topic: 'High quality', controversyScore: 0.9, timeliness: 0.8, depth: 0.85 },
            { topic: 'Low quality', controversyScore: 0.3, timeliness: 0.2, depth: 0.4 },
          ]
        }),
        usage: { total_tokens: 1500 }
      });

      const config = createTestConfig({ minControversyScore: 0.6 });
      const results = await service.discoverTopics(config, 'job-123');

      expect(results).toHaveLength(1);
      expect(results[0].topic).toBe('High quality');
    });
  });
});
```

### Definition of Done

- [ ] DuelogicResearchService class implemented
- [ ] Category prompts defined for all 10 categories
- [ ] Perplexity response parsing works correctly
- [ ] Quality filtering applied to discovered topics
- [ ] Token usage tracked for cost monitoring
- [ ] Error handling with model fallback works
- [ ] Unit tests pass with >90% coverage
- [ ] Integration test with real API call works

---

## Notes

- Perplexity models via OpenRouter use the `perplexity/` prefix
- The `search_recency_filter` parameter helps focus on recent news
- Citation URLs returned by Perplexity should be validated/checked
- Consider caching responses to avoid duplicate research
- Rate limits vary by model; implement exponential backoff
- Token costs for Perplexity are higher than standard models

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-03
**Updated:** 2026-01-03
