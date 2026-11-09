// Gerador do projeto grande dos passos do R12 (etapa canvas-escala): uma pasta com o `mapping.json`
// de N marcações (metade de setas), containers de fundo sem arquivo; sem rede e sem imagem.
//   node scripts/testing/large-project.mjs --marcacoes 2000 --pasta <pasta>
// N é múltiplo de 20 (100 marcações por container). Imprime o caminho do `mapping.json`.
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
    'uso: large-project.mjs --marcacoes <n, múltiplo de 100> --pasta <pasta>',
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
