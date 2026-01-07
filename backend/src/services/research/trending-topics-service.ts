/**
 * Trending Topics Service
 *
 * Aggregates trending data from Listen Notes and provides context
 * for viral podcast episode generation.
 */

import pino from 'pino';
import {
  getListenNotesClient,
  ListenNotesClient,
  type PodcastBasic,
} from './listen-notes-client.js';
import type { ResearchCategory } from '../../types/duelogic-research.js';

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

  constructor(listenNotesClient?: ListenNotesClient) {
    this.listenNotesClient = listenNotesClient || getListenNotesClient();
  }

  /**
   * Check if the service is available (has API key configured)
   */
  isAvailable(): boolean {
    return this.listenNotesClient.isConfigured();
  }

  /**
   * Get complete trending context for episode generation
   */
  async getTrendingContext(): Promise<TrendingContext> {
    const trendingResponse = await this.listenNotesClient.getTrendingSearches();

    // Clean up trending terms - remove quotes and normalize
    const cleanedTrendingSearches = trendingResponse.terms.map(term =>
      term.replace(/^["']|["']$/g, '').trim()
    ).filter(term => term.length > 0);

    logger.info({
      originalTerms: trendingResponse.terms,
      cleanedTerms: cleanedTrendingSearches,
    }, 'Cleaned trending search terms');

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
      try {
        const podcasts = await this.listenNotesClient.getBestPodcastsForCategory(category);

        // Extract trending terms from podcast titles and descriptions
        const categoryTerms = this.extractTrendingTermsFromPodcasts(podcasts);
        hotTopicsByCategory.set(category, categoryTerms);

        // Collect top podcast titles for pattern learning
        podcasts.slice(0, 5).forEach(p => {
          if (p.title && !topPodcastTitles.includes(p.title)) {
            topPodcastTitles.push(p.title);
          }
        });
      } catch (error) {
        logger.warn({ category, error }, 'Failed to fetch trending for category');
      }
    }

    return {
      trendingSearches: cleanedTrendingSearches,
      hotTopicsByCategory,
      suggestedTitlePatterns: VIRAL_TITLE_PATTERNS,
      powerWords: POWER_WORDS,
      topPodcastTitles: topPodcastTitles.slice(0, 20),
      lastUpdated: new Date(),
      attribution: 'Powered by Listen Notes',
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
  listenNotesClient?: ListenNotesClient
): TrendingTopicsService {
  return new TrendingTopicsService(listenNotesClient);
}
