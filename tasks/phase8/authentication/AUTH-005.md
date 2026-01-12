# AUTH-005: Frontend Authentication Implementation

**Task ID:** AUTH-005
**Phase:** Phase 8
**Category:** Authentication System
**Priority:** P0
**Estimated Effort:** M (4-6 hours)
**Dependencies:** AUTH-001 (types), AUTH-004 (API routes)
**Status:** Ready

---

## Context

Implement frontend authentication system with login page, auth state management, protected routes, and password change flow. Uses Zustand for state management with persist middleware for session persistence.

**References:**
- AUTH-001 (Database Schema & Types)
- AUTH-004 (API Routes)
- Existing frontend patterns in `frontend/src/`

---

## Requirements

### Acceptance Criteria

- [ ] Create Zustand auth store with persist middleware
- [ ] Create LoginPage component with form validation
- [ ] Create PasswordChangeModal for temp password flow
- [ ] Create ProtectedRoute wrapper component
- [ ] Create useAuth hook for easy access to auth state
- [ ] Implement login, logout, and password change flows
- [ ] Store JWT in httpOnly cookie (handled by backend)
- [ ] Handle 401/403 errors globally (redirect to login)
- [ ] Show "must change password" modal on first login with temp password
- [ ] Persist user data in localStorage (not JWT token)
- [ ] Write component tests for all auth components

### Functional Requirements

**Auth Store:**
- Login action (POST /api/auth/login)
- Logout action (POST /api/auth/logout)
- Change password action (POST /api/auth/change-password)
- Check auth status on app load (GET /api/auth/me)
- Store user info (id, username, role, organizationId)
- Store requiresPasswordChange flag

**LoginPage:**
- Username and password inputs
- Form validation
- Error message display
- Loading state during login
- Redirect to home on successful login

**PasswordChangeModal:**
- Auto-show if user has temp password
- Current password field (optional for temp passwords)
- New password and confirm password fields
- Password requirements display
- Submit button with loading state

**ProtectedRoute:**
- Redirect to /login if not authenticated
- Show loading spinner while checking auth
- Pass through to child components if authenticated

---

## Implementation

### 1. Auth Store with Zustand

**File:** `frontend/src/stores/auth-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export type UserRole = 'super_admin' | 'org_admin' | 'user';

export interface User {
  id: string;
  organizationId: string;
  username: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  isTempPassword: boolean;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresPasswordChange: boolean;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string | undefined, newPassword: string, confirmPassword: string) => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      requiresPasswordChange: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // Send cookies
            body: JSON.stringify({ username, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Login failed');
          }

          set({
            user: data.user,
            isAuthenticated: true,
            requiresPasswordChange: data.requiresPasswordChange || false,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message,
            isAuthenticated: false,
            user: null,
          });
          throw error;
        }
      },

      logout: async () => {
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            requiresPasswordChange: false,
            error: null,
          });
        }
      },

      changePassword: async (
        currentPassword: string | undefined,
        newPassword: string,
        confirmPassword: string
      ) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              currentPassword,
              newPassword,
              confirmPassword,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Password change failed');
          }

          set({
            requiresPasswordChange: false,
            isLoading: false,
            error: null,
          });

          // Update user's isTempPassword flag
          const currentUser = get().user;
          if (currentUser) {
            set({
              user: { ...currentUser, isTempPassword: false },
            });
          }
        } catch (error: any) {
          set({ isLoading: false, error: error.message });
          throw error;
        }
      },

      checkAuth: async () => {
        set({ isLoading: true });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            set({
              user: data.user,
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch (error) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        requiresPasswordChange: state.requiresPasswordChange,
      }),
    }
  )
);

// Helper hook for easier access
export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const requiresPasswordChange = useAuthStore((state) => state.requiresPasswordChange);

  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const changePassword = useAuthStore((state) => state.changePassword);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const clearError = useAuthStore((state) => state.clearError);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    requiresPasswordChange,
    login,
    logout,
    changePassword,
    checkAuth,
    clearError,
  };
};
```

### 2. Login Page

**File:** `frontend/src/pages/LoginPage.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';
import styles from './LoginPage.module.css';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, isAuthenticated } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await login(username, password);
      // Navigation handled by useEffect when isAuthenticated becomes true
    } catch (error) {
      // Error is already set in the store
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>ClearSide</h1>
          <p className={styles.subtitle}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="username" className={styles.label}>
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              required
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};
```

**File:** `frontend/src/pages/LoginPage.module.css`

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.loginCard {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  padding: 3rem;
  width: 100%;
  max-width: 420px;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  color: #1a202c;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1rem;
  color: #718096;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.formGroup {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
}

.input {
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s;
}

.input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input:disabled {
  background-color: #f7fafc;
  cursor: not-allowed;
}

.error {
  padding: 0.75rem;
  background-color: #fed7d7;
  border: 1px solid #fc8181;
  border-radius: 8px;
  color: #c53030;
  font-size: 0.875rem;
}

