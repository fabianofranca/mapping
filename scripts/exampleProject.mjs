// Projeto de exemplo (`examples/exemplo-completo/`): a pasta (fora de `specs/`) mais o manifesto
// `EXAMPLE_SPECS` (destino → fonte) formam a vista do exemplo; o zip é derivado dela.
// `node scripts/exampleProject.mjs` regera `examples/exemplo-completo.zip` e materializa `specs/`
// (fora do git) para "Abrir pasta"; tests/examples/exampleProject.test.ts prova que o zip em disco
// tem o conteúdo da vista.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import JSZip from 'jszip';

export const EXAMPLE_DIR = 'examples/exemplo-completo';
export const EXAMPLE_ZIP = 'examples/exemplo-completo.zip';

/** Data fixa nas entradas do zip: o mesmo conteúdo gera sempre os mesmos bytes. */
const ENTRY_DATE = new Date('2026-10-18T00:00:00Z');

/**
 * Manifesto das especializações do exemplo: cada destino em `specs/` vem de uma fonte do repositório
 * (arquivo ou pasta); `exclude` lista caminhos (relativos à fonte) que não entram; `indent` grava o
 * JSON com recuo de 2 espaços e quebra de linha final (a fonte é formatada pelo prettier).
 */
export const EXAMPLE_SPECS = [
  { target: 'material3-compose', source: 'libraries/material3-compose' },
  { target: 'notas', source: 'libraries/notas', exclude: ['index.ts'] },
  { target: 'sdui.json', source: 'examples/specs/sdui.json', indent: true },
  {
    target: 'modelo-dados.json',
    source: 'examples/specs/modelo-de-dados.json',
    indent: true,
  },
];

/** Pasta onde `npm run build:example` materializa as especializações (não versionada). */
const SPECS_DIR = 'specs';

const compareSegments = (a, b) => {
  const x = a.split('/');
  const y = b.split('/');
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
};

/** Caminho relativo (com `/`) → conteúdo de cada arquivo da pasta, em ordem alfabética. */
export async function folderFiles(root, skip = () => false) {
  const files = new Map();
  const walk = async (dir) => {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (skip(relative)) continue;
      if (entry.isDirectory()) await walk(relative);
      else files.set(relative, await readFile(join(root, relative)));
    }
  };
  await walk('');
  return files;
}

/** Os arquivos do manifesto, já nos destinos (`specs/...`). */
async function specFiles() {
  const files = new Map();
  for (const { target, source, exclude = [], indent = false } of EXAMPLE_SPECS) {
    if ((await stat(source)).isDirectory()) {
      const skip = (relative) => exclude.includes(relative);
      for (const [path, bytes] of await folderFiles(source, skip))
        files.set(`${SPECS_DIR}/${target}/${path}`, bytes);
    } else {
      const bytes = await readFile(source);
      files.set(
        `${SPECS_DIR}/${target}`,
        indent
          ? Buffer.from(
              `${JSON.stringify(JSON.parse(bytes.toString('utf8')), null, 2)}\n`,
            )
          : bytes,
      );
    }
  }
  return files;
}

/**
 * A vista do exemplo: a pasta fora de `specs/` mais o manifesto. O `specs/` do disco (cópia
 * materializada) é ignorado, para nunca vazar para o zip.
 */
export async function exampleFiles(root = EXAMPLE_DIR) {
  const own = await folderFiles(root, (relative) => relative === SPECS_DIR);
  const all = new Map([...own, ...(await specFiles())]);
  return new Map([...all].sort(([a], [b]) => compareSegments(a, b)));
}

async function zipOf(files) {
  const zip = new JSZip();
  for (const [path, bytes] of files) {
    zip.file(path, bytes, { date: ENTRY_DATE, createFolders: false });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/** O zip de uma pasta qualquer (sem manifesto), com o conteúdo na raiz. */
export async function folderZip(root) {
  return zipOf(await folderFiles(root));
}

/** O zip do projeto de exemplo: o conteúdo na raiz, como o "Abrir zip" espera. */
export async function exampleZip(root = EXAMPLE_DIR) {
  return zipOf(await exampleFiles(root));
}

/** Apaga e reescreve `specs/` na pasta do exemplo a partir do manifesto. */
export async function materializeSpecs(root = EXAMPLE_DIR) {
  const dir = join(root, SPECS_DIR);
  await rm(dir, { recursive: true, force: true });
  const files = await specFiles();
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
  return files.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await exampleZip();
  await mkdir(dirname(EXAMPLE_ZIP), { recursive: true });
  await writeFile(EXAMPLE_ZIP, bytes);
  process.stdout.write(`escrito ${EXAMPLE_ZIP} (${bytes.length} bytes)\n`);
  const count = await materializeSpecs();
  process.stdout.write(`materializado ${EXAMPLE_DIR}/specs/ (${count} arquivos)\n`);
}
