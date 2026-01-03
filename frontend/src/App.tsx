/**
 * ClearSide App
 *
 * Main application component with routing.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, HistoryPage, DebateViewPage, AdminDashboardPage, AdminDebatesPage, AdminExportsPage, AdminSystemPage, AdminConfigPage, AdminEventsPage, AuthPage } from './pages';
import { AuthProvider } from './contexts/AuthContext';
import { AuthStatus } from './components/AuthStatus/AuthStatus';
import { ProtectedRoute } from './components/ProtectedRoute';
import './styles/tokens.css';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app">
          <header className="app-header">
            <div className="brand">
              <h1>ClearSide</h1>
              <p className="tagline">Watch the debate. Think both sides. Decide with clarity.</p>
            </div>
            <AuthStatus />
          </header>

          <main className="app-main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/debates/:debateId" element={<DebateViewPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route
                path="/admin"
                element={(
                  <ProtectedRoute>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="/admin/debates"
                element={(
                  <ProtectedRoute>
                    <AdminDebatesPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="/admin/exports"
                element={(
                  <ProtectedRoute>
                    <AdminExportsPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="/admin/system"
                element={(
                  <ProtectedRoute>
                    <AdminSystemPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="/admin/config"
                element={(
                  <ProtectedRoute>
                    <AdminConfigPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="/admin/events"
                element={(
                  <ProtectedRoute>
                    <AdminEventsPage />
                  </ProtectedRoute>
                )}
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
