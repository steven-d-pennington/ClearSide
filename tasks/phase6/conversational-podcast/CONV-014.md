# CONV-014: TranscriptPanel and UtteranceCard

**Task ID:** CONV-014
**Phase:** Phase 6
**Category:** Conversational Podcast
**Priority:** P0
**Estimated Effort:** M (4-8 hours)
**Dependencies:** CONV-013 (Viewer Base)
**Status:** Done

---

## Context

This task creates the TranscriptPanel and UtteranceCard components for displaying the conversation transcript. The panel shows a scrolling list of utterances with speaker badges, key point highlighting, and streaming content display.

**References:**
- [CONV-013](./CONV-013.md) - ConversationViewer base
- Existing pattern: `frontend/src/components/DebateTranscript/`

---

## Requirements

### Acceptance Criteria

- [x] Create `TranscriptPanel` component
- [x] Create `UtteranceCard` for individual utterances
- [x] Display speaker name with avatar emoji
- [x] Show key points with highlighting
- [x] Display topic markers when present
- [x] Show streaming content for current speaker
- [x] Auto-scroll to latest utterance
- [x] Different styling for host vs participants

---

## Implementation Guide

### Directory Structure

```
frontend/src/components/ConversationalPodcast/
├── TranscriptPanel/
│   ├── TranscriptPanel.tsx
│   ├── TranscriptPanel.module.css
│   ├── UtteranceCard.tsx
│   └── index.ts
```

### TranscriptPanel Component

Create file: `frontend/src/components/ConversationalPodcast/TranscriptPanel/TranscriptPanel.tsx`

```tsx
import { useRef, useEffect } from 'react';
import UtteranceCard from './UtteranceCard';
import styles from './TranscriptPanel.module.css';
import type { ConversationUtterance } from '../../../types/conversation';

interface ParticipantInfo {
  id: string;
  name: string;
  personaSlug: string;
  avatarEmoji: string;
}

interface TranscriptPanelProps {
  utterances: ConversationUtterance[];
  participants: ParticipantInfo[];
  currentSpeaker: string | null;
  streamingContent: string;
  getSpeakerInfo: (participantId: string) => ParticipantInfo | null;
}

export function TranscriptPanel({
  utterances,
  participants,
  currentSpeaker,
  streamingContent,
  getSpeakerInfo,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new utterances arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [utterances, streamingContent]);

  // Find speaker info for streaming content
  const streamingSpeaker = currentSpeaker
    ? participants.find(p => p.name === currentSpeaker) ||
      (currentSpeaker === 'Host' ? { id: 'host', name: 'Host', personaSlug: 'host', avatarEmoji: '🎙️' } : null)
    : null;

  return (
    <div className={styles.container} ref={scrollRef}>
      <div className={styles.transcriptContent}>
        {utterances.length === 0 && !streamingContent && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🎙️</span>
            <p>Waiting for conversation to start...</p>
          </div>
        )}

        {utterances.map((utterance, index) => {
          const speaker = getSpeakerInfo(utterance.participantId);
          return (
            <UtteranceCard
              key={utterance.id || index}
              utterance={utterance}
              speaker={speaker}
              isHost={utterance.participantId === 'host'}
            />
          );
        })}

        {streamingContent && streamingSpeaker && (
          <UtteranceCard
            utterance={{
              id: -1,
              sessionId: '',
              participantId: streamingSpeaker.id,
              content: streamingContent,
              timestampMs: Date.now(),
              isKeyPoint: false,
            }}
            speaker={streamingSpeaker}
            isHost={streamingSpeaker.id === 'host'}
            isStreaming
          />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default TranscriptPanel;
```

### UtteranceCard Component

Create file: `UtteranceCard.tsx`

