/**
 * Reddit API Client
 *
 * Fetches trending posts from Reddit using the public JSON API (no auth required).
 * Great source for controversial debate topics across many categories.
 */

import pino from 'pino';
import type { ResearchCategory } from '../../types/duelogic-research.js';

const logger = pino({
  name: 'reddit-client',
  level: process.env.LOG_LEVEL || 'info',
});

const REDDIT_BASE_URL = 'https://www.reddit.com';
const USER_AGENT = 'ClearSide-Research/1.0';

// Cache TTLs
const TRENDING_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (Reddit updates frequently)

/**
 * Subreddit to category mapping
 */
export const CATEGORY_TO_SUBREDDITS: Record<ResearchCategory, string[]> = {
  technology_ethics: ['technology', 'tech', 'privacy', 'cybersecurity', 'ethics'],
  ai_automation: ['artificial', 'MachineLearning', 'singularity', 'OpenAI', 'ChatGPT'],
  climate_environment: ['climate', 'environment', 'climateskeptics', 'energy', 'sustainability'],
  politics_governance: ['politics', 'PoliticalDiscussion', 'neutralpolitics', 'worldnews'],
  bioethics_medicine: ['medicine', 'biology', 'bioethics', 'genetics', 'health'],
  economics_inequality: ['economics', 'economy', 'capitalism', 'socialism', 'BasicIncome'],
  social_justice: ['SocialJusticeInAction', 'TrueOffMyChest', 'unpopularopinion', 'changemyview'],
  international_relations: ['worldnews', 'geopolitics', 'internationalpolitics', 'globalaffairs'],
  privacy_surveillance: ['privacy', 'surveillance', 'NSALeaks', 'cybersecurity'],
  education_culture: ['education', 'teachers', 'academia', 'philosophy', 'TrueReddit'],
};

export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  url: string;
  createdUtc: number;
  selftext: string;
  upvoteRatio: number;
  isControversial: boolean;
}

export interface RedditTrendingResponse {
  posts: RedditPost[];
  subreddit: string;
  cached: boolean;
  cachedAt?: Date;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class RedditClient {
  private cache: Map<string, CacheEntry<RedditPost[]>> = new Map();

  /**
   * Fetch hot/controversial posts from a subreddit
   */
  async getSubredditPosts(
    subreddit: string,
    sort: 'hot' | 'controversial' | 'top' = 'hot',
    limit: number = 25
  ): Promise<RedditTrendingResponse> {
    const cacheKey = `${subreddit}_${sort}_${limit}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < TRENDING_CACHE_TTL_MS) {
        logger.debug({ subreddit, sort, cacheAge: Math.round(age / 1000 / 60) }, 'Returning cached Reddit posts');
        return {
          posts: cached.data,
          subreddit,
          cached: true,
          cachedAt: new Date(cached.timestamp),
        };
      }
    }

    try {
      logger.info({ subreddit, sort, limit }, 'Fetching posts from Reddit');

      const url = `${REDDIT_BASE_URL}/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText, subreddit }, 'Reddit API error');
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const data = await response.json() as { data?: { children?: any[] } };
      const children = data.data?.children || [];

      const posts: RedditPost[] = children
        .filter((child: any) => child.kind === 't3') // t3 = link/post
        .map((child: any) => {
          const post = child.data;
          return {
            id: post.id,
            title: post.title,
            subreddit: post.subreddit,
            author: post.author,
            score: post.score || 0,
            numComments: post.num_comments || 0,
            url: `https://reddit.com${post.permalink}`,
            createdUtc: post.created_utc,
            selftext: (post.selftext || '').slice(0, 500),
            upvoteRatio: post.upvote_ratio || 0.5,
            isControversial: post.upvote_ratio > 0.4 && post.upvote_ratio < 0.6, // Controversial = close to 50/50
          };
        });

      // Update cache
      this.cache.set(cacheKey, {
        data: posts,
        timestamp: Date.now(),
      });

