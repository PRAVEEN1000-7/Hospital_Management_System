import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import feLogger from './services/loggerService';

// Log application startup
feLogger.info('app', 'HMS Frontend application loaded');

// Suppress unhandled ZodError rejections that bubble from react-hook-form internals.
// react-hook-form catches them for UI display, but the async rejection still leaks
// to the browser's global handler — this prevents console noise without hiding real errors.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.name === 'ZodError') event.preventDefault();
  else feLogger.error('app', `Unhandled promise rejection: ${event.reason?.message || event.reason}`);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
