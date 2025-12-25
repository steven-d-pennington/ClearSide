import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Mobile debug console - always enabled for now (remove when done debugging)
import('eruda').then((eruda) => {
  eruda.default.init();
  console.log('🔧 Debug console enabled - tap the gear icon');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
