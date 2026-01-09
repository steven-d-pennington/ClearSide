/**
 * UtteranceCard - Individual utterance display component
 * Shows speaker info, content, key points, and streaming indicator
 */

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
          <span className={styles.keyPointBadge}>Key Point</span>
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
