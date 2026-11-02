/// <reference types="vitest/config" />
// Build da demo do visualizador embutível (`viewer/demo`): uma página autocontida à parte da
// app, só para desenvolvimento (`npm run dev:viewer`); não entra no `npm run build` nem no
// deploy. Usa React de verdade (sem o plugin `preact()`, que apelida react para preact/compat):
// é a prova de que o visualizador roda num hospedeiro React. A CSP é a do perfil `static`
// (nenhuma requisição de rede, nada embutido sem hash, sem Trusted Types). A página não usa
// os tokens da app: tem variáveis próprias (`--demo-*`) em `viewer/demo/react.css`.
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { applyCsp } from './pwa/csp';

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset')
          throw new Error('index.html não encontrado no bundle');
        html.source = applyCsp(String(html.source), 'static');
      },
    },
  };
}

export default defineConfig({
  root: 'viewer/demo',
  base: './',
  publicDir: false,
  plugins: [viteSingleFile(), contentSecurityPolicy()],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  build: {
    outDir: '../../dist-viewer-demo',
    emptyOutDir: true,
  },
});
