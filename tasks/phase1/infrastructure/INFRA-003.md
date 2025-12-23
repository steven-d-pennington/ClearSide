# INFRA-003: Implement Server-Sent Events (SSE) Layer

**Priority:** P0
**Estimate:** L
**Labels:** `infrastructure`, `backend`, `streaming`
**Status:** 🟢 TO DO

---

## Context

ClearSide streams debate utterances in real-time to the frontend using Server-Sent Events (SSE). This is a critical component that enables users to watch debates unfold live. SSE was chosen over WebSocket for simplicity (one-directional, auto-reconnect, standard HTTP).

**References:**
- [Real-Time Architecture Spec](../../../docs/09_real-time-architecture.md) - Section 3 "SSE Streaming Layer"
- [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md) - FR-203, NFR-102

---

## Requirements

### Acceptance Criteria

- [ ] Implement SSE endpoint `/api/debates/:debateId/stream`
- [ ] Set proper headers (Content-Type: text/event-stream, Cache-Control, Connection)
- [ ] Send heartbeat events every 15 seconds to keep connection alive
- [ ] Register/unregister SSE clients per debate
- [ ] Broadcast utterances to all connected clients for a debate
- [ ] Handle client disconnect gracefully
- [ ] Support reconnection with Last-Event-ID
- [ ] Emit different event types (utterance, phase_transition, intervention, complete)
- [ ] Add structured logging for connection/disconnection
- [ ] Test with multiple concurrent clients

### Functional Requirements

From [REQUIREMENTS.md](../../../docs/REQUIREMENTS.md):
- **FR-203**: System SHALL stream debate utterances in real-time via SSE
- **FR-204**: System SHALL display current phase and speaker at all times
- **NFR-102**: Streaming latency < 500ms

---

## Implementation Guide

### Backend (Express.js Example)

