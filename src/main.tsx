// First of all: the `default` Trusted Types policy must exist before any app code.
import './app/trustedTypes';
import { render } from 'preact';
import './utils/zodConfig';
import 'virtual:tokens.css';
import './theme/base.css';
import './theme/controls.css';
import './theme/layout.css';
import './theme/editor.css';
import './theme/panels.css';
import './theme/details.css';
import './theme/threads.css';
import './theme/canvas.css';
import './theme/forms.css';
import './theme/dialogs.css';
import './theme/review.css';
import './theme/refPreview.css';
import './theme/catalog.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { initApp } from './app/controller';
import { attachManifest, bindInstallPrompt, registerServiceWorker } from './app/pwa';
import { registerDrawingFonts } from './storage/drawingFonts';
import { bindDocumentSettings } from './theme/apply';
import { listenForUncaughtErrors, reportError } from './utils/report';

// Before everything: whatever escapes the handlers (a loose promise, an uncaught error) goes to the
// Diagnostics.
listenForUncaughtErrors(window);
bindDocumentSettings();
void initApp();
attachManifest();
bindInstallPrompt();
if (import.meta.env.PROD) void registerServiceWorker();

// The drawing font (Mapping Sans and Mono) is registered before the first render: the canvas, the Catalog and the
// library preview measure and draw component text with it. A failure is reported and the stack's fallback applies.
const root = document.getElementById('app');
if (root)
  void registerDrawingFonts(undefined, (error) =>
    reportError('drawing-fonts', error),
  ).then(() =>
    render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
      root,
    ),
  );
