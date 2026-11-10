// `npm run perf:canvas`: mede o canvas num Chromium de verdade, contra o dist/index.html (rode
// `npm run build` antes). Fora do CI (tempo de navegador varia demais). Imprime a tabela.
//   npm run perf:canvas                    2.000 e 5.000 marcações
//   npm run perf:canvas -- 500 2000        outros tamanhos (múltiplos de 100)
// Opções (sem nenhuma, a tabela é a de sempre):
//   --setas <n>      n setas no cenário (padrão: metade das marcações)
//   --sem-setas      "Mostrar setas" desligado (mapping.showArrows = off no localStorage)
//   --componentes    acrescenta, em cada container, as 21 instâncias da tela M3_SCREEN (Material 3;
//                    a biblioteca vai para specs/material3/ da pasta)
//   --vezes <k>      roda k vezes e imprime a mediana de cada célula (padrão 1)
// O Chromium vem do Playwright; PLAYWRIGHT_CHROMIUM_EXECUTABLE aponta outro, se preciso.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const { sizes, arrows, noArrows, components, times } = parseArgs(process.argv.slice(2));
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
const { perfMappingJson, perfLibraryFiles } = await import(
  pathToFileURL(join(tmp, 'project.mjs')).href
);

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
  for (const size of sizes) {
    const runs = [];
    for (let k = 0; k < times; k++) {
      runs.push(await measure(size));
      console.log(JSON.stringify(runs.at(-1)));
    }
    rows.push(medianRow(runs));
  }
} finally {
  await browser.close();
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}

const extras = [
  arrows !== undefined ? `${arrows} setas` : null,
  noArrows ? 'sem setas' : null,
  components ? 'com componentes' : null,
  times > 1 ? `mediana de ${times} execuções` : null,
].filter(Boolean);
console.log(
  `\nperf:canvas — Chromium ${browser.version()}, janela 1280×860, ms (mediana)` +
    (extras.length > 0 ? ` — ${extras.join(', ')}` : ''),
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
  await page.addInitScript(
    ([folder, hideArrows]) => {
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
      if (hideArrows) {
        try {
          localStorage.setItem('mapping.showArrows', 'off');
        } catch {
          // sem armazenamento: as setas ficam ligadas
        }
      }
    },
    [FOLDER, noArrows],
  );
  await page.goto('http://localhost:4174/');
  await page.evaluate(
    async ([folder, json, library]) => {
      const dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle(folder, {
        create: true,
      });
      const write = async (parent, name, data) => {
        const w = await (
          await parent.getFileHandle(name, { create: true })
        ).createWritable();
        await w.write(data);
        await w.close();
      };
      await write(dir, 'mapping.json', json);
      for (const file of library) {
        const parts = file.path.split('/');
        const name = parts.pop();
        let parent = dir;
        for (const part of parts) {
          parent = await parent.getDirectoryHandle(part, { create: true });
        }
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        await write(parent, name, bytes);
      }
    },
    [
      FOLDER,
      perfMappingJson(size, { arrows, components }),
      components ? perfLibraryFiles() : [],
    ],
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

/** Argumentos: tamanhos (números) e as opções `--setas <n>`, `--sem-setas`, `--componentes`, `--vezes <k>`. */
function parseArgs(argv) {
  const out = {
    sizes: [],
    arrows: undefined,
    noArrows: false,
    components: false,
    times: 1,
  };
  const count = (flag, raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} pede um número inteiro`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--setas') out.arrows = count(arg, argv[++i]);
    else if (arg === '--sem-setas') out.noArrows = true;
    else if (arg === '--componentes') out.components = true;
    else if (arg === '--vezes') out.times = Math.max(1, count(arg, argv[++i]));
    else if (arg.startsWith('--')) throw new Error(`opção desconhecida: ${arg}`);
    else if (Number(arg)) out.sizes.push(Number(arg));
  }
  return out;
}

/** Mediana de cada célula numérica das execuções (a coluna `marcações` é a mesma em todas). */
function medianRow(runs) {
  const first = runs[0];
  return Object.fromEntries(
    Object.keys(first).map((key) => [
      key,
      key === 'marcações'
        ? first[key]
        : Math.round(median(runs.map((r) => r[key])) * 10) / 10,
    ]),
  );
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
