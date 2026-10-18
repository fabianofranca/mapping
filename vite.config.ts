/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { wasmFiles } from './mcp/wasmFiles.mjs';
import { channelManifest, stampServiceWorker, type BuildChannel } from './pwa/build';
import { applyCsp } from './pwa/csp';
import { tokensCss } from './pwa/tokensCss';
import { resolveBuildId } from './src/utils/build';

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
 * os orçamentos depois, sozinhos (`npm run test:perf`), sem disputar CPU.
 */
const perfBudgets =
  process.argv.includes('--coverage') || process.env.PERF_BUDGETS === 'off'
    ? 'off'
    : 'on';
/** Nos testes do `mcp`, `import bytes from 'wasm:png'` (codecs de imagem) lê o `.wasm` do pacote, como o esbuild faz no build. */
function wasmBytes(): Plugin {
  const require = createRequire(import.meta.url);
  const prefix = '\0wasm-bytes:';
  return {
    name: 'wasm-bytes',
    resolveId: (id) => (id.startsWith('wasm:') ? prefix + id : null),
    load(id) {
      if (!id.startsWith(prefix)) return null;
      const file = wasmFiles[id.slice(prefix.length) as keyof typeof wasmFiles];
      const base64 = readFileSync(require.resolve(file)).toString('base64');
      return `export default new Uint8Array(Buffer.from('${base64}', 'base64'));`;
    },
  };
}

const testEnv = { PERF_BUDGETS: perfBudgets };

const base = {
  base: './',
  // O zip do projeto de exemplo entra no bundle como data URI (`?inline`, src/app/exampleProject.ts).
  assetsInclude: ['**/*.zip'],
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
        plugins: [...base.plugins, wasmBytes()],
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
        ...base,
        test: {
          name: 'app',
          environment: 'jsdom',
          env: testEnv,
          setupFiles: ['tests/setup.ts'],
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: ['tests/model/**', 'tests/mcp/**', 'tests/lab/viewer/react*.test.tsx'],
        },
      },
      {
        // Invólucro React do visualizador (fase L1): React de verdade. Sem o plugin
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
          include: ['tests/lab/viewer/react*.test.tsx'],
        },
      },
    ],
  },
});
