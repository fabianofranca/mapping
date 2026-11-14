import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// AC1 (#641): the review list notices (new conflicts and superseded proposal) take up
// one line, with an X. At the default height of the Proposals window (240 px), at 900×720 and 1280×720,
// the list shows 2 whole rows with the notice and 3 after the X; the footer stays in the window.
// The notice comes from the "Starting measurements" recipe of #636: review, exit, rename the
// Cabeçalho (Header) to Top and review again.
// pt-BR kept: shared fixture data (proposta-exemplo.zip marking 'Cabeçalho') asserted by tests/examples

const ZIP = readFileSync('examples/proposta-exemplo.zip');

async function openStaleReview(page: Page) {
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({ name: 'loja.zip', mimeType: 'application/zip', buffer: ZIP });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  await page.keyboard.press('Control+Shift+3');
  await page.keyboard.press('Control+Shift+7');
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Exit review' }).click();
  await page.locator('.tree-row', { hasText: 'Cabeçalho' }).first().click();
  const name = page
    .locator('[data-window="details"]')
    .getByRole('textbox', { name: 'Name' })
    .first();
  await name.fill('Top');
  await name.press('Enter');
  await page
    .getByRole('button', { name: /^Review/ })
    .first()
    .click();
  await expect(page.locator('.review-levels')).toBeVisible();
  await page.screenshot({});
}

/** List rows fully inside the scrollable body. */
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
  test(`new-conflicts notice on one line at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openStaleReview(page);
    const notice = page.locator('.review-levels > .notice-box-line');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('1 new conflict(s)');
    await expect(
      notice.getByRole('button', { name: /Show the new conflicts/ }),
    ).toHaveText('Show conflicts');

    // One line: at most the height of a small control plus the border and margins.
    const limit = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const px = (token: string) => parseFloat(root.getPropertyValue(token));
      return px('--control-height-sm') + 2 + px('--space-1-5');
    });
    const box = (await notice.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(limit + 1);

    expect(await wholeRows(page)).toBeGreaterThanOrEqual(2);
    await expectFooterInside(page);

    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole('tree', { name: /./ })).toBeFocused();
    expect(await wholeRows(page)).toBeGreaterThanOrEqual(3);
    await expectFooterInside(page);
  });
}
