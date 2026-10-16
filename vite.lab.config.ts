/// <reference types="vitest/config" />
// Build do laboratório "Figma somente leitura" (`lab/figma/`): uma página autocontida à
// parte, publicada em `dist/lab/figma/index.html` depois do build da app (`npm run build`).
// Experimento fora do produto: sem service worker, sem manifest; a CSP é a mesma da app
// (nenhuma requisição de rede, nada embutido sem hash).
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { applyCsp } from './pwa/csp';
import { tokensCss } from './pwa/tokensCss';

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
        html.source = applyCsp(String(html.source));
      },
    },
  };
}

export default defineConfig({
  root: 'lab/figma',
  base: './',
  publicDir: false,
  plugins: [tokensCss(), preact(), viteSingleFile(), contentSecurityPolicy()],
  build: {
    outDir: '../../dist/lab/figma',
    emptyOutDir: true,
  },
});
