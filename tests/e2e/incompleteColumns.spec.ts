import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Incomplete in the bottom window: narrow (up to 470 px) it has no Layer column and shows the
// layer under the marking; wide it keeps the column. Headers are never cut without an ellipsis.

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 720 });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'full-example.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/full-example.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
  for (const key of ['1', '2', '3', '5'])
    await page.keyboard.press(`Control+Shift+${key}`);
  await expect(page.locator('.incomplete-table')).toBeVisible();
}

test('narrow window: no Layer column, the layer under the marking, headers with an ellipsis', async ({
  page,
}) => {
  await open(page, 900);
  const table = page.locator('.incomplete-table');
  await expect(table.locator('thead th.list-col-layer')).toBeHidden();
  const line = table.locator('.incomplete-layer-line').first();
  await expect(line).toBeVisible();
  await expect(line.locator('.list-layer-name')).toHaveAttribute('title', /.+/);
  const heads = table.locator('thead th');
  for (let i = 0; i < (await heads.count()); i++) {
    const th = heads.nth(i);
    if (!(await th.isVisible())) continue;
    const cut = await th.evaluate((e) => e.scrollWidth > e.clientWidth);
    if (cut) {
      expect(await th.evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis');
      await expect(th).toHaveAttribute('title', /.+/);
    }
  }
});

test('wide window: the Layer column is back and the layer line is hidden', async ({
  page,
}) => {
  await open(page, 1280);
  const table = page.locator('.incomplete-table');
  await expect(table.locator('thead th.list-col-layer')).toBeVisible();
  await expect(table.locator('.incomplete-layer-line').first()).toBeHidden();
});
