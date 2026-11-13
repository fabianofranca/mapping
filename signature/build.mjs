// Gera dist-mcp/mapping-signature.js (CommonJS) e dist-mcp/mapping-signature.mjs (ESM): o mesmo
// código, um arquivo só, sem dependência (só `src/model/` e o Node). O `.js` é o que o aceite e os
// roteiros chamam (`node dist-mcp/mapping-signature.js kotlin …`); o `.mjs` é o que a Release
// publica e o `setup.sh` instala em `tools/mapping-signature.mjs` (um `.mjs` roda com `node` em
// qualquer repositório, qualquer que seja o `"type"` do package.json dele).
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const common = {
  entryPoints: ['signature/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  legalComments: 'none',
  logLevel: 'info',
};

await build({ ...common, format: 'cjs', outfile: 'dist-mcp/mapping-signature.js' });
await build({ ...common, format: 'esm', outfile: 'dist-mcp/mapping-signature.mjs' });

// Este repositório declara "type": "module": sem isto, o `node` leria o `.js` como ESM.
await mkdir('dist-mcp', { recursive: true });
await writeFile('dist-mcp/package.json', '{ "type": "commonjs" }\n');
