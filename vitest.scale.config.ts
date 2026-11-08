import { defineConfig } from 'vitest/config';
import { fontBytes, wasmBytes } from './tests/support/mcpVitePlugins';

/**
 * Testes de escala (#881): provam que o projeto grande cresce linear (n e 4n marcações, razão < 5×).
 * Ficam fora do `npm test` e do `npm run test:coverage` (o `vite.config.ts` não os enxerga: os arquivos
 * são `tests/scale/*.scale.ts`, sem o sufixo `.test`) e não entram nos shards do CI nem em
 * `tests/support/durations.json`. `npm run test:scale` os roda, um arquivo por vez e sem cobertura
 * (o código instrumentado é mais lento e a razão perderia o sentido).
 */
export default defineConfig({
  test: {
    projects: [
      {
        // src/model/ roda em Node puro; a fase 2 acrescenta o projeto de jsdom (sessão, estado derivado, visualizador).
        test: {
          name: 'scale-model',
          environment: 'node',
          include: ['tests/scale/model/**/*.scale.ts'],
          fileParallelism: false,
          // O auxiliar coleta o lixo antes de cada rodada medida (`globalThis.gc`); o semi-espaço grande evita que o
          // scavenge do V8 (que copia o que está vivo, e o vivo cresce com n) entorte a razão sem que o código seja quadrático.
          execArgv: ['--expose-gc', '--max-semi-space-size=128'],
          testTimeout: 60_000,
        },
      },
      {
        // Sessão, estado derivado e visualizador: o DOM (jsdom) e o armazenamento falso.
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
        // As tools de leitura do MCP em processo (createServer + InMemoryTransport), em Node.
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
