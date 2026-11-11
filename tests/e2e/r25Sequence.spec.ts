import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import type { Rect } from './helpers';

// R25.3 a R25.12 refeitos pela interface, na ordem, com a biblioteca `m3-fiel`. Depois de
// cada passo o teste lê o mapping.json e confere o `rect` de TODAS as marcações; nos passos
// cujo Disco diz "o mapping.json não muda" o texto inteiro (inclusive `revision`) tem de ser
// igual ao do passo anterior. Regressão: nenhuma marcação muda de lugar sem pedido.
//
// Desvio do roteiro: o R25.3 manda "Aplicar pasta…", mas o Playwright não escolhe pasta;
// o equivalente é "Aplicar zip…" com o mesmo conteúdo (a pasta `m3-fiel` zipada).

const FOLDER = 'fiel-e2e';
const LIBRARY_DIR = 'libraries/material3-compose';

/** Monta a `m3-fiel` (cópia da biblioteca + `fiel.mjs`) e devolve o zip dela. */
async function fielZip(): Promise<Buffer> {
  const dir = join(mkdtempSync(join(tmpdir(), 'm3-fiel-')), 'm3-fiel');
  cpSync(LIBRARY_DIR, dir, { recursive: true });
  execFileSync('node', ['scripts/testing/fiel.mjs', dir, '4']);
  const zip = new JSZip();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else zip.file(relative(dir, path), readFileSync(path));
    }
  };
  walk(dir);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function stubFolderPicker(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
}

/** O texto cru do mapping.json da pasta; tenta de novo se a app o regrava na hora. */
async function readRaw(page: Page): Promise<string> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    for (let attempt = 0; ; attempt++) {
      try {
        const file = await (await dir.getFileHandle('mapping.json')).getFile();
        return await file.text();
      } catch (error) {
        if (
          attempt >= 20 ||
          !(error instanceof DOMException) ||
          error.name !== 'NotReadableError'
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }, FOLDER);
}

interface DiskMapping {
  readonly revision: number;
  readonly schemaVersion: number;
  readonly containers: readonly { readonly name: string; readonly background: string }[];
  readonly markings: readonly {
    readonly id: string;
    readonly rect: Rect;
    readonly parentId: string | null;
  }[];
  readonly annotations: readonly {
    readonly markingId: string;
    readonly type: { readonly typeId: string } | null;
    readonly values: Record<string, unknown> | null;
  }[];
}

const parse = (raw: string): DiskMapping => JSON.parse(raw) as DiskMapping;

/** Rects por tipo de componente (a anotação diz qual é a marcação). */
function rectsByType(mapping: DiskMapping): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  for (const annotation of mapping.annotations) {
    const marking = mapping.markings.find((m) => m.id === annotation.markingId);
    if (marking && annotation.type) out[annotation.type.typeId] = marking.rect;
  }
  return out;
}

const RECTS = {
  card: { x: 30, y: 290, width: 200, height: 100 },
  'text-field': { x: 20, y: 180, width: 240, height: 56 },
  divider: { x: 20, y: 20, width: 140, height: 140 },
  'navigation-bar': { x: 300, y: 20, width: 240, height: 180 },
  'list-item': { x: 300, y: 220, width: 240, height: 120 },
  checkbox: { x: 300, y: 350, width: 240, height: 60 },
} satisfies Record<string, Rect>;

type Expected = Partial<Record<keyof typeof RECTS, Rect>>;

