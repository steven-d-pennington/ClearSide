/**
 * HomePage
 *
 * Main landing page with input form to start new debates.
 */

import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardFooter, Button } from '../components/ui';
import { InputForm } from '../components/InputForm';
import { DebateStream } from '../components/DebateStream';
import { DebateStage } from '../components/DebateStage/DebateStage';
import { useDebateStore, selectIsLivelyMode, selectIsInformalMode } from '../stores/debate-store';
import styles from './HomePage.module.css';

export function HomePage() {
  const navigate = useNavigate();
  const debate = useDebateStore((state) => state.debate);
  const isLivelyMode = useDebateStore(selectIsLivelyMode);
  const isInformalMode = useDebateStore(selectIsInformalMode);

  const handleDebateCreated = useCallback((debateId: string) => {
    console.log('Debate started:', debateId);
    // Navigate to the debate view page
    navigate(`/debates/${debateId}`);
  }, [navigate]);

  // If a debate is active, show the appropriate view
  // DebateStage handles both lively mode and informal discussion mode
  if (debate) {
    return (
      <div className={styles.container}>
        {(isLivelyMode || isInformalMode) ? <DebateStage /> : <DebateStream />}
      </div>
    );
  }

  // Otherwise show the input form
  return (
    <div className={styles.container}>
      <Card padding="lg" variant="elevated" className={styles.card}>
        <InputForm
          onSuccess={handleDebateCreated}
          onError={(error) => console.error('Error:', error)}
        />
        <CardFooter className={styles.footer}>
          <Link to="/history">
            <Button variant="secondary">
              View Previous Debates
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default HomePage;
