import React from 'react';
import styles from './Badge.module.css';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'pro'
  | 'con'
  | 'moderator';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  children,
  className = '',
  dot = false,
}) => {
  return (
    <span
      className={`${styles.badge} ${styles[variant]} ${styles[size]} ${className}`}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
};

export default Badge;
