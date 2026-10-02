/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { channelManifest, stampServiceWorker, type BuildChannel } from './pwa/build';

/** `VITE_CHANNEL=preview` no build do branch publicado em /preview/ (deploy.yml). */
const channel: BuildChannel = process.env.VITE_CHANNEL === 'preview' ? 'preview' : 'main';

/** FNV-1a de 32 bits em hexadecimal: basta para distinguir um build do outro. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Publica o service worker (`pwa/sw.js`) carimbado com um hash do index.html:
 * cada build novo muda o sw.js, e é isso que faz o navegador detectar a
 * "nova versão". Publica também o manifest do canal (o do preview tem outro
 * nome). Ficam fora de `public/` para poderem ser transformados.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (html?.type !== 'asset')
          throw new Error('index.html não encontrado no bundle');
        const sw = stampServiceWorker(
          readFileSync('pwa/sw.js', 'utf8'),
          hash(String(html.source)),
          channel,
        );
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
        const manifest = channelManifest(
          readFileSync('pwa/manifest.webmanifest', 'utf8'),
          channel,
        );
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.webmanifest',
          source: manifest,
        });
      },
    },
  };
}

const base = {
  base: './',
  plugins: [preact(), viteSingleFile(), serviceWorker()],
};

export default defineConfig({
  ...base,
  test: {
    // Relatório informativo (sem limite mínimo por enquanto): `npm run test:coverage`.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        ...base,
        // src/model/ precisa rodar em Node puro: será reutilizado pelo servidor MCP.
        test: {
          name: 'model',
          environment: 'node',
          include: ['tests/model/**/*.test.ts'],
        },
      },
      {
        ...base,
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: ['tests/model/**'],
        },
      },
    ],
  },
});
