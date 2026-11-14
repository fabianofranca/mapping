import { defineConfig } from 'vitest/config';
import { fontBytes, wasmBytes } from './tests/support/mcpVitePlugins';

/**
 * Scale tests (#881): they prove that the large project grows linearly (n and 4n markings, ratio < 6×, n and 4n interleaved; the same helper and the same ceiling apply to the growth cases of `npm run test:perf`).
 * They stay out of `npm test` and `npm run test:coverage` (`vite.config.ts` does not see them: the files
 * are `tests/scale/*.scale.ts`, without the `.test` suffix) and are not part of the CI shards or of
 * `tests/support/durations.json`. `npm run test:scale` runs them, one file at a time and without coverage
 * (instrumented code is slower and the ratio would lose its meaning).
 */
export default defineConfig({
  test: {
    projects: [
      {
        // src/model/ runs in plain Node; phase 2 adds the jsdom project (session, derived state, viewer).
        test: {
          name: 'scale-model',
          environment: 'node',
          include: ['tests/scale/model/**/*.scale.ts'],
          fileParallelism: false,
          // The helper collects garbage before each measured round (`globalThis.gc`); the large semi-space prevents
          // V8's scavenge (which copies what is alive, and what is alive grows with n) from bending the ratio when the code is not quadratic.
          execArgv: ['--expose-gc', '--max-semi-space-size=128'],
          testTimeout: 60_000,
        },
      },
      {
        // Session, derived state and viewer: the DOM (jsdom) and the fake storage.
        test: {
          name: 'scale-app',
          environment: 'jsdom',
          include: ['tests/scale/app/**/*.scale.ts'],
          setupFiles: ['tests/setup.ts'],
          fileParallelism: false,
          execArgv: ['--expose-gc', '--max-semi-space-size=128'],
          testTimeout: 120_000,
        },
      },
      {
        // The MCP read tools in process (createServer + InMemoryTransport), in Node.
        plugins: [wasmBytes(), fontBytes()],
        test: {
          name: 'scale-mcp',
          environment: 'node',
          include: ['tests/scale/mcp/**/*.scale.ts'],
          fileParallelism: false,
          execArgv: ['--expose-gc', '--max-semi-space-size=128'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
