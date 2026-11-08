import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';
import { fontFiles } from '../../mcp/fontFiles.mjs';
import { wasmFiles } from '../../mcp/wasmFiles.mjs';

// Plugins do Vite que resolvem `wasm:` e `font:` do servidor MCP nos testes (o esbuild os embute no build).
// Compartilhados pelo `vite.config.ts` (projeto `mcp`) e pelo `vitest.scale.config.ts` (projeto `scale-mcp`).

/** Nos testes do `mcp`, `import bytes from 'wasm:png'` (codecs de imagem) lê o `.wasm` do pacote, como o esbuild faz no build. */
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

/** Nos testes do `mcp`, `import bytes from 'font:sans'` lê o TTF embutido (mcp/fonts/), como o esbuild faz no build. */
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
