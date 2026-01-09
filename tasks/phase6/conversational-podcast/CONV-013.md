# CONV-013: ConversationViewer Base Component

**Task ID:** CONV-013
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-011 (SSE), CONV-012 (Config Modal)
**Status:** Done

---

## Context

This task creates the main ConversationViewer page that displays a live or completed podcast conversation. It connects to SSE for real-time updates and provides the layout for transcript, context board, and controls.

**References:**
- [CONV-011](./CONV-011.md) - SSE integration
- [CONV-012](./CONV-012.md) - Config modal
- Existing pattern: `frontend/src/pages/DebatePage.tsx`

---

## Requirements

### Acceptance Criteria

- [x] Create `ConversationViewer` page component
- [x] Connect to SSE stream on mount
- [x] Handle all conversation event types
- [x] Display conversation status (live, paused, completed)
- [x] Layout with transcript panel and sidebar
- [x] Pass events to child components
- [x] Handle errors and reconnection

---

## Implementation Guide

### Directory Structure

```
frontend/src/components/ConversationalPodcast/
├── ConversationViewer/
│   ├── ConversationViewer.tsx
│   ├── ConversationViewer.module.css
│   └── index.ts
```

### Main Viewer Component

Create file: `frontend/src/components/ConversationalPodcast/ConversationViewer/ConversationViewer.tsx`

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TranscriptPanel } from '../TranscriptPanel';
import { ContextBoardPanel } from '../ContextBoardPanel';
import { ControlBar } from '../ControlBar';
import { useConversationSSE } from '../hooks/useConversationSSE';
import styles from './ConversationViewer.module.css';
import type {
  ConversationSession,
  ConversationUtterance,
  ContextBoardState,
  SessionStatus,
} from '../../../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface ParticipantInfo {
  id: string;
  name: string;
  personaSlug: string;
  avatarEmoji: string;
}

export function ConversationViewer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // Session data
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [utterances, setUtterances] = useState<ConversationUtterance[]>([]);
  const [contextBoard, setContextBoard] = useState<ContextBoardState | null>(null);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContextBoard, setShowContextBoard] = useState(true);

  // SSE connection
  const {
    isConnected,
    lastEvent,
    connectionError,
  } = useConversationSSE(sessionId || '');

  // Load initial session data
  useEffect(() => {
    if (!sessionId) return;

    async function loadSession() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}`);
        if (!response.ok) throw new Error('Session not found');

        const data = await response.json();
        setSession(data.session);
        setContextBoard(data.session.contextBoard);

        // Extract participant info
        const participantInfos: ParticipantInfo[] = data.session.participants.map((p: any) => ({
          id: p.id,
          name: p.displayNameOverride || p.persona?.name || 'Unknown',
          personaSlug: p.persona?.slug || '',
          avatarEmoji: p.persona?.avatarEmoji || '🎙️',
        }));
        setParticipants(participantInfos);

        // Load existing utterances if any
        const utterancesRes = await fetch(
          `${API_BASE_URL}/api/conversations/sessions/${sessionId}/utterances`
        );
        if (utterancesRes.ok) {
          const utterancesData = await utterancesRes.json();
          setUtterances(utterancesData.utterances || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [sessionId]);

  // Handle SSE events
  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.type) {
      case 'conversation_started':
        setSession(prev => prev ? { ...prev, status: 'live' } : null);
        break;

      case 'conversation_utterance':
        setUtterances(prev => [...prev, {
          id: Date.now(),
          sessionId: sessionId!,
          participantId: lastEvent.isHost ? 'host' : lastEvent.participantId,
          content: lastEvent.content,
          timestampMs: lastEvent.timestamp,
          isKeyPoint: false,
        }]);
        setStreamingContent('');
        setCurrentSpeaker(null);
        break;

      case 'conversation_token':
        setCurrentSpeaker(lastEvent.personaName);
        setStreamingContent(prev => prev + lastEvent.token);
        break;

      case 'conversation_speaker_changed':
        setCurrentSpeaker(lastEvent.speakerName);
        setStreamingContent('');
        break;

      case 'conversation_context_updated':
        // Refresh context board
        fetchContextBoard();
        break;

      case 'conversation_paused':
        setSession(prev => prev ? { ...prev, status: 'paused' } : null);
        break;

      case 'conversation_resumed':
        setSession(prev => prev ? { ...prev, status: 'live' } : null);
        break;

      case 'conversation_completed':
        setSession(prev => prev ? { ...prev, status: 'completed' } : null);
        break;

      case 'conversation_error':
        setError(lastEvent.error);
        break;
    }
  }, [lastEvent, sessionId]);

  // Fetch context board
  const fetchContextBoard = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/sessions/${sessionId}/context-board`
      );
      if (response.ok) {
        const data = await response.json();
        setContextBoard(data.contextBoard);
      }
    } catch (err) {
      console.error('Failed to fetch context board:', err);
    }
  }, [sessionId]);

  // Control handlers
  const handleAdvance = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/advance`, {
      method: 'POST',
    });
  };

  const handlePause = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/pause`, {
      method: 'POST',
    });
  };

  const handleResume = async () => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
  };

  const handleFlowModeChange = async (mode: string, paceDelayMs?: number) => {
    if (!sessionId) return;
    await fetch(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/flow-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, paceDelayMs }),
    });
  };

  const handleExport = () => {
    if (!sessionId) return;
    window.open(`${API_BASE_URL}/api/conversations/sessions/${sessionId}/transcript?format=md`);
  };

  // Get speaker info helper
  const getSpeakerInfo = (participantId: string): ParticipantInfo | null => {
    if (participantId === 'host') {
      return { id: 'host', name: 'Host', personaSlug: 'host', avatarEmoji: '🎙️' };
    }
    return participants.find(p => p.id === participantId) || null;
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading conversation...</span>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backButton} onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className={styles.sessionInfo}>
            <h1 className={styles.topic}>{session?.topic}</h1>
            <StatusBadge status={session?.status || 'configuring'} />
          </div>
        </div>
        <div className={styles.headerRight}>
          <ConnectionIndicator connected={isConnected} />
          <button
            className={styles.toggleButton}
            onClick={() => setShowContextBoard(!showContextBoard)}
          >
            {showContextBoard ? 'Hide' : 'Show'} Context
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <TranscriptPanel
          utterances={utterances}
          participants={participants}
          currentSpeaker={currentSpeaker}
          streamingContent={streamingContent}
          getSpeakerInfo={getSpeakerInfo}
        />

        {showContextBoard && (
          <ContextBoardPanel
            contextBoard={contextBoard}
            participants={participants}
          />
        )}
      </main>

      <ControlBar
        status={session?.status || 'configuring'}
        flowMode={session?.flowMode || 'manual'}
        onAdvance={handleAdvance}
        onPause={handlePause}
        onResume={handleResume}
        onFlowModeChange={handleFlowModeChange}
        onExport={handleExport}
        turnCount={utterances.length}
      />

      {connectionError && (
        <div className={styles.connectionError}>
          Connection lost. Attempting to reconnect...
        </div>
      )}
    </div>
  );
}