```tsx
import styles from './TranscriptPanel.module.css';
import type { ConversationUtterance } from '../../../types/conversation';

interface ParticipantInfo {
  id: string;
  name: string;
  personaSlug: string;
  avatarEmoji: string;
}

interface UtteranceCardProps {
  utterance: ConversationUtterance;
  speaker: ParticipantInfo | null;
  isHost: boolean;
  isStreaming?: boolean;
}

export function UtteranceCard({
  utterance,
  speaker,
  isHost,
  isStreaming = false,
}: UtteranceCardProps) {
  // Format content with paragraph breaks
  const formatContent = (content: string) => {
    return content.split('\n\n').map((paragraph, i) => (
      <p key={i} className={styles.paragraph}>
        {paragraph}
      </p>
    ));
  };

  // Detect direct addressing in content
  const highlightAddressing = (content: string): React.ReactNode => {
    // Look for patterns like "Name," at the start or ", Name" in text
    const addressPattern = /^([A-Z][a-z]+),|,\s+([A-Z][a-z]+)[?!.,]/g;
    // Simple implementation - could be enhanced
    return content;
  };

  return (
    <div
      className={`
        ${styles.utteranceCard}
        ${isHost ? styles.hostCard : styles.participantCard}
        ${utterance.isKeyPoint ? styles.keyPoint : ''}
        ${isStreaming ? styles.streaming : ''}
      `}
    >
      <div className={styles.speakerHeader}>
        <span className={styles.avatarEmoji}>
          {speaker?.avatarEmoji || '👤'}
        </span>
        <span className={styles.speakerName}>
          {speaker?.name || 'Unknown'}
        </span>
        {isHost && <span className={styles.hostBadge}>Host</span>}
        {utterance.isKeyPoint && (
          <span className={styles.keyPointBadge}>📌 Key Point</span>
        )}
        {isStreaming && (
          <span className={styles.streamingIndicator}>
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
          </span>
        )}
      </div>

      <div className={styles.content}>
        {formatContent(utterance.content)}
      </div>

      {utterance.topicMarker && (
        <div className={styles.topicMarker}>
          Topic: {utterance.topicMarker}
        </div>
      )}

      {!isStreaming && (
        <div className={styles.timestamp}>
          {formatTimestamp(utterance.timestampMs)}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default UtteranceCard;
```

### CSS Module

Create file: `TranscriptPanel.module.css`

```css
.container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background: var(--bg-primary);
}

.transcriptContent {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.emptyIcon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

/* Utterance Card */
.utteranceCard {
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.hostCard {
  background: linear-gradient(135deg, var(--primary-50) 0%, var(--bg-secondary) 100%);
  border-left: 4px solid var(--primary);
}

.participantCard {
  border-left: 4px solid var(--gray-300);
}

.keyPoint {
  border-color: var(--yellow-400);
  background: linear-gradient(135deg, var(--yellow-50) 0%, var(--bg-secondary) 100%);
}

.streaming {
  border-color: var(--green-400);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

/* Speaker Header */
.speakerHeader {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.avatarEmoji {
  font-size: 1.5rem;
}

.speakerName {
  font-weight: 600;
  color: var(--text-primary);
}

.hostBadge {
  padding: 0.125rem 0.5rem;
  background: var(--primary-100);
  color: var(--primary-700);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.keyPointBadge {
  padding: 0.125rem 0.5rem;
  background: var(--yellow-100);
  color: var(--yellow-700);
  border-radius: 4px;
  font-size: 0.75rem;
}

.streamingIndicator {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.typingDot {
  width: 6px;
  height: 6px;
  background: var(--green-500);
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typingDot:nth-child(2) { animation-delay: 0.2s; }
.typingDot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
  30% { opacity: 1; transform: scale(1); }
}

/* Content */
.content {
  color: var(--text-primary);
  line-height: 1.7;
}

.paragraph {
  margin: 0 0 0.75rem 0;
}

.paragraph:last-child {
  margin-bottom: 0;
}

/* Topic Marker */
.topicMarker {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--gray-100);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-style: italic;
}

/* Timestamp */
.timestamp {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Responsive */
@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }

  .utteranceCard {
    padding: 1rem;
  }
}
```

### Export Index

Create file: `index.ts`

```typescript
export { default as TranscriptPanel } from './TranscriptPanel';
export { default as UtteranceCard } from './UtteranceCard';
```

---

## Validation

### How to Test

1. Render TranscriptPanel with test utterances:
   ```tsx
   <TranscriptPanel
     utterances={[
       { id: 1, participantId: 'host', content: 'Welcome everyone!', ... },
       { id: 2, participantId: 'p1', content: 'Thanks for having me.', ... },
     ]}
     participants={[{ id: 'p1', name: 'Professor Clara', ... }]}
     currentSpeaker={null}
     streamingContent=""
     getSpeakerInfo={getSpeakerInfo}
   />
   ```

2. Verify:
   - Host utterances have special styling
   - Participant utterances show avatar and name
   - Key points have highlighting
   - Streaming content shows typing indicator
   - Auto-scrolls to bottom
   - Topic markers display

### Definition of Done

- [x] TranscriptPanel renders utterance list
- [x] UtteranceCard shows speaker info correctly
- [x] Host utterances visually distinct
- [x] Key points highlighted
- [x] Topic markers displayed
- [x] Streaming content shows with animation
- [x] Auto-scroll to bottom works
- [x] Empty state shown when no utterances
- [x] Responsive design works
- [x] TypeScript compiles without errors

---

## Completion Promise

When this task is complete and verified, output:

```
<promise>CONV-014 COMPLETE</promise>
```

---

**Estimated Time:** 4-8 hours
**Assigned To:** _Unassigned_
**Created:** 2026-01-08
**Updated:** 2026-01-08
