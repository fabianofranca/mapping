// Gera dist-mcp/mapping-mcp.js: um arquivo só, com as dependências embutidas.
// CommonJS de propósito: o `.js` roda com `node` em qualquer repositório, a menos que
// ele declare `"type": "module"` (nesse caso, ponha um package.json `{"type":"commonjs"}` em tools/).
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { wasmFiles } from './wasmFiles.mjs';

// `import bytes from 'wasm:<codec>'` embute os bytes do módulo WebAssembly do codec de imagem
// (@jsquash). Os pacotes têm um `.d.ts` ao lado de cada `.wasm`, então o import passa por este
// nome virtual (tipado em mcp/image/wasm.d.ts).
const require = createRequire(import.meta.url);
const wasmModules = {
  name: 'wasm-modules',
  setup(esbuild) {
    esbuild.onResolve({ filter: /^wasm:/ }, (args) => {
      const file = wasmFiles[args.path];
      if (!file)
        return { errors: [{ text: `módulo WebAssembly desconhecido: ${args.path}` }] };
      return { path: require.resolve(file), namespace: 'wasm-bytes' };
    });
    esbuild.onLoad({ filter: /.*/, namespace: 'wasm-bytes' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'binary',
      watchFiles: [args.path],
    }));
  },
};

// `import texto from './arquivo.md?raw'` embute o texto do arquivo (a documentação servida como recurso).
const rawText = {
  name: 'raw-text',
  setup(esbuild) {
    esbuild.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    esbuild.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
      watchFiles: [args.path],
    }));
  },
};

await build({
  entryPoints: ['mcp/main.ts'],
  plugins: [rawText, wasmModules],
  outfile: 'dist-mcp/mapping-mcp.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

// Este repositório declara "type": "module": sem isto, o `node` leria o bundle como ESM.
await writeFile('dist-mcp/package.json', '{ "type": "commonjs" }\n');