```typescript
// src/services/sse/sse-manager.ts
import { Response } from 'express';

interface SSEClient {
  id: string;
  debateId: string;
  res: Response;
  connectedAt: Date;
}

export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor() {
    // Send heartbeat every 15 seconds to all clients
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach(client => {
        this.sendHeartbeat(client.res);
      });
    }, 15000);
  }

  registerClient(debateId: string, res: Response): string {
    const clientId = `${debateId}-${Date.now()}-${Math.random()}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    this.clients.set(clientId, {
      id: clientId,
      debateId,
      res,
      connectedAt: new Date()
    });

    // Send initial connection event
    this.sendEvent(res, 'connected', { clientId, debateId });

    console.log(`[SSE] Client ${clientId} connected to debate ${debateId}`);
    console.log(`[SSE] Total clients: ${this.clients.size}`);

    return clientId;
  }

  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log(`[SSE] Client ${clientId} disconnected`);
      console.log(`[SSE] Total clients: ${this.clients.size}`);
    }
  }

  broadcastToDebate(debateId: string, eventType: string, data: any): void {
    let count = 0;
    this.clients.forEach(client => {
      if (client.debateId === debateId) {
        this.sendEvent(client.res, eventType, data);
        count++;
      }
    });
    console.log(`[SSE] Broadcasted ${eventType} to ${count} clients for debate ${debateId}`);
  }

  sendToClient(clientId: string, eventType: string, data: any): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.sendEvent(client.res, eventType, data);
    }
  }

  private sendEvent(res: Response, eventType: string, data: any): void {
    const eventData = JSON.stringify(data);
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${eventData}\n\n`);
  }

  private sendHeartbeat(res: Response): void {
    res.write(':heartbeat\n\n');
  }

  getClientCount(debateId?: string): number {
    if (!debateId) return this.clients.size;

    let count = 0;
    this.clients.forEach(client => {
      if (client.debateId === debateId) count++;
    });
    return count;
  }

  shutdown(): void {
    clearInterval(this.heartbeatInterval);
    this.clients.forEach(client => {
      client.res.end();
    });
    this.clients.clear();
  }
}

// Singleton instance
export const sseManager = new SSEManager();
```

### Express Route

```typescript
// src/routes/debate-routes.ts
import express from 'express';
import { sseManager } from '../services/sse/sse-manager';

const router = express.Router();

router.get('/debates/:debateId/stream', (req, res) => {
  const { debateId } = req.params;

  // Register client
  const clientId = sseManager.registerClient(debateId, res);

  // Handle client disconnect
  req.on('close', () => {
    sseManager.unregisterClient(clientId);
  });

  // Handle errors
  res.on('error', (err) => {
    console.error('[SSE] Stream error:', err);
    sseManager.unregisterClient(clientId);
  });
});

export default router;
```

### Broadcasting Events

```typescript
// src/services/debate/debate-orchestrator.ts
import { sseManager } from '../sse/sse-manager';

export class DebateOrchestrator {
  async emitUtterance(debateId: string, utterance: any): Promise<void> {
    // Save to database
    await this.utteranceRepo.create(/* ... */);

    // Broadcast to SSE clients
    sseManager.broadcastToDebate(debateId, 'utterance', {
      id: utterance.id,
      timestamp: utterance.timestamp,
      phase: utterance.phase,
      speaker: utterance.speaker,
      content: utterance.content
    });
  }

  async transitionPhase(debateId: string, newPhase: string): Promise<void> {
    // Update state machine
    await this.stateMachine.transition(newPhase);

    // Broadcast phase transition
    sseManager.broadcastToDebate(debateId, 'phase_transition', {
      phase: newPhase,
      timestamp: Date.now()
    });
  }
}
```

### Frontend (React + EventSource)

```typescript
// src/hooks/useDebateStream.ts
import { useEffect, useState } from 'react';

interface Utterance {
  id: string;
  timestamp: number;
  phase: string;
  speaker: string;
  content: string;
}

export function useDebateStream(debateId: string) {
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/debates/${debateId}/stream`);

    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      console.log('Connected to SSE stream:', data);
      setIsConnected(true);
    });

    eventSource.addEventListener('utterance', (e) => {
      const utterance = JSON.parse(e.data);
      setUtterances(prev => [...prev, utterance]);
    });

    eventSource.addEventListener('phase_transition', (e) => {
      const { phase } = JSON.parse(e.data);
      setCurrentPhase(phase);
    });

    eventSource.addEventListener('complete', (e) => {
      console.log('Debate completed');
      eventSource.close();
    });

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setError('Connection lost. Reconnecting...');
      setIsConnected(false);
      // EventSource auto-reconnects
    });

    return () => {
      eventSource.close();
    };
  }, [debateId]);

  return { utterances, currentPhase, isConnected, error };
}
```

### Event Types

```typescript
// Event type definitions
export type SSEEventType =
  | 'connected'
  | 'utterance'
  | 'phase_transition'
  | 'intervention_response'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: any;
  timestamp: number;
}
```

---

## Dependencies

- **INFRA-002**: Database must be set up to persist utterances

---

## Validation

### How to Test

1. **Manual Testing:**
   ```bash
   # Start server
   npm run dev

   # In browser console:
   const es = new EventSource('/api/debates/550e8400-e29b-41d4-a716-446655440000/stream');
   es.addEventListener('utterance', (e) => console.log('Utterance:', e.data));
   es.addEventListener('phase_transition', (e) => console.log('Phase:', e.data));
   ```

2. **Load Testing:**
   ```bash
   # Use Artillery or similar tool
   artillery quick --duration 60 --rate 10 http://localhost:3000/api/debates/test-id/stream
   ```

3. **Reconnection Testing:**
   - Open SSE connection
   - Disconnect network
   - Reconnect network
   - Verify EventSource auto-reconnects

4. **Multiple Clients:**
   - Open 3 browser tabs with same debate ID
   - Trigger utterance broadcast
   - Verify all tabs receive the event

### Definition of Done

- [ ] SSE endpoint implemented with proper headers
- [ ] Client registration/unregistration working
- [ ] Heartbeat keeps connections alive
- [ ] Broadcasting to debate works with multiple clients
- [ ] Frontend hook connects and receives events
- [ ] Auto-reconnection works after disconnect
- [ ] Latency < 500ms from broadcast to client receipt
- [ ] Handles 50+ concurrent clients per debate
- [ ] Error handling and logging in place
- [ ] Integration test with mock debate orchestrator

---

## Notes

- **SSE vs WebSocket**: SSE chosen for simplicity, one-direction sufficient, built-in reconnect
- **Heartbeat**: Required to detect disconnects and prevent proxy timeouts
- **Buffering**: Disable nginx/proxy buffering with `X-Accel-Buffering: no` header
- **Reconnection**: EventSource automatically reconnects with `Last-Event-ID` header
- **Scalability**: For 1000+ concurrent clients, consider Redis pub/sub for horizontal scaling
- **CORS**: Ensure CORS headers allow EventSource connections from frontend domain
- **Compression**: SSE doesn't compress well; keep event payloads small

---

**Estimated Time:** 8-10 hours
**Assigned To:** _Unassigned_
**Created:** 2025-12-23
**Updated:** 2025-12-23