.submitButton {
  padding: 0.875rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.submitButton:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.submitButton:active:not(:disabled) {
  transform: translateY(0);
}

.submitButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

### 3. Password Change Modal

**File:** `frontend/src/components/PasswordChangeModal.tsx`

```typescript
import React, { useState } from 'react';
import { useAuth } from '../stores/auth-store';
import styles from './PasswordChangeModal.module.css';

interface PasswordChangeModalProps {
  isOpen: boolean;
  isTempPassword: boolean;
  onClose: () => void;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  isTempPassword,
  onClose,
}) => {
  const { changePassword, isLoading, error, clearError } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationErrors([]);

    // Validate new password
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      setValidationErrors(['Passwords do not match']);
      return;
    }

    try {
      await changePassword(
        isTempPassword ? undefined : currentPassword,
        newPassword,
        confirmPassword
      );
      onClose();
    } catch (error) {
      // Error is already set in the store
    }
  };

  const handleClose = () => {
    if (!isTempPassword) {
      clearError();
      setValidationErrors([]);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isTempPassword ? 'Change Temporary Password' : 'Change Password'}
          </h2>
          {!isTempPassword && (
            <button
              className={styles.closeButton}
              onClick={handleClose}
              disabled={isLoading}
            >
              ×
            </button>
          )}
        </div>

        {isTempPassword && (
          <p className={styles.warning}>
            You are using a temporary password. Please change it to continue.
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {!isTempPassword && (
            <div className={styles.formGroup}>
              <label htmlFor="currentPassword" className={styles.label}>
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={styles.input}
                required
                disabled={isLoading}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="newPassword" className={styles.label}>
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.label}>
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>

          <div className={styles.requirements}>
            <p className={styles.requirementsTitle}>Password requirements:</p>
            <ul className={styles.requirementsList}>
              <li>At least 8 characters</li>
              <li>At least one uppercase letter</li>
              <li>At least one lowercase letter</li>
              <li>At least one number</li>
            </ul>
          </div>

          {(error || validationErrors.length > 0) && (
            <div className={styles.error}>
              {error || validationErrors.join(', ')}
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading}
            >
              {isLoading ? 'Changing...' : 'Change Password'}
            </button>
            {!isTempPassword && (
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
```

**File:** `frontend/src/components/PasswordChangeModal.module.css`

```css
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a202c;
}

.closeButton {
  background: none;
  border: none;
  font-size: 2rem;
  color: #718096;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
}

.closeButton:hover {
  color: #1a202c;
}

.warning {
  background-color: #fef5e7;
  border: 1px solid #f39c12;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  color: #d68910;
  font-size: 0.875rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.formGroup {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
}

.input {
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s;
}

.input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input:disabled {
  background-color: #f7fafc;
  cursor: not-allowed;
}

.requirements {
  background-color: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
}

.requirementsTitle {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.requirementsList {
  margin: 0;
  padding-left: 1.5rem;
  font-size: 0.875rem;
  color: #718096;
}

.requirementsList li {
  margin-bottom: 0.25rem;
}

.error {
  padding: 0.75rem;
  background-color: #fed7d7;
  border: 1px solid #fc8181;
  border-radius: 8px;
  color: #c53030;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.submitButton {
  flex: 1;
  padding: 0.875rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.submitButton:hover:not(:disabled) {
  transform: translateY(-2px);
}

.submitButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancelButton {
  padding: 0.875rem 1.5rem;
  background: #e2e8f0;
  color: #4a5568;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.cancelButton:hover:not(:disabled) {
  background: #cbd5e0;
}

.cancelButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

### 4. Protected Route Component

**File:** `frontend/src/components/ProtectedRoute.tsx`

```typescript
import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
```

### 5. Update App Router

**File:** `frontend/src/App.tsx` (update routes)

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PasswordChangeModal } from './components/PasswordChangeModal';
import { useAuth } from './stores/auth-store';
import { useEffect, useState } from 'react';

function App() {
  const { requiresPasswordChange, user } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    if (requiresPasswordChange) {
      setShowPasswordModal(true);
    }
  }, [requiresPasswordChange]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              {/* Your existing app routes */}
            </ProtectedRoute>
          }
        />
      </Routes>

      <PasswordChangeModal
        isOpen={showPasswordModal}
        isTempPassword={user?.isTempPassword || false}
        onClose={() => setShowPasswordModal(false)}
      />
    </BrowserRouter>
  );
}

export default App;
```

### 6. Install Dependencies

```bash
cd frontend
npm install zustand
```

---

## Testing & Verification

### Component Tests

**File:** `frontend/src/pages/__tests__/LoginPage.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';

describe('LoginPage', () => {
  it('should render login form', () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should handle form submission', async () => {
    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toHaveTextContent(/signing in/i);
    });
  });
});
```

### Manual Testing

```bash
# 1. Start backend and frontend
cd backend && npm run dev
cd frontend && npm run dev

# 2. Navigate to http://localhost:5173

# 3. Try to access protected route
# - Should redirect to /login

# 4. Login with super user
# - Username: steven@spennington.dev
# - Password: StarDust

# 5. Should redirect to home page

# 6. Create a user with temp password
# - Login as that user
# - Should show password change modal
# - Cannot dismiss modal (required)

# 7. Change password
# - Should close modal
# - Should be able to use app

# 8. Logout
# - Should clear auth state
# - Should redirect to login
```

---

## Critical Files

- `frontend/src/stores/auth-store.ts` (new)
- `frontend/src/pages/LoginPage.tsx` (new)
- `frontend/src/pages/LoginPage.module.css` (new)
- `frontend/src/components/PasswordChangeModal.tsx` (new)
- `frontend/src/components/PasswordChangeModal.module.css` (new)
- `frontend/src/components/ProtectedRoute.tsx` (new)
- `frontend/src/App.tsx` (modified - add routes)

---

## Dependencies

- AUTH-001 (Database Schema & Types)
- AUTH-004 (API Routes)
- npm packages: zustand, react-router-dom

---

**Status:** Ready to implement
**Next Task:** AUTH-006 (User Management UI)
