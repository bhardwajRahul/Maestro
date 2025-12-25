import React from 'react';
import ReactDOM from 'react-dom/client';
import MaestroConsole from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LayerStackProvider } from './contexts/LayerStackContext';
import { ToastProvider } from './contexts/ToastContext';
import { ModalProvider } from './contexts/ModalContext';
import { WizardProvider } from './components/Wizard';
import { logger } from './utils/logger';
import './index.css';

// Note: Sentry renderer initialization removed - the main process Sentry captures
// crashes from all processes. The renderer-specific @sentry/electron/renderer
// causes "sentry-ipc:// URL scheme not supported" errors due to protocol handler
// race conditions. See: https://github.com/getsentry/sentry-electron/issues/661

// Set up global error handlers for uncaught exceptions in renderer process
window.addEventListener('error', (event: ErrorEvent) => {
  logger.error(
    `Uncaught Error: ${event.message}`,
    'UncaughtError',
    {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || String(event.error),
    }
  );
  // Prevent default browser error handling
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  logger.error(
    `Unhandled Promise Rejection: ${event.reason?.message || String(event.reason)}`,
    'UnhandledRejection',
    {
      reason: event.reason,
      stack: event.reason?.stack,
    }
  );
  // Prevent default browser error handling
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <LayerStackProvider>
          <ModalProvider>
            <WizardProvider>
              <MaestroConsole />
            </WizardProvider>
          </ModalProvider>
        </LayerStackProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
