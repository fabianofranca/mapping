// Gera examples/material3-compose.zip: o pacote `libraries/material3-compose/` (a fonte) compactado
// para "Aplicar zip…" em Especializações (roteiro R17 do docs/TESTING.md). O conteúdo fica na raiz
// do zip (a app aceita com ou sem pasta-raiz). O teste tests/examples/material3ComposeZip.test.ts
// prova que o zip em disco tem o conteúdo da pasta. Para gerar de novo: `npm run build:material3-zip`.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exampleZip } from './exampleProject.mjs';

export const MATERIAL3_COMPOSE_DIR = 'libraries/material3-compose';
export const MATERIAL3_COMPOSE_ZIP = 'examples/material3-compose.zip';

/** Os bytes do zip da biblioteca (mesma data fixa nas entradas: mesmo conteúdo, mesmos bytes). */
export function material3ComposeZip(root = MATERIAL3_COMPOSE_DIR) {
  return exampleZip(root);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await material3ComposeZip();
  await mkdir(dirname(MATERIAL3_COMPOSE_ZIP), { recursive: true });
  await writeFile(MATERIAL3_COMPOSE_ZIP, bytes);
  process.stdout.write(`escrito ${MATERIAL3_COMPOSE_ZIP} (${bytes.length} bytes)\n`);
}
