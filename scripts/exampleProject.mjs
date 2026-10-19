// Projeto de exemplo (`examples/exemplo-completo/`): a pasta é a fonte, o zip é derivado.
// `node scripts/exampleProject.mjs` regera `examples/exemplo-completo.zip`; o teste
// tests/examples/exampleProject.test.ts prova que o zip em disco tem o conteúdo da pasta.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import JSZip from 'jszip';

export const EXAMPLE_DIR = 'examples/exemplo-completo';
export const EXAMPLE_ZIP = 'examples/exemplo-completo.zip';

/** Data fixa nas entradas do zip: o mesmo conteúdo gera sempre os mesmos bytes. */
const ENTRY_DATE = new Date('2026-10-18T00:00:00Z');

/** Caminho relativo (com `/`) → conteúdo de cada arquivo da pasta, em ordem alfabética. */
export async function exampleFiles(root = EXAMPLE_DIR) {
  const files = new Map();
  const walk = async (dir) => {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(relative);
      else files.set(relative, await readFile(join(root, relative)));
    }
  };
  await walk('');
  return files;
}

/** O zip do projeto de exemplo: o conteúdo na raiz, como o "Abrir zip" espera. */
export async function exampleZip(root = EXAMPLE_DIR) {
  const zip = new JSZip();
  for (const [path, bytes] of await exampleFiles(root)) {
    zip.file(path, bytes, { date: ENTRY_DATE, createFolders: false });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await exampleZip();
  await mkdir(dirname(EXAMPLE_ZIP), { recursive: true });
  await writeFile(EXAMPLE_ZIP, bytes);
  process.stdout.write(`escrito ${EXAMPLE_ZIP} (${bytes.length} bytes)\n`);
}
