/**
 * TranscriptPanel - Scrolling conversation transcript container
 * Displays utterances with auto-scroll to latest content
 */

import { useRef, useEffect } from 'react';
import { UtteranceCard } from './UtteranceCard';
import styles from './TranscriptPanel.module.css';
import type { ConversationUtterance } from '../../../types/conversation';

export interface ParticipantInfo {
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
  getSpeakerInfo: (participantId: string | undefined) => ParticipantInfo | null;
}

// Host info constant
const HOST_INFO: ParticipantInfo = {
  id: 'host',
  name: 'Host',
  personaSlug: 'host',
  avatarEmoji: '🎙️',
};

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
      (currentSpeaker === 'Host' ? HOST_INFO : null)
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
          const isHost = utterance.isHostUtterance || utterance.participantId === 'host';
          const speaker = isHost
            ? HOST_INFO
            : getSpeakerInfo(utterance.participantId);
          return (
            <UtteranceCard
              key={utterance.id || index}
              utterance={utterance}
              speaker={speaker}
              isHost={isHost}
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
              isHostUtterance: streamingSpeaker.id === 'host',
              timestampMs: Date.now(),
              isKeyPoint: false,
              segmentType: 'discussion',
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
