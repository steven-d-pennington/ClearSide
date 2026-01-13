# AUTO-003: RSS Feed Generation Service

**Task ID:** AUTO-003
**Phase:** Phase 9
**Category:** Podcast Automation
**Priority:** P0
**Estimated Effort:** M (4-5 hours)
**Dependencies:** AUTO-001 (database schema)
**Status:** Ready

---

## Context

Spotify, Apple Podcasts, and all major podcast platforms work via RSS feeds. The automation pipeline needs to generate an RSS 2.0 feed with iTunes/Podcast 2.0 namespaces that updates automatically when new episodes are published.

**References:**
- RSS 2.0 Specification: https://www.rssboard.org/rss-specification
- Apple Podcasts RSS Requirements: https://podcasters.apple.com/support/823-podcast-requirements
- Podcast 2.0 Namespace: https://podcastindex.org/namespace/1.0
- Existing database schema: `published_episodes` and `podcast_feed_metadata` tables

---

## Requirements

### Acceptance Criteria

- [ ] Install `podcast` npm package for RSS generation
- [ ] Create `RSSFeedService` class
- [ ] Query `published_episodes` and `podcast_feed_metadata` tables
- [ ] Generate RSS 2.0 XML with iTunes tags
- [ ] Write feed to `/public/rss/podcast.xml`
- [ ] Create `/rss/podcast.xml` endpoint with caching
- [ ] Validate feed at https://podba.se/validate/
- [ ] Test: Feed loads in Apple Podcasts app

### Functional Requirements

**RSS Feed Requirements:**
- RSS 2.0 compliant
- iTunes namespace tags for Apple Podcasts
- Episode-level metadata (title, description, duration, size)
- Show-level metadata (author, artwork, categories)
- GUID uniqueness for each episode
- Enclosure URL with proper MIME type

**Performance:**
- Cache feed for 1 hour (prevent regeneration on every request)
- Limit to 100 most recent episodes
- File-based storage for reliability

---

## Implementation

### 1. Install Dependencies

```bash
cd backend
npm install podcast
npm install --save-dev @types/podcast
```

### 2. RSS Feed Service

**File:** `backend/src/services/podcast/rss-feed-service.ts` (new)

```typescript
/**
 * RSS Feed Service
 *
 * Generates RSS 2.0 podcast feed with iTunes and Podcast 2.0 namespaces.
 * Reads from published_episodes and podcast_feed_metadata tables.
 */

import { Podcast } from 'podcast';
import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';
import { pool } from '../../db/connection.js';

const logger = pino({
  name: 'rss-feed-service',
  level: process.env.LOG_LEVEL || 'info',
});

export class RSSFeedService {
  private feedPath: string;

  constructor() {
    // Store feed in public directory for direct access
    this.feedPath = path.join(process.cwd(), 'public', 'rss', 'podcast.xml');
  }

  /**
   * Generate RSS feed from database
   */
  async generateFeed(): Promise<void> {
    try {
      logger.info('Generating RSS feed');

      // Load podcast show metadata
      const metaResult = await pool.query(`
        SELECT * FROM podcast_feed_metadata LIMIT 1
      `);

      if (metaResult.rows.length === 0) {
        throw new Error('Podcast feed metadata not found in database');
      }

      const meta = metaResult.rows[0];

      // Load published episodes (most recent 100)
      const episodesResult = await pool.query(`
        SELECT
          id,
          title,
          description,
          tags,
          explicit,
          guid,
          pub_date,
          audio_url,
          duration_seconds,
          file_size_bytes,
          rss_published_at
        FROM published_episodes
        WHERE rss_published_at IS NOT NULL
        ORDER BY pub_date DESC
        LIMIT 100
      `);

      const episodes = episodesResult.rows;

      logger.info({ episodeCount: episodes.length }, 'Loaded episodes from database');

      // Create feed
      const feed = new Podcast({
        title: meta.title,
        description: meta.description,
        feedUrl: meta.feed_url,
        siteUrl: meta.website_url || 'https://clearside.app',
        imageUrl: meta.image_url,
        author: meta.author,
        managingEditor: meta.email,
        webMaster: meta.email,
        copyright: meta.copyright || `Copyright © ${new Date().getFullYear()} ${meta.author}`,
        language: meta.language,
        categories: meta.categories || [],
        pubDate: new Date(),
        ttl: 60, // Cache for 1 hour

        // iTunes tags
        itunesAuthor: meta.author,
        itunesSubtitle: meta.description.slice(0, 100),
        itunesSummary: meta.description,
        itunesOwner: {
          name: meta.author,
          email: meta.email,
        },
        itunesExplicit: false, // Show-level explicit flag
        itunesType: 'episodic', // or 'serial'
        itunesImage: meta.image_url,
        itunesCategory: this.formatItunesCategories(meta.categories),
      });

      // Add episodes
      for (const ep of episodes) {
        feed.addItem({
          title: ep.title,
          description: ep.description,
          url: this.ensureAbsoluteUrl(ep.audio_url),
          guid: ep.guid,
          date: ep.pub_date,
          enclosure: {
            url: this.ensureAbsoluteUrl(ep.audio_url),
            size: ep.file_size_bytes,
            type: 'audio/mpeg',
          },
          itunesDuration: ep.duration_seconds,
          itunesKeywords: ep.tags,
          itunesExplicit: ep.explicit,
          itunesSubtitle: ep.description.slice(0, 100),
          itunesSummary: ep.description,
        });
      }

      // Generate XML
      const xml = feed.buildXml();

      // Write to file
      await fs.mkdir(path.dirname(this.feedPath), { recursive: true });
      await fs.writeFile(this.feedPath, xml, 'utf-8');

      logger.info({
        episodeCount: episodes.length,
        feedPath: this.feedPath,
      }, 'RSS feed generated successfully');

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate RSS feed');
      throw error;
    }
  }

  /**
   * Read existing feed XML
   */
  async readFeed(): Promise<string> {
    try {
      return await fs.readFile(this.feedPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Feed doesn't exist yet, generate it
        await this.generateFeed();
        return await fs.readFile(this.feedPath, 'utf-8');
      }
      throw error;
    }
  }

  /**
   * Ensure URL is absolute (for audio enclosures)
   */
  private ensureAbsoluteUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Relative URL - prepend base URL
    const baseUrl = process.env.PODCAST_FEED_BASE_URL || 'https://clearside.app';
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * Format categories for iTunes
   */
  private formatItunesCategories(categories: string[]): any[] {
    // iTunes expects nested category structure
    // Example: { text: 'Technology', subcats: [] }
    return categories.map(cat => ({
      text: cat,
      subcats: [],
    }));
  }
}

/**
 * Factory function
 */
export function createRSSFeedService(): RSSFeedService {
  return new RSSFeedService();
}
```

