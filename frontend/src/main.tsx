import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Suppress unhandled ZodError rejections that bubble from react-hook-form internals.
// react-hook-form catches them for UI display, but the async rejection still leaks
// to the browser's global handler — this prevents console noise without hiding real errors.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.name === 'ZodError') event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
