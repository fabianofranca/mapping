// Gera public/guia/index.html (o guia interativo) a partir de scripts/guia/template.html e de
// examples/exemplo-completo/mapping.json. Empacota scripts/guia.ts com o esbuild (como
// o esbuild de mcp/build.mjs), executa e grava. O Vite copia public/ para dist/guia/.
// O teste tests/examples/guia.test.ts prova que o repositório está em dia.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const BUNDLE = 'node_modules/.cache/guia/guia.mjs';

await build({
  entryPoints: ['scripts/guia.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error',
});

const { GUIA_OUTPUT, guiaHtml } = await import(
  `${pathToFileURL(join(process.cwd(), BUNDLE))}`
);
const html = guiaHtml();
await mkdir(dirname(GUIA_OUTPUT), { recursive: true });
await writeFile(GUIA_OUTPUT, html);
process.stdout.write(`escrito ${GUIA_OUTPUT} (${html.length} bytes)\n`);
