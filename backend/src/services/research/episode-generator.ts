
import { OpenRouterLLMClient } from '../llm/openrouter-adapter.js';
import { EpisodeProposalRepository } from '../../db/repositories/episode-proposal-repository.js';
import { ResearchResult, EpisodeProposal, PhilosophicalChair, ViralMetrics, TopicPreScreenResult } from '../../types/duelogic-research.js';
import {
    getTrendingTopicsService,
    TrendingTopicsService,
    VIRAL_TITLE_PATTERNS,
    POWER_WORDS,
    type TrendingContext,
} from './trending-topics-service.js';
import pino from 'pino';

const logger = pino({
    name: 'episode-generator',
    level: process.env.LOG_LEVEL || 'info',
});

interface GeneratorConfig {
    model: string;
    temperature: number;
    maxTokens: number;
    similarityThreshold: number; // 0-1, reject if too similar to existing
}

const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
    model: 'anthropic/claude-3.5-sonnet',
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
    // Viral optimization fields
    suggestedHashtags?: string[];
    targetAudience?: string;
}

export class EpisodeGenerator {
    private config: GeneratorConfig;
    private trendingService: TrendingTopicsService;
    private trendingContext: TrendingContext | null = null;

    constructor(
        private llmClient: OpenRouterLLMClient,
        private proposalRepo: EpisodeProposalRepository,
        config?: Partial<GeneratorConfig>,
        trendingService?: TrendingTopicsService
    ) {
        this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
        this.trendingService = trendingService || getTrendingTopicsService();
    }

