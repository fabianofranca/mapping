// Abre um zip de prévia no app e captura só a área do canvas.  node shoot2.mjs <zip> <png> [larg alt]
import { createRequire } from 'node:module';
import { PATHS } from '../paths.mjs';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const SCRATCH = PATHS.base;
const require = createRequire(`${SCRATCH}/app/package.json`);
const { chromium } = require('@playwright/test');
const [zipPath, out, w = '2700', h = '1400'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, locale: 'pt-BR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(`${SCRATCH}/app/dist/index.html`).href);
await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'previa.zip', mimeType: 'application/zip', buffer: readFileSync(zipPath) });
try {
  await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 15000 });
} catch {
  await page.screenshot({ path: out });
  console.log('não abriu o editor (veja a captura)');
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);
if (process.env.KEYS) { await page.keyboard.press(process.env.KEYS); await page.waitForTimeout(800); }
const box = process.env.FULL ? undefined : await page.locator('.canvas-area').boundingBox();
await page.screenshot({ path: out, clip: box });
console.log('ok', out, 'zoom', (await page.locator('.statusbar').innerText()).match(/(\d+)%/)?.[1]);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
