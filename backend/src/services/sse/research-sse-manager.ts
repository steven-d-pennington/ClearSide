/**
 * Research SSE Manager
 * Handles real-time streaming of research job events to connected clients
 */

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';
import type { SSEEventType } from '../../types/sse.js';

const logger = createLogger({ module: 'ResearchSSEManager' });

interface ResearchSSEClient {
  id: string;
  jobId: string;
  res: Response;
  connectedAt: Date;
}

/**
 * ResearchSSEManager Class
 * Manages SSE connections for research job streaming
 */
export class ResearchSSEManager {
  private clients: Map<string, ResearchSSEClient> = new Map();
  private heartbeatInterval = 15000;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Register a client to watch a research job
   */
  registerClient(jobId: string, res: Response): string {
    const clientId = uuidv4();

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type');
    res.flushHeaders();

    const client: ResearchSSEClient = {
      id: clientId,
      jobId,
      res,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);

    logger.info({ clientId, jobId, totalClients: this.clients.size }, 'Research SSE client registered');

    // Send connected event
    this.sendToClient(clientId, 'research_connected', {
      jobId,
      clientId,
      message: 'Connected to research job stream',
    });

    return clientId;
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clients.delete(clientId);

    if (!client.res.writableEnded) {
      client.res.end();
    }

    logger.info({ clientId, jobId: client.jobId }, 'Research SSE client unregistered');
  }

  /**
   * Broadcast to all clients watching a specific job
   */
  broadcastToJob<T = unknown>(jobId: string, eventType: SSEEventType, data: T): void {
    const jobClients = Array.from(this.clients.values()).filter(
      client => client.jobId === jobId
    );

    if (jobClients.length === 0) {
      logger.debug({ jobId, eventType }, 'No clients to broadcast to for research job');
      return;
    }

    const eventId = uuidv4();

    for (const client of jobClients) {
      try {
        this.sendEvent(client.res, eventType, data, eventId);
      } catch (error) {
        logger.error({ clientId: client.id, jobId, error }, 'Failed to send research event');
        this.unregisterClient(client.id);
      }
    }
  }

  /**
   * Send to a specific client
   */
  sendToClient<T = unknown>(clientId: string, eventType: SSEEventType, data: T): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      this.sendEvent(client.res, eventType, data, uuidv4());
    } catch (error) {
      logger.error({ clientId, eventType, error }, 'Failed to send event to research client');
      this.unregisterClient(clientId);
    }
  }

  /**
   * Send formatted SSE event
   */
  private sendEvent<T = unknown>(
    res: Response,
    eventType: SSEEventType,
    data: T,
    eventId?: string
  ): void {
    if (res.writableEnded) {
      throw new Error('Response stream already ended');
    }

    const sseEvent = {
      event: eventType,
      data,
      timestamp: new Date().toISOString(),
      ...(eventId && { id: eventId }),
    };

    let message = '';
    if (eventId) {
      message += `id: ${eventId}\n`;
    }
    message += `data: ${JSON.stringify(sseEvent)}\n\n`;

    res.write(message);
  }

  /**
   * Get client count for a job
   */
  getClientCount(jobId?: string): number {
    if (!jobId) return this.clients.size;
    return Array.from(this.clients.values()).filter(c => c.jobId === jobId).length;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const toRemove: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        try {
          if (!client.res.writableEnded) {
            client.res.write(': heartbeat\n\n');
          }
        } catch {
          toRemove.push(clientId);
        }
      }

      for (const clientId of toRemove) {
        this.unregisterClient(clientId);
      }
    }, this.heartbeatInterval);
  }

  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // Ignore errors during shutdown
      }
    }

    this.clients.clear();
  }
}

// Singleton instance
export const researchSSEManager = new ResearchSSEManager();
