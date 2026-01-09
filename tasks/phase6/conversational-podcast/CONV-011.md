# CONV-011: SSE Manager Integration

**Task ID:** CONV-011
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** S (2-4 hours)
**Dependencies:** CONV-010 (Control Routes)
**Status:** Done

---

## Context

This task extends the existing SSE Manager to support conversation-specific events and client management. The SSE Manager already handles debate events; this adds conversation event types and broadcast methods.

**References:**
- [CONV-010](./CONV-010.md) - Control routes that use SSE
- Existing: `backend/src/services/sse/sse-manager.ts`
- Existing: `backend/src/types/sse.ts`

---

## Requirements

### Acceptance Criteria

- [x] Add conversation event types to SSE type definitions
- [x] Add `addConversationClient()` method to SSE Manager
- [x] Add `removeConversationClient()` method
- [x] Add `broadcastToConversation()` method
- [x] Update existing SSE Manager to handle conversation clients
- [x] Add conversation client tracking (separate from debate clients)

---

## Implementation Guide

### Update SSE Types

Update `backend/src/types/sse.ts`:

```typescript
/**
 * Conversation SSE event types
 */
export type ConversationSSEEventType =
  | 'connection_established'
  | 'conversation_started'
  | 'conversation_utterance'
  | 'conversation_token'
  | 'conversation_speaker_changed'
  | 'conversation_context_updated'
  | 'conversation_paused'
  | 'conversation_resumed'
  | 'conversation_completed'
  | 'conversation_error';

/**
 * Conversation utterance event payload
 */
export interface ConversationUtteranceEvent {
  sessionId: string;
  speakerName: string;
  personaSlug: string;
  content: string;
  isHost: boolean;
  turnCount: number;
  timestamp: number;
}

/**
 * Conversation token event payload (for streaming)
 */
export interface ConversationTokenEvent {
  participantId: string;
  personaSlug: string;
  personaName: string;
  segment: string;
  token: string;
}

/**
 * Conversation speaker changed event
 */
export interface ConversationSpeakerChangedEvent {
  sessionId: string;
  speakerId: string;
  speakerName: string;
  personaSlug?: string;
}

/**
 * Conversation context update event
 */
export interface ConversationContextUpdateEvent {
  sessionId: string;
  summary: string;
  turnCount: number;
}

/**
 * All conversation event payloads
 */
export type ConversationSSEEventPayload =
  | ConversationUtteranceEvent
  | ConversationTokenEvent
  | ConversationSpeakerChangedEvent
  | ConversationContextUpdateEvent
  | Record<string, unknown>;
```

### Update SSE Manager

Update `backend/src/services/sse/sse-manager.ts`:

