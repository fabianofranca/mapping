import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// AC1 (#641): os avisos da lista da revisão (conflitos novos e proposta substituída) ocupam
// uma linha, com X. Na altura padrão da janela Propostas (240 px), a 900×720 e a 1280×720,
// a lista mostra 2 linhas inteiras com o aviso e 3 depois do X; o rodapé fica na janela.
// O aviso sai da receita das "Medidas de partida" da #636: revisar, sair, renomear o
// Cabeçalho para Topo e revisar de novo.

const ZIP = readFileSync('examples/proposta-exemplo.zip');

async function openStaleReview(page: Page) {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name: 'loja.zip', mimeType: 'application/zip', buffer: ZIP });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Sair da revisão' }).click();
  await page.locator('.tree-row', { hasText: 'Cabeçalho' }).first().click();
  const name = page
    .locator('[data-window="details"]')
    .getByRole('textbox', { name: 'Nome' })
    .first();
  await name.fill('Topo');
  await name.press('Enter');
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
  await expect(page.locator('.review-levels')).toBeVisible();
  await page.screenshot({});
}

/** Linhas da lista inteiras dentro do corpo rolável. */
async function wholeRows(page: Page): Promise<number> {
  return page.locator('.review-levels-body').evaluate((body) => {
    const view = body.getBoundingClientRect();
    return [...body.querySelectorAll('.review-row')].filter((row) => {
      const r = row.getBoundingClientRect();
      return r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5;
    }).length;
  });
}

async function expectFooterInside(page: Page) {
  const win = page
    .locator('.review-levels')
    .locator('xpath=ancestor::*[@data-window][1]');
  const fb = (await page.locator('.review-footer').boundingBox())!;
  const wb = (await win.boundingBox())!;
  expect(fb.y).toBeGreaterThanOrEqual(wb.y - 0.5);
  expect(fb.y + fb.height).toBeLessThanOrEqual(wb.y + wb.height + 0.5);
}

for (const size of [
  { width: 900, height: 720 },
  { width: 1280, height: 720 },
]) {
  test(`aviso de conflitos novos numa linha a ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openStaleReview(page);
    const notice = page.locator('.review-levels > .notice-box-line');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('1 conflito(s) novo(s)');
    await expect(
      notice.getByRole('button', { name: /Ver os conflitos novos/ }),
    ).toHaveText('Ver conflitos');

    // Uma linha: no máximo a altura de um controle pequeno mais a borda e as margens.
    const limit = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const px = (token: string) => parseFloat(root.getPropertyValue(token));
      return px('--control-height-sm') + 2 + px('--space-1-5');
    });
    const box = (await notice.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(limit + 1);

    expect(await wholeRows(page)).toBeGreaterThanOrEqual(2);
    await expectFooterInside(page);

    await notice.getByRole('button', { name: 'Dispensar' }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole('tree', { name: /./ })).toBeFocused();
    expect(await wholeRows(page)).toBeGreaterThanOrEqual(3);
    await expectFooterInside(page);
  });
}
