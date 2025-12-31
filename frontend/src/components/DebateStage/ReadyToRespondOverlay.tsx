/**
 * ReadyToRespondOverlay Component
 *
 * Inline prompt that appears at the bottom of CenterStage after AI completes
 * their turn, prompting the human user to click "Ready to Respond" before
 * showing the input form. Non-blocking so users can still read the AI content.
 */

import React from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import styles from './ReadyToRespondOverlay.module.css';

interface ReadyToRespondOverlayProps {
  /** The type of response expected (e.g., "Opening Statement", "Rebuttal") */
  promptType: string;
  /** Current debate phase for context */
  phase: string;
  /** Callback when user clicks the Ready button */
  onReady: () => void;
}

export const ReadyToRespondOverlay: React.FC<ReadyToRespondOverlayProps> = ({
  promptType,
  onReady,
}) => {
  return (
    <div className={styles.readyPrompt}>
      <div className={styles.promptContent}>
        <Badge variant="primary" className={styles.badge}>
          Your Turn
        </Badge>
        <span className={styles.promptText}>
          Time for your {promptType}
        </span>
      </div>
      <Button
        variant="primary"
        size="md"
        className={styles.readyButton}
        onClick={onReady}
      >
        I'm Ready to Respond
        <svg
          className={styles.arrow}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Button>
    </div>
  );
};

export default ReadyToRespondOverlay;
