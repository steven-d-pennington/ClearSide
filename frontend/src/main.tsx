import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Mobile debug console - loads in dev or when ?debug=true
const isDev = import.meta.env.DEV;
const hasDebugParam = new URLSearchParams(window.location.search).has('debug');

if (isDev || hasDebugParam) {
  import('eruda').then((eruda) => {
    eruda.default.init();
    console.log('🔧 Debug console enabled - tap the gear icon');
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
