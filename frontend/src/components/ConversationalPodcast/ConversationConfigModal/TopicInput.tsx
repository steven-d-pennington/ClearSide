/**
 * TopicInput Component
 *
 * Input fields for conversation topic and optional context.
 */

import styles from './ConversationConfigModal.module.css';

interface TopicInputProps {
  topic: string;
  onTopicChange: (topic: string) => void;
  topicContext: string;
  onContextChange: (context: string) => void;
  disabled?: boolean;
}

export default function TopicInput({
  topic,
  onTopicChange,
  topicContext,
  onContextChange,
  disabled,
}: TopicInputProps) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Topic</h3>

      <div className={styles.inputGroup}>
        <label className={styles.label}>What should we discuss?</label>
        <input
          type="text"
          className={styles.input}
          value={topic}
          onChange={e => onTopicChange(e.target.value)}
          placeholder="e.g., The future of AI in healthcare"
          disabled={disabled}
          maxLength={500}
        />
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.label}>Additional context (optional)</label>
        <textarea
          className={styles.textarea}
          value={topicContext}
          onChange={e => onContextChange(e.target.value)}
          placeholder="Any specific angles or questions you want explored..."
          disabled={disabled}
          rows={3}
          maxLength={2000}
        />
      </div>
    </div>
  );
}