### 3. RSS Routes

**File:** `backend/src/routes/rss-routes.ts` (new)

```typescript
/**
 * RSS Routes
 *
 * Serves podcast RSS feed at /rss/podcast.xml
 */

import { Router, Request, Response } from 'express';
import { createRSSFeedService } from '../services/podcast/rss-feed-service.js';
import pino from 'pino';

const logger = pino({
  name: 'rss-routes',
  level: process.env.LOG_LEVEL || 'info',
});

export function createRSSRoutes(): Router {
  const router = Router();
  const rssService = createRSSFeedService();

  /**
   * GET /rss/podcast.xml
   * Serves podcast RSS feed
   */
  router.get('/podcast.xml', async (req: Request, res: Response) => {
    try {
      const xml = await rssService.readFeed();

      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600'); // Cache 1 hour
      res.send(xml);

      logger.info('RSS feed served');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to serve RSS feed');
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  });

  return router;
}
```

### 4. Register Routes in Index

**File:** `backend/src/index.ts` (modify)

Add RSS routes:

```typescript
import { createRSSRoutes } from './routes/rss-routes.js';

// ... existing code ...

// Register routes
app.use('/api/debates', debateRoutes);
app.use('/api/configurations', configRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/rss', createRSSRoutes()); // NEW

// Serve static files (for audio, images, RSS feed)
app.use('/exports', express.static('exports'));
app.use('/public', express.static('public')); // NEW (for artwork, RSS feed)
```

---

## Testing

### Test 1: Generate Feed Manually

```typescript
import { createRSSFeedService } from './rss-feed-service.js';

const service = createRSSFeedService();
await service.generateFeed();

console.log('Feed generated at: public/rss/podcast.xml');
```

### Test 2: Validate Feed

1. Start server: `npm run dev`
2. Visit: http://localhost:3001/api/rss/podcast.xml
3. Copy XML content
4. Validate at: https://podba.se/validate/
5. Check for errors

### Test 3: Test in Apple Podcasts

1. Get public URL: `https://clearside.app/rss/podcast.xml`
2. Open Apple Podcasts app
3. Go to Library → Shows → "Add a Show by URL"
4. Paste URL
5. Verify show metadata and episodes appear

### Test 4: Episode Updates

```typescript
// Insert test episode
await pool.query(`
  INSERT INTO published_episodes (
    podcast_job_id, title, description, tags, guid, pub_date,
    audio_url, duration_seconds, file_size_bytes, rss_published_at
  ) VALUES (
    'test-job-id', 'Test Episode', 'Test description',
    ARRAY['test'], 'test-guid-123', NOW(),
    '/exports/podcasts/test.mp3', 600, 5242880, NOW()
  )
`);

// Regenerate feed
await service.generateFeed();

// Verify new episode in feed
const xml = await service.readFeed();
expect(xml).toContain('Test Episode');
```

---

## Definition of Done

- [ ] `podcast` npm package installed
- [ ] `RSSFeedService` class implemented
- [ ] Queries database for episodes and metadata
- [ ] Generates valid RSS 2.0 XML
- [ ] iTunes tags included
- [ ] Feed written to `/public/rss/podcast.xml`
- [ ] RSS route serves feed with caching
- [ ] Feed validates at podba.se
- [ ] Test episode appears in Apple Podcasts
- [ ] Documentation complete

---

## Notes

**RSS Feed Validators:**
- https://podba.se/validate/ - Comprehensive validator
- https://castfeedvalidator.com/ - Apple Podcasts specific

**Required Podcast Artwork:**
- Size: 1400x1400 to 3000x3000 pixels
- Format: JPEG or PNG
- File: `public/artwork.jpg`

**iTunes Categories:**
- Technology
- Education
- News
- Science & Medicine
- Society & Culture
- Business

**Episode GUID:**
- Must be unique and permanent
- UUID format recommended
- Never changes even if episode is updated
