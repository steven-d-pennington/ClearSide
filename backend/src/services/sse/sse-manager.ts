/**
 * Server-Sent Events (SSE) Manager
 * Handles real-time streaming of debate events to connected clients
 */

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';
import type { SSEClient, SSEEvent, SSEEventType } from '../../types/sse.js';

const logger = createLogger({ module: 'SSEManager' });

/**
 * SSEManager Class
 * Manages all SSE client connections and broadcasts events to clients
 */
export class SSEManager {
  /** Map of client ID to SSEClient */
  private clients: Map<string, SSEClient> = new Map();

  /** Heartbeat interval in milliseconds (15 seconds) */
  private readonly heartbeatInterval = 15000;

  /** Heartbeat timer */
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Register a new SSE client connection
   * Sets proper SSE headers and adds client to tracking
   *
   * @param debateId - ID of the debate the client wants to watch
   * @param res - Express response object
   * @param lastEventId - Optional last event ID for reconnection
   * @returns Client ID for the newly registered client
   */
  registerClient(debateId: string, res: Response, lastEventId?: string): string {
    const clientId = uuidv4();

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Enable CORS for SSE
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type');

    // Ensure connection stays open
    res.flushHeaders();

    // Create client record
    const client: SSEClient = {
      id: clientId,
      debateId,
      res,
      connectedAt: new Date(),
      lastEventId: lastEventId || null,
    };

    this.clients.set(clientId, client);

    logger.info(
      { clientId, debateId, totalClients: this.clients.size },
      'SSE client registered'
    );

    // Send initial connected event
    this.sendToClient(clientId, 'connected', {
      debateId,
      clientId,
      message: 'Connected to debate stream',
    });

    return clientId;
  }

  /**
   * Unregister a client connection
   * Removes client from tracking and closes connection
   *
   * @param clientId - ID of the client to unregister
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);

    if (!client) {
      logger.warn({ clientId }, 'Attempted to unregister unknown client');
      return;
    }

    // Remove from tracking
    this.clients.delete(clientId);

    // Close the connection if not already closed
    if (!client.res.writableEnded) {
      client.res.end();
    }

    logger.info(
      { clientId, debateId: client.debateId, totalClients: this.clients.size },
      'SSE client unregistered'
    );
  }

  /**
   * Broadcast an event to all clients watching a specific debate
   *
   * @param debateId - ID of the debate
   * @param eventType - Type of SSE event
   * @param data - Event payload data
   */
  broadcastToDebate<T = unknown>(
    debateId: string,
    eventType: SSEEventType,
    data: T
  ): void {
    const debateClients = Array.from(this.clients.values()).filter(
      (client) => client.debateId === debateId
    );

    if (debateClients.length === 0) {
      logger.debug({ debateId, eventType }, 'No clients to broadcast to');
      return;
    }

    logger.debug(
      { debateId, eventType, clientCount: debateClients.length },
      'Broadcasting event to debate clients'
    );

    // Generate a unique event ID for this broadcast
    const eventId = uuidv4();

    // Send to all clients, handling failures gracefully
    for (const client of debateClients) {
      try {
        this.sendEvent(client.res, eventType, data, eventId);

        // Update last event ID for reconnection support
        client.lastEventId = eventId;
      } catch (error) {
        logger.error(
          { clientId: client.id, debateId, error },
          'Failed to send event to client'
        );

        // Remove client if connection is broken
        this.unregisterClient(client.id);
      }
    }
  }

  /**
   * Send an event to a specific client
   *
   * @param clientId - ID of the client
   * @param eventType - Type of SSE event
   * @param data - Event payload data
   */
  sendToClient<T = unknown>(
    clientId: string,
    eventType: SSEEventType,
    data: T
  ): void {
    const client = this.clients.get(clientId);

    if (!client) {
      logger.warn({ clientId, eventType }, 'Client not found');
      return;
    }

    try {
      const eventId = uuidv4();
      this.sendEvent(client.res, eventType, data, eventId);
      client.lastEventId = eventId;
    } catch (error) {
      logger.error({ clientId, eventType, error }, 'Failed to send event to client');
      this.unregisterClient(clientId);
    }
  }

  /**
   * Send a formatted SSE event to a response stream
   * Follows SSE specification: https://html.spec.whatwg.org/multipage/server-sent-events.html
   *
   * @param res - Express response object
   * @param eventType - Type of SSE event
   * @param data - Event payload data
   * @param eventId - Optional event ID for reconnection support
   */
  sendEvent<T = unknown>(
    res: Response,
    eventType: SSEEventType,
    data: T,
    eventId?: string
  ): void {
    // Check if response is still writable
    if (res.writableEnded) {
      throw new Error('Response stream already ended');
    }

    // Create SSE event structure
    const event: SSEEvent<T> = {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
      ...(eventId && { id: eventId }),
    };

    // Format SSE message
    let message = '';

    if (eventId) {
      message += `id: ${eventId}\n`;
    }

    message += `event: ${eventType}\n`;
    message += `data: ${JSON.stringify(event)}\n\n`;

    // Write to stream
    res.write(message);
  }

  /**
   * Send a heartbeat comment to keep connection alive
   * Follows SSE spec for comments (lines starting with ':')
   *
   * @param res - Express response object
   */
  sendHeartbeat(res: Response): void {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }

  /**
   * Get the number of connected clients
   *
   * @param debateId - Optional debate ID to filter by
   * @returns Number of connected clients
   */
  getClientCount(debateId?: string): number {
    if (!debateId) {
      return this.clients.size;
    }

    return Array.from(this.clients.values()).filter(
      (client) => client.debateId === debateId
    ).length;
  }

  /**
   * Start heartbeat interval to keep connections alive
   * Prevents proxy timeouts and detects disconnected clients
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const clientsToRemove: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        try {
          this.sendHeartbeat(client.res);
        } catch (error) {
          logger.warn({ clientId, error }, 'Heartbeat failed, marking client for removal');
          clientsToRemove.push(clientId);
        }
      }

      // Clean up failed clients
      for (const clientId of clientsToRemove) {
        this.unregisterClient(clientId);
      }

      if (this.clients.size > 0) {
        logger.debug({ clientCount: this.clients.size }, 'Heartbeat sent to all clients');
      }
    }, this.heartbeatInterval);

    logger.info({ interval: this.heartbeatInterval }, 'Heartbeat started');
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('Heartbeat stopped');
    }
  }

  /**
   * Shutdown the SSE manager
   * Closes all client connections and stops heartbeat
   */
  shutdown(): void {
    logger.info({ clientCount: this.clients.size }, 'Shutting down SSE manager');

    // Stop heartbeat
    this.stopHeartbeat();

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        // Send final event
        this.sendEvent(client.res, 'error', {
          debateId: client.debateId,
          error: 'Server shutting down',
          timestamp: new Date().toISOString(),
        });

        // Close connection
        client.res.end();
      } catch (error) {
        logger.error({ clientId, error }, 'Error closing client connection');
      }
    }

    // Clear all clients
    this.clients.clear();

    logger.info('SSE manager shutdown complete');
  }
}

/**
 * Singleton instance of SSE Manager
 * Export this instance to use throughout the application
 */
export const sseManager = new SSEManager();
