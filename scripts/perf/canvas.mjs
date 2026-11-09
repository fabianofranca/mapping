// `npm run perf:canvas`: mede o canvas num Chromium de verdade, contra o dist/index.html (rode
// `npm run build` antes). Fora do CI (tempo de navegador varia demais). Imprime a tabela.
//   npm run perf:canvas                    2.000 e 5.000 marcações
//   npm run perf:canvas -- 500 2000        outros tamanhos (múltiplos de 20)
// O Chromium vem do Playwright; PLAYWRIGHT_CHROMIUM_EXECUTABLE aponta outro, se preciso.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
if (sizes.length === 0) sizes.push(2000, 5000);
const FOLDER = 'perf-canvas';

const tmp = mkdtempSync(join(tmpdir(), 'perf-canvas-'));
await build({
  entryPoints: [join(root, 'scripts/perf/project.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: join(tmp, 'project.mjs'),
  logLevel: 'error',
});
const { perfMappingJson } = await import(pathToFileURL(join(tmp, 'project.mjs')).href);

const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch('http://localhost:4174/')).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const rows = [];
try {
  for (const size of sizes) rows.push(await measure(size));
} finally {
  await browser.close();
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `\nperf:canvas — Chromium ${browser.version()}, janela 1280×860, ms (mediana)`,
);
console.table(rows);

async function measure(size) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  // Soma do tempo dos callbacks de `requestAnimationFrame` (o quadro do controller e o desenho
  // do Konva) e conta os canvases limpos (`clearRect`): duas por camada redesenhada (cena e acerto).
  await page.addInitScript((folder) => {
    window.__frameMs = 0;
    window.__clears = new Map();
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const start = performance.now();
        try {
          cb(t);
        } finally {
          window.__frameMs += performance.now() - start;
        }
      });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      window.__clears.set(this.canvas, (window.__clears.get(this.canvas) ?? 0) + 1);
      return clear.apply(this, args);
    };
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const dir = await navigator.storage.getDirectory();
      return dir.getDirectoryHandle(folder, { create: true });
    });
  }, FOLDER);
  await page.goto('http://localhost:4174/');
  await page.evaluate(
    async ([folder, json]) => {
      const dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle(folder, {
        create: true,
      });
      const w = await (
        await dir.getFileHandle('mapping.json', { create: true })
      ).createWritable();
      await w.write(json);
      await w.close();
    },
    [FOLDER, perfMappingJson(size)],
  );
  await page.evaluate(() => {
    window.__frameMs = 0;
  });
  const t0 = Date.now();
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  const main = page.getByRole('main', { name: 'Canvas do projeto' });
  await main.waitFor({ timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector('.canvas-host')?.dataset.fits !== undefined,
    null,
    {
      timeout: 120_000,
    },
  );
  await settle(page);
  const open = await page.evaluate(() => window.__frameMs);
  const openWall = Date.now() - t0;
  await page.getByRole('button', { name: 'Enquadrar tudo' }).click();
  await settle(page);
  const box = await main.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const sample = async (n, act) => {
    const ms = [];
    let layers = 0;
    for (let i = 0; i < n + 2; i++) {
      await page.evaluate(() => {
        window.__frameMs = 0;
        window.__clears.clear();
      });
      await act(i);
      await settle(page);
      const r = await page.evaluate(() => [window.__frameMs, window.__clears.size]);
      if (i >= 2) {
        ms.push(r[0]);
        layers = Math.max(layers, r[1] / 2); // cada camada limpa o canvas da cena e o de acerto
      }
    }
    return { ms: median(ms), layers };
  };
  const zoom = await sample(8, async (i) => {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 ? 40 : -40);
  });
  const pan = await sample(8, async (i) => {
    await page
      .getByRole('button', { name: 'Navegar' })
      .click()
      .catch(() => undefined);
    await page.mouse.move(box.x + 6, box.y + 6);
    await page.mouse.down();
    await page.mouse.move(box.x + 6 + (i % 2 ? 40 : 80), box.y + 6 + 20, { steps: 2 });
    await page.mouse.up();
  });
  await page
    .getByRole('button', { name: 'Desenhar' })
    .click()
    .catch(() => undefined);
  // Seleciona a primeira marcação pela árvore e lê a caixa dela na tela (`data-selection-box`).
  await page.locator('.tree-row').first().click();
  await page.waitForFunction(
    () => document.querySelector('.canvas-host')?.dataset.selectionBox,
  );
  const sel = await page.evaluate(
    () => document.querySelector('.canvas-host').dataset.selectionBox,
  );
  const [sx, sy, sw, sh] = sel.split(' ').map(Number);
  const px = box.x + sx + sw / 2;
  const py = box.y + sy + sh / 2;
  const details = page.locator('[data-window="details"]');
  if (!(await details.isVisible())) {
    await page
      .getByRole('button', { name: /Detalhes/ })
      .first()
      .click();
  }
  const edit = await sample(6, async (i) => {
    const name = page
      .locator('[data-window="details"]')
      .getByRole('textbox', { name: 'Nome' })
      .first();
    await name.fill(`Nome ${i}`);
    await name.press('Enter');
  });
  const dragSample = await sample(5, async (i) => {
    await page.mouse.move(px, py);
    await page.mouse.down();
    for (let s = 1; s <= 10; s++)
      await page.mouse.move(px + (i % 2 ? -s : s) * 2, py + s);
    await page.mouse.up();
  });
  await context.close();
  const f = (x) => Math.round(x * 10) / 10;
  return {
    marcações: size,
    'abrir (ms de quadro)': f(open),
    'abrir (relógio)': openWall,
    'pan (quadro)': f(pan.ms),
    'pan (camadas)': pan.layers,
    'zoom (quadro)': f(zoom.ms),
    'zoom (camadas)': zoom.layers,
    'edição (quadro)': f(edit.ms),
    'edição (camadas)': edit.layers,
    'arrasto 10 moves (soma)': f(dragSample.ms),
    'arrasto (camadas)': dragSample.layers,
  };
}

/** Espera os quadros agendados (o do controller e o do Konva que ele agenda). */
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setTimeout(resolve, 30)),
          ),
        ),
      ),
  );
}
