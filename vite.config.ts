/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { channelManifest, stampServiceWorker, type BuildChannel } from './pwa/build';
import { applyCsp } from './pwa/csp';
import { renderTokensCss } from './src/theme/tokens';

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
 * Content Security Policy do `index.html` (etapa 2.4). Roda depois do
 * vite-plugin-singlefile (que tem `enforce: 'post'`, então embute o JS e o CSS antes
 * deste `generateBundle`) e antes do `serviceWorker()`, cujo hash do build precisa
 * enxergar o HTML já com a CSP. Se a política não bater com os blocos embutidos,
 * o build falha.
 */
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

/**
 * Entrega `src/theme/tokens.ts` como CSS (`import 'virtual:tokens.css'`): os tokens têm
 * uma fonte só e não há arquivo gerado para ficar desatualizado.
 */
function tokensCss(): Plugin {
  const id = 'virtual:tokens.css';
  return {
    name: 'tokens-css',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (loaded) => (loaded === `\0${id}` ? renderTokensCss() : undefined),
  };
}

/**
 * Com `--coverage` o código roda instrumentado e bem mais lento: os orçamentos de
 * desempenho por quadro ficam de fora (o CI os mede num passo sem cobertura).
 * `PERF_BUDGETS=off` também os desliga: o deploy roda a suíte em paralelo e mede
 * os orçamentos depois, sozinhos (`npm run test:perf`), sem disputar CPU.
 */
const perfBudgets =
  process.argv.includes('--coverage') || process.env.PERF_BUDGETS === 'off'
    ? 'off'
    : 'on';
const testEnv = { PERF_BUDGETS: perfBudgets };

const base = {
  base: './',
  plugins: [
    tokensCss(),
    preact(),
    viteSingleFile(),
    contentSecurityPolicy(),
    serviceWorker(),
  ],
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
          env: testEnv,
          include: ['tests/model/**/*.test.ts'],
        },
      },
      {
        ...base,
        // Servidor MCP (etapa 3a): também em Node puro.
        test: {
          name: 'mcp',
          environment: 'node',
          env: testEnv,
          include: ['tests/mcp/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        ...base,
        test: {
          name: 'app',
          environment: 'jsdom',
          env: testEnv,
          setupFiles: ['tests/setup.ts'],
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: ['tests/model/**', 'tests/mcp/**'],
        },
      },
    ],
  },
});
