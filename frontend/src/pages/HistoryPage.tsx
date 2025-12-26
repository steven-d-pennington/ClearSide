/**
 * HistoryPage
 *
 * Page showing list of all past debates with filtering options.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui';
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
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Link to="/" className={styles.backLink}>
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
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className={styles.title}>Debate History</h1>
        </div>

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
      </header>

      <main className={styles.main}>
        <Card padding="lg">
          <DebateList
            statusFilter={filter === 'all' ? undefined : filter}
            limit={50}
          />
        </Card>
      </main>

      <footer className={styles.footer}>
        <Link to="/">
          <Button variant="primary" size="lg">
            Start New Debate
          </Button>
        </Link>
      </footer>
    </div>
  );
}

export default HistoryPage;
