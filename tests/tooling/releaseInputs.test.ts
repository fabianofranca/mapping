// @vitest-environment node
// Stage #920, phase RA1, decision 6: the fixed list of release inputs
// (`scripts/release/releaseInputs.mjs`) covers everything the `build:mcp` esbuild bundles and the
// sources of the workspace files. If a new file enters the bundle outside the list, this test fails.
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';
import { harfbuzzSourceFilter, patchHarfBuzzSource } from '../../mcp/harfbuzzFiles.mjs';
import { describe, expect, it } from 'vitest';
import { fontFiles } from '../../mcp/fontFiles.mjs';
import {
  RELEASE_INPUTS,
  isReleaseInput,
  releaseInputsIn,
} from '../../scripts/release/releaseInputs.mjs';
import { WORKSPACE_SOURCES } from '../../scripts/release/workspaceAssets.mjs';

const ROOT = resolve('.');

/** Server bundle inputs (like `mcp/build.mjs`, but without writing or reading wasm/font). */
async function bundleInputs(): Promise<string[]> {
  const result = await build({
    entryPoints: ['mcp/main.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    metafile: true,
    logLevel: 'silent',
    define: { __MCP_BUILD_SUFFIX__: '""' },
    plugins: [
      {
        name: 'inputs-only',
        setup(b) {
          // The same patch as `mcp/build.mjs`: without it esbuild refuses harfbuzzjs's top-level await in CommonJS.
          b.onLoad({ filter: harfbuzzSourceFilter }, async (a) => ({
            contents: patchHarfBuzzSource(a.path, await readFile(a.path, 'utf8'), {
              cjs: true,
            })!,
            loader: 'js',
          }));
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

/** Signature extractor bundle inputs (`signature/main.ts`), outside node_modules. */
async function signatureInputs(): Promise<string[]> {
  const result = await build({
    entryPoints: ['signature/main.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  return Object.keys(result.metafile.inputs)
    .filter((key) => !key.includes('node_modules'))
    .map((key) => (key.startsWith('/') ? relative(ROOT, key) : key));
}

describe('MCP release inputs', () => {
  it('the signature extractor: everything esbuild bundles and the signature/ folder are in the list', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const inputs = await signatureInputs();
    expect(inputs).toContain('signature/main.ts');
    expect(inputs.filter((path) => !isReleaseInput(path))).toEqual([]);
    expect(RELEASE_INPUTS).toContain('signature/');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = `${dir}/${name}`;
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    for (const path of walk('signature')) expect(isReleaseInput(path), path).toBe(true);
  }, 60_000);

  it('the list covers everything esbuild bundles (outside node_modules)', async () => {
    const inputs = await bundleInputs();
    expect(inputs.length).toBeGreaterThan(100);
    const uncovered = inputs.filter((path) => !isReleaseInput(path));
    expect(uncovered).toEqual([]);
  }, 60_000);

  it('the list covers the sources of the workspace files', () => {
    expect(WORKSPACE_SOURCES.length).toBe(5);
    for (const path of WORKSPACE_SOURCES) expect(isReleaseInput(path), path).toBe(true);
  });

  it('the workspace sources come from WORKSPACE_SOURCES, with no duplicated list in the file', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('scripts/release/releaseInputs.mjs', 'utf8');
    for (const path of WORKSPACE_SOURCES) expect(source, path).not.toContain(`'${path}'`);
    for (const path of WORKSPACE_SOURCES) expect(RELEASE_INPUTS).toContain(path);
  });

  it('what does not go in the release stays out (app, store, process docs, lockfile)', () => {
    for (const path of [
      'src/store/history.ts',
      'src/canvas/CanvasController.ts',
      'docs/MCP.md',
      'docs/FLOW.md',
      'CLAUDE.md',
      'docs/PROCESS.md',
      'package-lock.json',
      'tests/mcp/server.test.ts',
      'changelog/x.md',
    ]) {
      expect(isReleaseInput(path), path).toBe(false);
    }
  });

  it('releaseInputsIn filters the list of changed files', () => {
    expect(releaseInputsIn(['README.md', 'mcp/tools.ts', 'src/model/a.ts'])).toEqual([
      'mcp/tools.ts',
      'src/model/a.ts',
    ]);
  });

  it('every item of the list exists in the repository', async () => {
    const { existsSync } = await import('node:fs');
    for (const entry of RELEASE_INPUTS) expect(existsSync(entry), entry).toBe(true);
  });
});
