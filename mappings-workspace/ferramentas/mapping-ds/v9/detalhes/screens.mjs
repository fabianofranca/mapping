// Telas do grupo "detalhes" (v9): recortes da janela Detalhes (marcação tipada, nota com tabela e
// anotação livre, referências, seta, seleção múltipla), o seletor "Ligar a…", o painel "Mostrar no
// canvas" do modo visualização e a lista de camadas. Cada `open` parte do editor com a fixture aberta
// (1440 × 900) no app 0.25.0; a altura da janela cresce onde é preciso para os Detalhes não rolarem.
import { pathToFileURL } from 'node:url';
import { PATHS } from '../../paths.mjs';

const BASE = PATHS.base;
const { JSZip, projectZip } = await import(pathToFileURL(`${BASE}/shots/extractor.mjs`).href);

const DETAILS = '.tool-window[data-window=details]';

async function select(page, text, modifiers) {
  await page.locator('.tree-item', { hasText: text }).first().click(modifiers ? { modifiers } : undefined);
  await page.waitForTimeout(400);
}

// Recolhe uma seção dos Detalhes pelo título (a recolhida mostra só o cabeçalho e o resumo).
async function collapse(page, title) {
  const toggle = page.locator(`${DETAILS} section.details-section[aria-label="${title}"] > .details-section-head .details-section-toggle`).first();
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  await page.waitForTimeout(150);
}

