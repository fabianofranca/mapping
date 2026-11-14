// Example project (`examples/full-example/`): the folder (outside `specs/`) plus the
// `EXAMPLE_SPECS` manifest (target → source) make up the example's view; the zip is derived from it.
// `node scripts/exampleProject.mjs` regenerates `examples/full-example.zip` and materializes `specs/`
// (outside git) for "Open folder"; tests/examples/exampleProject.test.ts proves that the zip on disk
// has the content of the view.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import JSZip from 'jszip';

export const EXAMPLE_DIR = 'examples/full-example';
export const EXAMPLE_ZIP = 'examples/full-example.zip';

/** Fixed date on the zip entries: the same content always produces the same bytes. */
const ENTRY_DATE = new Date('2026-10-18T00:00:00Z');

/**
 * Manifest of the example's specializations: each target in `specs/` comes from a source in the
 * repository (file or folder); `exclude` lists paths (relative to the source) that are left out;
 * `indent` writes the JSON with a 2-space indent and a final line break (the source is formatted
 * by prettier).
 */
export const EXAMPLE_SPECS = [
  { target: 'material3-compose', source: 'libraries/material3-compose' },
  { target: 'notas', source: 'libraries/notas', exclude: ['index.ts'] },
  { target: 'sdui.json', source: 'examples/specs/sdui.json', indent: true },
  { target: 'data-model.json', source: 'examples/specs/data-model.json', indent: true },
];

/** Folder where `npm run build:example` materializes the specializations (not versioned). */
const SPECS_DIR = 'specs';

const compareSegments = (a, b) => {
  const x = a.split('/');
  const y = b.split('/');
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
};

/** System and tool junk that never goes into the zip or the example's view. */
const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'node_modules']);

/** Relative path (with `/`) → content of each file in the folder, in alphabetical order. */
export async function folderFiles(root, skip = () => false) {
  const files = new Map();
  const walk = async (dir) => {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (skip(relative)) continue;
      if (entry.isDirectory()) await walk(relative);
      else files.set(relative, await readFile(join(root, relative)));
    }
  };
  await walk('');
  return files;
}

/**
 * The manifest's files, already at their targets (`specs/...`). `root`: the repository root against
 * which the manifest's sources are resolved (default: the current folder).
 */
async function specFiles(root = '.') {
  const files = new Map();
  for (const {
    target,
    source: relativeSource,
    exclude = [],
    indent = false,
  } of EXAMPLE_SPECS) {
    const source = join(root, relativeSource);
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
 * The example's view: the folder outside `specs/` plus the manifest. The `specs/` on disk
 * (materialized copy) is ignored, so it never leaks into the zip.
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

/** The zip of any folder (no manifest), with the content at the root. */
export async function folderZip(root) {
  return zipOf(await folderFiles(root));
}

/** The example project's zip: the content at the root, as "Open zip" expects. */
export async function exampleZip(root = EXAMPLE_DIR) {
  return zipOf(await exampleFiles(root));
}

/** Deletes and rewrites `specs/` in the example's folder from the manifest. */
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
  process.stdout.write(`wrote ${EXAMPLE_ZIP} (${bytes.length} bytes)\n`);
  const count = await materializeSpecs();
  process.stdout.write(`materialized ${EXAMPLE_DIR}/specs/ (${count} files)\n`);
}
