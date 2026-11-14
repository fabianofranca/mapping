// Generates examples/suggestions-kotlin.zip (script R14 of docs/TESTING.md): the Kotlin library
// applied with two data classes (User and Address). Bundles tests/e2e/suggestionsKotlinFixture.ts
// with esbuild (like proposalComponents.mjs), runs it and writes the result. The test
// tests/examples/suggestionsKotlin.test.ts proves that the zip on disk is up to date.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const SUGGESTIONS_KOTLIN_ZIP = 'examples/suggestions-kotlin.zip';
const BUNDLE = 'node_modules/.cache/suggestions-kotlin/fixture.mjs';

await build({
  entryPoints: ['tests/e2e/suggestionsKotlinFixture.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
});

const { suggestionsZip } = await import(`${pathToFileURL(join(process.cwd(), BUNDLE))}`);
const bytes = await suggestionsZip();
await mkdir(dirname(SUGGESTIONS_KOTLIN_ZIP), { recursive: true });
await writeFile(SUGGESTIONS_KOTLIN_ZIP, bytes);
process.stdout.write(`wrote ${SUGGESTIONS_KOTLIN_ZIP} (${bytes.length} bytes)\n`);
