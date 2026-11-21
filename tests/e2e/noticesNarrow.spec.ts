import { expect, test, type Page } from '@playwright/test';
import { accessibilityZip } from './accessibilityFixture';

// Notices window at the minimum width (stage #1783, CL1; stage #2085): the filter stays inside the
// bottom window, the headers end in an ellipsis (with a `title`) and no word breaks in the table cells.

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 720 });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'accessibility.zip',
      mimeType: 'application/zip',
      buffer: await accessibilityZip(),
    });
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.locator('main canvas').first()).toBeVisible();
  for (const key of ['1', '2', '3', '8'])
    await page.keyboard.press(`Control+Shift+${key}`);
  await expect(page.locator('.list-filters input[type=checkbox]').first()).toBeVisible();
}

function panelOf(page: Page) {
  return page.locator('[role="tabpanel"]:has(.list-filters)');
}

async function checkFilters(page: Page): Promise<void> {
  const edge = await panelOf(page).evaluate((e) => e.getBoundingClientRect().right);
  const rights = await page
    .locator('.list-filters')
    .first()
    .evaluate((bar) =>
      [...bar.querySelectorAll<HTMLElement>('label')].map((b) => ({
        text: b.textContent ?? '',
        right: b.getBoundingClientRect().right,
        cut: b.scrollWidth > b.clientWidth,
      })),
    );
  expect(rights.length).toBeGreaterThanOrEqual(1);
  for (const r of rights) {
    expect(r.right, r.text).toBeLessThanOrEqual(edge);
    expect(r.cut, `${r.text} cut`).toBe(false);
  }
}

async function checkTable(page: Page): Promise<void> {
  const heads = page.getByRole('table', { name: 'Notices' }).locator('thead th');
  for (let i = 0; i < (await heads.count()); i++) {
    const th = heads.nth(i);
    const cut = await th.evaluate((e) => e.scrollWidth > e.clientWidth);
    if (cut) {
      expect(await th.evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis');
      await expect(th).toHaveAttribute('title', /.+/);
    }
  }
  const cell = page
    .getByRole('table', { name: 'Notices' })
    .locator('.list-cell[data-label="Annotation"]')
    .first();
  await expect(cell).toBeVisible();
  const lines = await cell.evaluate((e) => {
    // The lines of the annotation's name text.
    const range = document.createRange();
    range.selectNodeContents(e.querySelector('.list-annotation-name') ?? e);
    const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
    return { lines: tops.size, wrap: getComputedStyle(e).overflowWrap };
  });
  expect(lines.wrap).not.toBe('anywhere');
  expect(lines.lines).toBe(1);
}

for (const width of [900, 1280]) {
  test(`${width}: the filter stays inside the window`, async ({ page }) => {
    await open(page, width);
    await checkFilters(page);
  });

  test(`${width}: headers with an ellipsis, no word break in the cells`, async ({
    page,
  }) => {
    await open(page, width);
    await checkTable(page);
  });
}

test.describe('pt-BR', () => {
  test.use({ locale: 'pt-BR' });
  test('900: the filter stays inside the window', async ({ page }) => {
    await open(page, 900);
    await checkFilters(page);
  });
});
