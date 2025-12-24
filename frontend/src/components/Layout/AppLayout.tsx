/**
 * AppLayout - Main application shell
 *
 * Provides the overall layout structure with header, main content, and footer.
 */

import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { SkipLink } from './SkipLink';
import styles from './AppLayout.module.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className={styles.appLayout}>
      <SkipLink href="#main-content">Skip to main content</SkipLink>
      <Header />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.container}>{children}</div>
      </main>
      <Footer />
    </div>
  );
};

export default AppLayout;
