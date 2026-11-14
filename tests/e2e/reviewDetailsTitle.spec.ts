import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Review at 900×720: the Details title does not break in the middle of a word and the Slide
// handle stays whole inside the comparison area, also with the divider at 0% and 100%.

// pt-BR kept: shared fixture data (proposalFixture names such as 'Cabeçalho', 'Carrinho') asserted by tests/examples and tests/store
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
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
}

test('the Details title stays on a single line, without breaking the word', async ({
  page,
}) => {
  await openReview(page);
  await page.locator('.tree-row', { hasText: 'Cabeçalho' }).first().click();
  const name = page.locator('.identity-name').first();
  await expect(name).toContainText('Cabeçalho do checkout');
  // The name width covers the text on a single line (or the whole row): no broken word.
  const { width, natural, row } = await name.evaluate((e) => {
    const width = e.clientWidth;
    e.style.whiteSpace = 'nowrap';
    const natural = e.scrollWidth;
    e.style.whiteSpace = '';
    return { width, natural, row: e.parentElement!.clientWidth };
  });
  expect(width).toBeGreaterThanOrEqual(Math.min(natural, row) - 1);
});

test('the Slide handle stays whole at 0% and at 100%', async ({ page }) => {
  await openReview(page);
  await page.locator('.tree-row', { hasText: 'Carrinho' }).first().click();
  await page
    .getByRole('button', { name: /Image file/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /^Compare/ })
    .first()
    .click();
  const grip = page.getByRole('slider', { name: 'Divider between before and after' });
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
