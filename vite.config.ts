/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';
import type { BuildChannel } from './pwa/build';
import { contentSecurityPolicy, serviceWorker } from './pwa/buildPlugins';
import { tokensCss } from './pwa/tokensCss';
import { resolveBuildId } from './src/utils/build';
import { fontBytes, wasmBytes } from './tests/support/mcpVitePlugins';
import TimedSequencer from './tests/support/timedSequencer';

/** `VITE_CHANNEL=preview` in the build of the branch published at /preview/ (deploy.yml). */
const channel: BuildChannel = process.env.VITE_CHANNEL === 'preview' ? 'preview' : 'main';

/** Build id (phase 5.4): `abc1234 · 2026-10-10`, read by `src/utils/build.ts`. */
const buildId = resolveBuildId({
  githubSha: process.env.GITHUB_SHA,
  gitSha: () =>
    execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  now: new Date(),
});

/**
 * With `--coverage` the code runs instrumented and much slower: the per-frame performance
 * budgets are left out (CI measures them in a step without coverage).
 * `PERF_BUDGETS=off` also turns them off: the deploy runs the suite in parallel and measures
 * the budgets afterwards, on their own (`npm run test:perf`), without competing for CPU. In local `npm test`
 * they run last and on their own (`perf-*` projects, below).
 */
const perfBudgets =
  process.argv.includes('--coverage') || process.env.PERF_BUDGETS === 'off'
    ? 'off'
    : 'on';
/**
 * Under the same condition (`--coverage`, or `PERF_BUDGETS=off` in the parallel deploy) the code
 * runs instrumented or on a loaded machine, and a test of ~1 s without coverage goes over
 * 5 s: in those cases the projects that would stay on the Vitest default use 30 s. Without coverage the
 * limit stays at 5 s. Projects with their own `testTimeout` do not change.
 */
const defaultTestTimeout = perfBudgets === 'off' ? { testTimeout: 30_000 } : {};
/**
 * In the CI shards (`COVERAGE_REPORT=off`) the blob already carries the coverage data and only the
 * `coverage` job generates the report, in `--merge-reports`: generating it in each shard cost ~15 s.
 * Locally (`npm run test:coverage`) the report comes out as usual.
 */
const coverageReporters =
  process.env.COVERAGE_REPORT === 'off' ? [] : ['text-summary', 'json-summary', 'html'];

const testEnv = { PERF_BUDGETS: perfBudgets };

/**
 * Performance budgets (#373): they run in their own projects, after the others
 * (higher `sequence.groupOrder`) and one file at a time, so the measurement does not compete for CPU with
 * the whole suite. The same paths are excluded from `model` and `app` (`exclude`); `npm run test:perf`
 * runs them by file name.
 */
const perfModelFiles = ['tests/model/performance.test.ts'];
const perfAppFiles = [
  'tests/canvas/renderPerformance.test.ts',
  'tests/store/reviewPerf.test.ts',
];
/** MCP batch budget (#882, phase 3): the in-process server, on its own and without coverage. */
const perfMcpFiles = ['tests/mcp/batchPerf.test.ts'];
const perfGroupOrder = 1;

const base = {
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    tokensCss(),
    preact(),
    viteSingleFile(),
    contentSecurityPolicy(),
    serviceWorker(channel),
  ],
};

export default defineConfig({
  ...base,
  test: {
    // `--shard=i/N` splits by time, not by number of files (tests/support/timedSequencer.ts).
    sequence: { sequencer: TimedSequencer },
    // Informational report (no minimum threshold for now): `npm run test:coverage`.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: coverageReporters,
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        // The projects inherit this file's plugins and `define` (Vitest 5): repeating them
        // would apply each plugin twice.
        // src/model/ must run on pure Node: it will be reused by the MCP server.
        test: {
          name: 'model',
          environment: 'node',
          env: testEnv,
          include: ['tests/model/**/*.test.ts'],
          exclude: perfModelFiles,
          ...defaultTestTimeout,
        },
      },
      {
        // Model budgets, on their own and last (see `perfModelFiles`).
        test: {
          name: 'perf-model',
          environment: 'node',
          env: testEnv,
          include: perfModelFiles,
          fileParallelism: false,
          sequence: { groupOrder: perfGroupOrder },
          // The growth cases (`tests/support/growth.ts`) collect garbage between pairs (`globalThis.gc`) and the
          // large semi-space takes the scavenge out of the measured time: the same arguments as the scale projects.
          execArgv: ['--expose-gc', '--max-semi-space-size=128'],
        },
      },
      {
        // MCP batch budget, on its own and last (see `perfModelFiles`): the same environment as the `mcp` project.
        plugins: [wasmBytes(), fontBytes()],
        test: {
          name: 'perf-mcp',
          environment: 'node',
          env: testEnv,
          include: perfMcpFiles,
          fileParallelism: false,
          sequence: { groupOrder: perfGroupOrder },
        },
      },
      {
        // Runs the real `vite build` (native rolldown): needs pure Node, in ordinary
        // processes (jsdom's `vmThreads` isolates objects that the rolldown binding rejects).
        test: {
          name: 'build',
          environment: 'node',
          env: testEnv,
          include: ['tests/build/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        plugins: [wasmBytes(), fontBytes()],
        // MCP server (stage 3a): also on pure Node.
        test: {
          name: 'mcp',
          environment: 'node',
          env: testEnv,
          include: ['tests/mcp/**/*.test.ts'],
          exclude: perfMcpFiles,
          // Generates dist-mcp/mapping-mcp.js once: the integration tests start that file over stdio.
          globalSetup: ['tests/mcp/globalSetup.ts'],
          testTimeout: 30_000,
        },
      },
      {
        // Signature extractor (stage #1079, S3): pure Node, like the MCP server.
        test: {
          name: 'signature',
          environment: 'node',
          env: testEnv,
          include: ['tests/signature/**/*.test.ts'],
          // Generates dist-mcp/mapping-signature.{js,mjs} once: the CLI tests run those files.
          globalSetup: ['tests/signature/globalSetup.ts'],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'app',
          environment: 'jsdom',
          // vmThreads: reuses jsdom across files (CI3, #378): suite ~175 s → ~97 s.
          pool: 'vmThreads',
          env: testEnv,
          setupFiles: ['tests/setup.ts'],
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: [
            'tests/model/**',
            'tests/mcp/**',
            'tests/signature/**',
            'tests/build/**',
            'tests/viewer/react*.test.tsx',
            ...perfAppFiles,
          ],
          ...defaultTestTimeout,
        },
      },
      {
        // Canvas and review budgets, on their own and last (see `perfModelFiles`):
        // the same environment, pool and `setupFiles` as the `app` project.
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
        // React wrapper of the viewer: real React. Without the `preact()` plugin,
        // which aliases react to preact/compat; hence `extends: false` (Vitest 5:
        // the inline project would inherit the file's plugins). Without `tokensCss()`: the React page does not
        // use the app's tokens.
        extends: false,
        base: './',
        plugins: [],
        oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
        test: {
          name: 'viewer-react',
          environment: 'jsdom',
          env: testEnv,
          include: ['tests/viewer/react*.test.tsx'],
          ...defaultTestTimeout,
        },
      },
    ],
  },
});
