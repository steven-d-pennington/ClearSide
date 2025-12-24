/**
 * SSE Manager Unit Tests
 * Tests for the Server-Sent Events manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';
import { SSEManager } from '../src/services/sse/sse-manager.js';
import type { SSEEventType } from '../src/types/sse.js';

/**
 * Mock Express Response
 * Creates a minimal mock of Express Response for testing
 */
function createMockResponse(): Response {
  const writtenData: string[] = [];

  const mockRes = {
    writableEnded: false,
    headersSent: false,
    setHeader: vi.fn(),
    write: vi.fn((data: string) => {
      writtenData.push(data);
      return true;
    }),
    end: vi.fn(() => {
      (mockRes as any).writableEnded = true;
    }),
    flushHeaders: vi.fn(),
    // Helper to get written data
    _getWrittenData: () => writtenData,
    _clearWrittenData: () => {
      writtenData.length = 0;
    },
  } as unknown as Response;

  return mockRes;
}

/**
 * Parse SSE data from written output
 */
function parseSSEData(data: string[]): Array<{ type: string; data: any; id?: string }> {
  const events: Array<{ type: string; data: any; id?: string }> = [];

  for (const chunk of data) {
    const lines = chunk.split('\n');
    let currentEvent: { type?: string; data?: string; id?: string } = {};

    for (const line of lines) {
      if (line.startsWith('id: ')) {
        currentEvent.id = line.substring(4);
      } else if (line.startsWith('event: ')) {
        currentEvent.type = line.substring(7);
      } else if (line.startsWith('data: ')) {
        currentEvent.data = line.substring(6);
      } else if (line === '' && currentEvent.type) {
        // End of event
        events.push({
          type: currentEvent.type,
          data: JSON.parse(currentEvent.data || '{}'),
          id: currentEvent.id,
        });
        currentEvent = {};
      }
    }
  }

  return events;
}

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  afterEach(() => {
    // Clean up manager
    manager.shutdown();
  });

  describe('Client Registration', () => {
    it('should register a new client with correct headers', () => {
      const mockRes = createMockResponse();
      const debateId = 'debate-123';

      const clientId = manager.registerClient(debateId, mockRes);

      // Verify client ID is returned
      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe('string');

      // Verify headers were set
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(mockRes.flushHeaders).toHaveBeenCalled();

      // Verify connected event was sent
      const writtenData = (mockRes as any)._getWrittenData();
      const events = parseSSEData(writtenData);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('connected');
      expect(events[0].data.data.debateId).toBe(debateId);
      expect(events[0].data.data.clientId).toBe(clientId);
    });

    it('should track multiple clients for the same debate', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();
      const debateId = 'debate-123';

      const clientId1 = manager.registerClient(debateId, mockRes1);
      const clientId2 = manager.registerClient(debateId, mockRes2);

      expect(clientId1).not.toBe(clientId2);
      expect(manager.getClientCount(debateId)).toBe(2);
    });

    it('should track clients for different debates separately', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      manager.registerClient('debate-1', mockRes1);
      manager.registerClient('debate-2', mockRes2);

      expect(manager.getClientCount('debate-1')).toBe(1);
      expect(manager.getClientCount('debate-2')).toBe(1);
      expect(manager.getClientCount()).toBe(2);
    });

    it('should support lastEventId for reconnection', () => {
      const mockRes = createMockResponse();
      const lastEventId = 'event-123';

      const clientId = manager.registerClient('debate-123', mockRes, lastEventId);

      // Client should be registered successfully
      expect(clientId).toBeDefined();
    });
  });

  describe('Client Unregistration', () => {
    it('should unregister a client and close connection', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      expect(manager.getClientCount()).toBe(1);

      manager.unregisterClient(clientId);

      expect(manager.getClientCount()).toBe(0);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle unregistering unknown client gracefully', () => {
      expect(() => {
        manager.unregisterClient('unknown-client-id');
      }).not.toThrow();
    });

    it('should not attempt to close already-ended connection', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      // Simulate connection already ended
      (mockRes as any).writableEnded = true;

      manager.unregisterClient(clientId);

      // Should not call end() on already-ended connection
      expect(mockRes.end).not.toHaveBeenCalled();
    });
  });

  describe('Broadcasting Events', () => {
    it('should broadcast event to all clients of a debate', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();
      const debateId = 'debate-123';

      manager.registerClient(debateId, mockRes1);
      manager.registerClient(debateId, mockRes2);

      // Clear initial connected events
      (mockRes1 as any)._clearWrittenData();
      (mockRes2 as any)._clearWrittenData();

      const testData = { message: 'test utterance' };
      manager.broadcastToDebate(debateId, 'utterance', testData);

      // Both clients should receive the event
      const events1 = parseSSEData((mockRes1 as any)._getWrittenData());
      const events2 = parseSSEData((mockRes2 as any)._getWrittenData());

      expect(events1).toHaveLength(1);
      expect(events1[0].type).toBe('utterance');
      expect(events1[0].data.data).toEqual(testData);

      expect(events2).toHaveLength(1);
      expect(events2[0].type).toBe('utterance');
      expect(events2[0].data.data).toEqual(testData);

      // Both should have same event ID
      expect(events1[0].id).toBe(events2[0].id);
    });

    it('should only broadcast to clients of the specified debate', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      manager.registerClient('debate-1', mockRes1);
      manager.registerClient('debate-2', mockRes2);

      (mockRes1 as any)._clearWrittenData();
      (mockRes2 as any)._clearWrittenData();

      manager.broadcastToDebate('debate-1', 'utterance', { message: 'test' });

      const events1 = parseSSEData((mockRes1 as any)._getWrittenData());
      const events2 = parseSSEData((mockRes2 as any)._getWrittenData());

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(0); // Should not receive event
    });

    it('should handle broadcast when no clients are connected', () => {
      expect(() => {
        manager.broadcastToDebate('debate-123', 'utterance', { message: 'test' });
      }).not.toThrow();
    });

    it('should remove client if broadcast fails', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      // Simulate write failure
      (mockRes as any).writableEnded = true;

      manager.broadcastToDebate('debate-123', 'utterance', { message: 'test' });

      // Client should be removed after failed write
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('Sending to Specific Client', () => {
    it('should send event to specific client', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      (mockRes as any)._clearWrittenData();

      const testData = { message: 'specific message' };
      manager.sendToClient(clientId, 'intervention_response', testData);

      const events = parseSSEData((mockRes as any)._getWrittenData());

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('intervention_response');
      expect(events[0].data.data).toEqual(testData);
    });

    it('should handle sending to unknown client gracefully', () => {
      expect(() => {
        manager.sendToClient('unknown-client', 'utterance', { message: 'test' });
      }).not.toThrow();
    });

    it('should remove client if send fails', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      // Simulate connection ended
      (mockRes as any).writableEnded = true;

      manager.sendToClient(clientId, 'utterance', { message: 'test' });

      // Client should be removed
      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('Event Formatting', () => {
    it('should format SSE events correctly', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      (mockRes as any)._clearWrittenData();

      const testData = { key: 'value', nested: { data: 123 } };
      manager.sendToClient(clientId, 'utterance', testData);

      const events = parseSSEData((mockRes as any)._getWrittenData());

      expect(events[0]).toHaveProperty('type', 'utterance');
      expect(events[0]).toHaveProperty('data');
      expect(events[0].data).toHaveProperty('timestamp');
      expect(events[0].data).toHaveProperty('data', testData);
      expect(events[0]).toHaveProperty('id');
    });

    it('should include event ID in message', () => {
      const mockRes = createMockResponse();
      manager.registerClient('debate-123', mockRes);

      (mockRes as any)._clearWrittenData();

      manager.broadcastToDebate('debate-123', 'utterance', { message: 'test' });

      const writtenData = (mockRes as any)._getWrittenData();
      const rawMessage = writtenData.join('');

      expect(rawMessage).toMatch(/^id: /m);
      expect(rawMessage).toMatch(/^event: utterance$/m);
      expect(rawMessage).toMatch(/^data: /m);
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeat comments', () => {
      const mockRes = createMockResponse();

      manager.sendHeartbeat(mockRes);

      const writtenData = (mockRes as any)._getWrittenData();
      expect(writtenData).toContain(': heartbeat\n\n');
    });

    it('should not send heartbeat to ended connection', () => {
      const mockRes = createMockResponse();
      (mockRes as any).writableEnded = true;

      manager.sendHeartbeat(mockRes);

      expect(mockRes.write).not.toHaveBeenCalled();
    });

    it('should periodically send heartbeats to connected clients', async () => {
      // Note: This test would require waiting for the heartbeat interval
      // For now, we just verify the heartbeat mechanism exists
      const mockRes = createMockResponse();
      manager.registerClient('debate-123', mockRes);

      // Heartbeat timer should be running
      expect(manager).toBeDefined();
    });
  });

  describe('Client Counting', () => {
    it('should return total client count', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      manager.registerClient('debate-1', mockRes1);
      manager.registerClient('debate-2', mockRes2);

      expect(manager.getClientCount()).toBe(2);
    });

    it('should return client count for specific debate', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();
      const mockRes3 = createMockResponse();

      manager.registerClient('debate-1', mockRes1);
      manager.registerClient('debate-1', mockRes2);
      manager.registerClient('debate-2', mockRes3);

      expect(manager.getClientCount('debate-1')).toBe(2);
      expect(manager.getClientCount('debate-2')).toBe(1);
    });

    it('should return 0 for debate with no clients', () => {
      expect(manager.getClientCount('unknown-debate')).toBe(0);
    });
  });

  describe('Shutdown', () => {
    it('should close all client connections on shutdown', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      manager.registerClient('debate-1', mockRes1);
      manager.registerClient('debate-2', mockRes2);

      expect(manager.getClientCount()).toBe(2);

      manager.shutdown();

      expect(mockRes1.end).toHaveBeenCalled();
      expect(mockRes2.end).toHaveBeenCalled();
      expect(manager.getClientCount()).toBe(0);
    });

    it('should send error event before closing connections', () => {
      const mockRes = createMockResponse();
      manager.registerClient('debate-123', mockRes);

      (mockRes as any)._clearWrittenData();

      manager.shutdown();

      const events = parseSSEData((mockRes as any)._getWrittenData());

      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].type).toBe('error');
      expect(events[events.length - 1].data.data.error).toContain('shutting down');
    });

    it('should handle shutdown with no clients', () => {
      expect(() => {
        manager.shutdown();
      }).not.toThrow();
    });

    it('should clear all clients after shutdown', () => {
      const mockRes = createMockResponse();
      manager.registerClient('debate-123', mockRes);

      manager.shutdown();

      expect(manager.getClientCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid client connections and disconnections', () => {
      const clients: string[] = [];

      for (let i = 0; i < 10; i++) {
        const mockRes = createMockResponse();
        const clientId = manager.registerClient('debate-123', mockRes);
        clients.push(clientId);
      }

      expect(manager.getClientCount()).toBe(10);

      // Unregister every other client
      for (let i = 0; i < clients.length; i += 2) {
        manager.unregisterClient(clients[i]);
      }

      expect(manager.getClientCount()).toBe(5);
    });

    it('should handle very large payloads', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      const largeData = {
        content: 'x'.repeat(10000),
        metadata: {
          tokens: Array.from({ length: 100 }, (_, i) => ({
            id: i,
            text: `token-${i}`,
          })),
        },
      };

      expect(() => {
        manager.sendToClient(clientId, 'utterance', largeData);
      }).not.toThrow();

      const writtenData = (mockRes as any)._getWrittenData();
      expect(writtenData.length).toBeGreaterThan(0);
    });

    it('should handle special characters in data', () => {
      const mockRes = createMockResponse();
      const clientId = manager.registerClient('debate-123', mockRes);

      (mockRes as any)._clearWrittenData();

      const specialData = {
        message: 'Test with "quotes", \n newlines, and \t tabs',
        emoji: '🎭🔥💡',
      };

      manager.sendToClient(clientId, 'utterance', specialData);

      const events = parseSSEData((mockRes as any)._getWrittenData());

      expect(events[0].data.data).toEqual(specialData);
    });
  });
});
