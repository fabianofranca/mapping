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
  // Pelo teclado: a 900 × 720 a janela inferior ainda é baixa (a altura é da CL2) e a barra de
  // status cobre as linhas, então o clique do ponteiro não as alcança.
  const button = page.locator('.comments-row .comments-menu button').first();
  await button.focus();
  await page.keyboard.press('Enter');
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
