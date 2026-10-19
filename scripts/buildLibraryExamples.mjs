// Gera examples/libraries/material3/ a partir do Material 3 do laboratório.
// Empacota scripts/libraryExamples.ts com o esbuild (como mcp/build.mjs), executa e grava.
// O teste tests/model/libraryExamples.test.ts prova que o repositório está em dia.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import process from 'node:process';

const OUT_DIR = 'examples/libraries/material3';
const BUNDLE = 'node_modules/.cache/library-examples/libraryExamples.mjs';

await build({
  entryPoints: ['scripts/libraryExamples.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
});

const { libraryExampleFiles } = await import(
  `${pathToFileURL(join(process.cwd(), BUNDLE))}`
);
const files = libraryExampleFiles();
const wanted = new Set(files.map((f) => f.path));

/** Arquivos que já existem na pasta (fora de `fonts/`, que pode ter binários não versionados). */
async function existing(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await existing(full)));
    else found.push(relative(OUT_DIR, full).split('\\').join('/'));
  }
  return found;
}

for (const path of await existing(OUT_DIR)) {
  if (!wanted.has(path) && !path.startsWith('fonts/')) {
    await rm(join(OUT_DIR, path));
    process.stdout.write(`removido  ${path}` + '\n');
  }
}
for (const file of files) {
  const target = join(OUT_DIR, file.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, file.text);
  process.stdout.write(`escrito   ${OUT_DIR}/${file.path}` + '\n');
}
process.stdout.write(`${files.length} arquivos em ${OUT_DIR}` + '\n');
