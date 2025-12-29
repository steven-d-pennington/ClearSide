/**
 * HomePage
 *
 * Main landing page with input form to start new debates.
 */

import { Link } from 'react-router-dom';
import { Card, CardFooter, Button } from '../components/ui';
import { InputForm } from '../components/InputForm';
import { DebateStream } from '../components/DebateStream';
import { DebateStage } from '../components/DebateStage/DebateStage';
import { useDebateStore, selectIsLivelyMode } from '../stores/debate-store';
import styles from './HomePage.module.css';

export function HomePage() {
  const debate = useDebateStore((state) => state.debate);
  const isLivelyMode = useDebateStore(selectIsLivelyMode);

  // If a debate is active, show the appropriate view
  if (debate) {
    return (
      <div className={styles.container}>
        {isLivelyMode ? <DebateStage /> : <DebateStream />}
      </div>
    );
  }

  // Otherwise show the input form
  return (
    <div className={styles.container}>
      <Card padding="lg" variant="elevated" className={styles.card}>
        <InputForm
          onSuccess={(debateId) => console.log('Debate started:', debateId)}
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
