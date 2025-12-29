/**
 * TokenStream Component
 *
 * Animated display of streaming tokens from AI speakers.
 * Shows text appearing character-by-character with a typewriter effect.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import styles from './TokenStream.module.css';

interface TokenStreamProps {
  content: string;
  isStreaming: boolean;
  speed?: 'slow' | 'normal' | 'fast';
  showCursor?: boolean;
  onComplete?: () => void;
  className?: string;
}

export const TokenStream: React.FC<TokenStreamProps> = ({
  content,
  isStreaming,
  speed = 'normal',
  showCursor = true,
  onComplete,
  className = '',
}) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const contentRef = useRef(content);
  const animationRef = useRef<number | null>(null);
  const indexRef = useRef(0);

  // Speed configuration (characters per frame)
  const getSpeedConfig = useCallback(() => {
    switch (speed) {
      case 'slow':
        return { charsPerFrame: 1, frameDelay: 50 };
      case 'fast':
        return { charsPerFrame: 4, frameDelay: 16 };
      default:
        return { charsPerFrame: 2, frameDelay: 30 };
    }
  }, [speed]);

  // Handle content updates
  useEffect(() => {
    const prevContent = contentRef.current;
    contentRef.current = content;

    // If new content is appended, continue from where we left off
    if (content.startsWith(prevContent)) {
      // Content was appended, keep going
    } else {
      // Content changed entirely, reset
      indexRef.current = 0;
      setDisplayedContent('');
      setIsComplete(false);
    }
  }, [content]);

  // Animation loop
  useEffect(() => {
    if (!isStreaming && indexRef.current >= content.length) {
      if (!isComplete) {
        setIsComplete(true);
        onComplete?.();
      }
      return;
    }

    const { charsPerFrame, frameDelay } = getSpeedConfig();

    const animate = () => {
      if (indexRef.current < content.length) {
        const nextIndex = Math.min(
          indexRef.current + charsPerFrame,
          content.length
        );
        setDisplayedContent(content.slice(0, nextIndex));
        indexRef.current = nextIndex;

        animationRef.current = window.setTimeout(animate, frameDelay);
      } else if (!isStreaming && !isComplete) {
        setIsComplete(true);
        onComplete?.();
      }
    };

    animationRef.current = window.setTimeout(animate, frameDelay);

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [content, isStreaming, isComplete, getSpeedConfig, onComplete]);

  // Calculate words and characters for stats
  const wordCount = displayedContent.split(/\s+/).filter(Boolean).length;
  const charCount = displayedContent.length;

  return (
    <div className={`${styles.streamContainer} ${className}`}>
      <div className={styles.textWrapper}>
        <p className={styles.text}>
          {displayedContent}
          {showCursor && (isStreaming || indexRef.current < content.length) && (
            <span className={styles.cursor}>|</span>
          )}
        </p>
      </div>

      {/* Optional stats display */}
      {isStreaming && (
        <div className={styles.stats}>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{wordCount}</span>
            <span className={styles.statLabel}>words</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{charCount}</span>
            <span className={styles.statLabel}>chars</span>
          </span>
          <span className={`${styles.statItem} ${styles.streaming}`}>
            <span className={styles.dot} />
            <span className={styles.statLabel}>streaming</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default TokenStream;
