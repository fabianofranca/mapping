import { expect, test } from '@playwright/test';
import { fixtureZip } from './proposalFixture';

// Proposal review at 900 px: the Details decision header and the shortcuts footer
// show the buttons and hints in full, without horizontal scrolling.
// pt-BR kept: shared fixture data (proposalFixture names such as 'Botão Pagar') asserted by tests/examples and tests/store

test.use({ viewport: { width: 900, height: 720 } });

test('review at 900 px: whole decision in the Details and footer without clipping', async ({
  page,
}) => {
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
  // A marking changed by the proposal shows the item decision header in the Details.
  await page.locator('.tree-row', { hasText: 'Botão P' }).click();
  const header = page.locator('.review-header-actions').first();
  await expect(header).toBeVisible();
  if (process.env.LAYOUT_SHOTS)
    await page.screenshot({ path: `${process.env.LAYOUT_SHOTS}/review-900.png` });
  for (const b of await header.getByRole('button').all()) {
    const [clipped, box] = await Promise.all([
      b.evaluate((e) => e.scrollWidth - e.clientWidth),
      b.boundingBox(),
    ]);
    expect(clipped).toBeLessThanOrEqual(1);
    expect(box).not.toBeNull();
  }
  const body = page.locator('[data-window="details"] .tool-window-body');
  expect(await body.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
  const footer = page.locator('.review-footer');
  await expect(footer).toBeVisible();
  const fb = (await footer.boundingBox())!;
  for (const item of await footer.locator('span').all()) {
    const b = (await item.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(fb.x + fb.width + 0.5);
  }
});

// Height: at 900×720 the whole footer fits inside the bottom window (Proposals tab),
// on a single line, with the 3 main shortcuts.
test.describe('footer at 900×720', () => {
  test.use({ viewport: { width: 900, height: 720 } });

  test('the footer fits entirely in the bottom window, on a single line', async ({
    page,
  }) => {
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
    const footer = page.locator('.review-footer');
    await expect(footer).toBeVisible();
    const win = page
      .locator('.review-levels')
      .locator('xpath=ancestor::*[@data-window][1]');
    const fb = (await footer.boundingBox())!;
    const wb = (await win.boundingBox())!;
    if (process.env.LAYOUT_SHOTS)
      console.log('footer', JSON.stringify(fb), 'window', JSON.stringify(wb));
    expect(fb.y).toBeGreaterThanOrEqual(wb.y - 0.5);
    expect(fb.y + fb.height).toBeLessThanOrEqual(wb.y + wb.height + 0.5);
    // A single line (height of one text line + padding), with the 3 main shortcuts.
    await expect(footer.locator('span')).toHaveCount(3);
    const rows = new Set(
      await footer
        .locator('span')
        .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))),
    );
    expect(rows.size).toBe(1);
  });
});
