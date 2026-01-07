/**
 * Listen Notes API Client
 *
 * Fetches trending podcast topics and best podcasts by genre.
 * Uses caching to stay within free tier limits (300 requests/month).
 */

import pino from 'pino';
import type { ResearchCategory } from '../../types/duelogic-research.js';

const logger = pino({
  name: 'listen-notes-client',
  level: process.env.LOG_LEVEL || 'info',
});

const LISTEN_NOTES_BASE_URL = 'https://listen-api.listennotes.com/api/v2';

// Cache TTLs
const TRENDING_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BEST_PODCASTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Listen Notes genre IDs mapped to Duelogic categories
 */
export const CATEGORY_TO_GENRE_MAP: Record<ResearchCategory, number[]> = {
  technology_ethics: [127], // Technology
  ai_automation: [127], // Technology
  climate_environment: [107], // Science
  politics_governance: [99, 117], // News, Government
  bioethics_medicine: [107, 88], // Science, Health & Fitness
  economics_inequality: [93, 67], // Business, News
  social_justice: [122], // Society & Culture
  international_relations: [99, 117], // News, Government
  privacy_surveillance: [127], // Technology
  education_culture: [111, 122], // Education, Society & Culture
};

/**
 * Genre ID to name mapping for display
 */
export const GENRE_NAMES: Record<number, string> = {
  67: 'News',
  88: 'Health & Fitness',
  93: 'Business',
  99: 'News',
  107: 'Science',
  111: 'Education',
  117: 'Government',
  122: 'Society & Culture',
  127: 'Technology',
};

export interface TrendingSearch {
  term: string;
}

export interface TrendingSearchesResponse {
  terms: string[];
  cached: boolean;
  cachedAt?: Date;
}

export interface PodcastBasic {
  id: string;
  title: string;
  description: string;
  publisher: string;
  thumbnail: string;
  listennotes_url: string;
  total_episodes: number;
  genre_ids: number[];
}

