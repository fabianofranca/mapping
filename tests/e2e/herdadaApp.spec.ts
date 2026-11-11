// R25.83 a R25.86 (MF3) pela interface: a biblioteca que o `scripts/testing/herdada.mjs` monta, o
// Card com um Text dentro (a filha) e outro Text solto na tela. A filha desenha na cor que o Card
// oferece (o `default` azul do `ink` vazio; vermelha depois de o campo `Tinta` valer `#D32F2F`) e o
// Text solto, no `default` verde dele. A cor é lida do recorte PNG do canvas (como o roteiro faz),
// e o `mapping.json` não guarda nada do desenho.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

const FOLDER = 'fiel-herdada';
const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const GREEN = [0x2e, 0x7d, 0x32];

/** Monta a `m3-herdada` (cópia da biblioteca + `herdada.mjs`) e devolve o zip dela. */
async function herdadaZip(): Promise<Buffer> {
  const dir = join(mkdtempSync(join(tmpdir(), 'm3-herdada-')), 'm3-herdada');
  cpSync('libraries/material3-compose', dir, { recursive: true });
  execFileSync('node', ['scripts/testing/herdada.mjs', dir]);
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

async function readRaw(page: Page): Promise<string> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder);
    for (let attempt = 0; ; attempt++) {
      try {
        const file = await (await dir.getFileHandle('mapping.json')).getFile();
        return await file.text();
      } catch (error) {
        if (attempt >= 20) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }, FOLDER);
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

/** Quantos pixels do recorte PNG têm exatamente a cor (o miolo das letras), lidos num canvas. */
async function countColors(
  page: Page,
  png: Buffer,
  colors: number[][],
): Promise<number[]> {
  const reader = await page.context().newPage();
  try {
    await reader.setContent('<body></body>');
    return await reader.evaluate(
      async ([base64, wanted]) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64 as string}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height).data;
        const list = wanted as number[][];
        const counts = list.map(() => 0);
        for (let i = 0; i < data.length; i += 4)
          list.forEach((c, k) => {
            if (data[i] === c[0] && data[i + 1] === c[1] && data[i + 2] === c[2])
              counts[k]!++;
          });
        return counts;
      },
      [png.toString('base64'), colors] as const,
    );
  } finally {
    await reader.close();
  }
}

/** O recorte do canvas com o Card enquadrado (Árvore e `Shift+2`), sem seleção. */
async function cardShot(page: Page): Promise<Buffer> {
  const rows = page.locator('.tree-row');
  if ((await rows.count()) === 0)
    await page.getByRole('button', { name: 'Árvore de marcações', exact: true }).click();
  await rows.filter({ hasText: 'Card' }).first().click();
  await page.keyboard.press('Shift+2');
  await page.waitForTimeout(400);
  await page.locator('main[data-canvas-area]').focus();
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  const host = await page.locator('.canvas-host').boundingBox();
  return page.screenshot({ clip: host! });
}

interface Disk {
  markings: { id: string; rect: Record<string, number>; parentId: string | null }[];
  annotations: {
    markingId: string;
    type: { typeId: string } | null;
    values: Record<string, unknown> | null;
  }[];
}

test.use({ actionTimeout: 10_000 });

test('R25.84 a R25.86: a filha herda a cor do Card e o disco não guarda o desenho', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript((name) => {
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    });
  }, FOLDER);
  await page.goto('/');
  await page.getByRole('button', { name: /Abrir pasta/ }).click();
  await page.getByRole('textbox').fill(FOLDER);
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page
    .locator('.main-bar')
    .getByRole('button', { name: 'Especializações', exact: true })
    .click();
  await page.locator('input[type=file][accept=".zip,application/zip"]').setInputFiles({
    name: 'm3-herdada.zip',
    mimeType: 'application/zip',
    buffer: await herdadaZip(),
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
  await dialog.getByLabel('Largura', { exact: true }).fill('340');
  await dialog.getByLabel('Altura', { exact: true }).fill('260');
  await dialog.getByLabel('Cor de fundo').fill('#FFFFFF');
  await dialog.getByRole('button', { name: 'Criar container' }).click();
  await expect(dialog).toBeHidden();

  // R25.84: o Card, o Text dentro dele (a Paleta oferece "Adicionar dentro de Card") e o Text solto.
  await page.keyboard.press('Control+Shift+9');
  await page.getByRole('tab', { name: 'Paleta' }).click();
  await page.getByRole('button', { name: /^Adicionar na tela Telas: Card$/ }).click();
  await setPosition(page, 20, 20);
  await page.getByRole('button', { name: /^Adicionar dentro de Card: Text$/ }).click();
  await setPosition(page, 30, 30);
  await page.getByRole('button', { name: /^Adicionar na tela Telas: Text$/ }).click();
  await setPosition(page, 20, 160);

  let raw = '';
  await expect
    .poll(
      async () => {
        raw = await readRaw(page);
        return (JSON.parse(raw) as Disk).markings.length;
      },
      { timeout: 15_000 },
    )
    .toBe(3);
  await page.waitForTimeout(1500);
  raw = await readRaw(page);
  const disk = JSON.parse(raw) as Disk;
  const typeOf = (markingId: string) =>
    disk.annotations.find((a) => a.markingId === markingId)?.type?.typeId;
  const card = disk.markings.find((m) => typeOf(m.id) === 'card')!;
  const texts = disk.markings.filter((m) => typeOf(m.id) === 'text');
  expect(card.rect).toEqual({ x: 20, y: 20, width: 300, height: 120 });
  expect(texts.map((m) => [m.rect, m.parentId])).toEqual(
    expect.arrayContaining([
      [{ x: 30, y: 30, width: 200, height: 70 }, card.id],
      [{ x: 20, y: 160, width: 200, height: 70 }, null],
    ]),
  );
  for (const drawn of ['content-color', '#1976D2', '#2E7D32', '$provided'])
    expect(raw, drawn).not.toContain(drawn);

  // A filha, azul (o `default` do `ink` vazio); o Text solto, verde; nada vermelho.
  const before = await countColors(page, await cardShot(page), [BLUE, RED, GREEN]);
  expect(before[0]).toBeGreaterThan(300);
  expect(before[1]).toBe(0);
  expect(before[2]).toBeGreaterThan(300);

  // R25.86: o campo `Tinta` do Card vale `#D32F2F`: a filha fica vermelha, o Text solto não muda.
  await page.locator('.tree-row').filter({ hasText: 'Card' }).first().click();
  const ink = page.getByLabel('Tinta', { exact: true });
  await ink.fill('#D32F2F');
  await ink.press('Tab');
  await page.waitForTimeout(1500);
  const after = await countColors(page, await cardShot(page), [BLUE, RED, GREEN]);
  expect(after[0]).toBe(0);
  expect(after[1]).toBeGreaterThan(300);
  expect(after[2]).toBeGreaterThan(300);
  expect(after[1]).toBe(before[0]);
  expect(after[2]).toBe(before[2]);
  expect(await readRaw(page)).toContain('"ink": "#D32F2F"');
});