// Anotação livre na camada Camada 1 da marcação selecionada, com o nome e os pares (pela própria UI).
async function addFreeAnnotation(page, name, pairs) {
  await page.getByRole('button', { name: 'Adicionar anotação na camada Camada 1' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  for (const [k, v] of pairs) {
    await page.locator(`${DETAILS} .kv .button-link`).first().click();
    await page.waitForTimeout(150);
    await page.keyboard.type(k);
    await page.keyboard.press('Tab');
    await page.keyboard.type(v);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
  }
  // Tira o foco da grade (a célula em foco ganharia a borda de controle).
  await page.locator(`${DETAILS} .tool-window-title`).click();
  await page.waitForTimeout(300);
}

// A fixture com referências: a fixture não tem campo nem coluna `ref`. Na cópia da especialização
// Notas, a Tabela ganha o campo `fonte` (ref) e a coluna `alvo` (ref) em Linhas, as duas aceitando
// os pares de anotação livre; a Tabela "Arquivos da conversa" ganha uma anotação livre na Camada 1
// (os alvos) e os valores: o campo e a linha 1 apontam para um par, a linha 2 fica vazia e a linha 3
// aponta para um par que não existe (alvo quebrado).
const FREE = 'f2e1d0c9-b8a7-4655-9443-322110ffeedd';
const E1 = 'a1b2c3d4-0001-4000-8000-00000000e001';
const E2 = 'a1b2c3d4-0002-4000-8000-00000000e002';
async function fixtureWithRefs() {
  const zip = await JSZip.loadAsync(await projectZip());
  const specPath = 'specs/notas/notas.spec.json';
  const spec = JSON.parse(await zip.file(specPath).async('string'));
  const tabela = spec.layers[0].annotationTypes.find((t) => t.id === 'tabela');
  tabela.fields.splice(1, 0, { key: 'fonte', label: 'Fonte', type: 'ref', accepts: { free: true }, description: 'O par de onde o dado vem.' });
  tabela.fields.find((f) => f.key === 'linhas').columns.push({ key: 'alvo', label: 'Alvo', type: 'ref', accepts: { free: true }, description: 'O par que a linha descreve.' });
  zip.file(specPath, JSON.stringify(spec, null, 2));
  const project = JSON.parse(await zip.file('mapping.json').async('string'));
  const camada1 = project.layers.find((l) => l.name === 'Camada 1').id;
  const ann = project.annotations.find((a) => a.type?.typeId === 'tabela' && a.values?.titulo === 'Arquivos da conversa');
  project.annotations.push({
    id: FREE,
    markingId: ann.markingId,
    layerId: camada1,
    name: 'Arquivos',
    parentAnnotationId: null,
    parentRole: null,
    type: null,
    values: null,
    entries: [
      { id: E1, key: 'pasta', value: 'comments/' },
      { id: E2, key: 'formato', value: 'mapping-thread' },
    ],
  });
  ann.values = {
    ...ann.values,
    fonte: { annotationId: FREE, entryId: E1 },
    linhas: ann.values.linhas.slice(0, 3).map((row, i) => ({
      ...row,
      alvo: i === 0 ? { annotationId: FREE, entryId: E2 } : i === 1 ? null : { annotationId: FREE, entryId: 'a1b2c3d4-0009-4000-8000-0000000000ff' },
    })),
  };
  zip.file('mapping.json', JSON.stringify(project, null, 2));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function reopenWith(page, buffer) {
  await page.getByRole('button', { name: /ações do projeto/ }).click();
  await page.getByRole('menuitem', { name: 'Fechar projeto' }).click();
  await page.locator('.home').waitFor();
  await page.waitForTimeout(300);
  await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'comentarios.zip', mimeType: 'application/zip', buffer });
  await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
}

export const screens = [
  {
    name: 'Detalhes — Segmented tipado',
    rootSel: DETAILS,
    rootIsItem: true,
    viewport: { width: 1440, height: 1300 },
    open: async (page) => {
      await select(page, 'Filtro Status');
    },
  },
  {
    name: 'Detalhes — Tabela de notas e anotação livre',
    rootSel: DETAILS,
    rootIsItem: true,
    viewport: { width: 1440, height: 1040 },
    open: async (page) => {
      await select(page, 'Tabela');
      await addFreeAnnotation(page, 'Arquivos', [
        ['pasta', 'comments/'],
        ['formato', 'mapping-thread'],
        ['ordem', 'a mais antiga primeiro'],
      ]);
      for (const s of ['Marcação', 'Conversas', 'Ligado por seta']) await collapse(page, s);
    },
  },
  {
    name: 'Detalhes — campo e coluna de referência',
    rootSel: DETAILS,
    rootIsItem: true,
    viewport: { width: 1440, height: 1100 },
    open: async (page) => {
      await reopenWith(page, await fixtureWithRefs());
      await select(page, 'Tabela');
      for (const s of ['Marcação', 'Conversas', 'Ligado por seta']) await collapse(page, s);
      // A coluna Alvo passa da largura padrão (360): a janela Detalhes cresce 160 px para a grade não rolar.
      const bar = await page.locator(`${DETAILS} > .tool-resizer`).boundingBox();
      await page.mouse.move(bar.x + bar.width / 2, bar.y + 200);
      await page.mouse.down();
      await page.mouse.move(bar.x + bar.width / 2 - 80, bar.y + 200, { steps: 4 });
      await page.mouse.move(bar.x + bar.width / 2 - 160, bar.y + 200, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await page.locator(`${DETAILS} .tool-window-body`).evaluate((b) => b.scrollTo(0, 0));
    },
  },
  {
    name: 'Detalhes — seta selecionada',
    rootSel: DETAILS,
    rootIsItem: true,
    open: async (page) => {
      await select(page, 'arquivos');
    },
  },
  {
    name: 'Detalhes — dois itens selecionados',
    rootSel: DETAILS,
    rootIsItem: true,
    viewport: { width: 1440, height: 720 },
    open: async (page) => {
      await select(page, 'Filtro Status');
      await select(page, 'Filtro Usuário', ['Control']);
    },
  },
  {
    name: 'Ligar a… — seletor de marcação',
    rootSel: 'dialog.picker[open]',
    rootIsItem: true,
    viewport: { width: 1440, height: 720 },
    open: async (page) => {
      await select(page, 'Filtro Status');
      await page.getByRole('button', { name: 'Ligar a…' }).click();
      await page.locator('dialog.picker[open] .picker-option').first().waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'Mostrar no canvas — modo visualização',
    rootSel: '.view-panel-popover',
    rootIsItem: true,
    open: async (page) => {
      await page.keyboard.press('Alt+h');
      await page.locator('.view-panel-popover').waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'Camadas — lista',
    rootSel: '.tool-window[data-window=layers]',
    rootIsItem: true,
    open: async () => {},
  },
];
