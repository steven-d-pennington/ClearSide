/**
 * ClearSide App
 *
 * Main application component with routing.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, HistoryPage, ConversationHistoryPage, DebateViewPage, AdminDashboardPage, AdminDebatesPage, AdminExportsPage, AdminSystemPage, AdminConfigPage, AdminEventsPage, AdminTestingPage, AdminDuelogicResearchPage, AdminDuelogicProposalsPage, AdminDuelogicProposalDetailPage } from './pages';
import { ConversationViewer } from './components/ConversationalPodcast';
import './styles/tokens.css';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <h1>ClearSide</h1>
          <p className="tagline">Watch the debate. Think both sides. Decide with clarity.</p>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/conversations" element={<ConversationHistoryPage />} />
            <Route path="/debates/:debateId" element={<DebateViewPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/debates" element={<AdminDebatesPage />} />
            <Route path="/admin/exports" element={<AdminExportsPage />} />
            <Route path="/admin/system" element={<AdminSystemPage />} />
            <Route path="/admin/config" element={<AdminConfigPage />} />
            <Route path="/admin/events" element={<AdminEventsPage />} />
            <Route path="/admin/testing" element={<AdminTestingPage />} />
            <Route path="/admin/duelogic/research" element={<AdminDuelogicResearchPage />} />
            <Route path="/admin/duelogic/proposals" element={<AdminDuelogicProposalsPage />} />
            <Route path="/admin/duelogic/proposals/:id" element={<AdminDuelogicProposalDetailPage />} />
            <Route path="/conversation/:sessionId" element={<ConversationViewer />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
