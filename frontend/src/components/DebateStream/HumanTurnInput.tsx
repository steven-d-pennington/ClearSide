/**
 * HumanTurnInput Component
 *
 * Displays when it's the human's turn to respond in a human participation debate.
 * Provides a text input area for the human to submit their argument.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDebateStore, selectHumanInputRequest, selectIsAwaitingHumanInput } from '../../stores/debate-store';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import styles from './HumanTurnInput.module.css';

// Character limits
const MIN_CHARS = 50;
const MAX_CHARS = 5000;

interface HumanTurnInputProps {
  className?: string;
}

export const HumanTurnInput: React.FC<HumanTurnInputProps> = ({ className = '' }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get state from store
  const isAwaitingHumanInput = useDebateStore(selectIsAwaitingHumanInput);
  const humanInputRequest = useDebateStore(selectHumanInputRequest);
  const submitHumanTurn = useDebateStore((state) => state.submitHumanTurn);

  // Focus textarea when component appears
  useEffect(() => {
    if (isAwaitingHumanInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isAwaitingHumanInput]);

  // Calculate remaining time if there's a timeout
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  useEffect(() => {
    if (!humanInputRequest?.timeoutMs || !humanInputRequest?.timestampMs) {
      setRemainingTime(null);
      return;
    }

    const updateTime = () => {
      const elapsed = Date.now() - humanInputRequest.timestampMs;
      const remaining = Math.max(0, humanInputRequest.timeoutMs! - elapsed);
      setRemainingTime(remaining);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [humanInputRequest?.timeoutMs, humanInputRequest?.timestampMs]);

  // Format remaining time as MM:SS
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle content change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    setError(null);
  }, []);

  // Validate content
  const validateContent = useCallback((text: string): string | null => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      return `Your argument must be at least ${MIN_CHARS} characters (${trimmed.length}/${MIN_CHARS})`;
    }
    if (trimmed.length > MAX_CHARS) {
      return `Your argument must be at most ${MAX_CHARS} characters (${trimmed.length}/${MAX_CHARS})`;
    }
    return null;
  }, []);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    const validationError = validateContent(content);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitHumanTurn(content.trim());
      // Clear content on success
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [content, validateContent, submitHumanTurn]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Don't render if not awaiting input
  if (!isAwaitingHumanInput || !humanInputRequest) {
    return null;
  }

  const charCount = content.trim().length;
  const isValidLength = charCount >= MIN_CHARS && charCount <= MAX_CHARS;

  return (
    <div className={`${styles.humanTurnInput} ${className}`}>
      <div className={styles.header}>
        <div className={styles.promptInfo}>
          <span className={styles.promptType}>{humanInputRequest.promptType}</span>
          <span className={styles.yourTurn}>Your Turn</span>
        </div>
        {remainingTime !== null && (
          <div className={`${styles.timer} ${remainingTime < 30000 ? styles.timerWarning : ''}`}>
            {formatTime(remainingTime)}
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter your argument here... (minimum 50 characters)"
          rows={6}
          disabled={isSubmitting}
          error={error || undefined}
          fullWidth
          className={styles.textarea}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.charCount}>
          <span className={charCount < MIN_CHARS ? styles.charCountWarning : isValidLength ? styles.charCountValid : styles.charCountError}>
            {charCount}
          </span>
          <span className={styles.charCountMax}>/ {MAX_CHARS} characters</span>
          {charCount < MIN_CHARS && (
            <span className={styles.charCountHint}>(min {MIN_CHARS})</span>
          )}
        </div>
        <div className={styles.actions}>
          <span className={styles.shortcutHint}>Ctrl+Enter to submit</span>
          <Button
            onClick={handleSubmit}
            disabled={!isValidLength || isSubmitting}
            loading={isSubmitting}
            variant="primary"
            size="md"
          >
            Submit Argument
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HumanTurnInput;
