// Generates examples/material3-compose.zip: the `libraries/material3-compose/` package (the source)
// zipped for "Apply zip…" in Specializations (script R17 of docs/TESTING.md). The content sits at
// the root of the zip (the app accepts it with or without a root folder). The test
// tests/examples/material3ComposeZip.test.ts proves that the zip on disk has the folder's content.
// To generate it again: `npm run build:material3-zip`.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { folderZip } from './exampleProject.mjs';

export const MATERIAL3_COMPOSE_DIR = 'libraries/material3-compose';
export const MATERIAL3_COMPOSE_ZIP = 'examples/material3-compose.zip';

/** The bytes of the library's zip (same fixed date on the entries: same content, same bytes). */
export function material3ComposeZip(root = MATERIAL3_COMPOSE_DIR) {
  return folderZip(root);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await material3ComposeZip();
  await mkdir(dirname(MATERIAL3_COMPOSE_ZIP), { recursive: true });
  await writeFile(MATERIAL3_COMPOSE_ZIP, bytes);
  process.stdout.write(`wrote ${MATERIAL3_COMPOSE_ZIP} (${bytes.length} bytes)\n`);
}
