import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Badge } from '../ui';
import { useAuth } from '../../hooks/useAuth';
import styles from './AuthStatus.module.css';

export const AuthStatus: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  if (isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.userInfo}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div className={styles.userText}>
            <span className={styles.label}>Signed in</span>
            <span className={styles.username}>{user?.username}</span>
          </div>
          <Badge variant="success" className={styles.badge}>Mock</Badge>
        </div>
        <div className={styles.actions}>
          <Link to="/admin" className={styles.linkButton}>
            <Button size="sm" variant="secondary">
              Admin
            </Button>
          </Link>
          <Button size="sm" variant="ghost" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.userInfo}>
        <span className={styles.statusDot} data-variant="offline" aria-hidden="true" />
        <div className={styles.userText}>
          <span className={styles.label}>Admin access</span>
          <span className={styles.username}>Not signed in</span>
        </div>
        <Badge variant="warning" className={styles.badge}>Setup</Badge>
      </div>
      <div className={styles.actions}>
        <Link to="/login" className={styles.linkButton}>
          <Button size="sm" variant="primary">
            Sign in
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default AuthStatus;
