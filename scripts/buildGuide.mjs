// Generates public/guide/index.html (the interactive guide, en-US and pt-BR) from
// scripts/guide/template.html and the example project's mapping.json, and public/guia/index.html
// (the old address, which redirects to the guide). Bundles scripts/guide.ts with esbuild (like
// mcp/build.mjs's), runs it and writes. Vite copies public/ to dist/.
// tests/examples/guide.test.ts proves the repository is up to date.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const BUNDLE = 'node_modules/.cache/guide/guide.mjs';

await build({
  entryPoints: ['scripts/guide.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  external: ['esbuild'],
  format: 'esm',
  target: 'node20',
  // `src/store/toolWindows` (the shortcut numbering) pulls in the build channel; the guide is
  // the same in any channel.
  define: { 'import.meta.env.VITE_CHANNEL': 'undefined' },
  logLevel: 'error',
});

const { GUIDE_OUTPUT, GUIDE_REDIRECT_OUTPUT, guideHtml, guideRedirectHtml } =
  await import(`${pathToFileURL(join(process.cwd(), BUNDLE))}`);
for (const [output, html] of [
  [GUIDE_OUTPUT, guideHtml()],
  [GUIDE_REDIRECT_OUTPUT, guideRedirectHtml()],
]) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  process.stdout.write(`written ${output} (${html.length} bytes)\n`);
}
