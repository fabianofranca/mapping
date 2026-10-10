import { render } from 'preact';
import './utils/zodConfig';
import 'virtual:tokens.css';
import './theme/base.css';
import './theme/controls.css';
import './theme/layout.css';
import './theme/editor.css';
import './theme/panels.css';
import './theme/details.css';
import './theme/canvas.css';
import './theme/forms.css';
import './theme/dialogs.css';
import './theme/review.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { initApp } from './app/controller';
import { attachManifest, bindInstallPrompt, registerServiceWorker } from './app/pwa';
import { bindDocumentSettings } from './theme/apply';

bindDocumentSettings();
void initApp();
attachManifest();
bindInstallPrompt();
if (import.meta.env.PROD) void registerServiceWorker();

const root = document.getElementById('app');
if (root)
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
    root,
  );
