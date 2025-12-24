import { vi } from 'vitest';

type SSEListener = (event: MessageEvent) => void;

interface MockEventSourceInstance {
  url: string;
  onopen: (() => void) | null;
  onmessage: SSEListener | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: SSEListener) => void;
  removeEventListener: (type: string, listener: SSEListener) => void;
  close: () => void;
  readyState: number;
  CONNECTING: number;
  OPEN: number;
  CLOSED: number;
}

export function setupSSEMock() {
  const listeners = new Map<string, Set<SSEListener>>();
  let eventSource: MockEventSourceInstance | null = null;

  const MockEventSource = class implements MockEventSourceInstance {
    url: string;
    onopen: (() => void) | null = null;
    onmessage: SSEListener | null = null;
    onerror: ((event: Event) => void) | null = null;
    readyState = 1; // OPEN
    CONNECTING = 0;
    OPEN = 1;
    CLOSED = 2;

    constructor(url: string) {
      this.url = url;
      eventSource = this;

      // Simulate open event
      setTimeout(() => {
        if (this.onopen) {
          this.onopen();
        }
      }, 0);
    }

    addEventListener(type: string, listener: SSEListener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: SSEListener) {
      listeners.get(type)?.delete(listener);
    }

    close() {
      this.readyState = 2; // CLOSED
    }
  };

  // Mock the global EventSource
  vi.stubGlobal('EventSource', MockEventSource);

  return {
    /**
     * Emit an SSE message to all listeners
     */
    emitMessage: (type: string, data: unknown) => {
      if (!eventSource) return;

      const event = new MessageEvent('message', {
        data: JSON.stringify({ type, payload: data }),
      });

      if (eventSource.onmessage) {
        eventSource.onmessage(event);
      }

      listeners.get('message')?.forEach((listener) => listener(event));
    },

    /**
     * Emit a typed SSE event
     */
    emitTypedEvent: (eventType: string, data: unknown) => {
      if (!eventSource) return;

      const event = new MessageEvent(eventType, {
        data: JSON.stringify(data),
      });

      listeners.get(eventType)?.forEach((listener) => listener(event));
    },

    /**
     * Simulate an SSE error
     */
    emitError: () => {
      if (!eventSource) return;

      const event = new Event('error');
      if (eventSource.onerror) {
        eventSource.onerror(event);
      }
    },

    /**
     * Get the current EventSource instance
     */
    getInstance: () => eventSource,

    /**
     * Cleanup mock
     */
    cleanup: () => {
      listeners.clear();
      eventSource = null;
      vi.unstubAllGlobals();
    },
  };
}
