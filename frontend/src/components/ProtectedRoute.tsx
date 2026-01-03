import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

type LocationState = {
  from?: { pathname?: string };
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="route-loading">Checking credentials...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location as LocationState }} />;
  }

  return children;
};

export default ProtectedRoute;
