import { expect, test, type Page } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Review at 900×720 and 1280×720: the Summary column of the list shows the counters whole, and
// the Compare dialog keeps the replacement actions in view, without scrolling the body.
// pt-BR kept: shared fixture data (proposalFixture name 'Carrinho') asserted by tests/examples and tests/store

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

for (const size of [
  { width: 900, height: 720 },
  { width: 1280, height: 720 },
]) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test('the Summary column does not clip the counters', async ({ page }) => {
      await openReview(page);
      const counts = page.locator('.review-row-summary .review-counts').first();
      await expect(counts).toBeVisible();
      const { cell, content } = await counts.evaluate((e) => ({
        cell: e.parentElement!.clientWidth,
        content: e.scrollWidth,
      }));
      expect(cell).toBeGreaterThanOrEqual(content);
    });

    test('Accept/Reject the replacement stay in view in Compare, without scrolling', async ({
      page,
    }) => {
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
      const accept = page.getByRole('button', { name: /^Accept the replacement/ });
      await expect(accept).toBeVisible();
      // The actions are not inside the scrolling body (fixed dialog footer) and fit in the window.
      await expect(
        page.locator('dialog[open] .dialog-body').getByRole('button', {
          name: /^Accept the replacement/,
        }),
      ).toHaveCount(0);
      const box = await accept.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    });
  });
}
