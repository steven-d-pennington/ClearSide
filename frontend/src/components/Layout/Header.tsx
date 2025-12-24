/**
 * Header - App header with logo and navigation
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navigation } from './Navigation';
import { MobileMenu } from './MobileMenu';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile]);

  return (
    <header
      className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}
      role="banner"
    >
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoText}>ClearSide</span>
          <span className={styles.tagline}>Think both sides</span>
        </Link>

        {isMobile ? (
          <>
            <button
              className={styles.hamburger}
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <span className={styles.hamburgerLine} />
              <span className={styles.hamburgerLine} />
              <span className={styles.hamburgerLine} />
            </button>
            <MobileMenu
              isOpen={isMobileMenuOpen}
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </>
        ) : (
          <Navigation />
        )}
      </div>
    </header>
  );
};

export default Header;
