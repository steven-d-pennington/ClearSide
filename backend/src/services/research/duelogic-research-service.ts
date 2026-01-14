
import { OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import { ResearchRepository } from '../../db/repositories/research-repository.js';
import {
    ResearchConfig,
    ResearchResult,
    ResearchCategory,
    ResearchSource,
    QualityThresholds,
    DEFAULT_QUALITY_THRESHOLDS
} from '../../types/duelogic-research.js';
import { CATEGORY_PROMPTS, VIRAL_PROMPT_ENHANCEMENT } from './category-prompts.js';
import { DEFAULT_PERPLEXITY_CONFIG, PerplexityConfig } from './perplexity-config.js';
import {
    TrendingTopicsService,
    createTrendingTopicsService,
    type TrendingContext,
} from './trending-topics-service.js';
import pino from 'pino';

const logger = pino({
    name: 'duelogic-research-service',
    level: process.env.LOG_LEVEL || 'info',
});

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
    private trendingService: TrendingTopicsService;
    private trendingContext: TrendingContext | null = null;

    constructor(
        private llmClient: OpenRouterLLMClient,
        private researchRepo: ResearchRepository,
        config?: Partial<PerplexityConfig>,
        thresholds?: Partial<QualityThresholds>,
        trendingService?: TrendingTopicsService
    ) {
        this.perplexityConfig = { ...DEFAULT_PERPLEXITY_CONFIG, ...config };
        this.qualityThresholds = { ...DEFAULT_QUALITY_THRESHOLDS, ...thresholds };
        // Pass LLM client to trending service for Perplexity fallback
        this.trendingService = trendingService || createTrendingTopicsService(undefined, llmClient);
    }

    /**
     * Refresh trending context before research run
     */
    async refreshTrendingContext(): Promise<void> {
        try {
            if (this.trendingService.isAvailable()) {
                this.trendingContext = await this.trendingService.getTrendingContext();
                logger.info(
                    { trendingCount: this.trendingContext.trendingSearches.length },
                    'Loaded trending context for research queries'
                );
            } else {
                logger.info('Trending service not available - using standard prompts');
                this.trendingContext = null;
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to fetch trending context - continuing without');
            this.trendingContext = null;
        }
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

        // Refresh trending context at start of research run
        await this.refreshTrendingContext();

        // Log if viral mode is enabled
        if (config.viralMode) {
            logger.info('🔥 VIRAL MODE ENABLED - Optimizing for maximum engagement');
        }

        for (const category of config.categories) {
            try {
                const categoryTopics = await this.discoverCategoryTopics(
                    category,
                    config.maxTopicsPerRun,
                    config.excludeTopics,
                    config.viralMode
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
                logger.error({ err: error }, `Failed to discover topics for ${category}`);
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
        excludeTopics: string[],
        viralMode: boolean = false
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

        // Build trending context for this category
        const trendingClause = this.buildTrendingClause(category);

        // Add viral mode enhancement if enabled
        const viralClause = viralMode ? VIRAL_PROMPT_ENHANCEMENT : '';

        const response = await this.queryPerplexity(
            prompt.systemPrompt + (viralMode ? '\n\n🔥 VIRAL MODE: Prioritize maximum engagement potential!' : ''),
            `${prompt.searchPrompt}${excludeClause}${trendingClause}${viralClause}

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

Find up to ${maxTopics} topics. Quality over quantity - only include genuinely debatable topics.
${this.trendingContext ? 'PRIORITY: Topics that connect to current trending discussions will score higher for timeliness.' : ''}`
        );

        const parsed = this.parseTopicsResponse(response.content, category);

        return {
            topics: parsed,
            tokensUsed: response.usage?.total_tokens || 0,
            rawResponse: response.content,
        };
    }

    /**
     * Build trending context clause for research prompts
     */
    private buildTrendingClause(category: ResearchCategory): string {
        if (!this.trendingContext) {
            return '';
        }

        const parts: string[] = [];

        // Add global trending searches
        if (this.trendingContext.trendingSearches.length > 0) {
            parts.push(`
CURRENT TRENDING PODCAST TOPICS (prioritize topics that intersect with these):
${this.trendingContext.trendingSearches.slice(0, 8).map(t => `- "${t}"`).join('\n')}`);
        }

        // Add category-specific hot topics
        const categoryHotTopics = this.trendingContext.hotTopicsByCategory.get(category);
        if (categoryHotTopics && categoryHotTopics.length > 0) {
            parts.push(`
HOT TOPICS IN ${category.toUpperCase().replace(/_/g, ' ')}:
${categoryHotTopics.slice(0, 5).map(t => `- "${t}"`).join('\n')}`);
        }

        // Add viral guidance
        if (parts.length > 0) {
            parts.push(`
Look for debate-worthy angles that connect to these trending topics. Topics that tap into current conversations will have higher viral potential.`);
        }

        return parts.join('\n');
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
                usage: response.usage ? {
                    prompt_tokens: response.usage.promptTokens,
                    completion_tokens: response.usage.completionTokens,
                    total_tokens: response.usage.totalTokens
                } : undefined,
            };
        } catch (error: any) {
            // Try fallback model if primary fails
            if (this.perplexityConfig.fallbackModel) {
                logger.warn({ error }, `Primary Perplexity model failed, trying fallback: ${error.message}`);

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
                    usage: response.usage ? {
                        prompt_tokens: response.usage.promptTokens,
                        completion_tokens: response.usage.completionTokens,
                        total_tokens: response.usage.totalTokens
                    } : undefined,
                };
            }

            throw error;
        }
    }

    /**
     * Parse the JSON response from Perplexity into structured topics
     */
    // Made public for testing
    public parseTopicsResponse(
        content: string,
        category: ResearchCategory
    ): DiscoveredTopic[] {
        try {
            // Extract JSON from response (may be wrapped in markdown code blocks)
            let jsonStr = content;

            // Try to extract JSON from code blocks
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch && jsonMatch[1]) {
                jsonStr = jsonMatch[1].trim();
            }

            const parsed = JSON.parse(jsonStr);
            const topics = parsed.topics || parsed;

            if (!Array.isArray(topics)) {
                logger.warn({ content: content.slice(0, 200) }, `Unexpected response format for ${category}`);
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
            logger.error({ err: error }, `Failed to parse Perplexity response for ${category}`);
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