    /**
     * Refresh trending context (call at start of batch generation)
     */
    async refreshTrendingContext(): Promise<void> {
        try {
            if (this.trendingService.isAvailable()) {
                this.trendingContext = await this.trendingService.getTrendingContext();
                logger.info(
                    { trendingCount: this.trendingContext.trendingSearches.length },
                    'Refreshed trending context for viral optimization'
                );
            } else {
                logger.info('Trending service not available - using default prompts');
                this.trendingContext = null;
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to fetch trending context - continuing without');
            this.trendingContext = null;
        }
    }

    /**
     * Pre-screen a research result for viral potential BEFORE generating a full proposal.
     * This saves LLM tokens by filtering out low-potential topics early.
     *
     * @param research The research result to evaluate
     * @param minTrendAlignment Minimum trend alignment threshold (0-1, 0 = disabled)
     * @returns Pre-screening result with pass/fail and reasons
     */
    preScreenTopic(
        research: ResearchResult,
        minTrendAlignment: number = 0
    ): TopicPreScreenResult {
        // Calculate trend alignment from research content (no title needed yet)
        const { matchedTrends, trendAlignment } = this.calculateResearchTrendAlignment(research);

        // Check if it passes the threshold
        const passesThreshold = minTrendAlignment === 0 || trendAlignment >= minTrendAlignment;

        let reason: string | undefined;
        if (!passesThreshold) {
            reason = `Trend alignment ${(trendAlignment * 100).toFixed(0)}% below threshold ${(minTrendAlignment * 100).toFixed(0)}%`;
        } else if (matchedTrends.length === 0 && minTrendAlignment > 0) {
            reason = 'No trending topics matched';
        }

        const result: TopicPreScreenResult = {
            researchResultId: research.id,
            topic: research.topic,
            category: research.category,
            estimatedTrendAlignment: trendAlignment,
            matchedTrends,
            controversyScore: research.controversyScore,
            passesThreshold,
            reason,
        };

        logger.info({
            topic: research.topic.slice(0, 50),
            trendAlignment: `${(trendAlignment * 100).toFixed(0)}%`,
            matchedTrends: matchedTrends.slice(0, 3),
            passesThreshold,
            minThreshold: `${(minTrendAlignment * 100).toFixed(0)}%`,
        }, passesThreshold ? 'Topic passed pre-screening' : 'Topic filtered by pre-screening');

        return result;
    }

    /**
     * Calculate trend alignment from research result alone (without generated title)
     * Used for pre-screening before spending tokens on full proposal generation
     */
    private calculateResearchTrendAlignment(
        research: ResearchResult
    ): { matchedTrends: string[]; trendAlignment: number } {
        const matchedTrends: string[] = [];
        let alignmentScore = 0;

        if (!this.trendingContext || this.trendingContext.trendingSearches.length === 0) {
            return { matchedTrends, trendAlignment: 0 };
        }

        // Build content from research only (no generated title/description)
        const contentToMatch = [
            research.topic,
            research.summary,
            research.category.replace(/_/g, ' '),
            ...research.sources.map(s => s.title).slice(0, 3),
        ].join(' ').toLowerCase();

        const contentKeywords = this.extractKeywords(contentToMatch);

        // Same matching logic as calculateTrendAlignment but without generated content
        const figureTopicMap: Record<string, string[]> = {
            'dario amodei': ['ai', 'anthropic', 'artificial intelligence', 'safety', 'ethics', 'claude'],
            'sam altman': ['ai', 'openai', 'artificial intelligence', 'chatgpt', 'gpt'],
            'elon musk': ['ai', 'technology', 'twitter', 'tesla', 'space', 'spacex', 'x'],
            'jd vance': ['politics', 'government', 'senate', 'republican', 'trump', 'vice president', 'vp'],
            'trump': ['politics', 'government', 'president', 'republican', 'white house', 'administration'],
            'biden': ['politics', 'government', 'president', 'democrat', 'white house', 'administration'],
            'zohran mamdani': ['politics', 'democrat', 'progressive', 'nyc', 'new york'],
            'scott bessent': ['economics', 'treasury', 'finance', 'policy', 'economic'],
            'ozempic': ['health', 'medicine', 'pharmaceutical', 'obesity', 'diabetes', 'wegovy', 'weight'],
            'susan wojcicki': ['technology', 'youtube', 'google', 'media', 'video'],
            'openai': ['ai', 'artificial intelligence', 'chatgpt', 'gpt', 'machine learning'],
            'anthropic': ['ai', 'artificial intelligence', 'claude', 'safety', 'ethics'],
            'google': ['ai', 'technology', 'search', 'gemini', 'bard'],
            'climate': ['environment', 'carbon', 'emissions', 'green', 'sustainability', 'warming'],
            'ukraine': ['war', 'russia', 'conflict', 'nato', 'military', 'international'],
            'israel': ['gaza', 'palestine', 'conflict', 'middle east', 'war'],
            'congress': ['politics', 'government', 'legislation', 'senate', 'house'],
            'supreme court': ['law', 'court', 'justice', 'legal', 'constitutional', 'ruling'],
        };

        for (const trend of this.trendingContext.trendingSearches) {
            const trendLower = trend.toLowerCase();
            let matched = false;

            // Direct match
            if (contentToMatch.includes(trendLower)) {
                matchedTrends.push(trend);
                alignmentScore += 1.0;
                continue;
            }

            // Keyword match
            const trendKeywords = this.extractKeywords(trendLower);
            if (trendKeywords.size > 0) {
                const keywordOverlap = [...trendKeywords].filter(kw => contentKeywords.has(kw)).length;
                const overlapRatio = keywordOverlap / trendKeywords.size;
                if (overlapRatio >= 0.5) {
                    matchedTrends.push(trend);
                    alignmentScore += overlapRatio * 0.8;
                    continue;
                }
            }

            // Figure-to-topic mapping
            for (const [figure, associatedTopics] of Object.entries(figureTopicMap)) {
                if (trendLower.includes(figure) || figure.includes(trendLower)) {
                    const topicMatches = associatedTopics.filter(topic =>
                        contentToMatch.includes(topic) || contentKeywords.has(topic)
                    );
                    if (topicMatches.length > 0) {
                        matchedTrends.push(`${trend} → ${topicMatches[0]}`);
                        alignmentScore += 0.6 * (topicMatches.length / associatedTopics.length);
                        matched = true;
                        break;
                    }
                }
            }
            if (matched) continue;

            // Reverse mapping
            for (const [figure, associatedTopics] of Object.entries(figureTopicMap)) {
                if (contentToMatch.includes(figure)) {
                    const trendRelatedToTopics = associatedTopics.some(topic =>
                        trendLower.includes(topic) || this.extractKeywords(trendLower).has(topic)
                    );
                    if (trendRelatedToTopics) {
                        matchedTrends.push(`${figure} ← ${trend}`);
                        alignmentScore += 0.5;
                        break;
                    }
                }
            }
        }

        // Check category hot topics
        if (this.trendingContext.hotTopicsByCategory) {
            const categoryHotTopics = this.trendingContext.hotTopicsByCategory.get(research.category);
            if (categoryHotTopics && categoryHotTopics.length > 0) {
                for (const hotTerm of categoryHotTopics.slice(0, 5)) {
                    const hotTermLower = hotTerm.toLowerCase();
                    if (contentToMatch.includes(hotTermLower)) {
                        if (!matchedTrends.some(t => t.toLowerCase().includes(hotTermLower))) {
                            matchedTrends.push(`[${research.category}] ${hotTerm}`);
                            alignmentScore += 0.4;
                        }
                    }
                }
            }
        }

        return {
            matchedTrends: matchedTrends.slice(0, 5),
            trendAlignment: Math.min(alignmentScore / 3, 1),
        };
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
            logger.warn({ topic: research.topic }, 'Failed to generate valid episode for topic');
            return null;
        }

        // Calculate viral metrics
        const viralMetrics = this.calculateViralMetrics(generated, research);

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
            viralMetrics,
        });

        logger.info(
            { title: generated.title, viralScore: viralMetrics.titleHookStrength },
            'Generated episode proposal with viral optimization'
        );
        return proposal;
    }

    /**
     * Calculate viral metrics for generated episode
     */
    private calculateViralMetrics(
        generated: GeneratedEpisode,
        research: ResearchResult
    ): ViralMetrics {
        // Score the title for viral potential
        const titleScore = this.trendingService.scoreTitleForVirality(generated.title);

        // Find which trending terms this episode matches (using keyword extraction)
        const { matchedTrends, trendAlignment } = this.calculateTrendAlignment(
            generated,
            research
        );

        // Determine title pattern
        let titlePattern: string | undefined;
        if (generated.title.startsWith('The ')) {
            titlePattern = 'Compound Mystery';
        } else if (generated.title.includes('?') || generated.subtitle.includes('Should')) {
            titlePattern = 'Provocative Question';
        } else if (generated.title.includes(' vs ')) {
            titlePattern = 'Binary Choice';
        }

        // Calculate controversy balance (high controversy but not toxic)
        const controversyBalance = Math.min(research.controversyScore * 1.2, 1);

        return {
            trendAlignment,
            titleHookStrength: titleScore.score,
            controversyBalance,
            suggestedHashtags: generated.suggestedHashtags || this.generateHashtags(generated, research),
            targetAudience: generated.targetAudience || this.inferTargetAudience(research),
            matchedTrends,
            titlePattern,
        };
    }

    /**
     * Calculate trend alignment using keyword matching and semantic similarity
     */
    private calculateTrendAlignment(
        generated: GeneratedEpisode,
        research: ResearchResult
    ): { matchedTrends: string[]; trendAlignment: number } {
        const matchedTrends: string[] = [];
        let alignmentScore = 0;

        if (!this.trendingContext || this.trendingContext.trendingSearches.length === 0) {
            logger.debug('No trending context available for trend alignment calculation');
            return { matchedTrends, trendAlignment: 0 };
        }

        // Build content to match against
        const contentToMatch = [
            research.topic,
            generated.title,
            generated.subtitle,
            generated.description,
            research.summary,
            research.category.replace(/_/g, ' '),
        ].join(' ').toLowerCase();

        // Extract keywords from content
        const contentKeywords = this.extractKeywords(contentToMatch);

        logger.debug({
            trendCount: this.trendingContext.trendingSearches.length,
            trends: this.trendingContext.trendingSearches.slice(0, 5),
            contentKeywordsSample: [...contentKeywords].slice(0, 20),
            contentPreview: contentToMatch.slice(0, 200),
        }, 'Calculating trend alignment');

        // Known figure mappings - associate trending people/terms with related topics
        // This enables matching when a trending person relates to the debate topic
        const figureTopicMap: Record<string, string[]> = {
            'dario amodei': ['ai', 'anthropic', 'artificial intelligence', 'safety', 'ethics', 'claude'],
            'sam altman': ['ai', 'openai', 'artificial intelligence', 'chatgpt', 'gpt'],
            'elon musk': ['ai', 'technology', 'twitter', 'tesla', 'space', 'spacex', 'x'],
            'jd vance': ['politics', 'government', 'senate', 'republican', 'trump', 'vice president', 'vp'],
            'trump': ['politics', 'government', 'president', 'republican', 'white house', 'administration'],
            'biden': ['politics', 'government', 'president', 'democrat', 'white house', 'administration'],
            'zohran mamdani': ['politics', 'democrat', 'progressive', 'nyc', 'new york'],
            'scott bessent': ['economics', 'treasury', 'finance', 'policy', 'economic'],
            'ozempic': ['health', 'medicine', 'pharmaceutical', 'obesity', 'diabetes', 'wegovy', 'weight'],
            'susan wojcicki': ['technology', 'youtube', 'google', 'media', 'video'],
            'openai': ['ai', 'artificial intelligence', 'chatgpt', 'gpt', 'machine learning'],
            'anthropic': ['ai', 'artificial intelligence', 'claude', 'safety', 'ethics'],
            'google': ['ai', 'technology', 'search', 'gemini', 'bard'],
            'climate': ['environment', 'carbon', 'emissions', 'green', 'sustainability', 'warming'],
            'ukraine': ['war', 'russia', 'conflict', 'nato', 'military', 'international'],
            'israel': ['gaza', 'palestine', 'conflict', 'middle east', 'war'],
            'congress': ['politics', 'government', 'legislation', 'senate', 'house'],
            'supreme court': ['law', 'court', 'justice', 'legal', 'constitutional', 'ruling'],
        };

        // Check each trending term
        for (const trend of this.trendingContext.trendingSearches) {
            const trendLower = trend.toLowerCase();
            let matched = false;

            // 1. Direct match - trend appears in content
            if (contentToMatch.includes(trendLower)) {
                matchedTrends.push(trend);
                alignmentScore += 1.0;
                logger.debug({ trend, matchType: 'direct' }, 'Found direct trend match');
                continue;
            }

            // 2. Keyword match from trend - significant keyword overlap
            const trendKeywords = this.extractKeywords(trendLower);
            if (trendKeywords.size > 0) {
                const keywordOverlap = [...trendKeywords].filter(kw => contentKeywords.has(kw)).length;
                const overlapRatio = keywordOverlap / trendKeywords.size;
                if (overlapRatio >= 0.5) {
                    matchedTrends.push(trend);
                    alignmentScore += overlapRatio * 0.8;
                    logger.debug({ trend, keywordOverlap, overlapRatio, matchType: 'keyword' }, 'Found keyword trend match');
                    continue;
                }
            }

            // 3. Figure-to-topic mapping - check if trend matches a known figure/term
            //    AND the content relates to that figure's associated topics
            for (const [figure, associatedTopics] of Object.entries(figureTopicMap)) {
                // Check if this trending term contains or matches a known figure
                if (trendLower.includes(figure) || figure.includes(trendLower)) {
                    const topicMatches = associatedTopics.filter(topic =>
                        contentToMatch.includes(topic) || contentKeywords.has(topic)
                    );
                    if (topicMatches.length > 0) {
                        matchedTrends.push(`${trend} → ${topicMatches[0]}`);
                        alignmentScore += 0.6 * (topicMatches.length / associatedTopics.length);
                        matched = true;
                        logger.debug({
                            trend, figure, topicMatches, matchType: 'figure-to-topic'
                        }, 'Found figure-to-topic match');
                        break;
                    }
                }
            }
            if (matched) continue;

            // 4. Reverse mapping - content mentions a figure that's related to a trending topic
            for (const [figure, associatedTopics] of Object.entries(figureTopicMap)) {
                if (contentToMatch.includes(figure)) {
                    // Content mentions this figure - check if trend relates to their topics
                    const trendRelatedToTopics = associatedTopics.some(topic =>
                        trendLower.includes(topic) || this.extractKeywords(trendLower).has(topic)
                    );
                    if (trendRelatedToTopics) {
                        matchedTrends.push(`${figure} ← ${trend}`);
                        alignmentScore += 0.5;
                        matched = true;
                        logger.debug({
                            trend, figure, matchType: 'reverse-figure'
                        }, 'Found reverse figure match');
                        break;
                    }
                }
            }
        }

        // Check category-specific trending from hotTopicsByCategory
        if (this.trendingContext.hotTopicsByCategory) {
            const categoryHotTopics = this.trendingContext.hotTopicsByCategory.get(research.category);
            if (categoryHotTopics && categoryHotTopics.length > 0) {
                for (const hotTerm of categoryHotTopics.slice(0, 5)) {
                    const hotTermLower = hotTerm.toLowerCase();
                    if (contentToMatch.includes(hotTermLower)) {
                        if (!matchedTrends.some(t => t.toLowerCase().includes(hotTermLower))) {
                            matchedTrends.push(`[${research.category}] ${hotTerm}`);
                            alignmentScore += 0.4;
                            logger.debug({ hotTerm, category: research.category, matchType: 'category-hot' }, 'Found category hot topic match');
                        }
                    }
                }
            }
        }

        // Normalize score to 0-1 range
        // Max reasonable score would be ~3-4 matches
        const normalizedAlignment = Math.min(alignmentScore / 3, 1);

        logger.info({
            title: generated.title,
            matchedTrends,
            alignmentScore,
            normalizedAlignment,
        }, 'Trend alignment calculated');

        return {
            matchedTrends: matchedTrends.slice(0, 5), // Cap at 5 matches
            trendAlignment: normalizedAlignment,
        };
    }

    /**
     * Generate hashtags for social promotion
     */
    private generateHashtags(generated: GeneratedEpisode, research: ResearchResult): string[] {
        const hashtags: string[] = ['#Duelogic', '#AIDebate'];

        // Add category-based hashtag
        const categoryHashtags: Record<string, string> = {
            technology_ethics: '#TechEthics',
            ai_automation: '#AIFuture',
            climate_environment: '#ClimateDebate',
            politics_governance: '#PoliticalDebate',
            bioethics_medicine: '#Bioethics',
            economics_inequality: '#EconomicJustice',
            social_justice: '#SocialJustice',
            privacy_surveillance: '#PrivacyMatters',
            education_culture: '#EdDebate',
            international_relations: '#GlobalPolitics',
        };

        const categoryTag = categoryHashtags[research.category];
        if (categoryTag) {
            hashtags.push(categoryTag);
        }

        // Extract key terms for hashtags
        const titleWords = generated.title.split(/\s+/)
            .filter(w => w.length > 4 && !['The', 'And', 'For'].includes(w))
            .slice(0, 2);

        for (const word of titleWords) {
            hashtags.push(`#${word.replace(/[^a-zA-Z]/g, '')}`);
        }

        return hashtags.slice(0, 5);
    }

    /**
     * Infer target audience from research
     */
    private inferTargetAudience(research: ResearchResult): string {
        const audienceMap: Record<string, string> = {
            technology_ethics: 'Tech professionals, ethicists, and policy makers interested in responsible innovation',
            ai_automation: 'AI enthusiasts, workers concerned about automation, and futurists',
            climate_environment: 'Environmentally conscious listeners and sustainability advocates',
            politics_governance: 'Politically engaged citizens and policy wonks',
            bioethics_medicine: 'Healthcare professionals, patients, and medical ethics enthusiasts',
            economics_inequality: 'Economics enthusiasts and social mobility advocates',
            social_justice: 'Activists, advocates, and those passionate about equity',
            privacy_surveillance: 'Privacy advocates, security professionals, and civil libertarians',
            education_culture: 'Educators, parents, and cultural commentators',
            international_relations: 'Foreign policy enthusiasts and global citizens',
        };

        return audienceMap[research.category] || 'Curious thinkers who enjoy intellectual debate';
    }

    /**
     * Generate proposals for multiple research results
     */
    async generateProposals(
        results: ResearchResult[],
        maxProposals: number = 10
    ): Promise<EpisodeProposal[]> {
        // Refresh trending context at start of batch
        await this.refreshTrendingContext();

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
                logger.error({ err: error, topic: result.topic }, 'Failed to generate proposal');
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
            logger.error({ err: error }, 'LLM generation failed');
            return null;
        }
    }

    /**
     * System prompt for episode generation
     */
    private getSystemPrompt(): string {
        const basePrompt = `You are an episode writer for Duelogic, an AI debate podcast focused on controversial moral and ethical questions.

Your job is to transform research findings into VIRAL episode proposals that will spark genuine intellectual debate AND attract a large audience.

## VIRAL TITLE ENGINEERING

Your titles MUST:
1. Hook within 3 words - front-load the intrigue
2. Create a "curiosity gap" - make people NEED to know more
3. Suggest conflict or tension - debates need two sides
4. Be specific over generic ("The AI Judge" > "Technology and Justice")

PROVEN VIRAL PATTERNS:
${VIRAL_TITLE_PATTERNS.map(p => `- ${p.name}: "${p.pattern}" (e.g., "${p.examples[0]}")`).join('\n')}

POWER WORDS (use 1-2 naturally):
${POWER_WORDS.slice(0, 15).join(', ')}

## CONTENT GUIDELINES

- Subtitles pose the core question in personal terms ("Should WE...", "What happens when YOU...")
- Descriptions hook with stakes in the FIRST sentence - state the conflict immediately
- Propositions are clear binary statements that reasonable people can disagree on
- Philosophical chairs represent genuinely different frameworks, not strawmen
- Each chair MUST acknowledge a real weakness in their position
- Key tensions highlight the most interesting friction points

## QUALITY OVER CLICKBAIT

We want viral QUALITY content, not outrage bait:
- Topics must have genuine intellectual depth
- Both sides must have legitimate arguments
- Avoid strawmen or obvious one-sided takes
- The goal is thoughtful controversy, not cheap engagement

## EXAMPLES OF EXCELLENT TITLES

- "The Algorithm's Gavel: Can Code Be Fairer Than Conscience?"
- "The Consent Dilemma: Who Decides What's Best for a Child's Future Self?"
- "The Immortality Gap: Should We Cure Death If Only the Rich Survive?"
- "The Deepfake Defense: When Synthetic Evidence Meets Real Justice"
- "The Silicon Throne: Should We Let Big Tech Be AI's Gatekeeper?"

Return your response as valid JSON.`;

        // Add trending context if available
        if (this.trendingContext && this.trendingContext.trendingSearches.length > 0) {
            return basePrompt + `

## CURRENT TRENDING TOPICS (incorporate if relevant)

People are currently searching for:
${this.trendingContext.trendingSearches.slice(0, 8).map(t => `- "${t}"`).join('\n')}

Look for natural ways to connect your topic to these trends for maximum relevance.`;
        }

        return basePrompt;
    }

    /**
     * Build the generation prompt from research
     */
    private buildGenerationPrompt(research: ResearchResult): string {
        const sourceSummaries = research.sources
            .slice(0, 5)
            .map(s => `- ${s.title} (${s.domain}): "${s.excerpt}"`)
            .join('\n');

        return `Based on the following research, generate a VIRAL Duelogic episode proposal.

RESEARCH TOPIC: ${research.topic}
CATEGORY: ${research.category}
CONTROVERSY SCORE: ${(research.controversyScore * 100).toFixed(0)}%
DEPTH SCORE: ${(research.depth * 100).toFixed(0)}%

SUMMARY:
${research.summary}

KEY SOURCES:
${sourceSummaries}

Generate an episode optimized for both intellectual depth AND viral appeal:
{
  "title": "Short evocative title (2-4 words) - USE A VIRAL PATTERN",
  "subtitle": "Question form subtitle that creates urgency and personal stakes",
  "description": "2-3 sentence hook - START with conflict, END with why it matters NOW",
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
  "qualityScore": 0.0-1.0,
  "suggestedHashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3"],
  "targetAudience": "Brief description of who this episode appeals to most"
}

IMPORTANT:
- qualityScore should reflect intellectual depth (genuine debate potential)
- Title MUST follow one of the viral patterns (Compound Mystery, Provocative Question, etc.)
- Description first sentence MUST state the conflict immediately`;
    }

    /**
     * Parse LLM response into structured episode
     */
    private parseEpisodeResponse(content: string): GeneratedEpisode | null {
        try {
            // Extract JSON from response
            let jsonStr = content;

            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch && jsonMatch[1]) {
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
                suggestedHashtags: parsed.suggestedHashtags || parsed.suggested_hashtags,
                targetAudience: parsed.targetAudience || parsed.target_audience,
            };
        } catch (error) {
            logger.error({ err: error }, 'Failed to parse episode response');
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

        return chairs.slice(0, 2).map((chair: any) => ({
            name: chair.name,
            position: chair.position,
            mustAcknowledge: chair.mustAcknowledge || chair.must_acknowledge,
        }));
    }

    /**
     * Validate generated episode has required structure
     */
    // Made public for testing
    public validateEpisodeStructure(episode: GeneratedEpisode): boolean {
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
    // Made public for testing
    public async isTooSimilar(
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
                .filter(word => word.length >= 2 && !stopWords.has(word))
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
