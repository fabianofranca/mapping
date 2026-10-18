import { expect, test, type Locator, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Layout em janela estreita (1098 × 698, DPR 1,25, Árvore e Detalhes abertos): abas,
// ações e linhas das listas não podem se sobrepor nem gerar rolagem horizontal.

test.use({ viewport: { width: 1098, height: 698 }, deviceScaleFactor: 1.25 });

// Pasta das capturas (opcional, só para conferência manual).
const SHOTS = process.env.LAYOUT_SHOTS ?? '';

type Box = { x: number; y: number; width: number; height: number };

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+1');
  await page.keyboard.press('Control+Shift+3');
}

// Fonte mais larga que a de qualquer máquina (o CI usa outras fontes): a tabela não pode depender dela.
async function widerFont(page: Page): Promise<void> {
  // A CSP proíbe <style> inline; a CSSOM (folha adotada) é permitida.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.list-table { letter-spacing: 0.08em; font-size: 1.1em }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/layout-${name}.png` });
}

async function boxes(loc: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (const el of await loc.all()) {
    const b = await el.boundingBox();
    if (b) out.push(b);
  }
  return out;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  );
}

function expectNoOverlap(list: readonly Box[]): void {
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      expect(overlaps(list[i]!, list[j]!)).toBe(false);
}

test('abas da janela inferior não passam sob as ações', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+6');
  const win = page.locator('[data-window="diagnostics"]');
  await expect(win).toBeVisible();
  await shot(page, 'diagnostico');
  const tablist = win.getByRole('tablist');
  const strip = (await boxes(tablist))[0]!;
  // O que não cabe rola dentro das abas (nada é desenhado fora da faixa delas).
  await expect(tablist).toHaveCSS('overflow-x', 'auto');
  const actions = await boxes(win.locator('.tool-window-head > :not(.tool-window-tabs)'));
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) {
    expect(overlaps(a, strip)).toBe(false);
    expect(strip.x + strip.width).toBeLessThanOrEqual(a.x + 0.5);
  }
});

test('janela Propostas e lista da revisão sem textos sobrepostos', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+7');
  const row = page.locator('.proposal-row').first();
  await expect(row).toBeVisible();
  await shot(page, 'propostas');
  const title = (await row.locator('.proposal-row-title b').boundingBox())!;
  expect(title.width).toBeGreaterThan(60);
  expectNoOverlap(
    await boxes(
      row.locator(
        '.proposal-row-title b, .proposal-row-title .flag, .proposal-row-meta, .proposal-row-counts, .proposal-row-action',
      ),
    ),
  );

  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Aceitar Checkout a partir do Figma' }).click();
  await page
    .getByRole('button', { name: /^Aplicar aceitas/ })
    .first()
    .click();
  await expect(page.getByText(/mudança\(s\) aplicada\(s\)/).first()).toBeVisible();
  await shot(page, 'revisao');
  for (const r of await page.locator('.review-row').all()) {
    const cells = await boxes(r.locator(':scope > *'));
    expectNoOverlap(cells);
    // O que não cabe no nome é cortado no rótulo, nunca desenhado sobre o resumo.
    const clipped = await r
      .locator('.review-row-name')
      .evaluate((e) => e.scrollWidth - e.clientWidth);
    expect(clipped).toBeLessThanOrEqual(1);
    const rb = (await r.boundingBox())!;
    for (const c of cells)
      expect(c.x + c.width).toBeLessThanOrEqual(rb.x + rb.width + 0.5);
  }
});

test('Incompletas sem rolagem horizontal', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+5');
  const win = page.locator('[data-window="incomplete"]');
  await expect(win).toBeVisible();
  await widerFont(page);
  await shot(page, 'incompletas');
  const over = await win
    .locator('.tool-window-body, .list-scroll')
    .evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
  expect(over.length).toBeGreaterThan(0);
  for (const d of over) expect(d).toBeLessThanOrEqual(0);
});

test('Lista sem rolagem horizontal', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+4');
  const win = page.locator('[data-window="list"]');
  await expect(win.locator('.list-row').first()).toBeVisible();
  await widerFont(page);
  await shot(page, 'lista');
  const over = await win
    .locator('.tool-window-body, .list-scroll')
    .evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
  for (const d of over) expect(d).toBeLessThanOrEqual(0);
});
