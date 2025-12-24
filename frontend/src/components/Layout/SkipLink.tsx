/**
 * SkipLink - Accessibility skip navigation link
 */

import React from 'react';
import styles from './SkipLink.module.css';

interface SkipLinkProps {
  href: string;
  children: React.ReactNode;
}

export const SkipLink: React.FC<SkipLinkProps> = ({ href, children }) => {
  return (
    <a href={href} className={styles.skipLink}>
      {children}
    </a>
  );
};

export default SkipLink;
