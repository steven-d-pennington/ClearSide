/**
 * Trending Topics Service
 *
 * Aggregates trending data from multiple sources for viral podcast episode generation:
 * - Listen Notes (podcast trending topics)
 * - Reddit (social media discussions, free API)
 * - Perplexity (web/social media search, fallback when Listen Notes rate-limited)
 */

import pino from 'pino';
import {
  getListenNotesClient,
  ListenNotesClient,
  type PodcastBasic,
} from './listen-notes-client.js';
import {
  getRedditClient,
  RedditClient,
} from './reddit-client.js';
import type { ResearchCategory } from '../../types/duelogic-research.js';
import type { OpenRouterLLMClient } from '../llm/openrouter-adapter.js';

const logger = pino({
  name: 'trending-topics-service',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Viral title patterns proven to drive engagement
 */
export const VIRAL_TITLE_PATTERNS = [
  {
    name: 'The Compound Mystery',
    pattern: 'The [Noun] [Noun]',
    examples: ['The Algorithm\'s Gavel', 'The Immortality Gap', 'The Silicon Throne'],
    description: 'Mysterious compound nouns that create intrigue',
  },
  {
    name: 'The Provocative Question',
    pattern: 'Should We [Controversial Action]?',
    examples: ['Should We Let AI Judge Us?', 'Should We Cure Death?'],
    description: 'Direct questions that demand an opinion',
  },
  {
    name: 'The Hidden Truth',
    pattern: 'The [Adjective] Truth About [Topic]',
    examples: ['The Uncomfortable Truth About AI Art', 'The Hidden Cost of Free Speech'],
    description: 'Promises revelation of something concealed',
  },
  {
    name: 'The Binary Choice',
    pattern: '[Option A] vs [Option B]: [Stakes]',
    examples: ['Privacy vs Safety: Who Decides?', 'Progress vs Planet: The Real Cost'],
    description: 'Forces consideration of a trade-off',
  },
  {
    name: 'The Countdown',
    pattern: '[Number] [Things] That Will [Impact]',
    examples: ['5 Laws That Will Define AI\'s Future', '3 Decisions That Could End Privacy'],
    description: 'Specific numbers create authority and urgency',
  },
];

/**
 * Power words that increase engagement
 */
export const POWER_WORDS = [
  // Urgency
  'crisis', 'urgent', 'deadline', 'now', 'breaking',
  // Mystery
  'secret', 'hidden', 'truth', 'revealed', 'exposed',
  // Conflict
  'battle', 'war', 'fight', 'clash', 'showdown',
  // Stakes
  'dangerous', 'risk', 'threat', 'survival', 'extinction',
  // Authority
  'expert', 'proven', 'scientific', 'research', 'study',
  // Emotion
  'shocking', 'surprising', 'controversial', 'outrage', 'fear',
];

export interface TrendingContext {
  trendingSearches: string[];
  hotTopicsByCategory: Map<ResearchCategory, string[]>;
  suggestedTitlePatterns: typeof VIRAL_TITLE_PATTERNS;
  powerWords: string[];
  topPodcastTitles: string[];
  lastUpdated: Date;
  attribution: string;
}

export interface CategoryTrendingData {
  category: ResearchCategory;
  trendingTerms: string[];
  hotPodcasts: PodcastBasic[];
  suggestedAngles: string[];
}

export class TrendingTopicsService {
  private listenNotesClient: ListenNotesClient;
  private redditClient: RedditClient;
  private llmClient: OpenRouterLLMClient | null;

  constructor(
    listenNotesClient?: ListenNotesClient,
    llmClient?: OpenRouterLLMClient,
    redditClient?: RedditClient
  ) {
    this.listenNotesClient = listenNotesClient || getListenNotesClient();
    this.llmClient = llmClient || null;
    this.redditClient = redditClient || getRedditClient();
  }

  /**
   * Check if the service is available (has API key configured)
   */
  isAvailable(): boolean {
    // Available if Listen Notes, Reddit, OR Perplexity is available
    // Reddit is always available (no auth required)
    return true;
  }

  /**
   * Get trending topics from Perplexity (fallback when Listen Notes is unavailable)
   */
  private async getTrendingFromPerplexity(): Promise<string[]> {
    if (!this.llmClient) {
      logger.warn('Perplexity fallback not available - no LLM client configured');
      return [];
    }

    try {
      logger.info('Fetching trending topics from Perplexity (Listen Notes fallback)');

      const response = await this.llmClient.generate({
        model: 'perplexity/sonar-pro',
        messages: [
          {
            role: 'system',
            content: `You are a trending topics analyst specializing in social media and current debates.
Identify hot topics that would make compelling podcast debates by searching social media platforms and news sources.
Focus on controversial, timely subjects across: technology ethics, AI, climate, politics, social justice, economics, and science.`
          },
          {
            role: 'user',
            content: `What are the top 15 most trending and controversial topics on social media RIGHT NOW (today)?

SEARCH THESE PLATFORMS SPECIFICALLY:
- Twitter/X: trending topics, viral threads, controversial takes
- Reddit: r/all hot posts, r/politics, r/technology, r/science controversial discussions
- HackerNews: front page debates (especially tech ethics)
- YouTube: trending videos with debate/controversy
- Major news sites: breaking controversial stories

Requirements:
- Focus on topics with GENUINE debate potential (two legitimate sides arguing)
- Include specific events, people, or developments (e.g., "Elon Musk Twitter changes" not just "social media")
- Mix of categories: tech, politics, climate, AI, social issues, economics, science
- MUST be from the past 48 hours (very recent/current)
- Prioritize topics people are ACTIVELY ARGUING about online

Return ONLY a JSON array of strings, no other text:
["topic 1", "topic 2", ...]

Example format:
["OpenAI CEO Sam Altman firing controversy", "Supreme Court ethics reform legislation", "Climate activists gluing hands to highways debate", "AI voice cloning copyright lawsuit", ...]`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      // Parse response
      const content = response.content.trim();

      // Try to extract JSON array from response
      let topics: string[] = [];

      // Look for JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          topics = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          logger.warn({ parseError, content }, 'Failed to parse Perplexity JSON response');
        }
      }

      // Fallback: split by newlines and clean up
      if (!Array.isArray(topics) || topics.length === 0) {
        topics = content
          .split('\n')
          .map(line => line.replace(/^[-*•"\d.)\s]+/, '').replace(/["']$/g, '').trim())
          .filter(line => line.length > 5 && line.length < 100);
      }

      logger.info({ topicCount: topics.length }, 'Fetched trending topics from Perplexity');

      return topics.slice(0, 15);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch trending from Perplexity');
      return [];
    }
  }

  /**
   * Get complete trending context for episode generation
   */
  async getTrendingContext(): Promise<TrendingContext> {
    const sources: string[] = [];
    let allTrendingTopics: string[] = [];

    // 1. Try Listen Notes first (podcast-specific trends)
    try {
      const trendingResponse = await this.listenNotesClient.getTrendingSearches();
      const cleanedTrendingSearches = trendingResponse.terms.map(term =>
        term.replace(/^["']|["']$/g, '').trim()
      ).filter(term => term.length > 0);

      if (cleanedTrendingSearches.length > 0) {
        allTrendingTopics.push(...cleanedTrendingSearches);
        sources.push('Listen Notes');
        logger.info({ count: cleanedTrendingSearches.length }, 'Got trending topics from Listen Notes');
      }
    } catch (error) {
      logger.warn({ error }, 'Listen Notes fetch failed');
    }

    // 2. Always fetch from Reddit (free, no rate limits, great for debates)
    try {
      const redditTopics = await this.redditClient.getAllTrendingTopics(15);
      if (redditTopics.length > 0) {
        allTrendingTopics.push(...redditTopics);
        sources.push('Reddit');
        logger.info({ count: redditTopics.length }, 'Got trending topics from Reddit');
      }
    } catch (error) {
      logger.warn({ error }, 'Reddit fetch failed');
    }

    // 3. If we still don't have enough, use Perplexity fallback
    if (allTrendingTopics.length < 10 && this.llmClient) {
      logger.info('Fetching additional topics from Perplexity');
      const perplexityTopics = await this.getTrendingFromPerplexity();
      if (perplexityTopics.length > 0) {
        allTrendingTopics.push(...perplexityTopics);
        sources.push('Perplexity');
        logger.info({ count: perplexityTopics.length }, 'Got trending topics from Perplexity');
      }
    }

    // Deduplicate topics (case-insensitive, similar titles)
    const uniqueTopics = this.deduplicateTopics(allTrendingTopics);

    logger.info({
      totalRaw: allTrendingTopics.length,
      uniqueCount: uniqueTopics.length,
      sources,
    }, 'Aggregated trending topics from all sources');

    const attribution = sources.length > 0
      ? `Powered by ${sources.join(', ')}`
      : 'No trending data available';

    const trendingSearches = uniqueTopics.slice(0, 20); // Top 20 unique topics

    // Get hot topics for key categories
    const hotTopicsByCategory = new Map<ResearchCategory, string[]>();
    const topPodcastTitles: string[] = [];

    // Fetch for a subset of categories to conserve API quota
    const priorityCategories: ResearchCategory[] = [
      'technology_ethics',
      'ai_automation',
      'politics_governance',
      'social_justice',
    ];

    for (const category of priorityCategories) {
      const categoryTopics: string[] = [];

      // Fetch from Listen Notes (podcasts)
      try {
        const podcasts = await this.listenNotesClient.getBestPodcastsForCategory(category);
        const podcastTerms = this.extractTrendingTermsFromPodcasts(podcasts);
        categoryTopics.push(...podcastTerms);

        // Collect top podcast titles for pattern learning
        podcasts.slice(0, 5).forEach(p => {
          if (p.title && !topPodcastTitles.includes(p.title)) {
            topPodcastTitles.push(p.title);
          }
        });
      } catch (error) {
        logger.warn({ category, error }, 'Failed to fetch Listen Notes for category');
      }

      // Fetch from Reddit (social media discussions)
      try {
        const redditPosts = await this.redditClient.getCategoryTrending(category, 10);
        const redditTopics = this.redditClient.extractTrendingTopics(redditPosts);
        categoryTopics.push(...redditTopics);
      } catch (error) {
        logger.warn({ category, error }, 'Failed to fetch Reddit for category');
      }

      // Deduplicate and store
      const uniqueCategoryTopics = this.deduplicateTopics(categoryTopics);
      hotTopicsByCategory.set(category, uniqueCategoryTopics.slice(0, 10));
    }

    return {
      trendingSearches,
      hotTopicsByCategory,
      suggestedTitlePatterns: VIRAL_TITLE_PATTERNS,
      powerWords: POWER_WORDS,
      topPodcastTitles: topPodcastTitles.slice(0, 20),
      lastUpdated: new Date(),
      attribution,
    };
  }

  /**
   * Get trending data for a specific category
   */
  async getCategoryTrending(category: ResearchCategory): Promise<CategoryTrendingData> {
    const podcasts = await this.listenNotesClient.getBestPodcastsForCategory(category);
    const trendingResponse = await this.listenNotesClient.getTrendingSearches();

    // Filter trending terms relevant to this category
    const categoryKeywords = this.getCategoryKeywords(category);
    const relevantTrends = trendingResponse.terms.filter(term =>
      categoryKeywords.some(kw => term.toLowerCase().includes(kw.toLowerCase()))
    );

    // Extract terms from podcast content
    const podcastTerms = this.extractTrendingTermsFromPodcasts(podcasts);

    // Generate suggested angles based on trends
    const suggestedAngles = this.generateSuggestedAngles(
      category,
      [...relevantTrends, ...podcastTerms]
    );

    return {
      category,
      trendingTerms: [...new Set([...relevantTrends, ...podcastTerms])].slice(0, 15),
      hotPodcasts: podcasts.slice(0, 10),
      suggestedAngles,
    };
  }

  /**
   * Build a prompt section for injecting trending context into research
   */
  buildTrendingPromptSection(context: TrendingContext): string {
    const trendingSection = context.trendingSearches.length > 0
      ? `CURRENT TRENDING PODCAST SEARCHES:
${context.trendingSearches.map(t => `- "${t}"`).join('\n')}

Consider how these trending topics might intersect with your category focus.
`
      : '';

    const patternsSection = `
VIRAL TITLE PATTERNS (use these structures):
${VIRAL_TITLE_PATTERNS.map(p => `- ${p.pattern} (e.g., "${p.examples[0]}")`).join('\n')}

POWER WORDS (incorporate when natural):
${POWER_WORDS.slice(0, 15).join(', ')}
`;

    return `
${trendingSection}
${patternsSection}

GOAL: Generate topics that are timely, controversial, and have viral potential.
Topics should create a "curiosity gap" - make people NEED to know more.
`;
  }

  /**
   * Build viral optimization prompt for episode generation
   */
  buildViralOptimizationPrompt(context: TrendingContext): string {
    return `
## VIRAL OPTIMIZATION GUIDELINES

You are optimizing for maximum podcast engagement. Apply these strategies:

### TITLE ENGINEERING
Your titles should:
1. Hook within 3 words - front-load the intrigue
2. Create a "curiosity gap" - promise information the reader needs
3. Suggest conflict or tension - debates need two sides
4. Use power words strategically: ${POWER_WORDS.slice(0, 10).join(', ')}
5. Be specific over generic ("The AI Judge" > "Technology and Justice")

### TRENDING ALIGNMENT
${context.trendingSearches.length > 0 ? `
Current hot searches people are looking for:
${context.trendingSearches.slice(0, 8).map(t => `- ${t}`).join('\n')}

Look for ways to connect your topic to these trends naturally.
` : 'No trending data available - focus on evergreen controversial topics.'}

### TITLE PATTERNS THAT WORK
${VIRAL_TITLE_PATTERNS.map(p => `
**${p.name}**: "${p.pattern}"
  Example: "${p.examples[0]}"
  Why it works: ${p.description}`).join('\n')}

### SUBTITLE ENGINEERING
Subtitles should:
- Pose the core question in personal terms ("Should WE...", "What happens when YOU...")
- Hint at stakes ("...and why it matters for democracy")
- Create urgency when appropriate ("...before it's too late")

### DESCRIPTION HOOKS
First sentence must:
- State the conflict immediately
- Name specific actors/forces when possible
- Promise insight the listener won't get elsewhere

### QUALITY OVER CLICKBAIT
Important: We want viral QUALITY content, not outrage bait.
- Topics must have genuine intellectual depth
- Both sides must have legitimate arguments
- Avoid strawmen or obvious one-sided takes
- The goal is thoughtful controversy, not cheap engagement
`;
  }

  /**
   * Score a title for viral potential
   */
  scoreTitleForVirality(title: string): {
    score: number;
    factors: { name: string; score: number; reason: string }[];
  } {
    const factors: { name: string; score: number; reason: string }[] = [];

    // Check length (optimal: 3-6 words)
    const wordCount = title.split(/\s+/).length;
    const lengthScore = wordCount >= 3 && wordCount <= 6 ? 1 : wordCount <= 8 ? 0.7 : 0.4;
    factors.push({
      name: 'Length',
      score: lengthScore,
      reason: `${wordCount} words (optimal: 3-6)`,
    });

    // Check for power words
    const titleLower = title.toLowerCase();
    const powerWordCount = POWER_WORDS.filter(pw => titleLower.includes(pw)).length;
    const powerWordScore = Math.min(powerWordCount * 0.3, 1);
    factors.push({
      name: 'Power Words',
      score: powerWordScore,
      reason: `Contains ${powerWordCount} power words`,
    });

    // Check for pattern match
    let patternScore = 0;
    let matchedPattern = 'None';
    if (title.startsWith('The ') && title.split(' ').length <= 4) {
      patternScore = 0.8;
      matchedPattern = 'Compound Mystery';
    } else if (title.includes('Should') || title.includes('?')) {
      patternScore = 0.7;
      matchedPattern = 'Provocative Question';
    } else if (title.includes(' vs ') || title.includes(' or ')) {
      patternScore = 0.75;
      matchedPattern = 'Binary Choice';
    } else if (/\d/.test(title)) {
      patternScore = 0.6;
      matchedPattern = 'Countdown';
    }
    factors.push({
      name: 'Pattern',
      score: patternScore,
      reason: `Matches: ${matchedPattern}`,
    });

    // Check for specificity (proper nouns, specific terms)
    const hasSpecificity = /[A-Z][a-z]+/.test(title.slice(4)) || /\d/.test(title);
    const specificityScore = hasSpecificity ? 0.8 : 0.5;
    factors.push({
      name: 'Specificity',
      score: specificityScore,
      reason: hasSpecificity ? 'Contains specific terms' : 'Could be more specific',
    });

    // Calculate overall score
    const weights = { Length: 0.15, 'Power Words': 0.25, Pattern: 0.35, Specificity: 0.25 };
    const overallScore = factors.reduce((sum, f) => {
      const weight = weights[f.name as keyof typeof weights] || 0.25;
      return sum + f.score * weight;
    }, 0);

    return {
      score: Math.round(overallScore * 100) / 100,
      factors,
    };
  }

  /**
   * Deduplicate topics using similarity matching
   */
  private deduplicateTopics(topics: string[]): string[] {
    const unique: string[] = [];
    const seenLower = new Set<string>();

    for (const topic of topics) {
      const topicLower = topic.toLowerCase().trim();

      // Skip if too short
      if (topicLower.length < 5) {
        continue;
      }

      // Check if we've seen this exact topic (case-insensitive)
      if (seenLower.has(topicLower)) {
        continue;
      }

      // Check if we've seen a very similar topic (>80% overlap)
      let isDuplicate = false;
      for (const seen of seenLower) {
        const similarity = this.calculateSimilarity(topicLower, seen);
        if (similarity > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(topic);
        seenLower.add(topicLower);
      }
    }

    return unique;
  }

  /**
   * Calculate similarity between two strings (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Extract trending terms from podcast titles and descriptions
   */
  private extractTrendingTermsFromPodcasts(podcasts: PodcastBasic[]): string[] {
    const terms: string[] = [];
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'we',
      'our', 'they', 'their', 'what', 'which', 'who', 'whom', 'how', 'why',
      'when', 'where', 'podcast', 'show', 'episode', 'new', 'about',
    ]);

    for (const podcast of podcasts.slice(0, 20)) {
      // Extract from title
      const titleWords = podcast.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      terms.push(...titleWords);

      // Extract key phrases from description
      const descWords = (podcast.description || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.has(w));

      terms.push(...descWords.slice(0, 10));
    }

    // Count frequency and return top terms
    const frequency = new Map<string, number>();
    terms.forEach(t => frequency.set(t, (frequency.get(t) || 0) + 1));

    return [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term]) => term);
  }

  /**
   * Get keywords associated with a category
   */
  private getCategoryKeywords(category: ResearchCategory): string[] {
    const keywords: Record<ResearchCategory, string[]> = {
      technology_ethics: ['tech', 'technology', 'digital', 'software', 'algorithm', 'data'],
      ai_automation: ['ai', 'artificial intelligence', 'machine learning', 'robot', 'automation', 'chatgpt'],
      climate_environment: ['climate', 'environment', 'green', 'sustainable', 'carbon', 'energy'],
      politics_governance: ['politics', 'government', 'democracy', 'election', 'policy', 'law'],
      bioethics_medicine: ['health', 'medical', 'bioethics', 'genetics', 'healthcare', 'disease'],
      economics_inequality: ['economy', 'money', 'wealth', 'inequality', 'business', 'finance'],
      social_justice: ['justice', 'rights', 'equality', 'discrimination', 'race', 'gender'],
      international_relations: ['global', 'international', 'war', 'peace', 'diplomacy', 'foreign'],
      privacy_surveillance: ['privacy', 'surveillance', 'security', 'data', 'tracking', 'spy'],
      education_culture: ['education', 'school', 'culture', 'learning', 'university', 'student'],
    };

    return keywords[category] || [];
  }

  /**
   * Generate suggested debate angles from trending terms
   */
  private generateSuggestedAngles(_category: ResearchCategory, terms: string[]): string[] {
    // Create debate-worthy angle suggestions
    const angleTemplates = [
      (term: string) => `Should ${term} be regulated?`,
      (term: string) => `The hidden cost of ${term}`,
      (term: string) => `Who benefits from ${term}?`,
      (term: string) => `${term}: progress or threat?`,
      (term: string) => `The ethics of ${term}`,
    ];

    const angles: string[] = [];
    const usedTerms = new Set<string>();

    for (const term of terms.slice(0, 10)) {
      if (usedTerms.has(term)) continue;
      usedTerms.add(term);

      const templateIndex = angles.length % angleTemplates.length;
      const template = angleTemplates[templateIndex];
      if (template) {
        angles.push(template(term));
      }
    }

    return angles.slice(0, 5);
  }
}

// Singleton instance
let defaultService: TrendingTopicsService | null = null;

/**
 * Get the default trending topics service instance
 */
export function getTrendingTopicsService(): TrendingTopicsService {
  if (!defaultService) {
    defaultService = new TrendingTopicsService();
  }
  return defaultService;
}

/**
 * Create a new trending topics service with custom configuration
 */
export function createTrendingTopicsService(
  listenNotesClient?: ListenNotesClient,
  llmClient?: OpenRouterLLMClient,
  redditClient?: RedditClient
): TrendingTopicsService {
  return new TrendingTopicsService(listenNotesClient, llmClient, redditClient);
}
