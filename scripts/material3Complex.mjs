// Gera examples/material3-complexos.zip: uma tela de reserva montada só com a biblioteca
// Material 3 (Compose), com os componentes de mais propriedades e todas preenchidas. Empacota
// tests/e2e/material3ComplexFixture.ts com o esbuild (como suggestionsKotlin.mjs), executa e grava.
// O teste tests/examples/material3Complex.test.ts prova que o zip em disco está em dia.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const COMPLEX_ZIP = 'examples/material3-complexos.zip';
const BUNDLE = 'node_modules/.cache/material3-complexos/fixture.mjs';

await build({
  entryPoints: ['tests/e2e/material3ComplexFixture.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
});

const { complexZip } = await import(`${pathToFileURL(join(process.cwd(), BUNDLE))}`);
const bytes = await complexZip();
await mkdir(dirname(COMPLEX_ZIP), { recursive: true });
await writeFile(COMPLEX_ZIP, bytes);
process.stdout.write(`escrito ${COMPLEX_ZIP} (${bytes.length} bytes)\n`);
