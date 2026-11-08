// Abre o projeto `comentarios` no build real do app (dist/index.html) e tira capturas.
// Uso: node shoot.mjs <saída.png> [zoomNoContainer]
import { createRequire } from 'node:module';
import { PATHS } from '../paths.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRATCH = PATHS.base;
const SRC = `${SCRATCH}/app`;
const PROJECT = `${PATHS.ws}/projetos/comentarios`;
const require = createRequire(`${SRC}/package.json`);
const { chromium } = require('@playwright/test');
const JSZip = require('jszip');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

async function projectZip() {
  const zip = new JSZip();
  for (const full of walk(PROJECT)) {
    const rel = relative(PROJECT, full).split('\\').join('/');
    if (rel.startsWith('proposals/') || rel === '.gitignore') continue;
    zip.file(rel, readFileSync(full));
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

const out = process.argv[2] ?? `${SCRATCH}/shots/full.png`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 1, locale: 'pt-BR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(pathToFileURL(`${SRC}/dist/index.html`).href);
await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({
  name: 'comentarios.zip',
  mimeType: 'application/zip',
  buffer: await projectZip(),
});
await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
// Zoom opcional: node shoot.mjs <png> <alvo%> <x> <y> [panDx panDy]
const target = Number(process.argv[3] ?? 0);
if (target > 0) {
  const x = Number(process.argv[4]);
  const y = Number(process.argv[5]);
  const zoomNow = async () => Number((await page.locator('.statusbar').innerText()).match(/(\d+)%/)?.[1] ?? 0);
  await page.mouse.move(x, y);
  for (let i = 0; i < 80 && (await zoomNow()) < target; i++) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -60);
    await page.keyboard.up('Control');
    await page.waitForTimeout(40);
  }
  const dx = Number(process.argv[6] ?? 0);
  const dy = Number(process.argv[7] ?? 0);
  if (dx || dy) await page.mouse.wheel(dx, dy);
  await page.waitForTimeout(800);
  console.log('zoom', await zoomNow());
}
const clip = process.env.CLIP ? JSON.parse(process.env.CLIP) : undefined;
await page.screenshot({ path: out, clip });
console.log('ok', out);
if (errors.length) console.log('erros:', errors.slice(0, 10).join('\n'));
await browser.close();
