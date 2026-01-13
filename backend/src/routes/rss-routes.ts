/**
 * RSS Routes
 *
 * Serves podcast RSS feed at /rss/podcast.xml
 */

import { Router, type Request, type Response } from 'express';
import { createRSSFeedService } from '../services/podcast/rss-feed-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ module: 'RSSRoutes' });

export function createRSSRoutes(): Router {
  const router = Router();
  const rssService = createRSSFeedService();

  router.get('/podcast.xml', async (_req: Request, res: Response) => {
    try {
      const xml = await rssService.readFeed();

      res.set('Content-Type', 'application/rss+xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(xml);

      logger.info('RSS feed served');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, 'Failed to serve RSS feed');
      res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
  });

  return router;
}
