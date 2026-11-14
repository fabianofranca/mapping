// Generator of the large project for the R12 steps (canvas-scale stage): a folder with the
// `mapping.json` of N markings (half of them arrows), background containers without a file; no
// network and no image.
//   node scripts/testing/large-project.mjs --marcacoes 2000 --pasta <folder>
// N is a multiple of 100 (100 markings per container). Prints the path of the `mapping.json`.
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(`--${name}`) + 1];
const count = Number(option('marcacoes'));
const folder = option('pasta');
if (!Number.isInteger(count) || count < 100 || count % 100 !== 0 || !folder) {
  console.error(
    'usage: large-project.mjs --marcacoes <n, a multiple of 100> --pasta <folder>',
  );
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), 'large-project-'));
try {
  await build({
    entryPoints: [join(root, 'scripts/perf/project.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: join(tmp, 'project.mjs'),
    logLevel: 'error',
  });
  const { perfMappingJson } = await import(pathToFileURL(join(tmp, 'project.mjs')).href);
  mkdirSync(folder, { recursive: true });
  const target = join(folder, 'mapping.json');
  writeFileSync(target, perfMappingJson(count));
  console.log(target);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