      logger.info({ subreddit, postCount: posts.length }, 'Fetched posts from Reddit');

      return {
        posts,
        subreddit,
        cached: false,
      };
    } catch (error) {
      logger.error({ error, subreddit }, 'Failed to fetch Reddit posts');

      // Return cached data if available, even if stale
      if (cached) {
        logger.info('Returning stale cache due to error');
        return {
          posts: cached.data,
          subreddit,
          cached: true,
          cachedAt: new Date(cached.timestamp),
        };
      }

      return {
        posts: [],
        subreddit,
        cached: false,
      };
    }
  }

  /**
   * Get trending posts for a category by aggregating from mapped subreddits
   */
  async getCategoryTrending(category: ResearchCategory, limit: number = 10): Promise<RedditPost[]> {
    const subreddits = CATEGORY_TO_SUBREDDITS[category] || [];

    if (subreddits.length === 0) {
      return [];
    }

    const allPosts: RedditPost[] = [];
    const seenIds = new Set<string>();

    // Fetch from multiple subreddits for this category
    for (const subreddit of subreddits.slice(0, 3)) { // Top 3 subreddits per category
      try {
        const response = await this.getSubredditPosts(subreddit, 'hot', 10);
        for (const post of response.posts) {
          if (!seenIds.has(post.id)) {
            seenIds.add(post.id);
            allPosts.push(post);
          }
        }
      } catch (error) {
        logger.warn({ error, subreddit }, 'Failed to fetch from subreddit');
      }
    }

    // Sort by score and return top N
    allPosts.sort((a, b) => b.score - a.score);
    return allPosts.slice(0, limit);
  }

  /**
   * Extract trending topics from Reddit posts
   */
  extractTrendingTopics(posts: RedditPost[]): string[] {
    const topics: string[] = [];

    for (const post of posts) {
      // Clean title - remove Reddit-specific formatting
      let topic = post.title
        .replace(/\[.*?\]/g, '') // Remove tags like [Serious]
        .replace(/\(.*?\)/g, '') // Remove parentheticals
        .replace(/ELI5:|TIL:|CMV:|AITA:/gi, '') // Remove common prefixes
        .trim();

      // Skip if too short or too long
      if (topic.length < 10 || topic.length > 150) {
        continue;
      }

      // Prioritize controversial posts (more likely to be debate-worthy)
      if (post.isControversial || post.numComments > 100) {
        topics.unshift(topic); // Add to front
      } else {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Get all trending topics across all categories
   */
  async getAllTrendingTopics(limit: number = 15): Promise<string[]> {
    try {
      // Fetch from r/all for maximum coverage
      const response = await this.getSubredditPosts('all', 'hot', 50);

      // Also fetch controversial for debate-worthy topics
      const controversialResponse = await this.getSubredditPosts('all', 'controversial', 25);

      const allPosts = [...response.posts, ...controversialResponse.posts];

      // Deduplicate by ID
      const uniquePosts = Array.from(
        new Map(allPosts.map(p => [p.id, p])).values()
      );

      // Extract topics
      const topics = this.extractTrendingTopics(uniquePosts);

      return topics.slice(0, limit);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch all trending topics from Reddit');
      return [];
    }
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Reddit cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedSubreddits: number;
    oldestCacheAge?: number;
  } {
    let oldestTimestamp = Date.now();

    for (const entry of this.cache.values()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      cachedSubreddits: this.cache.size,
      oldestCacheAge: this.cache.size > 0
        ? Math.round((Date.now() - oldestTimestamp) / 1000 / 60)
        : undefined,
    };
  }
}

// Singleton instance
let defaultClient: RedditClient | null = null;

/**
 * Get the default Reddit client instance
 */
export function getRedditClient(): RedditClient {
  if (!defaultClient) {
    defaultClient = new RedditClient();
  }
  return defaultClient;
}

/**
 * Create a new Reddit client
 */
export function createRedditClient(): RedditClient {
  return new RedditClient();
}