/** Espera a gravação assentar (a `revision` para de subir) e devolve o texto cru. */
async function settled(page: Page): Promise<string> {
  let last = -1;
  let stable = 0;
  await expect
    .poll(
      async () => {
        const raw = await readRaw(page);
        const revision = parse(raw).revision;
        stable = revision === last ? stable + 1 : 0;
        last = revision;
        return stable;
      },
      { intervals: [200], timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(3);
  return readRaw(page);
}

function expectRects(raw: string, expected: Expected, step: string): DiskMapping {
  const mapping = parse(raw);
  const found = rectsByType(mapping);
  expect(Object.keys(found).sort(), `${step}: marcações`).toEqual(
    Object.keys(expected).sort(),
  );
  for (const [type, rect] of Object.entries(expected)) {
    expect(found[type], `${step}: rect do ${type}`).toEqual(rect);
  }
  expect(mapping.markings, `${step}: total de marcações`).toHaveLength(
    Object.keys(expected).length,
  );
  return mapping;
}

/** Zoom com Ctrl+roda sobre o centro da caixa da seleção, até a largura passar de `min`. */
async function zoomSelectionTo(page: Page, minWidth: number): Promise<void> {
  const host = page.locator('.canvas-host');
  const box = async () => {
    const text = await host.getAttribute('data-selection-box');
    const hostBox = await host.boundingBox();
    if (!text || !hostBox) throw new Error('sem caixa da seleção');
    const [x, y, w, h] = text.match(/-?\d+(\.\d+)?/g)!.map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return { x: hostBox.x + x, y: hostBox.y + y, w, h };
  };
  for (let i = 0; i < 40; i++) {
    const b = await box();
    if (b.w > minWidth) return;
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForTimeout(60);
  }
  throw new Error(`o zoom não passou de ${minWidth} px`);
}

/** Seleciona pela Árvore (sem tocar no canvas) a marcação cujo tipo/nome aparece na linha. */
async function selectInTree(page: Page, name: string): Promise<void> {
  const rows = page.locator('.tree-row');
  // A Árvore abre uma vez (pelo botão da faixa de janelas: o atalho é ignorado com o foco num campo).
  if ((await rows.count()) === 0)
    await page.getByRole('button', { name: 'Árvore de marcações', exact: true }).click();
  await rows.filter({ hasText: name }).first().click();
}

async function setPosition(page: Page, x: number, y: number): Promise<void> {
  for (const [label, value] of [
    ['X', x],
    ['Y', y],
  ] as const) {
    const field = page.getByRole('spinbutton', { name: label, exact: true });
    await field.fill(String(value));
    await field.press('Enter');
    await expect(field).toHaveValue(String(value));
  }
}

async function addFromPalette(page: Page, type: string, x: number, y: number) {
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Paleta' }).click();
  await page
    .getByRole('button', { name: new RegExp(`^Adicionar na tela Telas: ${type}$`) })
    .click();
  await setPosition(page, x, y);
}

/** R25.3: pasta `fiel`, biblioteca m3-fiel aplicada e o container Telas (560x540, #DDEEFF). */
async function openTelas(page: Page): Promise<void> {
  await stubFolderPicker(page);
  await page.goto('/');

  // R25.3: abrir pasta, aplicar a m3-fiel, criar o container Telas.
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await page.getByRole('textbox').fill('fiel');
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();

  await page
    .locator('.main-bar')
    .getByRole('button', { name: 'Especializações', exact: true })
    .click();
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'm3-fiel.zip',
    mimeType: 'application/zip',
    buffer: await fielZip(),
  });
  const confirm = page.getByRole('button', { name: 'Aplicar', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('status').filter({ hasText: 'aplicada' })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();

  await page.getByRole('button', { name: 'Novo container' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Telas');
  await dialog.getByLabel('Tamanho predefinido').selectOption({ label: 'Personalizado' });
  await dialog.getByLabel('Largura', { exact: true }).fill('560');
  await dialog.getByLabel('Altura', { exact: true }).fill('540');
  await dialog.getByLabel('Cor de fundo').fill('#DDEEFF');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();
}

test.use({ actionTimeout: 10_000 });

test('R25.3 a R25.12: nenhuma marcação muda de lugar sem pedido', async ({ page }) => {
  test.setTimeout(120_000);
  await openTelas(page);

  let raw = await settled(page);
  let mapping = expectRects(raw, {}, 'R25.3');
  expect(mapping.schemaVersion).toBe(18);
  expect(mapping.containers).toMatchObject([{ name: 'Telas', background: '#DDEEFF' }]);

  // R25.4: Card, Text field e Divider.
  await addFromPalette(page, 'Card', 30, 290);
  await addFromPalette(page, 'Text field', 20, 180);
  await addFromPalette(page, 'Divider', 20, 20);
  raw = await settled(page);
  const three: Expected = {
    card: RECTS.card,
    'text-field': RECTS['text-field'],
    divider: RECTS.divider,
  };
  expectRects(raw, three, 'R25.4');
  const host = page.locator('.canvas-host');
  await expect(host).toHaveAttribute('data-components', '3');

  // R25.5 a R25.7: zoom (Ctrl+roda sobre a peça selecionada pela Árvore), sem mexer nela.
  let before = raw;
  for (const [step, name, width] of [
    ['R25.5', 'Divider', 300],
    ['R25.6', 'Text field', 480],
    ['R25.7', 'Card', 432],
  ] as const) {
    await selectInTree(page, name);
    await zoomSelectionTo(page, width);
    raw = await settled(page);
    expect(raw, `${step}: o mapping.json não muda`).toBe(before);
    expectRects(raw, three, step);
    before = raw;
  }

  // R25.8: os três de layout e as linhas A, B e C do Navigation bar.
  await addFromPalette(page, 'Navigation bar', 300, 20);
  await addFromPalette(page, 'List item', 300, 220);
  await addFromPalette(page, 'Checkbox', 300, 350);
  await selectInTree(page, 'Navigation bar');
  for (const letter of ['A', 'B', 'C']) {
    await page.getByRole('button', { name: '+ Linha' }).click();
    const cell = page.getByRole('textbox', { name: /^Rótulo \(Linha \d\)$/ }).last();
    await cell.fill(letter);
    await cell.press('Enter');
  }
  raw = await settled(page);
  // R25.8: a Paleta cria o Navigation bar em lugar livre (a peça nova não cobre nem coincide com
  // marcações existentes, issue #1087): o Card (30,290,200,100) fica parado, sem pai, e não
  // precisa ser devolvido; o Navigation bar vai para (300,20) sem levá-lo.
  mapping = expectRects(raw, RECTS, 'R25.8');
  const markingOf = (type: string) =>
    mapping.markings.find(
      (m) => m.id === mapping.annotations.find((a) => a.type?.typeId === type)?.markingId,
    );
  expect(markingOf('card')?.parentId, 'R25.8: o Card continua sem pai').toBeNull();
  expect(
    markingOf('navigation-bar')?.parentId,
    'R25.8: o Navigation bar nasce sem pai',
  ).toBeNull();
  const nav = mapping.annotations.find((a) => a.type?.typeId === 'navigation-bar');
  expect(
    (nav?.values?.['items'] as readonly { label: string }[]).map((r) => r.label),
  ).toEqual(['A', 'B', 'C']);
  before = raw;

  // R25.9 a R25.11: zoom em cada peça, sem mexer nas marcações.
  for (const [step, name, width] of [
    ['R25.9', 'List item', 400],
    ['R25.10', 'Navigation bar', 440],
    ['R25.11', 'Checkbox', 360],
  ] as const) {
    await selectInTree(page, name);
    await zoomSelectionTo(page, width);
    raw = await settled(page);
    expect(raw, `${step}: o mapping.json não muda`).toBe(before);
    expectRects(raw, RECTS, step);
    before = raw;
  }

  // R25.12: fechar e reabrir a pasta.
  await page.getByRole('button', { name: /ações do projeto/ }).click();
  await page.getByRole('menuitem', { name: 'Fechar projeto' }).click();
  await expect(page.getByRole('heading', { name: 'Começar' })).toBeVisible();
  // Uma pasta do OPFS não entra em "Projetos recentes" (só as do seletor de verdade);
  // reabrir é escolher a mesma pasta de novo em "Abrir pasta", que já tem mapping.json.
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await expect(host).toHaveAttribute('data-components', '6');
  raw = await settled(page);
  expect(raw, 'R25.12: reabrir não regrava o mapping.json').toBe(before);
  expectRects(raw, RECTS, 'R25.12');
  expect(raw.match(/"(cap|join|sides|stroke|maxWidth|distribute)"/g)).toBeNull();
});

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A caixa da seleção em pixels da página (centro e tamanho), de `data-selection-box`. */
async function selectionBox(page: Page): Promise<Box> {
  const host = page.locator('.canvas-host');
  const text = await host.getAttribute('data-selection-box');
  const hostBox = await host.boundingBox();
  if (!text || !hostBox) throw new Error('sem caixa da seleção');
  const [x, y, w, h] = text.match(/-?\d+(\.\d+)?/g)!.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return { x: hostBox.x + x, y: hostBox.y + y, w, h };
}

/** Card isolado em (30,290) e um Text field fora dele em (300,20). */
async function cardAndField(page: Page): Promise<void> {
  await openTelas(page);
  await addFromPalette(page, 'Card', 30, 290);
  await addFromPalette(page, 'Text field', 300, 20);
  expectRects(
    await settled(page),
    { card: RECTS.card, 'text-field': { x: 300, y: 20, width: 240, height: 56 } },
    'preparo',
  );
}

const cardRect = async (page: Page): Promise<Rect> =>
  rectsByType(parse(await settled(page)))['card']!;

for (const { name, ctrl, minWidth } of [
  { name: 'sem Ctrl, zoom do ajuste', ctrl: false, minWidth: 0 },
  { name: 'com Ctrl, zoom do ajuste', ctrl: true, minWidth: 0 },
  { name: 'sem Ctrl, zoom alto', ctrl: false, minWidth: 800 },
  { name: 'com Ctrl, zoom alto', ctrl: true, minWidth: 800 },
]) {
  test(`H4: arrasto que começa sobre o Card (${name})`, async ({ page }) => {
    test.setTimeout(120_000);
    await cardAndField(page);
    await selectInTree(page, 'Card');
    if (minWidth > 0) await zoomSelectionTo(page, minWidth);
    const box = await selectionBox(page);
    const scale = box.w / 200;
    const before = await cardRect(page);
    const stepsPx = { dx: 37, dy: 23 };
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.w / 2 + stepsPx.dx,
      box.y + box.h / 2 + stepsPx.dy,
      {
        steps: 8,
      },
    );
    await page.mouse.up();
    if (ctrl) await page.keyboard.up('Control');
    const after = await cardRect(page);
    const delta = { dx: after.x - before.x, dy: after.y - before.y };
    // H4: o Card anda com o arrasto (comportamento documentado), igual com e sem Ctrl e
    // em qualquer zoom: delta = deslocamento de tela / escala, arredondado, sem encaixe
    // em múltiplos de 10 e sem salto.
    expect(delta.dx).toBe(Math.round(stepsPx.dx / scale));
    expect(delta.dy).toBe(Math.round(stepsPx.dy / scale));
    expect(after).toMatchObject({ width: 200, height: 100 });
  });
}

test('H5: Shift+clique mantém o Card na seleção; editar o X da outra marcação', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await cardAndField(page);
  await selectInTree(page, 'Card');
  await page
    .locator('.tree-row', { hasText: 'Text field' })
    .first()
    .click({ modifiers: ['Shift'] });
  // H5: com Card + Text field na seleção o painel é o de seleção múltipla e não tem campo
  // de Posição (nenhum spinbutton); não há como editar o X da outra marcação ali.
  await expect(page.getByRole('group', { name: 'itens selecionados' })).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  const raw = await settled(page);
  // Editar o X do Text field sozinho (seleção simples) não leva o Card junto.
  await selectInTree(page, 'Text field');
  await setPosition(page, 310, 20);
  const after = expectRects(
    await settled(page),
    { card: RECTS.card, 'text-field': { x: 310, y: 20, width: 240, height: 56 } },
    'H5',
  );
  expect(after.revision).toBeGreaterThan(parse(raw).revision);
});
