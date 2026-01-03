import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

export interface AuthUser {
  username: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'clearside.auth';
const DEMO_USERNAME = 'steven';
const DEMO_PASSWORD = 'stardust';

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Unable to restore auth session', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // Simulate an async auth request to keep the API shape close to a real provider
    await new Promise((resolve) => setTimeout(resolve, 250));

    const normalizedUsername = username.trim().toLowerCase();
    const isValid = normalizedUsername === DEMO_USERNAME && password === DEMO_PASSWORD;

    if (!isValid) {
      throw new Error('Invalid username or password. Use steven / stardust for mock access.');
    }

    const authedUser: AuthUser = { username: DEMO_USERNAME };
    setUser(authedUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authedUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
  }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