```typescript
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import type {
  ConversationSSEEventType,
  ConversationSSEEventPayload,
} from '../../types/sse.js';

const logger = pino({
  name: 'sse-manager',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Client info for tracking
 */
interface SSEClient {
  id: string;
  response: Response;
  connectedAt: number;
}

/**
 * SSE Manager class
 *
 * Manages Server-Sent Events connections for debates and conversations.
 */
export class SSEManager {
  // Existing debate clients
  private debateClients: Map<string, Map<string, SSEClient>> = new Map();

  // New: Conversation clients
  private conversationClients: Map<string, Map<string, SSEClient>> = new Map();

  // =========================================================================
  // EXISTING DEBATE METHODS (keep as is)
  // =========================================================================

  addDebateClient(debateId: string, response: Response): string {
    const clientId = uuidv4();
    const client: SSEClient = {
      id: clientId,
      response,
      connectedAt: Date.now(),
    };

    if (!this.debateClients.has(debateId)) {
      this.debateClients.set(debateId, new Map());
    }
    this.debateClients.get(debateId)!.set(clientId, client);

    logger.debug({ debateId, clientId }, 'Debate SSE client connected');
    return clientId;
  }

  removeDebateClient(debateId: string, clientId: string): void {
    const clients = this.debateClients.get(debateId);
    if (clients) {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.debateClients.delete(debateId);
      }
    }
    logger.debug({ debateId, clientId }, 'Debate SSE client disconnected');
  }

  broadcastToDebate(debateId: string, event: string, data: unknown): void {
    const clients = this.debateClients.get(debateId);
    if (!clients || clients.size === 0) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    clients.forEach((client) => {
      try {
        client.response.write(message);
      } catch (error) {
        logger.warn({ error, debateId, clientId: client.id }, 'Failed to send to debate client');
        this.removeDebateClient(debateId, client.id);
      }
    });
  }

  // =========================================================================
  // NEW: CONVERSATION METHODS
  // =========================================================================

  /**
   * Add a client to a conversation's SSE stream
   */
  addConversationClient(sessionId: string, response: Response): string {
    const clientId = uuidv4();
    const client: SSEClient = {
      id: clientId,
      response,
      connectedAt: Date.now(),
    };

    if (!this.conversationClients.has(sessionId)) {
      this.conversationClients.set(sessionId, new Map());
    }
    this.conversationClients.get(sessionId)!.set(clientId, client);

    logger.debug({
      sessionId,
      clientId,
      totalClients: this.conversationClients.get(sessionId)!.size,
    }, 'Conversation SSE client connected');

    return clientId;
  }

  /**
   * Remove a client from a conversation's SSE stream
   */
  removeConversationClient(sessionId: string, clientId: string): void {
    const clients = this.conversationClients.get(sessionId);
    if (clients) {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.conversationClients.delete(sessionId);
      }
    }
    logger.debug({ sessionId, clientId }, 'Conversation SSE client disconnected');
  }

  /**
   * Broadcast an event to all clients of a conversation
   */
  broadcastToConversation(
    sessionId: string,
    eventType: ConversationSSEEventType,
    data: ConversationSSEEventPayload
  ): void {
    const clients = this.conversationClients.get(sessionId);
    if (!clients || clients.size === 0) {
      logger.trace({ sessionId, eventType }, 'No clients to broadcast to');
      return;
    }

    const message = `event: ${eventType}\ndata: ${JSON.stringify({
      type: eventType,
      ...data,
      timestamp: Date.now(),
    })}\n\n`;

    let successCount = 0;
    const failedClients: string[] = [];

    clients.forEach((client) => {
      try {
        client.response.write(message);
        successCount++;
      } catch (error) {
        logger.warn({
          error,
          sessionId,
          clientId: client.id,
        }, 'Failed to send to conversation client');
        failedClients.push(client.id);
      }
    });

    // Clean up failed clients
    for (const clientId of failedClients) {
      this.removeConversationClient(sessionId, clientId);
    }

    logger.trace({
      sessionId,
      eventType,
      successCount,
      failedCount: failedClients.length,
    }, 'Broadcast to conversation');
  }

  /**
   * Get count of clients for a conversation
   */
  getConversationClientCount(sessionId: string): number {
    return this.conversationClients.get(sessionId)?.size || 0;
  }

  /**
   * Check if a conversation has any connected clients
   */
  hasConversationClients(sessionId: string): boolean {
    return this.getConversationClientCount(sessionId) > 0;
  }

  /**
   * Send a heartbeat to keep connections alive
   */
  sendConversationHeartbeat(sessionId: string): void {
    this.broadcastToConversation(sessionId, 'connection_established', {
      type: 'heartbeat',
      sessionId,
    } as any);
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Get statistics about connected clients
   */
  getStats(): {
    debates: { count: number; clients: number };
    conversations: { count: number; clients: number };
  } {
    let debateClients = 0;
    this.debateClients.forEach((clients) => {
      debateClients += clients.size;
    });

    let conversationClients = 0;
    this.conversationClients.forEach((clients) => {
      conversationClients += clients.size;
    });

    return {
      debates: {
        count: this.debateClients.size,
        clients: debateClients,
      },
      conversations: {
        count: this.conversationClients.size,
        clients: conversationClients,
      },
    };
  }

  /**
   * Clean up stale connections (call periodically)
   */
  cleanupStaleConnections(maxAgeMs: number = 3600000): void {
    const now = Date.now();

    // Clean debate clients
    this.debateClients.forEach((clients, debateId) => {
      clients.forEach((client, clientId) => {
        if (now - client.connectedAt > maxAgeMs) {
          logger.info({ debateId, clientId, age: now - client.connectedAt }, 'Removing stale debate client');
          this.removeDebateClient(debateId, clientId);
        }
      });
    });

    // Clean conversation clients
    this.conversationClients.forEach((clients, sessionId) => {
      clients.forEach((client, clientId) => {
        if (now - client.connectedAt > maxAgeMs) {
          logger.info({ sessionId, clientId, age: now - client.connectedAt }, 'Removing stale conversation client');
          this.removeConversationClient(sessionId, clientId);
        }
      });
    });
  }
}

// Singleton export
export const sseManager = new SSEManager();
```

---

## Validation

### How to Test

1. Create a test to verify SSE client management:
   ```typescript
   import { SSEManager } from './sse-manager';

   const manager = new SSEManager();

   // Mock response object
   const mockRes = {
     write: jest.fn(),
   } as unknown as Response;

   // Add client
   const clientId = manager.addConversationClient('session-1', mockRes);
   expect(manager.getConversationClientCount('session-1')).toBe(1);

   // Broadcast
   manager.broadcastToConversation('session-1', 'conversation_utterance', {
     sessionId: 'session-1',
     speakerName: 'Test',
     personaSlug: 'test',
     content: 'Hello',
     isHost: false,
     turnCount: 1,
     timestamp: Date.now(),
   });

   expect(mockRes.write).toHaveBeenCalled();

   // Remove client
   manager.removeConversationClient('session-1', clientId);
   expect(manager.getConversationClientCount('session-1')).toBe(0);
   ```

2. Integration test with actual SSE endpoint:
   ```bash
   # Terminal 1: Connect to SSE
   curl -N http://localhost:3000/api/conversations/sessions/{id}/stream

   # Terminal 2: Launch conversation
   curl -X POST http://localhost:3000/api/conversations/sessions/{id}/launch

   # Observe events streaming in Terminal 1
   ```

### Definition of Done

- [x] `ConversationSSEEventType` and payloads defined in types
- [x] `addConversationClient()` adds client to session
- [x] `removeConversationClient()` cleans up properly
- [x] `broadcastToConversation()` sends to all session clients
- [x] Failed clients cleaned up automatically
- [x] Stats method reports both debate and conversation clients
- [x] Stale connection cleanup works
- [x] TypeScript compiles without errors
- [x] Integration test passes

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-011 COMPLETE</promise>
```

---

**Estimated Time:** 2-4 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
