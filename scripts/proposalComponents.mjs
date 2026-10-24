// Gera examples/proposta-componentes.zip (roteiro R13 do docs/TESTING.md): o projeto "Telas"
// com uma proposta aberta de componentes novos. Empacota tests/e2e/proposedComponentsFixture.ts
// com o esbuild (como buildGuia.mjs), executa e grava. O teste
// tests/examples/proposalComponents.test.ts prova que o zip em disco está em dia.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const PROPOSAL_COMPONENTS_ZIP = 'examples/proposta-componentes.zip';
const BUNDLE = 'node_modules/.cache/proposta-componentes/fixture.mjs';

await build({
  entryPoints: ['tests/e2e/proposedComponentsFixture.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
});

const { showcaseZip } = await import(`${pathToFileURL(join(process.cwd(), BUNDLE))}`);
const bytes = await showcaseZip();
await mkdir(dirname(PROPOSAL_COMPONENTS_ZIP), { recursive: true });
await writeFile(PROPOSAL_COMPONENTS_ZIP, bytes);
process.stdout.write(`escrito ${PROPOSAL_COMPONENTS_ZIP} (${bytes.length} bytes)\n`);
