// Plugin do Vite que entrega `src/theme/tokens.ts` como CSS (`import 'virtual:tokens.css'`):
// os tokens têm uma fonte só e não há arquivo gerado para ficar desatualizado. Usado pelo
// build da app (vite.config.ts) e pelo do laboratório (vite.lab.config.ts).
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
