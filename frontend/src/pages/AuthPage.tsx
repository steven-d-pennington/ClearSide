import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Alert, Button, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import styles from './AuthPage.module.css';

type LocationState = {
  from?: { pathname?: string };
};

export function AuthPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fromPath = (location.state as LocationState)?.from?.pathname || '/admin';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate(fromPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => navigate('/');

  if (isAuthenticated) {
    navigate(fromPath, { replace: true });
    return null;
  }

  return (
    <div className={styles.page}>
      <Card className={styles.card} variant="elevated" padding="lg">
        <CardHeader className={styles.header}>
          <CardTitle as="h1">Mock admin sign in</CardTitle>
          <CardDescription>
            Use username <strong>steven</strong> and password <strong>stardust</strong> to access admin pages. This is a temporary mock while we wire up Vercel auth.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              label="Username"
              placeholder="Enter username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {error && (
              <Alert variant="error">
                {error}
              </Alert>
            )}

            <Button type="submit" variant="primary" fullWidth loading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </CardContent>

        <CardFooter className={styles.footer}>
          <div className={styles.hint}>
            <span>Need credentials? Use steven / stardust.</span>
            <button type="button" onClick={handleSkip} className={styles.secondaryAction}>
              Skip for now
            </button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default AuthPage;
