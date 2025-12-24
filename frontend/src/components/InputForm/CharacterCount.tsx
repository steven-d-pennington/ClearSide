import React from 'react';
import styles from './CharacterCount.module.css';

interface CharacterCountProps {
  current: number;
  max: number;
  className?: string;
}

export const CharacterCount: React.FC<CharacterCountProps> = ({
  current,
  max,
  className = '',
}) => {
  const percentage = (current / max) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = current >= max;

  return (
    <span
      className={`${styles.count} ${isNearLimit ? styles.warning : ''} ${isAtLimit ? styles.error : ''} ${className}`}
      aria-live="polite"
    >
      {current.toLocaleString()} / {max.toLocaleString()}
    </span>
  );
};

export default CharacterCount;
