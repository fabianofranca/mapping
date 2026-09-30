import { render } from 'preact';
import './theme/tokens.css';
import './theme/global.css';
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
