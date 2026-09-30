import { render } from 'preact';
import './theme/tokens.css';
import './theme/global.css';
import { App } from './app/App';
import { bindDocumentSettings } from './theme/apply';

bindDocumentSettings();

const root = document.getElementById('app');
if (root) render(<App />, root);
