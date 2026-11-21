import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import { fontFiles } from '../../mcp/fontFiles.mjs';
import { patchHarfBuzzSource } from '../../mcp/harfbuzzFiles.mjs';
import { wasmFiles } from '../../mcp/wasmFiles.mjs';

// Vite plugins that resolve `wasm:` and `font:` of the MCP server in the tests (esbuild embeds them in the build) and patch `harfbuzzjs`.
// Shared by `vite.config.ts` (project `mcp`) and by `vitest.scale.config.ts` (project `scale-mcp`).

/** In the `mcp` tests, `import bytes from 'wasm:png'` (image codecs) reads the package's `.wasm`, as esbuild does in the build. */
export function wasmBytes(): Plugin {
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

/** In the `mcp` tests, `import bytes from 'font:sans'` reads the embedded TTF (mcp/fonts/), as esbuild does in the build. */
export function fontBytes(): Plugin {
  const prefix = '\0font-bytes:';
  return {
    name: 'font-bytes',
    resolveId: (id) => (id.startsWith('font:') ? prefix + id : null),
    load(id) {
      if (!id.startsWith(prefix)) return null;
      const file = fontFiles[id.slice(prefix.length) as keyof typeof fontFiles];
      const base64 = readFileSync(new URL(`../../mcp/${file}`, import.meta.url)).toString(
        'base64',
      );
      return `export default new Uint8Array(Buffer.from('${base64}', 'base64'));`;
    },
  };
}

/**
 * In the `mcp` tests, `harfbuzzjs` goes through the same patch as the server bundle (`mcp/harfbuzzFiles.mjs`): its
 * top-level await becomes `initHarfBuzz`, so the tests start HarfBuzz from the embedded bytes (`tests/support/shaperSetup.ts`).
 * The package is inlined: Vitest would otherwise load it from `node_modules` as is, without the plugin's transform.
 */
export function harfbuzzModule(): Plugin {
  return {
    name: 'harfbuzz-module',
    enforce: 'pre',
    config: () =>
      ({ test: { server: { deps: { inline: [/harfbuzzjs/] } } } }) as Record<
        string,
        unknown
      >,
    transform(code, id) {
      const patched = patchHarfBuzzSource(id.split('?')[0]!, code, { cjs: false });
      return patched === null ? null : { code: patched, map: null };
    },
  };
}
