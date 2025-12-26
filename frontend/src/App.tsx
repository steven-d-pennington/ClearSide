/**
 * ClearSide App
 *
 * Main application component with routing.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, HistoryPage, DebateViewPage } from './pages';
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
            <Route path="/debates/:debateId" element={<DebateViewPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
