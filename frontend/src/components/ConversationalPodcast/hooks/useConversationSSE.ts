/**
 * useConversationSSE Hook
 *
 * Manages SSE connection for real-time conversation updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface SSEEvent {
  type: string;
  sessionId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

interface UseConversationSSEResult {
  isConnected: boolean;
  lastEvent: SSEEvent | null;
  connectionError: string | null;
  reconnect: () => void;
}

export function useConversationSSE(sessionId: string): UseConversationSSEResult {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!sessionId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${API_BASE_URL}/api/conversations/sessions/${sessionId}/stream`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = () => {
      setIsConnected(false);

      // Only attempt reconnect if we haven't exceeded max attempts
      if (reconnectAttempts.current < maxReconnectAttempts) {
        setConnectionError('Connection lost. Reconnecting...');

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current += 1;

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      } else {
        setConnectionError('Connection lost. Please refresh the page.');
      }
    };

    // Generic message handler for all events
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent(data);
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    // Named event handlers for specific event types
    const eventTypes = [
      'conversation_connected',
      'conversation_started',
      'conversation_utterance',
      'conversation_token',
      'conversation_speaker_changed',
      'conversation_context_updated',
      'conversation_paused',
      'conversation_resumed',
      'conversation_completed',
      'conversation_error',
      'conversation_host_message',
      'conversation_signal',
      'conversation_awaiting_advance',
    ];

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent({ type: eventType, ...data });
        } catch (err) {
          console.error(`Failed to parse ${eventType} event:`, err);
        }
      });
    });
  }, [sessionId]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    connectionError,
    reconnect,
  };
}

export default useConversationSSE;
