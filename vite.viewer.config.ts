/// <reference types="vitest/config" />
// Build of the embeddable viewer demo (`viewer/demo`): a self-contained page separate from the
// app, for development only (`npm run dev:viewer`); it is not part of `npm run build` or the
// deploy. It uses real React (without the `preact()` plugin, which aliases react to preact/compat):
// it is the proof that the viewer runs in a React host. The CSP is the `static` profile's
// (no network requests, nothing embedded without a hash, no Trusted Types). The page does not use
// the app's tokens: it has its own variables (`--demo-*`) in `viewer/demo/react.css`.
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
        if (html?.type !== 'asset') throw new Error('index.html not found in the bundle');
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