// Sub-components
function StatusBadge({ status }: { status: SessionStatus }) {
  const statusStyles: Record<SessionStatus, string> = {
    configuring: styles.statusConfiguring,
    live: styles.statusLive,
    paused: styles.statusPaused,
    completed: styles.statusCompleted,
  };

  return (
    <span className={`${styles.statusBadge} ${statusStyles[status]}`}>
      {status === 'live' && '● '}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <span className={`${styles.connectionIndicator} ${connected ? styles.connected : styles.disconnected}`}>
      {connected ? '● Connected' : '○ Disconnected'}
    </span>
  );
}

export default ConversationViewer;
```

### SSE Hook

Create file: `frontend/src/components/ConversationalPodcast/hooks/useConversationSSE.ts`

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface SSEEvent {
  type: string;
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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setConnectionError('Connection lost');

      // Attempt reconnect after 3 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    // Handle all event types
    const eventTypes = [
      'connection_established',
      'conversation_started',
      'conversation_utterance',
      'conversation_token',
      'conversation_speaker_changed',
      'conversation_context_updated',
      'conversation_paused',
      'conversation_resumed',
      'conversation_completed',
      'conversation_error',
    ];

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          setLastEvent({ type: eventType, ...data });
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
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
    connect();
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    connectionError,
    reconnect,
  };
}
```

### CSS Module

Create file: `ConversationViewer.module.css`

```css
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.backButton {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.sessionInfo {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.topic {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.statusBadge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.statusConfiguring { background: var(--gray-100); color: var(--gray-700); }
.statusLive { background: var(--green-100); color: var(--green-700); }
.statusPaused { background: var(--yellow-100); color: var(--yellow-700); }
.statusCompleted { background: var(--blue-100); color: var(--blue-700); }

.headerRight {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.connectionIndicator {
  font-size: 0.75rem;
}

.connected { color: var(--green-600); }
.disconnected { color: var(--red-600); }

.toggleButton {
  padding: 0.5rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.loading,
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.connectionError {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.75rem 1.5rem;
  background: var(--yellow-100);
  color: var(--yellow-800);
  border-radius: 8px;
  font-size: 0.875rem;
}
```

---

## Validation

### How to Test

1. Navigate to `/conversation/:sessionId`
2. Verify session data loads
3. Launch conversation and verify SSE events update UI
4. Verify streaming content displays during generation
5. Test pause/resume controls
6. Verify completed conversations display correctly

### Definition of Done

- [x] ConversationViewer loads session data on mount
- [x] SSE connection established and events handled
- [x] Utterances display as they arrive
- [x] Streaming content shows during generation
- [x] Status badge reflects current state
- [x] Connection indicator shows SSE status
- [x] Context board toggleable
- [x] All control handlers work
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-013 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
