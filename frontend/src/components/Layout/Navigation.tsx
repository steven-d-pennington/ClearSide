/**
 * Navigation - Main navigation menu
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Navigation.module.css';

interface NavItem {
  label: string;
  href: string;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Examples', href: '/examples' },
];

export const Navigation: React.FC = () => {
  return (
    <nav className={styles.navigation} aria-label="Main navigation">
      <ul className={styles.navList}>
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className={styles.navItem}>
            {item.external ? (
              <a
                href={item.href}
                className={styles.navLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.label}
              </a>
            ) : (
              <NavLink
                to={item.href}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ''}`
                }
              >
                {item.label}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default Navigation;
