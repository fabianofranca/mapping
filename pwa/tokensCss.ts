// Vite plugin that delivers `src/theme/tokens.ts` as CSS (`import 'virtual:tokens.css'`):
// the tokens have a single source and there is no generated file to go stale. Used by the
// app build (vite.config.ts) and by other pages that use the tokens.
import type { Plugin } from 'vite';
import { renderTokensCss } from '../src/theme/tokens';

export function tokensCss(): Plugin {
  const id = 'virtual:tokens.css';
  return {
    name: 'tokens-css',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (loaded) => (loaded === `\0${id}` ? renderTokensCss() : undefined),
  };
}
