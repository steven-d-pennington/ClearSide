/**
 * HistoryPage
 *
 * Page showing list of all past debates with filtering options.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import { DebateList } from '../components/DebateList';
import styles from './HistoryPage.module.css';

type StatusFilter = 'all' | 'completed' | 'live' | 'paused' | 'failed';

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'failed', label: 'Failed' },
];

export function HistoryPage() {
  const [filter, setFilter] = useState<StatusFilter>('all');

  return (
    <div className={styles.container}>
      <Link to="/" className={styles.backLink}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>Debate History</h1>
        <p className={styles.subtitle}>Browse and replay your previous debates</p>
      </header>

      <nav className={styles.filters} aria-label="Filter debates">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
          >
            {option.label}
          </Button>
        ))}
      </nav>

      <main className={styles.main}>
        <DebateList
          statusFilter={filter === 'all' ? undefined : filter}
          limit={50}
        />
      </main>

      <footer className={styles.footer}>
        <Link to="/" className={styles.newDebateButton}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Start New Debate
        </Link>
      </footer>
    </div>
  );
}

export default HistoryPage;
