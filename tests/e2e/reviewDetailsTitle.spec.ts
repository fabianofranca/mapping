import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Revisão a 900×720: o título dos Detalhes não quebra no meio da palavra e a alça do
// Deslizar fica inteira dentro da área de comparação, também com a divisória em 0% e 100%.

test.use({ viewport: { width: 900, height: 720 } });

async function openReview(page: Page) {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'loja.zip',
      mimeType: 'application/zip',
      buffer: await fixtureZip(),
    });
  await expect(page.getByRole('main', { name: 'Canvas do projeto' })).toBeVisible();
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^Revisar/ })
    .first()
    .click();
}

test('o título dos Detalhes fica numa linha só, sem quebrar a palavra', async ({
  page,
}) => {
  await openReview(page);
  await page.locator('.tree-row', { hasText: 'Cabeçalho' }).first().click();
  const name = page.locator('.identity-name').first();
  await expect(name).toContainText('Cabeçalho do checkout');
  // A largura do nome cobre o texto numa linha só (ou a linha inteira): sem palavra partida.
  const { width, natural, row } = await name.evaluate((e) => {
    const width = e.clientWidth;
    e.style.whiteSpace = 'nowrap';
    const natural = e.scrollWidth;
    e.style.whiteSpace = '';
    return { width, natural, row: e.parentElement!.clientWidth };
  });
  expect(width).toBeGreaterThanOrEqual(Math.min(natural, row) - 1);
});

test('a alça do Deslizar fica inteira em 0% e em 100%', async ({ page }) => {
  await openReview(page);
  await page.locator('.tree-row', { hasText: 'Carrinho' }).first().click();
  await page
    .getByRole('button', { name: /Arquivo da imagem/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^Comparar/ })
    .first()
    .click();
  const grip = page.getByRole('slider', { name: 'Divisória entre antes e depois' });
  await expect(grip).toBeVisible();
  await grip.focus();
  for (const key of ['Home', 'End']) {
    await page.keyboard.press(key);
    const [g, s] = await Promise.all([
      grip.boundingBox(),
      page.locator('.image-compare-stage').boundingBox(),
    ]);
    expect(g!.x).toBeGreaterThanOrEqual(s!.x - 0.5);
    expect(g!.x + g!.width).toBeLessThanOrEqual(s!.x + s!.width + 0.5);
  }
});
