import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Janela Comentários (#734, CL1): sem barra horizontal, com o ⋯ de cada linha inteiro e o selo de
// status dentro da célula, de 887 px (1591 × 1052) até a janela estreita de 900 × 720, onde
// Msgs e Quando somem e Por mostra só o avatar. Árvore, Camadas e Detalhes ficam abertos.

async function openComments(page: Page, status: 'Todas' | 'Resolvidas'): Promise<void> {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'exemplo-completo.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/exemplo-completo.zip'),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  for (const n of ['1', '2', '3', '0']) await page.keyboard.press(`Control+Shift+${n}`);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption({
    label: status,
  });
  await expect(page.locator('.comments-row').first()).toBeVisible();
}

async function expectInside(inner: Locator, outer: Locator): Promise<void> {
  const o = await outer.boundingBox();
  const i = await inner.boundingBox();
  if (!o || !i) throw new Error('elemento sem caixa');
  expect(i.x).toBeGreaterThanOrEqual(o.x - 0.5);
  expect(i.x + i.width).toBeLessThanOrEqual(o.x + o.width + 0.5);
}

async function expectFits(page: Page): Promise<void> {
  const scroll = page.locator('.comments-view .list-scroll');
  const sizes = await scroll.evaluate((el) => ({ s: el.scrollWidth, c: el.clientWidth }));
  expect(sizes.s, `scrollWidth ${sizes.s} > clientWidth ${sizes.c}`).toBeLessThanOrEqual(
    sizes.c,
  );
  for (const row of await page.locator('.comments-row').all()) {
    await expectInside(row.locator('.comments-menu button'), scroll);
    await expectInside(
      row.locator('.comments-badge'),
      row.locator('td:has(.comments-badge)'),
    );
  }
}

async function expectDeleteMenu(page: Page): Promise<void> {
  await page.locator('.comments-row .comments-menu button').first().click();
  await expect(page.getByRole('menuitem', { name: 'Apagar' })).toBeVisible();
  await page.keyboard.press('Escape');
}

for (const status of ['Todas', 'Resolvidas'] as const) {
  test.describe(`${status}`, () => {
    test.describe('janela de 887 px (1591 × 1052)', () => {
      test.use({ viewport: { width: 1591, height: 1052 } });

      test('sem barra horizontal, ⋯ inteiro e selo na célula', async ({ page }) => {
        await openComments(page, status);
        await expectFits(page);
        await expectDeleteMenu(page);
        await expect(page.locator('.comments-col-count')).toBeVisible();
        await expect(page.locator('.comments-col-when')).toBeVisible();
      });
    });

    test.describe('janela estreita (900 × 720)', () => {
      test.use({ viewport: { width: 900, height: 720 } });

      test('Msgs e Quando somem, Por vira avatar e o ⋯ fica inteiro', async ({
        page,
      }) => {
        await openComments(page, status);
        await expectFits(page);
        await expectDeleteMenu(page);
        await expect(page.locator('.comments-col-count')).toBeHidden();
        await expect(page.locator('.comments-col-when')).toBeHidden();
        await expect(page.locator('.comments-count').first()).toBeHidden();
        await expect(page.locator('.comments-when').first()).toBeHidden();
        await expect(page.locator('.comments-by-name').first()).toBeHidden();
        await expect(page.locator('.comments-avatar').first()).toBeVisible();
        for (const name of ['Âncora', 'Última mensagem', 'Status']) {
          await expect(page.getByRole('columnheader', { name })).toBeVisible();
        }
        await expect(page.locator('.comments-row .comments-last').first()).toBeVisible();
        await expect(page.locator('.comments-row .comments-badge').first()).toBeVisible();
      });
    });
  });
}

test.describe('altura inicial da janela inferior (900 × 720, sem altura gravada)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('Comentários mostra 4 linhas inteiras da lista sem rolar', async ({ page }) => {
    await openComments(page, 'Todas');
    // O exemplo tem 3 conversas e, no layout estreito, âncoras longas quebram em duas linhas
    // (37 e 53 px): as 4 linhas somam as que existem mais a mais alta para cada uma que falta.
    const sizes = await page.locator('.comments-view .list-scroll').evaluate((el) => {
      const rows = [...el.querySelectorAll('.comments-row')].map(
        (r) => r.getBoundingClientRect().height,
      );
      const tallest = Math.max(0, ...rows);
      const four = [...rows.slice(0, 4)];
      while (four.length < 4) four.push(tallest);
      return { client: el.clientHeight, need: four.reduce((a, b) => a + b, 0) };
    });
    expect(sizes.need).toBeGreaterThan(0);
    expect(
      sizes.client,
      `.list-scroll clientHeight ${sizes.client} < 4 linhas inteiras (${sizes.need})`,
    ).toBeGreaterThanOrEqual(sizes.need);
  });
});

test.describe('faixa de abas da janela inferior (900 × 720)', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  // Folga mínima (px) entre a última aba e a borda da faixa: cobre fontes mais largas de outras
  // máquinas e contagens de mais dígitos (o relato da CL2 e o CI medem 362 a 363 px de conteúdo para 356 antes do ajuste; aqui, com a fonte local, a folga é maior).
  const SLACK = 12;

  test('as seis abas cabem inteiras, sem rolar e com folga', async ({ page }) => {
    await openComments(page, 'Todas');
    const strip = page.locator('.tool-window-bottom [role=tablist]');
    const sizes = await strip.evaluate((el) => ({
      s: el.scrollWidth,
      c: el.clientWidth,
      left: el.scrollLeft,
      lastRight:
        el.querySelector('[role=tab]:last-of-type')?.getBoundingClientRect().right ?? 0,
      right: el.getBoundingClientRect().right,
    }));
    expect(
      sizes.s,
      `faixa de abas: scrollWidth ${sizes.s} > clientWidth ${sizes.c} (scrollLeft ${sizes.left})`,
    ).toBeLessThanOrEqual(sizes.c);
    expect(
      sizes.right - sizes.lastRight,
      `folga ${sizes.right - sizes.lastRight} px < ${SLACK} px entre a última aba e a borda da faixa`,
    ).toBeGreaterThanOrEqual(SLACK);
  });
});
