/**
 * Footer - App footer with links and copyright
 */

import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Footer.module.css';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.brand}>
            <p className={styles.tagline}>Think both sides. Decide with clarity.</p>
            <p className={styles.copyright}>
              {currentYear} ClearSide. All rights reserved.
            </p>
          </div>

          <div className={styles.links}>
            <div className={styles.linkGroup}>
              <h3 className={styles.linkGroupTitle}>Product</h3>
              <ul className={styles.linkList}>
                <li>
                  <Link to="/how-it-works">How It Works</Link>
                </li>
                <li>
                  <Link to="/examples">Examples</Link>
                </li>
              </ul>
            </div>

            <div className={styles.linkGroup}>
              <h3 className={styles.linkGroupTitle}>Legal</h3>
              <ul className={styles.linkList}>
                <li>
                  <Link to="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link to="/terms">Terms</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
