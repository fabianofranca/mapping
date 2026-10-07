// Gera dist-mcp/mapping-mcp.js: um arquivo só, com as dependências embutidas.
// CommonJS de propósito: o `.js` roda com `node` em qualquer repositório, a menos que
// ele declare `"type": "module"` (nesse caso, ponha um package.json `{"type":"commonjs"}` em tools/).
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await build({
  entryPoints: ['mcp/main.ts'],
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
