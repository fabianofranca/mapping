import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Findings 4.11 and 4.12 of round #812 (stage #294): at 900×720 with a 180 px Tree, the name and the
// layer dots of a Tree row ran under the padlock and ⋯ buttons, and the List "Annotation" header was
// cut to "Annotatio" with no ellipsis.

test.use({ viewport: { width: 900, height: 720 } });

async function openExample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'mapping.toolWindows',
      JSON.stringify({ open: ['tree', 'layers', 'details'], left: 180, right: 300 }),
    );
  });
  await page.goto('/');
  await page
    .locator('input[type=file][accept^=".zip"]:not([data-library-zip])')
    .setInputFiles({
      name: 'full-example.zip',
      mimeType: 'application/zip',
      buffer: readFileSync('examples/full-example.zip'),
    });
  await expect(page.getByRole('main', { name: 'Project canvas' })).toBeVisible();
}

test('in a narrow Tree no row content shows past its item, under the padlock', async ({
  page,
}) => {
  await openExample(page);
  const rows = await page.locator('.tree-row').evaluateAll((els) =>
    els.flatMap((row) => {
      const item = row.querySelector('.tree-item');
      const lock = row.querySelector('.tree-lock');
      if (!item || !lock) return [];
      const clip = getComputedStyle(item).overflowX !== 'visible';
      const right = [...item.querySelectorAll('.tree-label, .tree-dots')]
        .map((el) => el.getBoundingClientRect().right)
        .reduce((a, b) => Math.max(a, b), 0);
      const visible = clip ? Math.min(right, item.getBoundingClientRect().right) : right;
      return [{ visible, lockLeft: lock.getBoundingClientRect().left }];
    }),
  );
  expect(rows.length).toBeGreaterThan(10);
  for (const r of rows) expect(r.visible).toBeLessThanOrEqual(r.lockLeft + 0.5);
});

test('the List "Annotation" header ends in an ellipsis when it does not fit', async ({
  page,
}) => {
  await openExample(page);
  await page.keyboard.press('Control+Shift+Digit4');
  const th = page.locator('th.list-col-annotation').first();
  await expect(th).toBeVisible();
  const m = await th.evaluate((el) => ({
    over: el.scrollWidth > el.clientWidth,
    overflow: getComputedStyle(el).overflowX,
    ellipsis: getComputedStyle(el).textOverflow,
  }));
  if (m.over) {
    expect(m.overflow).toBe('hidden');
    expect(m.ellipsis).toBe('ellipsis');
  }
});
