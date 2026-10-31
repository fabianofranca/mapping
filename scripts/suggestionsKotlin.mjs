// Gera examples/sugestoes-kotlin.zip (roteiro R14 do docs/TESTING.md): a biblioteca Kotlin aplicada
// com duas data classes (Usuario e Endereco). Empacota tests/e2e/suggestionsKotlinFixture.ts
// com o esbuild (como proposalComponents.mjs), executa e grava. O teste
// tests/examples/suggestionsKotlin.test.ts prova que o zip em disco está em dia.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const SUGGESTIONS_KOTLIN_ZIP = 'examples/sugestoes-kotlin.zip';
const BUNDLE = 'node_modules/.cache/sugestoes-kotlin/fixture.mjs';

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
process.stdout.write(`escrito ${SUGGESTIONS_KOTLIN_ZIP} (${bytes.length} bytes)\n`);
