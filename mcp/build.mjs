// Gera dist-mcp/mapping-mcp.js: um arquivo só, com as dependências embutidas.
// CommonJS de propósito: o `.js` roda com `node` em qualquer repositório, a menos que
// ele declare `"type": "module"` (nesse caso, ponha um package.json `{"type":"commonjs"}` em tools/).
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

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
  plugins: [rawText],
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
