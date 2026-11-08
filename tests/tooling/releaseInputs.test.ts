// @vitest-environment node
// Etapa #920, fase RA1, decisão 6: a lista fixa de entradas da release
// (`scripts/release/releaseInputs.mjs`) cobre tudo o que o esbuild do `build:mcp` empacota e as
// fontes dos arquivos do workspace. Se um arquivo novo entra no bundle fora da lista, este teste falha.
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { fontFiles } from '../../mcp/fontFiles.mjs';
import {
  RELEASE_INPUTS,
  isReleaseInput,
  releaseInputsIn,
} from '../../scripts/release/releaseInputs.mjs';
import { WORKSPACE_SOURCES } from '../../scripts/release/workspaceAssets.mjs';

const ROOT = resolve('.');

/** Entradas do bundle do servidor (como `mcp/build.mjs`, mas sem gravar nem ler wasm/fonte). */
async function bundleInputs(): Promise<string[]> {
  const result = await build({
    entryPoints: ['mcp/main.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    metafile: true,
    logLevel: 'silent',
    alias: { 'opentype.js': 'opentype.js/dist/opentype.min.mjs' },
    define: { __MCP_BUILD_SUFFIX__: '""' },
    plugins: [
      {
        name: 'inputs-only',
        setup(b) {
          b.onResolve({ filter: /\?raw$/ }, (a) => ({
            path: resolve(a.resolveDir, a.path.slice(0, -'?raw'.length)),
            namespace: 'raw',
          }));
          b.onResolve({ filter: /^wasm:/ }, (a) => ({ path: a.path, namespace: 'stub' }));
          b.onResolve({ filter: /^font:/ }, (a) => ({
            path: resolve(ROOT, 'mcp', fontFiles[a.path as keyof typeof fontFiles]),
            namespace: 'font',
          }));
          b.onLoad({ filter: /.*/, namespace: 'raw' }, async (a) => ({
            contents: await readFile(a.path, 'utf8'),
            loader: 'text',
          }));
          b.onLoad({ filter: /.*/, namespace: 'font' }, () => ({
            contents: '',
            loader: 'text',
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export default 0',
            loader: 'js',
          }));
        },
      },
    ],
  });
  return Object.keys(result.metafile.inputs)
    .filter((key) => !key.includes('node_modules'))
    .map((key) => {
      const path = key.replace(/^[a-z-]+:(?=\/)/, '');
      return path.startsWith('/') ? relative(ROOT, path) : path;
    })
    .filter((path) => !path.startsWith('wasm:') && !path.startsWith('stub:'));
}

describe('entradas da release do MCP', () => {
  it('a lista cobre tudo o que o esbuild empacota (fora de node_modules)', async () => {
    const inputs = await bundleInputs();
    expect(inputs.length).toBeGreaterThan(100);
    const uncovered = inputs.filter((path) => !isReleaseInput(path));
    expect(uncovered).toEqual([]);
  }, 60_000);

  it('a lista cobre as fontes dos arquivos do workspace', () => {
    expect(WORKSPACE_SOURCES.length).toBe(4);
    for (const path of WORKSPACE_SOURCES) expect(isReleaseInput(path), path).toBe(true);
  });

  it('o que não vai na release fica fora (app, store, docs de processo, lockfile)', () => {
    for (const path of [
      'src/store/history.ts',
      'src/canvas/CanvasController.ts',
      'docs/MCP.md',
      'docs/FLOW.md',
      'CLAUDE.md',
      'package-lock.json',
      'tests/mcp/server.test.ts',
      'changelog/x.md',
    ]) {
      expect(isReleaseInput(path), path).toBe(false);
    }
  });

  it('releaseInputsIn filtra a lista de arquivos mudados', () => {
    expect(releaseInputsIn(['README.md', 'mcp/tools.ts', 'src/model/a.ts'])).toEqual([
      'mcp/tools.ts',
      'src/model/a.ts',
    ]);
  });

  it('todo item da lista existe no repositório', async () => {
    const { existsSync } = await import('node:fs');
    for (const entry of RELEASE_INPUTS) expect(existsSync(entry), entry).toBe(true);
  });
});