export interface BestPodcastsResponse {
  id: number;
  name: string;
  podcasts: PodcastBasic[];
  cached: boolean;
  cachedAt?: Date;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class ListenNotesClient {
  private apiKey: string;
  private trendingCache: CacheEntry<string[]> | null = null;
  private bestPodcastsCache: Map<number, CacheEntry<PodcastBasic[]>> = new Map();

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LISTEN_NOTES_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('Listen Notes API key not configured - trending features will be disabled');
    } else {
      logger.info('Listen Notes client initialized');
    }
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Fetch trending search terms
   * Cached for 6 hours to conserve API quota
   */
  async getTrendingSearches(): Promise<TrendingSearchesResponse> {
    // Check cache first
    if (this.trendingCache) {
      const age = Date.now() - this.trendingCache.timestamp;
      if (age < TRENDING_CACHE_TTL_MS) {
        logger.debug({ cacheAge: Math.round(age / 1000 / 60) }, 'Returning cached trending searches');
        return {
          terms: this.trendingCache.data,
          cached: true,
          cachedAt: new Date(this.trendingCache.timestamp),
        };
      }
    }

    if (!this.isConfigured()) {
      logger.warn('Listen Notes not configured, returning empty trends');
      return { terms: [], cached: false };
    }

    try {
      logger.info('Fetching trending searches from Listen Notes');

      const response = await fetch(`${LISTEN_NOTES_BASE_URL}/trending_searches`, {
        headers: {
          'X-ListenAPI-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, 'Listen Notes API error');
        throw new Error(`Listen Notes API error: ${response.status}`);
      }

      const data = await response.json() as { terms?: string[] };
      const terms: string[] = data.terms || [];

      // Update cache
      this.trendingCache = {
        data: terms,
        timestamp: Date.now(),
      };

      logger.info({ termCount: terms.length }, 'Fetched trending searches');

      return {
        terms,
        cached: false,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to fetch trending searches');

      // Return cached data if available, even if stale
      if (this.trendingCache) {
        logger.info('Returning stale cache due to error');
        return {
          terms: this.trendingCache.data,
          cached: true,
          cachedAt: new Date(this.trendingCache.timestamp),
        };
      }

      return { terms: [], cached: false };
    }
  }

  /**
   * Fetch best podcasts for a genre
   * Cached for 24 hours to conserve API quota
   */
  async getBestPodcasts(genreId: number, page: number = 1): Promise<BestPodcastsResponse> {
    const cacheKey = genreId;

    // Check cache first
    const cached = this.bestPodcastsCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < BEST_PODCASTS_CACHE_TTL_MS) {
        logger.debug({ genreId, cacheAge: Math.round(age / 1000 / 60) }, 'Returning cached best podcasts');
        return {
          id: genreId,
          name: GENRE_NAMES[genreId] || 'Unknown',
          podcasts: cached.data,
          cached: true,
          cachedAt: new Date(cached.timestamp),
        };
      }
    }

    if (!this.isConfigured()) {
      logger.warn('Listen Notes not configured, returning empty podcasts');
      return {
        id: genreId,
        name: GENRE_NAMES[genreId] || 'Unknown',
        podcasts: [],
        cached: false,
      };
    }

    try {
      logger.info({ genreId }, 'Fetching best podcasts from Listen Notes');

      const response = await fetch(
        `${LISTEN_NOTES_BASE_URL}/best_podcasts?genre_id=${genreId}&page=${page}&safe_mode=1`,
        {
          headers: {
            'X-ListenAPI-Key': this.apiKey,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, 'Listen Notes API error');
        throw new Error(`Listen Notes API error: ${response.status}`);
      }

      const data = await response.json() as { id?: number; name?: string; podcasts?: any[] };

      const podcasts: PodcastBasic[] = (data.podcasts || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description?.slice(0, 500) || '',
        publisher: p.publisher,
        thumbnail: p.thumbnail,
        listennotes_url: p.listennotes_url,
        total_episodes: p.total_episodes,
        genre_ids: p.genre_ids || [],
      }));

      // Update cache
      this.bestPodcastsCache.set(cacheKey, {
        data: podcasts,
        timestamp: Date.now(),
      });

      logger.info({ genreId, podcastCount: podcasts.length }, 'Fetched best podcasts');

      return {
        id: data.id ?? genreId,
        name: data.name || GENRE_NAMES[genreId] || 'Unknown',
        podcasts,
        cached: false,
      };
    } catch (error) {
      logger.error({ error, genreId }, 'Failed to fetch best podcasts');

      // Return cached data if available, even if stale
      if (cached) {
        logger.info('Returning stale cache due to error');
        return {
          id: genreId,
          name: GENRE_NAMES[genreId] || 'Unknown',
          podcasts: cached.data,
          cached: true,
          cachedAt: new Date(cached.timestamp),
        };
      }

      return {
        id: genreId,
        name: GENRE_NAMES[genreId] || 'Unknown',
        podcasts: [],
        cached: false,
      };
    }
  }

  /**
   * Get best podcasts for a Duelogic category
   * Aggregates from all mapped genres
   */
  async getBestPodcastsForCategory(category: ResearchCategory): Promise<PodcastBasic[]> {
    const genreIds = CATEGORY_TO_GENRE_MAP[category] || [];

    if (genreIds.length === 0) {
      return [];
    }

    const results: PodcastBasic[] = [];
    const seenIds = new Set<string>();

    for (const genreId of genreIds) {
      const response = await this.getBestPodcasts(genreId);
      for (const podcast of response.podcasts) {
        if (!seenIds.has(podcast.id)) {
          seenIds.add(podcast.id);
          results.push(podcast);
        }
      }
    }

    return results;
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.trendingCache = null;
    this.bestPodcastsCache.clear();
    logger.info('Listen Notes cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    trendingCached: boolean;
    trendingAge?: number;
    bestPodcastsCachedGenres: number;
  } {
    return {
      trendingCached: !!this.trendingCache,
      trendingAge: this.trendingCache
        ? Math.round((Date.now() - this.trendingCache.timestamp) / 1000 / 60)
        : undefined,
      bestPodcastsCachedGenres: this.bestPodcastsCache.size,
    };
  }
}

// Singleton instance
let defaultClient: ListenNotesClient | null = null;

/**
 * Get the default Listen Notes client instance
 */
export function getListenNotesClient(): ListenNotesClient {
  if (!defaultClient) {
    defaultClient = new ListenNotesClient();
  }
  return defaultClient;
}

/**
 * Create a new Listen Notes client with custom configuration
 */
export function createListenNotesClient(apiKey?: string): ListenNotesClient {
  return new ListenNotesClient(apiKey);
}
