import { render } from 'preact';
import './theme/tokens.css';
import './theme/global.css';
import { App } from './app/App';
import { initApp } from './app/controller';
import { bindDocumentSettings } from './theme/apply';

bindDocumentSettings();
void initApp();

const root = document.getElementById('app');
if (root) render(<App />, root);
