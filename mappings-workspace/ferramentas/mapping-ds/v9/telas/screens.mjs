// Telas do grupo "telas" (v9): a tela inicial, o aviso de janela estreita, o catálogo de uma biblioteca
// (tela cheia, janela e página no diálogo), a janela Avisos, a janela Árvore, o canvas com o minimapa e a
// barra de status. Cada `open` parte do editor com a fixture aberta (1440 × 900) no app 0.25.0.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'C:/Pessoal/mapping/workspace/ferramentas/mapping-ds';
const { JSZip, projectZip } = await import(pathToFileURL(`${BASE}/shots/extractor.mjs`).href);

const walkFs = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walkFs(join(d, n)) : [join(d, n)]));
const slash = (p) => p.split(String.fromCharCode(92)).join('/');

// O pacote mapping-ds da fixture (a versão que o app 0.25.0 abre), como zip, para "Abrir biblioteca".
async function libraryZip() {
  const dir = `${BASE}/shots/fixture/specs/mapping-ds`;
  const zip = new JSZip();
  for (const f of walkFs(dir)) zip.file(slash(relative(dir, f)), readFileSync(f));
  return zip.generateAsync({ type: 'nodebuffer' });
}

// A fixture com avisos (notices, formatVersion 10) na cópia do mapping-ds: um tipo obsoleto, um campo que
// diverge e um tipo pendente. A fixture não tem avisos, e a janela Avisos ficaria só com a mensagem vazia.
async function fixtureWithNotices() {
  const zip = await JSZip.loadAsync(await projectZip());
  const path = 'specs/mapping-ds/mapping-ds.spec.json';
  const spec = JSON.parse(await zip.file(path).async('string'));
  spec.formatVersion = Math.max(spec.formatVersion, 10);
  const type = (id) => spec.layers[0].annotationTypes.find((t) => t.id === id);
  type('button').notices = [{ kind: 'deprecated', message: 'Use o IconButton com texto nas barras.', since: '2026-10-01' }];
  type('icon-button').fields.find((f) => f.key === 'variant').notices = [{ kind: 'diverges', message: 'O código também aceita "subtle".', ref: 'src/ui/controls/IconButton.tsx' }];
  type('tool-window').notices = [{ kind: 'pending', message: 'Falta a janela Atividade.' }];
  zip.file(path, JSON.stringify(spec, null, 2));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function closeProject(page) {
  await page.getByRole('button', { name: /ações do projeto/ }).click();
  await page.getByRole('menuitem', { name: 'Fechar projeto' }).click();
  await page.locator('.home').waitFor();
  await page.waitForTimeout(400);
}

async function openLibrary(page) {
  await closeProject(page);
  await page.locator('input[data-library-zip]').setInputFiles({ name: 'mapping-ds.zip', mimeType: 'application/zip', buffer: await libraryZip() });
  await page.locator('.catalog-screen .catalog-page').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
}

// Janela Catálogo com a biblioteca Mapping DS escolhida (a primeira da lista é Notas).
async function catalogWindow(page) {
  await page.keyboard.press('Control+Shift+9');
  const w = page.locator('.tool-window[data-window=catalog]');
  await w.locator('.catalog-entry').first().waitFor({ timeout: 15000 });
  await w.locator('select').first().selectOption({ label: 'Mapping DS' });
  await w.locator('.catalog-entry', { hasText: 'Button' }).first().waitFor();
  await page.waitForTimeout(400);
  return w;
}

export const screens = [
  {
    name: 'Tela inicial — 1440 × 900',
    rootSel: '.home',
    rootIsItem: true,
    background: '#f6f7f9',
    open: closeProject,
  },
  {
    // O app abre a 1440 × 900 (o openApp espera o canvas) e a janela encolhe depois: abaixo de 900 × 720 o
    // editor fica escondido atrás do aviso.
    name: 'Janela estreita — 800 × 600',
    rootSel: '.narrow-window',
    rootIsItem: true,
    background: '#f6f7f9',
    open: async (page) => {
      await page.setViewportSize({ width: 800, height: 600 });
      await page.locator('.narrow-window').waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'Catálogo da biblioteca — 1440 × 900',
    rootSel: '.catalog-screen',
    rootIsItem: true,
    background: '#f6f7f9',
    open: openLibrary,
  },
  {
    name: 'Janela Catálogo — Mapping DS',
    rootSel: '.tool-window[data-window=catalog]',
    rootIsItem: true,
    open: catalogWindow,
  },
  {
    name: 'Catálogo — página do componente Notice',
    rootSel: '.dialog[open]',
    open: async (page) => {
      const w = await catalogWindow(page);
      await w.locator('.catalog-entry', { hasText: /^Notice$/ }).first().click();
      await page.locator('.dialog[open] .catalog-page').waitFor();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'Janela Avisos — 3 avisos',
    rootSel: '.tool-window[data-window=notices]',
    rootIsItem: true,
    open: async (page) => {
      await closeProject(page);
      await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'comentarios.zip', mimeType: 'application/zip', buffer: await fixtureWithNotices() });
      await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);
      await page.keyboard.press('Control+Shift+8');
      const w = page.locator('.tool-window[data-window=notices]');
      await w.locator('.notices-group-row').first().waitFor();
      // Mais alta (arrastando a divisória), para caber os três grupos.
      const r = await w.locator('.tool-resizer').boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2, r.y - 260, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    },
  },
  {
    // Uma linha atual (a escolhida) e uma selecionada junto (Ctrl+clique), para os três estados da linha.
    name: 'Janela Árvore de marcações',
    rootSel: '.tool-window[data-window=tree]',
    rootIsItem: true,
    open: async (page) => {
      const w = page.locator('.tool-window[data-window=tree]');
      await w.locator('.tree-item', { hasText: 'Aguardando agente' }).first().click();
      await w.locator('.tree-item', { hasText: 'Resolvida' }).first().click({ modifiers: ['Control'] });
      await page.waitForTimeout(500);
    },
  },
  {
    // A 100% (clique no campo de zoom) a vista é só uma parte do minimapa.
    name: 'Canvas — minimapa e zoom',
    rootSel: '.editor-center',
    open: async (page) => {
      await page.locator('.canvas-bar .zoom-field').click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'Barra de status — zoom',
    rootSel: '.statusbar',
    rootIsItem: true,
    open: async (page) => {
      await page.locator('.canvas-bar .zoom-field').click();
      await page.waitForTimeout(600);
    },
  },
];
