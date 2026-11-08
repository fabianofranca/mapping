/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { channelManifest, stampServiceWorker, type BuildChannel } from './pwa/build';
import { applyCsp } from './pwa/csp';
import { tokensCss } from './pwa/tokensCss';
import { resolveBuildId } from './src/utils/build';
import { fontBytes, wasmBytes } from './tests/support/mcpVitePlugins';
import TimedSequencer from './tests/support/timedSequencer';

/** `VITE_CHANNEL=preview` no build do branch publicado em /preview/ (deploy.yml). */
const channel: BuildChannel = process.env.VITE_CHANNEL === 'preview' ? 'preview' : 'main';

/** Build id (fase 5.4): `abc1234 · 2026-10-10`, lido por `src/utils/build.ts`. */
const buildId = resolveBuildId({
  githubSha: process.env.GITHUB_SHA,
  gitSha: () =>
    execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  now: new Date(),
});

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
        html.source = applyCsp(String(html.source), 'app');
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
        // O guia (public/guia/, gerado antes do build) também está no cache: mudou, o sw.js muda.
        const guide = readFileSync('public/guia/index.html', 'utf8');
        const sw = stampServiceWorker(
          readFileSync('pwa/sw.js', 'utf8'),
          hash(String(html.source) + guide),
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
 * Com `--coverage` o código roda instrumentado e bem mais lento: os orçamentos de
 * desempenho por quadro ficam de fora (o CI os mede num passo sem cobertura).
 * `PERF_BUDGETS=off` também os desliga: o deploy roda a suíte em paralelo e mede
 * os orçamentos depois, sozinhos (`npm run test:perf`), sem disputar CPU. No `npm test`
 * local eles rodam por último e sozinhos (projetos `perf-*`, abaixo).
 */
const perfBudgets =
  process.argv.includes('--coverage') || process.env.PERF_BUDGETS === 'off'
    ? 'off'
    : 'on';
/**
 * Nos shards do CI (`COVERAGE_REPORT=off`) o blob já leva os dados de cobertura e só o job
 * `coverage` gera o relatório, no `--merge-reports`: gerá-lo em cada shard custava ~15 s.
 * Local (`npm run test:coverage`) o relatório sai como sempre.
 */
const coverageReporters =
  process.env.COVERAGE_REPORT === 'off' ? [] : ['text-summary', 'json-summary', 'html'];

const testEnv = { PERF_BUDGETS: perfBudgets };

/**
 * Orçamentos de desempenho (#373): rodam em projetos próprios, depois dos demais
 * (`sequence.groupOrder` maior) e um arquivo por vez, para a medição não disputar CPU com
 * a suíte inteira. Os mesmos caminhos saem de `model` e `app` (`exclude`); `npm run test:perf`
 * os roda pelo nome dos arquivos.
 */
const perfModelFiles = ['tests/model/performance.test.ts'];
const perfAppFiles = [
  'tests/canvas/renderPerformance.test.ts',
  'tests/store/reviewPerf.test.ts',
];
const perfGroupOrder = 1;

const base = {
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
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
    // `--shard=i/N` divide por tempo, não por número de arquivos (tests/support/timedSequencer.ts).
    sequence: { sequencer: TimedSequencer },
    // Relatório informativo (sem limite mínimo por enquanto): `npm run test:coverage`.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: coverageReporters,
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        // Os projetos herdam os plugins e o `define` deste arquivo (Vitest 5): repeti-los
        // aplicaria cada plugin duas vezes.
        // src/model/ precisa rodar em Node puro: será reutilizado pelo servidor MCP.
        test: {
          name: 'model',
          environment: 'node',
          env: testEnv,
          include: ['tests/model/**/*.test.ts'],
          exclude: perfModelFiles,
        },
      },
      {
        // Orçamentos do modelo, sozinhos e por último (ver `perfModelFiles`).
        test: {
          name: 'perf-model',
          environment: 'node',
          env: testEnv,
          include: perfModelFiles,
          fileParallelism: false,
          sequence: { groupOrder: perfGroupOrder },
        },
      },
      {
        plugins: [wasmBytes(), fontBytes()],
        // Servidor MCP (etapa 3a): também em Node puro.
        test: {
          name: 'mcp',
          environment: 'node',
          env: testEnv,
          include: ['tests/mcp/**/*.test.ts'],
          // Gera dist-mcp/mapping-mcp.js uma vez: os testes de integração sobem esse arquivo por stdio.
          globalSetup: ['tests/mcp/globalSetup.ts'],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'app',
          environment: 'jsdom',
          // vmThreads: reaproveita o jsdom entre arquivos (CI3, #378): suíte ~175 s → ~97 s.
          pool: 'vmThreads',
          env: testEnv,
          setupFiles: ['tests/setup.ts'],
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: [
            'tests/model/**',
            'tests/mcp/**',
            'tests/viewer/react*.test.tsx',
            ...perfAppFiles,
          ],
        },
      },
      {
        // Orçamentos do canvas e da revisão, sozinhos e por último (ver `perfModelFiles`):
        // o mesmo ambiente, pool e `setupFiles` do projeto `app`.
        test: {
          name: 'perf-app',
          environment: 'jsdom',
          pool: 'vmThreads',
          env: testEnv,
          setupFiles: ['tests/setup.ts'],
          include: perfAppFiles,
          fileParallelism: false,
          sequence: { groupOrder: perfGroupOrder },
        },
      },
      {
        // Invólucro React do visualizador: React de verdade. Sem o plugin
        // `preact()`, que apelida react para preact/compat; por isso `extends: false` (Vitest 5:
        // o projeto inline herdaria os plugins do arquivo). Sem `tokensCss()`: a página React não
        // usa os tokens da app.
        extends: false,
        base: './',
        plugins: [],
        oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
        test: {
          name: 'viewer-react',
          environment: 'jsdom',
          env: testEnv,
          include: ['tests/viewer/react*.test.tsx'],
        },
      },
    ],
  },
});
