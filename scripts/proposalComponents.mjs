// Generates examples/proposal-components.zip (script R13 of docs/TESTING.md): the "Screens" project
// with an open proposal of new components. Bundles tests/e2e/proposedComponentsFixture.ts
// with esbuild (like buildGuide.mjs), runs it and writes the result. The test
// tests/examples/proposalComponents.test.ts proves that the zip on disk is up to date.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const PROPOSAL_COMPONENTS_ZIP = 'examples/proposal-components.zip';
const BUNDLE = 'node_modules/.cache/proposal-components/fixture.mjs';

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
process.stdout.write(`wrote ${PROPOSAL_COMPONENTS_ZIP} (${bytes.length} bytes)\n`);
