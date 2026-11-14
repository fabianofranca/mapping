// Generates dist-mcp/mapping-signature.js (CommonJS) and dist-mcp/mapping-signature.mjs (ESM): the same
// code, a single file, no dependencies (only `src/model/` and Node). The `.js` is what the acceptance and the
// scripts call (`node dist-mcp/mapping-signature.js kotlin …`); the `.mjs` is what the Release
// publishes and `setup.sh` installs at `tools/mapping-signature.mjs` (a `.mjs` runs with `node` in
// any repository, whatever the `"type"` in its package.json.)
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

// This repository declares "type": "module": without this, `node` would read the `.js` as ESM.
await mkdir('dist-mcp', { recursive: true });
await writeFile('dist-mcp/package.json', '{ "type": "commonjs" }\n');
